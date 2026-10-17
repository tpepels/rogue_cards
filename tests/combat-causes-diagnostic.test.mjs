import test from "node:test";
import assert from "node:assert/strict";
import {MONSTERS} from "../src/tabletop-data.js";
import {combatAC,attackHits} from "../src/engine/combat.js";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {makeEncounter,tactical,runDiagnostic,encounterOutcome,
 completeEncounter} from "../scripts/study-combat-causes.mjs";

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
