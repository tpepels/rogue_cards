#!/usr/bin/env node
/** Compare full-tree and standard UCT frontier search at IDENTICAL MCTS
 * budgets. Search algorithms may legitimately select DIFFERENT actions
 * after re-visiting a root: parity of terminal outcomes is not asserted.
 * Both execute the same printed game and independent chance seeds.
 *
 * npm run bench:mcts-frontier -- --budget 16 --samples 5
 */
import {performance} from "node:perf_hooks";
import {createDecisionSession,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import assert from "node:assert/strict";
const args=process.argv.slice(2);
function number(k,fallback,min,max){
 const i=args.indexOf(k);
 if(i===-1)return fallback;
 const n=Number(args[i+1]);
 if(!Number.isInteger(n)||n<min||n>max)throw Error("Invalid "+k);
 return n;
}
const budget=number("--budget",16,1,256);
const samples=number("--samples",5,1,50);
const seed=number("--seed",20261014,1,0xffffffff);
const session=createDecisionSession({seed:3573,heroes:["warrior"]});
const before=JSON.stringify(observeSession(session));
const dice=session.state.rng.snapshot();
const times={full:[],frontier:[]},nodes={full:[],frontier:[]};
const run=mode=>{
 const start=performance.now();
 const result=searchDecision(session,{
  budget,seed,knowledge:"fair",treeMode:mode,collectCoverage:false,
  maxSteps:4000
 });
 const elapsedMs=performance.now()-start;
 assert.equal(result.completed,budget);
 assert.equal(result.incomplete,0);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),dice);
 return {elapsedMs,result};
};
// Warm both code paths before comparing wall time.
run("full");run("frontier");
for(let i=0;i<samples;i++){
 const modes=i%2===0?["full","frontier"]:["frontier","full"];
 for(const mode of modes){
  const {elapsedMs,result}=run(mode);
  times[mode].push(elapsedMs);nodes[mode].push(result.treeNodes);
 }
}
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const full=median(times.full),frontier=median(times.frontier);
console.log(JSON.stringify({
 schema:"canonical-uct-frontier-benchmark-v1",
 budget,samples,seed,
 fullTreeMedianMs:Number(full.toFixed(2)),
 frontierTreeMedianMs:Number(frontier.toFixed(2)),
 speedup:Number((full/frontier).toFixed(2)),
 fullTreeMedianNodes:median(nodes.full),
 frontierMedianNodes:median(nodes.frontier),
 note:"Both execute actual terminal Rogue Cards expeditions; changing tree "+
  "expansion can change selected actions when a root is revisited. "+
  "Use the paired independent-seed agent study to assess strength."
},null,2));
