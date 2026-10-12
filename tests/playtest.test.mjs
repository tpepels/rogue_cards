import test from "node:test";
import assert from "node:assert/strict";
import {HEROES,ROOMS,MONSTERS,OBJECTS,WARDEN,WARDEN_FURY,VAULT} from "../src/tabletop-data.js";
import {
 MODEL_VERSION,MONSTER_IDS,randomSource,outcome,d20Attack,opposedWit,
 simulateExpedition,simulateBatch,effectiveStats
} from "../src/playtest.js";

test("seeded die generator and full printed d6 intervals are deterministic",()=>{
 const a=randomSource(2026),b=randomSource(2026);
 assert.deepEqual(Array.from({length:200},()=>a.die(20)),Array.from({length:200},()=>b.die(20)));
 for(const room of [...ROOMS,VAULT]){
  for(let n=1;n<=6;n++){
   const row=outcome(room.v2.roll.outcomes,n);
   assert.ok(row.effect,room.id+" / "+n);
  }
 }
 for(const card of OBJECTS.filter(c=>c.v2.roll)){
  for(let n=1;n<=6;n++)assert.ok(outcome(card.v2.roll.outcomes,n).effect);
 }
});
test("attacker natural 1 always misses; natural 20 always hits with bonus damage flag",()=>{
 const fake=values=>({die:()=>{if(!values.length)throw Error("out of dice");return values.shift();}});
 const missed=d20Attack(fake([1,1]),+100,0);
 assert.equal(missed.hit,false);
 const critical=d20Attack(fake([20,20]),0,+100);
 assert.equal(critical.hit,true);assert.equal(critical.critical,true);
 const tie=d20Attack(fake([10,10]),3,3);
 assert.equal(tie.hit,false);
});
test("opposed seal check never ignores critical WIT d20 values",()=>{
 const fake=values=>({die:()=>values.shift()});
 assert.equal(opposedWit(fake([1,1]),99,0),false);
 assert.equal(opposedWit(fake([20,20]),0,99),true);
 assert.equal(opposedWit(fake([10,10]),6,6),false);
});
test("every Monster and Warden behaviour is accounted for by the model",()=>{
 assert.deepEqual(MONSTER_IDS,[...MONSTERS.map(m=>m.id),WARDEN.id,WARDEN_FURY.id]);
 for(const m of [...MONSTERS,WARDEN,WARDEN_FURY])assert.equal(m.behavior.length,4,m.id);
});
test("equipment modifiers use printed physical items, not synthetic bonuses",()=>{
 const sword=OBJECTS.find(o=>o.id==="sword"),mail=OBJECTS.find(o=>o.id==="mail");
 const warrior=HEROES.find(h=>h.id==="warrior");
 const result=effectiveStats({card:warrior,items:[sword,mail]});
 assert.equal(result.atk,warrior.atk+2);
 assert.equal(result.def,warrior.def+2);
});
test("every Hero can complete a deterministic nine-room expedition without unbounded loops",()=>{
 for(const h of HEROES){
  for(let seed=1;seed<=50;seed++){
   const a=simulateExpedition({seed,heroes:[h.id]});
   const b=simulateExpedition({seed,heroes:[h.id]});
   assert.deepEqual(a,b,h.id+" "+seed);
   assert.ok(a.cleared>=0&&a.cleared<=9);
   assert.ok(a.battles>=0&&a.rounds>=0);
   assert.equal(a.roundLimit,false,h.id+" "+seed);
   assert.ok(a.itemsDrawn>=1&&a.itemsSpent>=0);
   if(a.won)assert.equal(a.cleared,9);
   if(a.sealWin)assert.equal(a.sealAttempt,true);
  }
 }
});
test("cooperative expeditions never exceed nine regional Rooms or double-grant the Warden victory",()=>{
 const combos=[["warrior","priest"],["knight","wizard"],["rogue","witch"],["thief","monk"]];
 for(const heroes of combos){
  for(let seed=1;seed<=70;seed++){
   const a=simulateExpedition({seed,heroes,bossChoice:"seal"});
   assert.ok(a.cleared<=9);
   assert.equal(a.roundLimit,false);
   assert.ok(a.remainingHP.length===2);
   assert.ok(a.remainingHP.every(x=>x>=0));
   if(a.sealWin){assert.equal(a.won,true);assert.equal(a.cleared,9);}
  }
 }
});
test("limited magic policy casts real printed Scrolls and Wands without exhausting the same Wand twice",()=>{
 const a=simulateBatch({runs:350,seed:12,heroes:["witch","wizard"],policy:"magic"});
 const b=simulateBatch({runs:350,seed:12,heroes:["witch","wizard"],policy:"magic"});
 assert.deepEqual(a,b);
 assert.ok(a.meanMagicActions>0.05,"Expected actual spell uses from shuffled decks");
 assert.equal(a.roundLimits,0);
 assert.ok(a.meanUnmodeledEffects>0,"Unimplemented effects must remain visible");
 console.log("PHASE5 MAGIC POLICY (PARTIAL):",JSON.stringify(a));
});
test("batch measurements are deterministic, numerical and explicitly report model omissions",()=>{
 const a=simulateBatch({runs:300,seed:402,heroes:["wizard","knight"]});
 const b=simulateBatch({runs:300,seed:402,heroes:["wizard","knight"]});
 assert.deepEqual(a,b);
 assert.equal(a.model,MODEL_VERSION);
 for(const field of ["winRate","deepRate","vaultRate","sealAvailabilityRate","sealSuccessRate"]){
  assert.ok(a[field]>=0&&a[field]<=1,field+": "+a[field]);
 }
 assert.ok(a.meanUnmodeledEffects>0,"Incomplete interaction coverage must be visible");
 assert.equal(a.roundLimits,0);
 console.log("PHASE5 BASELINE (NOT COMPLETE RULES):",JSON.stringify(a));
});
