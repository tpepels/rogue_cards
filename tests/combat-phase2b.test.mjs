import test from "node:test";
import assert from "node:assert/strict";
import {sessionActions} from "../src/engine/decision-session.js";
import {identitySeed,makeScenario,scenarios,simulateScenario,runPhase2b}
 from "../scripts/study-combat-phase2b.mjs";

test("Phase 2b constructs 48 distinctive wounded canonical positions",()=>{
 const all=scenarios();
 assert.equal(all.length,48);
 assert.equal(new Set(all.map(s=>s.id)).size,48);
 assert.equal(new Set(all.map(s=>s.scenarioSeed)).size,48);
 assert.equal(new Set(all.map(s=>s.monsterId)).size,8);
 assert.equal(new Set(all.map(s=>s.profileId)).size,6);
 assert.ok(all.some(s=>s.partySize===1));
 assert.ok(all.some(s=>s.partySize===2));
 assert.ok(all.some(s=>s.poisoned.length>0));
 assert.ok(all.some(s=>s.dis.length>0));
 assert.ok(all.some(s=>s.phase==="parley"));
 for(const entry of all){
  const st=entry.session.state;
  assert.ok(sessionActions(entry.session).length>0,entry.id);
  assert.ok(st.heroes.every(h=>h.hp>0&&h.hp<h.card.hp),entry.id);
  assert.ok(st.monster&&st.monster.hp===st.monsterHP,entry.id);
  assert.ok(st.heroes.some(h=>h.inventory.length>1),entry.id);
  const cards=st.heroes.flatMap(h=>h.inventory);
  assert.equal(new Set(cards).size,cards.length,"duplicate physical copy "+entry.id);
  for(const h of st.heroes)
   for(const card of Object.values(h.slots))
    assert.ok(h.inventory.includes(card),"equipped Item must be held "+entry.id);
 }
});

test("Identical seeds survive filtering and iteration changes",()=>{
 const a=makeScenario("wisp","weakened-mages",{seed:20261017});
 const b=makeScenario("wisp","weakened-mages",{seed:20261017});
 assert.equal(a.scenarioSeed,b.scenarioSeed);
 assert.equal(a.session.state.rng.snapshot(),b.session.state.rng.snapshot());
 const subset=scenarios({limit:48,ids:["wisp","crawler"]});
 const reversed=scenarios({limit:48,ids:["crawler","wisp"]});
 const fromSubset=subset.find(s=>s.id===a.id);
 const fromReverse=reversed.find(s=>s.id===a.id);
 assert.equal(a.scenarioSeed,fromSubset.scenarioSeed);
 assert.equal(a.scenarioSeed,fromReverse.scenarioSeed);
 const seed=identitySeed(20261017,a.id);
 assert.equal(seed,b.scenarioSeed);
 assert.notEqual(identitySeed(20261017,a.id),
  identitySeed(20261017,"wisp__wounded-warrior"));
});

test("Same concrete game seed + dice seed + policy produces same decisions and HP",{
 timeout:60000
},()=>{
 const fixture=makeScenario("crawler","injured-knight",{seed:99});
 const a=simulateScenario(fixture,"phase2_safe",{samples:1,followupSamples:1,seed:99});
 const b=simulateScenario(fixture,"phase2_safe",{samples:1,followupSamples:1,seed:99});
 assert.deepEqual(a,b);
 const c=simulateScenario(makeScenario("crawler","injured-knight",{seed:99}),
  "phase2_safe",{samples:1,followupSamples:1,seed:99});
 assert.deepEqual(a,c);
});

test("Phase 2b reports legal action opportunities, paired HP savings and deviations",{
 timeout:120000
},()=>{
 const {report,rows,fixtures}=runPhase2b({
  seed:20261022,limit:6,samples:1,followupSamples:1,write:false
 });
 assert.equal(fixtures.length,6);
 assert.equal(report.rows,24);
 assert.equal(rows.length,24);
 for(const fixture of fixtures){
  const pair=rows.filter(r=>r.scenarioId===fixture.id);
  assert.equal(pair.length,4);
  assert.equal(new Set(pair.map(r=>r.seed)).size,1);
  assert.equal(new Set(pair.map(r=>r.diceSeed)).size,1);
  for(const row of pair){
   assert.ok(row.outcome==="cleared"||row.outcome==="wipe");
   assert.ok(row.outcome==="wipe"||row.queuedRemaining===0);
   assert.ok(row.deviations>=0&&row.deviations<=row.decisions);
   assert.ok(Number.isFinite(row.hpLost));
  }
 }
 const per=report.comparisons.byPolicy;
 assert.equal(per.length,4);
 assert.ok(per.every(arm=>arm.n===6));
 assert.equal(per[0].meanHpSavedVsAttack,0);
 assert.equal(per[0].differingScenarios,0);
 assert.ok(per.some(arm=>arm.legalItemOpportunities>0));
});
