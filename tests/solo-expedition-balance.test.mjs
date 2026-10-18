import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BALANCE_TARGETS,SOLO_HEROES,
 parseSoloBalanceArgs,soloBalanceSummary,
 chooseHeuristicFromCompletedStudy,playFullSoloExpedition}
 from "../scripts/study-solo-expedition-balance.mjs";

test("Solo balance protocol is eight Heroes, three AI arms, 36-Room goal",()=>{
 const c=parseSoloBalanceArgs([
  "--workers","8","--hours","12",
  "--runs-per-hero","30","--budget","8",
  "--out","/tmp/solo-balance-demo"
 ]);
 assert.equal(SOLO_HEROES.length,8);
 assert.equal(new Set(SOLO_HEROES).size,8);
 assert.equal(c.hours,12);
 assert.equal(c.workers,8);
 assert.equal(c.runsPerHero,30);
 assert.equal(c.heuristic,"solo-threat");
 assert.equal(BALANCE_TARGETS.soloWinRate,0.4);
 assert.equal(BALANCE_TARGETS.vaultReachRate,0.5);
 assert.deepEqual(BALANCE_TARGETS.monsterEncountersRange,[16,20]);
 assert.throws(()=>parseSoloBalanceArgs(["--heuristic","auto"]),
  /requires --from-study/);
 assert.throws(()=>parseSoloBalanceArgs(["--workers","0"]),/workers/);
 assert.throws(()=>parseSoloBalanceArgs(["--heuristic","duo"]),
  /Unknown solo/);
});

const dummy=(hero,replicate,arm,won)=>({
 hero,replicate,arm,won,vaultReached:won,roomsCleared:won?36:15,
 maxHp:20,remainingHp:won?6:0,hpLost:won?14:20,
 hasAll36:won?1:0,
 ordinaryEncounters:won?18:6,ordinaryFights:won?12:5,
 combatContextDamage:won?28:15,
 damage:won?30:17,steps:250,searchMs:100,
 elapsedMs:110,itemsUsed:3,negotiations:1,elberethAttempts:0,
 coverage:{monsterVisits:{crawler:2},monsterFights:{crawler:1},
 monsterKills:{crawler:won?1:0},monsterParley:{crawler:1},
 objectAcquisitions:{key:1},objectActivations:{key:1}},
 wipeCause:won?null:"crawler",wipeStage:won?null:"MIDDLE"
});

test("Full balance summary reports real 36-Room cohort and paired solo outcomes",()=>{
 const records=[
  dummy("warrior",0,"uct",0),
  dummy("warrior",0,"implicit",1),
  dummy("warrior",0,"hybrid",1),
  dummy("wizard",0,"uct",0),
  dummy("wizard",0,"implicit",0)
 ];
 const r=soloBalanceSummary(records,{seed:20261101});
 assert.equal(r.completed,5);
 assert.equal(r.independentSeedHeroPairs,2);
 assert.equal(r.rowsByArm.uct.overall.n,2);
 assert.equal(r.rowsByArm.hybrid.byHero.warrior.winRate,1);
 assert.equal(r.rowsByArm.hybrid.byHero.wizard.winRate,null);
 assert.equal(r.rowsByArm.implicit.byHero.warrior.full36Runs,1);
 assert.equal(r.rowsByArm.implicit.byHero.warrior.ordinaryEncountersAmongFull36,18);
 assert.ok(Math.abs(r.rowsByArm.implicit.byHero.warrior.combatConversion-
  12/18)<1e-12);
 assert.ok(Math.abs(r.rowsByArm.implicit.byHero.warrior.combatContextHPFraction-
  28/(12*20))<1e-12);
 const p=r.paired.find(x=>x.arm==="implicit");
 assert.equal(p.pairedHeroSeeds,2);
 assert.equal(p.meanWinDifference,0.5);
 assert.equal(p.byHero.warrior.meanWinDifference,1);
 assert.equal(p.byHero.wizard.meanWinDifference,0);
 assert.equal(p.meanAdditionalSearchMs,0);
 assert.equal(r.rowsByArm.uct.overall.winWilson95.length,2);
});

test("Auto-selected solo heuristic requires sufficient independent night samples",()=>{
 const directory=mkdtempSync(join(tmpdir(),"rogue-rc-solo-"));
 const summaryFile=join(directory,"summary.json");
 const data={
  schema:"solo-mcts-overnight-v1",completedTrials:1200,remaining:10,
  results:["hybrid-legacy","hybrid-solo-hp","hybrid-solo-threat"].map(
   (arm,i)=>({arm,mode:"cpu-calibrated",meanFitness:1+i*0.01,
    meanClear:0.7+i*.01,count:90,scenarioTypes:45,
    meanSearchMs:300+i*10}))
 };
 try{
  writeFileSync(summaryFile,JSON.stringify(data));
  const x=chooseHeuristicFromCompletedStudy(summaryFile);
  assert.equal(x.heuristic,"solo-threat");
  assert.equal(x.source.length,3);
  data.results[0].count=80;
  writeFileSync(summaryFile,JSON.stringify(data));
  assert.throws(()=>chooseHeuristicFromCompletedStudy(summaryFile),
   /not equally exposed/);
 }finally{rmSync(directory,{force:true,recursive:true});}
});

test("Actual ONE-Hero 36-Room canonical expedition with implicit MCTS",{
 timeout:180000
},()=>{
 const r=playFullSoloExpedition({
  hero:"warrior",seed:20261016,arm:"implicit",
  heuristicMode:"solo-threat",budget:1,
  maxGameSteps:20000,maxSearchSteps:5000
 });
 assert.equal(r.hero,"warrior");
 assert.equal(r.schema,"solo-full-canonical-expedition-v1");
 assert.ok([0,1].includes(r.won));
 assert.ok(["win","escape","death"].includes(r.ending));
 assert.ok(Number.isInteger(r.roomsCleared));
 assert.ok(r.ordinaryFights>=0);
 assert.ok(r.ordinaryEncounters>=0);
 assert.ok(r.combatContextDamage>=0);
 assert.ok(r.steps>0);
 assert.equal(Object.keys(r.byStage).length,3);
 assert.equal(r.maxHp>0,true);
 assert.ok(r.ordinaryFights<=r.ordinaryEncounters,
  "Fights per encounter must be physically conserved");
});
