import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {MONSTERS} from "../src/tabletop-data.js";
import {MONSTER_DEFEATS} from "../src/monster-defeats.js";
import {BALANCED_ROOM_IDS} from "../src/room-balance.js";
import {compileStaging} from "../src/staging/catalogue.js";
import {printedRecoveryHypotheses,PRINTED_RECOVERY_IDS,
 PRINTED_RECOVERY_REFERENCE_ID}
 from "../src/staging/printed-recovery-hypotheses.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {settleMonsterVictory} from "../src/engine/combat-outcomes.js";
import {chooseRoom,legalRoomChoices} from "../src/engine/index.js";
import {cardMarkup} from "../src/tabletop-view.js";

const specs=printedRecoveryHypotheses();
const physical=specs.filter(x=>PRINTED_RECOVERY_IDS.includes(x.id));
// ruleMarkup() wraps HP and dice terms in <strong>; assert what players
// actually read, rather than relying on contiguous raw HTML source.
const visibleCardText=card=>cardMarkup(card).replace(/<[^>]*>/g,"")
 .replace(/&amp;/g,"&").replace(/&#39;/g,"'");
test("three physical proposals use existing mechanics and canonical Balanced B Rooms",()=>{
 assert.equal(physical.length,3);
 assert.equal(specs.length,4);
 for(const spec of physical){
  assert.equal(spec.mechanics?.postCombatHeal,undefined,spec.id);
  assert.ok(spec.cards.length>0);
  const pool=compileStaging(spec);
  assert.equal(pool.mechanics.postCombatHeal,undefined);
  assert.deepEqual(pool.rooms.map(r=>r.id),
   BALANCED_ROOM_IDS);
  assert.equal(pool.rooms.length,54);
  assert.equal(pool.monsters.length,24);
  assert.ok(pool.items.find(x=>x.id==="ex-bandages").copies>3);
 }
 const diagnostic=specs.find(s=>s.id===PRINTED_RECOVERY_REFERENCE_ID);
 assert.equal(diagnostic.mechanics.postCombatHeal,5);
 assert.equal(diagnostic.monsterHealing,undefined);
 assert.equal(diagnostic.roomRestHealing,undefined);
});

test("monster-specific printed DEFEAT retains original benefit and executes HEAL",()=>{
 const spec=physical.find(x=>x.id==="printed-recovery-light");
 const pool=compileStaging(spec);
 const m=pool.monsters.find(x=>x.id==="goblin");
 assert.equal(m.v2.defeat,MONSTER_DEFEATS.goblin.text+" Heal 2 HP.");
 assert.deepEqual(m.v2.defeatOps,["DRAW:1","HEAL:2"]);
 assert.ok(visibleCardText(m).includes("Heal 2 HP."));
 const s=new ExpeditionState({gameMode:"everything-goes",
  heroes:["warrior"],seed:130,cardPools:pool});
 const h=s.heroes[0];
 h.hp=h.card.hp-5;
 s.monster=m;s.monsterHP=0;s.banished=false;
 const prior=s.metrics.operationCounts.HEAL??0;
 settleMonsterVictory(s,m);
 assert.equal(h.hp,h.card.hp-3);
 assert.equal(s.metrics.operationCounts.HEAL,prior+1);
 assert.equal(s.metrics.postCombatHealTriggers,0);
 assert.equal(s.metrics.kills,1);
 assert.deepEqual(MONSTERS.find(x=>x.id==="goblin").v2.defeatOps,
  ["DRAW:1"]);
});

test("printed REST and executed REST agree, retaining the Item cost",()=>{
 const spec=physical.find(x=>x.id==="printed-recovery-supplies");
 const pool=compileStaging(spec);
 const room=pool.rooms.find(x=>x.id==="ex-u-coal-store");
 assert.equal(room.v2.choices[1].effect,"Discard 1 Item to heal 6 HP.");
 assert.ok(visibleCardText(room).includes("Discard 1 Item to heal 6 HP."));
 assert.deepEqual(pool.roomEffects[room.id].choices[1],
  ["COST:1","HEAL:6"]);
 const s=new ExpeditionState({gameMode:"everything-goes",
  seed:170,heroes:["warrior"],cardPools:pool});
 const h=s.heroes[0];
 s.room=room;
 // Explicitly furnish a discardable physical Item.
 const item=pool.items.find(c=>c.id==="ex-rations");
 s.add(h,item);
 h.hp=h.card.hp-7;
 assert.ok(legalRoomChoices(s).includes(1));
 const startCount=h.inventory.length;
 chooseRoom(s,1,{observeResult:false});
 assert.equal(h.hp,h.card.hp-1);
 assert.equal(h.inventory.length,startCount-1);
 assert.equal(s.metrics.postCombatHealTriggers,0);
});

test("staging never mutates original printed cards",()=>{
 const original=MONSTERS.find(x=>x.id==="goblin");
 const originalText=original.v2.defeat;
 const originalOps=[...original.v2.defeatOps];
 const a=compileStaging(physical[0]);
 const b=compileStaging(physical[1]);
 assert.equal(original.v2.defeat,originalText);
 assert.deepEqual(original.v2.defeatOps,originalOps);
 assert.notEqual(a.monsters.find(m=>m.id==="goblin"),
  b.monsters.find(m=>m.id==="goblin"));
 assert.equal(a.items.find(i=>i.id==="ex-bandages").copies,5);
 assert.equal(b.items.find(i=>i.id==="ex-bandages").copies,9);
});

test("invalid, non-printable recovery edits are rejected",()=>{
 const basis={schema:"rogue-cards-staging-v1",id:"bad-heal"};
 assert.throws(()=>compileStaging({...basis,monsterHealing:{goblin:100}}),
  /Unsupported printed Monster healing/);
 assert.throws(()=>compileStaging({...basis,monsterHealing:{warden:2}}),
  /Unknown regional Monster/);
 assert.throws(()=>compileStaging({...basis,roomRestHealing:{"m-statue":5}}),
  /Unsupported printed Room REST/);
});

test("printed-recovery suite CLI runs with the existing frozen player",()=>{
 const run=spawnSync(process.execPath,[
  "scripts/study-balance-hypotheses.mjs",
  "--suite","printed-recovery","--variant-limit","4",
  "--finalists","4","--dry-run"
 ],{encoding:"utf8",timeout:30000});
 assert.equal(run.status,0,run.stderr);
 const report=JSON.parse(run.stdout);
 assert.equal(report.suite,"printed-recovery");
 assert.equal(report.hypotheses.length,4);
 assert.equal(report.screenTrials,5*8*4);
 assert.ok(report.hypotheses.includes(PRINTED_RECOVERY_REFERENCE_ID));
});
