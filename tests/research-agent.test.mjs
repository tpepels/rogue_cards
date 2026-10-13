import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {HEROES,OBJECTS} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {AGENT_WEIGHTS,OPTIMIZATION_RANGES,observeDecks,
 validateAgentConfig,prepareAgentObservation,
 agentPlanRoom,agentPlanCombat,agentPlanParley,agentPlanSeal}
 from "../src/research-agent.js";
import {expeditionSeed,candidateWeights,paired} from "../scripts/study-agent.mjs";

const make=(knowledge="fair",budget=8)=>{
 const s=new ExpeditionState({seed:20270,heroes:["warrior","wizard"],
  strategy:"magic"});
 s.agentConfig=validateAgentConfig({knowledge,budget,weights:{...AGENT_WEIGHTS}});
 s.plannerRisk="cautious";
 s.agentDecisionSerial=0;
 const room=s.rooms.UPPER.shift();
 s.beginRoom(room);
 return s;
};
test("Oracle observes full ordered decks; fair never sees hidden card identities",()=>{
 const fair=make("fair");
 const publicView=observeDecks(fair,"fair");
 assert.deepEqual(Object.keys(publicView).sort(),[
  "knowledge","monsterCounts","remainingItems","roomCounts"]);
 assert.equal(publicView.remainingItems,fair.deck.length);
 assert.equal(publicView.roomCounts.UPPER,fair.rooms.UPPER.length);
 assert.ok(!("items" in publicView));
 assert.ok(!("rooms" in publicView));
 assert.ok(!("monsters" in publicView));
 const privateView=observeDecks(fair,"oracle");
 assert.deepEqual(privateView.items,fair.deck.map(o=>o.id));
 assert.deepEqual(privateView.rooms.UPPER,fair.rooms.UPPER.map(o=>o.id));
 assert.deepEqual(privateView.monsters.DEEP,fair.monsters.DEEP.map(o=>o.id));
 assert.notStrictEqual(privateView.items,fair.deck);
 assert.ok(Object.isFrozen(privateView.items));
 assert.throws(()=>privateView.items.push("fake"),TypeError);
});
test("Agent configs reject invalid weights, knowledge, budgets and random seeds",()=>{
 const cfg=validateAgentConfig({knowledge:"oracle",weights:{...AGENT_WEIGHTS}});
 assert.equal(cfg.knowledge,"oracle");
 assert.equal(cfg.budget,0);
 for(const bad of [
  {knowledge:"dice-oracle",weights:{}},
  {knowledge:"fair",budget:-1,weights:{}},
  {knowledge:"fair",budget:129,weights:{}},
  {knowledge:"fair",weights:{foo:1}},
  {knowledge:"fair",weights:{damage:NaN}},
  {knowledge:"fair",weights:{damage:0}},
  {knowledge:"oracle",samplingSeed:-1,weights:{}},
  {knowledge:"fair",weights:null}
 ])assert.throws(()=>validateAgentConfig(bad));
 assert.equal(HEROES.length,8);assert.equal(OBJECTS.length,52);
});
test("Agent chance sampling does not advance actual expedition RNG",()=>{
 for(const knowledge of ["fair","oracle"]){
  const s=make(knowledge,16),control=make(knowledge,16);
  const result=agentPlanRoom(s,[true,true]);
  assert.ok([0,1].includes(result.choice));
  assert.ok(result.scores.every(Number.isFinite));
  assert.deepEqual(prepareAgentObservation(s).knowledge,knowledge);
  assert.equal(s.die(),control.die(),"Research chance sampling consumed actual dice");
  assert.equal(s.die(20),control.die(20));
 }
});
test("Agent decisions are deterministic for fixed state/weights/sampling seeds",()=>{
 for(const knowledge of ["fair","oracle"]){
  const a=make(knowledge,8),b=make(knowledge,8);
  assert.deepEqual(agentPlanRoom(a,[true,true]),agentPlanRoom(b,[true,true]));
  const c=a.heroes[0];
  a.monster=a.monsters.UPPER[a.monsters.UPPER.length-1];
  a.monsterHP=a.monster.hp;
  assert.ok(["attack","item"].includes(agentPlanCombat(a,c).action));
  assert.equal(typeof agentPlanParley(a,a.monster).attempt,"boolean");
  assert.equal(typeof agentPlanSeal(a).attempt,"boolean");
 }
});
test("Every information mode plays complete expeditions without changing card rules",()=>{
 const agent={budget:4,weights:{...AGENT_WEIGHTS},samplingSeed:8181};
 for(const knowledge of ["fair","oracle"]){
  const opts={seed:17017,heroes:["knight","witch"],strategy:"magic",
   researchPolicy:"agent",agentConfig:{...agent,knowledge}};
  const a=simulateFullExpedition(opts);
  assert.deepEqual(a,simulateFullExpedition(opts));
  assert.equal(a.agent.knowledge,knowledge);
  assert.equal(a.unresolved,0);
  assert.equal(a.roundLimit,false);
  assert.ok(a.plannerDecisions.roomEvaluated>0);
 }
 assert.throws(()=>simulateFullExpedition({
  seed:1,researchPolicy:"agent"}),/agentConfig/);
 assert.throws(()=>simulateFullExpedition({
  seed:1,agentConfig:{knowledge:"oracle",weights:{}}}),/agentConfig/);
});
test("Optimization candidate sampling stays in bounds and cohort seeds vary",()=>{
 let i=0;const rng=()=>((i++*0.6180339887498949)%1);
 const a=candidateWeights(rng),b=candidateWeights(rng,a,.8);
 for(const x of [a,b])for(const [key,value] of Object.entries(x)){
  const [lo,hi]=OPTIMIZATION_RANGES[key];
  assert.ok(value>=lo&&value<=hi,key+"="+value);
 }
 assert.equal(expeditionSeed(11,0,0,0),expeditionSeed(11,0,0,0));
 assert.notEqual(expeditionSeed(11,0,0,0),expeditionSeed(12,0,0,0));
 assert.notEqual(expeditionSeed(11,0,0,0),expeditionSeed(11,1,0,0));
});
test("Paired estimates compare per-expedition wins, not just aggregate rates",()=>{
 const base={rows:[{batchSeed:1,strategy:"magic",party:"knight",n:4,
  winBits:Buffer.from([0b0011]).toString("base64")}]};
 const tuned={rows:[{batchSeed:1,strategy:"magic",party:"knight",n:4,
  winBits:Buffer.from([0b0111]).toString("base64")}]};
 const r=paired(base,tuned);
 assert.equal(r.n,4);assert.equal(r.gained,1);assert.equal(r.lost,0);
 assert.equal(r.delta,.25);
});
test("Study CLI dry-run validates disjoint seeds and does not create files",()=>{
 const run=args=>spawnSync(process.execPath,["scripts/study-agent.mjs",...args],
  {encoding:"utf8",maxBuffer:4*1024*1024});
 const ok=run(["--preset","smoke","--dry-run"]);
 assert.equal(ok.status,0,ok.stderr);
 assert.match(ok.stderr,/"plannedExpeditions": 6336/);
 for(const args of [
  ["--preset","invalid","--dry-run"],
  ["--preset","smoke","--train-seeds","100,200",
   "--validation-seeds","200,300","--dry-run"],
  ["--preset","smoke","--budget","129","--dry-run"],
  ["--preset","smoke","--test-seeds","500,500","--dry-run"]
 ]){
  const bad=run(args);
  assert.notEqual(bad.status,0,args.join(" "));
 }
});
