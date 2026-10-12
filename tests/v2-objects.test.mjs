import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {V2_ITEMS,V2_POTIONS,V2_OBJECTS,V2_OBJECT_COPIES,V2_ITEM_FAMILIES,V2_OBJECTS_BY_FAMILY,V2_TAGS} from "../src/v2-objects.js";
import {V2_ROOMS} from "../src/v2-rooms.js";
import {PRINT_DECK as V1_DECK,ITEMS as V1_ITEMS,POTIONS as V1_POTIONS} from "../src/tabletop-data.js";
import {cardMarkup,printSheets,esc} from "../src/tabletop-view.js";
test("Phase 2 is 44 distinct V2 Items and 8 distinct mystery Potions, apart from V1",()=>{
 assert.equal(V2_ITEMS.length,44);assert.equal(V2_POTIONS.length,8);
 assert.equal(V2_OBJECTS.length,52);
 assert.equal(new Set(V2_OBJECTS.map(o=>o.id)).size,52);
 assert.deepEqual(V2_ITEM_FAMILIES,["TOOL","EQUIPMENT","COMPANION","RELIC","SCROLL","RING","WAND"]);
 assert.deepEqual(V2_ITEM_FAMILIES.map(f=>V2_OBJECTS_BY_FAMILY[f].length),[8,6,4,4,8,7,7]);
 assert.equal(V2_OBJECTS_BY_FAMILY.POTION.length,8);
 assert.equal(V2_OBJECT_COPIES.length,V2_OBJECTS.reduce((n,c)=>n+c.copies,0));
 assert.ok(V2_OBJECT_COPIES.length>V2_OBJECTS.length);
 for(const c of V2_OBJECTS)assert.ok(c.copies>=1&&c.copies<=3);
 assert.equal(V1_ITEMS.length,17);assert.equal(V1_POTIONS.length,3);
 assert.ok(V1_DECK.every(c=>!c.v2),"no V1 card gains a V2 definition");
 assert.ok(!readFileSync("src/tabletop-app.js","utf8").includes('from "./v2-objects.js"'));
 assert.match(readFileSync("v2-objects.html","utf8"),/v2-objects-app\.js/);
 assert.match(readFileSync("rules.html","utf8"),/CORE RULES/);
});
function faces(range){
 const parts=range.split("–").map(Number);
 assert.ok(parts.length===1||parts.length===2,"invalid range: "+range);
 const [a,b=a]=parts;
 assert.ok(Number.isInteger(a)&&Number.isInteger(b)&&a>=1&&b<=6&&a<=b,range);
 return Array.from({length:b-a+1},(_,i)=>a+i);
}
test("Every die table is completely printed with non-overlapping faces and 3 or 4 results",()=>{
 let rolls=0,three=0,four=0;
 for(const card of V2_OBJECTS){
  assert.ok(card.v2.kind&&card.v2.trigger,card.id);
  assert.ok(card.v2.tags.length>0);
  assert.ok(card.v2.tags.every(t=>V2_TAGS.includes(t)),card.id);
  assert.ok(card.v2.alternative&&card.v2.alternative.length<180,card.id);
  assert.equal(card.rule,card.v2.trigger,card.id);
  const html=cardMarkup(card);
  assert.match(html,/tt-layout-v2-object/);
  assert.match(html,/tt-v2-trigger/);
  assert.match(html,/tt-v2-tags/);
  assert.ok(html.includes(card.title),card.id);
  assert.ok(html.includes(card.v2.kind),card.id);
  if(!card.v2.roll)continue;
  rolls++;
  const outcomes=card.v2.roll.outcomes;
  assert.ok([3,4].includes(outcomes.length),card.id);
  outcomes.length===3?three++:four++;
  const covered=new Set();
  for(const {range,effect} of outcomes){
   assert.ok(effect&&effect.length<110,card.id+range);
   for(const f of faces(range)){
    assert.ok(!covered.has(f),card.id+" duplicates "+f);
    covered.add(f);
   }
   assert.ok(html.includes(range),card.id);
   assert.ok(html.includes(esc(effect)),card.id);
  }
  assert.deepEqual([...covered].sort(),[1,2,3,4,5,6],card.id);
 }
 assert.ok(rolls>=36,{rolls});
 assert.ok(three>=20,{three});
 assert.ok(four>=3,{four});
});
test("Wands misfire or break, have distinct outcomes and recharge via printed Shrine interaction",()=>{
 const wands=V2_OBJECTS_BY_FAMILY.WAND;
 assert.equal(wands.length,7);
 for(const c of wands){
  assert.match(c.v2.trigger,/roll d6/i);
  assert.match(c.v2.trigger,/turn sideways|recharges it/i,c.id);
  assert.match(c.v2.alternative,/SHRINE:.*recharge/i,c.id);
  assert.match(c.v2.alternative,/OVERCHARGE:.*discard Wand.*lose d6 HP/i,c.id);
  assert.match(c.v2.roll.outcomes[0].effect,/misfire|fizzle|breaks|backfire/i,c.id);
  assert.ok(c.v2.tags.includes("MAGIC"));
  assert.ok(c.v2.links.some(id=>V2_ROOMS.some(r=>r.id===id)));
 }
});
test("Rings roll once per Room or tempt with a curse; Scrolls are consumed",()=>{
 for(const c of V2_OBJECTS_BY_FAMILY.RING){
  assert.ok(c.v2.tags.includes("MAGIC")||c.v2.tags.includes("CURSED"));
  assert.ok(/ONCE PER ROOM|CURSED RING/.test(c.v2.trigger),c.id);
  assert.ok(c.v2.roll||c.v2.tags.includes("CURSED"),c.id);
 }
 for(const c of V2_OBJECTS_BY_FAMILY.SCROLL){
  assert.match(c.v2.trigger,/discard/i,c.id);
  assert.ok(c.v2.roll&&c.v2.roll.outcomes.length>=3,c.id);
 }
 for(const c of V2_POTIONS){
  assert.equal(c.type,"potion");
  assert.match(c.v2.trigger,/FIRST USE: Roll d6/);
  assert.match(c.v2.trigger,/share this result/);
  assert.match(c.v2.alternative,/face up/);
  assert.equal(c.v2.roll.outcomes.reduce((n,row)=>n+faces(row.range).length,0),6,c.id);
 }
 for(const c of V2_OBJECTS_BY_FAMILY.RELIC)assert.equal(c.copies,1,c.id);
});
test("Items genuinely connect to V2 Room IDs and familiar Room-named tools survive migration",()=>{
 const rooms=new Map(V2_ROOMS.map(r=>[r.id,r]));
 for(const c of V2_OBJECTS){
  assert.ok(c.v2.links.length>0,c.id+" is isolated");
  for(const id of c.v2.links)assert.ok(rooms.has(id),c.id+" links nonexistent Room "+id);
 }
 const linkedRooms=new Set(V2_OBJECTS.flatMap(c=>c.v2.links));
 assert.ok(linkedRooms.size>=26,"too few Rooms referenced by the Objects");
 const names=new Set(V2_OBJECTS.map(c=>c.title));
 for(const name of ["Rusty Key","Knotted Rope","Pitch Torch","Loyal Hound","Tunnel Raven","Antidote"]){
  assert.ok(names.has(name),"Room's named Item needs a direct V2 successor: "+name);
 }
 assert.ok(V2_OBJECTS.some(c=>c.v2.tags.includes("ALCHEMY")&&/POISONED/.test(JSON.stringify(c.v2))));
 assert.ok(V2_OBJECTS.some(c=>c.v2.tags.includes("CURSED")&&/SHRINE/.test(JSON.stringify(c.v2))));
 assert.ok(V2_OBJECTS.some(c=>c.v2.tags.includes("FIRE")&&/Fungal Garden/.test(JSON.stringify(c.v2))));
 assert.ok(linkedRooms.has("u-shrine")&&linkedRooms.has("m-altar")&&linkedRooms.has("d-bazaar"));
});
test("All 52 physical cards render, 4 per A4 with deterministic titles, no arbitrary V1 additions",()=>{
 assert.equal((printSheets(V2_OBJECTS).match(/class="tt-sheet"/g)||[]).length,13);
 assert.equal((printSheets(V2_OBJECT_COPIES).match(/class="tt-sheet"/g)||[]).length,Math.ceil(V2_OBJECT_COPIES.length/4));
 assert.deepEqual(V2_OBJECTS.map(c=>c.v2.number),Array.from({length:52},(_,i)=>i+1));
 for(const c of V2_OBJECTS){
  const html=cardMarkup(c);
  assert.match(html,/data-assembly="collage"/);
  assert.ok(html.includes('data-v2-kind="'+c.v2.kind+'"'),c.id);
  assert.ok(html.includes('No. '+String(c.v2.number).padStart(2,"0")),c.id);
 }
});


test("Shared properties are used by real Room options, not just decorative tags",()=>{
 const triggers=V2_ROOMS.flatMap(r=>r.v2.choices.map(x=>x.effect));
 for(const tag of ["FIRE","MAGIC","METAL","ALCHEMY"]){
  assert.ok(V2_OBJECTS.filter(c=>c.v2.tags.includes(tag)).length>=2,tag);
  assert.ok(triggers.filter(t=>t.includes(tag)).length>=1,tag+" never appears as a real Room interaction");
 }
 const fireRooms=V2_ROOMS.filter(r=>r.v2.choices.some(c=>c.effect.includes("FIRE")));
 assert.ok(fireRooms.length>=3);
 for(const id of ["u-lamp","m-fungus","d-choir","u-fountain","m-auction","m-beetle","d-reliquary","d-mirror"]){
  assert.ok(V2_ROOMS.some(r=>r.id===id&&/FIRE|MAGIC|ALCHEMY|METAL/.test(JSON.stringify(r.v2.choices))),id);
 }
});


test("Named item overrides select a real outcome band on their referenced Room",()=>{
 const byId=new Map(V2_ROOMS.map(r=>[r.id,r]));
 const checks=[
  ["skull","u-puppet","6"],
  ["scroll-frost","m-flood","6"],
  ["ring-eye","d-oracle","6"],
  ["ring-spores","m-fungus","5–6"],
  ["ring-ashes","u-lamp","5–6"],
  ["mirror","d-mirror","5–6"]
 ];
 for(const [itemId,roomId,band] of checks){
  const object=V2_ITEMS.find(c=>c.id===itemId),room=byId.get(roomId);
  assert.ok(object&&room,itemId+" links "+roomId);
  assert.ok(object.v2.links.includes(roomId),itemId+" missing room reference");
  assert.ok(room.v2.roll.outcomes.some(o=>o.range===band),roomId+" missing real "+band+" outcome");
  assert.ok(object.v2.alternative.includes(band),itemId+" does not name "+band);
 }
 for(const room of V2_ROOMS){
  if(room.v2.roll.outcomes.length!==4)continue;
  for(const choice of room.v2.choices){
   assert.ok(!/choose 5–6/.test(choice.effect),room.id+" has 5 and 6 separately");
  }
 }
 assert.match(V2_ITEMS.find(c=>c.id==="spore-jar").v2.alternative,/discard/i);
});
