import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {screeningArms,parseCalibration,selectCalibration}
 from "../scripts/mcts-search-calibration.mjs";
import {SOLO_HEROES} from "../scripts/study-solo-expedition-balance.mjs";

test("single-run calibration includes baseline, PW, PUCT and combinations",()=>{
 const arms=screeningArms();
 assert.equal(arms.length,28);
 assert.equal(new Set(arms.map(a=>a.id)).size,arms.length);
 assert.deepEqual(arms.reduce((n,a)=>{
  const group=a.id.split("-")[0];n[group]=(n[group]??0)+1;return n;
 },{}),{baseline:1,priors:3,pw:6,combined:18});
 assert.ok(arms.filter(a=>a.progressiveWidening).every(a=>a.pwRootFull));
 assert.ok(arms.some(a=>a.pwOrder==="random"));
 assert.ok(arms.some(a=>a.pwOrder==="soft-first"));
 assert.ok(arms.some(a=>a.pwOrder==="public-prior"));
 assert.ok(arms.some(a=>a.pwAlpha===0.75));
});
test("calibration parameters have bounded, independently frozen budgets",()=>{
 const o=parseCalibration(["--workers","8","--screen-repeats","2",
  "--confirm-repeats","12","--confirm-budgets","32,64"]);
 assert.deepEqual(o.confirmBudgets,[32,64]);
 assert.equal(o.screenBudget,16);
 assert.equal(o.screenRepeats,2);
 assert.equal(o.confirmRepeats,12);
 for(const args of [["--confirm-budgets","32,32"],["--screen-budget","0"],
  ["--confirm-repeats","0"],["--invalid","1"]])
  assert.throws(()=>parseCalibration(args));
});
test("screening is reproducible and selection cannot use held-out results",()=>{
 const arms=screeningArms();
 const rows=arms.flatMap(a=>SOLO_HEROES.map(hero=>({
  arm:a.id,budget:16,hero,won:a.id==="priors-c0p35"?1:0,
  vaultReached:a.id==="priors-c0p35"?1:0,
  searchMs:a.id==="priors-c0p35"?3000:1000
 })));
 const a=selectCalibration(rows,arms,16),b=selectCalibration(rows,arms,16);
 assert.deepEqual(a,b);
 assert.equal(a.selected.length,4);
 assert.equal(a.selected[1].id,"priors-c0p35");
 assert.throws(()=>selectCalibration(rows.slice(1),arms,16),/incomplete/);
});
test("existing A/B/C/D command dispatches calibration without running games",()=>{
 const r=spawnSync(process.execPath,[
  "scripts/study-mcts-search-ablation.mjs","--calibrate",
  "--dry-run","--screen-repeats","1","--confirm-repeats","1"
 ],{encoding:"utf8",timeout:30000});
 assert.equal(r.status,0,r.stderr);
 const manifest=JSON.parse(r.stdout);
 assert.equal(manifest.screenPlanned,28*SOLO_HEROES.length);
 assert.equal(manifest.confirmPlanned,4*SOLO_HEROES.length*2);
 assert.equal(manifest.screenArms.length,28);
});
