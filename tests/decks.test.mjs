import test from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {CATALOGUE,HEROES} from "../src/tabletop-data.js";
import {PRINT_ONLY_ROOMS,PRINT_ONLY_ITEMS,PRINT_ONLY_ART} from "../src/print-expansion.js";
import {PRESETS,ALL_ROOMS,ALL_OBJECTS,SELECTABLE,FIXED_CARDS,selectionForPreset,selectionSummary,physicalDeck,selectionGroups,cardKey} from "../src/decks.js";
import {assetPath,cardMarkup,printSheets,CARD_ART} from "../src/tabletop-view.js";
const region=["UPPER","MIDDLE","DEEP"];
test("the 139-card legacy catalogue remains intact alongside 54 new printable designs",()=>{
 assert.equal(CATALOGUE.length,139);
 assert.equal(PRINT_ONLY_ROOMS.length,15);
 assert.equal(PRINT_ONLY_ITEMS.length,9);
 assert.equal(ALL_ROOMS.length,79);
 assert.equal(ALL_OBJECTS.length,79);
 assert.equal(SELECTABLE.length,79+79+24);
 assert.equal(Object.keys(CARD_ART).length,139);
 // Illustration generation is incremental: the 24 earlier expansion PNGs
 // are always mapped, but 12 Monsters and 18 odd Items are added only
 // after their real artwork has been generated. Never require an exact
 // mapping count during a partially or fully illustrated local checkout.
 const baseArtKeys=new Set([...PRINT_ONLY_ROOMS,...PRINT_ONLY_ITEMS].map(cardKey));
 const optionalArtKeys=new Set(SELECTABLE.filter(c=>
  c.v2?.number>=164&&c.v2.number<=193).map(cardKey));
 assert.equal(baseArtKeys.size,24);
 assert.equal(optionalArtKeys.size,30);
 for(const key of baseArtKeys)assert.ok(PRINT_ONLY_ART[key],"Missing base artwork mapping: "+key);
 for(const [key,filename] of Object.entries(PRINT_ONLY_ART)){
  assert.ok(baseArtKeys.has(key)||optionalArtKeys.has(key),
   "Unexpected print-only illustration mapping: "+key);
  assert.match(filename,/^\d{3}_[a-z0-9_]+\.png$/,key);
 }
 assert.ok(Object.keys(PRINT_ONLY_ART).length>=24);
 assert.ok(Object.keys(PRINT_ONLY_ART).length<=54);
 assert.equal(new Set([...CATALOGUE,...SELECTABLE].map(cardKey)).size,193); // original 139 plus 54
 assert.equal(new Set([...FIXED_CARDS,...SELECTABLE].map(cardKey)).size,193);
});
test("15 plain Rooms resolve immediately, never create persistent state or Pacts",()=>{
 for(const c of PRINT_ONLY_ROOMS){
  assert.equal(c.printOnly,true);
  assert.equal(c.v2.choices.length,2,c.id);
  assert.ok(c.v2.roll&&c.v2.roll.outcomes.length===3,c.id);
  const faces=c.v2.roll.outcomes.flatMap(o=>{
   const [a,b=a]=o.range.split("–").map(Number);
   return Array.from({length:b-a+1},(_,i)=>a+i);
  });
  assert.deepEqual(faces,[1,2,3,4,5,6],c.id);
  const printedRules=[c.v2.prompt,...c.v2.choices.flatMap(c=>[c.label,c.effect]),...c.v2.roll.outcomes.map(o=>o.effect)].join(" ");
  assert.doesNotMatch(printedRules,/\bPACT\b|\bKEEP\b|at (?:the )?Vault|on entering DEEP|after Phase I|next (?:MONSTER|WIT|DEF)/i,c.id);
  const art=assetPath(c);
  const printed=cardMarkup(c);
  if(art){
   assert.ok(existsSync(art.replace("./","")),c.id+" own illustration is missing");
   assert.match(printed,/data-art-status="generated"/);
   assert.match(printed,/class="tt-art-image"/);
  }else{
   assert.match(printed,/data-art-status="placeholder"/);
   assert.match(printed,/class="tt-illustration" aria-label="Illustration pending"/);
   assert.doesNotMatch(printed,/class="tt-art-image"/);
  }
  assert.match(printed,/data-print-expansion="true"/);
 }
});
test("ordinary equipment uses established slots and simple immediate or equipment effects",()=>{
 for(const c of PRINT_ONLY_ITEMS){
  assert.equal(c.printOnly,true);
  assert.ok(["TOOL","EQUIPMENT"].includes(c.v2.kind),c.id);
  assert.ok(c.v2.tags.length>=1,c.id);
  assert.equal(c.v2.roll,null,c.id);
  assert.equal(c.v2.alternative,"",c.id);
  assert.ok(c.copies>=2,c.id);
  const art=assetPath(c);
  if(art)assert.ok(existsSync(art.replace("./","")),c.id+" own illustration missing");
  else assert.doesNotMatch(cardMarkup(c),/class="tt-art-image"/);
 }
});
test("recommended decks are usable, curated and follow the advertised normal-to-weird progression",()=>{
 assert.deepEqual(PRESETS.map(p=>p.id),["balanced","classic","strange","chaos"]);
 const reports=PRESETS.map(p=>selectionSummary(selectionForPreset(p.id)));
 assert.deepEqual(reports[0].counts,{UPPER:18,MIDDLE:18,DEEP:18});
 assert.deepEqual(reports[1].counts,{UPPER:12,MIDDLE:12,DEEP:12});
 assert.deepEqual(reports[2].counts,{UPPER:13,MIDDLE:13,DEEP:13});
 assert.deepEqual(reports[3].counts,{UPPER:29,MIDDLE:27,DEEP:23});
 assert.equal(reports[1].pacts,0);
 assert.equal(reports[2].pacts,6);
 assert.equal(reports[3].pacts,10);
 assert.deepEqual(reports.map(r=>r.warnings),[[],[],[],[]]);
 for(const [i,p] of PRESETS.entries()){
  assert.equal(reports[i].counts.UPPER+reports[i].counts.MIDDLE+reports[i].counts.DEEP,p.roomCount);
  const printed=physicalDeck(selectionForPreset(p.id));
  assert.equal(printed.length,reports[i].copies);
  for(const starter of HEROES.map(h=>h.v2.starter))assert.ok(printed.some(c=>c.id===starter),starter);
  assert.equal(printed.filter(c=>c.id==="vault").length,1);
  assert.equal(printed.filter(c=>c.type==="hero").length,8);
  assert.equal(printed.filter(c=>["warden","warden-fury"].includes(c.id)).length,2);
  assert.match(printSheets(printed),/tt-sheet/);
 }
});
test("custom sets can add/remove any optional card without losing fixed victory cards",()=>{
 const set=selectionForPreset("classic");
 const key=cardKey(PRINT_ONLY_ROOMS[0]);assert.ok(set.has(key));
 set.delete(key);
 assert.equal(selectionSummary(set).counts.UPPER,11);
 assert.equal(physicalDeck(set).filter(c=>c.id===PRINT_ONLY_ROOMS[0].id).length,0);
 const empty=physicalDeck(new Set());
 assert.equal(empty.length,11);
 assert.equal(selectionSummary(new Set()).warnings.length>0,true);
 const grouped=selectionGroups.flatMap(g=>g.cards.map(cardKey));
 assert.equal(new Set(grouped).size,SELECTABLE.length);
});

test("new printed cards use the established draw/heal/monster terminology",()=>{
 for(const card of PRINT_ONLY_ROOMS){
  const text=[card.v2.prompt,...card.v2.choices.map(x=>x.effect),...card.v2.roll.outcomes.map(x=>x.effect)].join(" ");
  assert.doesNotMatch(text,/Find [12] (?:wrapped |abandoned )?Items?\b|Take [12] Items?\b|Reach [12] Items?\b|restores? [12] HP/i,card.id);
  assert.doesNotMatch(text,/\bPACT\b|keep this Room|\bafter Phase I\b|\bAt Vault\b/i,card.id);
 }
 const locks=PRINT_ONLY_ITEMS.find(c=>c.id==="ex-lockpicks");
 for(const room of ["Rusty Gate","Chest with a Pulse","Buried Lockbox","The Last Chest"])
  assert.ok(locks.v2.trigger.includes(room));
 assert.doesNotMatch(locks.v2.trigger,/locked Room/i);
 const spear=PRINT_ONLY_ITEMS.find(c=>c.id==="ex-spear");
 assert.match(spear.v2.trigger,/Monsters tagged BEAST/);
 const helmet=PRINT_ONLY_ITEMS.find(c=>c.id==="ex-helm");
 assert.match(helmet.v2.trigger,/equipped Helm/);
});

test("printed Rope and temporary penalties cannot grant free treasure or expire unused",()=>{
 const fall=CATALOGUE.find(c=>c.id==="u-fall");
 const bridge=CATALOGUE.find(c=>c.id==="d-bridge");
 for(const room of [fall,bridge]){
  const choice=room.v2.choices[0].effect;
  assert.match(choice,/adjust this result by/);
  assert.doesNotMatch(choice,/choose 5–6/);
 }
 for(const id of ["u-nest","m-statue","m-crypt","d-choir"]){
  const room=CATALOGUE.find(c=>c.id===id);
  const printed=[room.v2.prompt,...room.v2.choices.map(x=>x.effect),...(room.v2.roll?.outcomes||[]).map(x=>x.effect)].join(" ");
  assert.doesNotMatch(printed,/next WIT (?:roll )?here has DIS/);
  assert.match(printed,/next WIT roll has DIS/);
 }
});
