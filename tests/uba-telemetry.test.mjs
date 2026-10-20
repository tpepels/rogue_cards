import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {PRINT_ONLY_ROOMS} from "../src/print-expansion.js";
import {ROOMS,VAULT} from "../src/tabletop-data.js";
import {createTrialTelemetry} from "../src/balance/metrics.js";
import {searchDecision} from "../src/session-mcts.js";
import {playParty} from "../scripts/study-balanced-recovery-parties.mjs";
import {hashValue} from "../src/balance/io.js";
import * as profiles from "../src/balance/profiles.js";
import * as trial from "../src/balance/trial.js";
import * as candidateAPI from "../src/balance/candidate.js";

test("versioned party profiles are deeply frozen and content identified",()=>{
 assert.equal(typeof profiles.getAgentProfile,"function");
 const {AGENT_PROFILES,getAgentProfile}=profiles;
 assert.deepEqual(Object.keys(AGENT_PROFILES).sort(),
  ["reference-v1","widening-v1","priors-v1","combined-v1","weak-v1","random-v1"].sort());
 const reference=getAgentProfile("reference-v1");
 assert.equal(reference.budget,8);
 assert.equal(reference.exploration,0.2);
 assert.equal(reference.implicitWeight,0.5);
 assert.equal(reference.implicitHeuristicMode,"legacy");
 assert.equal(reference.equipmentMode,"party-efficient");
 assert.equal(reference.treeMode,"frontier");
 assert.equal(reference.progressiveWidening,false);
 assert.equal(reference.nodePriors,false);
 assert.ok(Object.isFrozen(AGENT_PROFILES));
 for(const p of Object.values(AGENT_PROFILES)){
  assert.ok(Object.isFrozen(p));
  assert.match(p.hash,/^[a-f0-9]{64}$/);
 }
 assert.ok(getAgentProfile("weak-v1").budget<reference.budget);
 assert.equal(getAgentProfile("combined-v1").progressiveWidening,true);
 assert.equal(getAgentProfile("combined-v1").nodePriors,true);
 const spec={...reference,id:"test-v1",budget:1};delete spec.hash;
 const a=getAgentProfile(spec);
 const b=getAgentProfile(Object.fromEntries(Object.entries(spec).reverse()));
 assert.equal(a.hash,b.hash);
 spec.budget=3;
 assert.equal(a.budget,1);
 assert.throws(()=>getAgentProfile({...reference,budget:1}),/profile|hash|canonical/i);
 assert.throws(()=>getAgentProfile({...spec,id:"unversioned"}),/version/i);
 assert.throws(()=>getAgentProfile({...spec,secretTuning:2}),/profile|unsupported/i);
});

test("committed effect tape includes exact HP/source and drops interrupted replays",()=>{
 const s=createDecisionSession({seed:170,heroes:["warrior"],gameMode:"everything-goes"});
 s.state.room=PRINT_ONLY_ROOMS.find(r=>r.id==="ex-u-coal-store");
 s.state.heroes[0].hp-=3;s.phase="room";
 const initial=s.state.heroes[0].hp;
 const batches=[];
 let a=sessionActions(s).find(a=>a.kind==="room-choice"&&a.index===1);
 // Room actions use the canonical numeric choice field.
 a??=sessionActions(s).find(a=>a.choice===1);
 assert.ok(a,JSON.stringify(sessionActions(s)));
 submitDecision(s,a,{observeResult:false,onCommittedEvents:e=>batches.push(e)});
 if(s.pendingNested){
  assert.equal(batches.length,0);
  assert.equal(s.state.heroes[0].hp,initial);
 }
 let guard=0;
 while(s.pendingNested&&guard++<30)
  submitDecision(s,sessionActions(s)[0],{
   observeResult:false,onCommittedEvents:e=>batches.push(e)});
 assert.equal(s.pendingNested,null);
 assert.equal(batches.length,1);
 const heals=batches.flat().filter(e=>e.type==="healing");
 assert.equal(heals.length,1);
 const heal=heals[0];
 assert.equal(heal.source,"room:ex-u-coal-store");
 assert.equal(heal.stage,"UPPER");
 assert.equal(heal.heroId,"warrior");
 assert.equal(heal.beforeHp,initial);
 assert.equal(heal.afterHp,initial+3);
 assert.equal(heal.offered,5);
 assert.equal(heal.restored,3);
 assert.equal(heal.wasted,2);
 assert.ok(batches.flat().some(e=>e.type==="inventory-remove"));
 assert.equal(s.state._telemetryEvents,undefined);
 const count=batches.length;
 if(s.phase!=="terminal")searchDecision(s,{budget:1,seed:7,maxSteps:100,
  strictTerminal:false,knowledge:"fair",treeMode:"frontier"});
 assert.equal(batches.length,count);
});

test("generic trial preserves canonical playParty outcomes and optional trace parity",()=>{
 assert.equal(typeof trial.playBalanceTrial,"function");
 assert.equal(typeof candidateAPI.createCandidate,"function");
 const {getAgentProfile}=profiles;
 const spec={...getAgentProfile("reference-v1"),id:"parity-v1",budget:1};delete spec.hash;
 const profile=getAgentProfile(spec),candidate=candidateAPI.createCandidate();
 for(const heroes of [["warrior"],["warrior","priest"]]){
  const args={candidate,heroes,seed:3,profile};
  const plain=trial.playBalanceTrial(args);
  const traced=trial.playBalanceTrial({...args,recordEvents:true});
  const old=playParty({heroes,seed:3,budget:1});
  for(const key of Object.keys(old)){
   if(["searchMs","elapsedMs","damageByStage","ordinaryEncounters"].includes(key))continue;
   assert.deepEqual(plain[key],old[key],key);
  }
  for(const key of Object.keys(plain)){
   if(["searchMs","elapsedMs","events","initialSnapshot","finalSnapshot"].includes(key))continue;
   assert.deepEqual(traced[key],plain[key],key);
  }
  assert.equal(plain.events,null);
  assert.equal(traced.events.length,traced.decisions);
  assert.ok(traced.events.every(e=>e.before.internalState===undefined));
  assert.equal(traced.metrics.actions.selected,traced.decisions);
  assert.ok(traced.metrics.actions.available>=traced.decisions);
  assert.equal(traced.metrics.actions.pending,0);
  for(const h of traced.metrics.hp.byHero){
   assert.equal(h.initial+h.restored-h.damage,h.final);
   assert.equal(h.residual,0);
  }
  const effects=traced.events.flatMap(e=>e.effects);
  assert.equal(effects.filter(e=>e.type==="damage").reduce((n,e)=>n+e.damage,0),traced.damage);
  assert.equal(effects.filter(e=>e.type==="healing").reduce((n,e)=>n+e.restored,0),traced.healingRestored);
  assert.deepEqual(traced.metrics.healing.total.offered,
   traced.healingRestored+traced.healingWasted);
  assert.ok(traced.metrics.inventory.itemUses);
  assert.ok(traced.metrics.warden);
  assert.ok(Array.isArray(traced.metrics.telemetry.unsupported));
  const regional=Object.entries(traced.metrics.monsterVisits)
   .filter(([id])=>!["warden","warden-fury"].includes(id))
   .reduce((n,[,count])=>n+count,0);
  assert.equal(traced.ordinaryEncounters,regional);
  assert.equal(Object.values(traced.damageBySource).reduce((n,v)=>n+v,0),traced.damage);
  assert.equal(Object.values(traced.healingBySource).reduce((n,v)=>n+v.restored,0),traced.healingRestored);
 }
 assert.throws(()=>trial.playBalanceTrial({candidate,heroes:["warrior"],seed:3,
  profile,maxGameSteps:1}),/NONTERMINAL/);
});

test("actual shrine Item selections retain their own source and HP conservation",()=>{
 const s=createDecisionSession({seed:22,heroes:["wizard"],gameMode:"everything-goes"});
 const h=s.state.heroes[0];
 if(!h.inventory.some(c=>c.id==="staff")){
  const index=s.state.deck.findIndex(c=>c.id==="staff");
  const [staff]=s.state.deck.splice(index,1);s.state.noteDeckRemoval(staff);
  s.state.add(h,staff);h.slots.weapon=staff;
 }
 s.state.room=ROOMS.find(r=>r.id==="u-shrine");s.phase="room";h.hp-=2;
 const telemetry=createTrialTelemetry(s.state);
 const legal=sessionActions(s);
 const chosen=legal.find(a=>a.kind==="shrine-item"&&a.mode==="heal");
 assert.ok(chosen);
 telemetry.select({phase:s.phase,legal,chosen,state:s.state});
 let effects=[];
 submitDecision(s,chosen,{observeResult:false,onCommittedEvents:e=>{effects=e;}});
 telemetry.settle(effects,s.state,!s.pendingNested);
 const metrics=telemetry.finish(s);
 assert.equal(metrics.actions.bySource["item:staff"]?.selected,1);
 assert.equal(metrics.hp.byHero[0].residual,0);
 assert.equal(metrics.healingByHero.wizard.restored,2);
});

test("one actual two-phase Warden fight supplies one conditional-win denominator",()=>{
 const s=createDecisionSession({seed:1,heroes:["warrior","priest"],gameMode:"everything-goes"});
 s.state.beginRoom(VAULT);s.phase="vault";
 const telemetry=createTrialTelemetry(s.state);let n=0;
 while(s.phase!=="terminal"&&n++<300){
  const legal=sessionActions(s),phase=s.pendingNested?
   "reaction:"+s.pendingNested.trigger.phase:s.phase;
  const chosen=legal.find(a=>a.kind==="skip")??legal.find(a=>a.kind==="attack")??
   legal.find(a=>a.kind==="fight")??legal.find(a=>a.kind==="keep")??legal[0];
  telemetry.select({phase,legal,chosen,state:s.state});
  let effects=[];
  submitDecision(s,chosen,{observeResult:false,recordHistory:false,
   onCommittedEvents:e=>{effects=e;}});
  telemetry.settle(effects,s.state,!s.pendingNested);
 }
 assert.equal(s.phase,"terminal");assert.equal(s.state.metrics.won,true);
 const metrics=telemetry.finish(s);
 assert.equal(metrics.warden.fightStarts,1);
 assert.equal(metrics.warden.phaseStarts,2);
 assert.equal(metrics.warden.combatWins,1);
 assert.equal(metrics.warden.sealAttempts,0);
 assert.equal(metrics.ordinaryEncounters,0);
 assert.equal(metrics.actions.selected,metrics.actions.resolved);
});

test("successful actual SEAL resolves nested costs without a Warden fight",()=>{
 const s=createDecisionSession({seed:1,heroes:["wizard"],gameMode:"everything-goes"});
 const h=s.state.heroes[0];
 while(s.state.partyCount("MAGIC")<3){
  const index=s.state.deck.findIndex(c=>c.v2.tags.includes("MAGIC"));
  const [card]=s.state.deck.splice(index,1);s.state.noteDeckRemoval(card);s.state.add(h,card);
 }
 s.state.beginRoom(VAULT);s.phase="vault";
 const telemetry=createTrialTelemetry(s.state);let n=0;
 while(s.phase!=="terminal"&&n++<100){
  const legal=sessionActions(s),phase=s.pendingNested?
   "reaction:"+s.pendingNested.trigger.phase:s.phase;
  const chosen=legal.find(a=>a.kind==="seal")??legal.find(a=>a.kind==="skip")??
   legal.find(a=>a.kind==="keep")??legal[0];
  telemetry.select({phase,legal,chosen,state:s.state});let effects=[];
  submitDecision(s,chosen,{observeResult:false,recordHistory:false,
   onCommittedEvents:e=>{effects=e;}});
  telemetry.settle(effects,s.state,!s.pendingNested);
 }
 assert.equal(s.phase,"terminal");assert.equal(s.state.metrics.sealWin,true);
 const metrics=telemetry.finish(s);
 assert.equal(metrics.warden.fightStarts,0);
 assert.equal(metrics.warden.combatWins,0);
 assert.equal(metrics.warden.sealAttempts,1);
 assert.equal(metrics.warden.sealWins,1);
 assert.equal(metrics.actions.pending,0);
 assert.equal(metrics.actions.resolved,metrics.actions.selected);
});

test("worker interruption aborts a trial without inventing a terminal loss",()=>{
 assert.equal(typeof trial.playBalanceTrial,"function");
 assert.throws(()=>trial.playBalanceTrial({candidate:candidateAPI.createCandidate(),
  heroes:["warrior"],seed:3,profile:"weak-v1",maxGameSteps:1,
  shouldStop:()=>true}),/interrupted/i);
});

test("fixed random-v1 plays reproducible legal real-terminal solo and duo trials",()=>{
 const profile=profiles.getAgentProfile("random-v1");
 assert.equal(profile.policyKind,"random");
 for(const heroes of [["warrior"],["warrior","priest"]]){
  const args={candidate:candidateAPI.createCandidate(),heroes,seed:42,profile};
  const a=trial.playBalanceTrial(args),b=trial.playBalanceTrial({...args,recordEvents:true});
  assert.ok(["win","death","escape"].includes(a.ending));
  assert.equal(a.searches,0);
  assert.equal(b.searchMs,0);
  for(const key of Object.keys(a)){
   if(["events","initialSnapshot","finalSnapshot","elapsedMs"].includes(key))continue;
   assert.deepEqual(a[key],b[key],key);
  }
  assert.ok(b.events.every(e=>e.legal.some(a=>JSON.stringify(a)===JSON.stringify(e.chosen))));
  assert.ok(b.metrics.hp.byHero.every(h=>h.residual===0));
 }
 assert.throws(()=>trial.playBalanceTrial({candidate:candidateAPI.createCandidate(),
  heroes:["warrior"],seed:42,profile,maxGameSteps:1}),/NONTERMINAL/);
});

test("choice diversity is bounded and does not reward merely changing phases",()=>{
 const s=createDecisionSession({seed:5,heroes:["warrior"],gameMode:"everything-goes"});
 const telemetry=createTrialTelemetry(s.state);
 const apply=chosen=>{
  const legal=sessionActions(s),phase=s.phase;
  assert.ok(legal.length>1);telemetry.select({phase,legal,chosen,state:s.state});
  let effects=[];submitDecision(s,chosen,{observeResult:false,onCommittedEvents:e=>{effects=e;}});
  telemetry.settle(effects,s.state,!s.pendingNested);
 };
 apply(sessionActions(s).find(a=>a.kind==="unequip"));
 s.state.room=PRINT_ONLY_ROOMS.find(r=>r.id==="ex-u-slick-passage");s.phase="room";
 apply(sessionActions(s).find(a=>a.kind==="room-choice"&&a.index===1));
 const metrics=telemetry.finish(s);
 assert.equal(metrics.choiceDiversity,0);
 assert.equal(metrics.choiceDiversityDefinition.range[1],1);
});

test("random laboratory results and traces satisfy strict finite JSON hashing",async()=>{
 const {buildTrialPlan}=await import("../src/balance/runner.js");
 const candidate=candidateAPI.createCandidate(),profile=profiles.getAgentProfile("random-v1");
 const plan=await buildTrialPlan({candidates:[candidate],profiles:[profile],
  parties:[["warrior"]],seed:20261020,runsPerParty:1});
 for(const recordEvents of [false,true]){
  const result=trial.playBalanceTrial({candidate,profile,heroes:["warrior"],
   seed:plan.tasks[0].seed,recordEvents});
  assert.match(hashValue(result),/^[a-f0-9]{64}$/);
 }
});

test("retained Room damage names the printed retained card rather than the entered Room",()=>{
 const s=createDecisionSession({seed:1,heroes:["warrior"],gameMode:"everything-goes"});
 const h=s.state.heroes[0];
 for(const card of [...h.inventory])if(card.v2.tags.includes("ALCHEMY"))s.state.remove(h,card);
 s.state.keptRooms.push({card:ROOMS.find(r=>r.id==="u-leech-pool"),choice:0});
 s.state.stageProgress.UPPER=12;s.state.stageProgress.MIDDLE=12;
 s.state.rooms.DEEP=[ROOMS.find(r=>r.id==="d-shadow")];
 let tape=[];
 submitDecision(s,sessionActions(s).find(a=>a.kind==="continue"),{
  observeResult:false,onCommittedEvents:e=>{tape=e;}});
 while(s.pendingNested)submitDecision(s,sessionActions(s)[0],{
  observeResult:false,onCommittedEvents:e=>{tape=e;}});
 const damage=tape.find(e=>e.type==="damage");
 assert.equal(damage.damage,2);
 assert.notEqual(damage.source,"room:d-shadow");
 assert.equal(damage.attribution,"printed-card");
 assert.equal(damage.source,"room:u-leech-pool");
});

test("lethal Vault entry retains HP measured before the entry effect",()=>{
 const s=createDecisionSession({seed:1,heroes:["warrior"],gameMode:"everything-goes"});
 const h=s.state.heroes[0];h.hp=1;
 for(const card of [...h.inventory])s.state.remove(h,card);
 s.state.stageProgress.UPPER=12;s.state.stageProgress.MIDDLE=12;
 s.state.room=ROOMS.find(r=>r.stage==="DEEP");s.state.fallThrough("FINAL",{damage:1});
 const telemetry=createTrialTelemetry(s.state);
 const legal=sessionActions(s),chosen=legal.find(a=>a.kind==="continue");
 telemetry.select({phase:s.phase,legal,chosen,state:s.state});let effects=[];
 submitDecision(s,chosen,{observeResult:false,onCommittedEvents:e=>{effects=e;}});
 telemetry.settle(effects,s.state,!s.pendingNested);
 assert.equal(s.phase,"terminal");assert.equal(s.state.metrics.vaultEntered,true);
 const metrics=telemetry.finish(s);
 assert.equal(metrics.vaultEntryHpFraction,1/h.card.hp);
 assert.equal(metrics.hp.byHero[0].final,0);
});

test("canonical Potion healing retains potion category and physical source",()=>{
 const s=createDecisionSession({seed:1,heroes:["warrior"],gameMode:"everything-goes"});
 const h=s.state.heroes[0];h.hp-=3;
 const index=s.state.deck.findIndex(c=>c.id==="mushroom");
 const [card]=s.state.deck.splice(index,1);s.state.noteDeckRemoval(card);s.state.add(h,card);
 let effects=[];
 const onCommittedEvents=e=>{effects=e;};
 submitDecision(s,sessionActions(s).find(a=>a.kind==="item-trigger"&&a.cardId==="mushroom"),
  {observeResult:false,onCommittedEvents});
 let guard=0;
 while(s.pendingNested&&guard++<30){
  const legal=sessionActions(s),a=legal.find(a=>a.kind==="keep")??
   legal.find(a=>a.kind==="skip")??legal[0];
  submitDecision(s,a,{observeResult:false,onCommittedEvents});
 }
 const healing=effects.find(e=>e.type==="healing");
 assert.equal(healing.source,"potion:mushroom");
 assert.equal(healing.category,"potion");
 assert.equal(healing.sourceCopy,card._physicalCopy);
 assert.equal(s.state.metrics.healing.byCategory.potion.restored,2);
});

test("explicit profiles may omit optional policyKind and retain fixed MCTS semantics",()=>{
 const {hash,policyKind,...spec}=profiles.getAgentProfile("reference-v1");
 const profile=profiles.getAgentProfile({...spec,id:"optional-kind-v1",budget:1});
 assert.equal(profile.policyKind,"mcts");
 assert.equal(profile.budget,1);
 assert.ok(Object.isFrozen(profile));
});
