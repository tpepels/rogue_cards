import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {OBJECTS,ROOMS} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
const cwd=fileURLToPath(new URL("../",import.meta.url));
const run=(mode,n)=>JSON.parse(execFileSync(process.execPath,
 ["scripts/card-balance.mjs",mode,String(n)],{cwd,encoding:"utf8",maxBuffer:8*1024*1024}));

test("balance experiment tests all 52 Objects with controlled item gifts",()=>{
 const data=run("items",1);
 assert.equal(data.results.length,OBJECTS.length);
 assert.equal(data.totalSimulatedExpeditions,OBJECTS.length*12*3*2);
 assert.deepEqual(new Set(data.results.map(r=>r.id)),new Set(OBJECTS.map(x=>x.id)));
 for(const r of data.results){
  assert.equal(r.trials,r.eligible+r.excluded);
  assert.equal(r.eligible,r.onlyControl+r.onlyTreatment+r.bothWin+r.neitherWin);
  assert.ok(r.eligible>0,"No copy was available in any test for "+r.id);
  assert.equal(r.unresolved,0,r.id);
  assert.equal(r.stalls,0,r.id);
  assert.ok(r.pairedWinDelta>=-1&&r.pairedWinDelta<=1);
  assert.equal(r.pairedDelta95CI.length,2);
 }
});

test("all 36 regional Rooms have independently measurable legal choices",()=>{
 const data=run("rooms",3);
 assert.equal(data.results.length,ROOMS.length);
 assert.equal(data.totalSimulatedExpeditions,ROOMS.length*12*3*3*2);
 for(const r of data.results){
  assert.equal(r.trials,r.eligible+r.excluded);
  assert.equal(r.eligible,r.onlyControl+r.onlyTreatment+r.bothWin+r.neitherWin);
  assert.equal(r.unresolved,0,r.id);
  assert.equal(r.stalls,0,r.id);
  if(r.eligible===0){
   assert.equal(r.pairedWinDelta,null,"Sparse legal options must be reported, not invented");
  }else{
   assert.ok(r.pairedDelta95CI[0]<=r.pairedWinDelta);
   assert.ok(r.pairedDelta95CI[1]>=r.pairedWinDelta);
  }
 }
 assert.ok(data.results.some(r=>r.eligible>0));
});

test("Room counterfactuals hold identical state before the targeted choice",()=>{
 for(const room of [ROOMS[0],ROOMS[9],ROOMS[17],ROOMS[28]]){
  for(let i=1;i<=10;i++){
   const base={seed:i*1271,heroes:["knight","wizard"],strategy:"magic"};
   const a=simulateFullExpedition({...base,forceRoomChoice:{id:room.id,choice:0}});
   const b=simulateFullExpedition({...base,forceRoomChoice:{id:room.id,choice:1}});
   assert.deepEqual(a.choiceComparison,b.choiceComparison);
   assert.equal(a.unresolved,0);
   assert.equal(b.unresolved,0);
  }
 }
 assert.throws(()=>simulateFullExpedition({extraObjectId:"not-an-item"}),/Unknown extra Object/);
 assert.throws(()=>simulateFullExpedition({forceRoomChoice:{id:"u-gate",choice:5}}),/Invalid forced Room choice/);
});

test("reject invalid card-balance CLI arguments",()=>{
 for(const argv of [["items","0"],["rooms","10001"],["anything","4"]]){
  const r=spawnSync(process.execPath,["scripts/card-balance.mjs",...argv],
   {cwd,encoding:"utf8"});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/Usage:/);
 }
});
