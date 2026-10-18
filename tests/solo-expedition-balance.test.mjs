import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync,existsSync,readFileSync} from "node:fs";
import {reportSoloTraceDirectory} from "../scripts/report-solo-balance-details.mjs";
import {createDecisionSession} from "../src/engine/decision-session.js";
import {roomEntry} from "../src/room-memory-engine.js";
import {ALL_MONSTERS,ALL_ROOMS} from "../src/decks.js";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BALANCE_TARGETS,SOLO_HEROES,
 parseSoloBalanceArgs,soloBalanceSummary,
 chooseHeuristicFromCompletedStudy,playFullSoloExpedition,
 persistSoloDecisionTrace,assertBalanceObservationMigration}
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
 assert.deepEqual(c.arms,["uct","implicit"]);
 assert.equal(BALANCE_TARGETS.soloWinRate,0.4);
 assert.equal(BALANCE_TARGETS.vaultReachRate,0.5);
 assert.deepEqual(BALANCE_TARGETS.monsterEncountersRange,[16,20]);
 assert.throws(()=>parseSoloBalanceArgs(["--heuristic","auto"]),
  /requires --from-study/);
 assert.throws(()=>parseSoloBalanceArgs(["--workers","0"]),/workers/);
 assert.deepEqual(parseSoloBalanceArgs(["--arms","uct,implicit,hybrid"]).arms,
  ["uct","implicit","hybrid"]);
 assert.throws(()=>parseSoloBalanceArgs(["--arms","uct,hybrid"]),/must include/);
 assert.throws(()=>parseSoloBalanceArgs(["--arms","uct,implicit,implicit"]),/no repeats/);
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
  const implicitData={
   ...data,results:data.results.map(x=>({
    ...x,arm:x.arm.replace("hybrid-","implicit-")
   }))
  };
  writeFileSync(summaryFile,JSON.stringify(implicitData));
  assert.equal(chooseHeuristicFromCompletedStudy(summaryFile,"implicit").heuristic,
   "solo-threat");
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
  maxGameSteps:20000,maxSearchSteps:5000,
  recordTelemetry:true
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
 // Regression for accidentally holding the initial metrics reference
 // through canonical fork/replay commits. Coverage used to be nonzero
 // while ALL scalar metrics (Rooms, Monster starts, damage, Items) were 0.
 assert.ok(r.roomsCleared>0,
  "Canonical completed Rooms must survive transactional metric replacement");
 assert.ok(r.encounterStarts>=r.ordinaryEncounters,
  "Canonical encounter-start count must match actual Monster visits");
 assert.ok(r.encounterStarts>0,
  "The sampled full game had real Monster encounters");
 assert.ok(r.damage>0,
  "Canonical damage metric must reflect actual encounters and hazards");
 assert.equal(r.roomsCleared>=36,Boolean(r.hasAll36),
  "36-Room milestone must follow COMPLETED regional Rooms, not drawn cards");
 const visits=Object.values(r.coverage.monsterVisits).reduce((n,v)=>n+v,0);
 assert.equal(visits,r.ordinaryEncounters,
  "Regional Monster exposure must match canonical terminal metrics");
 // No silent aggregation: preserve every observed state and every
 // committed decision, including the complete engine counters.
 assert.equal(r.finalMetrics.cleared,r.roomsCleared);
 assert.equal(r.finalMetrics.damage,r.damage);
 assert.equal(r.finalMetrics.encounterStarts,r.encounterStarts);
 assert.equal(r.events.length,r.steps);
 assert.equal(r.initialSnapshot.heroes[0].id,"warrior");
 assert.equal(r.events.at(-1).after.heroes[0].hp,r.finalHero.hp);
 const tmp=mkdtempSync(join(tmpdir(),"rc-solo-trace-"));
 try{
  persistSoloDecisionTrace(r,{hero:"warrior",replicate:0,arm:"implicit"},tmp);
  assert.ok(r.traceSHA256);
  assert.equal(r.events,undefined);
  const archive=readFileSync(join(tmp,r.traceFile));
  assert.equal(createHash("sha256").update(archive).digest("hex"),r.traceSHA256);
  const records=gunzipSync(archive).toString("utf8").trim().split("\n").
   map(JSON.parse);
  assert.equal(records.length,r.traceEvents);
  assert.equal(records.length,r.steps);
  assert.ok(records.every(e=>e.before&&e.after&&e.metrics&&
   e.chosen&&Array.isArray(e.legal)));
  assert.ok(records.some(e=>e.before.room?.id||e.after.room?.id));
  assert.ok(records.some(e=>e.before.monster?.id||e.after.monster?.id));
  assert.ok(records.some(e=>e.metrics.cleared));
  assert.ok(records.every(e=>Array.isArray(e.dice)));
  const searched=records.filter(e=>e.via==="mcts");
  assert.ok(searched.length>0,"Some canonical decisions must be real MCTS");
  assert.ok(searched.every(e=>e.search&&e.search.budget>=1&&
   Array.isArray(e.search.choices)&&e.search.choices.length>0),
   "Preserve MCTS root visits, per-action outcomes and confidence signals");
  assert.equal(records.at(-1).after.heroes[0].hp,r.finalHero.hp);
  writeFileSync(join(tmp,"trials.ndjson"),JSON.stringify({
   ...r,hero:"warrior",replicate:0,arm:"implicit"
  })+"\n");
  const detail=reportSoloTraceDirectory(tmp);
  assert.equal(detail.trialCount,1);
  const report=JSON.parse(readFileSync(detail.path,"utf8"));
  assert.equal(report.runs.length,1);
  assert.equal(report.runs[0].stats.decisions,r.steps);
  assert.equal(report.runs[0].stats.hpLost>=0,true);
  assert.equal(report.grouped.implicit.n,1);
  assert.equal(report.grouped["implicit|warrior"].rooms,r.roomsCleared);
  assert.ok(report.runs[0].stats.roomCompletions);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});

test("Side-effect-free dry-run lists all full-solo policies without creating output",()=>{
 const folder=mkdtempSync(join(tmpdir(),"solo-balance-dry-"));
 const out=join(folder,"not-created");
 const script=new URL("../scripts/study-solo-expedition-balance.mjs",import.meta.url);
 try{
  const run=spawnSync(process.execPath,[script.pathname,
   "--dry-run","--runs-per-hero","80","--workers","8",
   "--seed","20261101","--out",out],{
    encoding:"utf8",timeout:30000
   });
  assert.equal(run.status,0,run.stderr);
  const design=JSON.parse(run.stdout);
  assert.equal(design.heroes.length,8);
  assert.equal(design.totalPlannedExpeditions,1280);
  assert.deepEqual(design.policies,["uct","implicit"]);
  assert.equal(design.heuristic,"solo-threat");
  assert.equal(existsSync(out),false);
 }finally{rmSync(folder,{force:true,recursive:true});}
});


test("Canonical pursuing Will-o'-Wisp reappears without starting a fresh encounter",()=>{
 const s=createDecisionSession({
  seed:20817,heroes:["rogue"],gameMode:"everything-goes"
 }).state;
 const wisp=ALL_MONSTERS.find(m=>m.id==="wisp");
 const corridor=ALL_ROOMS.find(room=>
  room.stage==="MIDDLE"&&room.v2?.kind==="CORRIDOR");
 assert.ok(wisp&&corridor);
 const before=s.metrics.encounterStarts;
 s.room=corridor;
 s.followingWisp=wisp;
 roomEntry(s);
 assert.equal(s.followingWisp,null);
 assert.equal(s.monster?.id,"wisp");
 assert.equal(s.metrics.monsterVisits.wisp,1);
 assert.equal(s.metrics.encounterStarts,before,
  "This is the second appearance, not a new drawn encounter");
});

test("Opt-in Wisp metrics migration never changes rules, search or study configuration",()=>{
 const design={revision:"old",trace:"full",seed:1,
  arms:["uct","implicit"],heuristicMode:"solo-threat"};
 const signed=x=>createHash("sha256").update(JSON.stringify(x))
  .digest("hex");
 const saved={schema:"solo-full-expedition-balance-v1",
  design,signature:signed(design)};
 const next={design:{...design,revision:"new"},
  signature:signed({...design,revision:"new"})};
 assert.equal(assertBalanceObservationMigration(saved,next,[
  "scripts/study-solo-expedition-balance.mjs",
  "tests/solo-expedition-balance.test.mjs"]),true);
 assert.throws(()=>assertBalanceObservationMigration(saved,
  {...next,design:{...next.design,seed:2}},[
   "scripts/study-solo-expedition-balance.mjs"]),/study parameters/);
 assert.throws(()=>assertBalanceObservationMigration(saved,next,[
  "scripts/study-solo-expedition-balance.mjs",
  "src/engine/decision-session.js"]),/gameplay, search/);
 assert.throws(()=>assertBalanceObservationMigration({...saved,
  signature:"forged"},next,[
   "scripts/study-solo-expedition-balance.mjs"]),/invalid/);
 assert.throws(()=>assertBalanceObservationMigration(saved,next,[
  "tests/solo-expedition-balance.test.mjs"]),/gameplay, search/);
});
