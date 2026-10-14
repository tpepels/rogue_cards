import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {ROOMS,MONSTERS,VAULT,OBJECTS} from "../src/tabletop-data.js";
import {legalActions} from "../src/engine/index.js";
import {AGENT_WEIGHTS,validateAgentConfig} from "../src/research-agent.js";
import {pairedPhaseRollouts} from "../src/rollout-evaluator.js";

const build=seed=>{
 const s=new ExpeditionState({seed,heroes:["warrior","wizard"],strategy:"magic"});
 s.researchPolicy="agent";s.plannerRisk="cautious";
 s.agentConfig=validateAgentConfig({knowledge:"oracle",planning:"rollout",
  budget:1,replanBudget:0,strictTerminal:true,
  rolloutRooms:9,combatActions:600,combatRoomDepth:9,
  samplingSeed:2317,weights:{...AGENT_WEIGHTS}});
 s.agentDecisionSerial=0;s.plannerDecisions={};
 s.researchDecisions={parleyConsidered:0,parleySelected:0,
  spellsReserved:0,sealConsidered:0,sealSelected:0};
 s.plannerFeatures=new Set(["room","combat","parley","seal"]);
 s.vaultChoice="policy";return s;
};
test("PARLEY is a genuine terminal choice search, not a threshold-only heuristic",()=>{
 const s=build(712);
 s.beginRoom(ROOMS.find(r=>r.id==="u-nest"));
 s.monster=MONSTERS.find(m=>m.id==="rat");s.monsterHP=s.monster.hp;
 const actions=legalActions(s,{phase:"parley"}).map(x=>x.kind);
 assert.deepEqual(actions,["fight","parley"]);
 const before=s.heroes.map(h=>h.hp);
 const r=pairedPhaseRollouts(s,"parley");
 assert.equal(r.samples,1);
 assert.ok(["fight","parley"].includes(r.action.kind));
 assert.equal(s.metrics.rolloutAudit.otherDecisionBranches,2);
 assert.equal(s.metrics.rolloutAudit.nonterminalBranches,0);
 assert.deepEqual(s.heroes.map(h=>h.hp),before);
});
test("Vault search branches actual SEAL versus the complete Warden fight",()=>{
 const s=build(713);
 for(const id of ["scroll-flame","scroll-frost","scroll-banish",
  "scroll-lightning","scroll-mischief","scroll-last"]){
  const o=OBJECTS.find(c=>c.id===id);s.add(s.heroes[0],o);
 }
 s.beginRoom(VAULT);
 const a=legalActions(s,{phase:"vault"}).map(x=>x.kind);
 assert.deepEqual(a,["fight","seal"]);
 const r=pairedPhaseRollouts(s,"vault");
 assert.equal(r.samples,1);
 assert.ok(a.includes(r.action.kind));
 assert.equal(s.metrics.rolloutAudit.otherDecisionBranches,2);
 assert.equal(s.metrics.rolloutAudit.nonterminalBranches,0);
});
test("post-Warden search branches SMUGGLE and FIGHT from legal state",()=>{
 const s=build(714);
 s.beginRoom(VAULT);
 const magic=OBJECTS.find(c=>c.id==="scroll-flame");
 s.add(s.heroes[0],magic);
 s.vaultModifiers.smuggleAvailable=true;
 const actions=legalActions(s,{phase:"post-warden"}).map(x=>x.kind);
 assert.ok(actions.includes("fight")&&actions.includes("smuggle"));
 const r=pairedPhaseRollouts(s,"post-warden");
 assert.equal(r.samples,1);
 assert.ok(actions.includes(r.action.kind));
 assert.equal(s.metrics.rolloutAudit.otherDecisionBranches,actions.length);
 assert.equal(s.metrics.rolloutAudit.nonterminalBranches,0);
});
