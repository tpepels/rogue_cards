import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,existsSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as pause} from "node:timers/promises";
import {makeScenario} from "../scripts/study-combat-phase2b.mjs";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {implicitHeuristicBreakdown,implicitExpeditionHeuristic}
 from "../src/mcts-implicit.js";
import {auditImplicitHeuristic}
 from "../scripts/audit-implicit-heuristic.mjs";
import {factorialArms,parseFactorialArgs,summarizeFactorial}
 from "../scripts/study-mcts-factorial.mjs";

test("Implicit contribution audit exactly reconstructs production heuristic",()=>{
 const session=makeScenario("crawler","asymmetric-frontline",{seed:121}).session;
 const values=[];
 for(const hero of sessionActions(session)){
  const next={...session,state:forkGameState(session.state),
   history:[],remainingReturns:[...session.remainingReturns]};
  submitDecision(next,hero,{observeResult:false,recordHistory:false});
  const d=implicitHeuristicBreakdown(next);
  assert.equal(d.value,implicitExpeditionHeuristic(next));
  assert.ok(Math.abs(d.unclipped-
   Object.values(d.terms).reduce((a,b)=>a+b,0))<1e-12);
  assert.ok(d.value>=0&&d.value<=1);
  assert.ok(d.terms.actorSelection!==undefined);
  values.push(d);
 }
 assert.equal(values.length,2);
 assert.ok(values.every(d=>d.variables.monsterId==="crawler"));
 // Reordering hidden decks cannot change a public-information heuristic.
 const one=implicitHeuristicBreakdown(session);
 session.state.deck.reverse();
 session.state.rooms.UPPER.reverse();
 assert.deepEqual(implicitHeuristicBreakdown(session),one);
});

test("Canonical independent heuristic ranking audit is reproducible",{
 timeout:120000
},()=>{
 const a=auditImplicitHeuristic({
  repetitions:1,evalSeeds:2,seed:20261023,write:false
 });
 const b=auditImplicitHeuristic({
  repetitions:1,evalSeeds:2,seed:20261023,write:false
 });
 assert.deepEqual(a.summary,b.summary);
 assert.equal(a.rows.length,48);
 assert.equal(a.pairs.length,24);
 assert.equal(a.summary.design.realCanonicalContinuations,96);
 assert.ok(a.summary.comparisons.rankingAccuracy===null||
  a.summary.comparisons.rankingAccuracy>=0&&
  a.summary.comparisons.rankingAccuracy<=1);
 assert.ok(a.rows.every(r=>Number.isFinite(r.heuristic)&&
  Number.isFinite(r.fitness)));
});

test("Factorial experiment has complete alpha x expectimax controls",()=>{
 const arms=factorialArms();
 assert.equal(arms.length,10);
 assert.equal(new Set(arms.map(a=>a.name)).size,10);
 assert.equal(arms.filter(a=>a.rolloutCombatMode==="random").length,2);
 assert.equal(arms.filter(a=>a.rolloutCombatMode==="sampled-expectimax").length,8);
 for(const p of arms.filter(a=>a.name.startsWith("hybrid-"))){
  const reference=arms.find(a=>a.name===p.name.replace("hybrid-","expectimax-"));
  assert.equal(reference.c,p.c);
  assert.equal(reference.samples,p.samples);
  assert.equal(reference.tacticalMax,p.tacticalMax);
  assert.equal(reference.alpha,0);
 }
 const config=parseFactorialArgs(["--mode","equal-visits",
  "--workers","8","--scenarios","48","--minutes","45",
  "--out","/tmp/study-mcts-factorial"]);
 assert.equal(config.workers,8);
 assert.equal(config.mode,"equal-visits");
 assert.equal(config.scenarios,48);
 assert.throws(()=>parseFactorialArgs(["--mode","adaptive"]),
  /Invalid factorial mode/);
 const report=summarizeFactorial([],{arms:arms.map(a=>({...a,budget:16}))});
 assert.equal(report.byArm.length,10);
 assert.equal(report.completedRows,0);
});

test("Live two-worker equal-visits factorial study writes paired rows",{
 timeout:90000
},async()=>{
 const out=mkdtempSync(join(tmpdir(),"rc-factorial-workers-"));
 const script=new URL("../scripts/study-mcts-factorial.mjs",import.meta.url);
 const child=spawn(process.execPath,[script.pathname,
  "--mode","equal-visits","--workers","2","--minutes","1",
  "--budget","2","--scenarios","1","--repetitions","1",
  "--seed","20261023","--out",out
 ],{stdio:["ignore","pipe","pipe"]});
 let stderr="",stdout="";
 child.stderr.on("data",d=>{stderr+=d;});
 child.stdout.on("data",d=>{stdout+=d;});
 let exited=false,exitStatus=null;
 const exit=new Promise(resolve=>child.once("exit",(code,signal)=>{
  exited=true;exitStatus={code,signal};resolve();
 }));
 try{
  await Promise.race([exit,pause(60000)]);
  if(!exited){child.kill("SIGINT");await Promise.race([exit,pause(5000)]);}
  if(!exited)child.kill("SIGKILL");
  await exit;
  assert.deepEqual(exitStatus,{code:0,signal:null},stderr+"\n"+stdout);
  assert.ok(existsSync(join(out,"manifest.json")));
  assert.ok(existsSync(join(out,"trials.ndjson")));
  assert.ok(existsSync(join(out,"summary.json")));
  const rows=readFileSync(join(out,"trials.ndjson"),"utf8")
   .trim().split("\n").map(JSON.parse);
  assert.equal(rows.length,10,stdout);
  assert.equal(new Set(rows.map(r=>r.arm)).size,10);
  const summary=JSON.parse(readFileSync(join(out,"summary.json"),"utf8"));
  assert.equal(summary.completedRows,10);
  assert.equal(summary.byArm.length,10);
  assert.ok(summary.comparisons.some(r=>
   r.arm==="hybrid-s2-k2"&&r.vsSameIntensityNoImplicit?.matchedTrials===1));
 }finally{
  if(!exited)child.kill("SIGKILL");
  rmSync(out,{recursive:true,force:true});
 }
});
