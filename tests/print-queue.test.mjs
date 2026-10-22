import test from "node:test";
import assert from "node:assert/strict";
import {FIXED_CARDS,SELECTABLE,PRESETS,physicalDeck,selectionForPreset} from "../src/decks.js";
import {printUrl,decodePrintQueue} from "../src/print-queue.js";
const cards=[...FIXED_CARDS,...SELECTABLE];
test("a complete print queue round-trips all 193 designs and preserves quantities",()=>{
 assert.equal(cards.length,193);
 const url=printUrl(cards);
 const result=decodePrintQueue(url.slice(url.indexOf("?")));
 assert.deepEqual(result.map(c=>c.type+":"+c.id),cards.map(c=>c.type+":"+c.id));
 assert.ok(url.length<12000,"Printable link should not exceed practical URL lengths");
 for(const p of PRESETS){
  const deck=physicalDeck(selectionForPreset(p.id));
  assert.deepEqual(decodePrintQueue(printUrl(deck).split("?")[1]),deck);
 }
});
test("print queue rejects unrecognized, empty, repeated or abusive card selectors",()=>{
 for(const spec of ["","hero:warrior~0","hero:warrior~1,hero:warrior~1",
  "hero:missing~1","hero:warrior~1501","room:u-passage~9999",
  "hero:warrior~-1","hero:warrior~1,malformed"]){
  assert.throws(()=>decodePrintQueue("?cards="+encodeURIComponent(spec)));
 }
 assert.throws(()=>printUrl([]));
 assert.throws(()=>printUrl([{type:"room",id:"unknown"}]));
});
