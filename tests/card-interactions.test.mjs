/**
 * Exhaustive CROSS-FAMILY PAIR coverage, not exhaustive combinations of
 * 111 cards (which would be astronomically large). Full printed die-face
 * coverage lives in expedition-full.test.mjs.
 *
 * This tests every valid Object pair, Object x regional Room, Object x
 * Monster (including Warden phases), Hero x Object, and all metadata links.
 * These are engine safety / deterministic dispatch checks, not proofs that
 * every possible strategic interaction is balanced.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {HEROES,ROOMS,VAULT,OBJECTS,MONSTERS,WARDEN,WARDEN_FURY} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";

const ALL_MONSTERS=[...MONSTERS,WARDEN,WARDEN_FURY];
const ALL_ROOMS=[...ROOMS,VAULT];
const pairs=(a)=>a.flatMap((x,i)=>a.slice(i+1).map(y=>[x,y]));
const pairwiseObjectPairs=pairs(OBJECTS);
const feed=(s,h)=>{const item=OBJECTS.find(o=>o.id==="smoky");
 for(let n=0;n<8;n++)s.add(h,item);};
function activate(s,h,o,face=4){
 if(!o.v2.roll||!h.inventory.includes(o))return;
 s.activate(h,o,{face});
}
function finiteState(s,label){
 assert.equal(s.metrics.unresolved,0,label);
 assert.ok(s.heroes.every(h=>Number.isFinite(h.hp)&&h.hp>=0&&h.hp<=h.card.hp),label);
 assert.ok(Number.isFinite(s.monsterHP),label);
 assert.ok(Number.isFinite(s.metrics.damage),label);
}

test("every unordered Object pair coexists and resolves triggered effects",()=>{
 assert.equal(pairwiseObjectPairs.length,OBJECTS.length*(OBJECTS.length-1)/2);
 for(const [i,[a,b]] of pairwiseObjectPairs.entries()){
  const s=new ExpeditionState({seed:1911+i,heroes:["wizard","knight"],strategy:"magic"});
  s.beginRoom(ROOMS[i%ROOMS.length]);
  const h=s.heroes[0];feed(s,h);s.add(h,a);s.add(h,b);
  const m=MONSTERS[i%MONSTERS.length];s.monster=m;s.monsterHP=m.hp;
  activate(s,h,a,4);activate(s,h,b,4);
  finiteState(s,a.id+" + "+b.id);
  assert.ok(Number.isFinite(s.stats(h).atk)&&Number.isFinite(s.stats(h).def));
 }
});

test("every Object can coexist with every regional Room and its choices",()=>{
 let scenarios=0;
 for(const [i,room] of ROOMS.entries())for(const [j,o] of OBJECTS.entries()){
  for(const option of [0,1]){
   const s=new ExpeditionState({seed:3091+i*61+j*17+option,
    heroes:["warrior","priest"],strategy:"magic"});
   s.beginRoom(room);const h=s.heroes[0];feed(s,h);s.add(h,o);
   s.setActor(h);
   activate(s,h,o,4);
   for(const op of ROOM_EFFECTS[room.id].choices[option]){
    const [kind,...args]=op.split(":");s.apply(kind,args,room);
   }
   // Test one printed d6 value in the context of this Item. Full d6
   // coverage for all Rooms remains a separate dedicated exhaustive test.
   s.roomRoll(1+((j+option)%6));
   finiteState(s,o.id+" / "+room.id+" / "+option);
   scenarios++;
  }
 }
 assert.equal(scenarios,OBJECTS.length*ROOMS.length*2);
});

test("all Objects resolve inside every Monster context, including both Warden phases",()=>{
 let contexts=0;
 for(const [i,o] of OBJECTS.entries())for(const [j,monster] of ALL_MONSTERS.entries()){
  const room=monster.stage==="FINAL"?VAULT:
   ROOMS.find(r=>r.stage===monster.stage);
  for(const face of [2,4,6]){
   const s=new ExpeditionState({seed:i*893+j*29+face+7,
    heroes:["witch","warrior"],strategy:"magic"});
   s.beginRoom(room);const h=s.heroes[0];feed(s,h);s.add(h,o);
   s.monster=monster;s.monsterHP=monster.hp;
   activate(s,h,o,face);
   finiteState(s,o.id+" / "+monster.id+" / "+face);
   contexts++;
  }
 }
 assert.equal(contexts,OBJECTS.length*ALL_MONSTERS.length*3);
});

test("all eight Heroes can equip and activate all 52 Objects",()=>{
 for(const [i,hero] of HEROES.entries())for(const [j,o] of OBJECTS.entries()){
  const s=new ExpeditionState({seed:51217+i*977+j,heroes:[hero.id],strategy:"magic"});
  s.beginRoom(ROOMS[(i+j)%ROOMS.length]);const h=s.heroes[0];feed(s,h);s.add(h,o);
  s.monster=MONSTERS[(i+j)%MONSTERS.length];s.monsterHP=s.monster.hp;
  activate(s,h,o,4);
  finiteState(s,hero.id+" / "+o.id);
 }
});

test("every declared cross-card link resolves to a genuine physical card",()=>{
 const all=[...HEROES,...ALL_ROOMS,...ALL_MONSTERS,...OBJECTS];
 const ids=new Set(all.map(x=>x.id));
 let links=0;
 for(const object of OBJECTS)for(const id of object.v2.links||[]){
  assert.ok(ids.has(id),object.id+" -> "+id);
  links++;
 }
 assert.ok(links>100,"Expected the complete documented interaction graph");
 console.log("PAIRWISE COMBINATION COVERAGE",JSON.stringify({
  objectObject:pairwiseObjectPairs.length,
  objectRoom:OBJECTS.length*ROOMS.length*2,
  objectMonster:OBJECTS.length*ALL_MONSTERS.length*3,
  heroObject:HEROES.length*OBJECTS.length,
  declaredLinks:links,
  exhaustiveBeyondPairs:false
 }));
});
