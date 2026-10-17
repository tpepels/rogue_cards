#!/usr/bin/env node
/**
 * Eight-worker, wall-clock-bounded C/alpha optimization for Rogue Cards.
 *
 * The search runs on REAL canonical MCTS decisions; candidates are scored
 * only by separately seeded encounter continuations, never by MCTS's own
 * training rollouts. No full-expedition win-rate claim is made.
 *
 * Phase A: successive halving on 36 training encounter fixtures.
 * Phase B: a genuinely held-out set of 12 fixtures with new dice.
 * Pending tasks are dropped at the deadline, active workers terminated,
 * and every finished result persisted as a resumable NDJSON record.
 *
 * Usage: node scripts/tune-mcts-hybrid.mjs --minutes 120 --workers 8
 *  --budget 16 --samples 1 --tactical-max 2 --out results/hybrid-tune-A
 */
import {Worker,isMainThread,parentPort} from "node:worker_threads";
import {cpus} from "node:os";
import {mkdirSync,existsSync,readFileSync,appendFileSync,
 writeFileSync,renameSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {scenarios} from "./study-combat-phase2b.mjs";
import {evaluateHybridJob,candidateId} from "./tune-mcts-hybrid-core.mjs";

const candidateGrid=()=>{
 const out=[{name:"uct-classic",c:Math.SQRT2,alpha:0,
  rolloutCombatMode:"random"}];
 for(const c of [0.35,0.55,0.7,1.0])
  for(const alpha of [0,0.1,0.25,0.4])
   out.push({c,alpha,rolloutCombatMode:"sampled-expectimax"});
 return out;
};
export const tuningCandidates=candidateGrid;
const avg=(a,f)=>a.length?a.reduce((n,x)=>n+f(x),0)/a.length:0;
const taskKey=t=>[
 t.phase,candidateId(t.candidate),t.scenarioId,t.replicate
].join("|");
const recordKey=r=>[
 r.phase,r.candidate,r.scenarioId,r.replicate
].join("|");
const candidateStats=(records,phase)=>{
 const by=new Map();
 for(const r of records){
  if(r.phase!==phase)continue;
  if(!by.has(r.candidate))by.set(r.candidate,[]);
  by.get(r.candidate).push(r);
 }
 const out=[...by].map(([name,items])=>{
  const count=items.length;
  const meanFitness=avg(items,r=>r.fitness);
  const sd=Math.sqrt(avg(items,r=>(r.fitness-meanFitness)**2));
  return {
   candidate:name,count,
   scenarios:new Set(items.map(r=>r.scenarioId)).size,
   meanFitness,
   meanClear:avg(items,r=>r.clear),
   meanHeroDeaths:avg(items,r=>r.killed),
   meanHPFraction:avg(items,r=>r.hpFraction),
   meanUses:avg(items,r=>r.uses),
   searchSeconds:items.reduce((n,r)=>n+r.searchMs,0)/1000,
   meanSearchMs:avg(items,r=>r.searchMs),
   stdevFitness:sd,
   stdError:count?sd/Math.sqrt(count):null
  };
 });
 // This ranking optimizes out-of-search survival-weighted encounter
 // quality, not in-search binary rollout successes or heuristic estimates.
 out.sort((a,b)=>b.meanFitness-a.meanFitness||
  b.meanClear-a.meanClear||a.candidate.localeCompare(b.candidate));
 return out;
};
function readOptions(argv){
 const o={};
 const allowed=new Set(["--minutes","--workers","--budget","--samples",
  "--tactical-max","--seed","--out","--validate-minutes"]);
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!allowed.has(k)||v===undefined||Object.hasOwn(o,k))
   throw Error("Unknown/duplicate/missing tuning argument "+k);
  o[k]=v;
 }
 const integer=(key,def,min,max)=>{
  const n=Number(o[key]??def);
  if(!Number.isSafeInteger(n)||n<min||n>max)
   throw Error(key+" must be integer in ["+min+","+max+"]");
  return n;
 };
 const minutes=integer("--minutes",120,1,720);
 const workers=integer("--workers",8,1,32);
 const validationMinutes=integer("--validate-minutes",
  Math.min(15,Math.max(1,Math.floor(minutes/8))),0,minutes);
 if(validationMinutes>=minutes)
  throw Error("Reserve less validation time than total wall clock time");
 const now=new Date().toISOString().replace(/[:.]/g,"-");
 return {
  minutes,workers,budget:integer("--budget",32,2,512),
  samples:integer("--samples",2,1,6),
  tacticalMax:integer("--tactical-max",2,1,64),
  seed:integer("--seed",20261017,1,0xffffffff),
  validationMinutes,
  out:resolve(o["--out"]??"results/hybrid-tune-"+now)
 };
}
export const parseTuningOptions=readOptions;
function atomicJson(path,data){
 const temporary=path+".tmp";
 writeFileSync(temporary,JSON.stringify(data,null,2)+"\n");
 renameSync(temporary,path);
}
function buildSummary(config,records,start,end,validationStart,
 chosen){
 const rankedTrain=candidateStats(records,"train");
 const rankedValidation=candidateStats(records,"validate");
 const baselineValidation=rankedValidation.find(r=>r.candidate==="uct-classic");
 const validFront=rankedValidation.filter(r=>
  r.candidate!=="uct-classic");
 const candidateLeader=validFront[0]??null;
 const sufficient=Boolean(candidateLeader&&baselineValidation&&
  candidateLeader.scenarios>=8&&baselineValidation.scenarios>=8&&
  candidateLeader.count>=24&&baselineValidation.count>=24);
 // The held-out winner is reported as a *candidate*, not a certified
 // improvement. Statistical uncertainty, elapsed cost and chance
 // sensitivity should be considered before using it in production.
 return {
  schema:"mcts-implicit-tuning-v1",
  setup:config,
  startedAt:new Date(start).toISOString(),
  lastUpdate:new Date().toISOString(),
  finishedAt:end?new Date(end).toISOString():null,
  elapsedMinutes:(Date.now()-start)/60000,
  completedTrials:records.length,
  train:rankedTrain,
  heldOut:rankedValidation,
  selectedFinalists:chosen?.map(candidateId)??[],
  provisionalBest:sufficient?candidateLeader:null,
  validationIsSufficient:sufficient,
  reference:baselineValidation??null,
  conclusion:!sufficient?
   "Insufficient complete held-out data to recommend constants":
   candidateLeader.meanFitness>baselineValidation.meanFitness?
   "Candidate improves observed held-out mean; not a proof of superiority":
   "No observed held-out improvement over classic UCT baseline",
  caveats:[
   "Objective is canonical encounter survival/HP after an out-of-search root decision, not full-expedition win rate",
   "Train and validation scenario IDs are disjoint, with separately seeded game/search/evaluation RNG",
   "Within each scenario/replicate, all candidates share the same initial state and independent evaluation chance seeds",
   "Independent continuations can diverge in consumed dice when actions differ",
   "Equal MCTS budgets do not imply equal CPU costs; inspect searchSeconds/meanSearchMs",
   "This is offline parameter tuning only; no tuned constants are applied to engine defaults",
   "Do not claim implicit backups always improve results without out-of-sample evidence"
  ]
 };
}
async function main(){
 const config=readOptions(process.argv.slice(2));
 mkdirSync(config.out,{recursive:true});
 const manifest=join(config.out,"manifest.json");
 const logPath=join(config.out,"trials.ndjson");
 const summaryPath=join(config.out,"summary.json");
 const candidates=candidateGrid(),byName=new Map(candidates.map(c=>
  [candidateId(c),c]));
 const settingSignature={
  seed:config.seed,budget:config.budget,samples:config.samples,
  tacticalMax:config.tacticalMax,workersIndependent:1,
  schema:"mcts-implicit-tuning-v1"
 };
 if(existsSync(manifest)){
  const previous=JSON.parse(readFileSync(manifest,"utf8"));
  if(JSON.stringify(previous)!==JSON.stringify(settingSignature))
   throw Error("Cannot resume: tuning configuration differs from manifest");
 }else atomicJson(manifest,settingSignature);
 const stored=existsSync(logPath)?
  readFileSync(logPath,"utf8").split("\n").filter(Boolean).map(JSON.parse):[];
 const records=[],seen=new Set();
 for(const row of stored){
  const key=recordKey(row);
  if(seen.has(key))continue;
  seen.add(key);records.push(row);
 }
 const all=scenarios({seed:config.seed}).map(s=>s.id);
 // Two held-out profiles per Monster; 36 distinct training positions and
 // 12 validation positions, fixed independent of candidate choice.
 const trainIds=all.filter((_,i)=>i%4!==1),holdoutIds=all.filter((_,i)=>i%4===1);
 const trainSchedule=trainIds.map((_,i)=>trainIds[(i*5)%trainIds.length]);
 const start=Date.now(),end=start+config.minutes*60000;
 const validationStart=end-config.validationMinutes*60000;
 let stopped=false,phase="train",wave=0,replicateFrom=0;
 let queue=[],pending=0,finalists=null,completedNew=0;
 let abortReason=null;
 const assigned=new Set();
 const workers=[];
 const log=(s)=>process.stdout.write("["+new Date().toISOString()+"] "+s+"\n");
 function enqueue(phaseKind,selected,ids,from,to){
  // Every candidate receives identical scenarios and replicate IDs.
  for(let replicate=from;replicate<to;replicate++)
   for(const id of ids)
    for(const candidate of selected){
     const task={
      phase:phaseKind,candidate,scenarioId:id,replicate,
      seed:config.seed,budget:config.budget,
      samples:config.samples,tacticalMax:config.tacticalMax
     };
     const key=taskKey(task);
     if(seen.has(key)||assigned.has(key))continue;
     assigned.add(key);queue.push(task);
    }
 }
 function refreshReport(final=false){
  const report=buildSummary(config,records,start,final?Date.now():null,
   validationStart,finalists);
  atomicJson(summaryPath,report);
  return report;
 }
 function takeFinalists(){
  const ranked=candidateStats(records,"train");
  const names=ranked.slice(0,3).map(r=>r.candidate);
  // Include both reference UCT and pure sampled-expectimax at C=0.7
  // so the held-out test isolates the *incremental* value of alpha.
  names.push("uct-classic",candidateId({c:0.7,alpha:0}));
  finalists=[...new Set(names)].map(n=>byName.get(n)).filter(Boolean);
  if(finalists.length<2)throw Error("Not enough configurations for validation");
  log("Held-out finalists: "+finalists.map(candidateId).join(", "));
 }
 function fill(){
  if(queue.length||pending>0||stopped)return;
  if(Date.now()>=end)return;
  if(Date.now()>=validationStart&&phase==="train"){
   phase="validate";queue=[];
   takeFinalists();
  }
  if(phase==="train"){
   let chosen,ids,from,to;
   if(wave===0){chosen=candidates;ids=trainSchedule.slice(0,9);from=0;to=1;}
   else if(wave===1){
    chosen=candidateStats(records,"train").slice(0,8)
     .map(r=>byName.get(r.candidate));
    ids=trainSchedule.slice(0,18);from=0;to=2;
   }else if(wave===2){
    chosen=candidateStats(records,"train").slice(0,4)
     .map(r=>byName.get(r.candidate));
    ids=trainSchedule;from=0;to=4;
   }else{
    chosen=candidateStats(records,"train").slice(0,4)
     .map(r=>byName.get(r.candidate));
    ids=trainSchedule;from=4+2*(wave-3);to=from+2;
   }
   enqueue("train",chosen,ids,from,to);
   wave++;
   if(!queue.length&&wave<100000){
    // A resumed run may have all these trial keys in trials.ndjson.
    // Advance immediately rather than leaving eight workers idle.
    fill();
   }
  }else{
   // Once validation starts, NEVER use validation outcomes to select a
   // fresh finalist. Replicate until the wall-clock deadline instead.
   const counts=records.filter(r=>r.phase==="validate");
   const highest=Math.floor(counts.length/
    Math.max(1,holdoutIds.length*finalists.length));
   enqueue("validate",finalists,holdoutIds,highest,highest+1);
   if(!queue.length&&Date.now()<end)
    enqueue("validate",finalists,holdoutIds,highest+1,highest+2);
  }
 }
 function assign(worker){
  if(stopped||worker.busy||Date.now()>=end)return;
  if(Date.now()>=validationStart&&phase==="train"){
   // Don't start new training work past the reserved hold-out time.
   queue=[];phase="validate";takeFinalists();
  }
  if(!queue.length)fill();
  if(!queue.length)return;
  const task=queue.shift();
  worker.busy=true;worker.task=task;pending++;
  worker.postMessage({type:"work",task});
 }
 function stop(reason,failed=false){
  if(stopped)return;
  stopped=true;abortReason=reason;
  clearInterval(pulse);
  const report=refreshReport(true);
  log("Stopped ("+reason+"): "+report.completedTrials+
   " total completed trials. Output "+summaryPath);
  if(failed)process.exitCode=1;
  for(const worker of workers)worker.terminate();
 }
 function check(){
  if(stopped)return;
  const now=Date.now();
  if(now>=end){
   stop("wall-clock deadline");
   return;
  }
  if(now>=validationStart&&phase==="train"){
   queue=[];
   phase="validate";
   takeFinalists();
  }
  for(const worker of workers)assign(worker);
 }
 const pulse=setInterval(()=>{
  if(stopped)return;
  const report=refreshReport();
  const best=report.train[0];
  log("Progress: "+report.completedTrials+" trials, mode="+phase+
   ", pending="+pending+", queued="+queue.length+
   ", trainingLeader="+(best?.candidate??"none")+
   " trainFitness="+(best?.meanFitness.toFixed(3)??"n/a"));
  check();
 },60000);
 process.on("SIGINT",()=>stop("SIGINT"));
 process.on("SIGTERM",()=>stop("SIGTERM"));
 log("Start: workers="+config.workers+" (host sees "+cpus().length+
  "), duration="+config.minutes+"m, validation reserve="+
  config.validationMinutes+"m; candidates="+candidates.length+
  "; train states="+trainIds.length+
  "; hold-out states="+holdoutIds.length);
 for(let i=0;i<config.workers;i++){
  const w=new Worker(new URL(import.meta.url),{workerData:null});
  w.busy=false;w.task=null;workers.push(w);
  w.on("message",msg=>{
   if(stopped)return;
   if(msg.type==="error"){
    log("FATAL trial "+taskKey(w.task)+": "+msg.message);
    stop("worker task error",true);return;
   }
   if(msg.type!=="done")return;
   const key=recordKey(msg.row);
   pending--;w.busy=false;w.task=null;
   if(!seen.has(key)){
    appendFileSync(logPath,JSON.stringify(msg.row)+"\n");
    seen.add(key);records.push(msg.row);completedNew++;
    if(completedNew%24===0)refreshReport();
   }
   if(queue.length===0&&pending===0)fill();
   for(const worker of workers)assign(worker);
  });
  w.on("error",err=>{if(!stopped){log("Worker error: "+err.stack);
   stop("worker crash",true);}});
  w.on("exit",code=>{if(!stopped&&code!==0)
   stop("worker unexpected exit "+code,true);});
 }
 fill();
 for(const worker of workers)assign(worker);
 // Guarantee a completion even if no worker reports back near deadline.
 const remaining=end-Date.now();
 setTimeout(()=>stop("hard deadline"),Math.max(0,remaining)).unref();
}
if(!isMainThread){
 parentPort.on("message",msg=>{
  if(msg.type!=="work")return;
  try{
   const row=evaluateHybridJob(msg.task);
   parentPort.postMessage({type:"done",row});
  }catch(error){
   parentPort.postMessage({type:"error",message:error.stack??String(error)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
