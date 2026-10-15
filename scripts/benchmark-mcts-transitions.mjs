#!/usr/bin/env node
/**
 * True full-expedition MCTS transition benchmark.
 *
 * The only variant is whether intermediate canonical actions build unused
 * public observations/history. Both variants search exactly the same real
 * game with identical seeds, search budgets and printed rules.
 *
 * This is a microbenchmark of searchDecision, not a substitute for the
 * seven-worker throughput pilot of the independent balance study.
 */
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {createDecisionSession,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";

const argv=process.argv.slice(2);
function param(name,defaultValue,min,max){
 const at=argv.indexOf(name);
 if(at===-1)return defaultValue;
 const value=Number(argv[at+1]);
 if(!Number.isInteger(value)||value<min||value>max)
  throw Error("Invalid "+name);
 return value;
}
const modeIndex=argv.indexOf("--mode");
const mode=modeIndex<0?"transitions":argv[modeIndex+1];
if(!["transitions","legality","hash"].includes(mode))
 throw Error("Invalid --mode: choose transitions, legality or hash");
const budget=param("--budget",3,1,32);
const samples=param("--samples",3,1,20);
const seed=param("--seed",7817,1,0xffffffff);
const session=createDecisionSession({seed:3573,heroes:["warrior"]});
const startingObservation=JSON.stringify(observeSession(session));
const startingDice=session.state.rng.snapshot();
function run(optimized){
 const start=performance.now();
 const result=searchDecision(session,{
  seed,budget,knowledge:"fair",maxSteps:4000,
  strictTerminal:true,collectCoverage:false,
  fastTransitions:mode==="transitions"?optimized:true,
  reuseLegalActions:mode==="legality"?optimized:true,
  fastStateHash:mode==="hash"?optimized:true
 });
 assert.equal(result.incomplete,0);
 assert.equal(JSON.stringify(observeSession(session)),startingObservation);
 assert.equal(session.state.rng.snapshot(),startingDice);
 return {elapsedMs:performance.now()-start,result};
}
// Both modes do genuine complete-expedition MCTS trials, even in warmup.
const warmupOld=run(false),warmupFast=run(true);
assert.deepEqual(warmupOld.result,warmupFast.result);
const baseline=[],optimized=[];
for(let i=0;i<samples;i++){
 // Alternate execution order to reduce systematic thermal/JIT bias.
 const first=i%2===0?false:true;
 const a=run(first),b=run(!first);
 assert.deepEqual(a.result,b.result,
  "The optimized MCTS must return exactly the legacy search result");
 (first?optimized:baseline).push(a.elapsedMs);
 (first?baseline:optimized).push(b.elapsedMs);
}
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const old=median(baseline),fast=median(optimized);
console.log(JSON.stringify({
 schema:mode==="transitions"?"rogue-cards-canonical-mcts-transition-benchmark-v1":
  mode==="legality"?"rogue-cards-canonical-mcts-legality-benchmark-v1":
  "rogue-cards-canonical-mcts-state-hash-benchmark-v1",
 revision:"Run git rev-parse HEAD separately to identify the tested revision",
 mode,budget,samples,seed,identicalCanonicalSearch:true,
 baselineMedianMs:Number(old.toFixed(2)),
 optimizedMedianMs:Number(fast.toFixed(2)),
 speedup:Number((old/fast).toFixed(2)),
 note:"Exact canonical complete-expedition MCTS with identical seeds and identical results; this is not a full multi-worker balance-study throughput estimate."
},null,2));
