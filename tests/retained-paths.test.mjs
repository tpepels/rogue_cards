import test from "node:test";
import assert from "node:assert/strict";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {ROOMS,OBJECTS} from "../src/tabletop-data.js";

test("research defaults do not change normal expedition outcomes",()=>{
 const opts={seed:20261013,heroes:["warrior","wizard"],strategy:"magic"};
 const original=simulateFullExpedition(opts);
 const explicitlyDefault=simulateFullExpedition({...opts,
  returnChoices:{},retainedRoomAblation:null});
 assert.deepEqual(explicitlyDefault,original);
});
test("a matched kept-Room removal changes only future state",()=>{
 let matched=0;
 for(let seed=301;seed<501;seed++){
  const opts={seed,heroes:["warrior","wizard"],strategy:"magic",
   forceRoomChoice:{id:"m-fungus",choice:0}};
  const a=simulateFullExpedition(opts);
  const b=simulateFullExpedition({...opts,retainedRoomAblation:"m-fungus"});
  assert.equal(a.unresolved,0);assert.equal(b.unresolved,0);
  assert.equal(a.roundLimit,false);assert.equal(b.roundLimit,false);
  assert.deepEqual(a.choiceComparison,b.choiceComparison);
  const kept=a.retainedRoomPlacements.some(x=>x.id==="m-fungus");
  const removed=b.retainedRoomAblations.some(x=>x.id==="m-fungus");
  assert.equal(kept,removed,"suppressed Room must first be retained");
  if(removed)matched++;
 }
 assert.ok(matched>0,"sample never reached a legal kept Fungal Garden");
});
test("printed Room and Item result bands are recorded",()=>{
 const r=simulateFullExpedition({seed:8451,heroes:["knight","wizard"],
  strategy:"magic"});
 for(const key of Object.keys(r.roomRollBands)){
  const [id,index]=key.split(":");
  const card=[...ROOMS].find(x=>x.id===id);
  assert.ok(card||id==="vault","unknown Room band "+key);
  if(card)assert.ok(Number(index)>=0&&Number(index)<card.v2.roll.outcomes.length);
 }
 for(const key of Object.keys(r.objectRollBands)){
  const [id,index]=key.split(":");
  const card=OBJECTS.find(x=>x.id===id);
  assert.ok(card?.v2.roll,"unknown rolled Object "+key);
  assert.ok(Number(index)>=0&&Number(index)<card.v2.roll.outcomes.length);
 }
 assert.ok(Array.isArray(r.roomsEncountered));
 assert.ok(Array.isArray(r.retainedRoomPlacements));
 assert.ok(Array.isArray(r.retainedRoomAblations));
});
test("return choices are simulator-only and validated",()=>{
 const opts={seed:6292,heroes:["warrior","wizard"],strategy:"magic"};
 const a=simulateFullExpedition({...opts,returnChoices:{"m-well":"roll"}});
 const b=simulateFullExpedition({...opts,returnChoices:{"m-well":"leave"}});
 assert.equal(a.unresolved,0);assert.equal(b.unresolved,0);
 assert.deepEqual(a.choiceComparison,b.choiceComparison);
 assert.throws(()=>simulateFullExpedition({...opts,returnChoices:[]}),
  /Invalid retained Room return-choice/);
 assert.throws(()=>simulateFullExpedition({...opts,retainedRoomAblation:42}),
  /Invalid retained Room ablation/);
});
