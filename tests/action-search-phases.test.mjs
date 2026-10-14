import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {ROOMS,MONSTERS,VAULT} from "../src/tabletop-data.js";
import {legalActions} from "../src/engine/index.js";
import {AGENT_WEIGHTS,validateAgentConfig} from "../src/research-agent.js";
import {pairedPhaseRollouts} from "../src/rollout-evaluator.js";

const grant=(s,id)=>{
 const index=s.deck.findIndex(c=>c.id===id);
 assert.ok(index>=0,"Physical Item missing: "+id);
 const [card]=s.deck.splice(index,1);
 s.noteDeckRemoval(card);s.add(s.heroes[0],card);
};
const build=seed=>{
 const s=new ExpeditionState({seed,heroes:["warrior","wizard"],strategy:"magic"});
 s.researchPolicy="agent";s.plannerRisk="cautious";
 s.agentConfig=validateAgentConfig({knowledge:"oracle",planning:"rollout",
  budget:1,replanBudget:0,strictTerminal:true,
  rolloutRooms:9,combatActions:600,combatRoomDepth:9,
  samplingSeed:2317,weights:{...AGENT_WEIGHTS}});
 s.agentDecisionSerial=0;s.plannerDecisions={};s.plannerTrace=[];
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
 while(!s.discardable(6,"MAGIC")){
  const next=s.deck.find(c=>c.v2.tags.includes("MAGIC")&&
   !c.v2.tags.includes("CURSED"));
  assert.ok(next,"Insufficient physical MAGIC Items in test deck");
  grant(s,next.id);
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
 s.keptRooms.push({card:ROOMS.find(r=>r.id==="d-gilded"),choice:1});
 s.beginRoom(VAULT);
 if(!s.discardable(1,"MAGIC")){
  const next=s.deck.find(c=>c.v2.tags.includes("MAGIC"));
  assert.ok(next);grant(s,next.id);
 }
 assert.equal(s.vaultModifiers.smuggleAvailable,true);
 const actions=legalActions(s,{phase:"post-warden"}).map(x=>x.kind);
 assert.ok(actions.includes("fight")&&actions.includes("smuggle"));
 const r=pairedPhaseRollouts(s,"post-warden");
 assert.equal(r.samples,1);
 assert.ok(actions.includes(r.action.kind));
 assert.equal(s.metrics.rolloutAudit.otherDecisionBranches,actions.length);
 assert.equal(s.metrics.rolloutAudit.nonterminalBranches,0);
});
