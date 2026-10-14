import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {MONSTERS,ROOMS,OBJECTS,HEROES} from "../src/tabletop-data.js";
import {playerAttack,monsterRespond,simulateFullExpedition} from "../src/expedition-campaign.js";
import {ROLL_EFFECTS} from "../src/effect-model.js";
import {expectedAttack} from "../src/decision-planner.js";

const card=id=>OBJECTS.find(o=>o.id===id);
const monster=id=>MONSTERS.find(m=>m.id===id);
function battle(hero,id="rat"){
 const s=new ExpeditionState({seed:827,heroes:[hero],strategy:"magic"});
 s.beginRoom(ROOMS.find(r=>r.id==="u-passage"));
 s.monster=monster(id);s.monsterHP=s.monster.hp;
 const h=s.heroes[0];
 for(const c of [...h.inventory])if(c.id!==h.card.v2.starter)s.remove(h,c);
 return {s,h};
}
function predetermined(s,rolls){
 const remaining=[...rolls];
 s.die=(sides=6)=>{
  assert.ok(remaining.length>0,"Missing deterministic die result");
  const d=remaining.shift();
  assert.ok(d>=1&&d<=sides,"Invalid mocked die result "+d+" on "+sides+" sides");
  return d;
 };
 return ()=>remaining.length;
}
test("Hero cards express new tradeoffs, with exceptional Knight result only on six",()=>{
 const byId=id=>HEROES.find(h=>h.id===id);
 const w=byId("warrior"),k=byId("knight"),z=byId("wizard"),
  priest=byId("priest"),monk=byId("monk");
 assert.equal(w.hp,18);assert.equal(w.atk,4);
 assert.equal(k.v2.roll.outcomes[2].range,"5");
 assert.equal(k.v2.roll.outcomes[3].range,"6");
 assert.match(k.v2.roll.outcomes[3].effect,/Monster's next behaviour is 1–2/);
 assert.doesNotMatch(k.v2.roll.outcomes[2].effect,/next behaviour/i);
 for(const h of [z,priest])
  assert.match(h.v2.roll.outcomes[0].effect,/half.*round up/);
 assert.match(monk.v2.roll.outcomes.at(-1).effect,/Cancel this Monster response/);
 assert.match(monk.v2.roll.outcomes[0].effect,/Lose 2 HP/);
});
test("Knight five cancels a hit and six also controls the next response",()=>{
 for(const face of [5,6]){
  const {s,h}=battle("knight");
  if(h.slots.armour)s.remove(h,h.slots.armour);
  const before=h.hp;
  const remaining=predetermined(s,[3,15,1,4,face]);
  monsterRespond(s,h);
  assert.equal(h.hp,before);
  assert.equal(s.forcedBehavior,face===6?1:0);
  assert.equal(remaining(),0);
  assert.ok(h.used.has("hero"));
 }
});
test("Knight saves INTERCEPT when Warded Shield fully prevents damage",()=>{
 const {s,h}=battle("knight");
 const remaining=predetermined(s,[3,15,1,4,6]);
 monsterRespond(s,h);
 assert.equal(remaining(),0);
 assert.ok(!h.used.has("hero"));
});
test("Wizard and Priest misfire for ceil(d6/2), not full d6",()=>{
 const wizard=battle("wizard"),w=wizard.h;
 const wd=predetermined(wizard.s,[1,6]);
 playerAttack(wizard.s,w);
 assert.equal(w.hp,15);assert.equal(wd(),0);
 const priest=battle("priest"),h=priest.h;
 const pd=predetermined(priest.s,[1,6,1,20]);
 playerAttack(priest.s,h);
 assert.equal(h.hp,17);assert.equal(pd(),0);
});
test("Monk can hold STILLNESS, skip a response on six, and still backfire",()=>{
 const {s,h}=battle("monk");
 h.hp=14;
 let rest=predetermined(s,[1]);
 monsterRespond(s,h);
 assert.equal(rest(),0);assert.ok(!h.used.has("hero"));
 rest=predetermined(s,[5,6]);
 monsterRespond(s,h);
 assert.equal(rest(),0);assert.equal(h.hp,16);
 assert.equal(h.nextDis,0);assert.ok(h.used.has("hero"));
 const second=battle("monk");second.h.hp=14;
 rest=predetermined(second.s,[5,1]);
 monsterRespond(second.s,second.h);
 assert.equal(rest(),0);assert.equal(second.h.hp,12);
 assert.ok(second.h.nextDis>0);
});
test("approved Wand and Jar improvements match their executable outcomes",()=>{
 assert.deepEqual(ROLL_EFFECTS["spore-jar"],[["POISON","NEXT_WIT_DIS"],["FORCE_BEHAVIOR:1"],["SKIP:2"]]);
 assert.ok(ROLL_EFFECTS["wand-morph"][0].includes("HURT:2"));
 assert.ok(ROLL_EFFECTS["wand-frost"][1].includes("SKIP:1"));
 for(const [id,face,skip,damage] of [
  ["spore-jar",4,0,0],["spore-jar",6,2,0],
  ["wand-frost",4,1,0],["wand-morph",1,0,2]]){
  const {s,h}=battle("warrior");
  const object=card(id);s.add(h,object);
  const before=h.hp;
  assert.equal(s.activate(h,object,{face}),true);
  assert.equal(s.monsterSkip,skip,id+" "+face);
  if(id==="spore-jar"&&face===4)
   assert.equal(s.forcedBehavior,1,"Spore Jar confusion forces behaviour 1-2");
  assert.equal(before-h.hp,damage,id+" "+face);
  if(id==="wand-morph"){
   assert.ok(h.inventory.includes(object));
   assert.ok(s.exhausted.has(object));
  }
 }
});
test("new balances retain deterministic, finite full expeditions",()=>{
 for(const heroes of [["warrior"],["knight"],["wizard"],["priest"],["monk"],
  ["warrior","knight"],["wizard","monk"]]){
  const opts={seed:527,heroes,strategy:"magic",researchPolicy:"planner",plannerRisk:"cautious"};
  const a=simulateFullExpedition(opts),b=simulateFullExpedition(opts);
  assert.deepEqual(a,b);assert.equal(a.unresolved,0);assert.equal(a.roundLimit,false);
 }
 const {s,h}=battle("warrior");
 assert.equal(s.stats(h).atk,6);
 const {s:wizard,h:magicHero}=battle("wizard");
 assert.ok(Math.abs(expectedAttack(wizard,magicHero).backfire-2/3)<1e-9);
});
