import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ROOMS,MONSTERS,WARDEN,OBJECTS} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {PLANNER_RISKS,plannerWeights,hitProbability,estimatedDice,
 forecastCombat,planCombat,planParley,planRoom,planSeal,
 fixedRoomFace,legalCombatActions,expectedAttack} from "../src/decision-planner.js";
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
test("planner does not play lock, scouting, reaction or merchant cards as combat actions",()=>{
 const s=state(45),h=s.heroes[0];
 h.inventory=[];h.slots={};
 for(const id of ["wand-door","wand-undo","wand-market","scroll-reveal",
  "scroll-unlock","scroll-lightning","wand-sparks","spore-jar"]){
  const card=OBJECTS.find(o=>o.id===id);
  assert.ok(card,id);
  s.add(h,card);
 }
 assert.deepEqual(legalCombatActions(s,h).map(c=>c.id).sort(),
  ["scroll-lightning","spore-jar","wand-sparks"]);
 const wand=h.inventory.find(c=>c.id==="wand-sparks");
 s.exhausted.add(wand);
 assert.deepEqual(legalCombatActions(s,h).map(c=>c.id).sort(),
  ["scroll-lightning","spore-jar"]);
});
test("planner scores current Monster health and can choose a valid attacking spell",()=>{
 const s=state(72),h=s.heroes[0];
 s.monster=MONSTERS.find(m=>m.id==="sentinel");s.monsterHP=16;
 const lightning=OBJECTS.find(c=>c.id==="scroll-lightning");
 s.add(h,lightning);
 assert.equal(legalCombatActions(s,h).some(c=>c===lightning),true);
 const roll=planCombat(s,h);
 assert.ok(roll.options>=1);
 assert.equal(roll.action,"item");
 assert.equal(roll.card.id,"scroll-lightning");
 const e1=expectedAttack(s,h);
 s.monsterHP=2;
 const e2=expectedAttack(s,h);
 assert.ok(e2.damage<=2);
 assert.ok(e2.damage<e1.damage);
 assert.ok(e2.killChance>e1.killChance);
});
test("planner accounts for a printed guaranteed d6 result",()=>{
 const s=state(26);
 s.room=ROOMS.find(r=>r.id==="u-fall");
 assert.equal(fixedRoomFace(s,s.room),null);
 s.add(s.heroes[0],OBJECTS.find(c=>c.id==="rope"));
 assert.equal(fixedRoomFace(s,s.room),6);
 const p=planRoom(s,[true,true]);
 assert.equal(p.choice,0,"Knotted Rope guarantees the safe Room reward");
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
 assert.equal(result.experiment,"rogue-cards-planner-v2");
 assert.ok(result.partyResults.magic.warrior);
 assert.ok(result.partyResults.magic["warrior+priest"]);
 assert.notEqual(result.partyResults.magic.warrior["planner-balanced"].sample.seed,
  result.partyResults.magic.knight["planner-balanced"].sample.seed);
 assert.ok(result.groups.magic.solo["planner-balanced"].choices.combatEligibleActions>=0);
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
  assert.match(report.stdout,/Combat Item eligibility/);
  assert.match(report.stdout,/Per-party differences/);
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
