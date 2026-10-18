import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,existsSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as pause} from "node:timers/promises";
import {soloScenarioIds,makeSoloScenario,SOLO_HERO_IDS}
 from "../scripts/solo-encounter-fixtures.mjs";
import {implicitHeuristicBreakdown,implicitExpeditionHeuristic,
 backupImplicit,implicitSelectedMean} from "../src/mcts-implicit.js";
import {soloStudyArms,parseSoloStudyArgs,soloStudySummary}
 from "../scripts/study-mcts-solo-overnight.mjs";
import {evaluateHybridJob} from "../scripts/tune-mcts-hybrid-core.mjs";

test("192 solo roots cover all eight Heroes, Monsters and HP conditions",()=>{
 const ids=soloScenarioIds();
 assert.equal(ids.length,192);
 assert.equal(new Set(ids).size,192);
 assert.equal(SOLO_HERO_IDS.length,8);
 const seen=new Map();
 for(let i=0;i<ids.length;i++){
  const {session,monsterId,heroId,condition}=makeSoloScenario(ids[i],{
   seed:20261018+i
  });
  const game=session.state;
  assert.equal(game.heroes.length,1);
  assert.ok(game.heroes[0].hp>0);
  assert.ok(game.monster&&game.monsterHP>0);
  const physical=[...game.deck,...game.heroes[0].inventory];
  assert.equal(new Set(physical.map(x=>x._physicalCopy)).size,physical.length);
  for(const item of Object.values(game.heroes[0].slots))
   assert.ok(game.heroes[0].inventory.includes(item));
  const values=["legacy","solo-hp","solo-threat"].map(mode=>
   implicitHeuristicBreakdown(session,mode).value);
  assert.ok(values.every(x=>x>=0&&x<=1));
  assert.equal(implicitHeuristicBreakdown(session,"solo-hp").terms.living,0);
  const group=monsterId+"|"+heroId;
  seen.set(group,(seen.get(group)||0)+1);
  if(condition==="critical")
   assert.equal(game.heroes[0].poison,true);
 }
 assert.equal(seen.size,64);
 assert.ok([...seen.values()].every(n=>n===3));
});

test("Solo death has EXACT zero heuristic regardless of progress or Items",()=>{
 const {session}=makeSoloScenario("troll__solo-wizard-critical",{seed:727});
 session.state.metrics.cleared=35;
 for(const mode of ["legacy","solo-hp","solo-threat"]){
  assert.ok(implicitExpeditionHeuristic(session,mode)>=0);
 }
 session.state.heroes[0].hp=0;
 for(const mode of ["legacy","solo-hp","solo-threat"]){
  const info=implicitHeuristicBreakdown(session,mode);
  assert.equal(info.value,0);
  assert.equal(info.terminal,true);
 }
 assert.throws(()=>implicitExpeditionHeuristic(makeSoloScenario(
  "crawler__solo-monk-fresh",{seed:2}).session,"unknown"),/Unknown implicit/);
});

test("Recursive implicit MAX backing uses the backed child subtree, not its raw leaf average",()=>{
 const rootA={visits:100,wins:55},rootB={visits:20,wins:10};
 const root={edges:new Map([["A",rootA],["B",rootB]])};
 const childA={visits:10,wins:5},childB={visits:10,wins:5};
 const child={edges:new Map([["x",childA],["y",childB]])};
 const deepEdge={visits:10,wins:5};
 const grandchild={edges:new Map([["z",deepEdge]])};
 const path=[
  {node:root,edge:rootA},
  {node:child,edge:childA},
  {node:grandchild,edge:deepEdge}
 ];
 backupImplicit(path,0.2,"chance-a");
 assert.equal(root.implicitValue,0.2);
 // A second outcome on the SAME fully explored successor gives an
 // expectation of chance, rather than a max over lucky dice.
 backupImplicit(path,0.6,"chance-b");
 assert.ok(Math.abs(grandchild.implicitValue-0.4)<1e-12);
 assert.ok(Math.abs(child.implicitValue-0.4)<1e-12);
 assert.ok(Math.abs(root.implicitValue-0.4)<1e-12);
 // A different action at the child yields 0.8: MAX backup must now
 // overwrite the old 0.4 branch value all the way to the parent.
 backupImplicit([{node:root,edge:rootA},{node:child,edge:childB}],0.8,"leaf-b");
 assert.ok(Math.abs(child.implicitValue-0.8)<1e-12);
 assert.ok(Math.abs(implicitSelectedMean(rootA)-0.8)<1e-12,
  "Previously explored descendant's backed MAX must replace stale average");
 assert.ok(Math.abs(root.implicitValue-0.8)<1e-12);
 assert.equal(rootA.wins,55);
 // A separate root action can provide a higher MINIMAX (here: MAX) value.
 backupImplicit([{node:root,edge:rootB}],0.9,"other");
 assert.equal(root.implicitValue,0.9);
 assert.ok(Math.abs(implicitSelectedMean(rootA)-0.8)<1e-12);
 assert.equal(rootA.implicitSuccessors.size,1);
 assert.equal(deepEdge.implicitSuccessors.size,2);
});

test("Solo fixture is accepted by real canonical full-rollout MCTS",{
 timeout:40000
},()=>{
 const candidate={name:"solo-smoke",c:0.35,alpha:0.4,
  heuristicMode:"solo-threat",rolloutCombatMode:"sampled-expectimax"};
 const x=evaluateHybridJob({
  candidate,scenarioId:"crawler__solo-warrior-injured",
  replicate:0,phase:"solo-test",seed:20261018,
  budget:2,samples:1,tacticalMax:1,independentTrials:2
 });
 assert.equal(x.heuristicMode,"solo-threat");
 assert.equal(x.outcomes.length,2);
 assert.equal(x.rolloutCombatMode,"sampled-expectimax");
 assert.ok(x.fitness>=0&&x.fitness<=1.42);
});

test("Ten solo arms isolate expectimax, legacy and two solo heuristics",()=>{
 const arms=soloStudyArms();
 assert.equal(arms.length,10);
 assert.equal(new Set(arms.map(a=>a.name)).size,10);
 assert.equal(arms.filter(a=>a.rolloutCombatMode==="random").length,4);
 assert.equal(arms.filter(a=>a.rolloutCombatMode==="sampled-expectimax").length,6);
 assert.equal(arms.filter(a=>a.name.startsWith("hybrid-")).length,3);
 const options=parseSoloStudyArgs([
  "--minutes","480","--workers","8",
  "--budget","32","--scenarios","192",
  "--out","/tmp/rc-solo-overnight"
 ]);
 assert.equal(options.minutes,480);
 assert.equal(options.workers,8);
 assert.equal(options.scenarios,192);
 assert.throws(()=>parseSoloStudyArgs(["--workers","0"]),/workers/);
 const summary=soloStudySummary([],{
  setup:{...options},arms:arms.map(a=>({...a,
   budgets:{"equal-visits":32,"cpu-calibrated":8}}))
 });
 assert.equal(summary.results.length,20);
 assert.equal(summary.comparisons.length,18);
});

test("Two parallel workers actually finish and RESUME solo-only independent trials",{
 timeout:120000
},async()=>{
 const out=mkdtempSync(join(tmpdir(),"rc-solo-overnight-"));
 const path=new URL("../scripts/study-mcts-solo-overnight.mjs",import.meta.url);
 const argv=[path.pathname,
  "--minutes","2","--workers","2","--budget","2",
  "--target-ms","200","--max-budget","8",
  "--scenarios","1","--repetitions","1",
  "--seed","20261018","--out",out];
 const run=async()=>{
  const child=spawn(process.execPath,argv,{stdio:["ignore","pipe","pipe"]});
  let output="",err="";
  child.stdout.on("data",x=>output+=x);
  child.stderr.on("data",x=>err+=x);
  const state=await Promise.race([
   new Promise(resolve=>child.once("exit",(code,signal)=>resolve({code,signal}))),
   pause(90000).then(()=>null)
  ]);
  if(!state){child.kill("SIGKILL");throw Error("Solo live run timed out "+output);}
  assert.deepEqual(state,{code:0,signal:null},err+"\n"+output);
  return output;
 };
 try{
  const text=await run();
  assert.ok(text.includes("all pairs completed"));
  assert.ok(existsSync(join(out,"manifest.json")));
  assert.ok(existsSync(join(out,"trials.ndjson")));
  const rows=readFileSync(join(out,"trials.ndjson"),"utf8")
   .split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(rows.length,20);
  assert.ok(rows.every(row=>row.scenarioId.includes("__solo-")));
  assert.equal(new Set(rows.map(row=>row.mode+"|"+row.arm)).size,20);
  const summary=JSON.parse(readFileSync(join(out,"summary.json"),"utf8"));
  assert.equal(summary.completedTrials,20);
  assert.equal(summary.remaining,0);
  const resumed=await run();
  assert.ok(resumed.includes("already completed"));
  assert.equal(readFileSync(join(out,"trials.ndjson"),"utf8")
   .split("\n").filter(Boolean).length,20);
 }finally{
  rmSync(out,{force:true,recursive:true});
 }
});
