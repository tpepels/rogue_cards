#!/usr/bin/env node
/**
 * Factorial evaluation of 2-ply sampled expectimax and implicit MAX
 * backups with eight independent worker threads and a wall-clock cap.
 *
 * Fixed C; contrasts each expectimax depth/sampling intensity at alpha=0
 * and >0 plus UCT with/without implicit backups. The optional calibrated
 * CPU mode estimates budgets in separate pilot positions, then records
 * ACTUAL per-decision searchMs for each subsequent test.
 *
 * Tests canonical first-root action decisions and out-of-search complete
 * encounter continuation, not an entire MCTS-played expedition.
 */
import {Worker,isMainThread,parentPort} from "node:worker_threads";
import {mkdirSync,existsSync,readFileSync,writeFileSync,
 appendFileSync,renameSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {scenarios} from "./study-combat-phase2b.mjs";
import {evaluateHybridJob} from "./tune-mcts-hybrid-core.mjs";

export function factorialArms(c=0.35,alpha=0.4){
 const result=[
  {name:"uct",c,alpha:0,rolloutCombatMode:"random",samples:1,tacticalMax:1},
  {name:"uct-implicit",c,alpha,rolloutCombatMode:"random",
   samples:1,tacticalMax:1}
 ];
 for(const [samples,tacticalMax] of [[1,1],[2,2],[4,2],[2,4]]){
  const postfix="s"+samples+"-k"+tacticalMax;
  result.push({
   name:"expectimax-"+postfix,c,alpha:0,
   rolloutCombatMode:"sampled-expectimax",samples,tacticalMax
  },{
   name:"hybrid-"+postfix,c,alpha,
   rolloutCombatMode:"sampled-expectimax",samples,tacticalMax
  });
 }
 return result;
}
const id=t=>t.arm+"|"+t.scenarioId+"|"+t.replicate;
const avg=(xs,f)=>xs.length?xs.reduce((n,x)=>n+f(x),0)/xs.length:null;
function paired(rows,arm,reference){
 const indexed=new Map(rows.filter(r=>r.arm===reference)
  .map(r=>[r.scenarioId+"|"+r.replicate,r]));
 const pairs=rows.filter(r=>r.arm===arm).flatMap(r=>{
  const x=indexed.get(r.scenarioId+"|"+r.replicate);
  return x?[{
   scenarioId:r.scenarioId,
   fitness:r.fitness-x.fitness,
   clear:r.clear-x.clear,
   killed:r.killed-x.killed,
   searchMs:r.searchMs-x.searchMs
  }]:[];
 });
 if(!pairs.length)return null;
 const strata=new Map();
 for(const p of pairs){
  if(!strata.has(p.scenarioId))strata.set(p.scenarioId,[]);
  strata.get(p.scenarioId).push(p);
 }
 const scenarios=[...strata.values()];
 let seed=2166136261;
 for(const ch of arm+"|"+reference)
  seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/0x100000000;};
 const boots=[];
 if(scenarios.length>=2)for(let i=0;i<500;i++){
  let sum=0,count=0;
  for(let j=0;j<scenarios.length;j++){
   for(const v of scenarios[Math.floor(random()*scenarios.length)]){
    sum+=v.fitness;count++;
   }
  }
  boots.push(sum/count);
 }
 boots.sort((a,b)=>a-b);
 return {arm,reference,matchedTrials:pairs.length,
  independentScenarios:scenarios.length,
  deltaFitness:avg(pairs,p=>p.fitness),
  deltaClear:avg(pairs,p=>p.clear),
  deltaDeaths:avg(pairs,p=>p.killed),
  deltaSearchMs:avg(pairs,p=>p.searchMs),
  clusterCI95:boots.length?[boots[Math.floor(.025*(boots.length-1))],
   boots[Math.floor(.975*(boots.length-1))]]:null};
}
export function summarizeFactorial(rows,config){
 const byArm=config.arms.map(a=>{
  const selected=rows.filter(r=>r.arm===a.name);
  return {arm:a.name,plannedBudget:a.budget,
   samples:a.samples,tacticalMax:a.tacticalMax,
   alpha:a.alpha,c:a.c,
   trials:selected.length,
   scenarios:new Set(selected.map(r=>r.scenarioId)).size,
   meanFitness:avg(selected,r=>r.fitness),
   meanClear:avg(selected,r=>r.clear),
   meanDeaths:avg(selected,r=>r.killed),
   meanHP:avg(selected,r=>r.hpFraction),
   meanSearchMs:avg(selected,r=>r.searchMs),
   meanTacticalCalls:avg(selected,r=>r.rolloutCombatSearches),
   totalSearchSeconds:selected.reduce((n,r)=>n+r.searchMs,0)/1000};
 });
 const comparisons=[];
 for(const arm of config.arms){
  if(arm.name==="uct")continue;
  comparisons.push({arm:arm.name,
   vsUCT:paired(rows,arm.name,"uct"),
   vsImplicitOnly:arm.name==="uct-implicit"?null:
    paired(rows,arm.name,"uct-implicit"),
   vsSameIntensityNoImplicit:arm.name.startsWith("hybrid-")?
    paired(rows,arm.name,arm.name.replace("hybrid-","expectimax-")):
    null});
 }
 return {schema:"mcts-combat-factorial-v1",config,completedRows:rows.length,
  byArm,comparisons,caveats:[
   "Canonical, independently seeded complete encounter continuations after the root action only; subsequent actions are basic, not repeated MCTS.",
   "All arms in an equal-visits study have identical MCTS trial counts, but do NOT have matched CPU budgets.",
   "Calibrated mode estimates each search budget from a separate pilot. Actual search times can vary; look at meanSearchMs and deltaSearchMs, not just estimated budgets.",
   "Repetitions of the same scenario are not new independent scenario types. Cluster bootstrap resamples scenario IDs.",
   "Do not claim full-expedition strength or CPU-equivalent superiority from an encounter-root study."
  ]};
}
export function parseFactorialArgs(argv){
 const map={},allowed=new Set(["--mode","--workers","--minutes",
  "--seed","--scenarios","--repetitions","--budget","--target-ms",
  "--max-budget","--c","--alpha","--out"]);
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!allowed.has(k)||v===undefined||Object.hasOwn(map,k))
   throw Error("Unknown factorial option "+k);
  map[k]=v;
 }
 const int=(key,fallback,min,max)=>{
  const val=Number(map[key]??fallback);
  if(!Number.isSafeInteger(val)||val<min||val>max)
   throw Error(key+" out of range");
  return val;
 };
 const mode=map["--mode"]??"calibrated";
 if(!["calibrated","equal-visits"].includes(mode))
  throw Error("Invalid factorial mode");
 const c=Number(map["--c"]??0.35),alpha=Number(map["--alpha"]??0.4);
 if(!Number.isFinite(c)||c<0||c>10||
  !Number.isFinite(alpha)||alpha<0||alpha>1)
  throw Error("Invalid C/alpha");
 const seed=int("--seed",20261023,1,0xffffffff);
 return {mode,workers:int("--workers",8,1,32),
  minutes:int("--minutes",45,1,240),
  seed,scenarios:int("--scenarios",48,1,48),
  repetitions:int("--repetitions",4,1,100),
  budget:int("--budget",32,2,512),
  targetMs:int("--target-ms",1500,100,60000),
  maxBudget:int("--max-budget",128,4,2048),
  c,alpha,
  out:resolve(map["--out"]??"results/mcts-factorial-"+mode+"-"+seed)};
}
const save=(file,data)=>{
 const tmp=file+".tmp";
 writeFileSync(tmp,JSON.stringify(data,null,2)+"\n");
 renameSync(tmp,file);
};
async function main(){
 const args=parseFactorialArgs(process.argv.slice(2));
 mkdirSync(args.out,{recursive:true});
 const manifestPath=join(args.out,"manifest.json"),
  rowsPath=join(args.out,"trials.ndjson"),summaryPath=join(args.out,"summary.json");
 let config;
 if(existsSync(manifestPath)){
  config=JSON.parse(readFileSync(manifestPath,"utf8"));
  if(JSON.stringify(config.setup)!==JSON.stringify(
   Object.fromEntries(Object.entries(args).filter(([k])=>k!=="out"))
  ))throw Error("Incompatible saved factorial study settings");
 }else{
  const arms=factorialArms(args.c,args.alpha);
  if(args.mode==="equal-visits"){
   for(const a of arms)a.budget=args.budget;
  }else{
   // Separate pilot; state seeds and chance streams never overlap with
   // the subsequent study evaluation phase.
   const pilots=["crawler__exhausted-support",
    "wisp__asymmetric-frontline"];
   for(const arm of arms){
    const times=[];
    for(const scenarioId of pilots){
     const probe=evaluateHybridJob({
      candidate:arm,scenarioId,phase:"pilot",
      replicate:0,seed:args.seed,budget:8,
      samples:arm.samples,tacticalMax:arm.tacticalMax,
      independentTrials:1
     });
     times.push(probe.searchMs);
    }
    const msPerVisit=avg(times,x=>x)/8;
    arm.pilotMsPerVisit=msPerVisit;
    arm.budget=Math.max(4,Math.min(args.maxBudget,
     Math.round(args.targetMs/Math.max(msPerVisit,0.01))));
   }
  }
  config={setup:Object.fromEntries(Object.entries(args).filter(([k])=>k!=="out")),
   arms,pilotExplanation:"Mean wall time per MCTS visit from two independent pilot Monster positions; used to estimate equal CPU search budgets."};
  save(manifestPath,config);
 }
 const allScenarios=scenarios({seed:args.seed,limit:args.scenarios})
  .map(x=>x.id);
 const stored=existsSync(rowsPath)?readFileSync(rowsPath,"utf8")
  .split("\n").filter(Boolean).map(JSON.parse):[];
 const seen=new Set(stored.map(r=>id(r)));
 const rows=[...stored],jobs=[];
 // Interleave scenario-first to leave paired outcomes when interrupted.
 for(let replicate=0;replicate<args.repetitions;replicate++)
  for(const scenarioId of allScenarios)
   for(const arm of config.arms){
    const job={arm:arm.name,scenarioId,replicate};
    if(!seen.has(id(job)))jobs.push({job,parameters:{
     candidate:arm,scenarioId,replicate,phase:"factorial",
     seed:args.seed,budget:arm.budget,
     samples:arm.samples,tacticalMax:arm.tacticalMax,
     independentTrials:2
    }});
   }
 const start=Date.now(),deadline=start+args.minutes*60000;
 const workers=[];let stopped=false,running=0;
 const log=msg=>console.log("["+new Date().toISOString()+"] "+msg);
 function report(){
  const summary=summarizeFactorial(rows,config);
  summary.elapsedMinutes=(Date.now()-start)/60000;
  summary.unfinished=jobs.length+running;
  save(summaryPath,summary);
  return summary;
 }
 function stop(reason,error=false){
  if(stopped)return;
  stopped=true;
  clearInterval(heartbeat);clearTimeout(timeout);
  const summary=report();
  log("Stopped: "+reason+"; rows="+summary.completedRows+
   "; pending="+summary.unfinished+"; summary="+summaryPath);
  log("Arm means: "+JSON.stringify(summary.byArm.map(x=>({
   arm:x.arm,budget:x.plannedBudget,trials:x.trials,
   survival:x.meanClear,fitness:x.meanFitness,
   searchMs:x.meanSearchMs}))));
  log("Paired effects: "+JSON.stringify(summary.comparisons.map(x=>({
   arm:x.arm,
   vsUCT:x.vsUCT?.deltaFitness??null,
   vsSameExpectimaxNoImplicit:
    x.vsSameIntensityNoImplicit?.deltaFitness??null,
   paired:x.vsUCT?.matchedTrials??0}))));
  if(error)process.exitCode=1;
  for(const worker of workers)worker.terminate();
 }
 function dispatch(w){
  if(stopped||w.busy||Date.now()>=deadline)return;
  const task=jobs.shift();
  if(!task)return;
  w.busy=true;w.task=task;running++;
  w.postMessage({type:"trial",parameters:task.parameters,job:task.job});
 }
 const heartbeat=setInterval(()=>{
  if(Date.now()>=deadline){stop("wall-clock limit");return;}
  const summary=report();
  log("Completed "+rows.length+", remaining "+summary.unfinished);
  if(!summary.unfinished)stop("finished all trials");
 },60000);
 const timeout=setTimeout(()=>stop("wall-clock limit"),
  Math.max(0,deadline-Date.now()));
 for(let i=0;i<args.workers;i++){
  const worker=new Worker(new URL(import.meta.url));
  worker.busy=false;worker.task=null;workers.push(worker);
  worker.on("message",msg=>{
   if(stopped)return;
   if(msg.type==="error"){
    log("FAILED "+id(msg.job)+": "+msg.error);
    stop("worker error",true);return;
   }
   running--;worker.busy=false;
   const row={...msg.result,arm:msg.job.arm};
   if(!seen.has(id(row))){
    appendFileSync(rowsPath,JSON.stringify(row)+"\n");
    rows.push(row);seen.add(id(row));
   }
   if(rows.length%50===0)report();
   dispatch(worker);
   if(!jobs.length&&running===0)stop("finished all trials");
  });
  worker.on("error",err=>{if(!stopped)stop(err.stack,true);});
  worker.on("exit",code=>{if(!stopped&&code!==0)
   stop("worker unexpectedly exited: "+code,true);});
 }
 log("Start "+args.workers+" workers, "+args.mode+
  " mode, "+config.arms.length+" arms, "+jobs.length+" remaining tasks");
 for(const worker of workers)dispatch(worker);
 if(!jobs.length&&running===0)stop("already completed");
}
if(!isMainThread){
 parentPort.on("message",msg=>{
  if(msg.type!=="trial")return;
  try{parentPort.postMessage({type:"done",job:msg.job,
    result:evaluateHybridJob(msg.parameters)});
  }catch(error){
   parentPort.postMessage({type:"error",job:msg.job,
    error:error.stack??String(error)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
