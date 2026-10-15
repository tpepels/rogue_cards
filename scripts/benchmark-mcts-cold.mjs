#!/usr/bin/env node
/** Benchmark the exact same full canonical MCTS rollouts with/without
 * deferred first-visit edge construction. Any change to the actual
 * UCT result is an error, not a performance improvement.
 *
 * npm run bench:mcts-cold -- --budget 16 --samples 7
 */
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {createDecisionSession,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
const flags=process.argv.slice(2);
function integer(flag,def,min,max){
 const at=flags.indexOf(flag),v=at<0?def:Number(flags[at+1]);
 if(!Number.isInteger(v)||v<min||v>max)
  throw Error("Invalid "+flag);
 return v;
}
const budget=integer("--budget",16,1,256);
const samples=integer("--samples",7,1,50);
const seed=integer("--seed",20261016,1,0xffffffff);
const treeMode=flags.includes("--frontier")?"frontier":"full";
const session=createDecisionSession({seed:3573,heroes:["warrior"]});
const before=JSON.stringify(observeSession(session));
const dice=session.state.rng.snapshot();
const options={budget,seed,knowledge:"fair",treeMode,
 collectCoverage:false,maxSteps:4000};
const times={legacy:[],optimized:[]};
const run=(lazyColdEdges)=>{
 const start=performance.now();
 const result=searchDecision(session,{...options,lazyColdEdges,reuseTraceSlots:lazyColdEdges});
 const elapsed=performance.now()-start;
 assert.equal(result.completed,budget);
 assert.equal(result.incomplete,0);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),dice);
 return {result,elapsed};
};
// Warm JIT before beginning timed samples.
run(false);run(true);
for(let i=0;i<samples;i++){
 // Alternate order to reduce bias from JIT and thermals.
 const modes=i%2===0?[false,true]:[true,false];
 const reports=modes.map(mode=>({mode,...run(mode)}));
 assert.deepEqual(reports[0].result,reports[1].result,
  "Fast first-visit edges MUST preserve identical canonical MCTS");
 for(const report of reports)
  times[report.mode?"optimized":"legacy"].push(report.elapsed);
}
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const legacyMs=median(times.legacy),optimizedMs=median(times.optimized);
console.log(JSON.stringify({
 schema:"canonical-mcts-lazy-cold-edges-v1",
 revision:process.env.GITHUB_SHA??null,
 budget,samples,seed,treeMode,
 legacyMedianMs:Number(legacyMs.toFixed(2)),
 optimizedMedianMs:Number(optimizedMs.toFixed(2)),
 speedup:Number((legacyMs/optimizedMs).toFixed(2)),
 exactCanonicalSearchParity:true,
 optimizations:["lazy-first-visit-edges","pooled-bounded-error-traces"],
 note:"All full terminal trials and chosen root actions are identical. "+
  "Times represent a single canonical MCTS search, not complete balance studies."
},null,2));
