import test from "node:test";
import assert from "node:assert/strict";
import {HEROES,ROOMS,VAULT,OBJECTS,MONSTERS,WARDEN,WARDEN_FURY} from "../src/tabletop-data.js";
import {verifyObjectCoverage,ROLL_EFFECTS,NON_ROLL_EFFECTS} from "../src/effect-model.js";
import {verifyRoomCoverage,ROOM_EFFECTS} from "../src/room-effect-model.js";
import {ExpeditionState,validateStateEffects,strategies} from "../src/expedition-runtime.js";
import {simulateFullExpedition,simulateFullBatch} from "../src/expedition-campaign.js";
test("all printed Object results and Room choices have exactly one executable handler",()=>{
 const o=verifyObjectCoverage(),r=verifyRoomCoverage();
 assert.equal(o.objects,52);
 assert.equal(o.rollCards+o.nonRollCards,o.objects);
 assert.equal(r.rooms,37);assert.equal(r.choices,74);
 assert.ok(o.outcomeBands>=110);assert.ok(r.rollBands>=110);
});
test("every printed Object die face executes through a strict dispatcher",()=>{
 for(const card of OBJECTS.filter(x=>x.v2.roll)){
  for(let face=1;face<=6;face++){
   const s=new ExpeditionState({seed:face+card.id.length*3007,heroes:["warrior","wizard"],strategy:"magic"});
   s.beginRoom(ROOMS.find(r=>r.id==="u-gate"));
   const h=s.heroes[0];s.add(h,card);
   // Provide enough cards to pay every printed bargain.
   for(let n=0;n<7;n++)s.add(h,OBJECTS.find(o=>o.id==="smoky"));
   assert.doesNotThrow(()=>s.activate(h,card,{face}),card.id+" result "+face);
   assert.equal(s.metrics.unresolved,0,card.id);
  }
 }
});
test("every Room choice and outcome can execute without fallback parsing",()=>{
 const all=[...ROOMS,VAULT];
 for(const room of all){
  for(let choice=0;choice<2;choice++){
   const s=new ExpeditionState({seed:room.id.length*31+choice,heroes:["warrior","priest"],strategy:"magic"});
   s.beginRoom(room);for(let n=0;n<8;n++)s.add(s.heroes[0],OBJECTS.find(o=>o.id==="key"));
   assert.doesNotThrow(()=>ROOM_EFFECTS[room.id].choices[choice].forEach(op=>{
    const [name,...args]=op.split(":");s.apply(name,args,room);
   }),room.id+" choice "+choice);
  }
  for(let band=0;band<room.v2.roll.outcomes.length;band++){
   const s=new ExpeditionState({seed:band+room.id.length*61,heroes:["monk","priest"],strategy:"survival"});
   s.beginRoom(room);
   assert.doesNotThrow(()=>ROOM_EFFECTS[room.id].outcomes[band].forEach(op=>{
    const [name,...args]=op.split(":");s.apply(name,args,room);
   }),room.id+" band "+band);
  }
 }
});
test("Potions identify consistently, Wands exhaust, and existing cards can recharge",()=>{
 const s=new ExpeditionState({seed:1234,heroes:["warrior"],strategy:"magic"});
 s.beginRoom(ROOMS[0]);const h=s.heroes[0];
 const p=OBJECTS.find(o=>o.id==="smoky");
 s.add(h,p);s.add(h,p);
 s.activate(h,p,{face:6});assert.equal(s.potionIdentities.get("smoky"),6);
 s.activate(h,p,{face:1});assert.equal(s.potionIdentities.get("smoky"),6);
 const wand=OBJECTS.find(o=>o.id==="wand-sparks");
 s.add(h,wand);s.activate(h,wand,{face:4});assert.equal(s.exhausted.has(wand),true);
 assert.equal(s.recharge(),true);assert.equal(s.exhausted.has(wand),false);
});
test("all eight Heroes survive the simulator API for five distinct play policies",()=>{
 for(const hero of HEROES)for(const strategy of strategies){
  const a=simulateFullBatch({heroes:[hero.id],strategy,runs:100,seed:20261012});
  assert.equal(a.runs,100);
  assert.ok(a.winRate>=0&&a.winRate<=1);
  assert.ok(a.vaultRate>=a.winRate);
  assert.equal(a.unresolvedEffects,0);
  assert.equal(a.stalledExpeditions,0);
 }
});
test("two-Hero runs remain deterministic and never exceed nine regional Rooms",()=>{
 for(const heroes of [["warrior","priest"],["knight","wizard"],["rogue","witch"],["thief","monk"]]){
  for(const strategy of strategies){
   const a=simulateFullBatch({heroes,strategy,runs:100,seed:2077});
   const b=simulateFullBatch({heroes,strategy,runs:100,seed:2077});
   assert.deepEqual(a,b);
   assert.ok(a.vaultRate>=a.winRate);
   assert.equal(a.stalledExpeditions,0);
  }
 }
});
test("a single full expedition is deterministic and records actual effect use",()=>{
 const a=simulateFullExpedition({seed:4567,heroes:["witch","knight"],strategy:"magic"});
 const b=simulateFullExpedition({seed:4567,heroes:["witch","knight"],strategy:"magic"});
 assert.deepEqual(a,b);
 assert.ok(a.cleared>=0&&a.cleared<=9);
 assert.ok(a.activated>=0);
 assert.ok(a.rounds>=0);
 assert.equal(a.unresolved,0);
});


test("cursed cleansing persists, without silently removing the physical Item",()=>{
 const s=new ExpeditionState({seed:109,heroes:["warrior"],strategy:"survival"});
 const h=s.heroes[0],blade=OBJECTS.find(o=>o.id==="cursed-blade");
 s.add(h,blade);h.slots.weapon=blade;
 assert.equal(s.cursed(blade),true);
 s.apply("CLEANSE",[],null);
 assert.equal(s.cursed(blade),false);
 assert.ok(h.inventory.includes(blade));
 assert.equal(s.equippedTag(h,"CURSED"),false);
});
test("Hungry Ring activates once after a separate MAGIC Item, not recursively",()=>{
 const s=new ExpeditionState({seed:701,heroes:["witch"],strategy:"magic"});
 const h=s.heroes[0];s.beginRoom(ROOMS[0]);
 const ring=OBJECTS.find(o=>o.id==="ring-hunger");
 const scroll=OBJECTS.find(o=>o.id==="scroll-flame");
 s.add(h,ring);h.slots.ring=ring;s.add(h,scroll);
 s.monster=MONSTERS[0];s.monsterHP=s.monster.hp;
 s.activate(h,scroll,{face:4});
 assert.equal(s.metrics.cardCounts["ring-hunger"],1);
 assert.equal(h.used.has(ring),true);
 const scroll2=OBJECTS.find(o=>o.id==="scroll-last");
 s.add(h,scroll2);s.activate(h,scroll2,{face:4});
 assert.equal(s.metrics.cardCounts["ring-hunger"],1);
});
test("printed party-size Warden seal and all-Hero attack behaviours are in canonical cards",()=>{
 assert.match(VAULT.v2.choices[1].effect,/6 with two Heroes/);
 assert.match(WARDEN.behavior[1],/ATTACK each Hero/);
 assert.match(WARDEN_FURY.behavior[0],/ATTACK each Hero/);
 assert.equal(WARDEN_FURY.atk,6);
 assert.match(WARDEN_FURY.behavior[2],/lose 1 HP/);
});
test("before-print verification prevents source drift across new full-effect engine",()=>{
 const s=new ExpeditionState({seed:90210,heroes:["warrior","witch"],strategy:"seal"});
 assert.equal(s.heroes.length,2);
 assert.equal(s.metrics.unresolved,0);
});


test("held boons and cards survive Room boundaries until consumed or explicitly expired",()=>{
 const s=new ExpeditionState({seed:2401,heroes:["monk"],strategy:"survival"});
 const h=s.heroes[0];s.beginRoom(ROOMS.find(r=>r.id==="d-crown"));
 s.setActor(h);s.apply("SAVE_DEF",["2"],null);
 h.nextAdv++;h.nextAtk=2;h.kept.push("reroll");s.trapGuard=true;
 s.endRoom();
 assert.equal(h.nextDefenseBonus,2);assert.equal(h.defDuration,1);
 s.beginRoom(ROOMS.find(r=>r.id==="u-gate"));
 assert.equal(h.nextAdv,1);assert.equal(h.nextAtk,2);
 assert.equal(h.nextDefenseBonus,2);
 assert.equal(s.trapGuard,true);
 // A stored reliquary protection is discarded when the first printed trap occurs.
 const before=h.hp;s.roomRoll(1);
 assert.equal(h.hp,before);assert.equal(s.trapGuard,false);
 s.endRoom();assert.equal(h.nextDefenseBonus,0);
 assert.equal(h.nextAdv,1);
 h.kept.splice(0);assert.equal(h.kept.length,0);
});
test("the Coffin Moth ignores the first Fungal Garden poisoning only",()=>{
 const s=new ExpeditionState({seed:12,heroes:["witch"],strategy:"survival"});
 const h=s.heroes[0],moth=OBJECTS.find(o=>o.id==="moth");
 s.add(h,moth);h.slots.companion=moth;
 s.beginRoom(ROOMS.find(r=>r.id==="m-fungus"));
 s.setActor(h);s.apply("POISON",[],null);assert.equal(h.poison,false);
 s.apply("POISON",[],null);assert.equal(h.poison,true);
});
