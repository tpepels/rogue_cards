import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,readFileSync,existsSync,readdirSync,
 unlinkSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
const cli=(args)=>spawnSync(process.execPath,
 ["scripts/study-rollout-budgets.mjs",...args],
 {encoding:"utf8",maxBuffer:8*1024*1024});
test("budget study dry run gives exact workload, respects party filters",()=>{
 const r=cli(["--runs","2","--seeds","71001",
  "--budgets","0,8","--parties","solo","--strategies","magic",
  "--dry-run"]);
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stderr,/"plannedExpeditions": 80/);
 assert.match(r.stderr,/"arms": \[/);
});
test("budget study refuses invalid budgets and duplicate seeds",()=>{
 for(const args of [
  ["--budgets","8,8","--dry-run"],
  ["--budgets","129","--dry-run"],
  ["--seeds","101,101","--dry-run"],
  ["--parties","three","--dry-run"],
  ["--runs","0","--dry-run"],
  ["--rollout-rooms","10","--dry-run"],
  ["--combat-actions","601","--dry-run"],
  ["--combat-room-depth","10","--dry-run"]
 ]){
  const r=cli(args);
  assert.notEqual(r.status,0,args.join(" "));
 }
});
test("checkpoint/resume skips finished chunks and reproduces paired outcomes",()=>{
 const dir=mkdtempSync(join(tmpdir(),"rogue-rollout-resume-"));
 try{
  const one=join(dir,"one");
  const common=["--runs","3","--seeds","71001",
   "--budgets","0,2","--parties","solo","--strategies","magic",
   "--workers","2","--chunk-size","1"];
  const first=cli([...common,"--out",one]);
  assert.equal(first.status,0,first.stderr);
  const original=JSON.parse(readFileSync(join(one,"summary.json"),"utf8"));
  const checkpointDir=join(one,"checkpoints");
  const before=readdirSync(checkpointDir).filter(x=>x.endsWith(".json"));
  assert.equal(before.length,5*8*3);
  // Simulate interruption in the last 3 games: remove their atomic
  // checkpoints but leave all prior work in place.
  for(const file of before.slice(-3))unlinkSync(join(checkpointDir,file));
  unlinkSync(join(one,"summary.json"));
  unlinkSync(join(one,"summary.md"));
  unlinkSync(join(one,"validation.json"));
  const resumed=cli([...common,"--out",one,"--resume"]);
  assert.equal(resumed.status,0,resumed.stderr);
  assert.match(resumed.stderr,/Resuming 117\/120 completed chunks/);
  const complete=JSON.parse(readFileSync(join(one,"summary.json"),"utf8"));
  assert.deepEqual(complete.results,original.results);
  assert.deepEqual(complete.knowledgeContrasts,original.knowledgeContrasts);
  const cached=cli([...common,"--out",one,"--resume"]);
  assert.equal(cached.status,0,cached.stderr);
  assert.match(cached.stderr,/Resuming 120\/120 completed chunks/);
  const changed=common.slice();changed[1]="4";
  const different=cli([...changed,"--out",one,"--resume"]);
  assert.notEqual(different.status,0);
  assert.match(different.stderr,/Resume parameters differ/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("large rollout plans are explicitly gated before creating any output",()=>{
 const root=mkdtempSync(join(tmpdir(),"rogue-expensive-gate-"));
 try{
  const out=join(root,"should-not-exist");
  const args=["--runs","100","--seeds","71001,72001,73001",
   "--budgets","0,8,32,128","--workers","4","--out",out];
  const result=cli(args);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/hypothetical samples PER applicable decision/);
  assert.ok(!existsSync(out),"Oversized study should not create partial results");
  const dry=cli([...args,"--dry-run"]);
  assert.equal(dry.status,0,dry.stderr);
  assert.match(dry.stderr,/"chanceSamplesPerDecision": 7257600/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test("local fixed-weight budget smoke compares fair and Oracle on identical seeds",()=>{
 const dir=mkdtempSync(join(tmpdir(),"rogue-rollout-budgets-"));
 try{
  const out=join(dir,"data");
  const r=cli(["--runs","1","--seeds","71001",
   "--budgets","0,2","--parties","solo","--strategies","magic",
   "--workers","2","--out",out]);
  assert.equal(r.status,0,r.stderr);
  for(const name of ["summary.json","summary.md","manifest.json",
   "validation.json"])
   assert.ok(existsSync(join(out,name)),name);
  const summary=JSON.parse(readFileSync(join(out,"summary.json"),"utf8"));
  assert.equal(summary.schema,"rogue-cards-rollout-budget-study-v1");
  assert.equal(Object.keys(summary.results).length,5);
  assert.equal(summary.results.current.n,8);
  assert.equal(summary.results["fair-2"].n,8);
  assert.equal(summary.knowledgeContrasts["2"].n,8);
  assert.ok(Number.isFinite(summary.knowledgeContrasts["2"].delta));
  assert.deepEqual(JSON.parse(readFileSync(join(out,"validation.json"),"utf8")).pass,true);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
