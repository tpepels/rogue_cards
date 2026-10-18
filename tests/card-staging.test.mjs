import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileStaging} from "../src/staging/catalogue.js";
import {ALL_MONSTERS,ALL_ROOMS,ALL_OBJECTS}
 from "../src/decks.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {createDecisionSession,sessionActions}
 from "../src/engine/decision-session.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {prepareRolloutDecks} from "../src/rollout-state.js";
import {searchDecision} from "../src/session-mcts.js";
import {playFullSoloExpedition} from "../scripts/study-solo-expedition-balance.mjs";
import {stageSeed,parseStagingArgs,compareStaging}
 from "../scripts/study-card-staging.mjs";

const SAMPLE=JSON.parse(readFileSync(new URL(
 "../experiments/staging/wisp-hp-8.json",import.meta.url)));
const make=patch=>compileStaging({schema:"rogue-cards-staging-v1",
 id:"test-staging",...patch});

test("Staged Monster changes only its own frozen definition and not canonical",()=>{
 const canonical=ALL_MONSTERS.find(m=>m.id==="wisp");
 const original=canonical.hp;
 const staged=compileStaging(SAMPLE);
 assert.equal(staged.monsters.find(m=>m.id==="wisp").hp,8);
 assert.equal(canonical.hp,original);
 assert.notEqual(staged.monsters.find(m=>m.id==="wisp"),canonical);
 assert.ok(Object.isFrozen(staged.monsters.find(m=>m.id==="wisp")));
 assert.ok(Object.isFrozen(staged));
 const normal=new ExpeditionState({seed:10,heroes:["warrior"],
  gameMode:"everything-goes"});
 const variant=new ExpeditionState({seed:10,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:staged});
 assert.equal(normal.monsters.MIDDLE.find(m=>m.id==="wisp").hp,9);
 assert.equal(variant.monsters.MIDDLE.find(m=>m.id==="wisp").hp,8);
 assert.equal(canonical.hp,original);
});
test("Staged Item copy counts and Room exclusions change physical pools",()=>{
 const staged=make({cards:[
  {collection:"items",id:"rope",set:{copies:2}},
  {collection:"monsters",id:"rat",set:{copies:2}}
 ],roomDeck:{UPPER:{exclude:["ex-u-guard-cell"]}}});
 const real=new ExpeditionState({seed:93,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:staged});
 assert.equal(real.rooms.UPPER.some(c=>c.id==="ex-u-guard-cell"),false);
 assert.ok(real.rooms.UPPER.length>=12);
 const rope=real.deck.filter(c=>c.id==="rope").length+
  real.heroes[0].inventory.filter(c=>c.id==="rope").length;
 assert.equal(rope,2);
 assert.equal(real.monsters.UPPER.filter(m=>m.id==="rat").length,2);
 const canonical=new ExpeditionState({seed:93,heroes:["warrior"],
  gameMode:"everything-goes"});
 assert.ok(canonical.rooms.UPPER.some(c=>c.id==="ex-u-guard-cell"));
 assert.equal(ALL_ROOMS.find(c=>c.id==="ex-u-guard-cell")?.id,
  "ex-u-guard-cell");
 assert.ok(ALL_OBJECTS.find(c=>c.id==="rope").copies!==2);
});
test("Room executable opcode edits retain original printed catalogue",()=>{
 const original=ALL_ROOMS.find(x=>x.id==="ex-u-guard-cell");
 const staged=make({roomEffects:{
  "ex-u-guard-cell":{choices:[["ROLL_ROOM"],["HEAL:3"]]}
 }});
 assert.deepEqual(staged.roomEffects["ex-u-guard-cell"].choices[1],
  ["HEAL:3"]);
 assert.equal(original.v2.choices[1].label,"WALK AWAY");
 const state=new ExpeditionState({seed:1,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:staged});
 assert.deepEqual(state.cardPools.roomEffects["ex-u-guard-cell"].choices[1],
  ["HEAL:3"]);
});
test("Reject unsafe edits, untracked cards and unplayable room decks",()=>{
 const cases=[
  {cards:[{collection:"monsters",id:"wisp",set:{stage:"UPPER"}}]},
  {cards:[{collection:"rooms",id:"u-passage",set:{copies:9}}]},
  {cards:[{collection:"monsters",id:"wisp",set:{hp:-1}}]},
  {cards:[{collection:"monsters",id:"wisp",set:{hp:0}}]},
  {cards:[{collection:"monsters",id:"unknown",set:{hp:1}}]},
  {roomEffects:{"ex-u-guard-cell":{choices:[["DANGEROUS"] ,["NONE"]]}}},
  {roomDeck:{UPPER:{exclude:["d-bridge"]}}}
 ];
 for(const candidate of cases)
  assert.throws(()=>make(candidate),Error);
 assert.throws(()=>compileStaging({id:"missing-schema"}),/schema/);
});
test("Staging retains exact card aliases across forks and fair deck beliefs",()=>{
 const staged=make({cards:[{
  collection:"monsters",id:"wisp",set:{hp:8}
 },{collection:"items",id:"rope",set:{copies:3}}]});
 const session=createDecisionSession({seed:113,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:staged});
 const real=session.state;
 const fork=forkGameState(real,{fastPiles:true});
 assert.equal(fork.cardPools,staged);
 assert.equal(fork.monsters.MIDDLE.find(x=>x.id==="wisp"),
  real.monsters.MIDDLE.find(x=>x.id==="wisp"));
 const prepared=prepareRolloutDecks(real,"fair");
 assert.ok(prepared.monsters.MIDDLE.pool.some(m=>
  m.id==="wisp"&&m.hp===8));
 assert.equal(prepared.items.length,real.deck.length);
 const size=real.rooms.UPPER.length;
 assert.equal(prepared.rooms.UPPER.remaining,size);
});
test("Staged first search uses same canonical legal interface",{
 timeout:90000
},()=>{
 const staged=compileStaging(SAMPLE);
 const session=createDecisionSession({seed:819,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:staged});
 const legal=sessionActions(session);
 const mcts=searchDecision(session,{budget:2,seed:41,
  knowledge:"fair",treeMode:"frontier",rootActions:legal,
  strictTerminal:true,collectCoverage:false,exploration:0.2,
  implicitWeight:0.5,implicitHeuristicMode:"solo-threat",
  simulationPolicy:"solo-pragmatic-tree",maxSteps:5000});
 assert.ok(legal.some(a=>JSON.stringify(a)===
  JSON.stringify(mcts.recommended)));
});
test("One canonical and staged full solo run preserve printed card globals",{
 timeout:120000
},()=>{
 const staged=compileStaging(SAMPLE);
 const args={hero:"warrior",seed:stageSeed(20261121,0,0),
  arm:"implicit",budget:2,c:0.2,alpha:0.5,
  heuristicMode:"solo-threat",equipmentMode:"solo-pragmatic",
  mctsPragmaticVariant:"tree-only",recordTelemetry:false};
 const before=ALL_MONSTERS.find(x=>x.id==="wisp").hp;
 const a=playFullSoloExpedition(args);
 const b=playFullSoloExpedition({...args,cardPools:staged});
 assert.ok(a.roomsCleared>=0&&b.roomsCleared>=0);
 assert.equal(a.seed,b.seed);
 assert.equal(b.stagingId,"wisp-hp-8");
 assert.equal(a.stagingId,null);
 assert.equal(ALL_MONSTERS.find(x=>x.id==="wisp").hp,before);
});
test("Paired report emits Hero/deck/card comparisons without overwriting canonical",()=>{
 const row=(arm,won)=>({arm,hero:"warrior",replicate:0,
  seed:123,won,vaultReached:0,roomsCleared:2,ordinaryEncounters:1,
  ordinaryFights:1,remainingHp:4,seenRoomIds:["u-passage"],
  finalMetrics:{monsterVisits:{wisp:2},monsterKillsById:{},
   objectAcquisitions:{rope:1},itemUses:{},roomChoices:{"u-passage:0":1}}});
 const report=compareStaging([row("canonical",0),row("staging",1)],{
  revision:"test",stageId:"sample",stageSha256:"abc",
  agentSha256:"def",runsPerHero:1,heroes:["warrior"]});
 assert.equal(report.complete,true);
 assert.equal(report.pairedDelta.won.difference,1);
 assert.equal(report.byHero.warrior.won.difference,1);
 assert.equal(report.byCard.staging.monsterVisits.wisp,2);
 assert.equal(report.byCard.canonical.roomSeen["u-passage"],1);
 assert.equal(parseStagingArgs(["--stage","hello.json",
  "--runs-per-hero","2"]).runsPerHero,2);
});
