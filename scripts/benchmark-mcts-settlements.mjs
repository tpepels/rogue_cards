#!/usr/bin/env node
/**
 * Compare original full fork/replay with safely journaled deterministic
 * settlement actions in exact canonical MCTS, with identical search results.
 *
 * npm run bench:mcts-settlements -- --budget 8 --samples 11
 * npm run bench:mcts-settlements -- --mode expedition --budget 8 --runs 2
 */
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,observeSession,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction}
 from "../src/session-policy.js";
import {searchDecision} from "../src/session-mcts.js";
import {ROOMS,MONSTERS,WARDEN,VAULT} from "../src/tabletop-data.js";

const args=process.argv.slice(2);
function arg(name,def){
 const i=args.indexOf(name);
 return i===-1?String(def):args[i+1];
}
function number(name,def,max){
 const raw=arg(name,def),n=Number(raw);
 if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(n)||n>max)
  throw Error("Invalid "+name);
 return n;
}
const mode=arg("--mode","search");
const optimization=arg("--optimization","settlements");
const reference=arg("--reference","canonical");
if(!["canonical","speculative"].includes(reference))
 throw Error("Unknown --reference");
if(!["search","expedition"].includes(mode))throw Error("Unknown --mode");
if(!["settlements","metrics","combined","speculative",
     "speculative-frozen","speculative-lazy",
     "speculative-lazy-frozen","speculative-selective",
     "speculative-selective-deferred","speculative-selective-lazy-deferred",
     "everything"].includes(optimization))
 throw Error("Unknown --optimization");
const budget=number("--budget",8,256),
 samples=number("--samples",11,50),runs=number("--runs",2,12),
 seed=number("--seed",20261016,0xffffffff),
 checkpointEvery=number("--checkpoint-every",32,256);
const profiling=args.includes("--profile");
const distinctSeeds=args.includes("--distinct-seeds");
const names=new Set(["--budget","--samples","--runs","--seed","--mode",
 "--optimization","--checkpoint-every","--reference"]);
const fastOptions={
 settlements:{directSettlements:true},
 metrics:{fastMetricClones:true},
 combined:{directSettlements:true,fastMetricClones:true},
 speculative:{speculativeTransitions:true},
 "speculative-frozen":{speculativeTransitions:true,reuseEdgeActions:true},
 "speculative-lazy":{speculativeTransitions:true,lazyInitialCheckpoint:true},
 "speculative-lazy-frozen":{speculativeTransitions:true,
  lazyInitialCheckpoint:true,reuseEdgeActions:true},
 "speculative-selective":{speculativeTransitions:true,
  canonicalReactionPhases:true},
 "speculative-selective-deferred":{speculativeTransitions:true,
  canonicalReactionPhases:true,deferReactionCheckpoints:true},
 "speculative-selective-lazy-deferred":{speculativeTransitions:true,
  canonicalReactionPhases:true,deferReactionCheckpoints:true,
  lazyInitialCheckpoint:true},
 everything:{
  speculativeTransitions:true,
  directSettlements:true,fastMetricClones:true,
  reuseEmptyReplaySwitches:true,reuseEdgeActions:true,
  streamHistoryHash:true,reuseSelectionScratch:true
 }
}[optimization];
if(fastOptions.speculativeTransitions)fastOptions.checkpointEvery=checkpointEvery;
if(reference==="speculative"&&!optimization.startsWith("speculative-"))
 throw Error("Speculative reference requires a speculative candidate");
const referenceOptions=reference==="speculative"?
 {speculativeTransitions:true,checkpointEvery}:{};
const pairsOfArgs=args.filter(x=>x!=="--profile"&&x!=="--distinct-seeds");
for(let i=0;i<pairsOfArgs.length;i+=2){
 if(!names.has(pairsOfArgs[i])||pairsOfArgs[i+1]===undefined)
  throw Error("Unknown option "+pairsOfArgs[i]);
}
const newProfile=()=>({totals:{},byPhase:{}});
function mergeProfile(target,source){
 if(!source)return;
 for(const [kind,metric] of Object.entries(source.totals)){
  const dest=target.totals[kind]??(target.totals[kind]={count:0,elapsedMs:0});
  dest.count+=metric.count;
  dest.elapsedMs+=metric.elapsedMs;
 }
 for(const [name,metrics] of Object.entries(source.byPhase)){
  const phase=target.byPhase[name]??(target.byPhase[name]={});
  for(const [kind,metric] of Object.entries(metrics)){
   const dest=phase[kind]??(phase[kind]={count:0,elapsedMs:0});
   dest.count+=metric.count;
   dest.elapsedMs+=metric.elapsedMs;
  }
 }
}
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
function source(kind,seed){
 const session=createDecisionSession({seed,heroes:["warrior","witch"]});
 const s=session.state;
 if(kind==="corpse"){
  const pile=s.rooms.UPPER;
  const position=pile.findIndex(r=>r.id==="u-nest");
  assert.ok(position>=0,"Missing physical printed Room");
  s.beginRoom(pile.splice(position,1)[0]);
  s.monster=MONSTERS.find(m=>m.id==="rat");s.monsterHP=0;
  session.phase="corpse";
 }else if(kind==="vault"){
  s.beginRoom(VAULT);session.phase="vault";
 }else if(kind==="post-warden"){
  s.beginRoom(VAULT);s.monster=WARDEN;s.monsterHP=10;
  session.phase="post-warden";
 }else throw Error("Unknown scenario "+kind);
 return session;
}
function search(fast,kind,gameSeed){
 const session=source(kind,gameSeed);
 const before=JSON.stringify(observeSession(session)),rng=session.state.rng.snapshot();
 const t=performance.now();
 const raw=searchDecision(session,{
  budget,seed,knowledge:"oracle",treeMode:"full",
  ...(fast?fastOptions:referenceOptions),profileTransitions:profiling,
  collectCoverage:false,maxSteps:4000
 });
 const timeMs=performance.now()-t;
 const {transitionProfile=null,...result}=raw;
 assert.equal(result.completed,budget);
 assert.equal(result.incomplete,0);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),rng);
 return {timeMs,result,profile:transitionProfile};
}
function expedition(fast,gameSeed,heroes){
 const session=createDecisionSession({seed:gameSeed,heroes});
 const policy=createSessionPolicy(),actions=[];
 const profile=profiling?newProfile():null;
 let eligible=0;
 const t=performance.now();
 for(let i=0;i<7000&&session.phase!=="terminal";i++){
  const legal=sessionActions(session);
  if(!legal.length)throw Error("No legal actions at "+session.phase);
  const chosen=selectSessionPolicyAction(session,policy,{
   budget,knowledge:"fair",
   seed:mix(gameSeed^Math.imul(i+1,0xc2b2ae35)),
   maxSearchSteps:4000,legalActions:legal,
   mctsOptimizations:{
    ...(fast?fastOptions:referenceOptions),
    ...(profiling?{profileTransitions:true}:{})
   },
   onSearchProfile:profiling?x=>mergeProfile(profile,x):null
  });
  if(["corpse","vault","post-warden"].includes(session.phase)&&
   ["leave","fight"].includes(chosen.kind))eligible++;
  actions.push(chosen);
  submitDecision(session,chosen,{observeResult:false,recordHistory:false,
   ...(fast?fastOptions:referenceOptions)});
 }
 assert.equal(session.phase,"terminal","Canonical expedition unresolved");
 assert.ok(!session.state.metrics.roundLimit&&!session.state.metrics.unresolved);
 const timeMs=performance.now()-t;
 return {timeMs,eligible,profile,result:{
  actions,terminal:observeSession(session),
  dice:session.state.rng.snapshot(),
  won:!!session.state.metrics.won,ending:session.state.endingKind
 }};
}
const timings={baseline:[],fast:[]};
const profiles={baseline:newProfile(),fast:newProfile()};
const pairs=[],count=mode==="search"?samples:runs;
for(let i=0;i<count;i++){
 const gameSeed=mode==="search"?
  (distinctSeeds?(mix(seed^Math.imul(i+1,0x85ebca6b))||1):
   [3573,7292,1842][i%3]):
  mix(seed^Math.imul(i+1,0x85ebca6b))||1;
 const kind=["corpse","vault","post-warden"][i%3];
 const heroes=i%2===0?["warrior"]:["warrior","witch"];
 const order=i%2===0?[false,true]:[true,false];
 const measured=order.map(enabled=>({
  enabled,...(mode==="search"?
   search(enabled,kind,gameSeed):
   expedition(enabled,gameSeed,heroes))
 }));
 assert.deepEqual(measured[0].result,measured[1].result,
  "Canonical action, future dice, tree statistics or ending changed "+
   "(source "+gameSeed+")");
 for(const sample of measured){
  const name=sample.enabled?"fast":"baseline";
  timings[name].push(sample.timeMs);
  if(profiling)mergeProfile(profiles[name],sample.profile);
 }
 pairs.push({seed:gameSeed,kind:mode==="search"?kind:null,
  baselineMs:measured.find(x=>!x.enabled).timeMs,
  fastMs:measured.find(x=>x.enabled).timeMs,
  eligibleSettlements:measured.find(x=>x.enabled).eligible??null});
 if(mode==="expedition")
  console.error("Verified canonical expedition "+(i+1)+"/"+runs);
}
// Even-sized samples require the mean of the two middle observations;
 // selecting the upper middle alone misreports two-expedition studies.
const median=xs=>{
 const sorted=[...xs].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:
  (sorted[middle-1]+sorted[middle])/2;
};
const sum=xs=>xs.reduce((total,value)=>total+value,0);
const old=median(timings.baseline),current=median(timings.fast);
const baselineTotal=sum(timings.baseline),optimizedTotal=sum(timings.fast);
const rounded=value=>Number(value.toFixed(2));
console.log(JSON.stringify({
 schema:"canonical-mcts-transaction-benchmark-v2",
 mode,optimization,reference,budget,seed,samples:count,checkpointEvery,
 profiling,distinctSeeds,
 canonicalParity:true,
 baselineMedianMs:rounded(old),
 optimizedMedianMs:rounded(current),
 speedup:rounded(old/current),
 // For paired heterogeneous source games the total elapsed time is more
 // representative of throughput than comparing separately sorted medians.
 baselineTotalMs:rounded(baselineTotal),
 optimizedTotalMs:rounded(optimizedTotal),
 totalSpeedup:rounded(baselineTotal/optimizedTotal),
 pairedFasterCount:pairs.filter(x=>x.fastMs<x.baselineMs).length,
 totalEligibleSettlementDecisions:
  mode==="expedition"?pairs.reduce((n,p)=>n+p.eligibleSettlements,0):null,
 perSeed:pairs,
 ...(profiling?{transitionProfiles:profiles}:{}),
 note:"The fast path remains disabled by default; performance changes are "+
  "not proof of policy strength or individual card balance."
},null,2));
