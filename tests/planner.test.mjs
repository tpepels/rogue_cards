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
import {simulateFullExpedition,researchPolicies,PLANNER_FEATURES} from "../src/expedition-campaign.js";

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
 s.monster=WARDEN;s.monsterHP=16;h.hp=11;
 // Wild Spark is already used in this Room; the next attack is ordinary.
 h.used.add("hero");
 const spell=OBJECTS.find(c=>c.id==="scroll-last");
 s.add(h,spell);
 assert.equal(legalCombatActions(s,h).some(c=>c===spell),true);
 const roll=planCombat(s,h);
 assert.ok(roll.options>=1);
 assert.equal(roll.action,"item");
 assert.equal(roll.card.id,"scroll-last");
 const e1=expectedAttack(s,h);
 s.monsterHP=11; // Phase I ends at 10, so only 1 HP of damage matters.
 const e2=expectedAttack(s,h);
 assert.ok(e2.damage<=1);
 assert.ok(e2.damage<e1.damage);
 assert.ok(e2.killChance>e1.killChance);
});
test("Wizard's first combat action forecasts the printed Wild Spark",()=>{
 const s=state(41),h=s.heroes[0];
 assert.equal(h.card.id,"wizard");
 const a=expectedAttack(s,h);
 assert.equal(a.skipChance,1/3);
 assert.equal(a.hitChance,2/3);
 assert.ok(a.damage>0&&a.killChance>=0&&a.killChance<=1);
 h.used.add("hero");
 const b=expectedAttack(s,h);
 assert.equal(b.skipChance,0);
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
test("ablations isolate only selected planner decisions and preserve original baseline",()=>{
 assert.deepEqual(PLANNER_FEATURES,["room","combat","parley","seal"]);
 const observable=r=>({
  won:r.won,cleared:r.cleared,remainingHP:r.remainingHP,
  damage:r.damage,drawn:r.drawn,spent:r.spent,rounds:r.rounds,
  negotiations:r.negotiations,sealAttempt:r.sealAttempt,sealWin:r.sealWin,
  activated:r.activated,magicActions:r.magicActions,
  failureStage:r.failureStage,objectsEverOwned:r.objectsEverOwned
 });
 for(const strategy of ["magic","treasure"])
 for(const heroes of [["warrior"],["wizard"],["warrior","priest"]])
 for(const seed of [72,8103]){
  const opts={seed,heroes,strategy};
  const scripted=simulateFullExpedition(opts);
  const neutral=simulateFullExpedition({...opts,researchPolicy:"planner",
   plannerRisk:"cautious",plannerFeatures:[]});
  assert.deepEqual(observable(neutral),observable(scripted),
   "Empty planner must execute the unchanged scripted game");
  assert.deepEqual(neutral.plannerDecisions,{});
  const full=simulateFullExpedition({...opts,researchPolicy:"planner",
   plannerRisk:"cautious"});
  const explicit=simulateFullExpedition({...opts,researchPolicy:"planner",
   plannerRisk:"cautious",plannerFeatures:[...PLANNER_FEATURES]});
  assert.deepEqual(full,explicit,"All-enabled must reproduce existing planner");
  for(const feature of PLANNER_FEATURES){
   const x=simulateFullExpedition({...opts,researchPolicy:"planner",
    plannerRisk:"cautious",plannerFeatures:[feature]});
   assert.deepEqual(x.plannerFeatures,[feature]);
   const allowed=feature==="room"?"room":feature==="combat"?"combat":feature;
   assert.ok(Object.keys(x.plannerDecisions).every(k=>k.startsWith(allowed+"_")||
    k.startsWith(allowed+"E")||feature==="combat"&&k.startsWith("combat")),
    "No planner decisions for disabled features: "+Object.keys(x.plannerDecisions));
   assert.equal(x.unresolved,0);assert.equal(x.roundLimit,false);
  }
 }
 const base={seed:1,heroes:["warrior"],strategy:"magic"};
 for(const features of [["room","room"],["unknown"],"room",{}]){
  assert.throws(()=>simulateFullExpedition({...base,
   researchPolicy:"planner",plannerFeatures:features}),/Invalid planner features/);
 }
 assert.throws(()=>simulateFullExpedition({...base,plannerFeatures:["room"]}),
  /require researchPolicy/);
});
test("full 16-configuration ablation CLI records paired contrasts and behaviour",()=>{
 const runStudy=run("scripts/study-planner-ablation.mjs",["1","--seed","987634"]);
 assert.equal(runStudy.status,0,runStudy.stderr);
 const x=JSON.parse(runStudy.stdout);
 assert.equal(x.experiment,"rogue-cards-planner-ablation-v1");
 assert.equal(x.simulated,12*2*16);
 assert.equal(x.unresolved,0);assert.equal(x.stalls,0);
 assert.equal(x.configs.length,16);
 assert.deepEqual(x.configs[0].enabled,[]);
 assert.deepEqual(x.configs[15].enabled,PLANNER_FEATURES);
 assert.equal(x.groups.all.configurations.length,16);
 assert.equal(x.groups.all.configurations[0].n,24);
 assert.equal(x.groups.magic.solo.configurations[15].n,8);
 for(const feature of PLANNER_FEATURES){
  assert.equal(x.groups.all.effects.alone[feature].n,24);
  assert.equal(x.groups.all.effects.removed[feature].n,24);
  assert.equal(x.groups.all.effects.average[feature].n,24);
  assert.ok(Math.abs(x.groups.all.effects.alone[feature].estimate-(
   x.groups.all.configurations[1<<PLANNER_FEATURES.indexOf(feature)].winRate-
   x.groups.all.configurations[0].winRate))<1e-12);
 }
 assert.equal(Object.keys(x.groups.all.effects.pairwise).length,6);
 const tmp=mkdtempSync(join(tmpdir(),"rogue-ablation-"));
 try{
  const fp=join(tmp,"results.json");writeFileSync(fp,runStudy.stdout);
  const md=run("scripts/report-planner-ablation.mjs",[fp]);
  assert.equal(md.status,0,md.stderr);
  assert.match(md.stdout,/All sixteen configurations/);
  assert.match(md.stdout,/Pairwise interactions/);
  assert.match(md.stdout,/Leave-one-out/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
 for(const flags of [["0"],["2001"],["1","--seed","bad"],["1","--wat"]]){
  const err=run("scripts/study-planner-ablation.mjs",flags);
  assert.notEqual(err.status,0);
  assert.match(err.stderr,/Usage:/);
 }
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
