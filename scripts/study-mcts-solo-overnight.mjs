#!/usr/bin/env node
/**
 * 8-core, time-capped, SOLO ONLY independent encounter-root research.
 *
 * Experiment axes:
 *  - pure UCT versus pure implicit MAX backups
 *  - 2-ply sampled expectimax with samples/calls 1/1,2/2,4/2
 *  - three implicit heuristics: legacy, solo-hp, solo-threat
 *  - fixed-MCTS-visits versus pilot-CPU-calibrated MCTS visits
 *
 * Every arm chooses its root action using canonical, fair-information
 * MCTS, then that action is played by the canonical engine against NEW
 * hidden dice using one fixed downstream basic policy. These are NOT
 * full-expedition win rates.
 *
 * All eight printed Heroes, eight Monsters, and three HP regimes.
 * Tracks exact underlying trial pairs and resamples scenario clusters
 * for uncertainty. Does NOT change production defaults.
 */
import {Worker,isMainThread,parentPort} from "node:worker_threads";
import {existsSync,mkdirSync,readFileSync,writeFileSync,
 appendFileSync,renameSync} from "node:fs";
import {cpus} from "node:os";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {soloScenarioIds} from "./solo-encounter-fixtures.mjs";
import {evaluateHybridJob} from "./tune-mcts-hybrid-core.mjs";

export const soloStudyArms=(c=0.35,alpha=0.4)=>[
 {name:"uct",c,alpha:0,heuristicMode:"legacy",
  rolloutCombatMode:"random",samples:1,tacticalMax:1},
 ...["legacy","solo-hp","solo-threat"].map(mode=>({
  name:"implicit-"+mode,c,alpha,heuristicMode:mode,
  rolloutCombatMode:"random",samples:1,tacticalMax:1
 })),
 ...[[1,1],[2,2],[4,2]].map(([samples,tacticalMax])=>({
  name:"expectimax-s"+samples+"k"+tacticalMax,c,alpha:0,
  heuristicMode:"legacy",rolloutCombatMode:"sampled-expectimax",
  samples,tacticalMax
 })),
 ...["legacy","solo-hp","solo-threat"].map(mode=>({
  name:"hybrid-"+mode,c,alpha,heuristicMode:mode,
  rolloutCombatMode:"sampled-expectimax",samples:2,tacticalMax:2
 }))
];

export function parseSoloStudyArgs(argv){
 const opts={},allowed=new Set(["--minutes","--workers","--seed",
  "--budget","--target-ms","--max-budget","--repetitions","--c",
  "--alpha","--out","--scenarios"]);
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!allowed.has(key)||value===undefined||Object.hasOwn(opts,key))
   throw Error("Unknown, missing or duplicate solo-study parameter "+key);
  opts[key]=value;
 }
 const numeric=(name,fallback,min,max)=>{
  const n=Number(opts[name]??fallback);
  if(!Number.isSafeInteger(n)||n<min||n>max)
   throw Error(name+" must be an integer in ["+min+","+max+"]");
  return n;
 };
 const c=Number(opts["--c"]??0.35),alpha=Number(opts["--alpha"]??0.4);
 if(!Number.isFinite(c)||c<0||c>10||!Number.isFinite(alpha)||
  alpha<0||alpha>1)throw Error("Invalid C or alpha");
 const seed=numeric("--seed",20261018,1,0xffffffff);
 return {
  minutes:numeric("--minutes",480,1,720),
  workers:numeric("--workers",8,1,32),
  seed,
  budget:numeric("--budget",32,2,512),
  targetMs:numeric("--target-ms",1200,100,60000),
  maxBudget:numeric("--max-budget",96,4,1024),
  repetitions:numeric("--repetitions",12,1,500),
  scenarios:numeric("--scenarios",192,1,192),c,alpha,
  out:resolve(opts["--out"]??"results/solo-overnight-"+seed)
 };
}
const atomic=(path,content)=>{
 const temp=path+".tmp";
 writeFileSync(temp,JSON.stringify(content,null,2)+"\n");
 renameSync(temp,path);
};
const rowKey=r=>[r.mode,r.arm,r.scenarioId,r.replicate].join("|");
const mean=(list,key)=>list.length?
 list.reduce((v,x)=>v+x[key],0)/list.length:null;
const bootstrapPair=(rows,mode,arm,reference)=>{
 const source=new Map(rows.filter(x=>x.mode===mode&&x.arm===reference)
  .map(x=>[x.scenarioId+"|"+x.replicate,x]));
 const pairs=rows.filter(x=>x.mode===mode&&x.arm===arm).flatMap(x=>{
  const other=source.get(x.scenarioId+"|"+x.replicate);
  return other?[{
   scenarioId:x.scenarioId,
   deltaFitness:x.fitness-other.fitness,
   deltaClear:x.clear-other.clear,
   deltaDeaths:x.killed-other.killed,
   deltaSearchMs:x.searchMs-other.searchMs
  }]:[];
 });
 if(!pairs.length)return null;
 const clusters=new Map();
 for(const p of pairs){
  if(!clusters.has(p.scenarioId))clusters.set(p.scenarioId,[]);
  clusters.get(p.scenarioId).push(p);
 }
 const values=[...clusters.values()];
 let seed=2166136261;
 for(const ch of mode+"|"+arm+"|"+reference)
  seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
 const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/0x100000000;};
 const boot=[];
 if(values.length>=2){
  for(let i=0;i<600;i++){
   let sum=0,n=0;
   for(let j=0;j<values.length;j++){
    for(const p of values[Math.floor(uniform()*values.length)]){
     sum+=p.deltaFitness;n++;
    }
   }
   boot.push(sum/n);
  }
 }
 boot.sort((a,b)=>a-b);
 return {reference,arm,mode,pairedTrials:pairs.length,
  independentScenarioTypes:values.length,
  meanDeltaFitness:mean(pairs,"deltaFitness"),
  meanDeltaClear:mean(pairs,"deltaClear"),
  meanDeltaDeaths:mean(pairs,"deltaDeaths"),
  meanDeltaSearchMs:mean(pairs,"deltaSearchMs"),
  bootstrap95:boot.length?
   [boot[Math.floor(.025*(boot.length-1))],
    boot[Math.floor(.975*(boot.length-1))]]:null};
};
export function soloStudySummary(records,config){
 const arms=config.arms;
 const modeRows=[];
 for(const mode of ["equal-visits","cpu-calibrated"]){
  for(const arm of arms){
   const items=records.filter(r=>r.mode===mode&&r.arm===arm.name);
   modeRows.push({mode,arm:arm.name,budget:arm.budgets?.[mode]??null,
    heuristicMode:arm.heuristicMode,
    expectimax:arm.rolloutCombatMode==="sampled-expectimax",
    samples:arm.samples,tacticalMax:arm.tacticalMax,
    count:items.length,scenarioTypes:new Set(items.map(r=>r.scenarioId)).size,
    meanFitness:mean(items,"fitness"),meanClear:mean(items,"clear"),
    meanDeaths:mean(items,"killed"),meanHP:mean(items,"hpFraction"),
    meanSearchMs:mean(items,"searchMs"),
    meanTacticalSearches:mean(items,"rolloutCombatSearches"),
    totalSearchSeconds:items.reduce((n,r)=>n+r.searchMs,0)/1000});
  }
 }
 const comparisons=[];
 for(const mode of ["equal-visits","cpu-calibrated"])
  for(const arm of arms){
   if(arm.name==="uct")continue;
   const comparator=arm.name.startsWith("hybrid-")?
    "expectimax-s2k2":null;
   const noExpectimax=arm.name.startsWith("hybrid-")?
    "implicit-"+arm.heuristicMode:null;
   comparisons.push({mode,arm:arm.name,
    vsUCT:bootstrapPair(records,mode,arm.name,"uct"),
    vsSameExpectimaxWithoutImplicit:comparator?
     bootstrapPair(records,mode,arm.name,comparator):null,
    vsSameImplicitWithoutExpectimax:noExpectimax?
     bootstrapPair(records,mode,arm.name,noExpectimax):null,
    vsLegacyHeuristic:arm.name.startsWith("hybrid-")&&
      arm.heuristicMode!=="legacy"?
     bootstrapPair(records,mode,arm.name,"hybrid-legacy"):null});
  }
 return {schema:"solo-mcts-overnight-v1",
  setup:config.setup,
  arms:arms.map(a=>({name:a.name,alpha:a.alpha,c:a.c,
   heuristicMode:a.heuristicMode,rolloutCombatMode:a.rolloutCombatMode,
   samples:a.samples,tacticalMax:a.tacticalMax,
   budgets:a.budgets,pilotMsPerVisit:a.pilotMsPerVisit??null})),
  completedTrials:records.length,results:modeRows,comparisons,
  caveats:[
   "Exactly ONE live Hero per encounter, including all eight printed Heroes and three deliberately constructed HP conditions.",
   "Independent canonical continuation follows the first chosen MCTS action using the same downstream fixed basic policy, not recurrent MCTS; NOT a full-expedition win rate.",
   "Equal-visits mode holds MCTS trial counts fixed and must NOT be interpreted as equal CPU time.",
   "CPU-calibrated mode uses two separate pilot encounter roots per arm to approximate equal time; inspect ACTUAL meanSearchMs.",
   "A heuristic's numerical score is NOT a win probability; only held-out canonical outcomes score the arms.",
   "Repeated seeds within a scenario are correlated; bootstrap uncertainty resamples scenario IDs rather than treating each dice roll as a distinct game.",
   "Predefined ten configurations, not weight tuning: compare independent changes to expectimax and implicit evaluation without changing production defaults.",
   "Resumable per-trial checkpoints; partial runs may contain unpaired arms, ignored in paired contrasts."
  ]};
}
async function main(){
 const options=parseSoloStudyArgs(process.argv.slice(2));
 mkdirSync(options.out,{recursive:true});
 const manifest=join(options.out,"manifest.json"),
  trialFile=join(options.out,"trials.ndjson"),
  reportFile=join(options.out,"summary.json");
 const setup=Object.fromEntries(Object.entries(options)
  .filter(([k])=>k!=="out"));
 let config;
 if(existsSync(manifest)){
  config=JSON.parse(readFileSync(manifest,"utf8"));
  if(JSON.stringify(config.setup)!==JSON.stringify(setup))
   throw Error("Cannot resume solo research: manifest settings differ");
 }else{
  const arms=soloStudyArms(options.c,options.alpha);
  // Pilot does NOT use the study's phase/seeds. Eight-core contention
  // varies across hardware; budgets are estimates, not hard wall bounds.
  for(const a of arms){
   a.pilotMsPerVisit=[];
   for(const scenarioId of [
    "crawler__solo-warrior-injured",
    "wisp__solo-witch-critical"
   ]){
    const probe=evaluateHybridJob({
     candidate:a,scenarioId,phase:"solo-pilot",
     replicate:0,seed:options.seed,budget:8,
     samples:a.samples,tacticalMax:a.tacticalMax,
     independentTrials:1
    });
    a.pilotMsPerVisit.push(probe.searchMs/8);
   }
   const ms=a.pilotMsPerVisit.reduce((x,y)=>x+y,0)/
    a.pilotMsPerVisit.length;
   a.budgets={
    "equal-visits":options.budget,
    "cpu-calibrated":Math.max(4,Math.min(options.maxBudget,
     Math.round(options.targetMs/Math.max(0.01,ms))))
   };
  }
  config={schema:"solo-mcts-overnight-v1",setup,arms,
   pilots:"Separate pilot seeds and positions; measured before independent study."};
  atomic(manifest,config);
 }
 const saved=existsSync(trialFile)?
  readFileSync(trialFile,"utf8").split("\n").filter(Boolean).map(JSON.parse):[];
 const completed=new Set(),records=[];
 for(const row of saved){
  const key=rowKey(row);
  if(completed.has(key))continue;
  records.push(row);completed.add(key);
 }
 const scenarioIds=soloScenarioIds().slice(0,options.scenarios);
 const pending=[];
 // Interleaving retains paired candidate comparisons even if deadline
 // arrives before all planned trials complete.
 for(let replicate=0;replicate<options.repetitions;replicate++)
  for(const scenarioId of scenarioIds)
   for(const mode of ["equal-visits","cpu-calibrated"])
    for(const arm of config.arms){
     const tag={arm:arm.name,mode,scenarioId,replicate};
     if(completed.has(rowKey(tag)))continue;
     pending.push({
      tag,
      args:{candidate:arm,scenarioId,replicate,
       phase:"solo-"+mode,seed:options.seed,
       budget:arm.budgets[mode],
       samples:arm.samples,tacticalMax:arm.tacticalMax,
       independentTrials:2}
     });
    }
 const start=Date.now(),deadline=start+options.minutes*60000;
 const workers=[];let active=0,stopped=false;
 const log=s=>console.log("["+new Date().toISOString()+"] "+s);
 const report=()=>{
  const summary=soloStudySummary(records,config);
  summary.elapsedMinutes=(Date.now()-start)/60000;
  summary.remaining=pending.length+active;
  summary.updatedAt=new Date().toISOString();
  atomic(reportFile,summary);
  return summary;
 };
 const halt=(reason,failed=false)=>{
  if(stopped)return;
  stopped=true;clearInterval(heartbeat);clearTimeout(endTimer);
  const s=report();
  log("Stop ("+reason+"): "+s.completedTrials+" completed; "+
   s.remaining+" remaining; summary: "+reportFile);
  if(failed)process.exitCode=1;
  for(const w of workers)w.terminate();
 };
 const assign=w=>{
  if(stopped||w.busy||Date.now()>=deadline)return;
  const task=pending.shift();
  if(!task)return;
  w.busy=true;w.task=task;active++;
  w.postMessage({type:"trial",task});
 };
 const heartbeat=setInterval(()=>{
  if(stopped)return;
  const s=report();log("Progress: "+s.completedTrials+
   " completed, "+s.remaining+" remaining; workers="+options.workers);
  if(Date.now()>=deadline)halt("wall-clock limit");
 },60000);
 const endTimer=setTimeout(()=>halt("wall-clock limit"),
  Math.max(0,deadline-Date.now()));
 process.on("SIGINT",()=>halt("SIGINT"));
 process.on("SIGTERM",()=>halt("SIGTERM"));
 log("Solo MCTS study: "+options.workers+" workers on "+cpus().length+
  " visible logical CPUs, "+config.arms.length+
  " arms × 2 modes, "+scenarioIds.length+" solo situations"+
  ", "+options.repetitions+" replicates, "+pending.length+
  " missing tasks. Max "+options.minutes+" minutes.");
 for(let i=0;i<options.workers;i++){
  const w=new Worker(new URL(import.meta.url));
  w.busy=false;w.task=null;workers.push(w);
  w.on("message",msg=>{
   if(stopped)return;
   if(msg.type==="error"){
    log("FAILED "+rowKey(w.task.tag)+": "+msg.error);
    halt("worker exception",true);return;
   }
   active--;w.busy=false;w.task=null;
   const row={...msg.row,...msg.tag};
   const key=rowKey(row);
   if(!completed.has(key)){
    appendFileSync(trialFile,JSON.stringify(row)+"\n");
    records.push(row);completed.add(key);
    if(records.length%50===0)report();
   }
   assign(w);
   if(pending.length===0&&active===0)halt("all pairs completed");
  });
  w.on("error",error=>{if(!stopped)halt(error.stack,true);});
  w.on("exit",code=>{if(!stopped&&code!==0)
   halt("worker died with exit "+code,true);});
 }
 for(const w of workers)assign(w);
 if(!pending.length&&!active)halt("already completed");
}
if(!isMainThread){
 parentPort.on("message",msg=>{
  if(msg.type!=="trial")return;
  try{
   const row=evaluateHybridJob(msg.task.args);
   parentPort.postMessage({type:"done",tag:msg.task.tag,row});
  }catch(err){
   parentPort.postMessage({type:"error",error:err.stack??String(err)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
