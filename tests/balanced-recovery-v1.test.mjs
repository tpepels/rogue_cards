import test from "node:test";
import assert from "node:assert/strict";
import {MONSTERS} from "../src/tabletop-data.js";
import {EXTRA_MONSTERS} from "../src/monster-expansion.js";
import {MONSTER_DEFEATS} from "../src/monster-defeats.js";
import {PRINT_ONLY_ITEMS,PRINT_ONLY_ROOMS} from "../src/print-expansion.js";
import {ODD_ITEMS} from "../src/item-expansion.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {ITEM_HEALING_DEFAULTS} from "../src/item-healing.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {legalActions,applyAction,chooseRoom,legalRoomChoices}
 from "../src/engine/index.js";
import {settleMonsterVictory} from "../src/engine/combat-outcomes.js";
import {activateOddTool} from "../src/odd-item-effects.js";
import {cardMarkup} from "../src/tabletop-view.js";

const monsters=[...MONSTERS,...EXTRA_MONSTERS];
const sourceCards=[...PRINT_ONLY_ITEMS,...ODD_ITEMS];
const readable=card=>cardMarkup(card).replace(/<[^>]*>/g,"")
 .replace(/&amp;/g,"&").replace(/&#39;/g,"'");
const originalHealing=new Map([
 ["rat","HEAL:2"],["mold","HEAL:d6"],["drain-leech","HEAL:d6"],
 ["wax-golem","HEAL:3"],["ash-penitent","HEAL:d6"]
]);
test("exactly 19 regional Monsters gain printed d6 recovery on DEFEAT",()=>{
 assert.equal(monsters.length,24);
 assert.equal(Object.keys(MONSTER_DEFEATS).length,24);
 let added=0;
 for(const monster of monsters){
  const heal=monster.v2.defeatOps.filter(op=>op.startsWith("HEAL:"));
  const prior=originalHealing.get(monster.id);
  if(prior){
   assert.deepEqual(heal,[prior],monster.id);
  }else{
   added++;
   assert.deepEqual(heal,["HEAL:d6"],monster.id);
   assert.ok(readable(monster).includes("Heal d6 HP."),monster.id);
   assert.ok(monster.v2.defeat.trim().endsWith("Heal d6 HP."),monster.id);
   assert.ok(monster.v2.defeatOps.some(op=>!op.startsWith("HEAL:")),
    "Existing Monster DEFEAT effect lost: "+monster.id);
  }
 }
 assert.equal(added,19);
});
test("Monster DEFEAT actually heals once and never triggers global +5",()=>{
 const monster=monsters.find(m=>m.id==="goblin");
 const s=new ExpeditionState({seed:87,heroes:["warrior"],
  gameMode:"everything-goes"});
 const h=s.heroes[0];h.hp=h.card.hp-6;
 s.monster=monster;s.monsterHP=0;s._activeMonsterFought=true;
 const before=s.metrics.operationCounts.HEAL??0;
 settleMonsterVictory(s,monster);
 const entry=s.metrics.healing.bySource["monster:goblin"];
 assert.equal(entry.attempts,1);
 assert.ok(entry.offered>=1&&entry.offered<=6);
 assert.equal(entry.restored,entry.offered);
 assert.equal(entry.wasted,0);
 assert.equal(s.metrics.operationCounts.HEAL,before+1);
 assert.equal(s.metrics.postCombatHealTriggers,0);
});
test("three canonical physical Items have the agreed healing and unchanged counts",()=>{
 assert.deepEqual(ITEM_HEALING_DEFAULTS,{
  "ex-bandages":"d6+2","ex-rations":4,"odd-thorn-tonic":5});
 for(const [id,rule,count] of [
  ["ex-bandages","heal d6+2 HP",3],
  ["ex-rations","heal 4 HP",3],
  ["odd-thorn-tonic","heal 5 HP",2]
 ]){
  const card=sourceCards.find(c=>c.id===id);
  assert.ok(card,id);
  assert.equal(card.copies,count,id);
  assert.ok(card.v2.trigger.includes(rule),id);
  assert.ok(readable(card).includes(rule),id);
 }
 const tonic=sourceCards.find(c=>c.id==="odd-thorn-tonic");
 assert.match(tonic.v2.trigger,/next WIT test has DIS/);
});
test("canonical consumables restore their physical values in engine",()=>{
 const s=new ExpeditionState({seed:431,heroes:["warrior"],
  gameMode:"everything-goes"});
 const h=s.heroes[0];
 for(const [id,low,high] of [
  ["ex-bandages",3,8],["ex-rations",4,4]
 ]){
  const card=sourceCards.find(c=>c.id===id);
  s.add(h,card);h.hp=1;
  const action=legalActions(s,{phase:"between-rooms",heroIndex:0})
   .find(x=>x.kind==="item-trigger"&&x.cardId===id);
  assert.ok(action,id);
  applyAction(s,action,{observeResult:false});
  const cell=s.metrics.healing.bySource["item:"+id];
  assert.ok(cell.offered>=low&&cell.offered<=high,id);
  assert.equal(cell.restored,cell.offered,id);
 }
 const tonic=sourceCards.find(c=>c.id==="odd-thorn-tonic");
 s.add(h,tonic);h.hp=1;
 assert.equal(activateOddTool(s,h,tonic),true);
 assert.equal(s.metrics.healing.bySource["item:odd-thorn-tonic"].offered,5);
 assert.equal(s.metrics.healing.bySource["item:odd-thorn-tonic"].restored,5);
 assert.equal(h.nextWitDis,1);
});
test("three printed REST effects agree with executable room model and actual cost",()=>{
 const data=[
  ["ex-u-coal-store",5,true],
  ["ex-m-old-barracks",6,true],
  ["ex-d-watchpost",4,false]
 ];
 for(const [id,value,paid] of data){
  const room=PRINT_ONLY_ROOMS.find(c=>c.id===id);
  assert.ok(room,id);
  assert.match(room.v2.choices[1].effect,
   new RegExp("heal "+value+" HP","i"));
  assert.match(readable(room),new RegExp("heal "+value+" HP","i"));
  assert.deepEqual(ROOM_EFFECTS[id].choices[1],
   [...(paid?["COST:1"]:[]),"HEAL:"+value]);
  const s=new ExpeditionState({seed:552,heroes:["warrior"],
   gameMode:"everything-goes"});
  s.room=room;
  const h=s.heroes[0];
  h.hp=h.card.hp-value;
  const rations=sourceCards.find(c=>c.id==="ex-rations");
  s.add(h,rations);
  assert.ok(legalRoomChoices(s).includes(1),id);
  const before=h.inventory.length;
  chooseRoom(s,1,{observeResult:false});
  assert.equal(h.hp,h.card.hp,id);
  assert.equal(h.inventory.length,before-Number(paid),id);
  const healing=s.metrics.healing.bySource["room:"+id];
  assert.equal(healing.offered,value,id);
  assert.equal(healing.restored,value,id);
 }
});
test("Balanced Recovery adds no global post-combat recovery mechanic",()=>{
 const s=new ExpeditionState({seed:2,heroes:["warrior"],
  gameMode:"everything-goes"});
 assert.equal(s.cardPools?.mechanics?.postCombatHeal,undefined);
 assert.equal(s.metrics.postCombatHealRestored,0);
});
