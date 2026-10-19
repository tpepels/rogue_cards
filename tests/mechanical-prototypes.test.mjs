import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mechanicalPrototypes,mechanicalFamily}
 from "../src/staging/mechanical-prototypes.js";
import {compileStaging,canonicalStagingCatalogue}
 from "../src/staging/catalogue.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {legalActions} from "../src/engine/index.js";
import {drawStagedPatrol,resolveStagedNegotiation,resolveStagedMorale,
 resolveStagedRetreat,resolveStagedWardenTactic,moraleAvailable}
 from "../src/engine/staged-mechanics.js";
import {beginWarden} from "../src/engine/vault-encounter.js";
import {settleMonsterVictory} from "../src/engine/combat-outcomes.js";
import {playFullSoloExpedition}
 from "../scripts/study-solo-expedition-balance.mjs";

const variants=mechanicalPrototypes();
const byName=Object.fromEntries(variants.map(spec=>[spec.id,compileStaging(spec)]));
const canonical=canonicalStagingCatalogue();
const state=(id,seed=13)=>{
 const s=new ExpeditionState({seed,heroes:["warrior"],gameMode:"everything-goes",
  cardPools:byName[id]});
 s.beginRoom(s.cardPools.rooms.find(x=>x.id==="ex-u-slick-passage"));
 return s;
};
function monster(s,id="rat"){
 const card=s.cardPools.monsters.find(x=>x.id===id);
 s.monster=card;s.monsterHP=card.hp;
 s._moraleOffered=false;
 return card;
}
function sessionIn(id,phase,seed=13){
 const session=createDecisionSession({seed,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:byName[id]});
 const s=session.state;
 s.beginRoom(s.cardPools.rooms.find(x=>x.id==="ex-u-slick-passage"));
 if(phase==="vault"){
  s.beginRoom(s.cardPools.vault);
  beginWarden(s);
  session.phase="combat";session.heroIndex=0;
 }else{
  monster(s);
  session.phase=phase;
  session.heroIndex=0;
 }
 return session;
}
test("32 preregistered prototypes have unique names and valid immutable rule sets",()=>{
 assert.equal(variants.length,32);
 assert.equal(Object.keys(byName).length,32);
 const families=new Set(variants.map(x=>mechanicalFamily(x.id)));
 for(const category of ["patrol","diplomacy","retreat","morale",
  "rewards","warden","combinations"])
  assert.ok(families.has(category),category);
 assert.equal(canonical.monsters.find(x=>x.id==="rat").hp,6);
 for(const pool of Object.values(byName)){
  assert.equal(pool._stagingCatalogue,true);
  assert.ok(Object.isFrozen(pool.mechanics));
  assert.equal(pool.monsters.find(x=>x.id==="rat").hp,6);
  assert.equal(pool.warden.hp,20);
 }
});
test("Invalid mechanical rule options are rejected without changing canonical",()=>{
 for(const mechanic of [
  {patrolEvery:1},{morale:"always"},{retreat:"free"},
  {wardenTactic:"one-hit-win"},{unexpected:"hack"}
 ]){
  assert.throws(()=>compileStaging({
   schema:"rogue-cards-staging-v1",id:"invalid-mechanic",
   mechanics:mechanic}),Error);
 }
});
test("Parley mechanisms expose distinct, legal alternatives",()=>{
 for(const [id,kind] of [
  ["negotiate-wit","negotiate"],
  ["negotiate-bribe","bribe"],
  ["negotiate-choice","negotiate"]
 ]){
  const session=sessionIn(id,"parley");
  if(kind==="bribe")session.state.draw();
  const actions=sessionActions(session);
  assert.ok(actions.some(x=>x.kind===kind),id);
  assert.ok(actions.some(x=>x.kind==="fight"),id);
  assert.ok(actions.some(x=>x.kind==="parley"),id);
 }
 const a=sessionIn("negotiate-bribe","parley");
 a.state.draw();
 const before=a.state.heroes[0].inventory.length;
 submitDecision(a,sessionActions(a).find(x=>x.kind==="bribe"),{
  recordHistory:false,observeResult:false});
 assert.equal(a.state.metrics.mechanicChoices["parley:bribe"],1);
 assert.equal(a.state.metrics.mechanicSuccesses["parley:bribe"],1);
 assert.equal(a.state.heroes[0].inventory.length,before-1);
 assert.equal(a.state.monster,null);
});
test("Optional mid-combat escape costs an Item or permits risky WIT check",()=>{
 const a=sessionIn("retreat-tribute","combat");
 a.state.draw();
 assert.ok(sessionActions(a).some(x=>x.kind==="retreat-item"));
 submitDecision(a,sessionActions(a).find(x=>x.kind==="retreat-item"),{
  observeResult:false,recordHistory:false});
 assert.equal(a.state.monster,null);
 assert.equal(a.state.metrics.mechanicSuccesses["retreat-item"],1);
 const b=sessionIn("retreat-wit","combat");
 assert.ok(sessionActions(b).some(x=>x.kind==="retreat-wit"));
});
test("Surrender at half HP is an actual decision phase rather than free death",()=>{
 const a=sessionIn("morale-half","combat");
 const s=a.state;
 s.monsterHP=Math.floor(s.monster.hp/2);
 assert.equal(moraleAvailable(s),true);
 // Exactly the same afterAttack transition would offer the boundary.
 s._moraleOffered=true;a.phase="mercy";
 const allowed=sessionActions(a);
 assert.deepEqual(allowed.map(x=>x.kind),["spare","press"]);
 submitDecision(a,allowed[0],{observeResult:false,recordHistory:false});
 assert.equal(s.monster,null);
 assert.equal(s.metrics.mechanicSuccesses["surrender:spare"],1);
 assert.equal(s.metrics.kills,0);
 assert.equal(canonical.monsters.find(x=>x.id==="rat").hp,6);
});
test("Staged kills reward resource decisions only for ordinary nonbanished kills",()=>{
 const s=state("kill-loot");
 monster(s);
 const before=s.metrics.drawn;
 s.monsterHP=0;
 settleMonsterVictory(s,s.monster);
 assert.equal(s.metrics.mechanicChoices["kill-reward:draw"],1);
 assert.ok(s.metrics.drawn>before);
 const t=state("kill-recover");
 monster(t);
 t.heroes[0].hp=Math.max(1,t.heroes[0].hp-4);
 const previous=t.heroes[0].hp;
 t.monsterHP=0;
 settleMonsterVictory(t,t.monster);
 assert.ok(t.heroes[0].hp>=previous);
});
test("Warden counterplay is legal only at actual Warden combat boundaries",()=>{
 for(const [variant,kind] of [
  ["warden-brace","warden-brace"],
  ["warden-interrupt","warden-interrupt"],
  ["warden-breach","warden-breach"]
 ]){
  const a=sessionIn(variant,"vault");
  if(kind==="warden-interrupt")a.state.draw();
  const legal=sessionActions(a);
  assert.ok(legal.some(x=>x.kind===kind),variant);
  const selected=legal.find(x=>x.kind===kind);
  const before=a.state.monsterHP;
  submitDecision(a,selected,{recordHistory:false,observeResult:false});
  assert.equal(a.state.metrics.mechanicChoices[kind],1);
  if(kind==="warden-brace")assert.equal(a.state.monsterDis,true);
  if(kind==="warden-interrupt")assert.ok(a.state.monsterSkip>=1);
  if(kind==="warden-breach")assert.ok(a.state.monsterHP<=before);
 }
 const ordinary=sessionIn("warden-brace","combat");
 assert.ok(!sessionActions(ordinary).some(x=>x.kind.startsWith("warden-")));
});
test("A full real expedition with a complex prototype completes at small policy budget",{
 timeout:120000
},()=>{
 const r=playFullSoloExpedition({
  hero:"warrior",seed:11823,arm:"implicit",budget:2,c:0.2,alpha:0.5,
  heuristicMode:"solo-threat",equipmentMode:"solo-pragmatic",
  mctsPragmaticVariant:"tree-only",recordTelemetry:false,
  cardPools:byName["dungeon-adventure"]});
 assert.equal(r.stagingId,"dungeon-adventure");
 assert.ok(r.roomsCleared>=0);
 assert.ok(r.finalMetrics.mechanicChoices);
});
test("Suite parsing and multi-variant dry-run preserve separate result identity",()=>{
 const run=spawnSync(process.execPath,[
  new URL("../scripts/study-balance-hypotheses.mjs",import.meta.url).pathname,
  "--dry-run","--suite","mechanics","--variant-limit","32",
  "--finalists","8","--screen-repeats","3","--confirm-repeats","4"
 ],{encoding:"utf8"});
 assert.equal(run.status,0,run.stderr);
 const manifest=JSON.parse(run.stdout);
 assert.equal(manifest.hypotheses.length,32);
 assert.equal(manifest.screenTrials,33*8*3);
 assert.equal(manifest.confirmTrials,9*8*4);
 assert.equal(manifest.physicallyCanonicalCardsChanged,false);
});
