import test from "node:test";
import {spawn} from "node:child_process";
import {mkdtempSync,existsSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as pause} from "node:timers/promises";
import assert from "node:assert/strict";
import {tuningCandidates,parseTuningOptions,pairedValidation}
 from "../scripts/tune-mcts-hybrid.mjs";
import {evaluateHybridJob} from "../scripts/tune-mcts-hybrid-core.mjs";
import {makeScenario} from "../scripts/study-combat-phase2b.mjs";
import {implicitExpeditionHeuristic}
 from "../src/mcts-implicit.js";

test("Tuner exposes classic UCT and a complete paired C/alpha grid",()=>{
 const configs=tuningCandidates();
 assert.equal(configs.length,17);
 assert.equal(configs.filter(c=>c.alpha===0).length,5);
 assert.equal(configs.filter(c=>c.alpha>0).length,12);
 assert.equal(new Set(configs.map(c=>c.name??(c.c+"|"+c.alpha))).size,17);
 assert.equal(configs[0].rolloutCombatMode,"random");
 assert.ok(configs.slice(1).every(c=>
  c.rolloutCombatMode==="sampled-expectimax"));
 const p=parseTuningOptions([
  "--minutes","120","--workers","8","--budget","32",
  "--samples","2","--tactical-max","2",
  "--out","/tmp/mcts-tune-tests"
 ]);
 assert.equal(p.minutes,120);
 assert.equal(p.workers,8);
 assert.equal(p.budget,32);
 assert.equal(p.samples,2);
 assert.equal(p.validationMinutes,15);
 assert.equal(p.tacticalMax,2);
 assert.throws(()=>parseTuningOptions(["--minutes","120","--workers","0"]),
  /workers/);
});

test("Implicit heuristic distinguishes Monster damage and queued threat",()=>{
 const s=makeScenario("crawler","wounded-warrior",{seed:250}).session;
 const original=implicitExpeditionHeuristic(s);
 s.state.monsterHP=1;
 const woundedMonster=implicitExpeditionHeuristic(s);
 assert.ok(woundedMonster>original,
  "A nearly defeated Monster must improve the implicit value");
 s.state.monsterQueue=[s.state.monster];
 const queued=implicitExpeditionHeuristic(s);
 assert.ok(queued<woundedMonster,
  "An extra unresolved Monster must lower the value");
});

test("Held-out fitness uses real canonical actions and repeats exactly",{
 timeout:90000
},()=>{
 const candidate={c:0.7,alpha:0.25,
  rolloutCombatMode:"sampled-expectimax"};
 const args={candidate,scenarioId:"crawler__poisoned-witch",
  replicate:1,phase:"train",seed:255,budget:2,
  samples:1,tacticalMax:1,independentTrials:2};
 const a=evaluateHybridJob(args);
 const b=evaluateHybridJob(args);
 assert.deepEqual(
  {...a,searchMs:null,evalMs:null},
  {...b,searchMs:null,evalMs:null});
 assert.equal(a.outcomes.length,2);
 assert.equal(a.rolloutCombatMode,"sampled-expectimax");
 assert.ok(Number.isFinite(a.searchMs)&&a.searchMs>=0);
 assert.ok(Number.isFinite(a.evalMs)&&a.evalMs>=0);
 assert.ok(a.clear>=0&&a.clear<=1);
 assert.ok(a.fitness>=-1&&a.fitness<=2);
 assert.ok(a.action.includes("phase"));
 const classic=evaluateHybridJob({...args,candidate:{
  name:"uct-classic",c:Math.SQRT2,alpha:0,
  rolloutCombatMode:"random"}});
 assert.equal(classic.rolloutCombatSearches,0);
 assert.equal(classic.scenarioId,a.scenarioId);
});

test("Two worker threads persist results and stop cleanly on SIGINT",{
 timeout:60000
},async()=>{
 const out=mkdtempSync(join(tmpdir(),"rc-hybrid-workers-"));
 const script=new URL("../scripts/tune-mcts-hybrid.mjs",import.meta.url);
 const child=spawn(process.execPath,[script.pathname,
  "--minutes","2","--validate-minutes","1","--workers","2",
  "--budget","2","--samples","1","--tactical-max","1",
  "--seed","20261017","--out",out
 ],{stdio:["ignore","pipe","pipe"]});
 let stderr="",stdout="";
 child.stderr.on("data",d=>{stderr+=d;});
 child.stdout.on("data",d=>{stdout+=d;});
 let exited=false,exitCode=null;
 const onExit=new Promise(resolve=>child.once("exit",(code,signal)=>{
  exited=true;exitCode={code,signal};resolve();
 }));
 try{
  for(let i=0;i<80;i++){
   if(exited)break;
   if(existsSync(join(out,"trials.ndjson"))&&
    readFileSync(join(out,"trials.ndjson"),"utf8").trim().length>0)
    break;
   await pause(150);
  }
  if(!exited)child.kill("SIGINT");
  await Promise.race([onExit,pause(12000)]);
  if(!exited)child.kill("SIGKILL");
  await onExit;
  assert.deepEqual(exitCode,{code:0,signal:null},
   "Unexpected tuner worker exit: "+stderr+"\n"+stdout);
  assert.ok(existsSync(join(out,"manifest.json")));
  assert.ok(existsSync(join(out,"summary.json")));
  assert.ok(existsSync(join(out,"best.json")));
  const result=JSON.parse(readFileSync(join(out,"best.json"),"utf8"));
  assert.equal(result.certifiedForProduction,false);
  assert.equal(result.schema,"mcts-hybrid-tuning-recommendation-v1");
  assert.ok(existsSync(join(out,"trials.ndjson")),
   "No completed live worker trials: "+stderr+"\n"+stdout);
  const rows=readFileSync(join(out,"trials.ndjson"),"utf8")
   .trim().split("\n").map(JSON.parse);
  assert.ok(rows.length>=1);
  const summary=JSON.parse(readFileSync(join(out,"summary.json"),"utf8"));
  assert.equal(summary.completedTrials,rows.length);
 }finally{
  if(!exited)child.kill("SIGKILL");
  rmSync(out,{force:true,recursive:true});
 }
});

test("Held-out comparisons pair identical scenario and replicate identifiers",()=>{
 const cases=[
  {scenarioId:"a",replicate:0,reference:1,challenger:1.3},
  {scenarioId:"a",replicate:1,reference:1.2,challenger:1.5},
  {scenarioId:"b",replicate:0,reference:0.8,challenger:0.7},
  {scenarioId:"b",replicate:1,reference:1.0,challenger:0.9}
 ];
 const rows=cases.flatMap(c=>[
  {phase:"validate",candidate:"uct-classic",scenarioId:c.scenarioId,
   replicate:c.replicate,fitness:c.reference,clear:0.5,killed:0.2,searchMs:4},
  {phase:"validate",candidate:"c0.700-a0.250",scenarioId:c.scenarioId,
   replicate:c.replicate,fitness:c.challenger,clear:0.75,killed:0.1,searchMs:10}
 ]);
 rows.push({phase:"train",candidate:"c0.700-a0.250",
  scenarioId:"a",replicate:0,fitness:1000,clear:1,killed:0,searchMs:1});
 const paired=pairedValidation(rows,"c0.700-a0.250","uct-classic");
 assert.equal(paired.matchedTrials,4);
 assert.equal(paired.matchedScenarios,2);
 assert.ok(Math.abs(paired.meanFitnessDifference-0.1)<1e-12);
 assert.ok(Math.abs(paired.meanClearDifference-0.25)<1e-12);
 assert.ok(Math.abs(paired.meanAdditionalSearchMs-6)<1e-12);
 assert.equal(paired.clusterCI95.length,2);
 assert.ok(paired.clusterCI95[0]<=paired.meanFitnessDifference);
 assert.ok(paired.clusterCI95[1]>=paired.meanFitnessDifference);
});
