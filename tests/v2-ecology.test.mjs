import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MONSTERS as V1_MONSTERS,PRINT_DECK as V1_PRINT} from "../src/tabletop-data.js";
import {V2_MONSTERS,V2_MONSTER_BY_ID} from "../src/v2-monsters.js";
import {V2_ROOMS} from "../src/v2-rooms.js";
import {V2_OBJECTS,V2_ITEMS,V2_OBJECTS_BY_FAMILY} from "../src/v2-objects.js";
import {cardMarkup,printSheets,esc} from "../src/tabletop-view.js";
const getItem=id=>V2_OBJECTS.find(x=>x.id===id);
const getRoom=id=>V2_ROOMS.find(x=>x.id===id);
const getMonster=id=>V2_MONSTER_BY_ID[id];
test("all twelve Monsters have self-contained V2 ecology, without mutating the V1 deck",()=>{
 assert.equal(V2_MONSTERS.length,12);
 assert.equal(Object.keys(V2_MONSTER_BY_ID).length,12);
 assert.equal(V1_MONSTERS.length,12);
 assert.equal(V1_MONSTERS.some(m=>m.v2),false);
 assert.equal(V1_PRINT.some(c=>c.v2),false);
 assert.deepEqual(V2_MONSTERS.map(m=>m.stage),V1_MONSTERS.map(m=>m.stage));
 for(const m of V2_MONSTERS){
  const v1=V1_MONSTERS.find(c=>c.id===m.id);
  assert.ok(v1,m.id);
  assert.equal(m.type,"monster");
  assert.equal(m.hp,v1.hp);assert.equal(m.atk,v1.atk);assert.equal(m.def,v1.def);
  assert.deepEqual(m.behavior,v1.behavior);
  assert.equal(m.behavior.length,4);
  assert.ok(m.v2.tags.length>=1);
  assert.ok(m.v2.weakness.length>20,m.id);
  assert.ok(m.v2.parley.length>20,m.id);
  assert.ok(m.v2.remains.length>10,m.id);
  const html=cardMarkup(m);
  assert.match(html,/tt-layout-v2-monster/);
  assert.ok(html.includes(esc(m.v2.weakness)),m.id+" weak");
  assert.ok(html.includes(esc(m.v2.parley)),m.id+" parley");
  assert.ok(html.includes(esc(m.v2.remains)),m.id+" remains");
  for(const band of ["1–2","3–4","5","6"])assert.ok(html.includes(">"+band+"</b>"),m.id+":"+band);
 }
 assert.equal((printSheets(V2_MONSTERS).match(/class="tt-sheet"/g)||[]).length,3);
 assert.equal(readFileSync("src/tabletop-app.js","utf8").includes('from "./v2-monsters.js"'),false);
 assert.match(readFileSync("src/v2-monsters-app.js","utf8"),/printSheets/);
});
test("monster weaknesses have matching printed Items: fire, ice, lightning, beasts, negotiation",()=>{
 const monsterCases=[
  ["rat","dog",/BEAST/],
  ["eye","ring-eye",/Ring of the Sideways Eye/],
  ["mold","scroll-flame",/FIRE/],
  ["mold","wand-frost",/ICE/],
  ["sentinel","scroll-lightning",/LIGHTNING/],
  ["rust","crowbar",/METAL/],
  ["goblin","goblin-pet",/Pocket Goblin/],
  ["cultist","ring-hunger",/CURSED/]
 ];
 for(const [monsterId,itemId,matcher] of monsterCases){
  const monster=getMonster(monsterId),item=getItem(itemId);
  assert.ok(monster&&item,monsterId+" / "+itemId);
  assert.match(monster.v2.weakness+monster.v2.parley,matcher);
 }
 assert.match(getMonster("goblin").v2.parley,/RECRUIT/);
 assert.match(getMonster("rust").v2.parley,/METAL/);
 assert.match(getMonster("wraith").v2.parley,/CURSED/);
 assert.match(getMonster("sentinel").v2.remains,/No edible corpse/);
});
test("the seven Wands have costly finite overcharges and readable recharge alternatives",()=>{
 const wands=V2_OBJECTS_BY_FAMILY.WAND;
 assert.equal(wands.length,7);
 for(const wand of wands){
  assert.match(wand.v2.trigger,/sideways until/i,wand.id);
  assert.match(wand.v2.alternative,/SHRINE:.*recharge/i,wand.id);
  assert.match(wand.v2.alternative,/OVERCHARGE: discard Wand, lose d6 HP;/i,wand.id);
  const best=wand.v2.roll.outcomes.at(-1).range;
  assert.ok(wand.v2.alternative.endsWith("choose "+best+"."),wand.id+" overcharge selects missing range");
  assert.ok(/fizzle|misfire|break|backfire/i.test(wand.v2.roll.outcomes[0].effect),wand.id);
 }
 assert.match(getItem("lantern-heart").v2.alternative,/straighten one sideways Wand/);
 const rechargeable=V2_ROOMS.filter(r=>r.v2.choices.some(c=>/recharge a Wand|straighten a Wand/i.test(c.effect)));
 assert.ok(rechargeable.length>=4,rechargeable.map(r=>r.id));
 assert.ok(rechargeable.every(r=>r.v2.choices.length===2));
});
test("phase 3 interactive network is printed rather than only metadata",()=>{
 const cases=[
  ["scroll-flame",null,"Fungal Garden"],
  ["scroll-frost",null,"Flooded Chamber"],
  ["scroll-lightning",null,"Iron Sentinel"],
  ["scroll-banish",null,"Warden"],
  ["scroll-last",null,"CURSED"],
  ["ring-hunger",null,"MAGIC"],
  ["ring-eye",null,"Floating Eye"],
  ["ring-spores",null,"Living Mold"],
  ["ring-ashes",null,"Living Mold"],
  ["ring-echo",null,"CURSED"],
  ["dog",null,"Giant Rat"],
  ["raven",null,"Floating Eye"],
  ["moth",null,"Living Mold"]
 ];
 for(const [id,,term] of cases){
  const item=getItem(id);
  assert.ok(item,id);
  assert.ok(JSON.stringify(item.v2).includes(term),id+" lacks printed term "+term);
 }
 for(const [id,term] of [
  ["u-shrine","CURSED"],["u-supply","Wand"],["m-statue","MAGIC"],
  ["m-well","CURSED"],["m-clock","Wand"],["d-shadow","ICE"],
  ["d-bazaar","Wand"],["d-crown","Wand"]
 ]){
  const room=getRoom(id);
  assert.ok(room, id);
  assert.ok(JSON.stringify(room.v2.choices).includes(term),id+" missing "+term);
 }
});
test("dice-band changes refer to valid printable outcomes, including four-result 6",()=>{
 const monsterBands=["1–2","3–4","5","6"];
 for(const m of V2_MONSTERS){
  const lines=[m.v2.weakness,m.v2.parley,m.v2.remains];
  for(const line of lines){
   assert.ok(!/turn the next 5–6|its 5–6/.test(line),m.id+" invents a behaviour band");
  }
  assert.ok(m.behavior.length===monsterBands.length);
 }
 for(const item of V2_OBJECTS){
  const alt=item.v2.alternative||"";
  assert.ok(!/DIS on (?:a )?d6/i.test(alt),item.id);
 }
 assert.match(getItem("ring-echo").v2.alternative,/Room dice only/);
 assert.match(getItem("scroll-mischief").v2.roll.outcomes[0].effect,/if no Monster/);
});
test("the physical V2 rules remain one-page and the prior V1 rulebook is unchanged",()=>{
 const v2=readFileSync("rules-v2.html","utf8"),v1=readFileSync("rules.html","utf8");
 assert.match(v2,/@page\{size:A4 portrait/);
 assert.match(v2,/one Ring/);
 assert.match(v2,/Sideways Wands cannot be used until recharged/);
 assert.match(v1,/ROGUE CARDS/);
 assert.doesNotMatch(v1,/OVERCHARGE|Ring of Echoes|Phase 3/);
});
