import test from "node:test";
import assert from "node:assert/strict";
import { startRun, availableActions, act, currentRoom, currentMonster, LAST_FLOOR } from "../src/engine.js";
import { HEROES, CATALOGUE, APPEARANCES, EFFECTS } from "../src/data.js";

test("catalogue specimens have unique type IDs and ink drawings",()=>{
  const ids=CATALOGUE.map(x=>x.type+":"+x.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(CATALOGUE.length >= 30);
  assert.ok(CATALOGUE.every(x=>x.title && x.art && x.rule));
});
test("run generation is reproducible and maps appearances one-to-one",()=>{
  const first=startRun("wizard",123456), second=startRun("wizard",123456);
  assert.deepEqual(first.assignments,second.assignments);
  assert.deepEqual(first.inventory,second.inventory);
  assert.deepEqual(new Set(Object.values(first.assignments)),new Set(EFFECTS.map(e=>e.id)));
  assert.equal(Object.keys(first.assignments).length,APPEARANCES.length);
});
test("hero archetypes initialize with correct stats",()=>{
  for(const hero of HEROES) {
    const run=startRun(hero.id,42);
    assert.equal(run.hp,hero.hp);
    assert.equal(run.maxHp,hero.hp);
    assert.equal(run.attack,hero.attack);
    assert.equal(run.defense,hero.defense);
    assert.equal(run.position,0);
  }
});
test("invalid actions cannot mutate state or use inventory",()=>{
  const run=startRun("delver",91);
  const before=JSON.stringify(run);
  assert.equal(act(run,"attack"),run);
  assert.equal(act(run,"drink",99),run);
  assert.equal(JSON.stringify(run),before);
});
test("exploration adds a persistent room and consumes one turn",()=>{
  const run=startRun("delver",101);
  const advanced=act(run,"explore");
  assert.equal(advanced.position,1);
  assert.equal(advanced.rooms.length,2);
  assert.equal(advanced.turn,1);
  assert.ok(advanced.hunger<=23);
  assert.equal(run.rooms.length,1);
});
test("drinking reveals the correct potion identity without changing mappings",()=>{
  const run=startRun("wizard",137);
  const potion=run.inventory[0];
  const effect=run.assignments[potion.id];
  const after=act(run,"drink",0);
  assert.equal(after.known[potion.id],effect);
  assert.equal(after.inventory.length,run.inventory.length-1);
  assert.deepEqual(after.assignments,run.assignments);
});
test("throwing potions cannot occur outside an encounter",()=>{
  const run=startRun("wizard",137);
  assert.equal(availableActions(run).some(x=>x.id==="throw"),false);
});
test("descend, claim the amulet, and return to win",()=>{
  let state=startRun("knight",2026);
  for(let depth=1;depth<=LAST_FLOOR;depth++) {
    if(currentMonster(state)) currentRoom(state).monster.hp=0;
    state.hp=50;state.hunger=30;
    state=act(state,"explore");
    assert.equal(state.position,depth);
  }
  currentRoom(state).monster.hp=0;
  state.hp=50;state.hunger=30;
  state=act(state,"claim");
  assert.equal(state.phase,"ascending");
  assert.equal(state.hasAmulet,true);
  for(let floor=LAST_FLOOR-1;floor>=0;floor--) {
    state.hp=50;state.hunger=30;
    state=act(state,"return");
    assert.equal(state.position,floor);
  }
  assert.equal(state.phase,"won");
  assert.equal(availableActions(state).length,0);
});
test("death ends a run and disables further actions",()=>{
  const state=startRun("rogue",44);
  state.hp=1; state.hunger=0;
  const after=act(state,"explore");
  assert.equal(after.phase,"dead");
  assert.equal(after.hp,0);
  assert.deepEqual(availableActions(after),[]);
});
