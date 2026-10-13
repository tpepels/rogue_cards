import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,readFileSync,existsSync} from "node:fs";
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
