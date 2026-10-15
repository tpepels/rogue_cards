import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {ROOMS,MONSTERS,WARDEN,VAULT}
 from "../src/tabletop-data.js";
import {searchDecision} from "../src/session-mcts.js";

function scenario(kind,seed=83192){
 const session=createDecisionSession({seed,heroes:["warrior","witch"]}),s=session.state;
 if(kind==="corpse"){
  s.beginRoom(ROOMS.find(r=>r.id==="u-nest"));
  s.monster=MONSTERS.find(m=>m.id==="rat");
  s.monsterHP=0;
  s.heroes[0].poison=true;
  s.heroes[0].used.add("used-hero-token");
  s.heroes[0].defDuration=1;
  s.heroes[0].nextDefenseBonus=2;
  session.phase="corpse";
 }else if(kind==="vault"){
  s.beginRoom(VAULT);
  session.phase="vault";
 }else if(kind==="post-warden"){
  s.beginRoom(VAULT);
  s.monster=WARDEN;s.monsterHP=10;
  session.phase="post-warden";
 }else throw Error("Unknown setup");
 return session;
}
function paired(kind){
 const fast=scenario(kind),legacy=scenario(kind);
 const a=sessionActions(fast).find(x=>
  kind==="corpse"?x.kind==="leave":x.kind==="fight");
 const b=sessionActions(legacy).find(x=>
  kind==="corpse"?x.kind==="leave":x.kind==="fight");
 assert.ok(a&&b);
 const beforeDice=fast.state.rng.snapshot();
 const reference=submitDecision(legacy,b,{directSettlements:false});
 const result=submitDecision(fast,a,{directSettlements:true});
 assert.deepEqual(result,reference);
 assert.deepEqual(observeSession(fast),observeSession(legacy));
 assert.deepEqual(sessionActions(fast),sessionActions(legacy));
 assert.equal(fast.state.rng.snapshot(),legacy.state.rng.snapshot());
 assert.equal(fast.state.rng.snapshot(),beforeDice);
 assert.deepEqual(fast.state.metrics,legacy.state.metrics);
 assert.deepEqual(fast.state.stageProgress,legacy.state.stageProgress);
 assert.equal(fast.state.monster,legacy.state.monster);
 assert.equal(fast.state.monsterHP,legacy.state.monsterHP);
 assert.deepEqual(fast.state.heroes.map(h=>({poison:h.poison,immune:h.immune,
  used:[...h.used],nextHitBlock:h.nextHitBlock,
  nextDefenseBonus:h.nextDefenseBonus,defDuration:h.defDuration})),
  legacy.state.heroes.map(h=>({poison:h.poison,immune:h.immune,
  used:[...h.used],nextHitBlock:h.nextHitBlock,
  nextDefenseBonus:h.nextDefenseBonus,defDuration:h.defDuration})));
}
test("guarded corpse leave executes exactly the same canonical settlement",()=>{
 paired("corpse");
});
test("both Warden FIGHT boundaries produce precisely identical full state",()=>{
 paired("vault");
 paired("post-warden");
});
test("guarded direct corpse settlement restores precise state after an exception",()=>{
 const session=scenario("corpse");
 const action=sessionActions(session).find(a=>a.kind==="leave");
 const before=observeSession(session),dice=session.state.rng.snapshot();
 const hero=session.state.heroes[0];
 const used=hero.used,room=session.state.room,originalUsed=[...used];
 const originalEnd=ExpeditionState.prototype.endRoom;
 session.state.endRoom=function(){
  originalEnd.call(this);
  throw Error("deliberate failure after room settlement");
 };
 assert.throws(()=>submitDecision(session,action,{directSettlements:true}),
  /deliberate failure/);
 assert.deepEqual(observeSession(session),before);
 assert.equal(session.state.rng.snapshot(),dice);
 assert.equal(session.state.room,room);
 assert.strictEqual(hero.used,used);
 assert.deepEqual([...used],originalUsed);
 assert.equal(session.state.metrics.kills,0);
 delete session.state.endRoom;
});
test("unsafe printed Room decisions still use identical transactional replay",()=>{
 const a=createDecisionSession({seed:1842,heroes:["warrior"]});
 const b=createDecisionSession({seed:1842,heroes:["warrior"]});
 for(const session of [a,b]){
  session.state.beginRoom(ROOMS.find(x=>x.id==="u-fountain"));
  session.phase="room";
 }
 const actionA=sessionActions(a)[0],actionB=sessionActions(b)[0];
 const x=submitDecision(a,actionA,{directSettlements:true});
 const y=submitDecision(b,actionB,{directSettlements:false});
 assert.deepEqual(x,y);
 assert.equal(x.phase,"reaction");
 assert.equal(a.state.rng.snapshot(),b.state.rng.snapshot());
});
test("MCTS direct settlements retain exact seeded full and frontier trees",()=>{
 for(const kind of ["corpse","vault","post-warden"]){
  for(const treeMode of ["full","frontier"]){
   const session=scenario(kind);
   const options={seed:73291,budget:4,knowledge:"oracle",treeMode,
    maxSteps:4000,collectCoverage:false};
   assert.deepEqual(searchDecision(session,{...options,directSettlements:true}),
    searchDecision(session,{...options,directSettlements:false}),
    kind+" "+treeMode+" MCTS diverged");
  }
 }
 assert.throws(()=>submitDecision(scenario("corpse"),{
  phase:"corpse",kind:"leave"
 },{directSettlements:0}),/directSettlements must be boolean/);
});

test("guarded corpse settlement forks and suspends when a delayed Item draw requires a Hero choice",()=>{
 const fast=scenario("corpse",91427);
 const reference=scenario("corpse",91427);
 for(const session of [fast,reference])session.state.pendingReward=1;
 const before=JSON.stringify(observeSession(fast)),dice=fast.state.rng.snapshot();
 const x=submitDecision(fast,sessionActions(fast).find(a=>a.kind==="leave"),
  {directSettlements:true});
 const y=submitDecision(reference,sessionActions(reference).find(a=>a.kind==="leave"),
  {directSettlements:false});
 assert.deepEqual(x,y);
 assert.equal(x.phase,"reaction");
 assert.equal(JSON.stringify(observeSession(fast)),
  JSON.stringify(observeSession(reference)));
 assert.equal(fast.state.rng.snapshot(),dice);
 assert.equal(reference.state.rng.snapshot(),dice);
 assert.ok(before.length>0);
});
