import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {canonicalStagingCatalogue,compileStaging}
 from "../src/staging/catalogue.js";
import {monsterStatFactorialHypotheses,FACTORIAL_HP,
 FACTORIAL_ATK,FACTORIAL_ENCOUNTERS,statFactorialCell,
 statFactorialId,chooseStatFactorialFinalists}
 from "../src/staging/monster-stat-factorial-hypotheses.js";
import {statFactorialAnalysis}
 from "../src/staging/monster-stat-factorial-analysis.js";
import {scaledMonsterHp}
 from "../src/staging/monster-hp-ratio-hypotheses.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {balanceStudyArgs} from "../scripts/study-balance-hypotheses.mjs";

const canonical=canonicalStagingCatalogue();
const arms=monsterStatFactorialHypotheses();
const lookup=Object.fromEntries(arms.map(x=>[x.id,x]));
const pool=id=>compileStaging(lookup[id]);

test("4x3x3 complete factorial minus one shared canonical baseline",()=>{
 assert.equal(FACTORIAL_HP.length,4);
 assert.deepEqual(FACTORIAL_ATK,[0,1,2]);
 assert.deepEqual(FACTORIAL_ENCOUNTERS,["canonical","mild","strong"]);
 assert.equal(arms.length,35);
 assert.equal(new Set(arms.map(x=>x.id)).size,35);
 assert.ok(!lookup[statFactorialId("full",0,"canonical")]);
 assert.deepEqual(statFactorialCell("canonical"),
  {hp:"full",atk:0,context:"canonical"});
 for(const hp of FACTORIAL_HP)
  for(const atk of FACTORIAL_ATK)
   for(const context of FACTORIAL_ENCOUNTERS){
    const id=statFactorialId(hp.id,atk,context);
    assert.deepEqual(statFactorialCell(id),{hp:hp.id,atk,context});
    if(hp.id==="full"&&atk===0&&context==="canonical")continue;
    assert.ok(lookup[id],id);
   }
});

test("Every Monster is changed exactly as required and no other printed stats move",()=>{
 const previous=JSON.stringify(canonical.monsters);
 const roomPrevious=JSON.stringify(ROOM_EFFECTS);
 for(const spec of arms){
  const {hp:hpName,atk,context}=statFactorialCell(spec.id);
  const ratio=FACTORIAL_HP.find(x=>x.id===hpName);
  const staged=compileStaging(spec);
  assert.equal(staged.monsters.length,canonical.monsters.length);
  assert.equal(staged.warden.hp,canonical.warden.hp);
  assert.equal(staged.wardenFury.hp,canonical.wardenFury.hp);
  assert.deepEqual(staged.mechanics,{});
  assert.deepEqual(staged.items.map(x=>x.id),canonical.items.map(x=>x.id));
  assert.deepEqual(staged.rooms.map(x=>x.id),canonical.rooms.map(x=>x.id));
  for(const original of canonical.monsters){
   const modified=staged.monsters.find(x=>x.id===original.id);
   assert.equal(modified.hp,scaledMonsterHp(original.hp,
    ratio.numerator,ratio.denominator),spec.id+":"+original.id+":hp");
   assert.equal(modified.atk,Math.max(0,original.atk-atk),
    spec.id+":"+original.id+":atk");
   assert.equal(modified.def,original.def);
   assert.equal(modified.copies,original.copies);
   assert.deepEqual(modified.behavior,original.behavior);
   assert.deepEqual(modified.v2,original.v2);
  }
  assert.equal(Object.keys(staged.roomEffects).length===0,
   context==="canonical");
  if(context!=="canonical")
   assert.ok(Object.entries(staged.roomEffects).some(([id,fx])=>
    fx.outcomes.some((band,i)=>band.length>
     ROOM_EFFECTS[id].outcomes[i].length)));
 }
 assert.equal(JSON.stringify(canonical.monsters),previous);
 assert.equal(JSON.stringify(ROOM_EFFECTS),roomPrevious);
});

test("Actual expedition regional Monster draw and pile refill use both altered HP and ATK",()=>{
 const p=pool(statFactorialId("two-thirds",2,"strong"));
 const s=new ExpeditionState({seed:329,heroes:["warrior"],
  gameMode:"everything-goes",cardPools:p});
 s.beginRoom(s.rooms.UPPER[0]);
 for(const region of ["UPPER","MIDDLE","DEEP"]){
  s.monsters[region]=[];
  const monster=s.nextMonster(region);
  const original=canonical.monsters.find(x=>x.id===monster.id);
  assert.ok(original);
  assert.equal(monster.hp,scaledMonsterHp(original.hp,2,3));
  assert.equal(monster.atk,Math.max(0,original.atk-2));
 }
});

test("Main-effect controls and actual crossed HP+ATK interactions survive screening selection",()=>{
 const ranked=arms.map((spec,i)=>({id:spec.id,score:arms.length-i}));
 const chosen=chooseStatFactorialFinalists(ranked,9,arms).map(r=>r.id);
 assert.equal(chosen.length,9);
 for(const hp of FACTORIAL_HP.filter(x=>x.id!=="full"))
  assert.ok(chosen.includes(statFactorialId(hp.id,0,"canonical")));
 for(const atk of [1,2])
  assert.ok(chosen.includes(statFactorialId("full",atk,"canonical")));
 for(const context of FACTORIAL_ENCOUNTERS)
  assert.ok(chosen.some(id=>{
   const cell=statFactorialCell(id);
   return cell.context===context&&cell.hp!=="full"&&cell.atk>0;
  }));
});

test("Synthetic matched 2x2 factorial measures only the true interaction",()=>{
 const ids=["canonical",statFactorialId("half",0,"canonical"),
  statFactorialId("full",1,"canonical"),
  statFactorialId("half",1,"canonical")];
 const rows=[];
 for(const [replicate,score] of [[0,0],[1,1]]){
  for(const [i,id] of ids.entries()){
   const outcome=score+i+(i===3?2:0);
   rows.push({variant:id,hero:"warrior",replicate,
    won:outcome,vaultReached:outcome,roomsCleared:30,
    ordinaryEncounters:5,ordinaryFights:3,combatContextDamage:10});
  }
 }
 const x=statFactorialAnalysis(rows).contexts.canonical;
 const hp=x.hpMain.find(y=>y.hp==="half");
 const atk=x.atkMain.find(y=>y.atk===1);
 const crossed=x.interactions.find(y=>y.hp==="half"&&y.atk===1);
 assert.equal(hp.n,2);assert.equal(hp.differences.won,1);
 assert.equal(atk.differences.won,2);
 assert.equal(crossed.n,2);
 assert.equal(crossed.differences.won,2);
 assert.equal(x.grid.find(z=>z.id==="canonical").n,2);
});

test("Dry-run plans 35 treatments, shared canonical and reserved 9-arm confirmation",()=>{
 assert.equal(balanceStudyArgs(["--suite","stat-factorial"]).suite,"stat-factorial");
 const run=spawnSync(process.execPath,[
  new URL("../scripts/study-balance-hypotheses.mjs",import.meta.url).pathname,
  "--dry-run","--suite","stat-factorial","--workers","8",
  "--screen-repeats","8","--confirm-repeats","24",
  "--finalists","9"
 ],{encoding:"utf8"});
 assert.equal(run.status,0,run.stderr);
 const info=JSON.parse(run.stdout);
 assert.equal(info.hypotheses.length,35);
 assert.equal(info.screenTrials,2304);
 assert.equal(info.confirmTrials,1920);
 assert.equal(info.physicallyCanonicalCardsChanged,false);
});
