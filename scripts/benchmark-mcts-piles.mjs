#!/usr/bin/env node
/** Profile-backed optimization: copy immutable hidden piles without visiting
 * each printed card during EVERY transactional canonical state fork.
 *
 * Exactly the same seeded search, rollout outcomes, visits and root action
 * must result; old behavior stays default until measured.
 */
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {createDecisionSession,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
const args=process.argv.slice(2);
function number(flag,defaultValue,min,max){
 const i=args.indexOf(flag),n=i===-1?defaultValue:Number(args[i+1]);
 if(!Number.isInteger(n)||n<min||n>max)throw Error("Invalid "+flag);
 return n;
}
const budget=number("--budget",8,1,256),
 samples=number("--samples",11,1,100),
 seed=number("--seed",20261016,1,0xffffffff);
const treeMode=args.includes("--frontier")?"frontier":"full";
const session=createDecisionSession({seed:3573,heroes:["warrior"]});
const before=JSON.stringify(observeSession(session)),dice=session.state.rng.snapshot();
const options={budget,seed,treeMode,knowledge:"fair",maxSteps:4000,
 collectCoverage:false,lazyColdEdges:false,reuseTraceSlots:false};
const timings={legacy:[],pileFast:[]};
const measure=fastPileClones=>{
 const start=performance.now();
 const result=searchDecision(session,{...options,fastPileClones});
 const timeMs=performance.now()-start;
 assert.equal(result.completed,budget);
 assert.equal(result.incomplete,0);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),dice);
 return {result,timeMs};
};
measure(false);measure(true);
for(let i=0;i<samples;i++){
 const modes=i%2===0?[false,true]:[true,false];
 const a=measure(modes[0]),b=measure(modes[1]);
 assert.deepEqual(a.result,b.result,
  "Immutable-pile cloning altered canonical MCTS decisions, visits or wins");
 timings[modes[0]?"pileFast":"legacy"].push(a.timeMs);
 timings[modes[1]?"pileFast":"legacy"].push(b.timeMs);
}
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const old=median(timings.legacy),now=median(timings.pileFast);
console.log(JSON.stringify({
 schema:"canonical-mcts-immutable-pile-fork-v1",
 budget,samples,seed,treeMode,
 legacyMedianMs:Number(old.toFixed(2)),
 pileFastMedianMs:Number(now.toFixed(2)),
 speedup:Number((old/now).toFixed(2)),
 exactCanonicalSearchParity:true,
 note:"Same canonical search and dice; the feature remains opt-in until measured."
},null,2));
