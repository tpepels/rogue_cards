import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {compareSessionActions} from "../src/session-counterfactual.js";
import {VAULT,ROOMS} from "../src/tabletop-data.js";

function affordableVault(){
 const session=createDecisionSession({seed:53210,heroes:["wizard"]});
 const s=session.state;
 while(!s.discardable(3,"MAGIC")){
  const index=s.deck.findIndex(c=>c.v2.tags.includes("MAGIC")&&
   !c.v2.tags.includes("CURSED"));
  assert.ok(index>=0);
  const card=s.deck.splice(index,1)[0];
  s.noteDeckRemoval(card);s.add(s.heroes[0],card);
 }
 for(const stage of ["UPPER","MIDDLE","DEEP"])s.stageProgress[stage]=3;
 s.beginRoom(VAULT);s.roomRoll();session.phase="vault";
 return session;
}
test("paired real-terminal action comparison is deterministic, covers both choices and does not mutate dice",()=>{
 const session=affordableVault(),before=JSON.stringify(observeSession(session));
 const rng=session.state.rng.snapshot();
 const options={trials:2,seed:47210,knowledge:"oracle",
  futureBudget:1,maxSearchSteps:1200};
 const checkpoints=[];
 const first=compareSessionActions(session,{
  ...options,onTrial:(index,samples)=>{checkpoints[index]=samples;}
 });
 assert.equal(checkpoints.length,2);
 const second=compareSessionActions(session,{
  ...options,resumeTrials:[checkpoints[0]]
 });
 assert.deepEqual(first,second);
 assert.equal(first.actions.length,2);
 assert.equal(first.trials,2);
 assert.equal(first.exactPairedSeeds,true);
 assert.equal(first.canonicalTerminalContinuations,true);
 assert.ok(first.actions.every(a=>a.observations===2));
 assert.ok(first.actions.every(a=>a.discordantPositive+
  a.discordantNegative+a.tiedPairs===2));
 assert.equal(first.actions[0].differenceVsReference,0);
 assert.equal(first.actions[0].mcnemarExactP,1);
 assert.equal(first.actions[0].holmAdjustedP,null);
 assert.equal(session.state.rng.snapshot(),rng);
 assert.equal(JSON.stringify(observeSession(session)),before);
});
test("paired evaluator refuses one-choice roots and invalid budgets",()=>{
 const session=createDecisionSession({seed:42,heroes:["warrior"]});
 assert.equal(sessionActions(session).length,1);
 assert.throws(()=>compareSessionActions(session,{trials:1}),
  /At least two legal/);
 const vault=affordableVault();
 assert.throws(()=>compareSessionActions(vault,{trials:0}),/trials/);
 assert.throws(()=>compareSessionActions(vault,{referenceIndex:3}),
  /referenceIndex/);
});
test("revealed Room-reroll actions are compared only after preserving the actual revealed die",()=>{
 const session=createDecisionSession({seed:1842,heroes:["warrior"]});
 session.state.beginRoom(ROOMS.find(r=>r.id==="u-fountain"));
 session.phase="room";
 const reaction=submitDecision(session,sessionActions(session)[0]);
 assert.equal(reaction.phase,"reaction");
 assert.equal(reaction.trigger.phase,"reroll");
 const before=JSON.stringify(observeSession(session));
 const result=compareSessionActions(session,{trials:1,seed:6115,
  knowledge:"oracle",futureBudget:1,maxSearchSteps:4000});
 assert.equal(result.actions.length,reaction.actions.length);
 assert.equal(result.actions[0].observations,1);
 assert.equal(JSON.stringify(observeSession(session)),before);
});
