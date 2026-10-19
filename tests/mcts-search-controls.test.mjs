import test from "node:test";
import assert from "node:assert/strict";
import {randomSource} from "../src/engine/random.js";
import {MCTS_SEARCH_ARMS,puctPrior,progressivelyWiden,selectPUCT}
 from "../src/mcts-search-controls.js";
import {createDecisionSession,sessionActions,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";

const actions=Array.from({length:20},(_,i)=>({
 id:"action-"+i,action:{kind:"item",cardId:"item-"+i},
 edge:{visits:0,wins:0}
}));
test("four independent selection arms",()=>{
 assert.deepEqual(MCTS_SEARCH_ARMS.map(a=>a.id),
  ["baseline","priors","widening","combined"]);
});
test("PUCT priors are normalized and favor preferred actions",()=>{
 const p=actions.map(c=>puctPrior(c.id,"action-3",20));
 assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12);
 assert.ok(p[3]>p[4]);
 assert.equal(selectPUCT({visits:0},actions,randomSource(1),0.2,
  {preferredId:"action-3",totalLegalActions:20}).id,"action-3");
});
test("widening expands monotonically but never narrows small action sets",()=>{
 const node={visits:0},rng=randomSource(2);
 const a=progressivelyWiden(node,actions,rng);
 assert.equal(a.length,2);
 node.visits=10;
 const b=progressivelyWiden(node,actions,rng);
 assert.ok(b.length>a.length);
 for(const item of a)assert.ok(b.includes(item));
 node.visits=100000;
 assert.equal(progressivelyWiden(node,actions,rng).length,20);
 assert.equal(progressivelyWiden({visits:0},actions.slice(0,3),rng).length,3);
});
test("widening can prioritize the printed-rule soft preference",()=>{
 const a=progressivelyWiden({visits:0},actions,randomSource(5),{
  preferredId:"action-17",prioritized:true
 });
 assert.ok(a.some(c=>c.id==="action-17"));
});
test("real MCTS decisions remain legal and actual state stays untouched",()=>{
 const session=createDecisionSession({seed:7281,heroes:["warrior"],
  gameMode:"everything-goes"});
 const before=JSON.stringify(observeSession(session)),rng=session.state.rng.snapshot();
 const legal=sessionActions(session);
 for(const arm of MCTS_SEARCH_ARMS){
  const result=searchDecision(session,{budget:3,seed:1234,
   knowledge:"fair",treeMode:"frontier",strictTerminal:false,
   maxSteps:3000,nodePriors:arm.nodePriors,
   progressiveWidening:arm.progressiveWidening});
  assert.ok(legal.some(a=>JSON.stringify(a)===
   JSON.stringify(result.recommended)),arm.id);
  assert.equal(JSON.stringify(observeSession(session)),before,arm.id);
  assert.equal(session.state.rng.snapshot(),rng,arm.id);
 }
});
