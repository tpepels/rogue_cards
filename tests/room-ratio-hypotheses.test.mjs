import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {ROOMS,MONSTERS,WARDEN,WARDEN_FURY}
 from "../src/tabletop-data.js";
import {PRINT_ONLY_ROOMS} from "../src/print-expansion.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {prepareRolloutDecks,sampleRolloutDecks} from "../src/rollout-state.js";
import {createDecisionSession,sessionActions}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import {compileStaging,canonicalStagingCatalogue}
 from "../src/staging/catalogue.js";
import {ROOM_RATIO_TARGETS,roomRatioHypotheses}
 from "../src/staging/room-ratio-hypotheses.js";

const E=new Set([
 "u-nest","u-mimic","ex-u-guard-cell",
 "m-statue","m-crypt","ex-m-old-barracks",
 "d-reliquary","d-bones","d-gate","ex-d-watchpost"
]);
const C=new Set([
 "u-passage","u-fall","u-fountain",
 "m-flood","m-fungus","m-treasure","m-beetle","ex-m-prison-block",
 "d-shadow","d-mouth","d-bazaar","d-last-chest","d-last-bell",
 "ex-d-flooded-cell"
]);
const expected=[
 {counts:[13,19,16],corridors:9},
 {counts:[19,16,13],corridors:6},
 {counts:[24,11,13],corridors:3}
];
const support=[
 "u-shrine","u-lantern-shrine","ex-u-coal-store",
 "m-altar","m-second-name","m-well",
 "d-apothecary","d-mirror"
];

test("canonical playtest Monster and two-phase Warden stats",()=>{
 assert.equal(MONSTERS.length,12);
 for(const m of MONSTERS){
  assert.ok(m.hp>=1&&m.atk>=1&&m.def>=0);
 }
 assert.equal(WARDEN.hp,15);
 assert.equal(WARDEN.atk,4);
 assert.equal(WARDEN_FURY.hp,8);
 assert.equal(WARDEN_FURY.atk,6);
 assert.match(WARDEN.v2.weakness,/8 HP or less/);
});
test("all three Room ratios are validated and change deck composition only",()=>{
 const specs=roomRatioHypotheses();
 assert.equal(specs.length,3);
 assert.equal(ROOM_RATIO_TARGETS.length,3);
 const canonical=canonicalStagingCatalogue();
 const canonicalRooms=[...ROOMS,...PRINT_ONLY_ROOMS];
 assert.equal(canonicalRooms.length,79);
 for(let i=0;i<specs.length;i++){
  const spec=specs[i],pool=compileStaging(spec);
  assert.equal(spec.id,ROOM_RATIO_TARGETS[i].id);
  assert.equal(spec.cards,undefined);
  assert.equal(spec.roomEffects,undefined);
  assert.equal(spec.mechanics,undefined);
  assert.equal(pool._stagingCatalogue,true);
  assert.deepEqual(pool.monsters,canonical.monsters);
  assert.deepEqual(pool.items,canonical.items);
  assert.strictEqual(pool.warden,canonical.warden);
  assert.strictEqual(pool.wardenFury,canonical.wardenFury);
  const ordinary=pool.rooms.filter(r=>r.v2.kind!=="CORRIDOR");
  const corridors=pool.rooms.filter(r=>r.v2.kind==="CORRIDOR");
  assert.equal(ordinary.length,48);
  assert.equal(corridors.length,expected[i].corridors);
  assert.deepEqual([
   ordinary.filter(r=>E.has(r.id)).length,
   ordinary.filter(r=>C.has(r.id)).length,
   ordinary.filter(r=>!E.has(r.id)&&!C.has(r.id)).length
  ],expected[i].counts);
  for(const stage of ["UPPER","MIDDLE","DEEP"]){
   assert.equal(ordinary.filter(r=>r.stage===stage).length,16);
   assert.equal(corridors.filter(r=>r.stage===stage).length,
    ROOM_RATIO_TARGETS[i].corridorCount);
  }
  for(const id of support)
   assert.equal(ordinary.filter(r=>r.id===id).length,1,
    spec.id+" must keep one copy of "+id);
  const game=new ExpeditionState({seed:12345,heroes:["warrior"],
   gameMode:"everything-goes",cardPools:pool});
  assert.equal(game.roomGoal,12);
  for(const stage of ["UPPER","MIDDLE","DEEP"])
   assert.equal(game.rooms[stage].length,16+
    ROOM_RATIO_TARGETS[i].corridorCount);
 }
});
test("staging refuses unknown Room selections and non-Corridor undersupply",()=>{
 const base=roomRatioHypotheses()[0];
 const invalid=structuredClone(base);
 invalid.id="ratio-invalid-room";
 invalid.roomDeck.UPPER.selection[0]="d-bridge";
 assert.throws(()=>compileStaging(invalid),/same-stage Room ids/);
 const insufficient=structuredClone(base);
 insufficient.id="ratio-undersupply";
 insufficient.roomDeck.DEEP.selection=
  insufficient.roomDeck.DEEP.selection.filter(id=>
   [...ROOMS,...PRINT_ONLY_ROOMS].find(r=>r.id===id).v2.kind==="CORRIDOR");
 assert.throws(()=>compileStaging(insufficient),/12..96 valid|12 non-Corridor/);
});
test("room-ratios CLI dry-run exposes all three designs",()=>{
 const proc=spawnSync(process.execPath,[
  "scripts/study-balance-hypotheses.mjs","--suite","room-ratios",
  "--variant-limit","3","--finalists","3","--dry-run"
 ],{encoding:"utf8",timeout:30000});
 assert.equal(proc.status,0,proc.stderr);
 const json=JSON.parse(proc.stdout);
 assert.equal(json.hypotheses.length,3);
 assert.equal(json.suite,"room-ratios");
 assert.equal(Object.keys(json.deckRatios).length,3);
 assert.equal(json.screenTrials,4*8*4);
});

test("fair MCTS sampler preserves the other copies of a visited Room ID",()=>{
 for(const spec of roomRatioHypotheses()){
  const pool=compileStaging(spec);
  const state=new ExpeditionState({seed:8004,heroes:["warrior"],
   gameMode:"everything-goes",cardPools:pool});
  const pile=state.rooms.UPPER;
  const id=pile.find(r=>pile.filter(other=>other.id===r.id).length>=2)?.id;
  assert.ok(id,spec.id+" must contain a repeated printed Room");
  const originally=pile.filter(r=>r.id===id).length;
  assert.ok(originally>=2,spec.id+" should have multiple printed Rat Nests");
  const at=pile.findIndex(r=>r.id===id);
  state.beginRoom(pile.splice(at,1)[0],{deferEntry:true});
  assert.equal(state.metrics.roomVisitCounts[id],1);
  const blueprint=prepareRolloutDecks(state,"fair");
  assert.equal(blueprint.rooms.UPPER.available.filter(r=>r.id===id).length,
   originally-1);
  const sample=sampleRolloutDecks(state,{
   knowledge:"fair",deckSeed:717,blueprint});
  assert.equal(sample.rooms.UPPER.length,pile.length);
  assert.equal(sample.rooms.UPPER.filter(r=>r.id===id).length,
   originally-1);
  assert.equal(state.rooms.UPPER.length,pile.length);
 }
});
test("publicly revealed duplicates and discarded copies remain separate",()=>{
 const spec=roomRatioHypotheses()[2];
 const pool=compileStaging(spec);
 const state=new ExpeditionState({seed:9120,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:pool});
 const pile=state.rooms.UPPER,id="u-nest";
 assert.ok(pile.filter(r=>r.id===id).length>=2);
 const card=pile.splice(pile.findIndex(r=>r.id===id),1)[0];
 state.beginRoom(card,{deferEntry:true});
 const remaining=pile.filter(r=>r.id===id).length;
 state.peekedRoomIds.UPPER=[id];
 const prepared=prepareRolloutDecks(state,"fair");
 assert.equal(prepared.rooms.UPPER.known[0].id,id);
 assert.equal(prepared.rooms.UPPER.available.filter(r=>r.id===id).length,
  remaining-1);
 const sampled=sampleRolloutDecks(state,{
  knowledge:"fair",deckSeed:128,blueprint:prepared});
 assert.equal(sampled.rooms.UPPER.filter(r=>r.id===id).length,remaining);
});
test("an actual searchDecision can search a staged repeated-Room deck",()=>{
 for(const spec of roomRatioHypotheses()){
  const pool=compileStaging(spec);
  const session=createDecisionSession({seed:6201,heroes:["warrior"],
   gameMode:"everything-goes",cardPools:pool});
  const pile=session.state.rooms.UPPER;
  const room=pile.splice(pile.findIndex(r=>r.id==="u-shrine"),1)[0];
  assert.ok(room);
  session.state.beginRoom(room);
  session.phase="room";
  const legal=sessionActions(session);
  assert.ok(legal.length>=2);
  const before=session.state.rng.snapshot();
  const result=searchDecision(session,{budget:2,seed:1104,
   knowledge:"fair",maxSteps:3000,strictTerminal:false,
   treeMode:"frontier"});
  assert.equal(result.budget,2);
  assert.ok(legal.some(x=>x.kind===result.recommended.kind));
  assert.equal(session.state.rng.snapshot(),before);
 }
});
