import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {createDecisionRecorder,diffTree,experimentSnapshot}
 from "../src/experiment-telemetry.js";
test("recursive event deltas retain exact changed fields and numeric changes",()=>{
 const before={a:1,b:{x:2,y:3},c:["a"]};
 const after={a:4,b:{x:2,y:1},c:["a","b"]};
 const result=diffTree(before,after);
 assert.deepEqual(result.a,{was:1,now:4,delta:3});
 assert.deepEqual(result.b.y,{was:3,now:1,delta:-2});
 assert.equal(result.b.x,undefined);
 assert.deepEqual(result.c,{was:["a"],now:["a","b"]});
 assert.equal(diffTree(before,before),undefined);
});
test("real roll tracing cannot change RNG, gameplay, or actual action choices",()=>{
 const plain=createDecisionSession({seed:1707,gameMode:"everything-goes"});
 const observed=createDecisionSession({seed:1707,gameMode:"everything-goes"});
 const tape=createDecisionRecorder();
 for(let step=0;step<14;step++){
  const options=sessionActions(plain);
  if(!options.length)break;
  const choice=options.find(a=>a.kind==="continue")||options[0];
  const visible=sessionActions(observed);
  assert.ok(visible.some(a=>JSON.stringify(a)===JSON.stringify(choice)));
  tape.handler({moment:"before",step,phase:observed.phase,session:observed,
   actions:visible,chosen:choice,diagnostic:null,searchMs:0});
  let dice=[];
  submitDecision(observed,choice,{onCommittedDice:draws=>{dice=draws;}});
  submitDecision(plain,choice);
  tape.handler({moment:"after",step,phase:observed.phase,session:observed,
   actions:visible,chosen:choice,diagnostic:null,dice,
   searchMs:0,transitionMs:0});
  assert.deepEqual(observeSession(observed).game,observeSession(plain).game);
  assert.equal(observed.state.rng.snapshot(),plain.state.rng.snapshot());
  assert.deepEqual(observed.state.metrics,plain.state.metrics);
 }
 assert.ok(tape.finish().length>0);
 for(const event of tape.events){
  assert.ok(event.legalCount>=1);
  assert.ok(event.before.heroes[0].id);
  assert.ok(event.after.heroes[0].id);
  assert.equal(event.via,"forced");
  assert.ok(event.dice.every(x=>
   Number.isInteger(x.sides)&&x.sides>=1&&
   x.face>=1&&x.face<=x.sides));
 }
});
test("printed card and resource snapshots include ownership, depth and status",()=>{
 const s=createDecisionSession({seed:23,gameMode:"everything-goes"});
 const sample=experimentSnapshot(s);
 assert.equal(sample.roomGoal,12);
 assert.equal(sample.itemDeck,s.state.deck.length);
 assert.equal(sample.heroes[0].id,"warrior");
 assert.equal(sample.heroes[0].inventory.length,2);
 assert.equal(sample.roomPiles.UPPER,29);
});
test("deep experiment dry-run makes no artifacts and includes matched arms",()=>{
 const p=execFileSync(process.execPath,[
  "scripts/study-everything-goes-deep.mjs","--dry-run",
  "--mode","all","--runs","36","--pairs-per-item","2","--workers","1"
 ],{encoding:"utf8"});
 const result=JSON.parse(p);
 assert.equal(result.design.schema,"everything-goes-deep-study-v1");
 assert.equal(result.plannedGames,36+18*2*2);
 assert.equal(result.design.items.length,18);
 assert.equal(result.design.comparisonItem,"ex-rations");
});
