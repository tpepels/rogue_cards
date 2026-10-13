import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {researchPolicies,simulateFullExpedition} from "../src/expedition-campaign.js";

test("experimental decisions are opt-in and do not change the existing baseline",()=>{
 assert.deepEqual(researchPolicies,["none","parley","seal","conserve","rooms","adaptive","planner","agent"]);
 for(const strategy of ["magic","treasure","seal","survival"])
  for(const seed of [1,91,3007]){
   const args={seed,heroes:["wizard"],strategy};
   assert.deepEqual(simulateFullExpedition(args),
    simulateFullExpedition({...args,researchPolicy:"none"}));
  }
 assert.throws(()=>simulateFullExpedition({researchPolicy:"bad"}),/Unknown research policy/);
});

test("individual and combined experimental decisions are deterministic and safe",()=>{
 for(const strategy of ["magic","treasure"])for(const researchPolicy of researchPolicies.slice(1).filter(x=>x!=="agent"))
  for(const seed of [13,71])for(const heroes of [["wizard"],["warrior","priest"]]){
   const args={seed,heroes,strategy,researchPolicy};
   const a=simulateFullExpedition(args),b=simulateFullExpedition(args);
   assert.deepEqual(a,b);
   assert.equal(a.unresolved,0);
   assert.equal(a.roundLimit,false);
   assert.ok(a.researchDecisions);
   for(const n of Object.values(a.researchDecisions))
    assert.ok(Number.isSafeInteger(n)&&n>=0);
  }
});

test("local study and report CLI produce inspectable, pure JSON and Markdown",()=>{
 const cmd=(script,args)=>spawnSync(process.execPath,[script,...args],{
  encoding:"utf8",maxBuffer:8*1024*1024
 });
 const one=cmd("scripts/study-decisions.mjs",["1"]);
 assert.equal(one.status,0,one.stderr);
 const result=JSON.parse(one.stdout);
 assert.equal(result.experiment,"rogue-cards-decision-policy-ablation-v1");
 assert.equal(result.simulated,144);
 assert.equal(result.unresolved,0);
 assert.equal(result.stalls,0);
 assert.equal(result.groups.magic.solo.adaptive.n,8);
 assert.equal(result.groups.treasure.duo.adaptive.n,4);
 const dir=mkdtempSync(join(tmpdir(),"rc-policy-")),filename=join(dir,"results.json");
 try{
  writeFileSync(filename,one.stdout);
  const report=cmd("scripts/report-decisions.mjs",[filename]);
  assert.equal(report.status,0,report.stderr);
  assert.match(report.stdout,/Hero-specific results/);
  assert.match(report.stdout,/wizard/);
  assert.match(report.stdout,/PARLEY attempts\/run/);
 } finally{rmSync(dir,{recursive:true,force:true});}
 const invalid=cmd("scripts/study-decisions.mjs",["0"]);
 assert.notEqual(invalid.status,0);
 assert.match(invalid.stderr,/Usage:/);
});
