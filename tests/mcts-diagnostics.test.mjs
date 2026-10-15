import test from "node:test";
import assert from "node:assert/strict";
import {
 MCTS_DIAGNOSTIC_ARMS,MCTS_DIAGNOSTIC_COMPARISONS,
 firstPolicyDivergence,summarizeMctsDiagnostics
} from "../src/mcts-diagnostic-report.js";
import {createDecisionSession,sessionActions,observeSession}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction}
 from "../src/session-policy.js";

const trace=(kind="continue",phase="between-rooms")=>({
 step:0,phase,roomId:"u-fork",monsterId:null,heroHp:[18],
 resources:{inventory:[["sword"]],equipped:[{weapon:"sword"}]},
 action:{phase,kind},actionFingerprint:kind
});
const sample=(i,a,b,c)=>({
 i,gameSeed:i+100,heroes:["warrior"],
 agents:{
  classic2:{won:a,requestedRollouts:2,trace:[trace("equip")]},
  classic16:{won:b,requestedRollouts:16,trace:[trace("continue")]},
  frontier16:{won:c,requestedRollouts:16,trace:[trace("unequip")]}
 }
});
test("compact diagnostic runs exactly the intended independent 3-arm contrasts",()=>{
 assert.deepEqual(MCTS_DIAGNOSTIC_ARMS.map(x=>x.id),
  ["classic2","classic16","frontier16"]);
 assert.deepEqual(MCTS_DIAGNOSTIC_COMPARISONS.map(x=>x.id),
  ["tree-16","budget-full"]);
 assert.equal(MCTS_DIAGNOSTIC_ARMS[1].budget,
  MCTS_DIAGNOSTIC_ARMS[2].budget);
 assert.equal(MCTS_DIAGNOSTIC_ARMS[0].treeMode,
  MCTS_DIAGNOSTIC_ARMS[1].treeMode);
});
test("report groups genuine losing pairs and shows only the earliest decision split",()=>{
 const rows=[sample(5,1,0,0),sample(2,0,1,0),
  sample(1,1,1,1),sample(0,0,0,0)];
 const report=summarizeMctsDiagnostics(rows);
 assert.equal(report["budget-full"].independentPairs,4);
 assert.equal(report["budget-full"].improvedSeeds,0);
 assert.equal(report["budget-full"].worsenedSeeds,1);
 assert.equal(report["budget-full"].lossesByFirstDecisionCategory["equipment-or-progress"],1);
 assert.equal(report["budget-full"].lossExamples[0].sourceIndex,5);
 assert.equal(report["tree-16"].worsenedSeeds,1);
 assert.equal(report["tree-16"].lossExamples[0].sourceIndex,2);
 assert.equal(report["tree-16"].baselineRequestedRollouts,64);
 assert.equal(report["tree-16"].candidateRequestedRollouts,64);
 assert.equal(report["tree-16"].exploratoryBonferroniP,1);
});
test("identical canonical prefixes do not invent card-level causes after divergence",()=>{
 const same=trace("continue","room");
 const diff=trace("room-choice","room");
 const split=firstPolicyDivergence([same,diff],[same,trace("pass","room")]);
 assert.equal(split.step,1);
 assert.equal(split.category,"room-or-reaction");
 assert.equal(split.trustworthySameState,true);
 assert.equal(split.baselineAction.kind,"room-choice");
 assert.equal(split.candidateAction.kind,"pass");
 assert.equal(firstPolicyDivergence([same],[same]),null);
 assert.equal(firstPolicyDivergence([same],[same,diff]).category,"trace-exhausted");
});
test("explicit full-tree controls preserve the previously seeded classic policy",()=>{
 const session=createDecisionSession({seed:531,heroes:["warrior"]});
 const before=JSON.stringify(observeSession(session));
 const options={budget:2,seed:19315,knowledge:"fair",maxSearchSteps:4000};
 const a=selectSessionPolicyAction(session,createSessionPolicy(),options);
 const b=selectSessionPolicyAction(session,createSessionPolicy(),{
  ...options,treeMode:"full"});
 assert.deepEqual(a,b);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.throws(()=>selectSessionPolicyAction(session,createSessionPolicy(),{
  ...options,treeMode:"invalid"}),/Invalid explicit MCTS treeMode/);
});
