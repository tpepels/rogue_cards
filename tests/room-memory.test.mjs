import test from "node:test";
import assert from "node:assert/strict";
import {ROOMS} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {verifyRoomCoverage} from "../src/room-effect-model.js";
const card=id=>{const result=ROOMS.find(c=>c.id===id);assert.ok(result,id);return result;};
const state=()=>new ExpeditionState({seed:317,heroes:["warrior"],roomPolicy:"scripted"});
const enter=(s,id,choice=0)=>{s.beginRoom(card(id));s.apply("ROOM_SPECIAL",[String(choice)],s.room);};
test("expanded Room catalogue, memory cards and fate cards all have executable coverage",()=>{
 assert.ok(ROOMS.length>=64);
 assert.equal(ROOMS.filter(c=>c.v2.special).length,22);
 assert.equal(ROOMS.filter(c=>c.v2.special?.corridor).length,10);
 assert.equal(ROOMS.filter(c=>c.v2.fate).length,10);
 assert.equal(verifyRoomCoverage().rooms,ROOMS.length+1);
 assert.equal(new Set(ROOMS.map(c=>c.id)).size,ROOMS.length);
});
test("a corridor reveals genuine alternatives and queues the chosen Room",()=>{
 const s=state();const original=s.rooms.UPPER.length;
 enter(s,"u-fork");
 assert.equal(s.rooms.UPPER.length,original);
 assert.ok(s.rooms.UPPER[0]);
 assert.equal(s.rooms.UPPER[0].type,"room");
});
test("the Well preserves its Item until the Deep",()=>{
 const s=state();enter(s,"m-well");
 assert.ok(s.keptRooms.some(x=>x.card.id==="m-well"&&x.item));
 const held=s.heroes[0].inventory.length;
 s.beginRoom(card("d-shadow"));
 assert.equal(s.heroes[0].inventory.length,held+1);
 assert.equal(s.keptRooms.filter(x=>x.card.id==="m-well").length,0);
});
test("stored protection prevents damage and fatal injury",()=>{
 const s=state();enter(s,"m-second-name");
 s.hurt(s.heroes[0],100);assert.equal(s.heroes[0].hp,1);
 enter(s,"d-apothecary");s.hurt(s.heroes[0],2);
 assert.equal(s.heroes[0].hp,1);
 assert.equal(s.keptRooms.length,0);
});
test("a promised debt returns at the Vault and is removed",()=>{
 const s=state();enter(s,"m-clock");
 assert.equal(s.keptRooms.filter(x=>x.card.id==="m-clock").length,1);
 s.beginRoom({id:"vault",stage:"FINAL",v2:{kind:"MYSTERY",choices:[],roll:{outcomes:[]}}});
 assert.equal(s.keptRooms.filter(x=>x.card.id==="m-clock").length,0);
});
