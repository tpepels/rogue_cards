#!/usr/bin/env node
/**
 * One inexpensive paired three-arm diagnostic study on real Rogue Cards.
 *
 * Classic full-tree at budgets 2 and 16, frontier UCT at budget 16.
 * This tests search depth and tree choice with only THREE full expeditions
 * per independent initial seed; use pilot results for deciding what to do
 * next, NOT as balance estimates for individual card faces.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,readdirSync}
 from "node:fs";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction,
 forcesEquipmentProgress} from "../src/session-policy.js";
import {mctsActionKey} from "../src/session-mcts.js";
import {summarizeMctsDiagnostics} from "../src/mcts-diagnostic-report.js";

const parties=[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(g=>[h.id,g.id]))];
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const atomic=(path,value)=>{
 const temp=path+".tmp-"+process.pid;
 writeFileSync(temp,JSON.stringify(value,null,2)+"\n");
 renameSync(temp,path);
};
function parse(args){
 const raw={},flags=new Set();
 const allowed=new Set(["--runs","--workers","--hours","--seed","--out",
  "--audit","--low-budget","--high-budget","--trace-limit",
  "--max-game-steps","--max-search-steps","--job-minutes"]);
 for(let j=0;j<args.length;j++){
  const k=args[j];
  if(k==="--resume"){
   if(flags.has(k))throw Error("Duplicate "+k);
   flags.add(k);continue;
  }
  if(!allowed.has(k)||raw[k]!==undefined||!args[j+1]||
    args[j+1].startsWith("--"))throw Error("Malformed option "+k);
  raw[k]=args[++j];
 }
 const integer=(key,def,min,max)=>{
  const value=raw[key]??String(def),n=Number(value);
  if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(n)||
    n<min||n>max)throw Error("Invalid "+key);
  return n;
 };
 const low=integer("--low-budget",2,1,256);
 const high=integer("--high-budget",16,2,256);
 if(high<=low)throw Error("High search budget must exceed low budget");
 return {
  runs:integer("--runs",24,1,100000),
  workers:integer("--workers",Math.min(6,availableParallelism()),1,16),
  hours:integer("--hours",2,1,72),
  seed:integer("--seed",20261016,1,0xffffffff),
  lowBudget:low,highBudget:high,
  traceLimit:integer("--trace-limit",120,1,1000),
  maxGameSteps:integer("--max-game-steps",7000,1,100000),
  maxSearchSteps:integer("--max-search-steps",4000,1,100000),
  jobMinutes:integer("--job-minutes",30,1,240),
  audit:resolve(raw["--audit"]??"results/canonical-audit-mcts-diagnostics/summary.json"),
  out:resolve(raw["--out"]??"results/mcts-diagnostics-pilot-01"),
  resume:flags.has("--resume")
 };
}
export function playDiagnosticAgent({seed,heroes,budget,treeMode,config:c}){
 const session=createDecisionSession({seed,heroes});
 const policy=createSessionPolicy();
 let steps=0,searches=0,requestedRollouts=0;
 const trace=[];
 const start=performance.now();
 for(;steps<c.maxGameSteps&&session.phase!=="terminal";steps++){
  const actions=sessionActions(session);
  if(!actions.length)throw Error("No real legal decisions at "+session.phase);
  const forced=forcesEquipmentProgress(session,policy,actions);
  if(actions.length>1&&!forced){
   searches++;
   requestedRollouts+=Math.max(budget,actions.length);
  }
  // Both modes use the SAME continuation seed and fair information.
  // The only controlled factors are budget and UCT expansion.
  const chosen=selectSessionPolicyAction(session,policy,{
   budget,treeMode,searchProfile:"classic",knowledge:"fair",
   seed:mix(seed^Math.imul(steps+1,0xc2b2ae35)),
   maxSearchSteps:c.maxSearchSteps,legalActions:actions
  });
  if(trace.length<c.traceLimit){
   const s=session.state;
   trace.push({
    step:steps,
    phase:session.pendingNested?
     "reaction:"+session.pendingNested.trigger.phase:session.phase,
    roomId:s.room?.id??null,monsterId:s.monster?.id??null,
    heroHp:s.heroes.map(h=>h.hp),
    resources:{
     inventory:s.heroes.map(h=>h.inventory.map(x=>x.id)),
     equipped:s.heroes.map(h=>Object.fromEntries(
      Object.entries(h.slots).map(([slot,card])=>[slot,card?.id]))),
     progress:{...s.stageProgress}
    },
    action:{
     phase:chosen.phase,kind:chosen.kind,
     cardId:chosen.cardId??null,index:chosen.index??null,
     mode:chosen.mode??null
    },
    actionFingerprint:mctsActionKey(chosen)
   });
  }
  submitDecision(session,chosen,{observeResult:false,recordHistory:false});
 }
 if(session.phase!=="terminal"||session.state.metrics.roundLimit||
    session.state.metrics.unresolved)
  throw Error("Non-terminal source at "+steps+": "+session.phase);
 if(!session.state.metrics.won&&!session.state.metrics.escaped&&
    session.state.alive())
  throw Error("Terminal game has no printed ending");
 return {
  won:Number(!!session.state.metrics.won),
  escaped:Boolean(session.state.metrics.escaped),
  ending:session.state.endingKind,
  steps,searches,requestedRollouts,
  elapsedMs:Math.round(performance.now()-start),
  equipmentCycleBreaks:policy.cycleBreaks,trace
 };
}
export function oneDiagnosticSeed(i,c){
 const heroes=parties[i%parties.length];
 const gameSeed=mix(c.seed^Math.imul(i+1,0x85ebca6b))||1;
 const agents={};
 for(const [id,budget,treeMode] of [
  ["classic2",c.lowBudget,"full"],
  ["classic16",c.highBudget,"full"],
  ["frontier16",c.highBudget,"frontier"]
 ]){
  try{
   agents[id]=playDiagnosticAgent({
    seed:gameSeed,heroes,budget,treeMode,config:c
   });
  }catch(error){
   const failed=Error("Source "+i+" agent "+id+" seed "+gameSeed+
    ": "+(error.stack||error));
   failed.repro={sourceIndex:i,agent:id,gameSeed,heroes,
    engineError:error.repro??null};
   throw failed;
  }
 }
 // Keep compact traces only where a stronger-budget candidate loses.
 // The rest retain full outcomes, costs, choices and independent seeds.
 if(agents.classic16.won>=agents.frontier16.won)
  agents.classic16.trace=[];
 if(agents.classic16.won<=agents.frontier16.won)
  agents.frontier16.trace=[];
 if(agents.classic2.won>=agents.classic16.won)
  agents.classic2.trace=[];
 if(agents.classic2.won<=agents.classic16.won&&
    agents.classic16.won<=agents.frontier16.won)
  agents.classic16.trace=[];
 // If classic16 beats classic2 but loses to frontier16, neither contrast
 // is a "candidate worse" case. Dropping traces is harmless.
 if(agents.classic2.won!==1||agents.classic16.won!==0)
  agents.classic2.trace=[];
 if((agents.classic2.won!==1||agents.classic16.won!==0)&&
    (agents.classic16.won!==1||agents.frontier16.won!==0))
  agents.classic16.trace=[];
 if(agents.classic16.won!==1||agents.frontier16.won!==0)
  agents.frontier16.trace=[];
 return {i,gameSeed,heroes,agents};
}
function report(c,revision,completed,errors=[]){
 const rows=[...completed.values()];
 const contrasts=summarizeMctsDiagnostics(rows);
 const result={
  schema:1,revision,
  study:"canonical-3-arm-mcts-diagnostics",
  design:{runs:c.runs,seed:c.seed,lowBudget:c.lowBudget,
   highBudget:c.highBudget,traceLimit:c.traceLimit,
   maxGameSteps:c.maxGameSteps,maxSearchSteps:c.maxSearchSteps,
   jobMinutes:c.jobMinutes,audit:c.audit},
  completedSeeds:rows.length,plannedSeeds:c.runs,comparisons:contrasts,
  errorCount:errors.length,errors,
  complete:rows.length===c.runs&&errors.length===0,
  limitations:[
   "Pilot comparisons are exploratory, not individual-card balance estimates.",
   "First differing action is diagnostic association, not proof of causation.",
   "A trace is censored when its first split lies beyond traceLimit.",
   "Identical starting seeds do not keep later game states matched after divergence."
  ]
 };
 atomic(join(c.out,"summary.json"),result);
 return result;
}
const runMain=async()=>{
 const c=parse(process.argv.slice(2));
 const revision=execFileSync("git",["rev-parse","HEAD"],{
  encoding:"utf8"}).trim();
 if(!existsSync(c.audit))throw Error("Missing passing canonical audit "+c.audit);
 const audit=JSON.parse(readFileSync(c.audit,"utf8"));
 if(audit.commit!==revision||audit.pass!==true||
    !audit.completeFaceCoverage||!audit.allWalksEnded||audit.runs<36)
  throw Error("Must use a passing 36-expedition canonical audit at the SAME commit");
 const manifest={
  schema:1,revision,runs:c.runs,seed:c.seed,lowBudget:c.lowBudget,
  highBudget:c.highBudget,traceLimit:c.traceLimit,
  maxGameSteps:c.maxGameSteps,maxSearchSteps:c.maxSearchSteps,
  jobMinutes:c.jobMinutes,audit:c.audit
 };
 if(c.resume){
  if(!existsSync(c.out))throw Error("Missing output "+c.out);
  if(JSON.stringify(JSON.parse(readFileSync(join(c.out,"manifest.json"))))!==
     JSON.stringify(manifest))
   throw Error("Cannot resume different Git revision, audit or study settings");
 }else{
  if(existsSync(c.out))throw Error("Output already exists "+c.out);
  mkdirSync(join(c.out,"checkpoints"),{recursive:true});
  atomic(join(c.out,"manifest.json"),manifest);
 }
 const done=new Map(),failures=[],folder=join(c.out,"checkpoints");
 for(const file of readdirSync(folder)){
  if(!/^\d{6}\.json$/.test(file))throw Error("Malformed checkpoint "+file);
  const row=JSON.parse(readFileSync(join(folder,file),"utf8"));
  if(!Number.isInteger(row.i)||row.i<0||row.i>=c.runs||
    file!==String(row.i).padStart(6,"0")+".json"||done.has(row.i)||
    !["classic2","classic16","frontier16"].every(
     k=>[0,1].includes(row.agents?.[k]?.won)))
   throw Error("Invalid checkpoint "+file);
  done.set(row.i,row);
 }
 const queue=Array.from({length:c.runs},(_,i)=>i).filter(i=>!done.has(i));
 const pool=Array.from({length:Math.min(c.workers,queue.length)},()=>
  new Worker(new URL(import.meta.url),{workerData:{config:c}}));
 const running=new Map(),deadline=Date.now()+c.hours*3600000;
 let next=0,failed=false,interval=null,watchdog=null;
 try{
  await new Promise((complete,reject)=>{
   const stop=error=>{if(!failed){failed=true;reject(error)}};
   const dispatch=worker=>{
    if(failed||next>=queue.length||Date.now()>=deadline){
     if(!running.size)complete();return;
    }
    const i=queue[next++];
    running.set(worker,{i,started:Date.now()});
    worker.postMessage({type:"job",i});
   };
   interval=setInterval(()=>{
    const x=report(c,revision,done,failures);
    console.error("Completed "+x.completedSeeds+"/"+c.runs+
     " triples; tree p="+x.comparisons["tree-16"].exactMcNemarP+
     "; budget p="+x.comparisons["budget-full"].exactMcNemarP);
   },60000);
   watchdog=setInterval(()=>{
    if(failed)return;
    for(const [w,job] of running)
     if(Date.now()-job.started>c.jobMinutes*60000){
      const e={i:job.i,type:"timeout",limitMinutes:c.jobMinutes};
      failures.push(e);
      atomic(join(c.out,"failure-"+String(job.i).padStart(6,"0")+".json"),e);
      stop(Error("Source "+job.i+" exceeded source time limit"));return;
     }
   },10000);
   if(!pool.length)complete();
   for(const w of pool){
    w.on("message",m=>{
     if(failed)return;
     const job=running.get(w);
     if(!job||m.type!=="done"||m.value?.i!==job.i){
      const e={i:job?.i??m.index,type:"worker",stack:m.stack,repro:m.repro};
      failures.push(e);
      atomic(join(c.out,"failure-"+String(e.i).padStart(6,"0")+".json"),e);
      stop(Error("Source "+e.i+" failed canonical experiment"));return;
     }
     atomic(join(folder,String(job.i).padStart(6,"0")+".json"),m.value);
     done.set(job.i,m.value);
     running.delete(w);dispatch(w);
     if(!running.size&&(next>=queue.length||Date.now()>=deadline))complete();
    });
    w.on("error",stop);
    w.on("exit",code=>{
     if(!failed&&code!==0)stop(Error("Study worker exited "+code));
    });
    dispatch(w);
   }
  });
 }finally{
  if(interval!==null)clearInterval(interval);
  if(watchdog!==null)clearInterval(watchdog);
  await Promise.all(pool.map(w=>w.terminate()));
  console.log(JSON.stringify(report(c,revision,done,failures),null,2));
 }
};
const isEntrypoint=process.argv[1]&&
 import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(!isMainThread&&workerData?.config){
 parentPort.on("message",job=>{
  if(job.type!=="job")return;
  try{parentPort.postMessage({
   type:"done",value:oneDiagnosticSeed(job.i,workerData.config)
  })}
  catch(e){parentPort.postMessage({
   type:"failed",index:job.i,stack:e.stack||String(e),repro:e.repro??null
  })}
 });
}else if(isMainThread&&isEntrypoint){
 runMain().catch(e=>{console.error(e.stack||e);process.exitCode=1});
}
