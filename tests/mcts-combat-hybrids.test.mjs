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
 assert.ok(result.rolloutCombatSearches>=1);
 assert.equal(session.phase,"combat-hero");
 assert.ok(result.choices.every(x=>Object.hasOwn(x,"implicitValue")));
});
