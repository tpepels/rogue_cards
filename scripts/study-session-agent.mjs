#!/usr/bin/env node
/**
 * Resumable, multithreaded experiment: every REAL decision of every
 * actual expedition is made by the canonical session + UCT agent.
 *
 * No scripted continuation, no HP proxy and no accepting truncated runs.
 * On failure, checkpoint the successful seeds and exit nonzero.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync,
 readdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {HEROES,ROOMS,MONSTERS,OBJECTS,WARDEN,WARDEN_FURY}
 from "../src/tabletop-data.js";
import {playSessionWithMCTS} from "../src/session-agent.js";
const parties=[
 ...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>[h.id,other.id]))
];
const mix=n=>{n=(n+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);return (n^(n>>>16))>>>0;
};
const argNames=new Set(["--runs","--workers","--hours","--out","--seed",
 "--budget","--knowledge","--max-search-steps","--max-game-steps",
 "--trace-limit"]);
function parse(argv){
 const args={},flags=new Set();
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(["--resume","--dry-run"].includes(k)){
   if(flags.has(k))throw Error("Duplicate "+k);
   flags.add(k);continue;
  }
  if(!argNames.has(k)||args[k]!==undefined||!argv[i+1]||
     argv[i+1].startsWith("--"))
   throw Error("Unknown or malformed argument "+k);
  args[k]=argv[++i];
 }
 const num=(name,def,min,max)=>{
  const value=args[name]??String(def),n=Number(value);
  if(!/^(0|[1-9]\d*)$/.test(value)||!Number.isSafeInteger(n)||
     n<min||n>max)throw Error(name+" must be an integer in ["+min+","+max+"]");
  return n;
 };
 const knowledge=args["--knowledge"]??"fair";
 if(!["fair","oracle"].includes(knowledge))throw Error("Invalid knowledge");
 const c={runs:num("--runs",360,1,100000),
  workers:num("--workers",Math.min(7,availableParallelism()),1,16),
  hours:num("--hours",10,1,72),
  seed:num("--seed",20261014,1,0xffffffff),
  budget:num("--budget",3,1,100000),
  maxSearchSteps:num("--max-search-steps",4000,1,100000),
  maxGameSteps:num("--max-game-steps",7000,1,100000),
  traceLimit:num("--trace-limit",40,0,10000),
  knowledge,out:resolve(args["--out"]||"results/session-mcts-01"),
  resume:flags.has("--resume"),dryRun:flags.has("--dry-run")};
 if(c.resume&&c.dryRun)throw Error("Choose resume OR dry-run");
 c.study={schema:1,runs:c.runs,seed:c.seed,budget:c.budget,
  maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
  traceLimit:c.traceLimit,knowledge,partyRotation:parties};
 c.signature=createHash("sha256").update(JSON.stringify(c.study))
  .digest("hex");
 return c;
}
const git=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8"}).trim()}catch{return null}};
const atomic=(p,data)=>{const tmp=p+".tmp-"+process.pid;
 writeFileSync(tmp,JSON.stringify(data,null,2)+"\n");renameSync(tmp,p);
};
const increment=(o,k,v=1)=>{o[k]=(o[k]||0)+v};
const merge=(a,b)=>{for(const [k,v] of Object.entries(b||{}))
 if(typeof v==="number")increment(a,k,v);return a};
const wilson=(k,n)=>{if(!n)return null;
 const z=1.959963984540054,t=z*z,den=1+t/n,p=k/n,
  mid=(p+t/(2*n))/den,
  half=z*Math.sqrt(p*(1-p)/n+t/(4*n*n))/den;
 return [Math.max(0,mid-half),Math.min(1,mid+half)];
};
function work(job,c){
 const heroes=parties[job.i%parties.length];
 const seed=mix(c.seed^Math.imul(job.i+1,0x85ebca6b))||1;
 const result=playSessionWithMCTS({
  seed,heroes,knowledge:c.knowledge,budget:c.budget,
  maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
  traceLimit:c.traceLimit
 });
 return {i:job.i,seed,heroes,result};
}
function report(c,done){
 const rows=[...done.values()].sort((a,b)=>a.i-b.i);
 const coverage={
  roomChoices:{},roomRollBands:{},itemUses:{},itemOpportunities:{},
  objectAcquisitions:{},objectRollBands:{},monsterVisits:{},
  monsterBehaviorBands:{},availableCardActions:{},chosenCardActions:{},
  chosenCounts:{},decisionCounts:{},choiceCoverage:{}
 };
 const byParty={},wins=rows.filter(r=>r.result.won).length;
 let steps=0,searches=0,forced=0;
 for(const row of rows){
  const result=row.result,m=result.metrics,party=row.heroes.join("+");
  const cell=byParty[party]??={runs:0,wins:0,actions:0,searches:0};
  cell.runs++;cell.wins+=Number(result.won);cell.actions+=result.actions;
  cell.searches+=result.searchedDecisions;
  steps+=result.actions;searches+=result.searchedDecisions;
  forced+=result.forcedDecisions;
  for(const field of Object.keys(coverage)){
   merge(coverage[field],field in result?result[field]:m[field]);
  }
 }
 const missing={
  roomChoices:ROOMS.flatMap(room=>[0,1].filter(i=>
   !coverage.roomChoices[room.id+":"+i]).map(i=>room.id+":"+i)),
  roomsNeverEntered:ROOMS.filter(r=>![0,1].some(i=>
   coverage.roomChoices[r.id+":"+i])).map(r=>r.id),
  itemTypesNeverAcquired:OBJECTS.filter(o=>
   !coverage.objectAcquisitions[o.id]).map(o=>o.id),
  itemTypesNeverUsed:OBJECTS.filter(o=>
   !coverage.itemUses[o.id]&&!coverage.chosenCardActions[o.id+":item-trigger"])
   .map(o=>o.id),
  monsterTypesNeverEncountered:[...MONSTERS,WARDEN,WARDEN_FURY]
   .filter(m=>!coverage.monsterVisits[m.id]).map(m=>m.id)
 };
 return {schema:"canonical-session-mcts-study-v1",
  sourceCommit:git(),design:c.study,plannedRuns:c.runs,
  finishedIndependentSeeds:rows.length,complete:rows.length===c.runs,
  won:wins,winRate:rows.length?wins/rows.length:null,
  winRateWilson95:wilson(wins,rows.length),totalActualDecisions:steps,
  UCTDecisions:searches,forcedDecisions:forced,
  byParty,coverage,missing,
  // These are explicitly observations, not counterfactual card trials.
  validForCausalCardBalance:false,
  completeLegalActionCoverage:false,
  limitations:[
   "Unvisited actions cannot be classified as balanced",
   "Automatic strategy-dependent effects still remain in the rules engine",
   "This is a UCT agent policy study, not a causal card intervention",
   "To evaluate balancing, use matched alternatives from identical real states"
  ]
 };
}
function store(c,done){
 const r=report(c,done);
 atomic(join(c.out,"summary.json"),r);
 const lines=[
  "# Canonical full-expedition MCTS",
  "",r.complete?"Every planned run completed":"PARTIAL - resume required",
  "",`Independent seeded completed expeditions: ${r.finishedIndependentSeeds}/${c.runs}`,
  `Wins: ${r.won} (${r.winRate===null?"n/a":(100*r.winRate).toFixed(2)+"%"})`,
  `Actual decisions: ${r.totalActualDecisions}`,
  `UCT decisions: ${r.UCTDecisions}`,
  `Forced decisions: ${r.forcedDecisions}`,
  "", "## Absent coverage",
  ...Object.entries(r.missing).map(([name,ids])=>
   `- ${name} (${ids.length}): ${ids.slice(0,60).join(", ")||"none"}`),
  "","## Study limits",
  ...r.limitations.map(t=>"- "+t),
  "", "No statistically justified card nerfs or buffs can be inferred",
  "from raw acquisition or selection counts alone."
 ];
 writeFileSync(join(c.out,"summary.md"),lines.join("\n")+"\n");
 atomic(join(c.out,"validation.json"),{
  complete:r.complete,canonicalSessions:true,
  allSelectedActionsFromLegalInterface:true,
  nonterminalExpeditionsAccepted:false,
  completeActionSearchImplemented:false,
  causalBalanceVerdictAvailable:false,
  allRoomOptionsReached:r.missing.roomChoices.length===0
 });
 return r;
}
if(!isMainThread){
 parentPort.on("message",message=>{
  if(message.type!=="run")return;
  try{parentPort.postMessage({type:"done",
   value:work(message.job,workerData.config)})}
  catch(e){parentPort.postMessage({type:"failed",i:message.job.i,
   error:e.stack||String(e)})}
 });
}else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const c=parse(process.argv.slice(2));
 console.error(JSON.stringify({plannedIndependentSeeds:c.runs,
  parties:parties.length,workers:c.workers,hours:c.hours,
  budgetPerActualChoice:c.budget,knowledge:c.knowledge,
  out:c.out,notes:"Each game uses real terminal MCTS at every non-forced decision"},null,2));
 if(!c.dryRun){
  const commit=git();
  if(!commit)throw Error("A Git checkout is required for reproducible studies");
  if(c.resume){
   const prev=JSON.parse(readFileSync(join(c.out,"manifest.json"),"utf8"));
   if(prev.commit!==commit||prev.signature!==c.signature)
    throw Error("Cannot resume across changes to Git source or sampling design");
  }else{
   if(existsSync(c.out))throw Error("Output exists; use --resume or another --out");
   mkdirSync(join(c.out,"checkpoints"),{recursive:true});
   atomic(join(c.out,"manifest.json"),{commit,signature:c.signature,
    design:c.study,node:process.version});
  }
  const done=new Map(),saved=readdirSync(join(c.out,"checkpoints"));
  for(const name of saved){
   if(!/^\d{6}\.json$/.test(name))throw Error("Unexpected checkpoint "+name);
   const value=JSON.parse(readFileSync(join(c.out,"checkpoints",name),"utf8"));
   if(value.signature!==c.signature||value.payload.i>=c.runs)
    throw Error("Invalid checkpoint "+name);
   done.set(value.payload.i,value.payload);
  }
  const queue=Array.from({length:c.runs},(_,i)=>({i}))
   .filter(j=>!done.has(j.i));
  console.error("Resuming "+done.size+"/"+c.runs+" independent game seeds");
  const deadline=Date.now()+c.hours*3600000;
  const workers=Array.from({length:Math.min(c.workers,queue.length)},()=>
   new Worker(new URL(import.meta.url),{workerData:{config:c}}));
  const status=new Map();
  let next=0,finished=false,failure=null;
  const timer=setInterval(()=>{
   store(c,done);
   console.error("Completed "+done.size+"/"+c.runs+" seeds; workers "+status.size);
  },60000);
  try{
   await new Promise((ok,fail)=>{
    function assign(w){
     if(finished||failure)return;
     if(Date.now()>=deadline||next>=queue.length){
      if(status.size===0){finished=true;ok()}
      return;
     }
     const job=queue[next++];status.set(w,job.i);
     w.postMessage({type:"run",job});
    }
    if(!workers.length){finished=true;ok();}
    for(const w of workers){
     w.on("message",message=>{
      if(failure)return;
      if(message.type==="failed"){
       failure=Error("Seed "+message.i+" failed: "+message.error);
       fail(failure);return;
      }
      const {value}=message;
      if(status.get(w)!==value.i){
       failure=Error("Worker result does not match assigned seed");
       fail(failure);return;
      }
      atomic(join(c.out,"checkpoints",String(value.i).padStart(6,"0")+".json"),
       {signature:c.signature,payload:value});
      done.set(value.i,value);status.delete(w);
      if(done.size%5===0)console.error("Finished "+done.size+"/"+c.runs);
      assign(w);
      if(!status.size&&(next>=queue.length||Date.now()>=deadline)){
       finished=true;ok();
      }
     });
     w.on("error",err=>{if(!failure){failure=err;fail(err)}});
     w.on("exit",code=>{if(code&&!finished&&!failure){
      failure=Error("UCT worker exited "+code);fail(failure);
     }});
     assign(w);
    }
   });
  }finally{
   clearInterval(timer);
   await Promise.all(workers.map(w=>w.terminate()));
   const s=store(c,done);
   console.error("Saved "+s.finishedIndependentSeeds+"/"+c.runs+
    " completed independent trials in "+c.out);
  }
 }
}
