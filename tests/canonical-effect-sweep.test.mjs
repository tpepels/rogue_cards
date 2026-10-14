import test from "node:test";
import assert from "node:assert/strict";
import {ROOMS,VAULT,OBJECTS,MONSTERS} from "../src/tabletop-data.js";
import {ROOM_EFFECTS} from "../src/room-effect-model.js";
import {ROLL_EFFECTS} from "../src/effect-model.js";
import {d6Band} from "../src/engine/dice-bands.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";

const game=seed=>new ExpeditionState({seed,heroes:["warrior","wizard"]});
const enact=(s,card,ops)=>{
 for(const op of ops){
  const [kind,...args]=op.split(":");
  try{s.apply(kind,args,card)}
  catch(e){throw Error(card.id+" "+op+": "+e.message,{cause:e})}
 }
};
test("execute all printed Room d6 results against real canonical rules (not an alternate simulator)",()=>{
 let examined=0;
 for(const card of [...ROOMS,VAULT]){
  if(!card.v2.roll)continue;
  const table=ROOM_EFFECTS[card.id]?.outcomes;
  assert.equal(table?.length,card.v2.roll.outcomes.length,card.id);
  for(let face=1;face<=6;face++){
   const s=game(301000+examined++);
   s.beginRoom(card);s.setActor(s.heroes[0]);
   const band=d6Band(card,face);
   enact(s,card,table[band]);
   assert.ok(s.metrics&&s.heroes.length===2);
  }
 }
 assert.ok(examined>=300,"Unexpected loss of printed Room dice");
});
test("execute every printed Item/Potion/Wand d6 outcome in canonical state",()=>{
 let examined=0;
 for(const card of OBJECTS){
  if(!card.v2.roll)continue;
  const table=ROLL_EFFECTS[card.id];
  assert.equal(table?.length,card.v2.roll.outcomes.length,card.id);
  for(let face=1;face<=6;face++){
   const s=game(302000+examined++);
   s.beginRoom(ROOMS.find(c=>c.id==="u-gate"));
   s.setActor(s.heroes[0]);
   const m=MONSTERS.find(c=>c.id==="rat");
   s.monster=m;s.monsterHP=m.hp;
   const band=d6Band(card,face);
   enact(s,card,table[band]);
   assert.ok(s.metrics);
  }
 }
 assert.ok(examined>=240,"Unexpected loss of printed Item dice");
});
