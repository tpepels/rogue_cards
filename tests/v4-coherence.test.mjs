import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,readFileSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {ROOMS,OBJECTS,MONSTERS} from "../src/tabletop-data.js";
import {fateChoiceLegal,resolveFateChoice} from "../src/room-fates.js";
import {legalRoomChoices} from "../src/engine/index.js";
import {engraveElbereth} from "../src/engine/combat.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";

const room=id=>ROOMS.find(r=>r.id===id);
test("fate Item costs agree across UI, simulator and printed handler",()=>{
 for(const id of ["u-scribe-dust","u-bone-seed","m-ferryman-oath",
  "d-sleeping-crown"]){
  const s=new ExpeditionState({seed:7011,heroes:["warrior"]});
  s.beginRoom(room(id));
  // An empty-inventory state is a valid state after all Objects were spent.
  s.heroes[0].inventory=[];
  s.heroes[0].slots={};
  const legal=legalRoomChoices(s);
  const expensive=id==="d-sleeping-crown"?1:0;
  const free=1-expensive;
  assert.equal(fateChoiceLegal(s,id,expensive),false);
  assert.equal(fateChoiceLegal(s,id,free),true);
  assert.ok(!legal.includes(expensive),id+" offered an unaffordable option");
  assert.ok(legal.includes(free),id+" hid the free printed option");
  resolveFateChoice(s,expensive); // legacy effects fall back for safety
  assert.equal(s.fateChoices.at(-1).choice,room(id).v2.choices[free].label);
 }
});
test("fate MAGIC cost is not equivalent to an ordinary Item cost",()=>{
 const s=new ExpeditionState({seed:18,heroes:["warrior"]});
 s.beginRoom(room("d-sleeping-crown"));
 const nonMagic=OBJECTS.find(o=>!o.v2.tags?.includes("MAGIC"));
 s.heroes[0].inventory=[nonMagic];
 s.heroes[0].slots={};
 assert.deepEqual(legalRoomChoices(s),[0]);
 const magic=OBJECTS.find(o=>o.v2.tags?.includes("MAGIC"));
 s.heroes[0].inventory.push(magic);
 assert.ok(legalRoomChoices(s).includes(1));
});
test("Elbereth telemetry records success, failure and flee without double response",()=>{
 const s=new ExpeditionState({seed:123,heroes:["warrior"]});
 s.beginRoom(room("u-nest"));
 s.monster=MONSTERS.find(m=>m.id==="rat");
 s.monsterHP=5;
 const h=s.heroes[0];
 const before=s.metrics;
 assert.equal(engraveElbereth(s,h,{face:20}).success,true);
 assert.equal(before.elberethAttempts,1);
 assert.equal(before.elberethSuccesses,1);
 assert.equal(before.elberethFailures,0);
 const next=new ExpeditionState({seed:18,heroes:["warrior"]});
 next.beginRoom(room("u-nest"));next.monster=MONSTERS.find(m=>m.id==="rat");
 next.monsterHP=5;
 const fail=engraveElbereth(next,next.heroes[0],{face:1});
 assert.equal(fail.success,false);
 assert.equal(next.metrics.elberethAttempts,1);
 assert.equal(next.metrics.elberethFailures,1);
 assert.equal(next.metrics.elberethSuccesses,0);
 const fled=new ExpeditionState({seed:432,heroes:["warrior"]});
 fled.beginRoom(room("u-nest"));fled.monster=MONSTERS.find(m=>m.id==="rat");
 fled.monsterHP=5;
 assert.equal(engraveElbereth(fled,fled.heroes[0],
  {face:20,mode:"flee"}).fled,true);
 assert.equal(fled.metrics.elberethFlees,1);
 assert.equal(fled.metrics.elberethSuccesses,1);
});
test("reliable and risky Hero-policy interventions remain deterministic",()=>{
 const base={seed:917283,heroes:["warrior","wizard"],strategy:"magic"};
 const steady=simulateFullExpedition({...base,heroAbilityMode:"steady"});
 const risky=simulateFullExpedition({...base,heroAbilityMode:"risk"});
 assert.equal(steady.heroAbilityMode,"steady");
 assert.equal(risky.heroAbilityMode,"risk");
 assert.deepEqual(steady,simulateFullExpedition({...base,heroAbilityMode:"steady"}));
 assert.deepEqual(risky,simulateFullExpedition({...base,heroAbilityMode:"risk"}));
 assert.equal(steady.unresolved,0);
 assert.equal(risky.unresolved,0);
 assert.throws(()=>simulateFullExpedition({...base,heroAbilityMode:"invalid"}),
  /Hero ability policy/);
});
test("V4 coherence CLI produces paired choice and strategy data",()=>{
 const temp=mkdtempSync(join(tmpdir(),"rogue-v4-study-"));
 try{
  const output=join(temp,"result");
  const proc=spawnSync(process.execPath,[
   "scripts/study-v4-coherence.mjs","--runs","2",
   "--choice-runs","3","--party-set","solo",
   "--strategies","magic","--seed","81021","--out",output
  ],{encoding:"utf8",timeout:90000,maxBuffer:8*1024*1024});
  assert.equal(proc.status,0,proc.stderr);
  assert.ok(existsSync(join(output,"summary.md")));
  const report=JSON.parse(readFileSync(join(output,"summary.json"),"utf8"));
  assert.equal(report.schema,"rogue-cards-v4-coherence-v1");
  assert.equal(report.catalogue.fates,10);
  assert.equal(report.settings.estimates.ordinary,8*10*2);
  assert.equal(report.settings.estimates.counterfactual,10*2*3);
  assert.equal(Object.keys(report.broad.arms).length,10);
  assert.equal(Object.keys(report.choices).length,10);
  assert.equal(report.broad.arms.scripted.n,16);
  assert.equal(report.broad.arms["smuggle-route"].n,16);
  assert.equal(report.broad.arms.risky.n,16);
  assert.equal(report.broad.arms.steady.n,16);
  assert.equal(report.broad.pairedContrasts["risky-minus-steady"].n,16);
  assert.ok(Object.values(report.choices).every(x=>
   x.encountered>=x.bothLegal&&x.runs===3));
  assert.deepEqual(report.warnings,[]);
  const duplicate=spawnSync(process.execPath,[
   "scripts/study-v4-coherence.mjs","--runs","1",
   "--choice-runs","1","--party-set","solo",
   "--strategies","magic","--out",output
  ],{encoding:"utf8",timeout:90000});
  assert.notEqual(duplicate.status,0,"Study must not silently overwrite results");
 }finally{rmSync(temp,{recursive:true,force:true})}
});
