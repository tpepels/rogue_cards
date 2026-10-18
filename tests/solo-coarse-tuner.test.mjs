import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {coarseCandidates,parseCoarseArgs,coarseSummary}
 from "../scripts/tune-solo-coarse.mjs";
import {evaluateHybridJob} from "../scripts/tune-mcts-hybrid-core.mjs";
import {makeSoloScenario} from "../scripts/solo-encounter-fixtures.mjs";
import {searchDecision} from "../src/session-mcts.js";
import {implicitHeuristicBreakdown} from "../src/mcts-implicit.js";
import {sessionActions,observeSession} from "../src/engine/decision-session.js";

test("Coarse tuner covers UCT, implicit MAX, numeric C/alpha, budgets and priors",()=>{
 const arms=coarseCandidates();
 assert.ok(arms.length>=30);
 assert.equal(new Set(arms.map(a=>a.name)).size,arms.length);
 assert.ok(arms.some(a=>a.alpha===0));
 assert.ok(arms.some(a=>a.alpha>0));
 assert.ok(arms.some(a=>a.budget===4));
 assert.ok(arms.some(a=>a.budget===32));
 assert.ok(arms.some(a=>a.heuristicMode==="solo-threat"));
 assert.ok(arms.some(a=>a.heuristicMode==="solo-hp"));
 assert.ok(arms.some(a=>a.heuristicMode==="legacy"));
 assert.ok(arms.some(a=>a.implicitHpScale===0.7));
 assert.ok(arms.some(a=>a.implicitThreatScale===1.4));
 assert.ok(arms.some(a=>a.simulationPolicy==="solo-pragmatic-tree"));
 assert.ok(arms.some(a=>a.simulationPolicy==="solo-pragmatic"));
 assert.ok(arms.some(a=>a.rolloutCombatMode==="sampled-expectimax"));
 const c=parseCoarseArgs(["--dry-run","--minutes","3","--workers","2",
  "--screen-groups","8","--holdout-groups","8"]);
 assert.equal(c.screenGroups,8);
 assert.equal(c.holdoutGroups,8);
 assert.throws(()=>parseCoarseArgs(["--screen-groups","40",
  "--holdout-groups","40"]),/disjoint/);
});
test("Coarse validation summary never certifies production defaults",()=>{
 const candidates=coarseCandidates().slice(0,2);
 const manifest={revision:"test",setup:{holdoutRepetitions:1},
  candidates,screen:["s1","s2"],holdout:["h1"]};
 const records=[
  ...["s1","s2"].flatMap(scenarioId=>candidates.map(candidate=>({
   phase:"screen",candidate:candidate.name,scenarioId,replicate:0,
   fitness:1,clear:1,hpFraction:0.5,searchMs:1
  }))),
  ...candidates.map(candidate=>({
   phase:"validate",candidate:candidate.name,scenarioId:"h1",
   replicate:0,fitness:1,clear:1,hpFraction:0.5,searchMs:1
  }))
 ];
 const initial=coarseSummary(records.slice(0,2),manifest);
 assert.equal(initial.completeScreen,false);
 assert.equal(initial.candidateToReview,null);
 const result=coarseSummary(records,manifest,candidates.map(c=>c.name));
 assert.equal(result.completeScreen,true);
 assert.equal(result.completeValidation,true);
 assert.equal(result.recommendedForProduction,false);
 assert.ok(result.candidateToReview);
 assert.equal(result.heldOutPairedComparisons.length,1);
});
test("Numerical tree/rollout knobs are isolated to search and reject invalid inputs",{
 timeout:60000
},()=>{
 const {session}=makeSoloScenario("crawler__solo-warrior-injured",{seed:218});
 const source=JSON.stringify(observeSession(session)),rng=session.state.rng.snapshot();
 const res=searchDecision(session,{budget:2,seed:2,
  treeMode:"frontier",knowledge:"oracle",strictTerminal:true,
  simulationPolicy:"solo-pragmatic",implicitWeight:0.2,
  implicitHeuristicMode:"solo-threat",exploration:0.5,
  implicitHpScale:1.3,implicitThreatScale:1.4,
  softTreeBonus:0.3,softTreeFirstVisitProbability:0.5,
  softRolloutProbability:0.5,maxSteps:5000});
 assert.ok(sessionActions(session).some(a=>JSON.stringify(a)===
  JSON.stringify(res.recommended)));
 assert.equal(JSON.stringify(observeSession(session)),source);
 assert.equal(session.state.rng.snapshot(),rng);
 assert.throws(()=>searchDecision(session,{
  budget:2,softTreeBonus:Infinity}),/Invalid softTreeBonus/);
 assert.throws(()=>searchDecision(session,{
  budget:2,implicitHpScale:-1}),/Invalid implicitHpScale/);
 assert.throws(()=>searchDecision(session,{
  budget:2,softRolloutProbability:-0.1}),/Invalid softRolloutProbability/);
});
test("Solo numeric heuristic weight scaling changes only heuristic values",()=>{
 const {session}=makeSoloScenario("crawler__solo-warrior-critical",{
  seed:113});
 const base=implicitHeuristicBreakdown(session,"solo-threat");
 const hp=implicitHeuristicBreakdown(session,"solo-threat",{hpScale:1.3});
 const risk=implicitHeuristicBreakdown(session,"solo-threat",{threatScale:1.4});
 assert.notEqual(base.terms.remainingHP,hp.terms.remainingHP);
 assert.notEqual(base.terms.activeMonsterAndQueue,
  risk.terms.activeMonsterAndQueue);
 assert.equal(base.terms.stageProgress,hp.terms.stageProgress);
 assert.equal(base.terms.items,risk.terms.items);
});
test("Tuner evaluates independent canonical solo encounter, not rollout-score proxy",{
 timeout:60000
},()=>{
 const candidate={name:"coarse-test",budget:2,c:0.5,alpha:0.2,
  heuristicMode:"solo-threat",simulationPolicy:"solo-pragmatic-tree",
  rolloutCombatMode:"random",softTreeBonus:0.3,
  softTreeFirstVisitProbability:0.5};
 const args={candidate,scenarioId:"wisp__solo-witch-critical",
  replicate:0,phase:"screen",seed:20261113,budget:2,
  samples:1,tacticalMax:1,independentTrials:2};
 const a=evaluateHybridJob(args),b=evaluateHybridJob(args);
 assert.deepEqual({...a,searchMs:0,evalMs:0},
  {...b,searchMs:0,evalMs:0});
 assert.equal(a.outcomes.length,2);
 assert.equal(a.softTreeBonus,0.3);
 assert.equal(a.simulationPolicy,"solo-pragmatic-tree");
 assert.ok(a.fitness>=-1&&a.fitness<=2);
});
test("Dry-run command exposes complete study plan without producing results",()=>{
 const cp=spawnSync(process.execPath,[
  new URL("../scripts/tune-solo-coarse.mjs",import.meta.url).pathname,
  "--dry-run","--candidate-limit","4","--screen-groups","2",
  "--holdout-groups","2","--minutes","1"
 ],{encoding:"utf8"});
 assert.equal(cp.status,0,cp.stderr);
 const result=JSON.parse(cp.stdout);
 assert.equal(result.candidates,4);
 assert.equal(result.screen,4);
 assert.equal(result.heldOut,6);
 assert.equal(result.noCardsOrEngineDefaultsChanged,true);
});
