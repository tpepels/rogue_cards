import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync,readdirSync,openSync,readSync,closeSync} from "node:fs";
import {HEROES,ROOMS,MONSTERS,ITEMS,POTIONS,OBJECTS,VAULT,WARDEN,WARDEN_FURY,PRINT_DECK,CATALOGUE,ITEM_FAMILIES,CARD_WIDTH_MM,CARD_HEIGHT_MM,catalogue,printDeck} from "../src/tabletop-data.js";
import {cardMarkup,printSheets,CARDS_PER_SHEET,CARD_ART,assetPath,composition,esc} from "../src/tabletop-view.js";
const faces=range=>{const [a,b=a]=range.split("–").map(Number);assert.ok(a>=1&&b<=6&&Number.isInteger(a)&&Number.isInteger(b));return Array.from({length:b-a+1},(_,i)=>a+i)};
const dice=table=>{assert.ok([3,4].includes(table.outcomes.length));const facesFound=table.outcomes.flatMap(r=>{assert.ok(r.effect);return faces(r.range)});assert.deepEqual(facesFound.sort(),[1,2,3,4,5,6])};
test("exactly one complete canonical physical edition",()=>{
 assert.equal(HEROES.length,8);assert.equal(ROOMS.length,36);assert.equal(MONSTERS.length,12);
 assert.equal(ITEMS.length,44);assert.equal(POTIONS.length,8);assert.equal(OBJECTS.length,52);
 assert.equal(CATALOGUE.length,8+36+1+12+2+52);
 assert.equal(new Set(CATALOGUE.map(c=>c.type+":"+c.id)).size,CATALOGUE.length);
 assert.equal(CARD_WIDTH_MM,90);assert.equal(CARD_HEIGHT_MM,130);assert.equal(CARDS_PER_SHEET,4);
 assert.equal(PRINT_DECK.length,CATALOGUE.reduce((n,c)=>n+c.copies,0));
 assert.equal(PRINT_DECK.length,printDeck().length);
 assert.ok(PRINT_DECK.length>CATALOGUE.length);
 assert.equal(catalogue("room").length,37);
 assert.equal(catalogue("monster").length,14);
 assert.equal(catalogue("all","SCROLL").length,8);
 assert.equal(catalogue("all","RING").length,7);
 assert.equal(catalogue("all","WAND").length,7);
 assert.equal(catalogue("all","POTION").length,8);
 for(const family of ITEM_FAMILIES)assert.ok(catalogue("all",family).length>0,family);
 const homepage=readFileSync("src/tabletop-app.js","utf8");
 assert.doesNotMatch(homepage,/v2-(rooms|objects|monsters)\.html|print-and-play\.html/);
 assert.match(homepage,/rules\.html/);
});
test("eight archetypes have unique starting Objects, valid stats and complete d6 skills",()=>{
 const starts=new Set();
 for(const h of HEROES){
  assert.ok(h.hp>=1&&h.hp<=20,"One d20 must show starting HP: "+h.id);
  assert.ok(h.atk>=0&&h.def>=0&&h.wit>=0);
  assert.ok(h.v2.starter&&OBJECTS.some(o=>o.id===h.v2.starter),h.id);
  assert.ok(!starts.has(h.v2.starter),"Duplicate starter "+h.id);
  starts.add(h.v2.starter);
  assert.match(h.v2.trigger,/ONCE PER ROOM/);
  dice(h.v2.roll);
  assert.match(cardMarkup(h),/tt-layout-v2-hero/);
  assert.ok(cardMarkup(h).includes("START WITH"));
 }
});
test("a single d20 can show all Hero and Monster health values",()=>{
 const creatures=[...HEROES,...MONSTERS,WARDEN,WARDEN_FURY];
 for(const card of creatures){
  assert.ok(card.hp>=1&&card.hp<=20,card.id+" needs more than a d20 for HP");
 }
 assert.ok(WARDEN_FURY.hp<WARDEN.hp);
 assert.ok(WARDEN.v2.weakness.includes("10 HP or less"));
});
test("all 36 regional Rooms and the final Vault provide complete d6 choices",()=>{
 assert.equal(ROOMS.filter(r=>r.stage==="UPPER").length,12);
 assert.equal(ROOMS.filter(r=>r.stage==="MIDDLE").length,12);
 assert.equal(ROOMS.filter(r=>r.stage==="DEEP").length,12);
 assert.equal(VAULT.stage,"FINAL");assert.equal(VAULT.copies,1);
 for(const r of [...ROOMS,VAULT]){
  assert.equal(r.v2.choices.length,2,r.id);
  assert.ok(r.v2.prompt.length>4,r.id);
  dice(r.v2.roll);
  assert.match(cardMarkup(r),/tt-layout-v2-room/);
 }
});
test("objects contain complete on-card outcomes, scrolls/rings/wands have safe finite resources",()=>{
 for(const o of OBJECTS){
  assert.ok(o.v2.kind&&o.v2.trigger&&o.v2.tags.length,o.id);
  assert.ok(o.copies>0);
  if(o.v2.roll)dice(o.v2.roll);
  assert.match(cardMarkup(o),/tt-layout-v2-object/);
  if(o.v2.kind==="SCROLL")assert.match(o.v2.trigger,/discard/i);
  if(o.v2.kind==="WAND"){
   assert.match(o.v2.trigger,/sideways until/i);
   assert.match(o.v2.alternative,/SHRINE:.*recharge/i);
   assert.match(o.v2.alternative,/OVERCHARGE: discard Wand, lose d6 HP;/i);
   assert.ok(o.v2.alternative.endsWith("choose "+o.v2.roll.outcomes.at(-1).range+"."));
  }
  if(o.v2.kind==="POTION")assert.match(o.v2.trigger,/FIRST USE/);
 }
});
test("Monsters have distinctive four-band responses, weaknesses and defined negotiation",()=>{
 assert.equal(WARDEN.hp,20);assert.equal(WARDEN_FURY.hp,10);
 assert.equal(WARDEN.stage,"FINAL");assert.equal(WARDEN_FURY.stage,"FINAL");
 for(const m of [...MONSTERS,WARDEN,WARDEN_FURY]){
  assert.equal(m.behavior.length,4,m.id);
  assert.ok(m.behavior.every(x=>x.length>4));
  assert.ok(m.v2.weakness&&m.v2.parley&&m.v2.remains);
  assert.ok(m.hp>0&&m.atk>=0&&m.def>=0);
  const html=cardMarkup(m);
  assert.match(html,/tt-layout-v2-monster/);
  assert.ok(html.includes(esc(m.v2.weakness)),m.id);
  assert.ok(html.includes("1–2")&&html.includes("3–4")&&html.includes(">5</b>")&&html.includes(">6</b>"));
 }
 assert.match(WARDEN.v2.weakness,/10 HP/);
 assert.match(WARDEN_FURY.v2.weakness,/0 HP/);
 assert.match(MONSTERS.find(m=>m.id==="bat").v2.parley,/Opposed d20/);
 assert.match(MONSTERS.find(m=>m.id==="goblin").v2.parley,/RECRUIT/);
});
test("one A4 rulebook describes entire adventure and alternate boss victory",()=>{
 const html=readFileSync("rules.html","utf8");
 assert.match(html,/@page\{size:A4 portrait/);
 assert.match(html,/opposed d20|d20 \+ ATK/i);assert.match(html,/d20 \+ DEF/);
 assert.match(html,/WIT/);assert.match(html,/POISONED/);
 assert.match(html,/SEAL/);assert.match(html,/Phase II/);
 assert.match(html,/PARLEY/);assert.match(html,/OVERCHARGE/);
 assert.match(html,/Scrolls/);assert.match(html,/1 Ring/);
 assert.equal((html.match(/<main class="sheet">/g)||[]).length,1);
 assert.equal((html.match(/<section><h2>/g)||[]).length,8);
 assert.match(html,/3 UPPER, 3 MIDDLE and 3 DEEP Rooms/);
 assert.match(html,/After each Hero turn/);
 assert.match(html,/healing still needs a printed effect/);
 assert.match(html,/keeping the same HP die/);
 assert.match(html,/Never roll HP dice/);
 assert.match(html,/At <strong>0 HP<\/strong>, remove the die/);
 assert.doesNotMatch(html,/heal freely/i);
 const page=html.match(/<main class="sheet">([\s\S]*?)<\/main>/)?.[1]||"";
 const wordCount=page.replace(/<[^>]+>/g," ").trim().split(/\s+/).length;
 assert.ok(wordCount<650,"Rulebook should remain brief: "+wordCount+" words");
});
test("every physical card prints deterministically with correct images and A4 quantities",()=>{
 for(const c of CATALOGUE){
  const a=cardMarkup(c);assert.equal(a,cardMarkup(c),c.id);
  assert.match(a,/data-assembly="collage"/);assert.match(a,/tt-content/);
  assert.ok(a.includes(esc(c.title)));
 }
 assert.equal((printSheets(CATALOGUE).match(/class="tt-sheet"/g)||[]).length,Math.ceil(CATALOGUE.length/4));
 assert.equal((printSheets(PRINT_DECK).match(/class="tt-sheet"/g)||[]).length,Math.ceil(PRINT_DECK.length/4));
 assert.equal(Object.keys(CARD_ART).length,CATALOGUE.length);
 const uploaded=readdirSync("assets/illustrations").filter(name=>name.endsWith(".png")).sort();
 assert.equal(uploaded.length,111,"One generated PNG per canonical card");
 assert.deepEqual(Object.values(CARD_ART).sort(),uploaded,
  "Each PNG must appear on exactly one canonical card");
 const slug=title=>title.toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
 for(const [i,card] of CATALOGUE.entries()){
  const key=card.type+":"+card.id,name=CARD_ART[key];
  assert.ok(name,"Missing illustration for "+key);
  assert.equal(name,String(i+1).padStart(3,"0")+"_"+slug(card.title)+".png",
   "Illustration assignment does not match card "+key);
  const path="assets/illustrations/"+name;
  assert.ok(existsSync(path),path);
  assert.equal(assetPath(card),"./"+path);
  // PNG signature and header dimensions, without reading 245 MB of pixels.
  const fd=openSync(path,"r");
  const head=Buffer.alloc(24);
  try{assert.equal(readSync(fd,head,0,head.length,0),24);}
  finally{closeSync(fd);}
  assert.equal(head.subarray(0,8).toString("hex"),"89504e470d0a1a0a",path);
  assert.ok(head.readUInt32BE(16)>0&&head.readUInt32BE(20)>0,path);
 }
});

test("generated card illustrations retain spot colours in catalogue and print",()=>{
 const css=readFileSync("styles/tabletop.css","utf8");
 assert.match(css,/\.tt-card \.tt-art-image\{\s*filter:none;/);
 for(const card of CATALOGUE){
  const markup=cardMarkup(card);
  assert.match(markup,/tt-has-art/);
  assert.match(markup,/data-art-status="generated"/);
  assert.match(markup,/<img class="tt-art-image"/);
  assert.ok(markup.includes(CARD_ART[card.type+":"+card.id]),card.id);
 }
 assert.equal(CATALOGUE.filter(c=>assetPath(c)).length,111);
 assert.equal((printSheets(CATALOGUE).match(/class="tt-art-image"/g)||[]).length,111,
  "Printed sheets must include all new images");
 assert.doesNotMatch(printSheets(CATALOGUE),/tt-needs-art|tt-art-placeholder|ink-art/,
  "No card should fall back to the old SVG illustrations");
});
