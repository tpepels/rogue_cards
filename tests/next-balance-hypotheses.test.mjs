import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {canonicalStagingCatalogue,compileStaging}
 from "../src/staging/catalogue.js";
import {nextEncounterHypotheses,independentWardenHypotheses}
 from "../src/staging/next-balance-hypotheses.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {chooseRoom,legalRoomChoices} from "../src/engine/index.js";
import {beginWarden,applyWardenChoice}
 from "../src/engine/vault-encounter.js";
import {balanceStudyArgs} from "../scripts/study-balance-hypotheses.mjs";

const canonical=canonicalStagingCatalogue();
const encounter=nextEncounterHypotheses();
const warden=independentWardenHypotheses();

test("Encounter and Warden research suites compile without modifying canonical cards",()=>{
 assert.equal(encounter.length,9);
 assert.equal(warden.length,12);
 const ref=JSON.stringify(ROOM_EFFECTS["ex-u-slick-passage"]);
 const hp=canonical.warden.hp;
 for(const variant of [...encounter,...warden]){
  const compiled=compileStaging(variant);
  assert.equal(compiled.stagingId,variant.id);
  assert.equal(compiled._stagingCatalogue,true);
 }
 assert.equal(canonical.warden.hp,hp);
 assert.equal(JSON.stringify(ROOM_EFFECTS["ex-u-slick-passage"]),ref);
});
test("Warden variants edit Warden only, with unchanged Room and Monster pools",()=>{
 const control=new ExpeditionState({seed:42,heroes:["warrior"],
  gameMode:"everything-goes"});
 for(const variant of warden){
  assert.ok(variant.cards.length>=1);
  assert.ok(variant.cards.every(x=>
   ["warden","wardenFury"].includes(x.collection)));
  assert.equal(variant.roomEffects,undefined);
  assert.equal(variant.roomDeck,undefined);
  const pools=compileStaging(variant);
  const staged=new ExpeditionState({seed:42,heroes:["warrior"],
   gameMode:"everything-goes",cardPools:pools});
  assert.deepEqual(Object.fromEntries(Object.entries(staged.rooms).map(
   ([stage,rows])=>[stage,rows.map(c=>c.id)])),
   Object.fromEntries(Object.entries(control.rooms).map(
   ([stage,rows])=>[stage,rows.map(c=>c.id)])));
  assert.deepEqual(staged.deck.map(c=>c.id),control.deck.map(c=>c.id));
  assert.deepEqual(Object.fromEntries(Object.entries(staged.monsters).map(
   ([stage,rows])=>[stage,rows.map(c=>c.id)])),
   Object.fromEntries(Object.entries(control.monsters).map(
   ([stage,rows])=>[stage,rows.map(c=>c.id)])));
  assert.ok(staged.cardPools.warden.hp>10);
 }
});
test("Two Warden phases read precisely staged HP and retain Fury carry-over",()=>{
 const variant=warden.find(x=>x.id==="warden-phase1-16-fury8");
 const state=new ExpeditionState({seed:41,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:compileStaging(variant)});
 beginWarden(state);
 assert.equal(state.monster.id,"warden");
 assert.equal(state.monsterHP,16);
 assert.equal(state.monster.atk,6);
 state.monsterHP=10;
 const fury=applyWardenChoice(state,"fight");
 assert.equal(fury.complete,false);
 assert.equal(state.monster.id,"warden-fury");
 assert.equal(state.monsterHP,8);
 assert.equal(canonical.warden.hp,20);
 assert.equal(canonical.wardenFury.hp,10);
});
test("Staged Monster pile still uses staged cards when exhausted and refilled",()=>{
 const stage=compileStaging({schema:"rogue-cards-staging-v1",
  id:"wisp-test-refill",cards:[{
   collection:"monsters",id:"wisp",set:{hp:7,copies:3}
  }]});
 const s=new ExpeditionState({seed:42,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:stage});
 s.monsters.MIDDLE=[];
 const first=s.nextMonster("MIDDLE");
 const all=[first,...s.monsters.MIDDLE];
 assert.equal(all.filter(m=>m.id==="wisp").length,3);
 assert.ok(all.filter(m=>m.id==="wisp").every(m=>m.hp===7));
 assert.equal(canonical.monsters.find(m=>m.id==="wisp").hp,9);
});
test("Opt-in Room offers an actual affordable Item-vs-Monster choice",()=>{
 const pools=compileStaging(encounter.find(x=>x.id==="voluntary-loot-or-toll"));
 const room=pools.rooms.find(x=>x.id==="ex-u-slick-passage");
 const s=new ExpeditionState({seed:14,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:pools});
 s.beginRoom(room);
 s.draw();
 assert.deepEqual(legalRoomChoices(s),[0,1]);
 const originalItems=s.heroes[0].inventory.length;
 chooseRoom(s,1,{observeResult:false});
 assert.equal(s.metrics.encounterStarts,0);
 assert.equal(s.heroes[0].inventory.length,originalItems-1);
 const s2=new ExpeditionState({seed:14,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:pools});
 s2.beginRoom(room);
 chooseRoom(s2,0,{observeResult:false});
 assert.ok(s2.metrics.encounterStarts>=1);
 assert.ok(s2.metrics.drawn>=2);
 assert.ok(s2.monsterSkip>=1);
});
test("Soft encounter dice outcomes invoke supported skip/dis effects",()=>{
 const modes=["safe-encounters-mild","safe-encounters-disadvantage",
  "safe-encounters-strong","safe-encounters-dense"];
 for(const name of modes){
  const spec=encounter.find(x=>x.id===name);
  assert.ok(Object.keys(spec.roomEffects).length>=12);
  for(const [id,ops] of Object.entries(spec.roomEffects)){
   const original=ROOM_EFFECTS[id];
   assert.equal(ops.outcomes.length,original.outcomes.length);
   assert.ok(ops.outcomes.some((x,i)=>x.length>original.outcomes[i].length));
  }
 }
});
test("Suite-specific study dry-runs do not mix original or Warden interventions",()=>{
 assert.equal(balanceStudyArgs(["--suite","warden"]).suite,"warden");
 assert.equal(balanceStudyArgs(["--suite","encounters"]).suite,"encounters");
 assert.throws(()=>balanceStudyArgs(["--suite","random"]),/suite/);
 for(const suite of ["warden","encounters"]){
  const run=spawnSync(process.execPath,[
   new URL("../scripts/study-balance-hypotheses.mjs",import.meta.url).pathname,
   "--dry-run","--suite",suite,"--variant-limit","2",
   "--finalists","1","--heroes","warrior,witch"
  ],{encoding:"utf8"});
  assert.equal(run.status,0,run.stderr);
  const info=JSON.parse(run.stdout);
  assert.equal(info.suite,suite);
  assert.equal(info.screenTrials,12);
  assert.equal(info.confirmTrials,12);
  assert.equal(info.physicallyCanonicalCardsChanged,false);
 }
});
