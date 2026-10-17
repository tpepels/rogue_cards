import test from "node:test";
import assert from "node:assert/strict";
import {sessionActions} from "../src/engine/decision-session.js";
import {makeScenario,simulateScenario} from "../scripts/study-combat-phase2b.mjs";
import {phase2cTactical} from "../scripts/study-combat-causes.mjs";
import {runPhase2c} from "../scripts/study-combat-phase2c.mjs";

test("Only canonical supported Monsters start at Parley",()=>{
 for(const monster of ["crawler","troll","wisp","mold","wax-golem",
  "sentinel","bone-cantor","glass-revenant"]){
  for(const profile of ["poisoned-witch","weakened-mages"]){
   const s=makeScenario(monster,profile);
   const legal=sessionActions(s.session);
   if(s.phase==="parley"){
    assert.ok(legal.some(a=>a.kind==="parley"),
     "Parley falsely offered "+s.id);
    assert.ok(legal.some(a=>a.kind==="fight"));
   }else assert.equal(s.phase,"combat-hero");
  }
 }
});
test("Risk-aware chooser selects only legal options without mutating actual RNG",{
 timeout:20000
},()=>{
 const scenario=makeScenario("mold","exhausted-support",{seed:105});
 const {session}=scenario;
 const available=sessionActions(session);
 assert.equal(available.length,2);
 const rng=session.state.rng.snapshot(),hp=session.state.heroes.map(h=>h.hp);
 const action=phase2cTactical(session,{
  samples:2,followupSamples:1,decisionSeed:8102,allowElbereth:false
 });
 assert.ok(available.some(a=>JSON.stringify(a)===JSON.stringify(action)));
 assert.equal(session.state.rng.snapshot(),rng);
 assert.deepEqual(session.state.heroes.map(h=>h.hp),hp);
 assert.equal(session.pendingNested??null,null);
});
test("Different independent combat replicate seeds are repeatable and paired",{
 timeout:50000
},()=>{
 const scenario=makeScenario("crawler","wounded-warrior",{seed:240});
 const options={seed:240,samples:1,followupSamples:1,repetition:2};
 const a=simulateScenario(scenario,"phase2c_safe",options);
 const b=simulateScenario(scenario,"phase2c_safe",options);
 const c=simulateScenario(scenario,"attack_only",options);
 const alt=simulateScenario(scenario,"phase2c_safe",{...options,repetition:3});
 assert.deepEqual(a,b);
 assert.equal(a.diceSeed,c.diceSeed);
 assert.notEqual(a.diceSeed,alt.diceSeed);
 assert.equal(a.repetition,2);
 assert.equal(a.trialKey,scenario.id+"|r2");
});
test("Phase 2c matched study groups and HP deltas are exactly computed",{
 timeout:120000
},()=>{
 const {report,rows,fixtures}=runPhase2c({
  seed:20261028,limit:6,repetitions:2,
  samples:1,followupSamples:1,write:false
 });
 assert.equal(fixtures.length,6);
 assert.equal(report.design.runs,48);
 assert.equal(rows.length,48);
 assert.equal(report.comparisons.length,4);
 for(const scenario of fixtures){
  const rowsFor=rows.filter(r=>r.scenarioId===scenario.id);
  assert.equal(rowsFor.length,8);
  assert.equal(new Set(rowsFor.map(r=>r.diceSeed)).size,2);
  for(let repetition=0;repetition<2;repetition++){
   const pair=rowsFor.filter(r=>r.repetition===repetition);
   assert.equal(pair.length,4);
   assert.equal(new Set(pair.map(r=>r.diceSeed)).size,1);
   const basic=pair.find(r=>r.policy==="attack_only");
   for(const arm of pair){
    assert.ok(["cleared","wipe"].includes(arm.outcome));
    assert.equal(arm.hpSavedVsAttack,basic.hpLost-arm.hpLost);
    assert.equal(arm.safetyDeltaVsAttack,
     Number(arm.safelyCleared)-Number(basic.safelyCleared));
    if(arm.safelyCleared)assert.equal(arm.queuedRemaining,0);
   }
  }
 }
 assert.ok(report.byMonster.length>0);
 assert.ok(report.byHeroProfile.length>0);
 assert.ok(report.comparisons.every(p=>
  p.n===12&&p.hpSavedClusterCI95?.length===2));
});
