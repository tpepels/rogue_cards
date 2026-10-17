import test from "node:test";
import assert from "node:assert/strict";
import {tuningCandidates,parseTuningOptions}
 from "../scripts/tune-mcts-hybrid.mjs";
import {evaluateHybridJob} from "../scripts/tune-mcts-hybrid-core.mjs";
import {makeScenario} from "../scripts/study-combat-phase2b.mjs";
import {implicitExpeditionHeuristic}
 from "../src/mcts-implicit.js";

test("Tuner exposes classic UCT and a complete paired C/alpha grid",()=>{
 const configs=tuningCandidates();
 assert.equal(configs.length,17);
 assert.equal(configs.filter(c=>c.alpha===0).length,5);
 assert.equal(configs.filter(c=>c.alpha>0).length,12);
 assert.equal(new Set(configs.map(c=>c.name??(c.c+"|"+c.alpha))).size,17);
 assert.equal(configs[0].rolloutCombatMode,"random");
 assert.ok(configs.slice(1).every(c=>
  c.rolloutCombatMode==="sampled-expectimax"));
 const p=parseTuningOptions([
  "--minutes","120","--workers","8","--budget","32",
  "--samples","2","--tactical-max","2",
  "--out","/tmp/mcts-tune-tests"
 ]);
 assert.equal(p.minutes,120);
 assert.equal(p.workers,8);
 assert.equal(p.budget,32);
 assert.equal(p.samples,2);
 assert.equal(p.validationMinutes,15);
 assert.equal(p.tacticalMax,2);
 assert.throws(()=>parseTuningOptions(["--minutes","120","--workers","0"]),
  /workers/);
});

test("Implicit heuristic distinguishes Monster damage and queued threat",()=>{
 const s=makeScenario("crawler","wounded-warrior",{seed:250}).session;
 const original=implicitExpeditionHeuristic(s);
 s.state.monsterHP=1;
 const woundedMonster=implicitExpeditionHeuristic(s);
 assert.ok(woundedMonster>original,
  "A nearly defeated Monster must improve the implicit value");
 s.state.monsterQueue=[s.state.monster];
 const queued=implicitExpeditionHeuristic(s);
 assert.ok(queued<woundedMonster,
  "An extra unresolved Monster must lower the value");
});

test("Held-out fitness uses real canonical actions and repeats exactly",{
 timeout:90000
},()=>{
 const candidate={c:0.7,alpha:0.25,
  rolloutCombatMode:"sampled-expectimax"};
 const args={candidate,scenarioId:"crawler__poisoned-witch",
  replicate:1,phase:"train",seed:255,budget:2,
  samples:1,tacticalMax:1,independentTrials:2};
 const a=evaluateHybridJob(args);
 const b=evaluateHybridJob(args);
 assert.deepEqual(
  {...a,searchMs:null,evalMs:null},
  {...b,searchMs:null,evalMs:null});
 assert.equal(a.outcomes.length,2);
 assert.equal(a.rolloutCombatMode,"sampled-expectimax");
 assert.ok(Number.isFinite(a.searchMs)&&a.searchMs>=0);
 assert.ok(Number.isFinite(a.evalMs)&&a.evalMs>=0);
 assert.ok(a.clear>=0&&a.clear<=1);
 assert.ok(a.fitness>=-1&&a.fitness<=2);
 assert.ok(a.action.includes("phase"));
 const classic=evaluateHybridJob({...args,candidate:{
  name:"uct-classic",c:Math.SQRT2,alpha:0,
  rolloutCombatMode:"random"}});
 assert.equal(classic.rolloutCombatSearches,0);
 assert.equal(classic.scenarioId,a.scenarioId);
});
