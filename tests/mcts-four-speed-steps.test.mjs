import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";

export const FOUR_SPEED_OPTIMIZATIONS=Object.freeze([
 {id:"replay",flags:{reuseEmptyReplaySwitches:true}},
 {id:"actions",flags:{reuseEdgeActions:true}},
 {id:"path-hash",flags:{streamHistoryHash:true}},
 {id:"uct-scratch",flags:{reuseSelectionScratch:true}}
]);
const allFlags=Object.assign({},...FOUR_SPEED_OPTIMIZATIONS.map(x=>x.flags));

function fountainReaction(){
 const session=createDecisionSession({seed:1842,heroes:["warrior"]});
 const pile=session.state.rooms.UPPER;
 const index=pile.findIndex(card=>card.id==="u-fountain");
 assert.ok(index>=0,"Expected real Fountain room");
 session.state.beginRoom(pile.splice(index,1)[0]);
 session.phase="room";
 const result=submitDecision(session,sessionActions(session)[0]);
 assert.equal(result.phase,"reaction");
 return session;
}

test("each optimization independently preserves complete canonical MCTS results",()=>{
 const fixtures=[
  {name:"solo fair",session:createDecisionSession({seed:3573,heroes:["warrior"]}),
   opts:{knowledge:"fair",budget:8,seed:20261017}},
  {name:"two heroes fair",session:createDecisionSession({
   seed:7292,heroes:["warrior","witch"]}),
   opts:{knowledge:"fair",budget:4,seed:20261018}},
  {name:"nested reaction",session:fountainReaction(),
   opts:{knowledge:"fair",budget:4,seed:20261019}}
 ];
 for(const {name,session,opts} of fixtures){
  const before=JSON.stringify(observeSession(session));
  const dice=session.state.rng.snapshot();
  for(const treeMode of ["full","frontier"]){
   const options={...opts,treeMode,maxSteps:4000,collectCoverage:true};
   const baseline=searchDecision(session,options);
   for(const config of [...FOUR_SPEED_OPTIMIZATIONS,
    {id:"combined",flags:allFlags}]){
    const actual=searchDecision(session,{...options,...config.flags});
    assert.deepEqual(actual,baseline,name+" "+treeMode+" "+config.id+
     " changed MCTS outcomes, actions, visit counts or observations");
   }
  }
  assert.equal(JSON.stringify(observeSession(session)),before);
  assert.equal(session.state.rng.snapshot(),dice);
 }
});
test("historical MCTS remains the default and new flags reject invalid values",()=>{
 const session=createDecisionSession({seed:3573,heroes:["warrior"]});
 const args={budget:2,seed:100,knowledge:"fair",maxSteps:4000};
 assert.deepEqual(searchDecision(session,args),searchDecision(session,{
  ...args,...Object.fromEntries(
   FOUR_SPEED_OPTIMIZATIONS.flatMap(x=>
    Object.keys(x.flags).map(key=>[key,false]))
  )
 }));
 assert.throws(()=>searchDecision(session,{...args,reuseEdgeActions:0}),
  /reuseEdgeActions, streamHistoryHash and reuseSelectionScratch must be boolean/);
 assert.throws(()=>searchDecision(session,{...args,streamHistoryHash:0}),
  /reuseEdgeActions, streamHistoryHash and reuseSelectionScratch must be boolean/);
 assert.throws(()=>searchDecision(session,{...args,reuseSelectionScratch:0}),
  /reuseEdgeActions, streamHistoryHash and reuseSelectionScratch must be boolean/);
 assert.throws(()=>searchDecision(session,{...args,reuseEmptyReplaySwitches:0}),
  /reuseEmptyReplaySwitches must be boolean/);
});
