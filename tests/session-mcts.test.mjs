import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision,mctsPublicStateHash,mctsLegacyPublicStateHash,mctsActionKey} from "../src/session-mcts.js";
import {createSessionPolicy,selectSessionPolicyAction,
 MAX_CONSECUTIVE_EQUIPMENT_ACTIONS} from "../src/session-policy.js";
import {VAULT,ROOMS} from "../src/tabletop-data.js";
import {submitDecision} from "../src/engine/decision-session.js";
import {forkGameState} from "../src/engine/fork-state.js";

function vault(){
 const session=createDecisionSession({seed:53210,heroes:["wizard"]}),s=session.state;
 // Physically move exactly the needed printed MAGIC copies out of the deck.
 while(!s.discardable(3,"MAGIC")){
  const index=s.deck.findIndex(x=>x.v2.tags.includes("MAGIC")&&
   !x.v2.tags.includes("CURSED"));
  assert.ok(index>=0);
  const card=s.deck.splice(index,1)[0];
  s.noteDeckRemoval(card);s.add(s.heroes[0],card);
 }
 for(const stage of ["UPPER","MIDDLE","DEEP"])s.stageProgress[stage]=3;
 s.beginRoom(VAULT);s.roomRoll();
 session.phase="vault";return session;
}
test("real ISMCTS explores both legal Vault decisions without mutating original future dice",()=>{
 const session=vault();
 const before=JSON.stringify(observeSession(session));
 const rng=session.state.rng.snapshot();
 const r=searchDecision(session,{budget:6,seed:7817,knowledge:"oracle",
  maxSteps:1200});
 assert.equal(r.budget,6);
 assert.equal(r.completed,6);
 assert.equal(r.incomplete,0);
 assert.equal(r.complete,true);
 assert.equal(r.rootActionCount,2);
 assert.equal(r.choices.reduce((n,a)=>n+a.visits,0),6);
 assert.ok(r.choices.every(x=>x.visits>0));
 assert.ok(sessionActions(session).some(x=>x.kind===r.recommended.kind));
 assert.ok(r.treeNodes>=1);
 assert.ok(r.maximumDepth>1);
 assert.equal(session.state.rng.snapshot(),rng);
 assert.equal(JSON.stringify(observeSession(session)),before);
});
test("fair MCTS resamples unseen physical decks and is fully repeatable on a fixed seed",()=>{
 const session=vault();
 const before=session.state.deck.map(c=>c.id).join(",");
 const opts={budget:4,knowledge:"fair",seed:7818,maxSteps:1200};
 const a=searchDecision(session,opts),b=searchDecision(session,opts);
 assert.deepEqual(a,b);
 assert.equal(a.completed,4);
 assert.equal(a.rootActionCount,2);
 assert.equal(a.maxConsecutiveRolloutEquipmentActions,6);
 assert.ok(Number.isInteger(a.rolloutEquipmentAdvances));
 assert.ok(a.rolloutEquipmentAdvances>=0);
 assert.equal(session.state.deck.map(c=>c.id).join(","),before);
});
test("search refuses to call a nonterminal continuation a lost expedition",()=>{
 const session=vault();
 assert.throws(()=>searchDecision(session,{
  budget:1,seed:7819,knowledge:"oracle",maxSteps:1
 }),/nonterminal/);
 const result=searchDecision(session,{
  budget:1,seed:7819,knowledge:"oracle",maxSteps:1,
  strictTerminal:false
 });
 assert.equal(result.complete,false);
 assert.equal(result.incomplete,1);
 assert.equal(result.completed,0);
 assert.equal(result.terminalWinRate,null);
});

test("fair search at a revealed corridor uses the actually visible Room IDs",()=>{
 const session=createDecisionSession({seed:1846,heroes:["warrior"]});
 const deck=session.state.rooms.UPPER;
 const index=deck.findIndex(r=>r.id==="u-fork");
 assert.ok(index>=0);
 session.state.beginRoom(deck.splice(index,1)[0]);
 session.phase="room";
 const choice=sessionActions(session).find(a=>a.index===0);
 const pending=submitDecision(session,choice);
 assert.equal(pending.phase,"reaction");
 assert.equal(pending.trigger.phase,"corridor");
 assert.equal(pending.actions.length,2);
 const shown=pending.actions.map(a=>a.roomId);
 const before=JSON.stringify(observeSession(session));
 const rng=session.state.rng.snapshot();
 const result=searchDecision(session,{budget:2,seed:19010,
  knowledge:"fair",maxSteps:4000});
 assert.equal(result.completed,2);
 assert.equal(result.rootActionCount,2);
 assert.ok(result.choices.every(x=>shown.includes(x.action.roomId)));
 assert.ok(result.choices.every(x=>x.visits>0));
 assert.ok(result.actionCoverage.phaseSelections["reaction:corridor"]>=2);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),rng);
});
test("a die already shown before a Room reroll cannot change across sampled alternatives",()=>{
 const session=createDecisionSession({seed:1842,heroes:["warrior"]});
 session.state.beginRoom(ROOMS.find(r=>r.id==="u-fountain"));
 session.phase="room";
 const choice=sessionActions(session)[0];
 const pending=submitDecision(session,choice);
 assert.equal(pending.phase,"reaction");
 assert.equal(pending.trigger.phase,"reroll");
 const previous=JSON.stringify(pending.trigger);
 const r=searchDecision(session,{budget:2,seed:19011,
  knowledge:"oracle",maxSteps:4000});
 assert.equal(r.completed,2);
 assert.equal(r.rootActionCount,2);
 assert.equal(JSON.stringify(observeSession(session).trigger),previous);
});

test("full-legal-action MCTS policy cannot cycle forever on free equipment changes",()=>{
 const session=createDecisionSession({seed:3573,heroes:["warrior"]});
 const s=session.state;
 // Warrior's printed starting Sword is automatically equipped when
 // acquired. Unequip it through the real player-decision API to create
 // an actual, reproducible equip/continue choice at this boundary.
 const hero=s.heroes[0];
 const sword=hero.inventory.find(c=>c.id==="sword");
 assert.ok(sword,"Warrior starts with the printed Sword");
 for(const card of [...hero.inventory])
  if(card!==sword)s.remove(hero,card);
 assert.equal(hero.slots.weapon,sword);
 const unequip=sessionActions(session).find(a=>
  a.kind==="unequip"&&a.cardId==="sword");
 assert.ok(unequip,"Sword can be unequipped");
 submitDecision(session,unequip);
 // submitDecision commits a fork back into session.state. Earlier Hero
 // object references belong to the pre-commit state.
 assert.equal(s.heroes[0].slots.weapon,undefined);
 const legal=sessionActions(session);
 assert.ok(legal.some(a=>a.kind==="equip"&&a.cardId==="sword"));
 assert.ok(legal.some(a=>a.kind==="continue"));
 const policy=createSessionPolicy();
 policy.consecutiveEquipment=MAX_CONSECUTIVE_EQUIPMENT_ACTIONS;
 const before=JSON.stringify(observeSession(session));
 const chosen=selectSessionPolicyAction(session,policy,{
  budget:2,seed:87321,maxSearchSteps:4000,knowledge:"fair"
 });
 assert.equal(chosen.kind,"continue");
 assert.equal(policy.cycleBreaks,1,
  "The progression cap, not a coincidental MCTS choice, caused continuation");
 assert.equal(policy.consecutiveEquipment,0);
 assert.equal(JSON.stringify(observeSession(session)),before,
  "Search and policy selection never mutate the canonical session");
 assert.ok(sessionActions(session).some(a=>a.kind==="equip"),
  "The legal equipment decision is still available to human players");
});

test("canonical MCTS policy elides a fully overridden search without changing dice",()=>{
 const session=createDecisionSession({seed:3573,heroes:["warrior"]});
 const sword=session.state.heroes[0].inventory.find(c=>c.id==="sword");
 assert.ok(sword);
 submitDecision(session,sessionActions(session).find(a=>
  a.kind==="unequip"&&a.cardId==="sword"));
 const legal=sessionActions(session);
 assert.ok(legal.length>1&&legal.some(a=>a.kind==="continue"));
 const before=JSON.stringify(observeSession(session));
 const dice=session.state.rng.snapshot();
 const policy=createSessionPolicy();
 policy.consecutiveEquipment=MAX_CONSECUTIVE_EQUIPMENT_ACTIONS;
 // A real MCTS continuation with maxSteps=1 cannot reach a terminal
 // expedition. If search still ran before forced Continue, it would throw.
 const recommended=selectSessionPolicyAction(session,policy,{
  seed:7123,knowledge:"fair",maxSearchSteps:1,legalActions:legal
 });
 assert.equal(recommended.kind,"continue");
 assert.equal(policy.cycleBreaks,1);
 assert.equal(policy.consecutiveEquipment,0);
 assert.equal(session.state.rng.snapshot(),dice);
 assert.equal(JSON.stringify(observeSession(session)),before);
});

test("MCTS telemetry and precomputed root-actions toggles preserve the chosen move",()=>{
 const session=vault();
 const opts={budget:4,seed:7818,knowledge:"fair",maxSteps:1200};
 const baseline=searchDecision(session,opts);
 const faster=searchDecision(session,{
  ...opts,rootActions:sessionActions(session),collectCoverage:false
 });
 assert.ok(Object.keys(baseline.actionCoverage.actionOpportunities).length>0);
 assert.ok(Object.keys(faster.actionCoverage.actionOpportunities).length===0);
 assert.deepEqual(
  {...faster,actionCoverage:undefined},
  {...baseline,actionCoverage:undefined},
  "No-telemetry MCTS must explore identical canonical futures and select identical actions"
 );
});

test("fast MCTS position hashing equals the full canonical public observation",()=>{
 const legacyHash=text=>{
  let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return h>>>0;
 };
 const legacyKey=session=>{
  const observation=observeSession(session);
  return legacyHash(JSON.stringify({
   phase:observation.phase,
   trigger:observation.trigger??null,
   heroIndex:observation.heroIndex??null,
   game:observation.game
  }));
 };
 const normal=createDecisionSession({seed:9314,heroes:["warrior","witch"]});
 assert.equal(mctsPublicStateHash(normal),legacyKey(normal));
 const equipped=vault();
 assert.equal(mctsPublicStateHash(equipped),legacyKey(equipped));
 const pending=createDecisionSession({seed:1842,heroes:["warrior"]});
 pending.state.beginRoom(ROOMS.find(r=>r.id==="u-fountain"));
 pending.phase="room";
 submitDecision(pending,sessionActions(pending)[0]);
 assert.ok(pending.pendingNested,"Expected a real nested reroll reaction");
 assert.equal(mctsPublicStateHash(pending),legacyKey(pending));
});

test("faster canonical game-state fork preserves RNG, physical-copy identity and mutable isolation",()=>{
 const session=createDecisionSession({seed:8391,heroes:["warrior","witch"]});
 const original=session.state;
 const fork=forkGameState(original);
 assert.notStrictEqual(fork,original);
 assert.equal(fork.rng.snapshot(),original.rng.snapshot());
 assert.notStrictEqual(fork.rng,original.rng);
 assert.notStrictEqual(fork.heroes,original.heroes);
 assert.notStrictEqual(fork.heroes[0],original.heroes[0]);
 assert.strictEqual(fork.deck[0],original.deck[0],
  "Immutable physical card copies are intentionally shared");
 const equipped=Object.values(fork.heroes[0].slots).filter(Boolean);
 for(const card of equipped)
  assert.ok(fork.heroes[0].inventory.includes(card),
   "Equipment slot must reference the exact owned physical copy");
 const hp=original.heroes[0].hp;
 fork.heroes[0].hp--;
 assert.equal(original.heroes[0].hp,hp);
 const originalRoll=original.rng.snapshot();
 fork.rng.die(6);
 assert.equal(original.rng.snapshot(),originalRoll);
 fork.metrics.cardCounts.sentinel=923;
 assert.notEqual(original.metrics.cardCounts.sentinel,923);
});


test("full canonical MCTS outcomes, visits and decisions match transactional and legacy forks",()=>{
 const samples=[
  {session:createDecisionSession({seed:531,heroes:["warrior","witch"]}),
   options:{seed:19315,budget:4,knowledge:"fair",maxSteps:4000}},
  {session:vault(),
   options:{seed:19316,budget:4,knowledge:"oracle",maxSteps:4000}}
 ];
 for(const {session,options} of samples){
  const before=JSON.stringify(observeSession(session));
  const rng=session.state.rng.snapshot();
  const transactional=searchDecision(session,{...options,transactional:true});
  const legacy=searchDecision(session,{...options,transactional:false});
  assert.deepEqual(transactional,legacy,
   "The two modes must search identical printed actions and rollouts");
  assert.equal(JSON.stringify(observeSession(session)),before);
  assert.equal(session.state.rng.snapshot(),rng);
 }
});

test("observation-free MCTS rollouts are exactly equivalent to legacy full observation paths",()=>{
 const fixtures=[
  {session:vault(),opts:{seed:66711,budget:3,knowledge:"oracle",maxSteps:4000}},
  {session:createDecisionSession({seed:3573,heroes:["warrior"]}),
   opts:{seed:66712,budget:3,knowledge:"fair",maxSteps:4000}}
 ];
 for(const {session,opts} of fixtures){
  const original=JSON.stringify(observeSession(session));
  const beforeDice=session.state.rng.snapshot();
  const fast=searchDecision(session,{...opts,fastTransitions:true});
  const previous=searchDecision(session,{...opts,fastTransitions:false});
  assert.deepEqual(fast,previous,
   "Skipping unused observation and action-history allocations must not change searches");
  assert.equal(JSON.stringify(observeSession(session)),original);
  assert.equal(session.state.rng.snapshot(),beforeDice);
 }
});

test("pending printed reactions retain exactly the same MCTS outcomes without observations",()=>{
 const session=createDecisionSession({seed:1842,heroes:["warrior"]});
 const deck=session.state.rooms.UPPER;
 const index=deck.findIndex(r=>r.id==="u-fountain");
 assert.ok(index>=0,"Fountain must be an actual unvisited Room");
 session.state.beginRoom(deck.splice(index,1)[0]);
 session.phase="room";
 const reaction=submitDecision(session,sessionActions(session)[0]);
 assert.equal(reaction.phase,"reaction");
 const opts={seed:66713,budget:2,knowledge:"fair",maxSteps:4000};
 const fast=searchDecision(session,{...opts,fastTransitions:true});
 const previous=searchDecision(session,{...opts,fastTransitions:false});
 assert.deepEqual(fast,previous);
 assert.equal(observeSession(session).phase,"reaction");
});


test("cached canonical MCTS action signatures exactly match sorted JSON fingerprints",()=>{
 const original=action=>JSON.stringify(Object.keys(action).sort()
  .map(key=>[key,action[key]]));
 const single=createDecisionSession({seed:3573,heroes:["warrior"]});
 const actions=[
  ...sessionActions(single),
  {phase:"combat",kind:"item",heroIndex:0,optionIndex:2,cardId:"wand-undo"},
  {cardId:"wand-undo",phase:"combat",optionIndex:2,kind:"item",heroIndex:0},
  {mode:"steady",kind:"hero-mode",phase:"hero-trigger",heroIndex:0},
  {kind:"effect-option",phase:"effect-choice",mode:"1",context:"select-hero:room-action"}
 ];
 for(const action of actions){
  assert.equal(mctsActionKey(action),original(action));
  assert.equal(mctsActionKey(action),original(action),"Cached shape changed key");
 }
 const altered={...actions[0],index:19};
 assert.equal(mctsActionKey(altered),original(altered));
});

test("issued legal decision tickets reject stale and forged lists, without removing any legal moves",()=>{
 const session=createDecisionSession({seed:3573,heroes:["warrior"]});
 const actions=sessionActions(session,{issueTicket:true});
 const unequip=actions.find(a=>a.kind==="unequip"&&a.cardId==="sword");
 assert.ok(unequip);
 assert.ok(Object.isFrozen(actions));
 assert.ok(Object.isFrozen(unequip));
 assert.throws(()=>actions.push({kind:"forge",phase:"equipment"}),TypeError);
 assert.throws(()=>{unequip.kind="forge"},TypeError);
 assert.throws(()=>submitDecision(session,unequip,{
  verifiedLegalActions:[...actions]}),/Stale or unissued/);
 const baseline=createDecisionSession({seed:3573,heroes:["warrior"]});
 submitDecision(session,unequip,{verifiedLegalActions:actions});
 submitDecision(baseline,sessionActions(baseline).find(a=>a.kind==="unequip"&&a.cardId==="sword"));
 assert.deepEqual(observeSession(session),observeSession(baseline));
 assert.throws(()=>submitDecision(session,unequip,{
  verifiedLegalActions:actions}),/Stale or unissued/);
 const newActions=sessionActions(session,{issueTicket:true});
 const equip=newActions.find(a=>a.kind==="equip"&&a.cardId==="sword");
 assert.ok(equip);
 submitDecision(session,equip,{verifiedLegalActions:newActions});
 submitDecision(baseline,sessionActions(baseline).find(a=>a.kind==="equip"&&a.cardId==="sword"));
 assert.deepEqual(observeSession(session),observeSession(baseline));
});

test("verified full-expedition MCTS decisions are bit-for-bit identical to repeated canonical legality checks",()=>{
 const fixtures=[
  {session:createDecisionSession({seed:531,heroes:["warrior","witch"]}),
   options:{seed:66101,budget:4,knowledge:"fair",maxSteps:4000}},
  {session:vault(),
   options:{seed:66102,budget:4,knowledge:"oracle",maxSteps:4000}}
 ];
 for(const {session,options} of fixtures){
  const start=JSON.stringify(observeSession(session));
  const startDice=session.state.rng.snapshot();
  const old=searchDecision(session,{...options,reuseLegalActions:false});
  const fast=searchDecision(session,{...options,reuseLegalActions:true});
  assert.deepEqual(fast,old,"UCT visits, completed rollouts, choices and win counts differ");
  assert.equal(JSON.stringify(observeSession(session)),start);
  assert.equal(session.state.rng.snapshot(),startDice);
 }
});


test("verified MCTS action tickets execute real Room choices and combat attacks identically",()=>{
 const makeRoom=()=>{
  const session=createDecisionSession({seed:9031,heroes:["warrior"]});
  const deck=session.state.rooms.UPPER;
  const i=deck.findIndex(card=>card.id==="u-fountain");
  assert.ok(i>=0);
  session.state.beginRoom(deck.splice(i,1)[0]);
  session.phase="room";
  return session;
 };
 for(const factory of [makeRoom]){
  const fast=factory(),slow=factory();
  const actions=sessionActions(fast,{issueTicket:true});
  const action=actions.find(a=>a.kind==="room-choice"&&a.index===0);
  assert.ok(action);
  submitDecision(fast,action,{verifiedLegalActions:actions});
  submitDecision(slow,sessionActions(slow).find(a=>a.kind==="room-choice"&&a.index===0));
  assert.deepEqual(observeSession(fast),observeSession(slow));
  assert.equal(fast.state.rng.snapshot(),slow.state.rng.snapshot());
 }
});


test("streamed MCTS public state hash is bit-identical to original JSON hash across phases and reactions",()=>{
 const fixtures=[
  createDecisionSession({seed:7291,heroes:["warrior"]}),
  createDecisionSession({seed:7292,heroes:["warrior","witch"]}),
  vault()
 ];
 for(const session of fixtures){
  for(const index of [-1,0,1]){
   session.heroIndex=index;
   assert.equal(mctsPublicStateHash(session),mctsLegacyPublicStateHash(session));
  }
 }
 const pending=createDecisionSession({seed:1842,heroes:["warrior"]});
 const deck=pending.state.rooms.UPPER;
 const i=deck.findIndex(card=>card.id==="u-fountain");
 assert.ok(i>=0);
 pending.state.beginRoom(deck.splice(i,1)[0]);
 pending.phase="room";
 const first=submitDecision(pending,sessionActions(pending)[0]);
 assert.equal(first.phase,"reaction");
 assert.equal(mctsPublicStateHash(pending),mctsLegacyPublicStateHash(pending));
 const keep=sessionActions(pending).find(a=>a.kind==="keep");
 assert.ok(keep);
 submitDecision(pending,keep);
 assert.equal(mctsPublicStateHash(pending),mctsLegacyPublicStateHash(pending));
});

test("streamed hashing preserves the entire seeded MCTS tree and chosen actions",()=>{
 const trials=[
  {session:vault(),opts:{seed:61972,budget:4,knowledge:"oracle",maxSteps:4000}},
  {session:createDecisionSession({seed:3573,heroes:["warrior"]}),
   opts:{seed:61973,budget:4,knowledge:"fair",maxSteps:4000}}
 ];
 for(const {session,opts} of trials){
  const previous=searchDecision(session,{...opts,fastStateHash:false});
  const fast=searchDecision(session,{...opts,fastStateHash:true});
  assert.deepEqual(fast,previous);
 }
});


test("frontier UCT is real tree search and preserves each unvisited-root trial's canonical result",()=>{
 const session=vault(),opts={seed:98817,budget:2,knowledge:"oracle",
  maxSteps:4000,collectCoverage:true};
 const legacy=searchDecision(session,{...opts,treeMode:"full"});
 const frontier=searchDecision(session,{...opts,treeMode:"frontier"});
 // With at most one visit per root edge, both policies choose the same
 // default legal actions and consume the same random draws. The explicit
 // tree-node count is EXPECTED to differ.
 assert.deepEqual(
  {...frontier,treeNodes:legacy.treeNodes},
  legacy,
  "UCT frontier changed sampled canonical outcomes before any re-visit");
 assert.ok(frontier.treeNodes<=legacy.treeNodes);
 assert.ok(frontier.treeNodes>=1,"The root UCT tree must remain present");
 assert.ok(frontier.complete);
 assert.ok(frontier.rootEveryActionTried);
});

test("frontier UCT expands revisited branches and remains deterministic with more visits",()=>{
 const session=vault(),opts={seed:7817,budget:4,knowledge:"oracle",
  maxSteps:4000,treeMode:"frontier"};
 const original=JSON.stringify(observeSession(session));
 const dice=session.state.rng.snapshot();
 const a=searchDecision(session,opts),b=searchDecision(session,opts);
 assert.deepEqual(a,b);
 assert.equal(a.completed,4);
 assert.equal(a.choices.reduce((n,x)=>n+x.visits,0),4);
 assert.ok(a.treeNodes>1,"Revisited UCT roots must expand deeper tree nodes");
 assert.equal(JSON.stringify(observeSession(session)),original);
 assert.equal(session.state.rng.snapshot(),dice);
 assert.ok(sessionActions(session).some(x=>
  JSON.stringify(x)===JSON.stringify(a.recommended)));
});

test("deep-uct agent profile is explicit, reproducible and does not mutate actual dice",()=>{
 const session=vault(),original=JSON.stringify(observeSession(session));
 const rng=session.state.rng.snapshot();
 const policyA=createSessionPolicy(),policyB=createSessionPolicy();
 const options={searchProfile:"deep-uct",deepMinBudget:4,
  deepVisitsPerAction:2,budget:2,seed:7817,knowledge:"oracle",
  maxSearchSteps:4000};
 const a=selectSessionPolicyAction(session,policyA,options);
 const b=selectSessionPolicyAction(session,policyB,options);
 assert.deepEqual(a,b);
 assert.deepEqual(policyA,policyB);
 assert.ok(sessionActions(session).some(x=>JSON.stringify(x)===JSON.stringify(a)));
 assert.equal(JSON.stringify(observeSession(session)),original);
 assert.equal(session.state.rng.snapshot(),rng);
 assert.throws(()=>selectSessionPolicyAction(session,createSessionPolicy(),{
  ...options,searchProfile:"not-mcts"}),/Unknown searchProfile/);
});
