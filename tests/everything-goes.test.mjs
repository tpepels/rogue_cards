import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions} from "../src/engine/decision-session.js";
import {createGame,enterNextRoom,finishCurrentRoom} from "../src/engine/index.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {PRINT_ONLY_ROOMS,PRINT_ONLY_ITEMS} from "../src/print-expansion.js";
import {EXTRA_MONSTERS} from "../src/monster-expansion.js";
import {ALL_ROOMS,ALL_MONSTERS,ALL_OBJECTS,selectionForPreset,selectionSummary} from "../src/decks.js";

test("Everything Goes contains the entire regional print deck and the new Monsters",()=>{
 const s=createDecisionSession({seed:5,heroes:["warrior"],gameMode:"everything-goes"});
 assert.equal(s.state.roomGoal,12);
 for(const [stage,count] of [["UPPER",29],["MIDDLE",27],["DEEP",23]])
  assert.equal(s.state.rooms[stage].length,count);
 assert.equal(EXTRA_MONSTERS.length,12);
 assert.equal(ALL_ROOMS.length,79);
 assert.equal(ALL_MONSTERS.length,24);
 assert.equal(ALL_OBJECTS.length,61);
 assert.equal(s.state.monsters.UPPER.length,20);
 assert.equal(s.state.monsters.MIDDLE.length,16);
 assert.equal(s.state.monsters.DEEP.length,16);
 assert.equal(selectionSummary(selectionForPreset("chaos")).counts.UPPER,29);
});
test("Original study mode retains three-Room progression and its original piles",()=>{
 const s=createDecisionSession({seed:5,heroes:["warrior"]});
 assert.equal(s.state.roomGoal,3);
 assert.equal(s.state.rooms.UPPER.length,24);
 assert.equal(s.state.rooms.MIDDLE.length,22);
 assert.equal(s.state.rooms.DEEP.length,18);
 assert.equal(s.state.monsters.UPPER.length,12);
});
test("All fifteen added Rooms are executable and preserve their printed d6 bands",()=>{
 assert.equal(PRINT_ONLY_ROOMS.length,15);
 for(const room of PRINT_ONLY_ROOMS){
  const model=ROOM_EFFECTS[room.id];
  assert.ok(model,room.id);
  assert.equal(model.choices.length,2,room.id);
  assert.equal(model.outcomes.length,room.v2.roll.outcomes.length,room.id);
 }
 const a=ROOM_EFFECTS["ex-u-cracked-hall"];
 assert.ok(a.outcomes[0].includes("MONSTER_DRAW"));
 assert.ok(ROOM_EFFECTS["ex-m-drain-tunnel"].outcomes[0].includes("MONSTER_DRAW"));
 assert.ok(ROOM_EFFECTS["ex-d-ash-corridor"].outcomes[0].includes("MONSTER_DRAW"));
});
test("Twelve new Monsters have complete printed behaviours, parley and remains",()=>{
 for(const mob of EXTRA_MONSTERS){
  assert.equal(mob.behavior.length,4,mob.id);
  assert.equal(mob.v2.behaviorOps.length,4,mob.id);
  assert.ok(mob.v2.parley,mob.id);
  assert.ok(mob.v2.remains,mob.id);
 }
});
test("Extra Monsters receive legal Parley actions and EAT on defeat",()=>{
 const s=createDecisionSession({seed:16,gameMode:"everything-goes"});
 const mob=EXTRA_MONSTERS.find(m=>m.id==="drain-leech");
 s.state.room=s.state.rooms.UPPER[0];
 s.state.monster=mob;s.state.monsterHP=mob.hp;
 s.phase="parley";
 assert.ok(sessionActions(s).some(x=>x.kind==="parley"));
 s.state.monsterHP=0;s.phase="corpse";
 assert.ok(sessionActions(s).some(x=>x.kind==="eat"));
});
test("Print expansion healing and equipment can affect the canonical state",()=>{
 const s=createGame({seed:16,gameMode:"everything-goes"}),h=s.heroes[0];
 const helm=PRINT_ONLY_ITEMS.find(x=>x.id==="ex-buckler");
 s.add(h,helm);h.slots.armour=helm;
 assert.equal(s.stats(h).def,h.card.def+2);
 assert.ok(enterNextRoom(s).room);
});

test("Corridors add visits but do not consume the twelve-room stage limit",()=>{
 const game=createGame({seed:22,gameMode:"everything-goes"});
 game.stageProgress.UPPER=11;
 const corridor=PRINT_ONLY_ROOMS.find(c=>c.id==="ex-u-cracked-hall");
 game.beginRoom(corridor);
 finishCurrentRoom(game);
 assert.equal(game.stageProgress.UPPER,11);
 const ordinary=ALL_ROOMS.find(c=>c.id==="u-gate");
 game.beginRoom(ordinary);
 finishCurrentRoom(game);
 assert.equal(game.stageProgress.UPPER,12);
});
test("Trapdoors mark skipped depths complete under the twelve-Room rule",()=>{
 const game=createGame({seed:22,gameMode:"everything-goes"});
 const ordinary=ALL_ROOMS.find(c=>c.id==="u-gate");
 game.beginRoom(ordinary);
 game.fallThrough("DEEP",{damage:0});
 assert.equal(game.stageProgress.UPPER,12);
 assert.equal(game.stageProgress.MIDDLE,12);
});
