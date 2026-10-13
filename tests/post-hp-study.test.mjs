import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {ROOMS,OBJECTS} from "../src/tabletop-data.js";

test("PARLEY research switch does not change the canonical default",()=>{
 for(const seed of [1,12,617]){
  for(const strategy of ["magic","treasure","survival"]){
   const x=simulateFullExpedition({seed,heroes:["wizard"],strategy});
   const y=simulateFullExpedition({seed,heroes:["wizard"],strategy,researchAllowParley:false});
   assert.deepEqual(x,y);
  }
 }
});
test("paired parley-only and Vault-only research options remain deterministic",()=>{
 for(const mode of [{researchAllowParley:true},
  {vaultChoice:"seal-if-available"},
  {researchAllowParley:true,vaultChoice:"seal-if-available"}]){
  for(const seed of [3,91]){
   const x=simulateFullExpedition({seed,heroes:["witch","priest"],
    strategy:"magic",...mode});
   const y=simulateFullExpedition({seed,heroes:["witch","priest"],
    strategy:"magic",...mode});
   assert.deepEqual(x,y);
   assert.equal(x.unresolved,0);
   assert.equal(x.roundLimit,false);
  }
 }
});
test("post-HP study CLI is valid and all three modes produce reproducible JSON",()=>{
 for(const mode of ["items","rooms","strategies"]){
  const p=spawnSync(process.execPath,["scripts/post-hp-study.mjs",mode,"1"],
   {encoding:"utf8",maxBuffer:4*1024*1024});
  assert.equal(p.status,0,p.stderr);
  const x=JSON.parse(p.stdout);
  assert.equal(x.mode,mode);
  assert.equal(x.runsPerSetup,1);
  assert.equal(x.unresolved,0);
  assert.equal(x.stalls,0);
  if(mode==="items")assert.equal(x.results.length,OBJECTS.length);
  if(mode==="rooms")assert.equal(x.results.length,ROOMS.length);
  if(mode==="strategies")assert.equal(x.partySetups.length,36);
 }
});
