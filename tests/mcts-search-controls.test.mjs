import test from "node:test";
import assert from "node:assert/strict";
import {randomSource} from "../src/engine/random.js";
import {MCTS_SEARCH_ARMS,puctPrior,progressivelyWiden,selectPUCT,
 publicActionPriors}
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
test("explicit priors include missing-HP Item and REST decisions",()=>{
 const session={phase:"between-rooms",heroIndex:0,
  state:{heroes:[{hp:3,card:{hp:12}}],room:null}};
 const healing=[
  {id:"rations",action:{kind:"item-trigger",mode:"healing-tool"}},
  {id:"continue",action:{kind:"continue"}},
  {id:"equip",action:{kind:"equip"}}
 ];
 const a=publicActionPriors(session,healing);
 assert.equal(a.nonUniform,true);
 assert.ok(a.weights.get("rations")>a.weights.get("continue"));
 assert.ok(Math.abs([...a.weights.values()].reduce((n,x)=>n+x,0)-1)<1e-12);
 session.state.heroes[0].hp=12;
 const healthy=publicActionPriors(session,healing);
 assert.ok(healthy.weights.get("rations")<healthy.weights.get("continue"));
 session.state.heroes[0].hp=3;
 session.phase="room";
 session.state.room={id:"ex-u-coal-store"};
 const roomOptions=[
  {id:"scavenge",action:{kind:"room-choice",index:0}},
  {id:"rest",action:{kind:"room-choice",index:1}}
 ];
 const rested=publicActionPriors(session,roomOptions);
 assert.ok(rested.weights.get("rest")>rested.weights.get("scavenge"));
});
test("PUCT exploration is tunable and rejects invalid values",()=>{
 const session=createDecisionSession({seed:7281,heroes:["warrior"],
  gameMode:"everything-goes"});
 assert.throws(()=>searchDecision(session,{budget:1,nodePriors:true,puctC:-1}),
  /PUCT exploration/);
 const r=searchDecision(session,{budget:3,seed:1234,strictTerminal:false,
  maxSteps:3000,treeMode:"frontier",nodePriors:true,puctC:0.55});
 assert.equal(r.searchControls.puctC,0.55);
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

test("PW tuning validates k, alpha and ordering",()=>{
 const session=createDecisionSession({seed:7281,heroes:["warrior"],gameMode:"everything-goes"});
 for(const bad of [
  {pwK:0},{pwAlpha:0},{pwAlpha:1.5},{pwOrder:"garbage"},{pwRootFull:"yes"}
 ])assert.throws(()=>searchDecision(session,{budget:2,progressiveWidening:true,...bad}),
  /widening|pwRootFull/);
 const s=searchDecision(session,{budget:5,seed:1234,
  knowledge:"fair",treeMode:"frontier",strictTerminal:false,maxSteps:3000,
  progressiveWidening:true,pwK:3,pwAlpha:0.75,
  pwOrder:"public-prior",pwRootFull:true});
 assert.equal(s.searchControls.pwK,3);
 assert.equal(s.searchControls.pwAlpha,0.75);
 assert.equal(s.searchControls.pwOrder,"public-prior");
 assert.equal(s.searchControls.pwRootFull,true);
 assert.equal(s.searchControls.rootActionsTried,s.rootActionCount);
});
test("PW-only can use public ranking and reconcile changing legal actions",()=>{
 const node={visits:0};
 const ranked=new Map(actions.map((a,i)=>[a.id,(i===19?10:1)/(actions.length+9)]));
 const first=progressivelyWiden(node,actions,randomSource(1),{
  order:"public-prior",priorWeights:ranked,k:2,alpha:0.55});
 assert.equal(first.length,2);
 assert.ok(first.some(a=>a.id==="action-19"));
 const revised=actions.filter(a=>a.id!=="action-19")
  .concat([{id:"brand-new",action:{kind:"pass"},edge:{visits:0,wins:0}}]);
 const active=progressivelyWiden(node,revised,randomSource(2),{
  order:"public-prior",priorWeights:new Map(revised.map(a=>[a.id,1/revised.length]))});
 assert.equal(active.length,2);
 assert.ok(active.every(a=>revised.includes(a)));
 assert.ok(active.every(a=>a.id!=="action-19"));
 assert.ok(node.wideningOrder.includes("brand-new"));
 const legacy=progressivelyWiden({visits:0},actions,randomSource(2),{
  preferredId:"action-17",prioritized:true});
 assert.ok(legacy.some(a=>a.id==="action-17"));
});
