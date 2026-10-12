import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ROOMS as V1_ROOMS,PRINT_DECK as V1_DECK} from "../src/tabletop-data.js";
import {V2_ROOMS,V2_REGIONS,V2_ROOMS_BY_REGION,V2_ROOM_KINDS} from "../src/v2-rooms.js";
import {cardMarkup,printSheets} from "../src/tabletop-view.js";
const decode=range=>range.split("–").map(Number);
test("Phase 1 contains exactly 36 independent V2 Rooms, 12 per region",()=>{
 assert.equal(V2_ROOMS.length,36);
 assert.equal(new Set(V2_ROOMS.map(c=>c.id)).size,36);
 for(const region of V2_REGIONS){
  assert.equal(V2_ROOMS_BY_REGION[region].length,12,region);
  assert.ok(V2_ROOMS_BY_REGION[region].every(c=>c.stage===region));
  assert.ok(new Set(V2_ROOMS_BY_REGION[region].map(c=>c.v2.kind)).size>=5,region);
 }
 assert.deepEqual([...new Set(V2_ROOMS.map(c=>c.v2.kind))].sort(),[...V2_ROOM_KINDS].sort());
});
test("All Room cards have complete, nonoverlapping printed d6 outcome ranges",()=>{
 for(const card of V2_ROOMS){
  const {v2}=card;
  assert.equal(card.type,"room",card.id);
  assert.equal(card.copies,1,card.id);
  assert.equal(v2.roll.die,"d6",card.id);
  assert.ok(v2.prompt.length>5,card.id);
  assert.equal(v2.choices.length,2,card.id);
  assert.ok(v2.choices.some(c=>c.effect.includes("Roll d6")||c.effect.includes("roll d6")),card.id);
  assert.ok(v2.choices.every(c=>c.label&&c.effect),card.id);
  assert.ok([3,4].includes(v2.roll.outcomes.length),card.id);
  const faces=new Set();
  for(const {range,effect} of v2.roll.outcomes){
   assert.ok(effect&&effect.length<100,card.id+":"+range);
   const ends=decode(range);
   assert.ok(ends.every(x=>Number.isInteger(x)),card.id+":"+range);
   const min=ends[0],max=ends[1]??ends[0];
   assert.ok(min>=1&&max<=6&&max>=min,card.id+":"+range);
   for(let d=min;d<=max;d++){
    assert.ok(!faces.has(d),"Repeated d6 face "+d+" on "+card.id);
    faces.add(d);
   }
  }
  assert.deepEqual([...faces].sort(),[1,2,3,4,5,6],card.id);
  const html=cardMarkup(card);
  assert.match(html,/tt-layout-v2-room/);
  assert.match(html,/tt-v2-choice/);
  assert.match(html,/tt-v2-results/);
  assert.ok(html.includes("ROLL d6"),card.id);
  for(const {range} of v2.roll.outcomes)assert.ok(html.includes(range),card.id+":"+range);
  assert.match(html,new RegExp('data-id="'+card.id+'"'));
 }
});
test("Rooms embed interesting interactions, danger and genuinely distinct choices",()=>{
 const all=V2_ROOMS.map(r=>r.v2.roll.outcomes.map(o=>o.effect).join(" ")+" "+r.v2.choices.map(c=>c.effect).join(" "));
 assert.ok(all.filter(s=>s.includes("Monster")).length>=16);
 assert.ok(all.filter(s=>/peek|next Room/i.test(s)).length>=8);
 assert.ok(all.filter(s=>/POISONED|curse|cursed/i.test(s)).length>=6);
 assert.ok(all.filter(s=>/discard 1 Item|Discard 2 Items/i.test(s)).length>=10);
 assert.ok(all.filter(s=>/heal/i.test(s)).length>=20);
 assert.ok(V2_ROOMS.filter(r=>r.v2.roll.outcomes.length===4).length>=10,
  "At least ten Rooms need four-result tables (1–2, 3–4, 5, 6)");
 assert.ok(V2_ROOMS.filter(r=>r.v2.choices.some(c=>/opposed d20/i.test(c.effect))).length>=4,
  "Obstacles and NPCs need meaningful opposed d20 rolls");
 assert.ok(V2_ROOMS.filter(r=>r.v2.choices.some(c=>/roll again|reroll once/i.test(c.effect))).length>=3,
  "Risky Rooms should allow deliberate push-your-luck rolls");
 assert.ok(V2_ROOMS.filter(r=>/Draw an? (UPPER|MIDDLE|DEEP) Monster/.test(r.v2.prompt)&&r.v2.choices.some(c=>c.label==="FIGHT")).length>=3,
  "Some Rooms should start with a Monster and offer a fight-or-negotiate choice");
 assert.ok(V2_ROOMS.filter(r=>r.v2.links.length).length>=25);
 for(const named of ["Rusty Key","Knotted Rope","Pitch Torch","Tunnel Raven","Loyal Hound","Antidote","cursed Items"]){
  assert.ok(V2_ROOMS.some(r=>r.v2.links.includes(named)),named);
 }
});
test("Physical four-per-A4 V2 preview is separate from untouched V1 print deck",()=>{
 assert.equal((printSheets(V2_ROOMS).match(/class="tt-sheet"/g)||[]).length,9);
 assert.equal((printSheets(V2_ROOMS_BY_REGION.UPPER).match(/class="tt-sheet"/g)||[]).length,3);
 assert.equal(new Set(V2_ROOMS.map(c=>c.v2.number)).size,36);
 assert.deepEqual(V2_ROOMS.map(c=>c.v2.number),Array.from({length:36},(_,i)=>i+1));
 const v1Ids=V1_ROOMS.map(c=>c.id);
 assert.ok(V2_ROOMS.some(r=>v1Ids.includes(r.id)),"Some familiar places are deliberately redesigned in V2");
 assert.equal(V1_DECK.some(c=>c.v2),false,"V1 print cards must not be silently upgraded");
 assert.doesNotMatch(readFileSync("rules.html","utf8"),/V2 DEVELOPMENT DECK/);
 assert.match(readFileSync("rules-v2.html","utf8"),/V2/);
 const home=readFileSync("src/tabletop-app.js","utf8");
 assert.match(home,/v2-rooms\.html/);
 assert.doesNotMatch(readFileSync("src/tabletop-app.js","utf8"),/import .*v2-rooms\.js/);
});
