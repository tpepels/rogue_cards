import test from "node:test";
import assert from "node:assert/strict";
import {MONSTERS} from "../src/tabletop-data.js";
import {combatAC,attackHits} from "../src/engine/combat.js";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {makeEncounter,tactical,runDiagnostic,encounterOutcome,
 completeEncounter,phase2Tactical,advanceToTacticalBoundary}
 from "../scripts/study-combat-causes.mjs";

test("combat diagnostic constructs a canonical actionable encounter",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior","knight"],120);
 assert.equal(session.phase,"combat-hero");
 assert.equal(session.state.monster,rat);
 assert.equal(session.state.monsterHP,rat.hp);
 assert.ok(sessionActions(session).some(a=>a.kind==="choose-hero-turn"));
 const action=sessionActions(session)[0];
 submitDecision(session,action,{observeResult:false,recordHistory:false});
 assert.equal(session.phase,"combat");
 assert.ok(sessionActions(session).some(a=>a.kind==="attack"));
});

test("new equipment changes canonical stats and fixed AC",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior"],121);
 const s=session.state,h=s.heroes[0];
 h.slots.weapon=null;h.slots.armour=null;
 const baseAtk=s.stats(h).atk,baseDef=s.stats(h).def;
 const cases=[
  ["ex-dagger","weapon",1],["ex-mace","weapon",2],
  ["ex-spear","weapon",2],["odd-trick-knife","weapon",1],
  ["ex-jerkin","armour",1],["ex-helm","armour",1],
  ["ex-buckler","armour",2]
 ];
 for(const [id,slot,bonus] of cases){
  const card=[...s.deck,...h.inventory].find(c=>c.id===id);
  assert.ok(card,"Missing physical Item "+id);
  h.slots.weapon=null;h.slots.armour=null;
  h.inventory.push(card);
  h.slots[slot]=card;
  const stats=s.stats(h);
  assert.equal(stats[slot==="weapon"?"atk":"def"],
   (slot==="weapon"?baseAtk:baseDef)+bonus,id);
  if(slot==="armour")assert.equal(combatAC(stats.def),12+baseDef+bonus);
 }
 assert.equal(attackHits(1,100,4),false);
 assert.equal(attackHits(20,20,20),true);
});

test("tactical search never resamples a suspended canonical reaction",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 let pending=null;
 for(let seed=1;seed<=64;seed++){
  const s=makeEncounter(rat,["warrior"],seed);
  submitDecision(s,sessionActions(s)[0],{
   observeResult:false,recordHistory:false});
  submitDecision(s,sessionActions(s).find(a=>a.kind==="attack"),{
   observeResult:false,recordHistory:false});
  if(s.pendingNested&&sessionActions(s).length>1){
   pending=s;break;
  }
 }
 assert.ok(pending,"Expected to encounter a real suspended Hero reaction");
 assert.equal(pending.phase,"combat");
 const before=pending.state.rng.snapshot();
 const pendingActions=sessionActions(pending);
 const action=tactical(pending,{samples:3,depth:2,decisionSeed:456});
 assert.ok(pendingActions.some(a=>JSON.stringify(a)===JSON.stringify(action)));
 assert.equal(pending.state.rng.snapshot(),before);
 assert.doesNotThrow(()=>submitDecision(pending,action,{
  observeResult:false,recordHistory:false}));
});

test("small paired combat pilot resolves all nested reaction replays",{
 timeout:60000
},()=>{
 const {summary,rows}=runDiagnostic({
  trials:1,samples:1,seed:20261018,quiet:true
 });
 assert.equal(rows.length,8*2*6);
 assert.equal(summary.rows,rows.length);
 assert.ok(rows.every(r=>Number.isFinite(r.hpLost)));
 assert.ok(rows.every(r=>r.outcome==="cleared"||r.outcome==="wipe"));
 assert.ok(rows.every(r=>r.queuedMonsters===0||r.outcome==="wipe"));
 assert.ok(rows.every(r=>r.outcome!=="cleared"||r.resolvedSafely));
 assert.ok(rows.every(r=>r.monstersHandled>=1));
 assert.ok(rows.every(r=>r.itemsUsed>=0&&r.consumedItems>=0));
 assert.ok(rows.some(r=>r.arm==="tactical"));
});

test("a killed Monster with a queued follow-up is not an encounter end",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior","knight"],230);
 session.state.monsterHP=0;
 session.state.monsterQueue.push(rat);
 session.phase="corpse";
 assert.equal(encounterOutcome(session),"ongoing");
 const result=completeEncounter(session);
 assert.ok(["cleared","wipe"].includes(result.outcome));
 assert.ok(result.steps>2,"Queued Monster must be fought after corpse settlement");
 assert.equal(session.state.metrics.battles,2,
  "The printed pending Monster must enter the canonical encounter");
 if(result.outcome==="cleared"){
  assert.equal(session.phase,"between-rooms");
  assert.equal(session.state.monster,null);
  assert.equal(session.state.monsterQueue.length,0);
 }else{
  assert.equal(session.phase,"terminal");
  assert.equal(session.state.alive(),false);
 }
});

test("a pending Monster-response is not a safely finished encounter",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior"],230);
 assert.equal(encounterOutcome(session),"ongoing");
 assert.throws(()=>completeEncounter(session,{stepLimit:0}),/did not settle/);
 assert.equal(session.phase,"combat-hero");
 assert.equal(encounterOutcome(session),"ongoing");
});

test("a terminal party wipe is distinct from an encounter safely cleared",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior"],98);
 session.state.heroes[0].hp=0;
 session.phase="terminal";
 assert.equal(encounterOutcome(session),"wipe");
 assert.notEqual(encounterOutcome(session),"cleared");
});

test("Phase 2 keeps printed reactions and initial dice state unchanged",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior"],882);
 submitDecision(session,sessionActions(session)[0],{
  observeResult:false,recordHistory:false});
 const snapshot=session.state.rng.snapshot();
 const before=session.state.monsterHP;
 const chosen=phase2Tactical(session,{
  samples:1,followupSamples:1,decisionSeed:780
 });
 assert.ok(sessionActions(session).some(a=>JSON.stringify(a)===JSON.stringify(chosen)));
 assert.notEqual(chosen.kind,"elbereth","Elbereth must be opt-in");
 assert.equal(session.state.rng.snapshot(),snapshot);
 assert.equal(session.state.monsterHP,before);
});

test("Phase 2 continuation stops at the next combat decision or true ending",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior","knight"],883);
 submitDecision(session,sessionActions(session)[0],{
  observeResult:false,recordHistory:false});
 const action=sessionActions(session).find(a=>a.kind==="attack");
 const boundary=advanceToTacticalBoundary(session,{firstAction:action});
 assert.ok(boundary.steps>=1);
 if(boundary.terminal)
  assert.ok(["cleared","wipe"].includes(encounterOutcome(session)));
 else{
  assert.ok(["combat","parley"].includes(session.phase));
  assert.equal(session.pendingNested??null,null);
  assert.equal(encounterOutcome(session),"ongoing");
 }
});

test("Phase 2 pilot compares matched combat and Parley policies",{
 timeout:120000
},()=>{
 const {summary,rows}=runDiagnostic({
  mode:"phase2",trials:1,samples:1,seed:20261019,
  monsterIds:["crawler"],partyProfiles:[["warrior"]],quiet:true
 });
 assert.equal(summary.design.mode,"phase2");
 assert.equal(rows.length,5);
 assert.deepEqual(rows.map(r=>r.arm),[
  "basic","legacy_tactical","phase2_safe","phase2_elbereth","phase2_parley"
 ]);
 assert.equal(new Set(rows.map(r=>r.seed)).size,1);
 assert.ok(rows.every(r=>r.outcome==="cleared"||r.outcome==="wipe"));
 assert.ok(rows.every(r=>r.outcome==="wipe"||r.queuedMonsters===0));
 assert.ok(rows.every(r=>r.capped===false));
});

test("Phase 2 evaluates Elbereth alternatives only when explicitly enabled",{
 timeout:20000
},()=>{
 const crawler=MONSTERS.find(m=>m.id==="crawler");
 const session=makeEncounter(crawler,["warrior"],920);
 submitDecision(session,sessionActions(session)[0],{
  observeResult:false,recordHistory:false});
 const options=sessionActions(session);
 assert.ok(options.some(a=>a.kind==="elbereth"));
 const before=session.state.rng.snapshot(),originalHp=session.state.monsterHP;
 const chosen=phase2Tactical(session,{
  samples:2,followupSamples:1,decisionSeed:20261022,
  allowElbereth:true
 });
 assert.ok(options.some(a=>JSON.stringify(a)===JSON.stringify(chosen)));
 assert.equal(session.state.rng.snapshot(),before,
  "Hypothetical die rolls must not change actual future dice");
 assert.equal(session.state.monsterHP,originalHp);
 assert.equal(session.pendingNested??null,null);
});

test("Phase 2 Parley search only returns canonical legal actions",{
 timeout:20000
},()=>{
 const wisp=MONSTERS.find(m=>m.id==="wisp");
 const session=makeEncounter(wisp,["warrior","knight"],900);
 session.phase="parley";
 const legal=sessionActions(session);
 assert.ok(legal.some(a=>a.kind==="fight"));
 assert.ok(legal.some(a=>a.kind==="parley"));
 const rng=session.state.rng.snapshot();
 const chosen=phase2Tactical(session,{
  samples:2,followupSamples:1,decisionSeed:20261024
 });
 assert.ok(legal.some(a=>JSON.stringify(a)===JSON.stringify(chosen)));
 assert.equal(session.state.rng.snapshot(),rng);
});

test("Phase 2 compares acting Heroes in a duo without changing live dice",{
 timeout:30000
},()=>{
 const sentinel=MONSTERS.find(m=>m.id==="sentinel");
 const session=makeEncounter(sentinel,["warrior","knight"],951);
 const actions=sessionActions(session);
 assert.equal(actions.length,2);
 assert.ok(actions.every(a=>a.kind==="choose-hero-turn"));
 const before=session.state.rng.snapshot();
 const chosen=phase2Tactical(session,{
  samples:2,followupSamples:2,decisionSeed:20261025
 });
 assert.ok(actions.some(a=>JSON.stringify(a)===JSON.stringify(chosen)));
 assert.equal(session.state.rng.snapshot(),before);
 assert.equal(session.phase,"combat-hero");
 assert.equal(session.pendingNested??null,null);
});

test("Filtering Monster cards leaves the same canonical seed and outcome for shared scenarios",{
 timeout:60000
},()=>{
 const configuration={mode:"phase2",trials:1,samples:1,seed:8123,
  partyProfiles:[["warrior"]],quiet:true};
 const one=runDiagnostic({...configuration,monsterIds:["wisp"]});
 const two=runDiagnostic({...configuration,monsterIds:["crawler","wisp"]});
 const shared=two.rows.filter(x=>x.monsterId==="wisp");
 assert.equal(one.rows.length,5);
 assert.equal(shared.length,5);
 assert.deepEqual(one.rows,shared);
});
