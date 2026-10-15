#!/usr/bin/env node
/**
 * Independent paired-seed strength evaluation, NOT the historical
 * room-contrast experiment. Both agents play complete, real canonical
 * expeditions starting from the same physical decks/dice seed.
 *
 * The default comparison is OLD cost (2) vs deeper UCT cost (>=16);
 * compare equal budgets separately before claiming better search efficiency.
 * Each source seed contributes exactly ONE paired win observation.
 *
 * npm run oracle:agent-strength -- --runs 360 --workers 7 --hours 10
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

const parties=[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(g=>[h.id,g.id]))];
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const atomic=(p,data)=>{
 const tmp=p+".tmp-"+process.pid;
 writeFileSync(tmp,JSON.stringify(data,null,2)+"\n");
 renameSync(tmp,p);
};
const git=()=>execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8"}).trim();
const parse=()=>{
 const args={},flags=new Set(),allowed=new Set([
  "--runs","--workers","--hours","--seed","--out","--audit",
  "--baseline-budget","--candidate-min-budget",
  "--candidate-visits-per-action","--max-game-steps",
  "--max-search-steps","--job-minutes"]);
 for(let i=2;i<process.argv.length;i++){
  const k=process.argv[i];
  if(k==="--resume"){if(flags.has(k))throw Error("Duplicate --resume");
   flags.add(k);continue;}
  if(!allowed.has(k)||args[k]!==undefined||!process.argv[i+1]||
    process.argv[i+1].startsWith("--"))throw Error("Invalid option "+k);
  args[k]=process.argv[++i];
 }
 const integer=(name,def,min,max)=>{
  const raw=args[name]??String(def),n=Number(raw);
  if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(n)||
    n<min||n>max)throw Error("Invalid "+name);
  return n;
 };
 return {
  runs:integer("--runs",360,1,100000),
  workers:integer("--workers",Math.min(7,availableParallelism()),1,16),
  hours:integer("--hours",10,1,72),
  seed:integer("--seed",20261014,1,0xffffffff),
  baselineBudget:integer("--baseline-budget",2,1,100000),
  candidateMinBudget:integer("--candidate-min-budget",16,2,100000),
  candidateVisitsPerAction:integer("--candidate-visits-per-action",4,1,1000),
  maxGameSteps:integer("--max-game-steps",7000,1,100000),
  maxSearchSteps:integer("--max-search-steps",4000,1,100000),
  jobMinutes:integer("--job-minutes",30,1,240),
  audit:resolve(args["--audit"]??"results/canonical-audit-agent-strength/summary.json"),
  out:resolve(args["--out"]??"results/mcts-agent-strength-01"),
  resume:flags.has("--resume")
 };
};

function playOne({gameSeed,heroes,profile,config:c}){
 const session=createDecisionSession({seed:gameSeed,heroes});
 const policy=createSessionPolicy();
 let decisions=0,searches=0,requestedRollouts=0;
 for(;decisions<c.maxGameSteps&&session.phase!=="terminal";decisions++){
  const legal=sessionActions(session);
  if(!legal.length)throw Error("No canonical action at "+session.phase);
  const forced=forcesEquipmentProgress(session,policy,legal);
  if(legal.length>1&&!forced){
   searches++;
   const budget=profile==="classic"?c.baselineBudget:
    Math.max(c.baselineBudget,c.candidateMinBudget,
     legal.length*c.candidateVisitsPerAction);
   requestedRollouts+=Math.max(budget,legal.length);
  }
  const chosen=selectSessionPolicyAction(session,policy,{
   searchProfile:profile,
   deepMinBudget:c.candidateMinBudget,
   deepVisitsPerAction:c.candidateVisitsPerAction,
   budget:c.baselineBudget,
   knowledge:"fair",maxSearchSteps:c.maxSearchSteps,
   seed:mix(gameSeed^Math.imul(decisions+1,0xc2b2ae35)),
   legalActions:legal
  });
  if(!chosen)throw Error("Canonical MCTS did not select a legal action");
  submitDecision(session,chosen,{observeResult:false,
   recordHistory:false,preserveStateIdentity:false});
 }
 if(session.phase!=="terminal"||session.state.metrics.roundLimit||
    session.state.metrics.unresolved)
  throw Error("Incomplete canonical expedition: "+session.phase+
   ", decisions "+decisions);
 if(!session.state.metrics.won&&!session.state.metrics.escaped&&
    session.state.alive())
  throw Error("Unexplained terminal result");
 return {
  won:Number(!!session.state.metrics.won),
  escaped:Boolean(session.state.metrics.escaped),
  ending:session.state.endingKind,
  decisions,searches,requestedRollouts,
  equipmentCycleBreaks:policy.cycleBreaks,
  completed:true
 };
}
function oneJob(i,c){
 const heroes=parties[i%parties.length];
 const gameSeed=mix(c.seed^Math.imul(i+1,0x85ebca6b))||1;
 try{
  const baseline=playOne({gameSeed,heroes,profile:"classic",config:c});
  const candidate=playOne({gameSeed,heroes,profile:"deep-uct",config:c});
  return {i,gameSeed,heroes,baseline,candidate};
 }catch(e){
  const error=Error("Source "+i+" seed "+gameSeed+": "+(e.stack||e));
  error.repro={i,gameSeed,heroes,continuation:e.repro??null};
  throw error;
 }
}
export const pairedAgentStatistics=records=>{
 const n=records.length;
 let positive=0,negative=0,ties=0,baseWins=0,candWins=0;
 let baseRollouts=0,candRollouts=0;
 for(const row of records){
  const a=row.baseline.won,b=row.candidate.won;
  if(![0,1].includes(a)||![0,1].includes(b))
   throw Error("Invalid paired terminal result");
  baseWins+=a;candWins+=b;
  baseRollouts+=row.baseline.requestedRollouts;
  candRollouts+=row.candidate.requestedRollouts;
  if(b>a)positive++;
  else if(b<a)negative++;
  else ties++;
 }
 const discordant=positive+negative;
 let p=1;
 if(discordant){
  const k=Math.min(positive,negative);
  // Numerically stable exact two-sided conditional McNemar/binomial.
  let term=Math.pow(0.5,discordant),tail=term;
  // Avoid underflow for very large N using log-factorial/LSE.
  if(discordant>900){
   const logFact=[0];
   for(let j=1;j<=discordant;j++)
    logFact[j]=logFact[j-1]+Math.log(j);
   let logMax=-Infinity,logs=[];
   for(let j=0;j<=k;j++){
    const v=logFact[discordant]-logFact[j]-
     logFact[discordant-j]-discordant*Math.LN2;
    logs.push(v);if(v>logMax)logMax=v;
   }
   tail=Math.exp(logMax)*logs.reduce((acc,v)=>
    acc+Math.exp(v-logMax),0);
  }else for(let j=1;j<=k;j++){
   term*= (discordant-j+1)/j;
   tail+=term;
  }
  p=Math.min(1,2*tail);
 }
 const difference=n?(candWins-baseWins)/n:0;
 const variance=n?(positive+negative)/n-difference*difference:0;
 const margin=n?1.95996398454*Math.sqrt(Math.max(0,variance)/n):null;
 return {
  independentPairs:n,
  baselineWins:baseWins,candidateWins:candWins,
  baselineWinRate:n?baseWins/n:null,candidateWinRate:n?candWins/n:null,
  pairedDifference:n?difference:null,
  paired95:n?[Math.max(-1,difference-margin),
   Math.min(1,difference+margin)]:null,
  improvedSeeds:positive,worsenedSeeds:negative,tiedSeeds:ties,
  exactMcNemarP:discordant?p:null,
  baselineRequestedRollouts:baseRollouts,
  candidateRequestedRollouts:candRollouts,
  computationalEffortRatio:baseRollouts?candRollouts/baseRollouts:null,
  minimumPowerGate:n>=100,
  verdict:n<100?"UNDERPOWERED":p<0.05&&positive>negative?
   "EVIDENCE_CANDIDATE_BETTER":p<0.05?
   "EVIDENCE_CANDIDATE_WORSE":"INCONCLUSIVE"
 };
};
const save=(c,revision,completed,errors)=>{
 const stats=pairedAgentStatistics([...completed.values()]);
 const summary={schema:1,revision,
  study:"independent-paired-complete-canonical-agent-strength",
  design:{...c,out:undefined,resume:undefined,workers:undefined,hours:undefined},
  ...stats,errors,complete:completed.size===c.runs&&errors.length===0};
 atomic(join(c.out,"summary.json"),summary);
 return summary;
};
if(!isMainThread&&workerData?.config){
 parentPort.on("message",msg=>{
  if(msg?.type!=="job")return;
  try{parentPort.postMessage({type:"done",value:oneJob(msg.i,workerData.config)})}
  catch(e){parentPort.postMessage({
   type:"failed",index:msg.i,stack:e.stack||String(e),repro:e.repro??null
  })}
 });
}else if(isMainThread&&process.argv[1]&&
 import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const c=parse(),revision=git();
 if(!existsSync(c.audit))throw Error("Missing target canonical audit "+c.audit);
 const audit=JSON.parse(readFileSync(c.audit,"utf8"));
 if(audit.commit!==revision||audit.pass!==true||
    !audit.completeFaceCoverage||!audit.allWalksEnded||audit.runs<36)
  throw Error("A passing 36-walk canonical audit on THIS revision is required");
 const manifest={schema:1,revision,runs:c.runs,seed:c.seed,
  baselineBudget:c.baselineBudget,candidateMinBudget:c.candidateMinBudget,
  candidateVisitsPerAction:c.candidateVisitsPerAction,
  maxGameSteps:c.maxGameSteps,maxSearchSteps:c.maxSearchSteps,
  jobMinutes:c.jobMinutes,audit:c.audit};
 if(c.resume){
  if(!existsSync(c.out))throw Error("Missing study "+c.out);
  if(JSON.stringify(JSON.parse(readFileSync(join(c.out,"manifest.json"))))!==
     JSON.stringify(manifest))
   throw Error("Study revision, policy or budgets differ; refusing resume");
 }else{
  if(existsSync(c.out))throw Error("Study already exists "+c.out);
  mkdirSync(join(c.out,"checkpoints"),{recursive:true});
  atomic(join(c.out,"manifest.json"),manifest);
 }
 const completed=new Map(),errors=[];
 for(const file of readdirSync(join(c.out,"checkpoints"))){
  if(!/^\d{6}\.json$/.test(file))throw Error("Malformed checkpoint "+file);
  const row=JSON.parse(readFileSync(join(c.out,"checkpoints",file),"utf8"));
  if(!Number.isInteger(row.i)||row.i<0||row.i>=c.runs||
     file!==String(row.i).padStart(6,"0")+".json"||
     completed.has(row.i)||
     !row.baseline?.completed||!row.candidate?.completed)
   throw Error("Invalid checkpoint "+file);
  completed.set(row.i,row);
 }
 const queue=Array.from({length:c.runs},(_,i)=>i)
  .filter(i=>!completed.has(i));
 const deadline=Date.now()+c.hours*3600000;
 const pool=Array.from({length:Math.min(c.workers,queue.length)},()=>
  new Worker(new URL(import.meta.url),{workerData:{config:c}}));
 const assigned=new Map();let next=0,failed=false;
 let status=null,watchdog=null;
 try{
  await new Promise((resolveDone,rejectDone)=>{
   const dispatch=w=>{
    if(failed||Date.now()>=deadline||next>=queue.length){
     if(!assigned.size)resolveDone();return;
    }
    const i=queue[next++];assigned.set(w,{i,started:Date.now()});
    w.postMessage({type:"job",i});
   };
   const reject=e=>{if(!failed){failed=true;rejectDone(e)}};
   status=setInterval(()=>{
    const s=save(c,revision,completed,errors);
    console.log("Completed "+s.independentPairs+"/"+c.runs+
     " independent paired expeditions; p="+s.exactMcNemarP);
   },60000);
   watchdog=setInterval(()=>{
    for(const [w,job] of assigned)
     if(Date.now()-job.started>c.jobMinutes*60000){
      const err={index:job.i,type:"timeout",minutes:c.jobMinutes};
      errors.push(err);atomic(join(c.out,"failure-"+job.i+".json"),err);
      reject(Error("Source "+job.i+" exceeded safety time limit"));return;
     }
   },10000);
   if(!pool.length)resolveDone();
   for(const w of pool){
    w.on("message",m=>{
     if(failed)return;
     const job=assigned.get(w);
     if(!job||m.type==="failed"||m.value?.i!==job.i){
      const err={index:job?.i??m.index,type:"worker",
       stack:m.stack||"Mismatched response",repro:m.repro||null};
      errors.push(err);atomic(join(c.out,"failure-"+err.index+".json"),err);
      reject(Error("Canonical paired source failed "+err.index));return;
     }
     atomic(join(c.out,"checkpoints",
      String(job.i).padStart(6,"0")+".json"),m.value);
     completed.set(job.i,m.value);
     assigned.delete(w);dispatch(w);
     if(!assigned.size&&(next>=queue.length||Date.now()>=deadline))
      resolveDone();
    });
    w.on("error",reject);
    w.on("exit",code=>{
     if(code&&!failed)reject(Error("Study worker exited "+code));
    });
    dispatch(w);
   }
  });
 }finally{
  if(status)clearInterval(status);
  if(watchdog)clearInterval(watchdog);
  await Promise.all(pool.map(w=>w.terminate()));
  const s=save(c,revision,completed,errors);
  console.log(JSON.stringify(s,null,2));
 }
}
