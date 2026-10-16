import test from "node:test";
import assert from "node:assert/strict";
import {OBJECTS,ROOMS} from "../src/tabletop-data.js";
import {ROOM_EFFECTS,verifyRoomCoverage} from "../src/room-effect-model.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {simulateFullBatch} from "../src/expedition-campaign.js";
import {observedPrintedDataHashes,REVIEWED_CARD_HASHES} from "../src/playtest.js";

const object=id=>OBJECTS.find(o=>o.id===id);
const room=id=>ROOMS.find(r=>r.id===id);

test("Whispering Blade has +4 ATK on card and in canonical combat statistics",()=>{
 const blade=object("cursed-blade");
 assert.ok(blade);
 assert.match(blade.v2.trigger,/\+4 ATK; lose 1 HP after each successful hit/);
 const s=new ExpeditionState({seed:81,heroes:["witch"],strategy:"magic"});
 s.beginRoom(room("u-merchant"));
 const h=s.heroes[0];
 s.add(h,blade);
 assert.equal(h.slots.weapon?.id,"cursed-blade");
 assert.equal(s.stats(h).atk,h.card.atk+4);
 assert.equal(s.cursed(blade),true,"The drawback and cursed restriction remain");
 // The legacy Phase 5 baseline has NOT been revalidated after card edits.
 // Full-effect combat statistics above are the source of truth here.
 const now=observedPrintedDataHashes();
 assert.ok(Object.keys(now).some(k=>now[k]!==REVIEWED_CARD_HASHES[k]),
  "Legacy baseline requires an explicit review before reuse");
});

test("remaining combat alternatives match their exact executable rewards",()=>{
 const expected=[
  ["d-bones","RATTLE",3,false,"DEEP"],
  ["d-gate","FIGHT GUARDIAN",2,true,"DEEP"]
 ];
 for(const [id,label,reward,heals,stage] of expected){
  const card=room(id);
  assert.equal(card.stage,stage);
  const choice=card.v2.choices[1];
  assert.equal(choice.label,label);
  assert.match(choice.effect,new RegExp("draw "+reward+" Items","i"),id);
  if(heals)assert.match(choice.effect,/heal d6 HP/i);
  const ops=ROOM_EFFECTS[id].choices[1];
  assert.ok(ops.includes("FIGHT_REWARD:"+reward),id);
  assert.equal(ops.includes("FIGHT_HEAL:d6"),heals,id);
  const s=new ExpeditionState({seed:3501,heroes:["warrior","priest"]});
  s.beginRoom(card);s.setActor(s.heroes[0]);
  if(id==="d-gate")s.drawMonster(); // Printed entry Monster precedes either choice.
  const before=s.metrics.drawn;
  for(const op of ops){
   const [kind,...args]=op.split(":");s.apply(kind,args,card);
  }
  assert.equal(s.pendingReward,reward,id);
  assert.equal(s.pendingFightHeal,heals?"d6":null,id);
  assert.equal(s.metrics.drawn,before,"Reward must wait for successful combat");
  assert.ok(s.monster||s.monsterQueue.length,"A Monster is present for "+id);
 }
 assert.equal(verifyRoomCoverage().rooms,80);
});

test("adjusted card data remains compatible with the full-effect simulator",()=>{
 for(const heroes of [["warrior"],["witch"],["warrior","priest"]]){
  const r=simulateFullBatch({runs:15,seed:1268,heroes,strategy:"treasure"});
  assert.equal(r.unresolvedEffects,0);
  assert.equal(r.stalledExpeditions,0);
  assert.ok(r.winRate>=0&&r.winRate<=1);
 }
});
