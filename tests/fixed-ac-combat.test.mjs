import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {playerAttack,monsterRespond,combatAC,attackHits}
 from "../src/engine/combat.js";
import {MONSTERS,ROOMS} from "../src/tabletop-data.js";

const rat=MONSTERS.find(m=>m.id==="rat");
const room=ROOMS.find(r=>r.id==="u-nest");
function battle(heroes=["thief"],monster=rat){
 const s=new ExpeditionState({seed:20261016,heroes});
 s.room=room;s.monster=monster;s.monsterHP=monster.hp;
 return {s,h:s.heroes[0]};
}
const hitFace=s=>combatAC(s.stats(s.heroes[0]).def)-s.monster.atk;
function dice(s,faces){
 const remaining=[...faces];let d20=0;
 s.die=sides=>{
  if(sides===20){
   d20++;
   if(!remaining.length)throw Error("Unexpected extra d20 in combat");
   return remaining.shift();
  }
  return 3;
 };
 return ()=>({d20,remaining:[...remaining]});
}
test("fixed AC equals 12 + DEF with hit on equality and natural exceptions",()=>{
 assert.equal(combatAC(0),12);
 assert.equal(combatAC(4),16);
 assert.equal(attackHits(9,13,1),true);
 assert.equal(attackHits(8,12,1),false);
 assert.equal(attackHits(1,100,1),false);
 assert.equal(attackHits(20,20,20),true);
});
test("Hero attack hits on equality, rolls no Monster defence die",()=>{
 const {s,h}=battle();const used=dice(s,[9]);
 playerAttack(s,h);
 assert.equal(s.monsterHP,rat.hp-3);
 assert.deepEqual(used(),{d20:1,remaining:[]});
});
test("Hero natural 1 misses with bonuses; natural 20 adds a damage d6",()=>{
 const miss=battle();miss.h.nextAtk=99;
 const missed=dice(miss.s,[1]);
 playerAttack(miss.s,miss.h);
 assert.equal(miss.s.monsterHP,rat.hp);
 assert.equal(missed().d20,1);
 const critical=battle();const sampled=dice(critical.s,[20]);
 playerAttack(critical.s,critical.h);
 assert.equal(critical.s.monsterHP,rat.hp-6);
 assert.equal(sampled().d20,1);
});
test("Monster attack uses one d20 versus Hero AC, not an opposed roll",()=>{
 const hit=battle();const roll=dice(hit.s,[hitFace(hit.s)]);
 hit.s.forcedBehavior=3;
 monsterRespond(hit.s,hit.h);
 assert.equal(hit.h.hp,hit.h.card.hp-3);
 assert.equal(roll().d20,1);
 const miss=battle();const missRoll=dice(miss.s,[hitFace(miss.s)-1]);
 miss.s.forcedBehavior=3;monsterRespond(miss.s,miss.h);
 assert.equal(miss.h.hp,miss.h.card.hp);
 assert.equal(missRoll().d20,1);
});
test("defensive ADV/DIS affects Monster attack dice and cancels when both exist",()=>{
 const better=battle();better.h.nextDefenseAdv=true;
 let roll=dice(better.s,[18,2]);better.s.forcedBehavior=3;
 monsterRespond(better.s,better.h);
 assert.equal(better.h.hp,better.h.card.hp);
 assert.equal(roll().d20,2);
 assert.equal(better.h.nextDefenseAdv,false);

 const worse=battle();worse.h.nextDefenseDis=1;
 roll=dice(worse.s,[2,18]);worse.s.forcedBehavior=3;
 monsterRespond(worse.s,worse.h);
 assert.equal(worse.h.hp,worse.h.card.hp-3);
 assert.equal(roll().d20,2);
 assert.equal(worse.h.nextDefenseDis,0);

 const cancel=battle();cancel.h.nextDefenseAdv=true;
 cancel.h.nextDefenseDis=1;
 roll=dice(cancel.s,[hitFace(cancel.s)]);cancel.s.forcedBehavior=3;
 monsterRespond(cancel.s,cancel.h);
 assert.equal(cancel.h.hp,cancel.h.card.hp-3);
 assert.equal(roll().d20,1);
});
test("Burial Mail natural-20 penalty adds 2 damage, never a defender natural-1 roll",()=>{
 const {s,h}=battle();
 const index=s.deck.findIndex(c=>c.id==="cursed-mail");
 assert.ok(index>=0,"A physical Burial Mail copy must be present");
 const [mail]=s.deck.splice(index,1);
 s.noteDeckRemoval(mail);s.add(h,mail);
 assert.equal(h.slots.armour,mail);
 const roll=dice(s,[20]);s.forcedBehavior=3;
 monsterRespond(s,h);
 assert.equal(h.hp,h.card.hp-8,
  "Normal 3 damage + critical 3 damage + printed Burial Mail 2");
 assert.equal(roll().d20,1);
});
test("Priest cannot bless a Monster's d20, but can bless Hero attack rolls",()=>{
 const defending=battle(["priest"]);
 const h=defending.h;
 let defBless=0;
 defending.s._decisionHook=event=>{
  if(event.phase==="hero-trigger"){defBless++;throw Error(
   "Priest was offered during a Monster d20");}
  throw Error("Unexpected reaction "+JSON.stringify(event));
 };
 defending.s.forcedBehavior=3;
 dice(defending.s,[14]); // Priest DEF 4, AC 16; rat ATK +2
 monsterRespond(defending.s,h);
 assert.equal(defBless,0);
 delete defending.s._decisionHook;

 const attacking=battle(["priest"]);
 const roll=dice(attacking.s,[12]);
 // The normal default Priest decision is a printed Hero d20 ability.
 // Explicitly declining it prevents an additional Blessing die.
 attacking.s._decisionHook=event=>{
  if(event.phase==="hero-trigger"&&event.context==="before-d20")
   return {kind:"skip"};
  throw Error("Unexpected Priest attack reaction "+JSON.stringify(event));
 };
 playerAttack(attacking.s,attacking.h);
 assert.equal(attacking.s.monsterHP,rat.hp-3);
 assert.equal(roll().d20,1);
 delete attacking.s._decisionHook;
});
test("Room opposed d20 checks are unchanged by fixed combat AC",()=>{
 const {s,h}=battle();
 // An actual printed opposed CHECK_ATK still rolls two d20s.
 const roll=dice(s,[9,5]);
 s.roomCheck("CHECK_ATK",3,"NONE","NONE");
 assert.equal(h.hp,h.card.hp);
 assert.equal(roll().d20,2);
});

test("DEF bonuses raise AC while a printed DEF penalty lowers it",()=>{
 const protectedHero=battle();protectedHero.h.nextDefenseBonus=2;
 const high=dice(protectedHero.s,[14]);
 protectedHero.s.forcedBehavior=3;
 monsterRespond(protectedHero.s,protectedHero.h);
 assert.equal(protectedHero.h.hp,protectedHero.h.card.hp);
 assert.equal(high().d20,1);

 const penalized=battle();penalized.h.nextDefensePenalty=2;
 const low=dice(penalized.s,[hitFace(penalized.s)-2]);
 penalized.s.forcedBehavior=3;
 monsterRespond(penalized.s,penalized.h);
 assert.equal(penalized.h.hp,penalized.h.card.hp-3);
 assert.equal(low().d20,1);
 assert.equal(penalized.h.nextDefensePenalty,0);
});
test("a retained Monster-defence DIS grants Hero attack ADV rather than rolling defence",()=>{
 const {s,h}=battle();
 s.monsterDefenseDis=true;
 const roll=dice(s,[2,18]);
 playerAttack(s,h);
 assert.equal(s.monsterHP,rat.hp-3);
 assert.equal(roll().d20,2);
 assert.equal(s.monsterDefenseDis,false);
});
test("Monster natural 1 misses even with a large attack bonus",()=>{
 const {s,h}=battle();
 const monster={...rat,atk:99};
 s.monster=monster;s.monsterHP=monster.hp;
 s.forcedBehavior=3;
 const roll=dice(s,[1]);
 monsterRespond(s,h);
 assert.equal(h.hp,h.card.hp);
 assert.equal(roll().d20,1);
});
