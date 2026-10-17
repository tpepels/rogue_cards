import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import {sampledCombatRolloutAction,combatLeafValue}
 from "../src/combat-rollout-expectimax.js";
import {backupImplicit,implicitUCTExploitation,
 implicitExpeditionHeuristic} from "../src/mcts-implicit.js";
import {makeEncounter} from "../scripts/study-combat-causes.mjs";
import {runHybridAblation} from "../scripts/bench-mcts-combat-hybrids.mjs";
import {CLASSIC_UCT_C,HYBRID_UCT_C,HYBRID_IMPLICIT_ALPHA,
 resolveExploration,resolveSearchProfile}
 from "../src/mcts-hybrid-defaults.js";
import {MONSTERS} from "../src/tabletop-data.js";

test("Sampled 2-ply combat lookahead stays canonical and leaves source untouched",{
 timeout:25000
},()=>{
 const monster=MONSTERS.find(x=>x.id==="crawler");
 const sim=makeEncounter(monster,["warrior","knight"],2121);
 const before=sim.state.rng.snapshot(),phase=sim.phase;
 const hps=sim.state.heroes.map(x=>x.hp);
 const legal=sessionActions(sim),chosen=sampledCombatRolloutAction(sim,{
  samples:1,ply:2,seed:20261017,maxSteps:80
 });
 assert.ok(legal.some(a=>JSON.stringify(a)===JSON.stringify(chosen)));
 assert.equal(sim.state.rng.snapshot(),before);
 assert.equal(sim.phase,phase);
 assert.deepEqual(sim.state.heroes.map(x=>x.hp),hps);
 assert.ok(Number.isFinite(combatLeafValue(sim)));
});
test("Combat action search considers actual canonically available Items",{
 timeout:25000
},()=>{
 const monster=MONSTERS.find(x=>x.id==="crawler");
 const sim=makeEncounter(monster,["warrior"],845);
 const h=sessionActions(sim)[0];
 submitDecision(sim,h,{observeResult:false,recordHistory:false});
 assert.equal(sim.phase,"combat");
 const legal=sessionActions(sim);
 assert.ok(legal.some(a=>a.kind==="attack"));
 const chosen=sampledCombatRolloutAction(sim,{
  samples:1,ply:2,seed:2424
 });
 assert.ok(legal.some(a=>JSON.stringify(a)===JSON.stringify(chosen)));
});
test("Implicit backups use a separate MAX/expectation channel, not MC wins",()=>{
 const edgeA={visits:5,wins:1};
 const edgeB={visits:5,wins:4};
 const node={edges:new Map([["a",edgeA],["b",edgeB]])};
 backupImplicit([{node,edge:edgeA}],0.8);
 backupImplicit([{node,edge:edgeA}],0.6);
 backupImplicit([{node,edge:edgeB}],0.4);
 assert.equal(edgeA.implicitVisits,2);
 assert.equal(edgeA.implicitSum,1.4);
 assert.ok(Math.abs(node.implicitValue-0.7)<1e-12);
 assert.equal(edgeA.wins,1);
 assert.equal(edgeB.wins,4);
 assert.ok(Math.abs(implicitUCTExploitation(edgeA,0.5)-0.45)<1e-12);
 assert.equal(implicitUCTExploitation(edgeA,0),0.2);
 const parentEdge={visits:2,wins:0};
 const parent={edges:new Map([["child",parentEdge]])};
 backupImplicit([{node:parent,edge:parentEdge},{node,edge:edgeB}],0.9);
 assert.ok(parent.implicitValue>0.6);
 assert.equal(parentEdge.wins,0);
});
test("Opt-in flags preserve the original UCT result and validate boundary",{
 timeout:30000
},()=>{
 const session=createDecisionSession({seed:101,heroes:["warrior"]});
 const args={seed:33,budget:2,maxSteps:150,strictTerminal:false,
  knowledge:"oracle",treeMode:"frontier"};
 const a=searchDecision(session,args);
 const b=searchDecision(session,{...args,
  rolloutCombatMode:"random",implicitWeight:0});
 assert.deepEqual(a,b,"Disabled hybrid features must be bit-for-bit compatible");
 assert.throws(()=>searchDecision(session,{...args,treeMode:"full",
  rolloutCombatMode:"sampled-expectimax"}),/requires frontier/);
 assert.throws(()=>searchDecision(session,{...args,implicitWeight:1.5}),
  /Implicit backup weight/);
 assert.ok(implicitExpeditionHeuristic(session)>=0);
});
test("Frontier UCT accepts sampled combat rollout and implicit backup together",{
 timeout:90000
},()=>{
 const m=MONSTERS.find(x=>x.id==="crawler");
 const session=makeEncounter(m,["warrior"],123);
 const result=searchDecision(session,{
  seed:195,budget:1,knowledge:"oracle",
  strictTerminal:false,maxSteps:200,
  treeMode:"frontier",rolloutCombatMode:"sampled-expectimax",
  rolloutCombatSamples:1,rolloutCombatMaxDecisions:2,
  implicitWeight:0.25,collectCoverage:false
 });
 assert.equal(result.rolloutCombatMode,"sampled-expectimax");
 assert.equal(result.implicitWeight,0.25);
 assert.equal(result.exploration,HYBRID_UCT_C);
 assert.ok(result.rolloutCombatSearches>=1);
 assert.equal(session.phase,"combat-hero");
 assert.ok(result.choices.every(x=>Object.hasOwn(x,"implicitValue")));
});

test("Completed UCT trial backs up implicit heuristic without fabricating wins",{
 timeout:60000
},()=>{
 const session=createDecisionSession({seed:700,heroes:["warrior"],
  gameMode:"original"});
 const result=searchDecision(session,{
  seed:750,budget:2,knowledge:"oracle",strictTerminal:true,
  maxSteps:5000,treeMode:"frontier",implicitWeight:0.25,
  collectCoverage:false
 });
 assert.equal(result.completed,2);
 assert.equal(result.incomplete,0);
 assert.ok(result.implicitRootValue>=0&&result.implicitRootValue<=1);
 assert.ok(result.choices.some(c=>c.implicitValue!==null));
 assert.equal(result.terminalWins,
  result.choices.reduce((sum,c)=>sum+c.wins,0));
});

test("Hybrid defaults use a lower C and literature-range alpha, while classic stays unchanged",()=>{
 assert.equal(CLASSIC_UCT_C,Math.SQRT2);
 assert.equal(HYBRID_UCT_C,0.7);
 assert.equal(HYBRID_IMPLICIT_ALPHA,0.25);
 assert.deepEqual(resolveSearchProfile({searchProfile:"classic"}),{
  rolloutCombatMode:"random",implicitWeight:0,exploration:Math.SQRT2
 });
 assert.deepEqual(resolveSearchProfile({searchProfile:"deep-uct"}),{
  rolloutCombatMode:"random",implicitWeight:0,exploration:Math.SQRT2
 });
 assert.deepEqual(resolveSearchProfile({searchProfile:"combat-hybrid"}),{
  rolloutCombatMode:"sampled-expectimax",implicitWeight:0.25,
  exploration:0.7
 });
 assert.equal(resolveExploration({rolloutCombatMode:"sampled-expectimax"}),0.7);
 assert.equal(resolveExploration({implicitWeight:0.25}),0.7);
 assert.equal(resolveExploration({exploration:0.35}),0.35);
 assert.equal(resolveSearchProfile({searchProfile:"combat-hybrid",
  exploration:0.5,implicitWeight:0.15}).exploration,0.5);
 assert.throws(()=>resolveExploration({exploration:-0.5}),/Exploration/);
});

test("Implicit Room-progress heuristic only saturates after three complete stages",()=>{
 const expedition=createDecisionSession({
  seed:67,heroes:["warrior"],gameMode:"everything-goes"
 });
 const s=expedition.state;
 assert.equal(s.roomGoal,12);
 s.metrics.cleared=12;
 const firstStage=implicitExpeditionHeuristic(expedition);
 s.metrics.cleared=24;
 const twoStages=implicitExpeditionHeuristic(expedition);
 s.metrics.cleared=36;
 const threeStages=implicitExpeditionHeuristic(expedition);
 assert.ok(firstStage<twoStages&&twoStages<threeStages);
 assert.ok(Math.abs(twoStages-firstStage-0.22/3)<1e-12);
 assert.ok(Math.abs(threeStages-twoStages-0.22/3)<1e-12);
});

test("Ablation tactical cap is explicit and never exceeds per-rollout limit",{
 timeout:90000
},()=>{
 const report=runHybridAblation({
  monsterIds:["crawler"],budget:1,samples:1,
  seed:20261017,tacticalMax:2,write:false
 });
 assert.equal(report.design.tacticalMax,2);
 assert.equal(report.rows.length,4);
 for(const row of report.rows){
  assert.equal(row.tacticalMax,2);
  assert.ok(row.rolloutCombatSearches<=2*row.budget);
  if(row.arm==="uct-classic"||row.arm==="uct-low-c")
   assert.equal(row.rolloutCombatSearches,0);
 }
 assert.throws(()=>runHybridAblation({
  monsterIds:["crawler"],tacticalMax:0,write:false
 }),/Invalid MCTS ablation/);
});
