import test from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {CATALOGUE,HEROES} from "../src/tabletop-data.js";
import {PRINT_ONLY_ROOMS,PRINT_ONLY_ITEMS,PRINT_ONLY_ART} from "../src/print-expansion.js";
import {PRESETS,ALL_ROOMS,ALL_OBJECTS,SELECTABLE,FIXED_CARDS,selectionForPreset,selectionSummary,physicalDeck,selectionGroups,cardKey} from "../src/decks.js";
import {assetPath,cardMarkup,printSheets,CARD_ART} from "../src/tabletop-view.js";
const region=["UPPER","MIDDLE","DEEP"];
test("the 139-card engine catalogue stays unchanged; only printed expansion grows",()=>{
 assert.equal(CATALOGUE.length,139);
 assert.equal(PRINT_ONLY_ROOMS.length,15);
 assert.equal(PRINT_ONLY_ITEMS.length,9);
 assert.equal(ALL_ROOMS.length,79);
 assert.equal(ALL_OBJECTS.length,61);
 assert.equal(SELECTABLE.length,79+61+12);
 assert.equal(Object.keys(CARD_ART).length,139);
 assert.equal(Object.keys(PRINT_ONLY_ART).length,24);
 assert.equal(new Set([...CATALOGUE,...SELECTABLE].map(cardKey)).size,139+24-64-12-52); // identity overlap is intentional
 assert.equal(new Set([...FIXED_CARDS,...SELECTABLE].map(cardKey)).size,163);
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
  const printed=[c.v2.prompt,...c.v2.choices.flatMap(c=>[c.label,c.effect]),...c.v2.roll.outcomes.map(o=>o.effect)].join(" ");
  assert.doesNotMatch(printed,/\bPACT\b|\bKEEP\b|at (?:the )?Vault|on entering DEEP|after Phase I|next (?:MONSTER|WIT|DEF)/i,c.id);
  assert.ok(assetPath(c)&&existsSync(assetPath(c).replace("./","")),c.id+" needs a physical illustration");
  assert.match(cardMarkup(c),/data-print-expansion="true"/);
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
  assert.ok(assetPath(c)&&existsSync(assetPath(c).replace("./","")),c.id);
 }
});
test("recommended decks are usable, curated and follow the advertised normal-to-weird progression",()=>{
 assert.deepEqual(PRESETS.map(p=>p.id),["classic","strange","chaos"]);
 const reports=PRESETS.map(p=>selectionSummary(selectionForPreset(p.id)));
 assert.deepEqual(reports[0].counts,{UPPER:12,MIDDLE:12,DEEP:12});
 assert.deepEqual(reports[1].counts,{UPPER:13,MIDDLE:13,DEEP:13});
 assert.deepEqual(reports[2].counts,{UPPER:29,MIDDLE:27,DEEP:23});
 assert.equal(reports[0].pacts,0);
 assert.equal(reports[1].pacts,6);
 assert.equal(reports[2].pacts,10);
 assert.deepEqual(reports.map(r=>r.warnings),[[],[],[]]);
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
