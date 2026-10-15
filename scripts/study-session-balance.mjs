#!/usr/bin/env node
/**
 * LOCAL-ONLY state-matched balance study across independent real expeditions.
 *
 * Each source seed navigates ONE real canonical session, finds an eligible
 * printed decision, and evaluates both alternatives to genuine terminal
 * outcomes using identical chance seeds and MCTS for all later choices.
 * One paired observation per independent starting seed prevents treating
 * many rollouts in a single source state as independent card evidence.
 *
 * Unreached cards remain UNTESTED; no fabricated access or extra Items.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {existsSync,mkdirSync,readdirSync,readFileSync,renameSync,writeFileSync}
 from "node:fs";
import {join,resolve,dirname} from "node:path";
import {execFileSync} from "node:child_process";
import {HEROES,ROOMS,OBJECTS,MONSTERS}
 from "../src/tabletop-data.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction}
 from "../src/session-policy.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {compareSessionActions} from "../src/session-counterfactual.js";
const parties=[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(g=>[h.id,g.id]))];
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const fingerprint=a=>JSON.stringify(Object.keys(a).sort().map(k=>[k,a[k]]));
const cardFocus=["room","item","hero","retained","vault","parley","monster","equipment","effect"];
const theoreticalCoverage=c=>{
 const slots=Object.fromEntries(cardFocus.map((focus,i)=>[
  focus,c.focus==="all"?
   Math.floor(c.runs/cardFocus.length)+(i<c.runs%cardFocus.length?1:0):
   c.focus===focus?c.runs:0
 ]));
 return {
  maxPairedSourceSlotsByFocus:slots,
  minimumForAllRoomCards:ROOMS.length*c.minEligible,
  minimumForAllObjectCards:OBJECTS.length*c.minEligible,
  enoughToCoverEveryRoomEvenInBestCase:
   slots.room>=ROOMS.length*c.minEligible,
  enoughToCoverEveryObjectEvenInBestCase:
   slots.item>=OBJECTS.length*c.minEligible,
  note:"At most one paired contrast per independent source seed. "+
   "A count below the mathematical minimum guarantees at least "+
   "one card cannot reach the per-card eligibility threshold."
 };
};
const classify=(session,actions)=>{
 const phase=session.pendingNested?
  "reaction:"+session.pendingNested.trigger.phase:session.phase;
 const s=session.state;
 const variants=[];
 const push=(focus,key,i,j)=>{
  if(i<0||j<0||i===j)return;
  variants.push({focus,key,indices:[i,j],phase,
   before:actions[i],after:actions[j]});
 };
 const indexed=predicate=>actions.findIndex(predicate);
 if(phase==="room"){
  const first=indexed(a=>a.kind==="room-choice"&&a.index===0),
   second=indexed(a=>a.kind==="room-choice"&&a.index===1);
  push("room","room:"+s.room.id,first,second);
 }
 if(phase==="retained-entry"){
  const a=indexed(x=>x.kind==="return");
  for(let j=0;j<actions.length;j++)
   if(j!==a)push("retained","retained:"+session.returnRoomId,a,j);
 }
 if(phase==="parley")push("parley","parley:"+s.monster?.id,
  indexed(a=>a.kind==="fight"),indexed(a=>a.kind==="parley"));
 if(phase==="vault"||phase==="post-warden"){
  const first=indexed(a=>a.kind==="fight");
  actions.forEach((a,i)=>{
   if(i!==first)push("vault","vault:"+a.kind,first,i);
  });
 }
 if(phase==="corpse"){
  const first=indexed(a=>a.kind==="leave");
  actions.forEach((a,i)=>{
   if(i!==first)push("monster","remains:"+s.monster?.id+":"+a.kind,first,i);
  });
 }
 const cont=indexed(a=>a.kind==="continue"||a.kind==="skip"||
  a.kind==="keep"||a.kind==="pass"||a.kind==="attack");
 actions.forEach((a,i)=>{
  if(a.cardId&&["item-trigger","item","equip","unequip","transfer"].includes(a.kind)){
   const focus=["equip","unequip","transfer"].includes(a.kind)?"equipment":"item";
   push(focus,focus+":"+a.cardId+":"+(a.mode||a.kind),cont,i);
  }
  if(a.kind==="hero-mode"){
   const h=s.heroes[a.heroIndex];
   push("hero","hero:"+h?.card.id+":"+a.mode,cont,i);
  }
  if(a.kind==="effect-option"){
   const reference=indexed(x=>x.kind==="effect-option"&&x!==a);
   if(reference>=0&&i>reference)
    push("effect","effect:"+a.context+":"+a.mode,reference,i);
  }
 });
 return variants;
};
const params=()=>{const vals={},flags=new Set();
 const allowed=new Set(["--runs","--seed","--workers","--hours",
  "--out","--future-budget","--navigate-budget","--max-search-steps",
  "--max-game-steps","--min-eligible","--focus","--audit",
  "--benchmark-runs","--benchmark-minutes","--job-minutes",
  "--repro-index"]);
 for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(key==="--resume"||key==="--dry-run"||key==="--benchmark"){
   if(flags.has(key))throw Error("Duplicate "+key);
   flags.add(key);continue;
  }
  if(!allowed.has(key)||vals[key]!==undefined||
   !process.argv[i+1]||process.argv[i+1].startsWith("--"))
   throw Error("Malformed option "+key);
  vals[key]=process.argv[++i];
 }
 const number=(k,def,min,max)=>{
  const raw=vals[k]??String(def),n=Number(raw);
  if(!/^(0|[1-9]\d*)$/.test(raw)||!Number.isSafeInteger(n)||
   n<min||n>max)throw Error("Invalid "+k);return n;
 };
 const focus=vals["--focus"]||"all";
 if(focus!=="all"&&!cardFocus.includes(focus))
  throw Error("Unknown --focus "+focus);
 return {runs:number("--runs",7200,1,100000),
  seed:number("--seed",20261014,1,0xffffffff),
  workers:number("--workers",Math.min(7,availableParallelism()),1,16),
  hours:number("--hours",10,1,72),
  futureBudget:number("--future-budget",2,1,100000),
  navigateBudget:number("--navigate-budget",2,1,100000),
  maxSearchSteps:number("--max-search-steps",4000,1,100000),
  maxGameSteps:number("--max-game-steps",7000,1,100000),
  minEligible:number("--min-eligible",60,2,100000),
  benchmarkRuns:number("--benchmark-runs",18,1,200),
  benchmarkMinutes:number("--benchmark-minutes",15,1,120),
  jobMinutes:number("--job-minutes",30,1,240),
  reproIndex:vals["--repro-index"]===undefined?null:
   number("--repro-index",0,0,100000),
  focus,auditFile:resolve(vals["--audit"]||
   "results/canonical-audit-01/summary.json"),
  out:resolve(vals["--out"]||"results/session-balance-01"),
  resume:flags.has("--resume"),dryRun:flags.has("--dry-run"),
  benchmark:flags.has("--benchmark")
 };
};
const git=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8"}).trim()}catch{return null}};
const atom=(path,data)=>{const temporary=path+".tmp-"+process.pid;
 writeFileSync(temporary,JSON.stringify(data,null,2)+"\n");
 renameSync(temporary,path);
};
const copySession=s=>({
 ...s,state:forkGameState(s.state),
 history:[], // Not used by printed rules; source traces are recorded separately.
 remainingReturns:[...s.remainingReturns],
 pendingNested:s.pendingNested?{
  ...s.pendingNested,root:{...s.pendingNested.root},
  responses:s.pendingNested.responses.map(a=>({...a})),
  actions:s.pendingNested.actions.map(a=>({...a}))
 }:null
});
function oneJob(i,c){
 const heroes=parties[i%parties.length];
 const gameSeed=mix(c.seed^Math.imul(i+1,0x85ebca6b))||1;
 const targetFocus=c.focus==="all"?cardFocus[i%cardFocus.length]:c.focus;
 const session=createDecisionSession({seed:gameSeed,heroes});
 let step=0,last=null,eligible=0,reservoir=null;
 const policy=createSessionPolicy();
 try{
  for(;step<c.maxGameSteps&&session.phase!=="terminal";step++){
   const actions=sessionActions(session);
   if(!actions.length)throw Error("No legal action at "+session.phase);
   // Reservoir sampling prevents a systematic bias toward the very
   // first UPPER Room or the first Item in a party's starting inventory.
   for(const candidate of classify(session,actions)
    .filter(x=>x.focus===targetFocus)){
    eligible++;
    if(mix(gameSeed^Math.imul(eligible,0x9e3779b9)^
      Math.imul(step+1,0xc2b2ae35))%eligible===0)
     reservoir={decision:copySession(session),candidate,sourceStep:step};
   }
   const chosen=selectSessionPolicyAction(session,policy,{
    knowledge:"fair",budget:c.navigateBudget,
    maxSearchSteps:c.maxSearchSteps,
    seed:mix(gameSeed^Math.imul(step+1,0xc2b2ae35)),
    legalActions:actions
   });
   if(!chosen)throw Error("MCTS produced no navigation action");
   last={step,phase:session.pendingNested?
    "reaction:"+session.pendingNested.trigger.phase:session.phase,
    action:chosen,roomId:session.state.room?.id,
    monsterId:session.state.monster?.id};
   submitDecision(session,chosen,{observeResult:false,recordHistory:false});
  }
  if(session.phase!=="terminal")
   throw Error("Actual source expedition exceeded step limit");
  if(session.state.metrics.roundLimit||session.state.metrics.unresolved)
   throw Error("Actual source expedition unresolved");
  if(!reservoir)
   return {i,heroes,gameSeed,step,focus:targetFocus,kind:"unreached",
    policy:{...policy}};
  const {decision,candidate:selected,sourceStep}=reservoir;
  const paired=compareSessionActions(decision,{
   trials:1,seed:mix(gameSeed^sourceStep^0x29ab),
   actionIndices:selected.indices,futureBudget:c.futureBudget,
   maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
   knowledge:"fair"
  });
  const [before,after]=paired.actions;
  return {i,heroes,gameSeed,step:sourceStep,focus:targetFocus,kind:"paired",
   key:selected.key,phase:selected.phase,choice0:selected.before,
   choice1:selected.after,win0:before.wins,win1:after.wins,
   decisions:before.totalDecisions+after.totalDecisions,
   pairedCycleBreaks:before.totalCycleBreaks+after.totalCycleBreaks,
   policy:{...policy},sourceState:paired.sourceObservation.game};
 }catch(e){
  const error=Error("Seed "+gameSeed+" index "+i+
   " step "+step+" / "+targetFocus+": "+(e.stack||e));
  error.repro={i,gameSeed,heroes,step,focus:targetFocus,
   last,nestedSearch:e.repro??null,policy:{...policy},
   roomId:session.state.room?.id,monsterId:session.state.monster?.id,
   phase:session.pendingNested?
    "reaction:"+session.pendingNested.trigger.phase:session.phase,
   actions:sessionActions(session)};
  throw error;
 }
}
const logFactorials=[0];
function logFactorial(n){while(logFactorials.length<=n){
 const j=logFactorials.length;
 logFactorials.push(logFactorials[j-1]+Math.log(j));
 }return logFactorials[n];}
const mcnemar=(plus,minus)=>{const n=plus+minus;
 if(!n)return 1;
 const k=Math.min(plus,minus),terms=[];
 for(let j=0;j<=k;j++)terms.push(logFactorial(n)-
  logFactorial(j)-logFactorial(n-j)-n*Math.LN2);
 const max=Math.max(...terms);
 return Math.min(1,2*Math.exp(max)*
  terms.reduce((sum,x)=>sum+Math.exp(x-max),0));
};
const interval=(plus,minus,n)=>{
 if(n<2)return null;
 const d=(plus-minus)/n,variance=((plus+minus)-n*d*d)/(n-1);
 const h=1.959963984540054*Math.sqrt(Math.max(0,variance/n));
 return [Math.max(-1,d-h),Math.min(1,d+h)];
};
function summarize(c,completed,failed=[]){
 const rows=[...completed.values()].sort((a,b)=>a.i-b.i),groups=new Map();
 for(const r of rows){
  if(r.kind!=="paired")continue;
  const group=groups.get(r.key)||{
   key:r.key,focus:r.focus,eligible:0,winsFirst:0,winsSecond:0,
   secondOnlyWins:0,firstOnlyWins:0,ties:0,
   exampleSeed:r.gameSeed,sourceParties:{}
  };
  group.eligible++;group.winsFirst+=r.win0;group.winsSecond+=r.win1;
  group.secondOnlyWins+=Number(r.win1>r.win0);
  group.firstOnlyWins+=Number(r.win0>r.win1);
  group.ties+=Number(r.win0===r.win1);
  group.sourceParties[r.heroes.join("+")]=(group.sourceParties[r.heroes.join("+")]||0)+1;
  groups.set(r.key,group);
 }
 const contrasts=[...groups.values()].map(g=>({
  ...g,difference:(g.secondOnlyWins-g.firstOnlyWins)/g.eligible,
  paired95:interval(g.secondOnlyWins,g.firstOnlyWins,g.eligible),
  exactP:mcnemar(g.secondOnlyWins,g.firstOnlyWins),
  sufficientEligible:g.eligible>=c.minEligible
 })).sort((a,b)=>a.exactP-b.exactP||a.key.localeCompare(b.key));
 // Correct across every tested contrast, not merely significant ones.
 let floor=0;
 for(let rank=0;rank<contrasts.length;rank++){
  const row=contrasts[rank];
  floor=Math.max(floor,Math.min(1,row.exactP*(contrasts.length-rank)));
  row.holmP=floor;
  row.significant=row.sufficientEligible&&row.holmP<.05;
 }
 const testedRoomIds=new Set(contrasts.filter(x=>x.key.startsWith("room:"))
  .map(x=>x.key.slice(5)));
 const testedItemIds=new Set(contrasts.filter(x=>
  x.key.startsWith("item:")||x.key.startsWith("equipment:"))
  .map(x=>x.key.split(":")[1]));
 const missing={
  rooms:ROOMS.filter(r=>!testedRoomIds.has(r.id)).map(r=>r.id),
  items:OBJECTS.filter(r=>!testedItemIds.has(r.id)).map(r=>r.id),
  monsterBehaviorCausalContrastsNotImplemented:MONSTERS.map(m=>m.id)
 };
 const pairs=rows.filter(r=>r.kind==="paired").length;
 const partySamples=Object.fromEntries(parties.map(ids=>[ids.join("+"),0]));
 for(const row of rows)partySamples[row.heroes.join("+")]++;
 const analysis={
  schema:"rogue-cards-independent-state-matched-balance-v1",
  theoreticalAllCardCoverage:theoreticalCoverage(c),
  commit:git(),design:{
   runs:c.runs,seed:c.seed,focus:c.focus,knowledge:"fair",
   futureBudget:c.futureBudget,navigateBudget:c.navigateBudget,
   maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
   minEligible:c.minEligible
  },
  completedSourceSeeds:rows.length,
  pairedSourceSeeds:pairs,
  naturallyUnreached:rows.length-pairs,
  sourceEquipmentCycleBreaks:rows.reduce((n,r)=>n+(r.policy?.cycleBreaks||0),0),
  pairedEquipmentCycleBreaks:rows.reduce((n,r)=>n+(r.pairedCycleBreaks||0),0),
  startedPartySamples:partySamples,
  all36PartyCombinationsRepresented:Object.values(partySamples)
   .every(count=>count>0),
  complete:rows.length===c.runs&&failed.length===0,
  errors:failed,contrasts,missing,
  statisticallyDefensibleForAllCards:false,
  limitations:[
   "Only observed legal contrasts are tested; passive Items and Monster behavior have no causal contrast here",
   "No manipulation or artificially early card access is used",
   "Each matched pair comes from a distinct independent initial seed",
   "Future decisions use finite-budget MCTS, not solved optimal play",
   "After twelve consecutive free equipment changes the study policy "+
    "takes the real Continue action without MCTS on a result that would "+
    "unconditionally be discarded. All other choices retain full MCTS. "+
    "Printed game actions remain unchanged.",
   "Nested full-game MCTS rollouts advance via the real Continue action "+
    "after six consecutive reversible equipment moves; the physical rules "+
    "and full root legal-action set remain unchanged",
   "Conditional-on-reach state effects do not measure intrinsic whole-card strength",
   "Holm adjusts over all contrasts actually encountered in this report",
   "Underpowered/unreached contrasts are never labelled balanced",
   "Do not merge across differing Git revisions or search settings"
  ]
 };
 return analysis;
}
const saveReport=(c,done,failed=[])=>{
 const s=summarize(c,done,failed);
 atom(join(c.out,"summary.json"),s);
 const fmt=n=>(100*n).toFixed(2)+"%";
 writeFileSync(join(c.out,"summary.md"),[
  "# Local state-matched canonical MCTS balance audit","",
  "Git revision: "+s.commit,
  "Independent completed source seeds: "+s.completedSourceSeeds+"/"+c.runs,
  "Source states with paired comparison: "+s.pairedSourceSeeds,
  "Hero party setups visited: "+
   Object.values(s.startedPartySamples).filter(n=>n>0).length+"/36",
  "Unreached target focus: "+s.naturallyUnreached,
  "Progression safeguards: source "+s.sourceEquipmentCycleBreaks+
   ", paired "+s.pairedEquipmentCycleBreaks,
  "Failures: "+s.errors.length,
  "Status: "+(s.complete?"complete":"partial / requires resume"),"",
  "| Contrast (second minus first) | Eligible | Difference | Approx. paired 95% | Holm p | Result |",
  "|---|---:|---:|---|---:|---|",
  ...s.contrasts.map(x=>"| "+x.key+" | "+x.eligible+" | "+
   fmt(x.difference)+" | "+(x.paired95?x.paired95.map(fmt).join(" to "):"n/a")+
   " | "+x.holmP.toPrecision(3)+" | "+
   (x.significant?"significant":x.sufficientEligible?"inconclusive":"insufficient")+
   " |"),
  "","## Uncovered printed cards",
  "Rooms: "+(s.missing.rooms.join(", ")||"none"),
  "Items: "+(s.missing.items.join(", ")||"none"),"",
  "## Limits",...s.limitations.map(x=>"- "+x),
  "","This report alone cannot certify all-card balance."
 ].join("\n")+"\n");
 return s;
};

/**
 * Bounded throughput pilot using the EXACT same oneJob() and MCTS budgets
 * as the intended overnight run. Samples strata across starting parties,
 * decision-focus families and game seeds. It never writes study checkpoints
 * or contributes to statistical results.
 *
 * A censored/timed-out pilot MUST NOT turn short-job throughput into a
 * credible completion promise. Estimate is an optimistic extrapolation
 * from completed jobs and a separate 2x planning sensitivity, NOT a CI.
 */
async function runBenchmark(c,revision){
 const sampleCount=Math.min(c.runs,c.benchmarkRuns);
 const sampleIndices=Array.from({length:sampleCount},(_,j)=>{
  // Index modulo 36 selects Hero party, modulo 9 chooses focus.
  // Add multiples of 324 to spread chance seeds without losing strata.
  const blocks=Math.floor(c.runs/324);
  return blocks>0?j+324*Math.floor(j*blocks/sampleCount):j;
 });
 if(new Set(sampleIndices).size!==sampleCount||
  sampleIndices.some(i=>i<0||i>=c.runs))
  throw Error("Internal benchmark indices invalid");
 const begin=Date.now(),minutesCap=c.benchmarkMinutes;
 const workers=Array.from({length:Math.min(c.workers,sampleCount)},()=>
  new Worker(new URL(import.meta.url),{workerData:{config:c}}));
 const completed=[],errors=[],active=new Map();
 let queueAt=0,timedOut=false;
 const collect=(type,m,i)=>errors.push({
  index:i,type,message:m.stack||m.message||String(m),
  repro:m.repro||null
 });
 const benchmarkPath=c.out+"-benchmark.json";
 const timeoutMs=c.benchmarkMinutes*60000;
 let timer=null;
 try{
  await new Promise((resolveDone,rejectDone)=>{
   let settled=false;
   const end=()=>{if(!settled){settled=true;resolveDone();}};
   const fail=error=>{if(!settled){settled=true;rejectDone(error);}};
   const dispatch=worker=>{
    if(settled)return;
    if(queueAt>=sampleIndices.length){
     if(active.size===0)end();
     return;
    }
    const i=sampleIndices[queueAt++];
    active.set(worker,{i,started:Date.now()});
    worker.postMessage({type:"job",i});
   };
   timer=setTimeout(()=>{
    timedOut=true;end();
   },timeoutMs);
   for(const worker of workers){
    worker.on("message",message=>{
     if(settled)return;
     const assigned=active.get(worker);
     if(!assigned){fail(Error("Benchmark unsolicited worker response"));return;}
     if(message.type==="failed"){
      // Collect failures from independent sampled seeds in one pilot.
      // A failed job is never counted as a completed source or throughput.
      collect("engine-failure",message,assigned.i);
      active.delete(worker);
      console.error("Pilot source "+assigned.i+
       " failed ("+errors.length+" engine failures recorded)");
      dispatch(worker);
      return;
     }
     if(message.type!=="done"||message.value.i!==assigned.i){
      fail(Error("Benchmark worker assignment mismatch"));return;
     }
     const elapsedSeconds=(Date.now()-assigned.started)/1000;
     completed.push({...message.value,elapsedSeconds});
     active.delete(worker);
     console.error("Pilot "+completed.length+"/"+sampleCount+
      " completed; "+elapsedSeconds.toFixed(1)+" sec for source "+assigned.i);
     dispatch(worker);
    });
    worker.on("error",error=>{
     collect("worker-error",error,active.get(worker)?.i);
     fail(error);
    });
    worker.on("exit",code=>{
     if(code!==0&&!settled){
      const message=Error("Pilot worker exited "+code);
      collect("worker-exit",message,active.get(worker)?.i);
      fail(message);
     }
    });
    dispatch(worker);
   }
  });
 }finally{
  if(timer!==null)clearTimeout(timer);
  await Promise.all(workers.map(w=>w.terminate()));
  const elapsedSeconds=(Date.now()-begin)/1000;
  const rate=completed.length/Math.max(.001,elapsedSeconds);
  // A pilot with engine failures cannot support a runtime forecast.
  const predictedHours=completed.length>0&&!errors.length?
   c.runs/rate/3600:null;
  const pairedCount=completed.filter(x=>x.kind==="paired").length;
  const focusCoverage=Object.fromEntries(cardFocus.map(f=>[
   f,{completed:completed.filter(x=>x.focus===f).length,
      paired:completed.filter(x=>x.focus===f&&x.kind==="paired").length}
  ]));
  const enough=completed.length>=Math.max(14,c.workers*2)&&
   pairedCount>=Math.max(4,Math.floor(completed.length/4))&&!timedOut;
  const verdict=errors.length?"engine-failure":
   !completed.length?"no-completed-sources":
   timedOut?"time-capped-inconclusive":
   !enough?"pilot-too-small-or-low-pair-coverage":
   predictedHours>c.hours?"too-slow-for-hour-cap":
   predictedHours*2<=c.hours?"plausibly-feasible":"uncertain";
  const report={
   schema:"rogue-cards-balanced-mcts-throughput-pilot-v1",
   gitRevision:revision,fullyMatchingRealWorkload:true,
   theoreticalAllCardCoverage:theoreticalCoverage(c),
   options:{runs:c.runs,seed:c.seed,workers:c.workers,hours:c.hours,
    jobMinutes:c.jobMinutes,
    futureBudget:c.futureBudget,navigateBudget:c.navigateBudget,
    maxGameSteps:c.maxGameSteps,maxSearchSteps:c.maxSearchSteps,
    focus:c.focus},
   pilot:{attempted:sampleCount,completed:completed.length,
    failed:errors.length,
    paired:pairedCount,unreached:completed.length-pairedCount,
    elapsedSeconds,timeoutMinutes:minutesCap,timedOut,
    inFlightTerminatedAtTimeout:timedOut?active.size:0,
    perFocus:focusCoverage,
    perCompletedJobSeconds:completed.map(x=>({
     index:x.i,heroes:x.heroes,focus:x.focus,kind:x.kind,
     elapsedSeconds:x.elapsedSeconds})),
    errors
   },
   estimate:predictedHours===null?null:{
    hoursToCompleteAllPlannedSeeds:predictedHours,
    hoursWithTwiceObservedWorkload:predictedHours*2,
    hoursBudget:c.hours,
    optimism:"Pilot completion rates favor quick seeds, especially when time-capped",
    statisticalConfidenceInterval:false
   },
   verdict,
   notes:[
    "This is actual canonical MCTS work; no simplified substitute.",
    "Benchmark results NEVER enter the balance study, even if complete.",
    "Only completing full real source seeds counts toward throughput.",
    "Independent engine failures are collected across pilot seeds; "+
     "any engine failure invalidates the runtime estimate.",
    "The 2x estimate is a planning sensitivity, NOT a statistical upper bound.",
    "If any workers remain busy at cutoff, throughput extrapolation is biased optimistic.",
    "A 10-hour scheduler cap does not imply all requested seeds will finish.",
    "A single slow source can run beyond the scheduling deadline."
   ]
  };
  mkdirSync(dirname(benchmarkPath),{recursive:true});
  atom(benchmarkPath,report);
  console.log(JSON.stringify({
   reportPath:benchmarkPath,completed:completed.length,
   planned:sampleCount,paired:pairedCount,
   elapsedMinutes:Number((elapsedSeconds/60).toFixed(2)),
   predictedHours:predictedHours===null?null:
    Number(predictedHours.toFixed(2)),
   twiceWorkloadHours:predictedHours===null?null:
    Number((predictedHours*2).toFixed(2)),
   verdict,errors:errors.length
  },null,2));
  if(errors.length)process.exitCode=1;
 }
}

if(!isMainThread){
 parentPort.on("message",msg=>{
  if(msg.type!=="job")return;
  try{parentPort.postMessage({type:"done",value:oneJob(msg.i,workerData.config)})}
  catch(e){parentPort.postMessage({type:"failed",index:msg.i,
   stack:e.stack||String(e),repro:e.repro||null})}
 });
}else{
 const c=params(),revision=git();
 if(!revision)throw Error("Git revision is required for reproducible studies");
 if(c.benchmark&&(c.dryRun||c.resume||c.reproIndex!==null))
  throw Error("--benchmark cannot be combined with --dry-run/--resume/--repro-index");
 if(c.reproIndex!==null&&(c.reproIndex>=c.runs||c.dryRun||c.resume))
  throw Error("--repro-index must refer to a planned independent source and cannot be combined with --dry-run/--resume");
 if(!c.dryRun){
  if(!existsSync(c.auditFile))
   throw Error("Missing canonical audit gate: "+c.auditFile+
    " (run npm run audit:canonical first)");
  const audit=JSON.parse(readFileSync(c.auditFile,"utf8"));
  if(audit.commit!==revision||audit.pass!==true||
    audit.completeFaceCoverage!==true||audit.allWalksEnded!==true||
    audit.runs<36)
   throw Error("Canonical audit must PASS for at least 36 real walks at "+
    "the SAME Git revision before launching balance jobs");
  // A passing enumerated-face audit is insufficient when behavioral
  // regressions still fail. Fail closed before starting costly workers.
  console.error("Preflight: canonical session regression suite");
  execFileSync("npm",["run","test:session"],{
   stdio:"inherit",timeout:240000
  });
  console.error("Preflight: printed deck and handler validation");
  execFileSync("npm",["run","validate:deck"],{
   stdio:"ignore",timeout:120000
  });
 }
 const design={schema:1,revision,
  ...Object.fromEntries(Object.entries(c).filter(([k])=>
   !["out","resume","dryRun","benchmark","benchmarkRuns",
    "benchmarkMinutes","reproIndex","workers","hours"].includes(k)))};
 console.error(JSON.stringify({revision,plannedIndependentSources:c.runs,
  parties:parties.length,workers:c.workers,focus:c.focus,
  hourCap:c.hours,minimumEligible:c.minEligible,
  theoreticalAllCardCoverage:theoreticalCoverage(c),design},null,2));
 if(c.reproIndex!==null){
  // Same oneJob, source seed, Hero party and search budgets as the
  // overnight study; strictly a defect reproducer, not a study sample.
  const path=c.out+"-repro-"+String(c.reproIndex).padStart(6,"0")+".json";
  mkdirSync(dirname(path),{recursive:true});
  try{
   const result=oneJob(c.reproIndex,c);
   atom(path,{revision,index:c.reproIndex,pass:true,result});
   console.log("Canonical source replay succeeded: "+path);
  }catch(error){
   atom(path,{revision,index:c.reproIndex,pass:false,
    message:error.stack||String(error),repro:error.repro||null});
   console.error("Canonical source replay failed: "+path);
   process.exitCode=1;
  }
 }else if(c.benchmark){
  await runBenchmark(c,revision);
 }else if(!c.dryRun){
  const capacity=theoreticalCoverage(c);
  if(c.focus==="all"&&
   (!capacity.enoughToCoverEveryRoomEvenInBestCase||
    !capacity.enoughToCoverEveryObjectEvenInBestCase))
   throw Error("All-card experiment is structurally underpowered: "+
    "only "+capacity.maxPairedSourceSlotsByFocus.room+
    " possible Room pairs and "+capacity.maxPairedSourceSlotsByFocus.item+
    " possible Item pairs, versus the minimum "+
    capacity.minimumForAllRoomCards+" Room / "+
    capacity.minimumForAllObjectCards+
    " Item source pairs. Choose a focused study (--focus room "+
    "or --focus item) or increase runs before spending CPU.");
  if(!c.resume&&existsSync(c.out))throw Error("Output exists: "+c.out);
  if(c.resume&&!existsSync(c.out))throw Error("Missing output: "+c.out);
  if(!c.resume){
   mkdirSync(join(c.out,"checkpoints"),{recursive:true});
   atom(join(c.out,"manifest.json"),design);
  }else{
   const original=JSON.parse(readFileSync(join(c.out,"manifest.json"),"utf8"));
   if(JSON.stringify(original)!==JSON.stringify(design))
    throw Error("Resuming across Git revisions or changed settings is forbidden");
  }
  const done=new Map(),failed=[];
  for(const f of readdirSync(join(c.out,"checkpoints"))){
   if(!/^\d{6}\.json$/.test(f))throw Error("Bad checkpoint "+f);
   const r=JSON.parse(readFileSync(join(c.out,"checkpoints",f),"utf8"));
   if(r.i>=c.runs||r.i<0||done.has(r.i))throw Error("Invalid checkpoint "+f);
   done.set(r.i,r);
  }
  const queue=Array.from({length:c.runs},(_,i)=>i)
   .filter(i=>!done.has(i));
  const workers=Array.from({length:Math.min(c.workers,queue.length)},()=>
   new Worker(new URL(import.meta.url),{workerData:{config:c}}));
  const assigned=new Map(),deadline=Date.now()+c.hours*3600000;
  let watchdog=null;
  let next=0,stopped=false;
  const timer=setInterval(()=>{
   const s=saveReport(c,done,failed);
   console.error("Completed "+s.completedSourceSeeds+"/"+c.runs+
    "; tested contrasts "+s.contrasts.length);
  },60000);
  try{
   await new Promise((complete,reject)=>{
    const dispatch=w=>{
     if(stopped||Date.now()>=deadline||next>=queue.length){
      if(assigned.size===0)complete();
      return;
     }
     const i=queue[next++];assigned.set(w,{i,started:Date.now()});
    w.postMessage({type:"job",i});
    };
    watchdog=setInterval(()=>{
     if(stopped)return;
     const now=Date.now();
     for(const [worker,job] of assigned){
      if(now-job.started<=c.jobMinutes*60000)continue;
      const record={index:job.i,type:"source-timeout",
       message:"Canonical source "+job.i+" exceeded "+c.jobMinutes+
        " minute individual safety cap",elapsedSeconds:(now-job.started)/1000,
       seed:mix(c.seed^Math.imul(job.i+1,0x85ebca6b))||1,
       heroes:parties[job.i%parties.length],
       focus:c.focus==="all"?cardFocus[job.i%cardFocus.length]:c.focus};
      failed.push(record);
      atom(join(c.out,"failure-"+String(job.i).padStart(6,"0")+".json"),record);
      stopped=true;
      reject(Error(record.message));return;
     }
    },10000);
    if(!workers.length)complete();
    for(const w of workers){
     w.on("message",m=>{
      if(stopped)return;
      if(m.type==="failed"){
       const record={index:m.index,stack:m.stack,repro:m.repro};
       failed.push(record);
       atom(join(c.out,"failure-"+String(m.index).padStart(6,"0")+".json"),
        record);
       stopped=true;reject(Error("Canonical engine failure at seed index "+m.index+
        ": "+m.stack));return;
      }
      if(assigned.get(w)?.i!==m.value.i){
       stopped=true;reject(Error("Worker assignment mismatch"));return;
      }
      atom(join(c.out,"checkpoints",
       String(m.value.i).padStart(6,"0")+".json"),m.value);
      done.set(m.value.i,m.value);
      assigned.delete(w);
      dispatch(w);
      if(!assigned.size&&(next>=queue.length||Date.now()>=deadline))
       complete();
     });
     w.on("error",e=>{if(!stopped){stopped=true;reject(e)}});
     w.on("exit",code=>{if(code&&!stopped){
      stopped=true;reject(Error("Worker exited "+code))}});
     dispatch(w);
    }
   });
  }finally{
   clearInterval(timer);
   if(watchdog!==null)clearInterval(watchdog);
   await Promise.all(workers.map(w=>w.terminate()));
   const s=saveReport(c,done,failed);
   console.error("Saved "+s.completedSourceSeeds+"/"+c.runs+
    " independent seeds; errors "+s.errors.length);
  }
 }
}
