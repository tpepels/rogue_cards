#!/usr/bin/env node
/**
 * Isolated canonical ExpeditionState fork microbenchmark. Reconstructs
 * the same dice, physical items and unchanged public observation with
 * both cloning implementations. Never substitutes a game simulation.
 */
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {createDecisionSession,observeSession}
 from "../src/engine/decision-session.js";
import {forkGameState} from "../src/engine/fork-state.js";

const args=process.argv.slice(2);
const get=(flag,fallback,max)=>{
 const at=args.indexOf(flag);
 if(at===-1)return fallback;
 const n=Number(args[at+1]);
 if(!Number.isInteger(n)||n<1||n>max)
  throw Error("Invalid "+flag);
 return n;
};
const iterations=get("--iterations",1000,100000);
const samples=get("--samples",5,30);
const session=createDecisionSession({seed:8391,heroes:["warrior","witch"]});
const observed=JSON.stringify(observeSession(session));
const rng=session.state.rng.snapshot();
const baseline=[],fast=[];
function run(optimized){
 const start=performance.now();
 for(let i=0;i<iterations;i++){
  const fork=forkGameState(session.state,{fastCardPiles:optimized});
  assert.equal(fork.rng.snapshot(),rng);
  assert.strictEqual(fork.deck[0],session.state.deck[0]);
  assert.notStrictEqual(fork.deck,session.state.deck);
  for(const stage of ["UPPER","MIDDLE","DEEP"]){
   assert.notStrictEqual(fork.rooms[stage],session.state.rooms[stage]);
   assert.notStrictEqual(fork.monsters[stage],session.state.monsters[stage]);
  }
  const h=fork.heroes[0];
  for(const item of Object.values(h.slots))
   if(item)assert.ok(h.inventory.includes(item));
 }
 assert.equal(JSON.stringify(observeSession(session)),observed);
 return performance.now()-start;
}
run(false);run(true);
for(let i=0;i<samples;i++){
 const first=i%2===0;
 const a=run(first),b=run(!first);
 (first?fast:baseline).push(a);
 (first?baseline:fast).push(b);
}
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const old=median(baseline),newMs=median(fast);
console.log(JSON.stringify({
 schema:"canonical-immutable-piles-fork-benchmark-v1",
 iterations,samples,equivalentImmutableCardIdentity:true,
 legacyMedianMs:Number(old.toFixed(2)),
 optimizedMedianMs:Number(newMs.toFixed(2)),
 speedup:Number((old/newMs).toFixed(2)),
 note:"Copies genuine ExpeditionState. Not an estimated full MCTS throughput multiplier."
},null,2));
