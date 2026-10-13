import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";

const run=flags=>spawnSync(process.execPath,[
 "scripts/benchmark-expedition-throughput.mjs",...flags
],{encoding:"utf8",maxBuffer:4*1024*1024,timeout:30000});
test("end-to-end performance benchmark produces deterministic matched-seed arms",()=>{
 const dir=mkdtempSync(join(tmpdir(),"rogue-throughput-"));
 try{
  const output=join(dir,"results.json");
  const args=["--runs","2","--repeats","2","--warmup","0",
   "--budgets","0,2","--heroes","warrior","--seed","33217",
   "--out",output];
  const result=run(args);
  assert.equal(result.status,0,result.stderr);
  const p=JSON.parse(result.stdout);
  assert.deepEqual(JSON.parse(readFileSync(output,"utf8")),p);
  assert.equal(p.schema,"rogue-cards-expedition-throughput-v1");
  assert.deepEqual(p.measurements.map(x=>x.arm),
   ["current","fair-0","oracle-0","fair-2","oracle-2"]);
  for(const x of p.measurements){
   assert.ok(x.medianMs>0);
   assert.ok(x.msPerExpedition>0);
   assert.ok(x.expeditionsPerSecond>0);
   assert.ok(x.runtimeMultipleVsCurrent>0);
   assert.equal(x.timesMs.length,2);
   assert.match(x.deterministicChecksum,/^[0-9a-f]{8}$/);
  }
  const m=new Map(p.measurements.map(x=>[x.arm,x]));
  assert.equal(m.get("fair-0").rolloutSamples,0);
  assert.equal(m.get("oracle-0").rolloutSamples,0);
  assert.equal(m.get("fair-2").expeditionsPerSecond>0,true);
  assert.equal(m.get("oracle-2").expeditionsPerSecond>0,true);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("benchmark rejects malformed or unsafe configurations",()=>{
 for(const bad of [
  ["--runs","0"],["--budgets","0,0"],
  ["--budgets","129"],["--heroes","wizard,wizard"],
  ["--heroes","inexistent"],["--warmup","99"],
  ["--repeats","0"],["--strategy","unprinted"],
  ["--unknown","thing"]
 ]){
  const r=run(bad);
  assert.notEqual(r.status,0,bad.join(" "));
 }
});
