import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {HEROES,MONSTERS,ROOMS,WARDEN,VAULT,OBJECTS} from "../src/tabletop-data.js";
import {forkExpeditionState,prepareRolloutDecks,cloneRolloutState,
 sampleRolloutDecks} from "../src/rollout-state.js";
import {rolloutRoomContinuation,rolloutCombatContinuation,simulateFullExpedition}
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
 if(idx>=0){const scroll=s.deck.splice(idx,1)[0];
  s.noteDeckRemoval(scroll);s.add(s.heroes[0],scroll);}
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
test("prepared public-deck pools are bit-identical to uncached forks",()=>{
 for(const knowledge of ["fair","oracle"]){
  const s=roomState(knowledge);
  const prepared=prepareRolloutDecks(s,knowledge);
  for(let i=0;i<6;i++){
   const opts={diceSeed:17770+i,deckSeed:10808+i,knowledge};
   const baseline=forkExpeditionState(s,opts);
   const cached=forkExpeditionState(s,{...opts,blueprint:prepared});
   for(const stage of ["UPPER","MIDDLE","DEEP"]){
    assert.deepEqual(cached.rooms[stage].map(x=>x.id),
     baseline.rooms[stage].map(x=>x.id));
    assert.deepEqual(cached.monsters[stage].map(x=>x.id),
     baseline.monsters[stage].map(x=>x.id));
   }
   assert.deepEqual(cached.deck.map(x=>x.id),baseline.deck.map(x=>x.id));
   for(let d=0;d<5;d++)assert.equal(cached.die(),baseline.die());
  }
  const another=roomState(knowledge);
  assert.throws(()=>forkExpeditionState(another,{
   diceSeed:1,deckSeed:1,knowledge,blueprint:prepared}),/blueprint/);
 }
});
test("direct sampled-deck reuse is exact, independent, and never consumes real RNG",()=>{
 const stageNames=["UPPER","MIDDLE","DEEP"];
 const view=f=>({
  deck:f.deck.map(c=>c.id),
  rooms:Object.fromEntries(stageNames.map(stage=>
   [stage,f.rooms[stage].map(c=>c.id)])),
  monsters:Object.fromEntries(stageNames.map(stage=>
   [stage,f.monsters[stage].map(c=>c.id)])),
  hp:f.heroes.map(h=>h.hp),metrics:f.metrics,
  inventory:f.heroes.map(h=>h.inventory.map(c=>c.id))
 });
 for(const knowledge of ["fair","oracle"]){
  const s=roomState(knowledge);
  const control=roomState(knowledge);
  const original=structuredClone(view(s));
  const prepared=prepareRolloutDecks(s,knowledge);
  for(const n of [811,2941,10017]){
   const opts={knowledge,diceSeed:n,deckSeed:n*3,blueprint:prepared};
   const scenario=sampleRolloutDecks(s,opts);
   if(knowledge==="fair"){
    assert.notStrictEqual(scenario.deck,s.deck);
    assert.notStrictEqual(scenario.rooms.UPPER,s.rooms.UPPER);
   }else assert.equal(scenario,null);
   const beforePiles=knowledge==="fair"?{
    deck:scenario.deck.map(x=>x.id),
    rooms:stageNames.map(k=>scenario.rooms[k].map(x=>x.id))
   }:null;
   for(const choice of [0,1]){
    const fresh=forkExpeditionState(s,opts);
    const reused=forkExpeditionState(s,{...opts,sampledDecks:scenario});
    assert.deepEqual(view(reused),view(fresh));
    const first=rolloutRoomContinuation(fresh,choice,{depth:2});
    const second=rolloutRoomContinuation(reused,choice,{depth:2});
    assert.equal(second.complete,first.complete);
    assert.equal(second.won,first.won);
    assert.deepEqual(view(reused),view(fresh));
   }
   if(beforePiles){
    assert.deepEqual(scenario.deck.map(x=>x.id),beforePiles.deck);
    assert.deepEqual(stageNames.map(k=>scenario.rooms[k].map(x=>x.id)),
     beforePiles.rooms,"One action mutated another action's sampled pile");
   }
   assert.deepEqual(view(s),original,"Actual game was mutated by rollouts");
  }
  assert.equal(s.die(),control.die(),"Rollouts consumed actual dice");
 }
});
test("sampled deck reuse rejects cross-seed, cross-source and Oracle leaks",()=>{
 const s=roomState("fair"),other=roomState("fair");
 const blueprint=prepareRolloutDecks(s,"fair");
 const piles=sampleRolloutDecks(s,{knowledge:"fair",deckSeed:555,
  blueprint});
 assert.throws(()=>forkExpeditionState(s,{
  knowledge:"fair",diceSeed:4,deckSeed:556,blueprint,
  sampledDecks:piles}),/Sampled rollout decks/);
 assert.throws(()=>forkExpeditionState(other,{
  knowledge:"fair",diceSeed:4,deckSeed:555,
  sampledDecks:piles}),/Sampled rollout decks/);
 assert.throws(()=>forkExpeditionState(s,{
  knowledge:"oracle",diceSeed:4,deckSeed:555,
  sampledDecks:piles}),/Sampled rollout decks/);
});
test("card-aware clone matches structuredClone on Room and combat game outcomes",()=>{
 const view=s=>({
  hp:s.heroes.map(h=>h.hp),
  equipped:s.heroes.map(h=>Object.fromEntries(
   Object.entries(h.slots).map(([k,v])=>[k,v?.id]))),
  inventory:s.heroes.map(h=>h.inventory.map(o=>o.id)),
  decks:s.deck.map(o=>o.id),
  room:s.room?.id,monster:s.monster?.id,monsterHP:s.monsterHP,
  monsterSkip:s.monsterSkip,poison:s.heroes.map(h=>h.poison),
  metrics:s.metrics,exhausted:[...s.exhausted].map(o=>o.id),
  consumed:[...s.consumed].map(o=>o.id),
  seen:[...s.seenRooms],rewrites:[...s.rewrites]
 });
 for(const knowledge of ["fair","oracle"]){
  const s=roomState(knowledge);
  const prepared=prepareRolloutDecks(s,knowledge);
  for(const seed of [81,231,601]){
   const common={diceSeed:seed,deckSeed:seed+300,knowledge,
    blueprint:prepared};
   const fast=forkExpeditionState(s,common);
   const native=forkExpeditionState(s,{...common,cloneMode:"structured"});
   assert.deepEqual(view(fast),view(native),"Fork startup differs");
   const a=rolloutRoomContinuation(fast,seed%2,{depth:2});
   const b=rolloutRoomContinuation(native,seed%2,{depth:2});
   assert.equal(a.complete,b.complete);
   assert.equal(a.won,b.won);
   assert.deepEqual(view(fast),view(native),
    knowledge+" room continuation diverged for "+seed);
  }
  const c=fightState(knowledge);
  const combatBlueprint=prepareRolloutDecks(c,knowledge);
  for(const seed of [51,910]){
   const opts={diceSeed:seed,deckSeed:seed*5,knowledge,
    blueprint:combatBlueprint};
   const fast=forkExpeditionState(c,opts);
   const native=forkExpeditionState(c,{...opts,cloneMode:"structured"});
   const a=rolloutCombatContinuation(fast,0,{action:"attack"},{
    maxHeroActions:10,roomDepth:1});
   const b=rolloutCombatContinuation(native,0,{action:"attack"},{
    maxHeroActions:10,roomDepth:1});
   assert.equal(a.complete,b.complete);
   assert.deepEqual(view(fast),view(native),
    knowledge+" combat continuation diverged for "+seed);
  }
 }
});
test("card-aware cloning shares printed definitions but isolates mutable state",()=>{
 const original=fightState("oracle");
 const fast=cloneRolloutState(original);
 const slow=cloneRolloutState(original,{mode:"structured"});
 assert.strictEqual(fast.heroes[0].card,original.heroes[0].card);
 assert.notStrictEqual(slow.heroes[0].card,original.heroes[0].card);
 assert.notStrictEqual(fast.heroes[0],original.heroes[0]);
 assert.strictEqual(fast.actor,fast.heroes[0]);
 assert.strictEqual(fast.heroes[0].slots.weapon,
  fast.heroes[0].inventory.find(x=>x.id==="sword"));
 const before=original.heroes[0].hp;
 fast.heroes[0].hp=1;
 fast.metrics.damage=888;
 fast.heroes[0].used.add("isolated");
 fast.heroes[0].inventory.pop();
 assert.equal(original.heroes[0].hp,before);
 assert.notEqual(original.metrics.damage,888);
 assert.ok(!original.heroes[0].used.has("isolated"));
 assert.notEqual(original.heroes[0].inventory.length,
  fast.heroes[0].inventory.length);
 assert.throws(()=>cloneRolloutState(original,{mode:"alien"}));
});
test("retrieving an Item from the Bottomless Well does not remove a new deck card",()=>{
 const s=roomState("fair");
 const room=ROOMS.find(r=>r.id==="m-well");
 assert.ok(room?.v2.special);
 const middle=s.rooms.MIDDLE.findIndex(r=>r.id===room.id);
 assert.ok(middle>=0);
 s.rooms.MIDDLE.splice(middle,1); // physically remove the entered Room
 s.beginRoom(room);
 s.apply("ROOM_SPECIAL",["0"],room);
 const before=JSON.stringify(s.deckRemovedCounts);
 const acquisitions=JSON.stringify(s.metrics.objectAcquisitions);
 assert.ok(s.keptRooms.some(k=>k.card.id==="m-well"));
 // Entering DEEP resolves the kept sacrifice and gives the same physical
 // Item back. A second ownership acquisition is not a second deck draw.
 const deep=s.rooms.DEEP.findIndex(r=>r.id==="d-shadow");
 assert.ok(deep>=0);
 const deepRoom=s.rooms.DEEP.splice(deep,1)[0];
 s.beginRoom(deepRoom);
 assert.equal(JSON.stringify(s.deckRemovedCounts),before);
 assert.equal(JSON.stringify(s.metrics.objectAcquisitions),acquisitions);
 const prepared=prepareRolloutDecks(s,"fair");
 assert.equal(prepared.items.length,s.deck.length);
 const fork=forkExpeditionState(s,{knowledge:"fair",diceSeed:123,
  deckSeed:456,blueprint:prepared});
 assert.equal(fork.deck.length,s.deck.length);
});
test("fair Room rollouts preserve revealed corridor choices and returned paths",()=>{
 const s=roomState("fair");
 const forkRoom=ROOMS.find(r=>r.id==="u-fork");
 assert.ok(forkRoom?.v2.special?.corridor);
 const index=s.rooms.UPPER.findIndex(r=>r.id===forkRoom.id);
 assert.ok(index>=0);
 s.rooms.UPPER.splice(index,1);
 s.beginRoom(forkRoom);
 const firstCount=s.rooms.UPPER.length;
 s.apply("ROOM_SPECIAL",["0"],forkRoom);
 assert.equal(s.rooms.UPPER.length,firstCount);
 const chosen=s.rooms.UPPER[0].id;
 assert.equal(s.peekedRoomIds.UPPER[0],chosen);
 assert.equal(s.discardedRoomIds.size,0);
 assert.ok(s.publicBottomRoomIds.UPPER.length>0);
 const prepared=prepareRolloutDecks(s,"fair");
 const excluded=new Set([...s.discardedRoomIds]);
 for(const seed of [1,2,3,4,5]){
  const state=forkExpeditionState(s,{knowledge:"fair",diceSeed:seed,
   deckSeed:seed*31,blueprint:prepared});
  assert.equal(state.rooms.UPPER[0].id,chosen);
  assert.ok(state.rooms.UPPER.every(c=>!excluded.has(c.id)));
  assert.equal(state.rooms.UPPER.length,s.rooms.UPPER.length);
 }
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
  assert.ok(["attack","item","elbereth"].includes(plan.action));
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
  assert.ok(["attack","item","elbereth"].includes(plan.action));
  assert.ok(c.plannerDecisions);
 }
});
test("combat forks honor the new smuggled-Amulet ending after Warden Phase I",()=>{
 const s=roomState("oracle",0);
 s.beginRoom(VAULT);
 s.monster=WARDEN;s.monsterHP=10;
 s.vaultChoice="smuggle-if-available";
 s.vaultModifiers.smuggleAvailable=true;
 const magic=OBJECTS.find(o=>o.v2.tags?.includes("MAGIC")&&
  !s.heroes.some(h=>h.inventory.includes(o)));
 assert.ok(magic);
 s.add(s.heroes[0],magic);
 assert.equal(s.discardable(2),true);
 assert.equal(s.discardable(1,"MAGIC"),true);
 const result=rolloutCombatContinuation(s,0,{action:"attack"},{
  maxHeroActions:14,roomDepth:0});
 assert.equal(result.complete,true);
 assert.equal(result.won,true);
 assert.equal(s.endingKind,"smuggled_amulet");
 assert.equal(s.metrics.won,true);
 assert.equal(s.metrics.monsterVisits["warden-fury"]||0,0);
});
test("rare BARGAIN and UNTHRONE endings are reachable with exact printed costs",()=>{
 for(const variant of [
  {name:"bargain",gate:"bargainAvailable",kind:"bargained_amulet",
   tag:null,cost:2},
  {name:"unthrone",gate:"unthroneAvailable",kind:"unthroned_warden",
   tag:"MAGIC",cost:1}
 ]){
  const s=roomState("oracle",0);
  s.beginRoom(VAULT);
  s.monster=WARDEN;s.monsterHP=10;
  s.vaultChoice=variant.name+"-if-available";
  s.vaultModifiers[variant.gate]=true;
  if(!s.discardable(variant.cost,variant.tag)){
   const extra=OBJECTS.find(o=>!variant.tag||
    o.v2.tags?.includes(variant.tag));
   s.add(s.heroes[0],extra);
  }
  assert.ok(s.discardable(variant.cost,variant.tag));
  const spent=s.metrics.spent;
  const original=s.die;
  s.die=()=>20; // Successful opposed test is deterministic, not a lucky seed.
  const result=rolloutCombatContinuation(s,0,{action:"attack"},{
   maxHeroActions:14,roomDepth:0});
  s.die=original;
  assert.equal(result.complete,true,variant.name);
  assert.equal(result.won,true,variant.name);
  assert.equal(s.endingKind,variant.kind,variant.name);
  assert.equal(s.metrics.spent-spent,variant.cost,variant.name);
  assert.equal(s.metrics.monsterVisits["warden-fury"]||0,0,variant.name);
 }
});
test("combat forks can exit empty-handed without incorrectly counting victory",()=>{
 const s=roomState("oracle",0);
 s.beginRoom(VAULT);
 s.monster=WARDEN;s.monsterHP=10;
 s.vaultChoice="escape-if-available";
 s.vaultModifiers.smuggleAvailable=true;
 const result=rolloutCombatContinuation(s,0,{action:"attack"},{
  maxHeroActions:14,roomDepth:0});
 assert.equal(result.complete,true);
 assert.equal(result.won,false);
 assert.equal(s.metrics.escaped,true);
 assert.equal(s.endingKind,"escaped_empty_handed");
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


test("one nested rollout ply branches future actions but cannot recurse without a limit",()=>{
 const s=roomState("oracle",2);
 s.agentConfig=validateAgentConfig({...s.agentConfig,replanBudget:2});
 const first=forkExpeditionState(s,{knowledge:"oracle",diceSeed:38,deckSeed:49});
 assert.equal(first.agentConfig.budget,2);
 assert.equal(first.agentConfig.replanBudget,0);
 assert.equal(first.rolloutActive,true);
 const second=forkExpeditionState(first,{knowledge:"oracle",diceSeed:61,deckSeed:79});
 assert.equal(second.agentConfig.budget,0);
 assert.equal(second.agentConfig.replanBudget,0);
 assert.equal(s.agentConfig.budget,2);
 assert.equal(s.agentConfig.replanBudget,2);
});
test("strict terminal planning requires a complete horizon",()=>{
 const s=roomState("oracle",2);
 assert.throws(()=>validateAgentConfig({...s.agentConfig,
  strictTerminal:true}),/strictTerminal requires/);
 const config=validateAgentConfig({...s.agentConfig,
  rolloutRooms:9,combatActions:600,combatRoomDepth:9,strictTerminal:true});
 assert.equal(config.strictTerminal,true);
 assert.throws(()=>validateAgentConfig({...s.agentConfig,
  replanBudget:9}),/replanBudget/);
});
test("rollout agent actually searches retained fate Room choices",()=>{
 let found=false;
 for(let seed=5190;seed<5215;seed++){
  const r=simulateFullExpedition({
   seed,heroes:["warrior","wizard"],strategy:"magic",
   researchPolicy:"agent",agentConfig:{
    knowledge:"oracle",planning:"rollout",budget:1,
    replanBudget:0,rolloutRooms:2,combatActions:8,combatRoomDepth:0,
    weights:{...AGENT_WEIGHTS}
   }
  });
  assert.equal(r.unresolved,0);
  assert.equal(r.roundLimit,false);
  assert.ok(r.rolloutAudit?.roomBranches>0);
  assert.equal(r.rolloutAudit.roomBranches+r.rolloutAudit.combatBranches+
   (r.rolloutAudit.otherDecisionBranches||0),
   r.rolloutAudit.terminalBranches+r.rolloutAudit.nonterminalBranches);
  if(r.plannerDecisions.fateRoomsPlanned>0){found=true;break;}
 }
 assert.ok(found,"no retained fate Room reached the actual rollout evaluator");
});

test("future Room decisions really branch with nonzero nested budget",()=>{
 const s=roomState("oracle",2);
 s.agentConfig=validateAgentConfig({...s.agentConfig,replanBudget:1});
 const decision=pairedRoomRollouts(s,[true,true]);
 assert.ok([0,1].includes(decision.choice));
 assert.ok(s.metrics.rolloutAudit?.roomBranches>=4);
 assert.ok(s.metrics.rolloutAudit.futureReplannedBranches>0,
  "Inner continuation used the fixed policy instead of replanning");
 assert.ok(s.metrics.rolloutAudit.terminalBranches+
  s.metrics.rolloutAudit.nonterminalBranches>=4);
});
