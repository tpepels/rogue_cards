import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition,simulateFullBatch} from "../src/expedition-campaign.js";
import {roomPolicies} from "../src/expedition-runtime.js";

const root=fileURLToPath(new URL("../",import.meta.url));
const invoke=(...args)=>execFileSync(process.execPath,["scripts/analyze-balance.mjs",...args],{
 cwd:root,encoding:"utf8",maxBuffer:30*1024*1024
});

test("all 28 distinct two-Hero parties are included",()=>{
 const data=JSON.parse(invoke("diagnostics","1"));
 const parties=new Set(data.results.filter(r=>r.heroes.length===2).map(r=>r.heroes.join("+")));
 assert.equal(parties.size,28);
 assert.equal(data.totalPartySetups,36);
 assert.equal(data.totalExpeditions,180);
 for(const r of data.results){
  assert.equal(r.runs,1);
  assert.equal(r.unresolvedEffects,0);
  assert.equal(r.stalledExpeditions,0);
 }
});

test("matched fight versus seal replays exactly the same pre-Vault state",()=>{
 const data=JSON.parse(invoke("vault","2"));
 assert.equal(data.groups.length,180);
 assert.equal(data.comparisonCount,360);
 assert.equal(data.totalExpeditions,720);
 for(const g of data.groups){
  assert.equal(g.runs,2);
  assert.equal(g.unresolved,0);
  assert.equal(g.stalls,0);
  assert.ok(g.eligibleSealStates<=g.vaultArrivals);
  assert.equal(g.eligibleOnlyFight+g.eligibleOnlySeal+g.eligibleBoth+g.eligibleNeither,
   g.eligibleSealStates);
  assert.ok(g.sealWins<=g.attempts);
 }
});

test("Vault choices never alter generated dungeon state or resource inventory",()=>{
 for(const strategy of ["survival","magic","seal"])
  for(const seed of [20,71,111]){
   const common={seed,heroes:["wizard","knight"],strategy};
   const a=simulateFullExpedition({...common,vaultChoice:"fight"});
   const b=simulateFullExpedition({...common,vaultChoice:"seal-if-available"});
   assert.deepEqual(a.vaultState,b.vaultState);
   assert.equal(a.cleared,b.cleared);
   assert.equal(a.vaultState?.sealAffordable,b.vaultState?.sealAffordable);
  }
 assert.throws(()=>simulateFullExpedition({vaultChoice:"bad"}),/Unknown Vault decision/);
});

test("Room policy variants use legal choices and record both choice availability and selection",()=>{
 assert.deepEqual(roomPolicies,["scripted","contextual","uniform","second-when-legal"]);
 for(const roomPolicy of roomPolicies){
  const r=simulateFullBatch({seed:610,runs:30,heroes:["warrior","priest"],
   strategy:"survival",roomPolicy});
  assert.equal(r.unresolvedEffects,0);
  assert.equal(r.stalledExpeditions,0);
  for(const [roomAndChoice,n] of Object.entries(r.roomChoices))
   assert.ok(n<=r.roomOptionAvailable[roomAndChoice],roomAndChoice);
  assert.equal(Object.values(r.failureStages).reduce((a,b)=>a+b,0),
   r.runs-r.winCount);
 }
 const exploration=simulateFullBatch({seed:610,runs:50,heroes:["warrior","priest"],
  strategy:"survival",roomPolicy:"second-when-legal"});
 assert.ok(Object.entries(exploration.roomChoices).some(([key,n])=>key.endsWith(":1")&&n>0));
});

test("Object exposure, acquisition, and victory association are explicitly separate",()=>{
 const r=simulateFullBatch({runs:50,seed:1024,heroes:["witch"],strategy:"magic"});
 assert.ok(Object.keys(r.objectAcquisitions).length>0);
 assert.ok(Object.values(r.objectSeenRuns).every(n=>n<=r.runs));
 assert.ok(Object.keys(r.objectRoomExposures).length>0);
 for(const [item,n] of Object.entries(r.objectSeenWins))
  assert.ok(n<=r.objectSeenRuns[item],item);
 assert.ok(r.failureCauses&&r.failureStages);
 assert.ok(r.meanVaultPartyHP>=0);
 assert.ok(r.meanVaultMagicHeld>=0);
});

test("Room experimental CLI and JSONL can be parsed independently",()=>{
 const rooms=JSON.parse(invoke("rooms","1"));
 assert.equal(rooms.roomPolicies.length,4);
 assert.equal(rooms.configurations,720);
 assert.equal(rooms.totalExpeditions,720);
 const lines=invoke("vault","1","--jsonl").trim().split("\n");
 assert.equal(lines.length,180);
 const row=JSON.parse(lines[0]);
 assert.equal(typeof row.eligible,"boolean");
 assert.equal(typeof row.options.fight.won,"boolean");
 assert.deepEqual(row.options.fight.vaultState,row.options.sealIfAvailable.vaultState);
});

test("bad options and zero samples are rejected",()=>{
 for(const args of [["rooms","0"],["surprise","1"],["vault","2","--oops"]]){
  const child=spawnSync(process.execPath,["scripts/analyze-balance.mjs",...args],{cwd:root,encoding:"utf8"});
  assert.notEqual(child.status,0,args.join(" "));
  assert.match(child.stderr,/Usage:/);
 }
});
