import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createGame,observeGame,enterNextRoom,legalRoomChoices,
 chooseRoom,finishCurrentRoom,legalCombatActions,takeCombatAction,
 takeMonsterResponse,randomSource,d6Band,playerAttack,monsterRespond}
 from "../src/engine/index.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {randomSource as legacyRandomSource}
 from "../src/playtest.js";
import {ROOMS,OBJECTS} from "../src/tabletop-data.js";
import {simulateFullExpedition,
 playerAttack as simulationPlayerAttack,
 monsterRespond as simulationMonsterRespond}
 from "../src/expedition-campaign.js";

const folder=fileURLToPath(new URL("../src/engine/",import.meta.url));
test("Engine imports no experiments, optimizer, Node API, browser or rendering",()=>{
 const files=readdirSync(folder).filter(f=>f.endsWith(".js"));
 assert.ok(files.includes("expedition-state.js"));
 assert.ok(files.includes("combat.js"));
 for(const file of files){
  const content=readFileSync(join(folder,file),"utf8");
  const imports=[...content.matchAll(/(?:^|\n)import\s+(?:.|\n)*?\sfrom\s+["']([^"']+)["']/g)]
   .map(m=>m[1]);
  for(const importPath of imports)
   assert.doesNotMatch(importPath,
    /playtest|experiment|study|research-agent|decision-planner|rollout|node:|\.\/web|\.\/ui/,
    file+" must be engine-only, found "+importPath);
 }
});
test("Stable engine exports and legacy compatibility paths have identical identity",()=>{
 assert.strictEqual(ExpeditionState,createGame({seed:1900}).constructor);
 assert.strictEqual(playerAttack,simulationPlayerAttack);
 assert.strictEqual(monsterRespond,simulationMonsterRespond);
 for(const seed of [0,1,91238,0xffffffff]){
  const a=randomSource(seed),b=legacyRandomSource(seed);
  for(let i=0;i<64;i++){
   assert.equal(a.die(6),b.die(6));
   assert.equal(a.die(20),b.die(20));
  }
 }
});
test("Every canonical printed die face resolves exactly one indexed outcome",()=>{
 for(const card of [...ROOMS,...OBJECTS].filter(c=>!!c.v2.roll)){
  for(let face=1;face<=6;face++){
   const n=d6Band(card,face);
   assert.ok(n>=0&&n<card.v2.roll.outcomes.length,card.id+" "+face);
   const printed=card.v2.roll.outcomes[n].range.split("–").map(Number);
   assert.ok(face>=printed[0]&&face<=(printed[1]??printed[0]));
  }
 }
 const first=ROOMS.find(c=>c.v2.fate);
 assert.throws(()=>d6Band(first,1),/No d6/);
});
test("Public snapshot contains no RNG or future hidden Room / Item identities",()=>{
 const s=createGame({seed:47112,heroes:["warrior","wizard"]});
 const p=observeGame(s);
 assert.equal(p.phase,"between-rooms");
 assert.equal(p.heroes.length,2);
 assert.throws(()=>createGame({seed:1,researchPolicy:"agent"}),/Unknown public game option/);
 assert.throws(()=>createGame({seed:1,extraObjectId:"sword"}),/Unknown public game option/);
 assert.equal(p.inventoryDeckRemaining,s.deck.length);
 assert.ok(!("rng" in p));
 assert.ok(!("deck" in p));
 assert.ok(!("monsters" in p));
 assert.ok(!("rooms" in p));
 assert.ok(!JSON.stringify(p).includes(s.deck[s.deck.length-1]?.id));
 assert.equal(JSON.stringify(JSON.parse(JSON.stringify(p))),JSON.stringify(p));
});
test("Room action commands use live printed effects and enforce legal choices",()=>{
 const a=createGame({seed:54321,heroes:["warrior"]});
 const b=createGame({seed:54321,heroes:["warrior"]});
 assert.deepEqual(enterNextRoom(a),enterNextRoom(b));
 assert.throws(()=>enterNextRoom(a),/Finish/);
 const options=legalRoomChoices(a);
 assert.deepEqual(options,legalRoomChoices(b));
 if(options.length){
  const choice=options[0];
  assert.deepEqual(chooseRoom(a,choice),chooseRoom(b,choice));
  assert.throws(()=>chooseRoom(a,3),/Illegal/);
  if(!a.monster&&a.monsterQueue.length===0){
   const after=finishCurrentRoom(a);
   assert.equal(after.phase,"between-rooms");
   assert.equal(a.room,null);
  }
 }
});
test("Combat action matches extracted engine combat and legacy adapter",()=>{
 const a=createGame({seed:12199,heroes:["warrior"]});
 const b=createGame({seed:12199,heroes:["warrior"]});
 const monster={id:"rat",title:"Rat",hp:5,atk:1,def:1,v2:{tags:[]},stage:"UPPER"};
 a.monster=monster;b.monster=monster;
 a.monsterHP=5;b.monsterHP=5;
 assert.ok(legalCombatActions(a,0).some(x=>x.kind==="attack"));
 takeCombatAction(a,{kind:"attack",heroIndex:0});
 playerAttack(b,b.heroes[0]);
 assert.equal(a.monsterHP,b.monsterHP);
 assert.equal(a.heroes[0].hp,b.heroes[0].hp);
 assert.throws(()=>takeCombatAction(a,{kind:"item",heroIndex:0,
  optionIndex:900}),/Illegal/);
 if(a.monsterHP>0){
  const response=takeMonsterResponse(a,0);
  monsterRespond(b,b.heroes[0]);
  assert.equal(response.heroes[0].hp,b.heroes[0].hp);
 }
});
test("Full research simulation still executes complete expeditions after engine extraction",()=>{
 const config={seed:3219981,heroes:["knight","wizard"],strategy:"magic"};
 const a=simulateFullExpedition(config);
 const b=simulateFullExpedition(config);
 assert.deepEqual(a,b);
 assert.equal(a.unresolved,0);
 assert.equal(a.roundLimit,false);
});

test("shared-scenario speed benchmark checks output equivalence before timing",()=>{
 const p=spawnSync(process.execPath,[
  "scripts/benchmark-rollout-scenarios.mjs",
  "--samples","20","--choices","3"
 ],{encoding:"utf8",maxBuffer:4*1024*1024});
 assert.equal(p.status,0,p.stderr+"\n"+p.stdout.slice(0,3000));
 const json=JSON.parse(p.stdout);
 assert.equal(json.checksumsMatch,true);
 assert.equal(json.samples,20);
 assert.equal(json.choices,3);
 assert.equal(json.measurements.length,2);
 for(const metric of json.measurements){
  assert.ok(metric.medianMs>0);
  assert.equal(metric.runs.length,5);
 }
});
