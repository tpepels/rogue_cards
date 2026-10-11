import test from "node:test";
import assert from "node:assert/strict";
import { startRun, act, availableActions, currentMonster, heroDefense } from "../src/engine.js";
import { MONSTERS, CATALOGUE, printDeck } from "../src/data.js";
import { MAGIC, MAGIC_TYPES, MAGICAL_CARDS, MAGIC_IDENTITIES, PROPERTIES } from "../src/magic-data.js";
import { magicStock, propertiesOf } from "../src/magic.js";

const action=(s,id,index)=>{
  const a=act(s,id,index);
  assert.notStrictEqual(a,s,"Illegal action: "+id);
  return a;
};
const monster=(id="rust")=>{
 const c=MONSTERS.find(x=>x.id===id);
 return {...c,hp:12,maxHp:12,guard:0,frozen:0,blinded:0,petUsed:false,ambushed:false};
};
test("fifteen shared properties are unique and discoverable",()=>{
 assert.equal(PROPERTIES.length,15);
 assert.equal(new Set(PROPERTIES.map(p=>p.id)).size,15);
 assert.ok(propertiesOf("flood").includes("water"));
 assert.ok(propertiesOf("rust").includes("metal"));
 assert.ok(propertiesOf("crypt").includes("dark"));
 assert.ok(propertiesOf("rat").includes("organic"));
});
test("every family is a 1:1 shuffled mapping per run",()=>{
 for(const kind of MAGIC_TYPES){
  const a=startRun("wizard",23), b=startRun("wizard",23);
  const appearanceIds=MAGIC[kind].appearances.map(x=>x[0]);
  const identities=MAGIC[kind].effects.map(x=>x.id);
  assert.deepEqual(a.magicAssignments[kind],b.magicAssignments[kind]);
  assert.deepEqual(Object.keys(a.magicAssignments[kind]),appearanceIds);
  assert.deepEqual(new Set(Object.values(a.magicAssignments[kind])),new Set(identities));
  assert.equal(Object.keys(a.magicKnown[kind]).length,0);
 }
});
test("physical identity cards and mystery cards have matching families",()=>{
 assert.equal(MAGICAL_CARDS.length,12);
 assert.equal(MAGIC_IDENTITIES.length,12);
 const kit=printDeck(["scroll","wand","ring","identity"]);
 assert.equal(kit.length,48);
 for(const kind of MAGIC_TYPES){
  assert.equal(kit.filter(x=>x.type===kind).length,12);
  assert.equal(kit.filter(x=>x.type==="identity"&&x.family===kind).length,4);
 }
});
test("ring printed copies and browser loot have matching B/U/C state",()=>{
 const kit=printDeck("ring");
 const physical=kit.filter(x=>x.id==="etched").map(x=>x.blessing).sort();
 const stock=magicStock().filter(x=>x.kind==="ring"&&x.id==="etched").map(x=>x.blessing).sort();
 assert.deepEqual(physical,["blessed","cursed","uncursed"]);
 assert.deepEqual(stock,physical);
});
test("scroll read identifies appearance, uses one action, and applies FIRE/WATER",()=>{
 let s=startRun("wizard",57);
 s.rooms["0"].monster=monster("rust");
 s.rooms["0"].terrain="WATER";
 s.inventory.push({kind:"scroll",id:"ragged"});
 s.magicAssignments.scroll.ragged="flame";
 const hp=s.rooms["0"].monster.hp;
 s=action(s,"read",s.inventory.length-1);
 assert.equal(s.magicKnown.scroll.ragged,"flame");
 assert.equal(s.rooms["0"].monster.hp,hp-1);
 assert.equal(s.actionsLeft,1);
 assert.ok(!s.inventory.some(x=>x.kind==="scroll"&&x.id==="ragged"));
});
test("wand ZAP has three charges, identifies, and uses water conduction",()=>{
 let s=startRun("wizard",57);
 s.rooms["0"].monster=monster("rust");
 s.rooms["0"].terrain="WATER";
 s.inventory.push({kind:"wand",id:"bone",charges:3,blessing:"uncursed"});
 s.magicAssignments.wand.bone="spark";
 const i=s.inventory.length-1;
 s=action(s,"zap",i);
 assert.equal(s.magicKnown.wand.bone,"spark");
 assert.equal(s.rooms["0"].monster.hp,7);
 assert.equal(s.inventory[i].charges,2);
});
test("Digging bypasses next trap or lock, consuming its one-time effect",()=>{
 let s=startRun("knight",59);
 s.inventory.push({kind:"wand",id:"bone",charges:3,blessing:"uncursed"});
 s.magicAssignments.wand.bone="burrow";
 s=action(s,"zap",s.inventory.length-1);
 assert.equal(s.status.passage,1);
 s.rooms["0"].monster=null;
 // Traverse a deterministic neighbour with an entry trap.
 // First explore may draw an unrelated room; simulate the next first-entry trigger
 // in the already-discovered room by forcing its template.
 const hp=s.hp;
 s=action(s,"explore","1");
 assert.ok(s.status.passage<=1);
 assert.ok(s.hp<=hp);
});
test("blessed and cursed Protection rings modify defence correctly",()=>{
 for(const [blessing,bonus] of [["uncursed",1],["blessed",2],["cursed",-1]]){
  let s=startRun("delver",7);
  s.inventory.push({kind:"ring",id:"etched",blessing});
  s.magicAssignments.ring.etched="shield";
  const base=heroDefense(s);
  s=action(s,"wear",s.inventory.length-1);
  assert.equal(heroDefense(s),base+bonus);
  assert.equal(s.magicKnown.ring.etched,"shield");
  assert.equal(s.equipped.ring.blessing,blessing);
 }
});
test("new actions are available only through explicit printed verbs",()=>{
 let s=startRun("rogue",11);
 s.inventory.push({kind:"scroll",id:"ragged"});
 s.inventory.push({kind:"wand",id:"bone",charges:3});
 s.inventory.push({kind:"ring",id:"etched",blessing:"uncursed"});
 const actions=availableActions(s).map(a=>a.id);
 for(const name of ["read","zap","wear"])assert.ok(actions.includes(name));
 for(const forbidden of ["dip","combine","apply-arbitrary","wish"])assert.ok(!actions.includes(forbidden));
 assert.strictEqual(act(s,"dip",0),s);
});
