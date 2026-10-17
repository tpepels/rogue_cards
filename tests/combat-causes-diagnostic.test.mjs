import test from "node:test";
import assert from "node:assert/strict";
import {MONSTERS} from "../src/tabletop-data.js";
import {combatAC,attackHits} from "../src/engine/combat.js";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {makeEncounter} from "../scripts/study-combat-causes.mjs";

test("combat diagnostic constructs a canonical actionable encounter",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior","knight"],120);
 assert.equal(session.phase,"combat-hero");
 assert.equal(session.state.monster,rat);
 assert.equal(session.state.monsterHP,rat.hp);
 assert.ok(sessionActions(session).some(a=>a.kind==="choose-hero-turn"));
 const action=sessionActions(session)[0];
 submitDecision(session,action,{observeResult:false,recordHistory:false});
 assert.equal(session.phase,"combat");
 assert.ok(sessionActions(session).some(a=>a.kind==="attack"));
});

test("new equipment changes canonical stats and fixed AC",()=>{
 const rat=MONSTERS.find(m=>m.id==="rat");
 const session=makeEncounter(rat,["warrior"],121);
 const s=session.state,h=s.heroes[0];
 h.slots.weapon=null;h.slots.armour=null;
 const baseAtk=s.stats(h).atk,baseDef=s.stats(h).def;
 const cases=[
  ["ex-dagger","weapon",1],["ex-mace","weapon",2],
  ["ex-spear","weapon",2],["odd-trick-knife","weapon",1],
  ["ex-jerkin","armour",1],["ex-helm","armour",1],
  ["ex-buckler","armour",2]
 ];
 for(const [id,slot,bonus] of cases){
  const card=s.deck.find(c=>c.id===id);
  assert.ok(card,"Missing physical Item "+id);
  h.slots.weapon=null;h.slots.armour=null;
  h.inventory.push(card);
  h.slots[slot]=card;
  const stats=s.stats(h);
  assert.equal(stats[slot==="weapon"?"atk":"def"],
   (slot==="weapon"?baseAtk:baseDef)+bonus,id);
  if(slot==="armour")assert.equal(combatAC(stats.def),12+baseDef+bonus);
 }
 assert.equal(attackHits(1,100,4),false);
 assert.equal(attackHits(20,20,20),true);
});
