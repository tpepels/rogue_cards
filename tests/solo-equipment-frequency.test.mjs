import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction,
 usefulSoloEquipmentAction} from "../src/session-policy.js";
import {auditMonsterFrequency} from "../scripts/audit-monster-frequency.mjs";

const take=(s,id)=>{
 const i=s.state.deck.findIndex(c=>c.id===id);
 assert.ok(i>=0,"Expected a physical "+id+" in the Item deck");
 const [card]=s.state.deck.splice(i,1);
 s.state.heroes[0].inventory.push(card);
 return card;
};
test("Exact solo weapon upgrade is reversible and doesn't change hidden game state",()=>{
 const s=createDecisionSession({
  seed:1401,heroes:["warrior"],gameMode:"everything-goes"
 });
 const h=s.state.heroes[0];
 const current=take(s,"ex-dagger");
 const stronger=take(s,"ex-mace");
 h.slots.weapon=current;
 const beforeHP=h.hp,beforeRng=s.state.rng?.state;
 const legal=sessionActions(s);
 const choice=usefulSoloEquipmentAction(s,legal);
 assert.equal(choice?.kind,"equip");
 assert.ok(["sword","ex-mace"].includes(choice?.cardId),
  "Both are +2 ATK weapons, so either is a valid canonical upgrade");
 assert.equal(h.slots.weapon,current,"Pure analysis must not equip a card");
 assert.equal(h.hp,beforeHP);
 assert.equal(s.state.rng?.state,beforeRng);
 const p=createSessionPolicy();
 const committed=selectSessionPolicyAction(s,p,{
  equipmentMode:"solo-efficient",legalActions:legal,budget:1
 });
 assert.deepEqual(committed,choice);
 assert.equal(p.equippedUpgradeCount,1);
 submitDecision(s,committed,{observeResult:false,recordHistory:false});
 assert.equal(s.state.heroes[0].slots.weapon?.id,choice.cardId);
 assert.equal(usefulSoloEquipmentAction(s,sessionActions(s)),null,
  "A lower-stat weapon cannot trigger a profitable swap back");
});

test("Efficient policy never offers reversible equipment cycling to MCTS",()=>{
 const s=createDecisionSession({
  seed:1402,heroes:["warrior"],gameMode:"everything-goes"
 });
 const h=s.state.heroes[0];
 const weapon=take(s,"ex-mace");
 h.slots.weapon=weapon;
 const other=take(s,"ex-dagger");
 const p=createSessionPolicy(),legal=sessionActions(s);
 assert.ok(legal.some(a=>a.kind==="unequip"));
 assert.ok(legal.some(a=>a.kind==="equip"&&a.cardId===other.id));
 assert.equal(usefulSoloEquipmentAction(s,legal),null);
 const a=selectSessionPolicyAction(s,p,{
  equipmentMode:"solo-efficient",budget:1,
  maxSearchSteps:200,legalActions:legal
 });
 assert.ok(legal.includes(a));
 assert.ok(!["equip","unequip","transfer"].includes(a.kind));
 assert.ok(p.equipmentChoicesSuppressed>0);
 assert.equal(p.equippedUpgradeCount,0);
 assert.equal(h.slots.weapon,weapon);
});

test("RING/COMPANION can fill vacant slot, but no blind swapping",()=>{
 const s=createDecisionSession({
  seed:1403,heroes:["warrior"],gameMode:"everything-goes"
 });
 const h=s.state.heroes[0];
 const ring=take(s,"ring-luck");
 const other=take(s,"ring-bargain");
 delete h.slots.ring;
 let choice=usefulSoloEquipmentAction(s,sessionActions(s));
 assert.equal(choice?.slot,"ring");
 submitDecision(s,choice,{observeResult:false,recordHistory:false});
 assert.ok(h.slots.ring);
 assert.equal(usefulSoloEquipmentAction(s,sessionActions(s))?.slot==="ring",
  false,"No cycling through ring cards without a proven improvement");
});

test("Legacy equipment mode remains available; efficient mode requires SOLO",()=>{
 const p=createSessionPolicy();
 const s=createDecisionSession({seed:1404,heroes:["warrior","knight"]});
 assert.throws(()=>selectSessionPolicyAction(s,p,{
  equipmentMode:"solo-efficient",budget:1}),/exactly one Hero/);
 assert.throws(()=>selectSessionPolicyAction(s,p,{
  equipmentMode:"unknown",budget:1}),/Unknown equipment/);
});
test("Printed Monster audit separates guaranteed entry from conditional d6",()=>{
 const a=auditMonsterFrequency();
 assert.ok(a.totalCards>=64);
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  const x=a.byStage[stage];
  assert.ok(x.cards>=12);
  assert.ok(x.guaranteedEntryCards>0);
  assert.ok(x.cardsWithAnyPrintedMonster>=x.guaranteedEntryCards);
  assert.ok(x.extraRollDrawsIf12RoomsAllRoll>=0);
 }
 const sample=a.cards.find(x=>x.id==="u-passage");
 assert.equal(sample.guaranteedEntry,false);
 assert.equal(sample.rollMonsterFaces,2);
 assert.ok(Math.abs(sample.conditionalRollProbability-1/3)<1e-12);
 const entry=a.cards.find(x=>x.id==="u-mimic");
 assert.equal(entry.guaranteedEntry,true);
 const optional=a.cards.find(x=>x.id==="m-beetle");
 assert.ok(optional.directChoices.length>0);
 assert.equal(a.empirical.runs,0);
});
test("Monster audit does not equate returning Wisp appearances with fresh draws",()=>{
 const a=auditMonsterFrequency({rows:[{
  hero:"witch",arm:"implicit",roomsCleared:36,encounterStarts:3,
  ordinaryEncounters:4,ordinaryFights:2,vaultReached:1,
  coverage:{monsterVisits:{wisp:2,crawler:1,rat:1}}
 }]});
 assert.equal(a.empirical.byArm.implicit.meanFreshMonsterStarts,3);
 assert.equal(a.empirical.byArm.implicit.meanMonsterAppearances,4);
 assert.equal(a.empirical.byArm.implicit.full36Runs,1);
});
