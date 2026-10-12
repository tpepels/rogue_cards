import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ROOMS,MONSTERS,WARDEN} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {PLANNER_RISKS,plannerWeights,hitProbability,estimatedDice,
 forecastCombat,planCombat,planParley,planRoom,planSeal} from "../src/decision-planner.js";
import {simulateFullExpedition,researchPolicies} from "../src/expedition-campaign.js";

function state(seed=21){
 const s=new ExpeditionState({seed,heroes:["wizard"],strategy:"magic"});
 s.beginRoom(ROOMS.find(x=>x.id==="u-passage"));
 s.monster=MONSTERS.find(m=>m.id==="rat");s.monsterHP=s.monster.hp;
 s.plannerRisk="balanced";
 return s;
}
test("planner computes risk-sensitive d20 chances and expected d6 amounts",()=>{
 assert.deepEqual(PLANNER_RISKS,["balanced","cautious","bold"]);
 assert.equal(estimatedDice("2d6+3"),10);
 assert.equal(estimatedDice("d6"),3.5);
 assert.ok(hitProbability(5,2)>hitProbability(2,5));
 assert.ok(hitProbability(2,2,{adv:true})>hitProbability(2,2));
 assert.ok(hitProbability(2,2,{dis:true})<hitProbability(2,2));
 assert.ok(plannerWeights("cautious").death>plannerWeights("bold").death);
 assert.throws(()=>plannerWeights("no"),/Unknown planner risk/);
});
test("planner choices are deterministic, legal and do not consume dice",()=>{
 const s=state(),copy=state();
 assert.equal(planRoom(s,[true,false]).choice,0);
 assert.equal(planRoom(s,[false,true]).choice,1);
 assert.equal(planRoom(s,[true,true]).choice,planRoom(s,[true,true]).choice);
 assert.ok(Number.isFinite(forecastCombat(s).expectedLoss));
 assert.equal(typeof planParley(s,s.monster).attempt,"boolean");
 assert.equal(typeof planCombat(s,s.heroes[0]).action,"string");
 assert.equal(typeof planSeal(s).attempt,"boolean");
 assert.equal(s.die(),copy.die(),"Research planner must not change RNG state");
});
test("advanced planner is opt-in, reproducible and reports decisions",()=>{
 assert.ok(researchPolicies.includes("planner"));
 for(const strategy of ["magic","treasure"])for(const heroes of [["wizard"],["knight","wizard"]])
 for(const plannerRisk of PLANNER_RISKS)for(const seed of [12,223]){
  const opts={seed,heroes,strategy},original=simulateFullExpedition(opts);
  assert.deepEqual(original,simulateFullExpedition({...opts,researchPolicy:"none"}));
  const p={...opts,researchPolicy:"planner",plannerRisk};
  const a=simulateFullExpedition(p),b=simulateFullExpedition(p);
  assert.deepEqual(a,b);
  assert.equal(a.unresolved,0);assert.equal(a.roundLimit,false);
  assert.ok(a.plannerDecisions&&a.plannerTrace?.length>0);
  assert.ok(a.plannerTrace.length<=12);
 }
 assert.throws(()=>simulateFullExpedition({plannerRisk:"zero"}),/Unknown planner risk/);
});
function run(file,args){return spawnSync(process.execPath,[file,...args],
 {encoding:"utf8",maxBuffer:16*1024*1024});}
test("advanced local CLI generates detailed pure JSON and a readable report",()=>{
 const study=run("scripts/study-planner.mjs",["1"]);
 assert.equal(study.status,0,study.stderr);
 const result=JSON.parse(study.stdout);
 assert.equal(result.experiment,"rogue-cards-planner-v1");
 assert.equal(result.simulated,120);assert.equal(result.unresolved,0);
 assert.equal(result.stalls,0);
 assert.equal(result.groups.magic.solo["planner-balanced"].n,8);
 assert.equal(result.groups.treasure.duo["planner-cautious"].n,4);
 const dir=mkdtempSync(join(tmpdir(),"rogue-planner-"));
 try{
  const path=join(dir,"results.json");
  writeFileSync(path,study.stdout);
  const report=run("scripts/report-planner.mjs",[path]);
  assert.equal(report.status,0,report.stderr);
  assert.match(report.stdout,/Hero-specific estimates/);
  assert.match(report.stdout,/planner-bold/);
  assert.match(report.stdout,/PARLEY/);
 }finally{rmSync(dir,{recursive:true,force:true});}
 const full=run("scripts/study-planner.mjs",["1","--all"]);
 assert.equal(full.status,0,full.stderr);
 assert.equal(JSON.parse(full.stdout).simulated,360);
 for(const bad of [["0"],["4000"],["1","--oops"],["1","--seed","oops"]]){
  const r=run("scripts/study-planner.mjs",bad);
  assert.notEqual(r.status,0,bad.join(" "));
  assert.match(r.stderr,/Usage:/);
 }
});
