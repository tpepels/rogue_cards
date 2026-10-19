import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {MONSTERS} from "../src/tabletop-data.js";
import {compileStaging} from "../src/staging/catalogue.js";
import {BALANCED_ROOM_IDS} from "../src/room-balance.js";
import {recoveryOvernightHypotheses,RECOVERY_OVERNIGHT_PHYSICAL_IDS,
 RECOVERY_OVERNIGHT_REFERENCE_ID}
 from "../src/staging/recovery-overnight-hypotheses.js";
import {settleMonsterVictory} from "../src/engine/combat-outcomes.js";
import {chooseRoom} from "../src/engine/index.js";

const all=recoveryOvernightHypotheses();
const physical=all.filter(x=>x.id!==RECOVERY_OVERNIGHT_REFERENCE_ID);
test("26 unique physical combinations and one strictly diagnostic comparator",()=>{
 assert.equal(all.length,27);
 assert.equal(physical.length,26);
 assert.deepEqual(physical.map(x=>x.id),RECOVERY_OVERNIGHT_PHYSICAL_IDS);
 for(const spec of physical){
  assert.equal(spec.mechanics?.postCombatHeal,undefined);
  const pool=compileStaging(spec);
  assert.equal(pool.mechanics.postCombatHeal,undefined);
  assert.deepEqual(pool.rooms.map(x=>x.id),BALANCED_ROOM_IDS);
  assert.equal(pool.monsters.length,24);
  assert.ok(pool.monsters.every((m,i)=>m.hp===
   compileStaging({schema:"rogue-cards-staging-v1",
    id:"unchanged-monster-reference"}).monsters[i].hp));
 }
 const reference=all.at(-1);
 assert.equal(reference.id,RECOVERY_OVERNIGHT_REFERENCE_ID);
 assert.equal(reference.mechanics.postCombatHeal,5);
 assert.equal(reference.monsterHealing,undefined);
 assert.equal(reference.roomRestHealing,undefined);
});
test("HP offered/restored/wasted is credited to actual printed Room",()=>{
 const s=new ExpeditionState({seed:111,heroes:["warrior"],gameMode:"everything-goes"});
 const h=s.heroes[0],room=s.cardPools?.rooms?.[0]??{
  id:"ex-u-coal-store",type:"room",stage:"UPPER"};
 s.room=room;h.hp=h.card.hp-2;
 s.apply("HEAL",["6"],room);
 assert.equal(h.hp,h.card.hp);
 assert.deepEqual(s.metrics.healing.total,{
  attempts:1,offered:6,restored:2,wasted:4});
 assert.deepEqual(s.metrics.healing.bySource["room:"+room.id],
  s.metrics.healing.total);
 assert.deepEqual(s.metrics.healing.byCategory.room,
  s.metrics.healing.total);
 s.apply("HEAL",["3"],room);
 assert.deepEqual(s.metrics.healing.total,{
  attempts:2,offered:9,restored:2,wasted:7});
});
test("actual staged Monster DEFEAT heal has exact source, no diagnostic grant",()=>{
 const spec=physical.find(x=>x.id==="recovery-defeat-all-3");
 const pool=compileStaging(spec);
 const m=pool.monsters.find(x=>x.id==="goblin");
 const s=new ExpeditionState({seed:222,heroes:["warrior"],gameMode:"everything-goes",cardPools:pool});
 const h=s.heroes[0];h.hp=h.card.hp-4;
 s.monster=m;s.monsterHP=0;s._activeMonsterFought=true;
 settleMonsterVictory(s,m);
 assert.equal(s.metrics.healing.bySource["monster:goblin"].offered,3);
 assert.equal(s.metrics.healing.bySource["monster:goblin"].restored,3);
 assert.equal(s.metrics.postCombatHealRestored,0);
 assert.equal(MONSTERS.find(x=>x.id==="goblin").v2.defeatOps.includes("HEAL:3"),false);
});
test("staged paid REST tracks actual cap waste and preserves Item cost",()=>{
 const spec=physical.find(x=>x.id==="recovery-rest-heavy");
 const pool=compileStaging(spec);
 const room=pool.rooms.find(x=>x.id==="ex-u-coal-store");
 const s=new ExpeditionState({seed:123,heroes:["warrior"],gameMode:"everything-goes",cardPools:pool});
 s.room=room;const h=s.heroes[0],item=pool.items.find(x=>x.id==="ex-rations");
 s.add(h,item);h.hp=h.card.hp-3;const before=h.inventory.length;
 chooseRoom(s,1,{observeResult:false});
 assert.equal(h.inventory.length,before-1);
 assert.equal(s.metrics.healing.bySource["room:"+room.id].offered,9);
 assert.equal(s.metrics.healing.bySource["room:"+room.id].restored,3);
 assert.equal(s.metrics.healing.bySource["room:"+room.id].wasted,6);
});
test("healing ledger deep-forks without aliases",()=>{
 const s=new ExpeditionState({seed:3,heroes:["warrior"],gameMode:"everything-goes"});
 const h=s.heroes[0];h.hp-=4;
 s.heal(h,2,"hero:test");
 const copy=forkGameState(s,{fastMetrics:true});
 copy.heal(copy.heroes[0],5,"hero:test");
 assert.equal(s.metrics.healing.total.restored,2);
 assert.equal(copy.metrics.healing.total.restored,4);
 assert.equal(s.metrics.healing.bySource["hero:test"].wasted,0);
 assert.equal(copy.metrics.healing.bySource["hero:test"].wasted,3);
});
test("dry-run plans complete 27-arm study with genuine independent confirmation",()=>{
 const run=spawnSync(process.execPath,[
  "scripts/study-balance-hypotheses.mjs",
  "--suite","recovery-overnight","--finalists","12",
  "--screen-repeats","2","--confirm-repeats","3","--dry-run"
 ],{encoding:"utf8",timeout:30000});
 assert.equal(run.status,0,run.stderr);
 const result=JSON.parse(run.stdout);
 assert.equal(result.hypotheses.length,27);
 assert.equal(result.screenTrials,28*8*2);
 assert.equal(result.confirmTrials,13*8*3);
 assert.ok(result.hypotheses.includes(RECOVERY_OVERNIGHT_REFERENCE_ID));
 assert.equal(result.physicallyCanonicalCardsChanged,false);
});
