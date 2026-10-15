import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession,
 submitSpeculativeDecision} from "../src/engine/decision-session.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {searchDecision} from "../src/session-mcts.js";
import {ROOMS,MONSTERS} from "../src/tabletop-data.js";

const room=id=>ROOMS.find(x=>x.id===id);
function atRoom(seed,id,heroes=["warrior"]){
 const session=createDecisionSession({seed,heroes});
 const pile=session.state.rooms.UPPER;
 const i=pile.findIndex(c=>c.id===id);
 assert.ok(i>=0);
 session.state.beginRoom(pile.splice(i,1)[0]);
 session.phase="room";
 return session;
}
function atCombat(seed,heroes=["wizard"]){
 const session=atRoom(seed,"u-nest",heroes);
 session.state.monster=MONSTERS.find(x=>x.id==="rat");
 session.state.monsterHP=session.state.monster.hp;
 session.phase="combat";
 session.heroIndex=0;
 return session;
}
function checkpointRestorer(session){
 const state=forkGameState(session.state);
 const meta={
  phase:session.phase,heroIndex:session.heroIndex,
  monsterRound:session.monsterRound,
  actionCount:session.actionCount,
  returnRoomId:session.returnRoomId,
  history:session.history.slice(),
  remainingReturns:[...session.remainingReturns],
  pendingNested:session.pendingNested
 };
 return ()=>{
  session.state=forkGameState(state);
  Object.assign(session,meta,{
   history:meta.history.slice(),
   remainingReturns:[...meta.remainingReturns]});
 };
}
function compareAction(factory,choose){
 const direct=factory(),legacy=factory();
 const a=sessionActions(direct).find(choose);
 const b=sessionActions(legacy).find(choose);
 assert.ok(a&&b,"Expected printed legal action");
 assert.deepEqual(a,b);
 const beforeDice=direct.state.rng.snapshot();
 const callback=checkpointRestorer(direct);
 const actual=submitSpeculativeDecision(direct,a,{restore:callback,
  observeResult:true,recordHistory:true});
 const expected=submitDecision(legacy,b);
 assert.deepEqual(actual,expected);
 assert.deepEqual(observeSession(direct),observeSession(legacy));
 assert.equal(direct.state.rng.snapshot(),legacy.state.rng.snapshot());
 if(actual.phase==="reaction"){
  assert.equal(direct.state.rng.snapshot(),beforeDice,
   "A printed reaction must not spend actual pre-reaction dice");
  const picked=direct.pendingNested.actions[0];
  submitDecision(direct,picked);
  submitDecision(legacy,legacy.pendingNested.actions[0]);
  assert.deepEqual(observeSession(direct),observeSession(legacy));
  assert.equal(direct.state.rng.snapshot(),legacy.state.rng.snapshot());
 }
}
test("checkpoint restoration preserves printed Room and combat nested prompts",()=>{
 compareAction(()=>atRoom(1842,"u-fountain"),
  a=>a.kind==="room-choice"&&a.index===0);
 compareAction(()=>atCombat(3192,["wizard"]),
  a=>a.kind==="attack");
});
test("uninterrupted canonical Room and corpse actions match the original transaction",()=>{
 compareAction(()=>atRoom(3573,"u-passage"),
  a=>a.kind==="room-choice"&&a.index===0);
 compareAction(()=>{
  const session=atRoom(4112,"u-nest");
  session.state.monster=MONSTERS.find(x=>x.id==="rat");
  session.state.monsterHP=0;
  session.phase="corpse";
  return session;
 },a=>a.kind==="leave");
});
test("speculative MCTS matches all terminal trajectories, visits and choices",()=>{
 const fixtures=[
  {create:()=>createDecisionSession({seed:3573,heroes:["warrior"]}),
   args:{seed:20261016,budget:8,knowledge:"fair"}},
  {create:()=>createDecisionSession({seed:7292,heroes:["warrior","witch"]}),
   args:{seed:20261017,budget:4,knowledge:"fair"}},
  {create:()=>atRoom(1842,"u-fountain"),
   args:{seed:20261018,budget:4,knowledge:"fair"}},
  {create:()=>atCombat(3192,["wizard"]),
   args:{seed:20261019,budget:4,knowledge:"oracle"}}
 ];
 for(const fixture of fixtures){
  for(const treeMode of ["full","frontier"]){
   for(const checkpointEvery of [1,32]){
    const session=fixture.create(),opts={...fixture.args,treeMode,
     maxSteps:4000,collectCoverage:true};
    const before=JSON.stringify(observeSession(session));
    const dice=session.state.rng.snapshot();
    const legacy=searchDecision(session,opts);
    const optimized=searchDecision(session,{
     ...opts,speculativeTransitions:true,checkpointEvery
    });
    assert.deepEqual(optimized,legacy,
     "Checkpoint restoration changed a canonical seeded MCTS search");
    const lazy=searchDecision(session,{
     ...opts,speculativeTransitions:true,lazyInitialCheckpoint:true,
     checkpointEvery
    });
    assert.deepEqual(lazy,legacy,
     "Lazy checkpoint recovery changed canonical MCTS search");
    assert.equal(JSON.stringify(observeSession(session)),before);
    assert.equal(session.state.rng.snapshot(),dice);
   }
  }
 }
});
test("speculative search validates its isolated mode and checkpoint interval",()=>{
 const session=createDecisionSession({seed:3573,heroes:["warrior"]});
 assert.throws(()=>searchDecision(session,{budget:2,speculativeTransitions:1}),
  /speculativeTransitions must be boolean/);
 assert.throws(()=>searchDecision(session,{budget:2,checkpointEvery:0}),
  /checkpointEvery must be an integer/);
 assert.throws(()=>searchDecision(session,{budget:2,checkpointEvery:257}),
  /checkpointEvery must be an integer/);
 assert.throws(()=>searchDecision(session,{budget:2,lazyInitialCheckpoint:1}),
  /lazyInitialCheckpoint must be boolean/);
 assert.throws(()=>searchDecision(session,{budget:2,profileTransitions:1}),
  /profileTransitions must be boolean/);
 assert.throws(()=>searchDecision(session,{budget:2,canonicalReactionPhases:1}),
  /canonicalReactionPhases must be boolean/);
 assert.throws(()=>searchDecision(session,{budget:2,deferReactionCheckpoints:1}),
  /deferReactionCheckpoints must be boolean/);
 assert.throws(()=>searchDecision(session,{budget:2,onDemandCheckpoints:1}),
  /onDemandCheckpoints must be boolean/);
 assert.throws(()=>submitSpeculativeDecision(session,
  sessionActions(session)[0],{}),
  /requires a rollback callback/);
});

test("non-reaction rule failures also restore the exact checkpoint",()=>{
 const session=atRoom(4112,"u-nest");
 session.state.monster=MONSTERS.find(x=>x.id==="rat");
 session.state.monsterHP=0;
 session.phase="corpse";
 const originalEnd=session.state.endRoom;
 session.state.endRoom=function(){
  originalEnd.call(this);
  throw Error("injected failure after canonical room cleanup");
 };
 const before=JSON.stringify(observeSession(session));
 const dice=session.state.rng.snapshot();
 const rollback=checkpointRestorer(session);
 const action=sessionActions(session).find(x=>x.kind==="leave");
 assert.ok(action);
 assert.throws(()=>submitSpeculativeDecision(session,action,{
  restore:rollback,observeResult:false,recordHistory:false
 }),/injected failure/);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),dice);
 assert.equal(session.phase,"corpse");
 assert.equal(session.actionCount,0);
});

test("checkpoint replay retains legacy observed transitions and no-transaction mode",()=>{
 const session=atRoom(1842,"u-fountain");
 const options={seed:20261021,budget:2,knowledge:"fair",
  maxSteps:4000,collectCoverage:true,fastTransitions:false};
 const old=searchDecision(session,options);
 const speculative=searchDecision(session,{
  ...options,speculativeTransitions:true,checkpointEvery:4
 });
 assert.deepEqual(speculative,old);
 const noTransaction=searchDecision(session,{
  ...options,transactional:false
 });
 assert.deepEqual(searchDecision(session,{
  ...options,transactional:false,speculativeTransitions:true
 }),noTransaction,
 "Speculation must not override an explicit non-transactional search");
});

test("optional transition profiling preserves all MCTS decisions",()=>{
 const session=atRoom(1842,"u-fountain");
 const opts={seed:20261018,budget:4,knowledge:"fair",treeMode:"full",
  maxSteps:4000,collectCoverage:false};
 const baseline=searchDecision(session,opts);
 const measured=searchDecision(session,{...opts,profileTransitions:true});
 const {transitionProfile:profile,...canonical}=measured;
 assert.deepEqual(canonical,baseline);
 assert.ok(profile.totals.trialClone.count>=opts.budget);
 assert.ok(profile.totals.canonicalFork.count>0);
 const lazy=searchDecision(session,{...opts,profileTransitions:true,
  speculativeTransitions:true,lazyInitialCheckpoint:true,
  checkpointEvery:32});
 const {transitionProfile:lazyProfile,...lazyCanonical}=lazy;
 assert.deepEqual(lazyCanonical,baseline);
 assert.equal(lazyProfile.totals.initialCheckpointClone,undefined);
 assert.ok(lazyProfile.totals.speculativeTransition.count>0);
});

test("canonical reaction-phase routing preserves complete MCTS search trees",()=>{
 const fixtures=[
  {create:()=>atRoom(1842,"u-fountain"),seed:20261018},
  {create:()=>atRoom(3573,"u-passage"),seed:20261019},
  {create:()=>atCombat(3192,["wizard"]),seed:20261020},
  {create:()=>createDecisionSession({seed:7292,
   heroes:["warrior","witch"]}),seed:20261021}
 ];
 for(const fixture of fixtures){
  for(const treeMode of ["full","frontier"]){
   const session=fixture.create();
   const options={seed:fixture.seed,budget:4,
    knowledge:"fair",treeMode,maxSteps:4000,collectCoverage:true};
   const before=JSON.stringify(observeSession(session));
   const dice=session.state.rng.snapshot();
   const canonical=searchDecision(session,options);
   for(const flags of [
    {canonicalReactionPhases:true},
    {canonicalReactionPhases:true,deferReactionCheckpoints:true},
    {canonicalReactionPhases:true,deferReactionCheckpoints:true,
     lazyInitialCheckpoint:true}
   ]){
    const report=searchDecision(session,{
     ...options,speculativeTransitions:true,profileTransitions:true,
     checkpointEvery:8,...flags
    });
    const {transitionProfile,...result}=report;
    assert.deepEqual(result,canonical,
     "Canonical reaction-phase routing changed a complete search tree");
    assert.ok(transitionProfile.totals.trialClone.count>=options.budget);
    assert.equal(transitionProfile.byPhase.room?.nestedRecovery?.count??0,0);
    assert.equal(transitionProfile.byPhase["retained-entry"]?.
     nestedRecovery?.count??0,0);
    if(flags.deferReactionCheckpoints)
     assert.equal(transitionProfile.byPhase.terminal?.
      checkpointClone?.count??0,0);
    assert.equal(JSON.stringify(observeSession(session)),before);
    assert.equal(session.state.rng.snapshot(),dice);
   }
  }
 }
});

test("on-demand checkpoints preserve exact sampled UCT search and every reaction",()=>{
 const fixtures=[
  {create:()=>atRoom(1842,"u-fountain"),seed:20261018},
  {create:()=>atRoom(3573,"u-passage"),seed:20261019},
  {create:()=>atCombat(3192,["wizard"]),seed:20261020},
  {create:()=>createDecisionSession({seed:7292,
   heroes:["warrior","witch"]}),seed:20261021}
 ];
 for(const fixture of fixtures){
  for(const treeMode of ["full","frontier"]){
   const session=fixture.create();
   const before=JSON.stringify(observeSession(session));
   const dice=session.state.rng.snapshot();
   const options={seed:fixture.seed,budget:4,knowledge:"fair",
    treeMode,maxSteps:4000,collectCoverage:true};
   const canonical=searchDecision(session,options);
   for(const checkpointEvery of [1,8,32]){
    const selective=searchDecision(session,{
     ...options,speculativeTransitions:true,
     canonicalReactionPhases:true,deferReactionCheckpoints:true,
     checkpointEvery
    });
    const profiled=searchDecision(session,{
     ...options,speculativeTransitions:true,
     canonicalReactionPhases:true,deferReactionCheckpoints:true,
     checkpointEvery,onDemandCheckpoints:true,profileTransitions:true
    });
    const {transitionProfile,...result}=profiled;
    assert.deepEqual(result,canonical,"On-demand search diverged from canonical");
    assert.deepEqual(result,selective,"On-demand search changed UCT");
    assert.equal(transitionProfile.totals.initialCheckpointClone,undefined);
    assert.equal(transitionProfile.totals.checkpointClone,undefined);
    assert.equal(transitionProfile.totals.initialRecoveryClone,undefined);
    assert.equal(JSON.stringify(observeSession(session)),before);
    assert.equal(session.state.rng.snapshot(),dice);
   }
  }
 }
});

test("on-demand checkpoints preserve pending printed reactions and nontransactional mode",()=>{
 const session=atRoom(1842,"u-fountain");
 const first=sessionActions(session).find(a=>a.kind==="room-choice"&&a.index===0);
 assert.ok(first);
 submitDecision(session,first);
 assert.ok(session.pendingNested,"Expected a printed Room reaction");
 const options={seed:20261018,budget:3,knowledge:"fair",
  maxSteps:4000,collectCoverage:true};
 const canonical=searchDecision(session,options);
 assert.deepEqual(searchDecision(session,{
  ...options,speculativeTransitions:true,canonicalReactionPhases:true,
  deferReactionCheckpoints:true,onDemandCheckpoints:true
 }),canonical);
 const noTransaction=searchDecision(session,{...options,transactional:false});
 assert.deepEqual(searchDecision(session,{
  ...options,transactional:false,speculativeTransitions:true,
  onDemandCheckpoints:true
 }),noTransaction);
});
