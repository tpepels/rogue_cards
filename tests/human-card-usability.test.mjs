import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CATALOGUE,ROOMS,OBJECTS,MONSTERS} from "../src/tabletop-data.js";
import {cardMarkup} from "../src/tabletop-view.js";
import {verifyRoomCoverage} from "../src/room-effect-model.js";
import {verifyObjectCoverage} from "../src/effect-model.js";

const words=text=>(text.match(/[\p{L}\p{N}]+/gu)||[]).length;
const fragments=card=>{
 const v=card.v2;
 if(card.type==="hero")return [v.trigger,...v.roll.outcomes.map(x=>x.effect)];
 if(card.type==="room")return [v.prompt,...v.choices.flatMap(x=>[x.label,x.effect]),...(v.roll?.outcomes||[]).map(x=>x.effect)];
 if(card.type==="monster")return [...card.behavior,v.weakness,v.parley,v.remains];
 return [v.trigger,...(v.roll?.outcomes||[]).map(x=>x.effect),v.alternative].filter(Boolean);
};
test("all 139 cards supply legible complete instructions without a second manual",()=>{
 assert.equal(CATALOGUE.length,139);
 assert.equal(verifyObjectCoverage().objects,52);
 assert.equal(verifyRoomCoverage().rooms,80);
 const failures=[];
 for(const c of CATALOGUE){
  const f=fragments(c);
  if(!f.every(x=>typeof x==="string"&&x.trim()))failures.push(c.title+": empty instructions");
  if(words(f.join(" "))>70)failures.push(c.title+": more than 70 rule words");
  if(f.some(x=>x.length>135))failures.push(c.title+": single overlong instruction");
  const html=cardMarkup(c);
  // Emphasis introduces safe <strong> elements inside a sentence; compare
  // its exact flattened escaped text with the canonical printed source.
  const flattened=html.replace(/<[^>]*>/g,"");
  for(const line of f){
   if(!flattened.includes(line.replaceAll("&","&amp;").replaceAll("<","&lt;")
     .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")))
    failures.push(c.title+": rule text absent from rendered card");
  }
  if(!html.includes('tt-paper-collage')||!html.includes('tt-slip--lead'))
   failures.push(c.title+": missing readable over-art instructions");
  if(c.stage){
   if(!html.includes('tt-footer-meta')||!html.includes('tt-depth')||
       !html.includes('Depth '+c.stage))
    failures.push(c.title+": stage missing from footer");
   if(html.includes('class="tt-stage"'))
    failures.push(c.title+": stage covers illustration");
  }
 }
 assert.deepEqual(failures,[]);
});
test("human-first rulebook explains the shared terms before advanced encounters",()=>{
 const rules=readFileSync(new URL("../rules.html",import.meta.url),"utf8");
 for(const term of ["Health Points","Attack:","Defence:","Wits:","advantage",
  "disadvantage","six-sided die","twenty-sided dice","PARLEY","POISONED",
  "OVERCHARGE","REROLL","TRAPDOOR","Elbereth","Amulet Vault"]){
  assert.ok(rules.includes(term),"Undefined shared term: "+term);
 }
 assert.ok(rules.indexOf("Meet your Hero")<rules.indexOf("Making rolls"));
 assert.ok(rules.indexOf("Explore a Room")<rules.indexOf("When a Monster appears"));
});
test("TRAP effects have exact printed labels for the Reliquary",()=>{
 const expected={
  "u-gate":["1–2"],"u-fall":["1–2","3–4"],"u-mimic":["1–2"],
  "m-vault":["1–2"],"m-bridge":["1–2"],
  "d-bridge":["1–2","3–4"],"d-last-chest":["1–2"],"d-shadow":["1–2"],"d-reliquary":["1–2"],"m-wax-bridge":["1–2"]
 };
 for(const room of ROOMS){
  const actual=(room.v2.roll?.outcomes||[]).filter(x=>/^(?:TRAP|TRAPDOOR):/.test(x.effect))
    .map(x=>x.range);
  assert.deepEqual(actual,expected[room.id]||[],room.title+" trap labeling");
 }
 const reliquary=ROOMS.find(x=>x.id==="d-reliquary");
 assert.ok(reliquary.v2.roll.outcomes.some(x=>x.effect.includes("next TRAP result")));
});
test("previously ambiguous card language now names timing, rolls and locations",()=>{
 const witch=CATALOGUE.find(x=>x.id==="witch");
 assert.match(witch.v2.trigger,/after you use a Potion or Scroll/);
 assert.doesNotMatch(witch.v2.roll.outcomes.at(-1).effect,/Resolve that Potion/);
 const supply=ROOMS.find(x=>x.id==="u-supply");
 assert.ok(supply.v2.roll.outcomes.some(x=>/Draw 2 Items, then discard 1 Item/i.test(x.effect)));
 for(const id of ["bat","eye"]){
  const m=MONSTERS.find(x=>x.id===id);
  assert.ok(m.behavior.some(x=>/next Hero d20 roll has DIS/.test(x)),m.title);
 }
 const torch=OBJECTS.find(x=>x.id==="torch");
 for(const name of ["Lamp-Eater"])
  assert.ok(torch.v2.alternative.includes(name),name);
 assert.match(torch.v2.trigger,/darkness DIS/);
 const door=OBJECTS.find(x=>x.id==="wand-door");
 for(const name of ["Rusty Gate","Chest with a Pulse","Buried Lockbox","Last Chest"])
  assert.ok(door.v2.trigger.includes(name),name);
});
