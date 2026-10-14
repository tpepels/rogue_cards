import test from "node:test";
import assert from "node:assert/strict";
import {ROOMS,MONSTERS,OBJECTS} from "../src/tabletop-data.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {ROLL_EFFECTS} from "../src/effect-model.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {legalActions,observeGame} from "../src/engine/index.js";
import {monsterRespond} from "../src/engine/combat.js";
import {settleMonsterVictory} from "../src/engine/combat-outcomes.js";
import {monsterEntry} from "../src/room-memory-engine.js";

const room=id=>ROOMS.find(c=>c.id===id);
const monster=id=>MONSTERS.find(c=>c.id===id);
const game=(seed=891)=>new ExpeditionState({seed,heroes:["warrior"]});
const empty=s=>{for(const h of s.heroes)
 while(h.inventory.length)s.remove(h,h.inventory[0]);};

test("every special Room's revised printed d6 bands have executable operations",()=>{
 for(const c of ROOMS.filter(c=>c.v2.special)){
  assert.equal(c.v2.special.rollOps.length,c.v2.roll?.outcomes.length||0,
   c.id+" has a mismatched printed/executable dice table");
  for(const ops of c.v2.special.rollOps)
   assert.ok(Array.isArray(ops)&&ops.length>0,c.id);
 }
 const oracle=room("d-oracle");
 assert.equal(oracle.v2.roll,null);
 assert.deepEqual(ROOM_EFFECTS[oracle.id].choices,
  [["ORACLE_PROPHECY"],["PEEK:1"]]);
 const s=game();s.beginRoom(oracle);
 assert.deepEqual(legalActions(s,{phase:"room"}).map(a=>a.index),[0,1]);
});
test("unpayable Bottomless Well and Hungry Door choices are excluded before selection",()=>{
 for(const id of ["m-well","m-hungry-door"]){
  const s=game();empty(s);s.beginRoom(room(id));
  const legal=legalActions(s,{phase:"room"});
  assert.deepEqual(legal.map(a=>a.index),[1],id);
 }
});
test("Notched Sword and Spore Jar follow revised printed outcomes",()=>{
 const cards=new Map(OBJECTS.map(c=>[c.id,c]));
 assert.match(cards.get("sword").v2.roll.outcomes[0].effect,/DIS/);
 assert.deepEqual(ROLL_EFFECTS.sword[0],["NEXT_DIS"]);
 assert.deepEqual(ROLL_EFFECTS["spore-jar"][0],["POISON","NEXT_WIT_DIS"]);
 assert.deepEqual(ROLL_EFFECTS["spore-jar"][1],["FORCE_BEHAVIOR:1"]);
});
test("Wisp LURE moves a still-unseen Room to bottom and applies DIS without damage",()=>{
 const s=game(892),h=s.heroes[0],m=monster("wisp");
 s.beginRoom(room("m-fungus"));s.monster=m;s.monsterHP=m.hp;
 const hp=h.hp,deck=s.rooms.MIDDLE,first=deck[0];
 assert.ok(first);
 s.forcedBehavior=5;
 monsterRespond(s,h);
 assert.equal(h.hp,hp);
 assert.ok(h.nextDis>0);
 assert.strictEqual(deck[deck.length-1],first);
});
test("Goblin SWIPE keeps the real physical Item separate and returns it on defeat",()=>{
 const s=game(893),h=s.heroes[0],m=monster("goblin");
 s.beginRoom(room("u-nest"));s.monster=m;s.monsterHP=m.hp;
 assert.ok(h.inventory.length);
 const n=h.inventory.length;
 s.forcedBehavior=5;
 monsterRespond(s,h);
 assert.equal(s.stashedMonsterItems?.length,1);
 assert.equal(h.inventory.length,n-1);
 const stolen=s.stashedMonsterItems[0].card;
 s.monsterHP=0;
 settleMonsterVictory(s,m);
 assert.ok(h.inventory.includes(stolen));
 assert.equal(s.stashedMonsterItems.length,0);
});

test("Wax Bridge blocks up to three fall damage and never banishes a Monster",()=>{
 const wax=room("m-wax-bridge"),m=monster("rat");
 const s=game(894);
 // Isolate Wax's printed -3 prevention. A physical Rope can legally
 // absorb the remaining 2 HP as a separate optional Item decision.
 for(const card of [...s.heroes[0].inventory])
  if(card.id==="rope")s.remove(s.heroes[0],card);
 s.keptRooms.push({card:wax});
 s.beginRoom(room("u-fall"));
 const hp=s.heroes[0].hp;
 assert.equal(monsterEntry(s,m),false,"Wax has no printed Monster escape");
 assert.equal(s.heroes[0].hp,hp);
 assert.ok(s.keptRooms.some(x=>x.card===wax));
 s.fallThrough("MIDDLE",{damage:5,monster:false});
 assert.equal(s.pendingTrapLanding.damage,2);
 assert.ok(!s.keptRooms.some(x=>x.card===wax));
});

test("Wax Bridge and physical Rope are separate legal fall-prevention payments",()=>{
 const s=game(894),h=s.heroes[0],wax=room("m-wax-bridge");
 let rope=h.inventory.find(card=>card.id==="rope");
 if(!rope){
  const position=s.deck.findIndex(card=>card.id==="rope");
  assert.ok(position>=0,"At least one physical Rope is available");
  rope=s.deck.splice(position,1)[0];s.noteDeckRemoval(rope);
  s.add(h,rope);
 }
 s.keptRooms.push({card:wax});
 s.beginRoom(room("u-fall"));
 s.fallThrough("MIDDLE",{damage:5,monster:false});
 assert.equal(s.pendingTrapLanding.damage,0,
  "Wax prevents 3 and Rope prevents the remaining 2");
 assert.ok(!s.keptRooms.some(x=>x.card===wax));
 assert.ok(h.used.has(rope),"The physical Rope must be used");
});

test("WIT-only Potion and Oracle modifiers survive ATK checks and expire on the next actual WIT check",()=>{
 const s=game(895),h=s.heroes[0];
 s.beginRoom(room("u-gate"));
 s.witBonus=2;h.nextWitDis=1;
 s.roomCheck("CHECK_ATK",3,"NONE","NONE");
 assert.equal(s.witBonus,2,"An ATK check cannot spend a WIT bonus");
 assert.equal(h.nextWitDis,1,"An ATK check cannot spend WIT disadvantage");
 s.roomCheck("CHECK_WIT",3,"NONE","NONE");
 assert.equal(s.witBonus,0);
 assert.equal(h.nextWitDis,0);
});

test("Ring of Echoes exposes both already-seen faces and accepts either, even the lower roll",()=>{
 const s=game(896),echo=OBJECTS.find(x=>x.id==="ring-echo");
 s.beginRoom(room("u-fountain"));
 const originalDie=s.die.bind(s);
 let desired="first",observed=0;
 s.die=()=>6;
 s._decisionHook=event=>{
  assert.equal(event.phase,"effect-choice");
  assert.equal(event.context,"echoes-choose-room-die");
  assert.deepEqual(observeGame(s).observedRoomReroll,{
   first:2,new:6,roomId:"u-fountain"
  });
  observed++;return {mode:desired};
 };
 s.pendingRoomFace=2;
 s.apply("REROLL_ROOM",["BEST"],echo);
 assert.equal(s.pendingRoomFace,2,"Player may keep the lower original");
 assert.equal(observeGame(s).observedRoomReroll,null);
 desired="new";
 s.pendingRoomFace=2;
 s.apply("REROLL_ROOM",["BEST"],echo);
 assert.equal(s.pendingRoomFace,6);
 assert.equal(observed,2);
 delete s._decisionHook;s.die=originalDie;
});

test("Witch after-Potion reaction uses witch-ability token, not the generic Hero token",()=>{
 const s=new ExpeditionState({seed:897,heroes:["witch"]}),h=s.heroes[0];
 h.used.add("hero");
 assert.deepEqual(legalActions(s,{
  phase:"hero-trigger",heroIndex:0,context:"after-scroll-or-potion"
 }).map(x=>x.kind),["skip","hero-mode","hero-mode"]);
 assert.deepEqual(legalActions(s,{
  phase:"hero-trigger",heroIndex:0,context:"attack"
 }),[]);
 h.used.add("witch-ability");
 assert.deepEqual(legalActions(s,{
  phase:"hero-trigger",heroIndex:0,context:"after-scroll-or-potion"
 }),[]);
});

test("a lethal Potion cannot open an impossible Witch reaction after her HP becomes zero",()=>{
 const s=new ExpeditionState({seed:898,heroes:["witch"]}),h=s.heroes[0];
 const idx=s.deck.findIndex(c=>c.id==="smoky");
 assert.ok(idx>=0);
 const [potion]=s.deck.splice(idx,1);
 s.noteDeckRemoval(potion);s.add(h,potion);
 s.beginRoom(room("u-fountain"));h.hp=1;
 s._decisionHook=event=>{throw Error("Dead Witch must not receive "+event.phase)};
 assert.equal(s.activate(h,potion,{face:1}),true);
 assert.equal(h.hp,0);
 delete s._decisionHook;
});


test("Restless Shade's printed MAGIC weakness changes behavior 5 to 1-2, but 5 remains executable unequipped",()=>{
 const shade=monster("wraith");
 const make=()=>new ExpeditionState({
  seed:20461624,heroes:["warrior","wizard"]
 });
 const equipped=make();
 equipped.beginRoom(room("d-shadow"));
 assert.equal(equipped.heroes[1].slots.weapon?.id,"staff",
  "Wizard must hold the actual printed MAGIC starter for this fixture");
 assert.equal(equipped.anyEquippedTag("MAGIC"),true);
 equipped.monster=shade;equipped.monsterHP=shade.hp;
 equipped.forcedBehavior=5;
 monsterRespond(equipped,equipped.heroes[0]);
 assert.equal(equipped.metrics.monsterBehaviorBands["wraith:0"],1,
  "Equipped MAGIC changes 5 into the 1-2 band");
 assert.equal(equipped.metrics.monsterBehaviorBands["wraith:2"],undefined);
 const unequipped=make();
 unequipped.beginRoom(room("d-shadow"));
 delete unequipped.heroes[1].slots.weapon;
 assert.equal(unequipped.anyEquippedTag("MAGIC"),false);
 unequipped.monster=shade;unequipped.monsterHP=shade.hp;
 unequipped.forcedBehavior=5;
 monsterRespond(unequipped,unequipped.heroes[0]);
 assert.equal(unequipped.metrics.monsterBehaviorBands["wraith:2"],1,
  "Without equipped MAGIC, the printed 5 damage behavior executes");
});
