import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {BALANCED_PARTIES,playParty}
 from "../scripts/study-balanced-recovery-parties.mjs";

test("All eight printed Heroes and all 28 distinct unordered pairs are included",()=>{
 assert.equal(HEROES.length,8);
 assert.equal(BALANCED_PARTIES.length,36);
 assert.equal(BALANCED_PARTIES.filter(p=>p.length===1).length,8);
 assert.equal(BALANCED_PARTIES.filter(p=>p.length===2).length,28);
 assert.equal(new Set(BALANCED_PARTIES.map(x=>x.join("+"))).size,36);
 for(const p of BALANCED_PARTIES)
  assert.equal(new Set(p).size,p.length);
});
test("Plan pins the real 36-Room game and one shared fair co-op agent",()=>{
 const r=spawnSync(process.execPath,[
  "scripts/study-balanced-recovery-parties.mjs","--runs-per-party","2",
  "--budget","4","--dry-run"],{encoding:"utf8",timeout:30000});
 assert.equal(r.status,0,r.stderr);
 const m=JSON.parse(r.stdout);
 assert.equal(m.total,72);
 assert.equal(m.parties.length,36);
 assert.equal(m.gameMode,"everything-goes");
 assert.equal(m.agent.knowledge,"fair");
 assert.equal(m.agent.equipmentMode,"legacy");
 assert.equal(m.agent.heuristicMode,"legacy");
});
test("Actual canonical decision-session resolves a solo and a duo",()=>{
 for(const party of [["warrior"],["warrior","priest"]]){
  const r=playParty({heroes:party,seed:3,budget:1});
  assert.equal(r.party,party.join("+"));
  assert.ok(["win","escape","death"].includes(r.ending));
  assert.equal(r.postCombatHealTriggers,0);
  assert.ok(r.roomsCleared<=36);
  assert.ok(r.healingRestored>=0);
  assert.ok(r.healingWasted>=0);
  assert.equal(r.finalHeroes.length,party.length);
  assert.equal(r.won,Number(r.ending==="win"));
 }
});
