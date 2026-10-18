import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";

function woundedEquipmentRoot(){
 const s=createDecisionSession({
  seed:1401,heroes:["warrior"],gameMode:"everything-goes"
 });
 const i=s.state.deck.findIndex(x=>x.id==="ex-rations");
 assert.ok(i>=0,"Must have actual printed rations available");
 s.state.heroes[0].inventory.push(s.state.deck.splice(i,1)[0]);
 s.state.heroes[0].hp=2;
 const weaponIndex=s.state.deck.findIndex(x=>x.id==="ex-mace");
 assert.ok(weaponIndex>=0,"Must have a real equippable weapon");
 s.state.heroes[0].inventory.push(s.state.deck.splice(weaponIndex,1)[0]);
 const equip=sessionActions(s).find(a=>a.kind==="equip");
 assert.ok(equip,"Must have a real root equipment action");
 return {s,equip};
}
for(const treeMode of ["full","frontier"]){
 test("Pragmatic shortcuts apply within "+treeMode+" MCTS",()=>{
  const {s,equip}=woundedEquipmentRoot();
  const observation=JSON.stringify(observeSession(s));
  const dice=s.state.rng.snapshot();
  const result=searchDecision(s,{
   budget:2,seed:441,knowledge:"oracle",treeMode,
   rootActions:[equip],simulationPolicy:"solo-pragmatic",
   strictTerminal:true,maxSteps:5000,collectCoverage:true
  });
  const diagnostics=result.pragmaticSimulation;
  assert.equal(result.complete,true);
  assert.equal(result.rootActionCount,1);
  assert.deepEqual(result.recommended,equip);
  assert.ok((diagnostics.rules["safe-heal:ex-rations"]||0)>0,
   "Following the root action, healing must be forced inside MCTS");
  if(treeMode==="full")assert.ok(diagnostics.treeShortcuts>0);
  else assert.ok(diagnostics.rolloutShortcuts>0);
  assert.equal(JSON.stringify(observeSession(s)),observation);
  assert.equal(s.state.rng.snapshot(),dice);
 });
}
test("Pragmatic MCTS simulation rejects a multihero game and invalid modes",()=>{
 const duo=createDecisionSession({seed:2,heroes:["warrior","knight"]});
 assert.throws(()=>searchDecision(duo,{
  budget:1,simulationPolicy:"solo-pragmatic"
 }),/exactly one Hero/);
 assert.throws(()=>searchDecision(duo,{
  budget:1,simulationPolicy:"unknown"
 }),/Unknown MCTS simulation policy/);
});

for(const [variant,mode] of [
 ["external-only","solo-pragmatic-external"],
 ["tree-only","solo-pragmatic-tree"],
 ["rollout-only","solo-pragmatic-rollout"],
 ["both","solo-pragmatic"]
]){
 test("MCTS exposes isolated "+variant+" pragmatic simulation",()=>{
  const {s,equip}=woundedEquipmentRoot();
  const result=searchDecision(s,{
   budget:2,seed:922,knowledge:"oracle",treeMode:"frontier",
   rootActions:[equip],simulationPolicy:mode,
   strictTerminal:true,maxSteps:5000,collectCoverage:false
  });
  const diag=result.pragmaticSimulation;
  assert.equal(result.complete,true);
  assert.equal(result.simulationPolicy,mode);
  assert.equal(result.rootEveryActionTried,true);
  if(variant==="external-only"){
   assert.equal(diag.treeShortcuts,0);
   assert.equal(diag.rolloutShortcuts,0);
   assert.equal(diag.suppressedEquipmentCandidates,0);
   assert.equal(diag.treeSoftOffered,0);
   assert.equal(diag.rolloutSoftOffered,0);
  }
  if(variant==="tree-only"){
   assert.equal(diag.rolloutShortcuts,0);
   assert.equal(diag.rolloutSoftOffered,0);
  }
  if(variant==="rollout-only"){
   assert.equal(diag.treeShortcuts,0);
   assert.equal(diag.treeSoftOffered,0);
  }
 });
}
