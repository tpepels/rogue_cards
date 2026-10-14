import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import {createSessionPolicy,selectSessionPolicyAction,
 MAX_CONSECUTIVE_EQUIPMENT_ACTIONS} from "../src/session-policy.js";
import {VAULT,ROOMS} from "../src/tabletop-data.js";
import {submitDecision} from "../src/engine/decision-session.js";

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
 assert.equal(hero.slots.weapon,undefined);
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
 assert.equal(policy.consecutiveEquipment,0);
 assert.equal(JSON.stringify(observeSession(session)),before,
  "Search and policy selection never mutate the canonical session");
 assert.ok(sessionActions(session).some(a=>a.kind==="equip"),
  "The legal equipment decision is still available to human players");
});
