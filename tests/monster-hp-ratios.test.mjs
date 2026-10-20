import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {canonicalStagingCatalogue,compileStaging}
 from "../src/staging/catalogue.js";
import {monsterHpRatioHypotheses,monsterHpRatioFamily,scaledMonsterHp,
 HP_RATIOS} from "../src/staging/monster-hp-ratio-hypotheses.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {balanceStudyArgs} from "../scripts/study-balance-hypotheses.mjs";

const original=canonicalStagingCatalogue({roomBaseline:"full"});
const prototypes=monsterHpRatioHypotheses();
const byId=Object.fromEntries(prototypes.map(x=>[x.id,x]));
const staged=id=>compileStaging(byId[id]);

test("exactly three integer HP ratios x canonical/mild/strong existing encounter rules",()=>{
 assert.equal(prototypes.length,9);
 assert.equal(new Set(prototypes.map(x=>x.id)).size,9);
 assert.deepEqual(HP_RATIOS.map(x=>x.id),
  ["half","two-thirds","three-quarters"]);
 for(const ratio of HP_RATIOS)
  for(const context of ["canonical","mild","strong"]){
   const id="monster-hp-"+ratio.id+
    (context==="canonical"?"":"-"+context);
   assert.ok(byId[id],id);
   assert.equal(monsterHpRatioFamily(id),context);
  }
});
test("Every ordinary regional Monster receives ceiling integer HP, minimum one; no other field changes",()=>{
 const snap=JSON.stringify(original.monsters.map(x=>[x.id,x.hp,x.atk,x.def,x.copies]));
 const low=["half","two-thirds","three-quarters"]
  .map(x=>staged("monster-hp-"+x));
 for(const ratio of HP_RATIOS){
  const variant=staged("monster-hp-"+ratio.id);
  assert.equal(variant.monsters.length,original.monsters.length);
  assert.equal(byId["monster-hp-"+ratio.id].cards.length,
   original.monsters.length);
  for(const old of original.monsters){
   const newer=variant.monsters.find(x=>x.id===old.id);
   assert.ok(newer,old.id);
   assert.equal(newer.hp,scaledMonsterHp(old.hp,
    ratio.numerator,ratio.denominator),old.id);
   assert.deepEqual([newer.atk,newer.def,newer.copies,newer.behavior],
    [old.atk,old.def,old.copies,old.behavior]);
  }
  assert.equal(variant.warden.hp,original.warden.hp);
  assert.equal(variant.wardenFury.hp,original.wardenFury.hp);
  assert.deepEqual(variant.mechanics,{});
  assert.deepEqual(variant.roomEffects,{});
  assert.deepEqual(variant.rooms.map(x=>x.id).sort(),original.rooms.map(x=>x.id).sort());
  assert.deepEqual(variant.items.map(x=>x.id),original.items.map(x=>x.id));
  assert.deepEqual(variant.heroes.map(x=>x.id),original.heroes.map(x=>x.id));
 }
 assert.equal(JSON.stringify(original.monsters.map(x=>[x.id,x.hp,x.atk,x.def,x.copies])),snap);
 for(let i=0;i<original.monsters.length;i++){
  const h=low.map(x=>x.monsters[i].hp);
  assert.ok(h[0]<=h[1]&&h[1]<=h[2]);
 }
 assert.equal(scaledMonsterHp(1,1,2),1);
 assert.equal(scaledMonsterHp(5,1,2),3);
 assert.equal(scaledMonsterHp(5,2,3),4);
 assert.equal(scaledMonsterHp(5,3,4),4);
});
test("Mild and strong interaction uses only pre-existing Room outcome patches",()=>{
 const roomBefore=JSON.stringify(ROOM_EFFECTS);
 for(const ratio of HP_RATIOS){
  for(const intensity of ["mild","strong"]){
   const candidate=staged("monster-hp-"+ratio.id+"-"+intensity);
   assert.ok(Object.keys(candidate.roomEffects).length>0);
   assert.deepEqual(candidate.mechanics,{});
   for(const [roomId,fx] of Object.entries(candidate.roomEffects)){
    assert.deepEqual(fx.choices,ROOM_EFFECTS[roomId].choices);
    assert.ok(fx.outcomes.some((band,i)=>
     band.length>ROOM_EFFECTS[roomId].outcomes[i].length));
   }
   assert.equal(candidate.warden.hp,original.warden.hp);
   assert.equal(candidate.wardenFury.hp,original.wardenFury.hp);
  }
 }
 assert.equal(JSON.stringify(ROOM_EFFECTS),roomBefore);
});
test("Actual session state draws scaled Monsters from stage decks and refills",()=>{
 const pools=staged("monster-hp-half");
 const state=new ExpeditionState({seed:423,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:pools});
 state.beginRoom(state.rooms.UPPER[0]);
 for(const region of ["UPPER","MIDDLE","DEEP"]){
  state.monsters[region]=[];
  const monster=state.nextMonster(region);
  const expected=original.monsters.find(x=>x.id===monster.id);
  assert.equal(monster.hp,scaledMonsterHp(expected.hp,1,2));
  assert.equal(monster.atk,expected.atk);
 }
});
test("Dry-run plans 9 arms + shared control and fixed-seed independent validation",()=>{
 assert.equal(balanceStudyArgs(["--suite","hp-ratios"]).suite,"hp-ratios");
 assert.throws(()=>balanceStudyArgs(["--suite","hp-ratio"]),/suite/);
 const run=spawnSync(process.execPath,[
  new URL("../scripts/study-balance-hypotheses.mjs",import.meta.url).pathname,
  "--dry-run","--suite","hp-ratios","--workers","8",
  "--screen-repeats","12","--confirm-repeats","24",
  "--finalists","6"
 ],{encoding:"utf8"});
 assert.equal(run.status,0,run.stderr);
 const info=JSON.parse(run.stdout);
 assert.equal(info.hypotheses.length,9);
 assert.equal(info.screenTrials,960);
 assert.equal(info.confirmTrials,1344);
 assert.equal(info.physicallyCanonicalCardsChanged,false);
});
