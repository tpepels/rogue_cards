import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {HEROES,OBJECTS,ROOMS} from "../src/tabletop-data.js";

const cwd=fileURLToPath(new URL("../",import.meta.url));
function execute(args){
 return spawnSync(process.execPath,["scripts/verify-game.mjs",...args],{
  cwd,encoding:"utf8",maxBuffer:12*1024*1024
 });
}
test("whole-game verification visits all solo and two-Hero parties",()=>{
 const r=execute(["1"]);
 assert.equal(r.status,0,r.stderr);
 const data=JSON.parse(r.stdout);
 assert.equal(data.partySetups,36);
 assert.equal(data.strategies.length,5);
 assert.equal(data.groups.length,180);
 assert.equal(data.totals.expeditions,180);
 assert.equal(data.totals.unresolvedEffects,0);
 assert.equal(data.totals.stalledExpeditions,0);
 assert.equal(data.coverage.totalObjects,OBJECTS.length);
 assert.equal(data.coverage.totalRegionalRooms,ROOMS.length);
 assert.equal(data.coverage.totalRollObjects,OBJECTS.filter(o=>o.v2.roll).length);
 assert.equal(data.groups.filter(g=>g.heroes.length===1).length,HEROES.length*5);
 assert.equal(data.groups.filter(g=>g.heroes.length===2).length,28*5);
});
test("comparison rejects mismatched experiment sizes instead of comparing misleading rates",()=>{
 const r=execute(["1","--compare","tests/fixtures/game-baseline.json"]);
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Baseline configuration differs/);
});
test("whole-game verification rejects invalid arguments",()=>{
 for(const args of [["0"],["2","--strict"],["2","--compare"],
  ["2","--surprise"],["10001"]]){
  const r=execute(args);
  assert.notEqual(r.status,0,args.join(" "));
  assert.match(r.stderr,/Usage:/);
 }
});
