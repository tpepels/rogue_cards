#!/usr/bin/env node
/**
 * Controlled laptop A/B comparison of four lossless MCTS speed candidates.
 *
 * All arms run the identical real canonical engine, seed, fair knowledge,
 * legal actions and budget. A different chosen move, tree, dice stream or
 * terminal state is a hard failure, never counted as faster.
 *
 * npm run bench:mcts-four-steps -- --budget 8 --samples 11
 * npm run bench:mcts-four-steps -- --mode expedition --budget 8 --runs 2
 */
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import {createSessionPolicy,selectSessionPolicyAction}
 from "../src/session-policy.js";

const SPEED_ARMS=[
 {id:"baseline",flags:{}},
 {id:"1-replay-switches",flags:{reuseEmptyReplaySwitches:true}},
 {id:"2-frozen-actions",flags:{reuseEdgeActions:true}},
 {id:"3-stream-hash",flags:{streamHistoryHash:true}},
 {id:"4-uct-scratch",flags:{reuseSelectionScratch:true}},
 {id:"all-four",flags:{
  reuseEmptyReplaySwitches:true,reuseEdgeActions:true,
  streamHistoryHash:true,reuseSelectionScratch:true}}
];
const args=process.argv.slice(2);
function option(key,fallback){
 const pos=args.indexOf(key);
 return pos<0?fallback:args[pos+1];
}
function positive(key,fallback,max){
 const raw=option(key,String(fallback)),n=Number(raw);
 if(!/^[1-9]\d*$/.test(String(raw))||!Number.isSafeInteger(n)||n>max)
  throw Error("Invalid "+key);
 return n;
}
const budget=positive("--budget",8,256);
const samples=positive("--samples",11,50);
const runs=positive("--runs",2,12);
const seed=positive("--seed",20261016,0xffffffff);
const mode=option("--mode","search");
if(!["search","expedition"].includes(mode))throw Error("Unknown mode "+mode);
if(args.some((a,i)=>a.startsWith("--")&&
 !["--budget","--samples","--runs","--seed","--mode"].includes(a)))
 throw Error("Unknown benchmark option");
const ns={};
const median=xs=>{
 const sorted=[...xs].sort((a,b)=>a-b);
 return sorted[Math.floor(sorted.length/2)];
};
const fixed=n=>Number(n.toFixed(2));
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
function runSearch(arm,sourceSeed){
 const session=createDecisionSession({seed:sourceSeed,heroes:["warrior"]});
 const prior=JSON.stringify(observeSession(session));
 const rng=session.state.rng.snapshot();
 const started=performance.now();
 const result=searchDecision(session,{
  budget,seed,knowledge:"fair",maxSteps:4000,collectCoverage:false,
  ...arm.flags
 });
 const ms=performance.now()-started;
 assert.equal(result.completed,budget);
 assert.equal(result.incomplete,0);
 assert.equal(JSON.stringify(observeSession(session)),prior);
 assert.equal(session.state.rng.snapshot(),rng);
 return {ms,result};
}
function runExpedition(arm,sourceSeed,heroes){
 const sim=createDecisionSession({seed:sourceSeed,heroes});
 const policy=createSessionPolicy(),actions=[];
 const started=performance.now();
 for(let step=0;step<7000&&sim.phase!=="terminal";step++){
  const legal=sessionActions(sim);
  if(!legal.length)throw Error("No canonical action at "+sim.phase);
  const chosen=selectSessionPolicyAction(sim,policy,{
   budget,seed:mix(sourceSeed^Math.imul(step+1,0xc2b2ae35)),
   knowledge:"fair",maxSearchSteps:4000,legalActions:legal,
   mctsOptimizations:arm.flags
  });
  actions.push(chosen);
  submitDecision(sim,chosen,{observeResult:false,recordHistory:false});
 }
 assert.equal(sim.phase,"terminal","Expedition did not finish");
 assert.ok(!sim.state.metrics.roundLimit&&!sim.state.metrics.unresolved,
  "Incomplete canonical game");
 const ms=performance.now()-started;
 return {ms,result:{
  actions,won:!!sim.state.metrics.won,
  escaped:!!sim.state.metrics.escaped,
  ending:sim.state.endingKind,
  final:observeSession(sim),
  dice:sim.state.rng.snapshot()
 }};
}
if(mode==="search"){
 // One source is intentionally repeated under alternating order so JIT
 // and background CPU effects do not systematically favor a configuration.
 const sourceSeeds=[3573,7292,1842];
 for(const arm of SPEED_ARMS)ns[arm.id]=[];
 // Warm each configuration before timed samples.
 for(const arm of SPEED_ARMS)runSearch(arm,sourceSeeds[0]);
 for(let i=0;i<samples;i++){
  const sourceSeed=sourceSeeds[i%sourceSeeds.length];
  const measured=[];
  const rotated=SPEED_ARMS.slice(i%SPEED_ARMS.length)
   .concat(SPEED_ARMS.slice(0,i%SPEED_ARMS.length));
  for(const arm of rotated){
   const row=runSearch(arm,sourceSeed);
   measured.push({id:arm.id,...row});
   ns[arm.id].push(row.ms);
  }
  const baseline=measured.find(x=>x.id==="baseline").result;
  for(const other of measured)
   assert.deepEqual(other.result,baseline,
    "MCTS result changed with "+other.id+" at source "+sourceSeed);
 }
}else{
 const parties=[["warrior"],["warrior","witch"],["knight"],["rogue","monk"]];
 const arms=[SPEED_ARMS[0],SPEED_ARMS.at(-1)];
 for(const arm of arms)ns[arm.id]=[];
 for(let i=0;i<runs;i++){
  const sourceSeed=mix(seed^Math.imul(i+1,0x85ebca6b))||1;
  const heroes=parties[i%parties.length];
  // Alternate ordering so the optimized arm does not always run second.
  const ordered=i%2===0?arms:[...arms].reverse();
  const measured=ordered.map(arm=>({id:arm.id,
   ...runExpedition(arm,sourceSeed,heroes)}));
  assert.deepEqual(measured[0].result,measured[1].result,
   "Different canonical expedition action stream, dice or ending at seed "+
   sourceSeed+" for "+heroes.join("+"));
  for(const row of measured)ns[row.id].push(row.ms);
  console.error("Verified complete canonical expedition "+(i+1)+"/"+runs);
 }
}
const base=median(ns.baseline);
const variants=Object.fromEntries(Object.entries(ns).map(([id,times])=>
 [id,{medianMs:fixed(median(times)),speedup:fixed(base/median(times)),
  samples:times.length}]));
console.log(JSON.stringify({
 schema:"canonical-mcts-four-speed-steps-v1",
 mode,budget,seed,sourceCount:mode==="search"?samples:runs,
 exactCanonicalParity:true,variants,
 guidance:"Only enable an optimization after repeatable speedups on "+
  "multiple budgets and complete expeditions; search semantics cannot change."
},null,2));
