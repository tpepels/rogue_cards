import test from "node:test";
import assert from "node:assert/strict";
import {OBJECTS,MONSTERS} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {playerAttack} from "../src/expedition-campaign.js";
import {forecastCombat} from "../src/decision-planner.js";
import {NON_ROLL_EFFECTS} from "../src/effect-model.js";

const staff=OBJECTS.find(c=>c.id==="staff");
function scenario({equipped=false,carried=false,miss=false}={}){
 const state=new ExpeditionState({seed:827,heroes:["knight"],strategy:"survival"});
 const hero=state.heroes[0];
 hero.slots={};hero.inventory=[];
 if(equipped)hero.slots.weapon=staff;
 if(equipped||carried)hero.inventory.push(staff);
 state.monster=MONSTERS.find(c=>c.id==="rat");
 state.monsterHP=20;
 let rolls=0;
 // Fixed successful normal attack, no critical. A miss gives natural 1.
 state.die=(sides=6)=>sides===20?(++rolls%2?(miss?1:18):4):3;
 return {state,hero};
}
test("Ashwood Staff has a legible, available passive effect, not an inert WIT spell",()=>{
 assert.ok(staff);
 assert.equal(NON_ROLL_EFFECTS.staff,"WEAPON_BASIC_HIT");
 assert.match(staff.v2.trigger,/WEAPON: \+1 ATK/);
 assert.match(staff.v2.trigger,/d20 \+ ATK attack hits, deal \+1 damage/);
 assert.doesNotMatch(staff.v2.trigger,/spell|WIT/);
 assert.ok(staff.v2.alternative.includes("At a SHRINE"));
});
test("Staff gives exactly +1 damage on a successful equipped basic d20 attack",()=>{
 function attack(options){
  const {state,hero}=scenario(options);
  const atk=state.stats(hero).atk,activationsBefore=state.metrics.activated;
  playerAttack(state,hero);
  return {damage:20-state.monsterHP,atk,activations:state.metrics.activated-activationsBefore};
 }
 const plain=attack(),carried=attack({carried:true}),equipped=attack({equipped:true}),
  miss=attack({equipped:true,miss:true});
 assert.equal(plain.damage,3);
 assert.equal(carried.damage,3,"Carrying does not grant weapon effects");
 assert.equal(equipped.damage,4,"The Staff adds 1 to a successful ordinary attack");
 assert.equal(equipped.atk,plain.atk+1);
 assert.equal(equipped.activations,0,"Equipped Staff is passive, not an action");
 assert.equal(miss.damage,0,"A missed d20 attack never gets bonus damage");
});
test("Staff bonus does not enhance Scroll damage or other non-attack effects",()=>{
 const {state,hero}=scenario({equipped:true});
 const before=state.monsterHP;
 state.setActor(hero);
 state.apply("DAMAGE",["3"],null);
 assert.equal(before-state.monsterHP,3);
 assert.equal(state.basicAttackBonus(hero),1);
 hero.slots.weapon=null;
 assert.equal(state.basicAttackBonus(hero),0);
});
test("Risk planner accounts for additional Staff damage",()=>{
 const {state,hero}=scenario();
 const baseline=forecastCombat(state);
 hero.slots.weapon=staff;
 const equipped=forecastCombat(state);
 assert.ok(equipped.heroDamage>baseline.heroDamage);
});
test("Crowbar names exactly the locked Rooms, with no undefined trading exception",()=>{
 const crowbar=OBJECTS.find(x=>x.id==="crowbar");
 assert.ok(crowbar.v2.trigger.startsWith("LOCK: "));
 for(const name of ["Rusty Gate","Chest with a Pulse","Buried Lockbox","The Last Chest"])
  assert.ok(crowbar.v2.trigger.includes(name),name);
 assert.equal(crowbar.v2.alternative,"");
});
