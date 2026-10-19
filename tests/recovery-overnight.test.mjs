import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {MONSTERS,OBJECTS} from "../src/tabletop-data.js";
import {compileStaging} from "../src/staging/catalogue.js";
import {BALANCED_ROOM_IDS} from "../src/room-balance.js";
import {recoveryOvernightHypotheses,RECOVERY_OVERNIGHT_PHYSICAL_IDS,
 RECOVERY_OVERNIGHT_REFERENCE_ID}
 from "../src/staging/recovery-overnight-hypotheses.js";
import {settleMonsterVictory} from "../src/engine/combat-outcomes.js";
import {chooseRoom,legalActions,applyAction} from "../src/engine/index.js";
import {resolvePrintedItemHealing} from "../src/item-healing.js";
import {activateOddTool} from "../src/odd-item-effects.js";
import {cardMarkup} from "../src/tabletop-view.js";

const all=recoveryOvernightHypotheses();
const physical=all.filter(x=>x.id!==RECOVERY_OVERNIGHT_REFERENCE_ID);
test("50 unique physical combinations, including dose × quantity, plus diagnostic",()=>{
 assert.equal(all.length,51);
 assert.equal(physical.length,50);
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
test("healing Item edits change BOTH executable dose and printed face",()=>{
 const spec={
  schema:"rogue-cards-staging-v1",id:"item-healing-parity",
  itemHealing:{"ex-bandages":6,"ex-rations":4,
   "odd-thorn-tonic":7}
 };
 const pool=compileStaging(spec);
 for(const [id,dose] of Object.entries(spec.itemHealing)){
  const staged=pool.items.find(x=>x.id===id);
  assert.equal(staged.v2.healingAmount,dose);
  assert.match(staged.rule,new RegExp("heal "+dose+" HP"));
  assert.match(staged.v2.trigger,new RegExp("heal "+dose+" HP"));
  assert.match(cardMarkup(staged),new RegExp("heal (?:<[^>]+>)*"+dose));
 }
 const s=new ExpeditionState({seed:404,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:pool});
 const h=s.heroes[0];
 const rations=pool.items.find(x=>x.id==="ex-rations");
 s.add(h,rations);h.hp=h.card.hp-6;
 const rationAction=legalActions(s,{phase:"between-rooms",heroIndex:0})
  .find(x=>x.kind==="item-trigger"&&x.cardId==="ex-rations");
 assert.ok(rationAction);
 applyAction(s,rationAction,{observeResult:false});
 assert.equal(h.hp,h.card.hp-2);
 assert.equal(s.metrics.healing.bySource["item:ex-rations"].restored,4);
 const tonic=pool.items.find(x=>x.id==="odd-thorn-tonic");
 s.add(h,tonic);h.hp=h.card.hp-10;
 assert.equal(activateOddTool(s,h,tonic),true);
 assert.equal(s.metrics.healing.bySource["item:odd-thorn-tonic"].restored,7);
 const bandages=pool.items.find(x=>x.id==="ex-bandages");
 s.add(h,bandages);h.hp=h.card.hp-10;
 const bandageAction=legalActions(s,{phase:"between-rooms",heroIndex:0})
  .find(x=>x.kind==="item-trigger"&&x.cardId==="ex-bandages");
 assert.ok(bandageAction);
 applyAction(s,bandageAction,{observeResult:false});
 assert.equal(s.metrics.healing.bySource["item:ex-bandages"].restored,6);
 // The canonical definitions must not be mutated by a staged experiment.
 const originals=compileStaging({
  schema:"rogue-cards-staging-v1",id:"unchanged-item-healing"});
 assert.equal(originals.items.find(x=>x.id==="ex-bandages").v2.healingAmount,undefined);
 assert.equal(originals.items.find(x=>x.id==="ex-rations").v2.healingAmount,undefined);
 assert.equal(originals.items.find(x=>x.id==="odd-thorn-tonic").v2.healingAmount,undefined);
});
test("d6+2 stays stochastic and is credited as resolved offered HP",()=>{
 const pool=compileStaging({
  schema:"rogue-cards-staging-v1",id:"bandage-diceplus",
  itemHealing:{"ex-bandages":"d6+2"}});
 const bandage=pool.items.find(x=>x.id==="ex-bandages");
 assert.match(bandage.v2.trigger,/heal d6\+2 HP/);
 const s=new ExpeditionState({seed:31,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:pool});
 const h=s.heroes[0];h.hp=1;s.add(h,bandage);
 const action=legalActions(s,{phase:"between-rooms",heroIndex:0})
  .find(x=>x.cardId==="ex-bandages");
 assert.ok(action);
 applyAction(s,action,{observeResult:false});
 const healed=s.metrics.healing.bySource["item:ex-bandages"];
 assert.ok(healed.offered>=3&&healed.offered<=8);
 assert.equal(healed.restored,h.hp-1);
 assert.equal(healed.offered,healed.restored+healed.wasted);
 assert.equal(resolvePrintedItemHealing({
  die:()=>4},bandage),6);
});
test("only supported printed Item dose values and IDs are allowed",()=>{
 const base={schema:"rogue-cards-staging-v1",id:"reject-heal"};
 assert.throws(()=>compileStaging({...base,
  itemHealing:{"odd-thorn-tonic":12}}),/Unsupported printed Item healing/);
 assert.throws(()=>compileStaging({...base,
  itemHealing:{"odd-non-existent":5}}),/Unsupported printed Item healing/);
 assert.throws(()=>compileStaging({...base,
  itemHealing:{"ex-bandages":"d8"}}),/Unsupported printed Item healing/);
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
test("printed POTION is attributed as potion, never as an unknown Item",()=>{
 const s=new ExpeditionState({seed:19,heroes:["warrior"],gameMode:"everything-goes"});
 const potion=OBJECTS.find(c=>c.id==="laughing");
 assert.equal(potion.type,"potion");
 const h=s.heroes[0];h.hp=h.card.hp-1;
 s.apply("HEAL",["3"],potion);
 assert.equal(s.metrics.healing.bySource["potion:laughing"].offered,3);
 assert.equal(s.metrics.healing.bySource["potion:laughing"].restored,1);
 assert.equal(s.metrics.healing.bySource["potion:laughing"].wasted,2);
 assert.equal(s.metrics.healing.byCategory.potion.offered,3);
 assert.equal(s.metrics.healing.byCategory.unattributed,undefined);
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
 assert.equal(result.hypotheses.length,51);
 assert.equal(result.screenTrials,52*8*2);
 assert.equal(result.confirmTrials,13*8*3);
 assert.ok(result.hypotheses.includes(RECOVERY_OVERNIGHT_REFERENCE_ID));
 assert.equal(result.physicallyCanonicalCardsChanged,false);
});
