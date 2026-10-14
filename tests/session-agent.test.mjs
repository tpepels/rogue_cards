import test from "node:test";
import assert from "node:assert/strict";
import {playSessionWithMCTS} from "../src/session-agent.js";
test("MCTS plays a full actual expedition with no policy-picked alternative actions",()=>{
 const s=playSessionWithMCTS({seed:621,heroes:["warrior"],
  knowledge:"oracle",budget:1,traceLimit:30,maxSearchSteps:4000});
 assert.equal(s.resolved,true);
 assert.ok(s.actions>0&&s.actions<=7000);
 assert.equal(s.searchedDecisions+s.forcedDecisions,
  Object.values(s.decisionCounts).reduce((sum,v)=>sum+v,0));
 assert.ok(s.searchedDecisions>0);
 assert.ok(s.searches.every(x=>x.budget===1&&x.choices.length>=2));
 assert.ok(Object.keys(s.choiceCoverage).length>0);
 assert.ok(s.won||s.metrics.wipeCause||s.ending==="escaped_empty_handed");
});
test("a fixed seed and MCTS seed policy reproduce every selected card action",()=>{
 const opts={seed:622,heroes:["wizard"],knowledge:"fair",
  budget:1,traceLimit:10,maxSearchSteps:4000};
 const a=playSessionWithMCTS(opts);
 const b=playSessionWithMCTS(opts);
 assert.deepEqual(a,b);
 assert.ok(a.actions>0);
});
