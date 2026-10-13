/**
 * Local, FIXED-WEIGHT, paired-seed rollout budget research.
 *
 * Every complete task is an independently checkpointed range of expedition
 * indices for ONE arm/seed/strategy/party. --resume skips completed ranges
 * while preserving initial seeds and exact paired win sequences.
 *
 * Writes each checkpoint atomically; no giant all-or-nothing Worker jobs.
 * All sampled dice are inside the unchanged game agent and are not leaked.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {existsSync,mkdirSync,writeFileSync,readFileSync,renameSync,
 readdirSync,unlinkSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {validateAgentConfig,AGENT_WEIGHTS} from "../src/research-agent.js";
import {expeditionSeed,paired} from "./study-agent.mjs";

const PARTIES=[...HEROES.map(h=>[h.id]),...HEROES.flatMap((h,i)=>
 HEROES.slice(i+1).map(o=>[h.id,o.id]))];
const USE="npm run agent:budgets -- --runs 25 --seeds 71001,72001 "+
 "--budgets 0,8,32 --workers 8 --chunk-size 5 --out results/rollouts-01";
const pct=n=>(100*n).toFixed(2)+"%";
const pp=n=>(100*n).toFixed(2)+" pp";
const sha=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}catch{return null}};
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
function parse(args){
 const values={},flags=new Set(),allowed=new Set(["--runs","--seeds",
  "--budgets","--strategies","--workers","--out","--weights",
  "--rollout-rooms","--combat-actions","--combat-room-depth",
  "--replan-budget","--parties","--party","--chunk-size"]);
 for(let i=0;i<args.length;i++){
  if(["--dry-run","--resume","--allow-expensive","--strict-terminal"].includes(args[i])){
   if(flags.has(args[i]))throw Error("Duplicate flag "+args[i]);
   flags.add(args[i]);continue;
  }
  if(!allowed.has(args[i])||args[i] in values||!args[i+1]||
   args[i+1].startsWith("--"))throw Error("Bad arguments. "+USE);
  values[args[i]]=args[++i];
 }
 if(flags.has("--dry-run")&&flags.has("--resume"))
  throw Error("--dry-run and --resume cannot be combined");
 const integer=(raw,name,max)=>{if(!/^\d+$/.test(String(raw))||
  !Number.isSafeInteger(Number(raw))||Number(raw)>max)
  throw Error("Invalid "+name);return Number(raw)};
 const runs=integer(values["--runs"]??20,"runs",3000);
 if(!runs)throw Error("Runs must exceed zero");
 const seeds=(values["--seeds"]||"71001,72001,73001").split(",")
  .map(x=>integer(x,"seed",0xffffffff));
 if(!seeds.length||new Set(seeds).size!==seeds.length)
  throw Error("Seed batches must be unique");
 const budgets=(values["--budgets"]||"0,8,32,128").split(",")
  .map(x=>integer(x,"budget",128));
 if(!budgets.length||new Set(budgets).size!==budgets.length)
  throw Error("Budgets must be unique");
 const strategies=(values["--strategies"]||"magic,treasure").split(",");
 if(!strategies.length||new Set(strategies).size!==strategies.length||
  strategies.some(x=>!["magic","treasure","survival","seal","negotiation"].includes(x)))
  throw Error("Unknown strategies");
 const group=values["--parties"]||"all";
 if(!["all","solo","duo"].includes(group))throw Error("Bad --parties");
 let partyList=PARTIES.filter(p=>group==="all"||
  (group==="solo"?p.length===1:p.length===2));
 // Single-party probes are essential for CPU-heavy terminal rollouts.
 if(values["--party"]){
  if(values["--parties"])throw Error("Use --party or --parties, not both");
  const ids=values["--party"].split("+");
  const order=HEROES.map(h=>h.id);
  if(ids.length<1||ids.length>2||new Set(ids).size!==ids.length||
     ids.some(id=>!order.includes(id)))
   throw Error("--party expects one Hero or two distinct Heroes");
  const key=ids.sort((a,b)=>order.indexOf(a)-order.indexOf(b)).join("+");
  partyList=PARTIES.filter(p=>p.join("+")===key);
  if(partyList.length!==1)throw Error("Unsupported party "+key);
 }
 const workers=integer(values["--workers"]??
  Math.min(6,Math.max(1,availableParallelism()-1)),"workers",16);
 if(!workers)throw Error("Need at least one worker");
 const rolloutRooms=integer(values["--rollout-rooms"]??2,"rolloutRooms",9);
 const combatActions=integer(values["--combat-actions"]??14,"combatActions",600);
 const combatRoomDepth=integer(values["--combat-room-depth"]??0,"combatRoomDepth",9);
 const replanBudget=integer(values["--replan-budget"]??0,"replanBudget",8);
 const strictTerminal=flags.has("--strict-terminal");
 if(strictTerminal&&(rolloutRooms!==9||combatActions!==600||combatRoomDepth!==9))
  throw Error("--strict-terminal requires --rollout-rooms 9 --combat-actions 600 --combat-room-depth 9");
 const chunkSize=integer(values["--chunk-size"]??10,"chunk-size",3000);
 if(!rolloutRooms||combatActions<4||!chunkSize)
  throw Error("Invalid rollout horizon or chunk size");
 const source=values["--weights"];
 let weights={...AGENT_WEIGHTS};
 if(source){
  const file=JSON.parse(readFileSync(resolve(source),"utf8"));
  weights=file.selected?.fair?.weights||file.weights||file;
 }
 validateAgentConfig({knowledge:"fair",weights,budget:0});
 const arms=["current",...budgets.flatMap(n=>["fair-"+n,"oracle-"+n])];
 const plannedExpeditions=partyList.length*strategies.length*
  seeds.length*runs*arms.length;
 if(plannedExpeditions>2000000)
  throw Error("Oversized study; split seeds into replications");
 // This is a lower-bound effort indicator: per Room there can be two
 // alternatives, and in combat several legal Items per actor.
 const chanceSamplesPerDecision=partyList.length*strategies.length*
  seeds.length*runs*2*budgets.reduce((a,b)=>a+b,0);
 const c={runs,seeds,budgets,strategies,workers,partyList,arms,
  weights,rolloutRooms,combatActions,combatRoomDepth,replanBudget,strictTerminal,chunkSize,
  out:resolve(values["--out"]||"results/rollout-budgets"),
  plannedExpeditions,chanceSamplesPerDecision,
  dryRun:flags.has("--dry-run"),resume:flags.has("--resume"),
  allowExpensive:flags.has("--allow-expensive")};
 // Worker count/out/path/docs do NOT affect simulated outcomes.
 c.signature=hash({
  schema:3,runs,seeds,budgets,strategies,partyList,weights,
  rolloutRooms,combatActions,combatRoomDepth,replanBudget,strictTerminal,chunkSize,
  samplingSeed:0x4a6f792d
 });
 return c;
}
function makeTasks(c){
 const tasks=[];
 for(const arm of c.arms)for(const batchSeed of c.seeds)
  for(const [strategyIndex,strategy] of c.strategies.entries())
   for(const party of c.partyList){
    const partyIndex=PARTIES.findIndex(p=>p.join("+")===party.join("+"));
    for(let start=0;start<c.runs;start+=c.chunkSize){
     const count=Math.min(c.chunkSize,c.runs-start);
     const id=[arm,batchSeed,strategy,party.join("+"),start].join("__");
     tasks.push({id,arm,batchSeed,strategy,strategyIndex,
      party,partyIndex,start,count});
    }
   }
 return tasks;
}
function trialOptions(c,arm){
 if(arm==="current")return {researchPolicy:"planner",plannerRisk:"cautious"};
 return {researchPolicy:"agent",agentConfig:validateAgentConfig({
  knowledge:arm.startsWith("oracle")?"oracle":"fair",
  weights:c.weights,budget:Number(arm.split("-")[1]),
  planning:"rollout",samplingSeed:0x4a6f792d,
  rolloutRooms:c.rolloutRooms,combatActions:c.combatActions,
  combatRoomDepth:c.combatRoomDepth,
  replanBudget:c.replanBudget,strictTerminal:c.strictTerminal
 })};
}
function execute(task,c){
 const options=trialOptions(c,task.arm);
 const bits=Buffer.alloc(Math.ceil(task.count/8));
 const row={arm:task.arm,batchSeed:task.batchSeed,strategy:task.strategy,
  party:task.party.join("+"),start:task.start,n:task.count,wins:0,
  unresolved:0,stalls:0,rolloutRoomDecisions:0,rolloutCombatDecisions:0,
  winBits:null,rolloutAudit:{roomBranches:0,combatBranches:0,
   terminalBranches:0,nonterminalBranches:0,terminalWins:0,
   futureReplannedBranches:0}};
 const started=Date.now();
 for(let offset=0;offset<task.count;offset++){
  const index=task.start+offset;
  const r=simulateFullExpedition({
   seed:expeditionSeed(task.batchSeed,task.partyIndex,
    task.strategyIndex,index),
   heroes:task.party,strategy:task.strategy,...options
  });
  const win=Number(r.won);
  row.wins+=win;
  if(win)bits[offset>>>3]|=1<<(offset&7);
  row.unresolved+=r.unresolved;
  row.stalls+=Number(r.roundLimit);
  row.rolloutRoomDecisions+=(r.plannerDecisions?.rolloutRoomDecisions||0);
  row.rolloutCombatDecisions+=(r.plannerDecisions?.rolloutCombatDecisions||0);
  for(const key of Object.keys(row.rolloutAudit))
   row.rolloutAudit[key]+=r.rolloutAudit?.[key]||0;
  // Report within one task, not only after thousands of games.
  parentPort.postMessage({type:"progress",id:task.id,done:offset+1,
   total:task.count,elapsedMs:Date.now()-started});
 }
 row.winBits=bits.toString("base64");
 if(row.unresolved||row.stalls)
  throw Error("Unresolved/stalled game in "+task.id);
 return row;
}
if(!isMainThread){
 let active=false;
 parentPort.on("message",msg=>{
  if(msg.type!=="run"||active)return;
  active=true;
  try{
   const row=execute(msg.task,workerData.config);
   parentPort.postMessage({type:"result",id:msg.task.id,row});
  }catch(e){
   parentPort.postMessage({type:"error",id:msg.task.id,
    error:e.stack||String(e)});
  }
  active=false;
 });
}
const checkpointPath=(c,t)=>join(c.out,"checkpoints",t.id+".json");
function atomicWrite(path,content){
 const temp=path+".tmp-"+process.pid+"-"+Math.floor(Math.random()*1e9);
 try{writeFileSync(temp,content);renameSync(temp,path)}
 catch(e){if(existsSync(temp))unlinkSync(temp);throw e}
}
function validRow(row,task,c){
 if(!row||row.arm!==task.arm||row.batchSeed!==task.batchSeed||
  row.strategy!==task.strategy||row.party!==task.party.join("+")||
  row.start!==task.start||row.n!==task.count||
  !Number.isInteger(row.wins)||row.wins<0||row.wins>row.n||
  row.stalls!==0||row.unresolved!==0||
  Buffer.from(row.winBits||"","base64").length!==Math.ceil(task.count/8))
  throw Error("Invalid checkpoint data for "+task.id);
}
function loadCheckpoints(c,tasks){
 const complete=new Map(),known=new Set(tasks.map(t=>t.id));
 for(const name of readdirSync(join(c.out,"checkpoints"))){
  if(!name.endsWith(".json"))continue;
  const id=name.slice(0,-5);
  if(!known.has(id))throw Error("Unexpected checkpoint: "+name);
 }
 for(const t of tasks){
  const filename=checkpointPath(c,t);
  if(!existsSync(filename))continue;
  const parsed=JSON.parse(readFileSync(filename,"utf8"));
  if(parsed.signature!==c.signature)throw Error(
   "Checkpoint configuration mismatch: "+filename);
  validRow(parsed.row,t,c);
  complete.set(t.id,parsed.row);
 }
 return complete;
}
function aggregate(c,tasks,completed){
 const group=new Map();
 for(const task of tasks){
  const row=completed.get(task.id);
  if(!row)throw Error("Missing chunk "+task.id);
  const key=[row.arm,row.batchSeed,row.strategy,row.party].join("|");
  let entry=group.get(key);
  if(!entry){
   entry={arm:row.arm,batchSeed:row.batchSeed,strategy:row.strategy,
    party:row.party,n:c.runs,wins:0,unresolved:0,stalls:0,
    rolloutRoomDecisions:0,rolloutCombatDecisions:0,
    winBits:Buffer.alloc(Math.ceil(c.runs/8)),covered:0,
    rolloutAudit:{roomBranches:0,combatBranches:0,terminalBranches:0,
     nonterminalBranches:0,terminalWins:0,futureReplannedBranches:0}};
   group.set(key,entry);
  }
  const bits=Buffer.from(row.winBits,"base64");
  for(let i=0;i<row.n;i++)if(bits[i>>>3]&(1<<(i&7))){
   const k=row.start+i;entry.winBits[k>>>3]|=1<<(k&7);
  }
  entry.covered+=row.n;entry.wins+=row.wins;
  for(const field of ["unresolved","stalls","rolloutRoomDecisions",
   "rolloutCombatDecisions"])entry[field]+=row[field];
  for(const key of Object.keys(entry.rolloutAudit))
   entry.rolloutAudit[key]+=row.rolloutAudit?.[key]||0;
 }
 for(const r of group.values()){
  if(r.covered!==c.runs)throw Error("Incomplete cohort "+r.party);
  const observed=Array.from(r.winBits).reduce((n,byte)=>{
   let b=byte;while(b){n+=b&1;b>>>=1;}return n;
  },0);
  if(observed!==r.wins)throw Error("Merged win sequence mismatch: "+r.party);
  r.winBits=r.winBits.toString("base64");
  delete r.covered;
 }
 return Object.fromEntries(c.arms.map(arm=>{
  const rows=[...group.values()].filter(r=>r.arm===arm);
  const n=rows.reduce((a,r)=>a+r.n,0),
   wins=rows.reduce((a,r)=>a+r.wins,0);
  const rolloutAudit={roomBranches:0,combatBranches:0,terminalBranches:0,
   nonterminalBranches:0,terminalWins:0,futureReplannedBranches:0};
  for(const row of rows)for(const key of Object.keys(rolloutAudit))
   rolloutAudit[key]+=row.rolloutAudit?.[key]||0;
  return [arm,{n,wins,winRate:wins/n,rolloutAudit,rows}];
 }));
}
function render(summary){
 const out=["# Rogue Cards - Checkpointed stochastic rollout budgets","",
  "Git revision: "+summary.commit,
  "All arms share the same frozen weights, initial expedition seeds, and",
  "hypothetical scenario seeds. Actual dice are never revealed in advance.",
  "## Fixed-weight performance by planning budget","",
  "| Arm | Expeditions | Win rate | Delta vs cautious | 95% paired CI |",
  "|---|---:|---:|---:|---|"];
 for(const arm of summary.arms){
  const a=summary.results[arm],contrast=summary.contrasts[arm];
  out.push("| "+arm+" | "+a.n+" | "+pct(a.winRate)+" | "+
   (contrast?pp(contrast.delta):"baseline")+" | "+
   (contrast?contrast.ci95.map(pp).join(" to "):"-")+" |");
 }
 out.push("","## Rollout coverage and terminal completeness","",
  "| Arm | Room branches | Combat branches | Terminal sampled | Incomplete | Future search branches |",
  "|---|---:|---:|---:|---:|---:|");
 for(const arm of summary.arms){
  const totals=summary.results[arm].rolloutAudit;
  out.push("| "+arm+" | "+totals.roomBranches+" | "+
   totals.combatBranches+" | "+totals.terminalBranches+" | "+
   totals.nonterminalBranches+" | "+totals.futureReplannedBranches+" |");
 }
 out.push("","## Oracle information advantage (identical weights/budget)","",
  "| Budget | Oracle − fair | 95% paired CI |",
  "|---|---:|---|");
 for(const b of summary.budgets){
  const x=summary.knowledgeContrasts[b];
  out.push("| "+b+" | "+pp(x.delta)+" | "+
   x.ci95.map(pp).join(" to ")+" |");
 }
 out.push("","## Interpretation","",
  "- Results are held-out wins from the actual game; truncated planner lookahead is scored with a disclosed heuristic.",
  "- Zero budget uses the existing heuristic agent; nonzero budgets use state forks with matching sampled dice.",
  "- Oracle knows hidden remaining deck order, but not any future dice.",
  "- Fair resamples hidden cards from public history, inventory and scouts.",
  "- The Oracle is not guaranteed optimal; larger budgets may still choose worse actions.",
  "- Confidence intervals are approximate, unadjusted for multiple arms.",
  "- The Knight is intentionally a stronger beginner class.","");
 return out.join("\n")+"\n";
}
async function parallel(tasks,c,complete){
 const pending=tasks.filter(t=>!complete.has(t.id));
 const byId=new Map(tasks.map(t=>[t.id,t]));
 const total=tasks.length;
 let finished=complete.size,inFlight=0,next=0;
 const started=Date.now();
 const statuses=new Map();
 process.stderr.write("Resuming "+finished+"/"+total+" completed chunks; "+
  pending.length+" remain.\n");
 if(!pending.length)return;
 const threads=Array.from({length:Math.min(c.workers,pending.length)},()=>
  new Worker(new URL(import.meta.url),{workerData:{config:c}}));
 function stat(){
  const recent=[...statuses.values()].map(x=>
   x.id+" "+x.done+"/"+x.total+" games");
  const rss=Math.round(process.memoryUsage().rss/1048576);
  return "Checkpointed "+finished+"/"+total+" chunks ("+
   [...complete.values()].reduce((n,r)=>n+r.n,0)+
   "/"+c.plannedExpeditions+" expeditions); memory "+rss+" MiB; active: "+
   (recent.join("; ")||"none");
 }
 // This heartbeat is on the parent event loop. Workers are independent
 // threads, so status remains visible even during CPU-intensive rollouts.
 const heartbeat=setInterval(()=>process.stderr.write(stat()+"\n"),15000);
 let stopped=false;
 let rejected=null;
 try{
  await new Promise((yes,no)=>{
   function startNext(worker){
    if(rejected||stopped)return;
    if(next>=pending.length){
     if(inFlight===0)yes();
     return;
    }
    const task=pending[next++];
    inFlight++;
    statuses.set(worker,{id:task.id,done:0,total:task.count});
    process.stderr.write("Started "+task.id+" ("+task.count+" expeditions)\n");
    worker.postMessage({type:"run",task});
   }
   for(const worker of threads){
    worker.on("message",msg=>{
     if(rejected)return;
     if(msg.type==="progress"){
      const status=statuses.get(worker);
      if(status&&status.id===msg.id)status.done=msg.done;
      return;
     }
     if(msg.type==="error"){
      rejected=Error("Study chunk "+msg.id+": "+msg.error);
      no(rejected);return;
     }
     if(msg.type!=="result")return;
     const status=statuses.get(worker),task=byId.get(msg.id);
     if(!task||status?.id!==task.id){
      rejected=Error("Worker result for unknown task "+msg.id);
      no(rejected);return;
     }
     try{
      validRow(msg.row,task,c);
      atomicWrite(checkpointPath(c,task),
       JSON.stringify({signature:c.signature,row:msg.row})+"\n");
      complete.set(task.id,msg.row);
     }catch(e){rejected=e;no(e);return}
     statuses.delete(worker);inFlight--;finished++;
     process.stderr.write("Completed "+finished+"/"+total+": "+task.id+
      " ("+msg.row.n+" expeditions; checkpointed)\n");
     startNext(worker);
     if(finished===total)yes();
    });
    worker.on("error",e=>{if(!rejected){rejected=e;no(e)}});
    worker.on("exit",code=>{
     if(!stopped&&!rejected){
      rejected=Error("Worker exited unexpectedly (code "+code+
       ") before its assigned study chunks completed");
      no(rejected);
     }
    });
    startNext(worker);
   }
  });
 }finally{
  stopped=true;clearInterval(heartbeat);
  await Promise.all(threads.map(t=>t.terminate()));
 }
 process.stderr.write("All chunks checkpointed; elapsed "+
  Math.round((Date.now()-started)/1000)+" seconds.\n");
}
const designConfig=c=>({schema:3,signature:c.signature,
 runs:c.runs,seeds:c.seeds,budgets:c.budgets,strategies:c.strategies,
 weights:c.weights,rolloutRooms:c.rolloutRooms,
 combatActions:c.combatActions,combatRoomDepth:c.combatRoomDepth,
 replanBudget:c.replanBudget,strictTerminal:c.strictTerminal,
 chunkSize:c.chunkSize,partyList:c.partyList.map(p=>p.join("+")),
 samplingSeed:0x4a6f792d});
async function main(){
 let c;try{c=parse(process.argv.slice(2))}
 catch(e){process.stderr.write(e.message+"\n"+USE+"\n");process.exitCode=2;return}
 const tasks=makeTasks(c);
 process.stderr.write("ROLLOUT BUDGET STUDY "+JSON.stringify({
  ...c,partyList:c.partyList.length,chunks:tasks.length
 },null,2)+"\n");
 if(c.dryRun)return;
 if(c.chanceSamplesPerDecision>500000&&!c.allowExpensive)
  throw Error("This study requests "+c.chanceSamplesPerDecision.toLocaleString()+
   " hypothetical samples PER applicable decision across cohorts. "+
   "Reduce --runs, --seeds or --budgets. If this large workload is "+
   "intentional, explicitly pass --allow-expensive.");
 const design=designConfig(c),commit=sha();
 if(c.resume){
  if(!existsSync(c.out))throw Error("No study to resume: "+c.out);
  const existing=JSON.parse(readFileSync(join(c.out,"manifest.json"),"utf8"));
  if(JSON.stringify(existing.study)!==JSON.stringify(design))
   throw Error("Resume parameters differ. Use identical arguments, except --workers and --resume.");
  if(existing.commit!==commit)
   throw Error("Study source Git commit changed. Cannot safely merge simulations from "+
    existing.commit+" with "+commit);
 }else{
  if(existsSync(c.out))throw Error("Output already exists: "+c.out+
   ". Use --resume with the original arguments, or choose a new --out.");
  mkdirSync(join(c.out,"checkpoints"),{recursive:true});
  writeFileSync(join(c.out,"manifest.json"),JSON.stringify({
   study:design,commit,node:process.version},null,2)+"\n");
 }
 const completed=loadCheckpoints(c,tasks);
 await parallel(tasks,c,completed);
 const results=aggregate(c,tasks,completed);
 const contrasts=Object.fromEntries(c.arms.filter(a=>a!=="current")
  .map(arm=>[arm,paired(results.current,results[arm])]));
 const knowledgeContrasts=Object.fromEntries(c.budgets.map(b=>[
  b,paired(results["fair-"+b],results["oracle-"+b])]));
 const summary={schema:"rogue-cards-rollout-budget-study-v1",commit,
  budgets:c.budgets,arms:c.arms,
  settings:{...design,plannedExpeditions:c.plannedExpeditions},
  results,contrasts,knowledgeContrasts};
 atomicWrite(join(c.out,"summary.json"),JSON.stringify(summary,null,2)+"\n");
 atomicWrite(join(c.out,"summary.md"),render(summary));
 atomicWrite(join(c.out,"validation.json"),JSON.stringify({
  pass:true,unresolved:0,stalls:0,checkpoints:completed.size,
  supportsIdenticalSeedPairing:true,usesRealGameActions:true,
  strictTerminalRequested:c.strictTerminal,
  allRolloutBranchesTerminal:Object.values(results).every(x=>x.rolloutAudit.nonterminalBranches===0),
  incompleteRolloutBranches:Object.values(results).reduce(
   (n,x)=>n+x.rolloutAudit.nonterminalBranches,0)},null,2)+"\n");
 process.stderr.write("Study complete: "+join(c.out,"summary.md")+"\n");
}
if(isMainThread&&process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url))await main();
