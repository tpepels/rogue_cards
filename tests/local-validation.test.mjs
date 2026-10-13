import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {HEROES,OBJECTS} from "../src/tabletop-data.js";
import {wilson} from "../scripts/validation-report.mjs";
import {PARTIES,RESEARCH_POLICIES,stableSeed} from "../scripts/validate-local.mjs";

const run=(args)=>spawnSync(process.execPath,["scripts/validate-local.mjs",...args],
 {encoding:"utf8",maxBuffer:32*1024*1024});
test("all 8 Heroes, all 28 unique two-Hero parties and expected policies",()=>{
 assert.equal(HEROES.length,8);
 assert.equal(PARTIES.length,36);
 assert.equal(new Set(PARTIES.map(p=>p.join("+"))).size,36);
 assert.equal(PARTIES.filter(p=>p.length===1).length,8);
 assert.equal(PARTIES.filter(p=>p.length===2).length,28);
 assert.ok(RESEARCH_POLICIES.cautious);
 for(const f of ["room","combat","parley","seal"]){
  assert.ok(RESEARCH_POLICIES[f+"-only"]);
  assert.ok(RESEARCH_POLICIES["no-"+f]);
 }
 assert.equal(OBJECTS.length,52);
});
test("deterministic batches share seeds across policies but distinguish seed groups",()=>{
 const a=stableSeed(123,0,1,0),b=stableSeed(123,0,1,1),
  c=stableSeed(123,0,2,0),d=stableSeed(124,0,1,0);
 assert.equal(a,stableSeed(123,0,1,0));
 assert.equal(new Set([a,b,c,d]).size,4);
 assert.equal(typeof a,"number");
});
test("Wilson intervals are finite, bounded and narrower with more observations",()=>{
 const [lo,hi]=wilson(5,10);
 const [l2,h2]=wilson(500,1000);
 assert.ok(0<=lo&&lo<=.5&&hi>=.5&&hi<=1);
 assert.ok(h2-l2<hi-lo);
 assert.deepEqual(wilson(0,0),[null,null]);
});
test("dry-run does no simulations and checks preset arithmetic",()=>{
 const result=run(["--preset","smoke","--dry-run","--workers","1"]);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/"primaryExpeditions": 2880/);
 assert.match(result.stderr,/"reversedSeatExpeditions": 896/);
 assert.match(result.stderr,/"plannedExpeditions": 3776/);
 assert.match(result.stderr,/"partyCount": 36/);
 const custom=run(["--preset","smoke","--dry-run","--seeds","71,73,79",
  "--runs","20","--seat-runs","0","--policies","scripted,cautious,bold"]);
 assert.equal(custom.status,0,custom.stderr);
 assert.match(custom.stderr,/"primaryExpeditions": 12960/);
 assert.match(custom.stderr,/"reversedSeatExpeditions": 0/);
});
test("invalid duplicate seeds, unknown strategies and excessive runs are rejected",()=>{
 for(const args of [
  ["--seeds","1,1","--dry-run"],
  ["--seeds","4294967296","--dry-run"],
  ["--policies","novel","--dry-run"],
  ["--strategies","unknown","--dry-run"],
  ["--runs","0","--dry-run"],
  ["--workers","17","--dry-run"],
  ["--preset","nonexistent","--dry-run"],
  ["--seat-policies","bold","--dry-run"],
  ["--runs","999999999","--dry-run"]
 ]){
  const result=run(args);
  assert.notEqual(result.status,0,args.join(" "));
 }
});
test("small local study writes valid, deterministic, actionable datasets",()=>{
 const base=mkdtempSync(join(tmpdir(),"rogue-local-validator-"));
 try{
  const common=["--preset","smoke","--runs","2","--seeds","901,902",
   "--seat-runs","1","--strategies","magic","--policies","scripted,cautious",
   "--workers","2","--skip-tests"];
  const one=join(base,"study-one"),two=join(base,"study-two");
  for(const out of [one,two]){
   const process=run([...common,"--out",out]);
   assert.equal(process.status,0,process.stderr);
   for(const name of ["summary.md","summary.json","manifest.json",
    "cohorts.json","cohorts.csv","hero-parties.csv","objects.csv",
    "seat-order.csv","policy-contrasts.csv","validation.json","seed-stability.csv"])
    assert.ok(existsSync(join(out,name)),name);
  }
  const s=JSON.parse(readFileSync(join(one,"summary.json"),"utf8"));
  const t=JSON.parse(readFileSync(join(two,"summary.json"),"utf8"));
  assert.equal(s.schema,"rogue-cards-local-validation-v1");
  assert.equal(s.totalExpeditions,2*1*2*36*2+2*1*2*28*1);
  assert.equal(s.validation.errors.length,0);
  assert.equal(s.parties.length,2*36);
  assert.equal(s.items.length,2*52);
  assert.ok(s.policyContrasts.length>0);
  assert.equal(s.seatOrder.length,2*28);
  assert.deepEqual(s.parties,t.parties);
  assert.deepEqual(s.policyContrasts,t.policyContrasts);
  assert.deepEqual(s.seatOrder,t.seatOrder);
  assert.match(readFileSync(join(one,"summary.md"),"utf8"),
   /Knight is intentionally the beginner-friendly strong class/);
 }finally{rmSync(base,{recursive:true,force:true});}
});
