import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ROOMS,MONSTERS,OBJECTS} from "../src/tabletop-data.js";
import {itemOptions,ITEM_TIMING,auditItemTiming} from "../src/item-access.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {planCombat,futureItemValue} from "../src/decision-planner.js";
const item=id=>OBJECTS.find(c=>c.id===id);
function fixture(id="u-lamp"){
 const s=new ExpeditionState({seed:8014,heroes:["warrior"],strategy:"magic"});
 const h=s.heroes[0];
 s.beginRoom(ROOMS.find(r=>r.id===id));
 s.monster=MONSTERS.find(m=>m.id==="rat");s.monsterHP=s.monster.hp;
 s.plannerRisk="cautious";
 return {s,h};
}
test("every Object has reviewed timing categories",()=>{
 const audit=auditItemTiming();
 assert.equal(audit.objects,OBJECTS.length);
 assert.equal(audit.categorized,OBJECTS.length);
 assert.deepEqual(Object.keys(ITEM_TIMING).sort(),OBJECTS.map(o=>o.id).sort());
 for(const c of OBJECTS)assert.ok(ITEM_TIMING[c.id].length>0,c.id);
});
test("only printed combat Wands can overcharge; reactions are not actions",()=>{
 const {s,h}=fixture();
 for(const id of ["torch","lantern-heart","wand-undo","wand-door",
  "wand-market","wand-sparks","scroll-flame","needle","mirror","shield"])
  s.add(h,item(id));
 const options=itemOptions(s,h,"combat");
 const match=(id,mode)=>options.some(x=>x.card.id===id&&x.mode===mode);
 assert.ok(match("torch","torch-skip"));
 assert.ok(match("lantern-heart","lantern-skip"));
 assert.ok(match("wand-sparks","overcharge"));
 for(const id of ["wand-undo","wand-door","wand-market"])
  assert.ok(!match(id,"overcharge"),id+" overcharge violates printed trigger");
 assert.ok(!match("mirror","action"));
 assert.ok(!match("shield","action"));
 assert.ok(itemOptions(s,h,"before-defence").some(x=>x.card.id==="mirror"));
 s.room=ROOMS.find(r=>r.id==="u-passage");
 assert.ok(!itemOptions(s,h,"combat").some(x=>x.mode==="torch-skip"));
});
test("printed first-use and reactive timing records are distinct from carrying",()=>{
 const {s,h}=fixture("u-passage");
 const scroll=item("scroll-lightning");s.add(h,scroll);
 assert.equal(s.metrics.itemOpportunities["scroll-lightning"],undefined);
 const legal=itemOptions(s,h,"combat").filter(x=>x.card===scroll);
 assert.equal(legal.length,1);
 s.noteOptions(legal);
 assert.equal(s.metrics.itemOpportunities["scroll-lightning"].byPhase.combat,1);
 const beforeHP=s.monsterHP;
 assert.equal(s.activate(h,scroll,{face:6,mode:"action"}),true);
 assert.ok(s.metrics.itemUses["scroll-lightning"].byMode.action===1);
 assert.ok(s.metrics.itemResults["scroll-lightning"].damage>0);
 assert.ok(s.monsterHP<beforeHP);
 assert.equal(s.metrics.objectActivations["scroll-lightning"],1);
 assert.ok(!h.inventory.includes(scroll));
 assert.equal(s.metrics.itemOpportunities["scroll-lightning"].total,1);
});
test("future resource value is contextual, bounded and never reads hidden draws",()=>{
 const {s,h}=fixture();
 const spell=item("scroll-last");s.add(h,spell);
 s.metrics.cleared=0;
 const early=futureItemValue(s,h,spell,"action");
 s.metrics.cleared=9;s.monster=MONSTERS.find(m=>m.id==="sentinel");
 const final=futureItemValue(s,h,spell,"action");
 assert.ok(Number.isFinite(early)&&Number.isFinite(final));
 assert.ok(early>=final);
 assert.ok(final>=0);
});
test("three Item policies are reproducible, opt-in, and account for results",()=>{
 const opts={seed:405,heroes:["warrior","priest"],strategy:"magic",
  researchPolicy:"planner",plannerRisk:"cautious"};
 const baseline=simulateFullExpedition(opts);
 assert.deepEqual(baseline,simulateFullExpedition({...opts,itemTrial:"normal"}));
 for(const trial of ["normal","free","force"]){
  const r=simulateFullExpedition({...opts,itemTrial:trial});
  assert.deepEqual(r,simulateFullExpedition({...opts,itemTrial:trial}));
  assert.equal(r.itemTrial,trial);
  assert.equal(r.unresolved,0);assert.equal(r.roundLimit,false);
  for(const [id,c] of Object.entries(r.itemUses)){
   assert.equal(c.total,Object.values(c.byMode).reduce((a,b)=>a+b,0),id);
   assert.equal(r.itemResults[id].uses,c.total,id);
  }
 }
 assert.throws(()=>simulateFullExpedition({...opts,itemTrial:"unlimited"}),
  /Unknown Item trial/);
 assert.throws(()=>simulateFullExpedition({seed:3,itemTrial:"force"}),
  /requires planner combat enabled/);
 assert.equal(typeof planCombat(fixture().s,fixture().h).action,"string");
});
test("Item comparison produces per-card experiments and readable summary",()=>{
 const run=(script,args)=>spawnSync(process.execPath,[script,...args],
  {encoding:"utf8",maxBuffer:16*1024*1024});
 const cli=run("scripts/study-items.mjs",["1","--seed","45027"]);
 assert.equal(cli.status,0,cli.stderr);
 const r=JSON.parse(cli.stdout);
 assert.equal(r.experiment,"rogue-cards-item-trials-v1");
 assert.equal(r.simulated,96);
 assert.equal(r.unresolved,0);assert.equal(r.stalls,0);
 assert.equal(Object.keys(r.groups.all.policies.normal.items).length,OBJECTS.length);
 const tmp=mkdtempSync(join(tmpdir(),"rogue-items-"));
 try{
  const fp=join(tmp,"items.json");writeFileSync(fp,cli.stdout);
  const report=run("scripts/report-items.mjs",[fp]);
  assert.equal(report.status,0,report.stderr);
  assert.match(report.stdout,/Item-by-Item observations/);
  assert.match(report.stdout,/Observed direct outcomes/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
 for(const args of [["0"],["1001"],["1","--seed","bad"],["1","--bogus"]]){
  const bad=run("scripts/study-items.mjs",args);
  assert.notEqual(bad.status,0,args.join(" "));
  assert.match(bad.stderr,/Usage:/);
 }
});
