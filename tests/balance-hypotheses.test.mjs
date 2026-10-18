import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {canonicalStagingCatalogue,compileStaging}
 from "../src/staging/catalogue.js";
import {balanceHypotheses,encounterRoomSelection}
 from "../src/staging/balance-hypotheses.js";
import {balanceStudyArgs,phaseSummary}
 from "../scripts/study-balance-hypotheses.mjs";

test("Hypothesis grid compiles, contains varied assumptions, and never mutates canonical",()=>{
 const canonical=canonicalStagingCatalogue(),
  wisp=canonical.monsters.find(m=>m.id==="wisp").hp,
  room=JSON.stringify(ROOM_EFFECTS["ex-u-guard-cell"]);
 const items=balanceHypotheses(),names=items.map(x=>x.id);
 assert.ok(items.length>=12);
 assert.equal(new Set(names).size,items.length);
 for(const h of items){
  const pools=compileStaging(h);
  assert.equal(pools._stagingCatalogue,true);
  assert.equal(pools.stagingId,h.id);
 }
 assert.equal(canonical.monsters.find(m=>m.id==="wisp").hp,wisp);
 assert.equal(JSON.stringify(ROOM_EFFECTS["ex-u-guard-cell"]),room);
 const stages=encounterRoomSelection();
 assert.ok(["UPPER","MIDDLE","DEEP"].every(s=>stages[s].length>=4));
});
test("Encounter hypotheses change only canonical executable Room opcodes",()=>{
 const modes=balanceHypotheses();
 const original=ROOM_EFFECTS["ex-u-guard-cell"];
 const stronger=modes.find(m=>m.id==="encounter-strong");
 const patch=Object.entries(stronger.roomEffects)
  .find(([id])=>id==="ex-u-guard-cell");
 assert.ok(stronger&&Object.keys(stronger.roomEffects).length>12);
 for(const [id,fx] of Object.entries(stronger.roomEffects)){
  assert.equal(fx.choices.length,ROOM_EFFECTS[id].choices.length);
  assert.equal(fx.outcomes.length,ROOM_EFFECTS[id].outcomes.length);
  assert.ok(fx.outcomes.some((row,i)=>row.length>
   ROOM_EFFECTS[id].outcomes[i].length));
 }
 const result=compileStaging(stronger);
 assert.ok(result.rooms.length===canonicalStagingCatalogue().rooms.length);
 assert.equal(ROOM_EFFECTS["ex-u-guard-cell"],original);
});
test("Assumptions isolate Monster ATK, Item supply, deck exclusion and interaction",()=>{
 const list=balanceHypotheses(),get=id=>list.find(x=>x.id===id);
 const canon=canonicalStagingCatalogue();
 const low=compileStaging(get("monsters-atk-minus-1"));
 for(const orig of canon.monsters){
  const edited=low.monsters.find(x=>x.id===orig.id);
  assert.equal(edited.atk,Math.max(0,orig.atk-1));
  assert.equal(edited.hp,orig.hp);
 }
 const room=compileStaging(get("encounter-deck-bias"));
 for(const stage of ["UPPER","MIDDLE","DEEP"])
  assert.equal(canon.rooms.filter(x=>x.stage===stage).length-
   room.rooms.filter(x=>x.stage===stage).length,4);
 const more=compileStaging(get("recovery-item-copies"));
 assert.equal(more.items.find(x=>x.id==="ex-bandages").copies,5);
 const combined=compileStaging(get("encounter-strong-atk-recovery"));
 assert.ok(Object.keys(combined.roomEffects).length>
  Object.keys(compileStaging(get("encounter-strong")).roomEffects).length);
 assert.equal(combined.monsters.find(x=>x.id==="wisp").atk,
  Math.max(0,canon.monsters.find(x=>x.id==="wisp").atk-1));
});
test("Study parser bounds sample sizes and separates pilot from large work",()=>{
 const opts=balanceStudyArgs(["--dry-run"]);
 assert.equal(opts.screenRepeats,4);
 assert.equal(opts.confirmRepeats,6);
 assert.equal(opts.finalists,4);
 assert.equal(opts.heroes.length,8);
 assert.throws(()=>balanceStudyArgs(["--screen-repeats","0"]),/screen-repeats/);
 assert.throws(()=>balanceStudyArgs(["--heroes","warrior,warrior"]),/heroes/);
 assert.equal(balanceStudyArgs(["--smoke","true"]).smoke,true);
 assert.equal(balanceStudyArgs(["--smoke","true"]).screenRepeats,1);
});
test("Partial study never reports a complete confirmation",()=>{
 const models=balanceHypotheses().slice(0,2);
 const manifest={revision:"revision",agentSha256:"agent",
  heroes:["warrior"],screenRepeats:2,confirmRepeats:2,
  canonicalDeck:{},stagedDecks:Object.fromEntries(models.map(x=>[x.id,{}]))};
 const source={hero:"warrior",replicate:0,seed:12,phase:"screen",
  won:0,vaultReached:0,roomsCleared:16,ordinaryEncounters:3,
  ordinaryFights:2,combatContextDamage:10,remainingHp:0,
  finalMetrics:{},seenRoomIds:[]};
 const rows=[{...source,variant:"canonical"},
  {...source,variant:models[0].id}];
 const report=phaseSummary(rows,"screen",manifest,models);
 assert.equal(report.complete,false);
 assert.equal(report.baseline.n,1);
 assert.equal(report.ranked[0].paired,1);
});
test("Dry-run validates the real hypotheses without committing trials",()=>{
 const run=spawnSync(process.execPath,[
  new URL("../scripts/study-balance-hypotheses.mjs",import.meta.url).pathname,
  "--dry-run","--variant-limit","3","--finalists","2",
  "--screen-repeats","2","--confirm-repeats","3"
 ],{encoding:"utf8"});
 assert.equal(run.status,0,run.stderr);
 const json=JSON.parse(run.stdout);
 assert.equal(json.screenTrials,96); // (3+1)*8*2
 assert.equal(json.confirmTrials,72); // (2+1)*8*3
 assert.equal(json.physicallyCanonicalCardsChanged,false);
});
