import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {ROOMS} from "../src/tabletop-data.js";
import {ROOM_EFFECTS,verifyRoomCoverage} from "../src/room-effect-model.js";
const room=id=>ROOMS.find(r=>r.id===id);
const make=id=>{const s=new ExpeditionState({seed:42,heroes:["warrior"]});s.beginRoom(room(id));return s;};
test("thematic cards keep printed d6 bands aligned to their effect handlers",()=>{
 assert.ok(verifyRoomCoverage().rooms>=65);
 for(const id of ["u-nest","u-lamp","u-supply","m-crypt"])
  assert.equal(room(id).v2.roll.outcomes.length,ROOM_EFFECTS[id].outcomes.length);
});
test("Rat Nest swarms without summoning an unrelated Monster",()=>{
 const s=make("u-nest"),hp=s.heroes[0].hp;
 s.die=()=>1;s.roomRoll();
 assert.equal(s.heroes[0].hp,hp-2);
 assert.equal(s.monster,null);
 assert.equal(s.monsterQueue.length,0);
});
test("Lamp-Eater bites Heroes without fire",()=>{
 const s=make("u-lamp"),h=s.heroes[0];
 for(const item of [...h.inventory])if(item.v2.tags.includes("FIRE"))s.remove(h,item);
 const hp=h.hp;const dis=h.nextDis;s.die=()=>1;s.roomRoll();
 assert.equal(h.hp,hp-2);assert.equal(h.nextDis,dis+1);
 assert.equal(s.monster,null);
});
test("Discarded equipment can be salvaged from the top of the pile",()=>{
 const s=make("u-supply"),discarded=s.discard();
 assert.ok(discarded);assert.equal(s.discardPile.at(-1),discarded);
 s.die=()=>3;s.roomRoll();
 assert.ok(s.heroes.some(h=>h.inventory.includes(discarded)));
 assert.equal(s.discardPile.includes(discarded),false);
});
test("Opened Crypt has its own WIT hazard and no entry Monster",()=>{
 const s=make("m-crypt"),before=s.heroes[0].hp;
 s.die=n=>1;s.roomRoll();
 assert.equal(s.heroes[0].hp,before-3);
 assert.equal(s.monster,null);
});
