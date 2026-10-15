import test from "node:test";
import assert from "node:assert/strict";
import {
 validateDesign,targetDesign,requireMatchingAudit,
 verifyCheckpoint,matchingResult
} from "../scripts/migrate-session-balance.mjs";

const old="6940e50fd0f8fd848a0b58f534bd9478312b9e83";
const fast="424e3f52bd704debacfd8cddb85b2e2afea615fe";
const design=()=>({
 schema:1,revision:old,runs:7200,seed:20261014,
 futureBudget:2,navigateBudget:2,maxSearchSteps:4000,
 maxGameSteps:7000,minEligible:60,jobMinutes:30,
 focus:"room",auditFile:"/old/canonical-audit-13/summary.json"
});
const record=(i=118)=>({
 i,heroes:["warrior","witch"],gameSeed:2212417639,
 step:153,focus:"room",kind:"paired",
 key:"room:m-altar",win0:0,win1:0,decisions:373,
 policy:{cycleBreaks:10,consecutiveEquipment:0}
});
test("migration derives a bytewise-order-compatible target manifest and preserves every search setting",()=>{
 const source=design();
 assert.strictEqual(validateDesign(source),source);
 const dest=targetDesign(source,fast,"/optimized/audit/summary.json");
 assert.deepEqual(Object.keys(dest),Object.keys(source),
  "Study resume compares JSON.stringify(manifest) in exact key order");
 assert.equal(dest.revision,fast);
 assert.equal(dest.auditFile,"/optimized/audit/summary.json");
 for(const k of Object.keys(source).filter(k=>
  !["revision","auditFile"].includes(k)))
  assert.deepEqual(dest[k],source[k],"Changing "+k+" silently invalidates paired samples");
 assert.deepEqual(source,design(),"Migration must not mutate the old manifest");
 assert.throws(()=>targetDesign(source,old,"/optimized/audit"),/distinct/);
});
test("migration requires passing full canonical audits on both pinned revisions",()=>{
 const ok={commit:fast,pass:true,completeFaceCoverage:true,
  allWalksEnded:true,runs:36};
 assert.doesNotThrow(()=>requireMatchingAudit(ok,fast));
 assert.throws(()=>requireMatchingAudit({...ok,commit:old},fast),/PASS/);
 assert.throws(()=>requireMatchingAudit({...ok,pass:false},fast),/PASS/);
 assert.throws(()=>requireMatchingAudit({...ok,runs:35},fast),/PASS/);
});
test("migration rejects mismatched or corrupted source checkpoint identities",()=>{
 const m=design();
 assert.strictEqual(verifyCheckpoint(record(),118,m).i,118);
 assert.throws(()=>verifyCheckpoint(record(117),118,m),/Invalid source checkpoint/);
 assert.throws(()=>verifyCheckpoint({...record(),focus:"item"},118,m),
  /Invalid source checkpoint/);
 assert.throws(()=>verifyCheckpoint({...record(),kind:"failure"},118,m),
  /Invalid source checkpoint/);
 assert.throws(()=>verifyCheckpoint(record(),7200,m),
  /Invalid source checkpoint/);
 assert.throws(()=>verifyCheckpoint({...record(),gameSeed:null},118,m),
  /Invalid source checkpoint/);
});
test("migration only accepts complete field-for-field equality - win parity alone is insufficient",()=>{
 const oldRecord=record();
 const same=structuredClone(oldRecord);
 assert.equal(matchingResult(oldRecord,same),true);
 const changed=structuredClone(oldRecord);
 changed.policy.cycleBreaks++;
 assert.equal(changed.win0,oldRecord.win0);
 assert.equal(changed.win1,oldRecord.win1);
 assert.equal(matchingResult(oldRecord,changed),false);
 const changedState={...record(),sourceState:{heroes:[{hp:17}]}};
 assert.equal(matchingResult(oldRecord,changedState),false);
});
test("manifest validation rejects attempts to add hidden settings or alter study design",()=>{
 const reordered=design();
 delete reordered.seed;reordered.seed=20261014;
 assert.throws(()=>validateDesign(reordered),/fields or ordering/);
 assert.throws(()=>validateDesign({...design(),migratedFrom:old}),
  /fields or ordering/);
 assert.throws(()=>validateDesign({...design(),futureBudget:0}),
  /source study setting/);
});
