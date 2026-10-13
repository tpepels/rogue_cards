import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {HEROES,MONSTERS} from "../src/tabletop-data.js";
import {forkExpeditionState} from "../src/rollout-state.js";
import {rolloutRoomContinuation,rolloutCombatContinuation}
 from "../src/expedition-campaign.js";
import {pairedRoomRollouts,pairedCombatRollouts}
 from "../src/rollout-evaluator.js";
import {validateAgentConfig,AGENT_WEIGHTS,
 agentPlanRoom,agentPlanCombat} from "../src/research-agent.js";
const configure=(s,knowledge="fair",budget=4)=>{
 s.agentConfig=validateAgentConfig({knowledge,budget,planning:"rollout",
  rolloutRooms:2,combatActions:8,combatRoomDepth:0,
  samplingSeed:339101,weights:{...AGENT_WEIGHTS}});
 s.plannerRisk="cautious";
 s.researchPolicy="agent";
 s.plannerFeatures=new Set(["room","combat","parley","seal"]);
 s.plannerDecisions={};
 s.plannerTrace=[];
 s.researchDecisions={parleyConsidered:0,parleySelected:0,
  spellsReserved:0,sealConsidered:0,sealSelected:0};
 s.agentDecisionSerial=0;
 s.vaultChoice="policy";
 return s;
};
const roomState=(knowledge,budget=4)=>{
 const s=configure(new ExpeditionState({seed:5196,
  heroes:["warrior","wizard"],strategy:"magic"}),knowledge,budget);
 s.beginRoom(s.rooms.UPPER.shift());
 return s;
};
const fightState=(knowledge,budget=4)=>{
 const s=roomState(knowledge,budget),m=MONSTERS.find(x=>x.id==="rat");
 s.monster=m;s.monsterHP=m.hp;s.metrics.battles++;
 // Supply an actually legal combat Item for comparing attack vs Item,
 // rather than relying on the random starting draw.
 const idx=s.deck.findIndex(x=>x.id==="scroll-flame");
 if(idx>=0)s.add(s.heroes[0],s.deck.splice(idx,1)[0]);
 return s;
};
test("state fork preserves alias identity, ownership, equipment and real random stream",()=>{
 const s=roomState("oracle");
 const original=s.die();
 const control=roomState("oracle");assert.equal(original,control.die());
 const fork=forkExpeditionState(s,{diceSeed:77,deckSeed:33,knowledge:"oracle"});
 assert.equal(Object.getPrototypeOf(fork),ExpeditionState.prototype);
 assert.notStrictEqual(fork.heroes,s.heroes);
 const w=fork.heroes[0];
 assert.ok(Object.values(w.slots).every(card=>!card||
  w.inventory.includes(card)));
 assert.equal(fork.actor,w);
 assert.ok(fork.seenRooms.has(s.room.id));
 assert.deepEqual(fork.deck.map(c=>c.id),s.deck.map(c=>c.id));
 assert.equal(s.die(),control.die(),"Fork consumed real expedition dice");
});
test("fair resampling depends on public information, not hidden actual card IDs/order",()=>{
 const a=roomState("fair"),b=roomState("fair");
 b.deck.reverse();
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  b.rooms[stage].reverse();b.monsters[stage].reverse();
 }
 const opts={diceSeed:9800,deckSeed:9001,knowledge:"fair"};
 const x=forkExpeditionState(a,opts),y=forkExpeditionState(b,opts);
 assert.deepEqual(x.deck.map(c=>c.id),y.deck.map(c=>c.id));
 assert.deepEqual(x.rooms.UPPER.map(c=>c.id),y.rooms.UPPER.map(c=>c.id));
 assert.deepEqual(x.monsters.MIDDLE.map(c=>c.id),
  y.monsters.MIDDLE.map(c=>c.id));
 const px=forkExpeditionState(a,{...opts,knowledge:"oracle"});
 const py=forkExpeditionState(b,{...opts,knowledge:"oracle"});
 assert.deepEqual(px.deck.map(c=>c.id),a.deck.map(c=>c.id));
 assert.deepEqual(py.deck.map(c=>c.id),b.deck.map(c=>c.id));
 assert.notDeepEqual(px.deck.map(c=>c.id),py.deck.map(c=>c.id));
});
test("fair room sampler excludes already entered and scouted future Room IDs",()=>{
 const s=roomState("fair");
 const next=s.rooms.UPPER[0].id;
 s.peekedRoomIds.UPPER=[next];
 const nextAll=Array.from({length:8},(_,i)=>forkExpeditionState(s,{
  diceSeed:17+i,deckSeed:8881+i,knowledge:"fair"}));
 for(const copy of nextAll){
  assert.equal(copy.rooms.UPPER[0].id,next);
  assert.ok(!copy.rooms.UPPER.some(r=>s.seenRooms.has(r.id)));
 }
});
test("Room lookahead resolves actual Room/Monster/Item effects without mutating origin",()=>{
 for(const knowledge of ["fair","oracle"]){
  const s=roomState(knowledge);
  const before=s.heroes.map(h=>h.hp);
  const originalRng=roomState(knowledge);
  const one=pairedRoomRollouts(s,[true,true]);
  assert.ok([0,1].includes(one.choice));
  assert.equal(one.samples,4);
  assert.ok(one.scores.every(Number.isFinite));
  assert.deepEqual(s.heroes.map(h=>h.hp),before);
  assert.equal(s.metrics.cleared,0);
  assert.equal(s.die(),originalRng.die());
  const fork=forkExpeditionState(s,{diceSeed:141,deckSeed:1234,
   knowledge});
  const result=rolloutRoomContinuation(fork,one.choice,{depth:2});
  assert.equal(fork.metrics.cleared,2);
  assert.ok(result.state===fork);
  assert.equal(fork.metrics.unresolved,0);
  assert.equal(fork.metrics.roundLimit,false);
 }
});
test("combat rollout resolves a legal choice through full-effect monster responses",()=>{
 for(const knowledge of ["fair","oracle"]){
  const s=fightState(knowledge);
  const before=s.heroes.map(h=>h.hp);
  const control=fightState(knowledge);
  const plan=pairedCombatRollouts(s,s.heroes[0]);
  assert.ok(["attack","item"].includes(plan.action));
  assert.equal(plan.samples,4);
  assert.deepEqual(s.heroes.map(h=>h.hp),before);
  assert.equal(s.die(),control.die());
  const fork=forkExpeditionState(s,{diceSeed:33,deckSeed:44,knowledge});
  const outcome=rolloutCombatContinuation(fork,0,{action:"attack"},
   {maxHeroActions:8,roomDepth:0});
  assert.equal(outcome.state,fork);
  assert.equal(fork.metrics.unresolved,0);
  assert.equal(fork.metrics.roundLimit,false);
 }
});
test("full-effect rollout matches across repeated decisions at fixed seeds",()=>{
 for(const knowledge of ["fair","oracle"]){
  const a=roomState(knowledge),b=roomState(knowledge);
  assert.deepEqual(agentPlanRoom(a,[true,true]),
   agentPlanRoom(b,[true,true]));
  const c=fightState(knowledge),d=fightState(knowledge);
  const plan=agentPlanCombat(c,c.heroes[0]);
  assert.deepEqual(plan,agentPlanCombat(d,d.heroes[0]));
  assert.ok(["attack","item"].includes(plan.action));
  assert.ok(c.plannerDecisions);
 }
});
test("optional terminal horizon actually plays the Vault or an ordinary party wipe",()=>{
 const original=roomState("oracle");
 const fork=forkExpeditionState(original,{
  diceSeed:11338,deckSeed:25552,knowledge:"oracle"});
 const result=rolloutRoomContinuation(fork,0,{depth:9});
 assert.equal(result.complete,true);
 assert.ok(!fork.alive()||fork.metrics.roundLimit||
  fork.metrics.cleared===9);
 if(fork.alive()&&fork.metrics.cleared===9){
  assert.ok(fork.vaultState,"The actual Vault was played");
  assert.equal(typeof fork.metrics.won,"boolean");
 }
});
test("combat continuation can reach terminal expedition result",()=>{
 const original=fightState("oracle");
 const fork=forkExpeditionState(original,{
  diceSeed:2333,deckSeed:7753,knowledge:"oracle"});
 const result=rolloutCombatContinuation(fork,0,{action:"attack"},{
  maxHeroActions:600,roomDepth:9});
 assert.equal(result.complete,true);
 assert.equal(fork.metrics.unresolved,0);
 assert.ok(fork.metrics.cleared<=9);
});
test("rollout validation rejects invalid horizons and supports 0-budget fallback",()=>{
 assert.throws(()=>validateAgentConfig({weights:{},planning:"time-machine"}));
 assert.throws(()=>validateAgentConfig({weights:{},planning:"rollout",rolloutRooms:10}));
 assert.throws(()=>validateAgentConfig({weights:{},planning:"rollout",combatActions:0}));
 assert.throws(()=>validateAgentConfig({weights:{},planning:"rollout",combatRoomDepth:10}));
 const state=roomState("fair",0);
 const plan=agentPlanRoom(state,[true,true]);
 assert.equal(typeof plan.choice,"number");
 const fight=fightState("fair",0);
 const fast=agentPlanCombat(fight,fight.heroes[0]);
 assert.equal(typeof fast.action,"string");
});
