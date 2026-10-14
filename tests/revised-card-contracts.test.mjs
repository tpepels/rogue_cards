import test from "node:test";
import assert from "node:assert/strict";
import {ROOMS,MONSTERS,OBJECTS} from "../src/tabletop-data.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {ROLL_EFFECTS} from "../src/effect-model.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {legalActions} from "../src/engine/index.js";
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
