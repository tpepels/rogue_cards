import test from "node:test";
import assert from "node:assert/strict";
import { startRun,act,availableActions,connectedLocations,currentMonster,regionAt,LAST_FLOOR,VERSION } from "../src/engine.js";
import { ROOMS,printDeck } from "../src/data.js";

test("every printed room has a region and explicit exits",()=>{
  assert.equal(VERSION,5);
  assert.equal(LAST_FLOOR,10);
  assert.deepEqual(new Set(ROOMS.map(r=>r.region)),new Set(["UPPER","MIDDLE","DEEP"]));
  assert.ok(ROOMS.every(r=>Array.isArray(r.exits)&&r.exits.every(e=>["SIDE","LINK"].includes(e))));
  assert.equal(printDeck("room").filter(r=>r.id!=="entrance"&&r.id!=="vault").length,28);
});
test("three physical regional piles have adequate stock",()=>{
  for(const region of ["UPPER","MIDDLE","DEEP"]){
    const copies=printDeck("room").filter(r=>r.region===region);
    assert.ok(copies.length>=6,region);
  }
  for(let depth=1;depth<=9;depth++){
    assert.equal(regionAt(depth),depth<=3?"UPPER":depth<=6?"MIDDLE":"DEEP");
  }
});
test("main spine is guaranteed but a room without SIDE blocks side exploration",()=>{
  let s=startRun("delver",21);
  s=act(s,"explore","1");
  assert.equal(s.position,"1");
  s.rooms["1"].monster=null;
  s.rooms["1"].exits=[];
  assert.ok(!availableActions(s).some(a=>a.id==="explore"&&a.target==="1b"));
  assert.ok(availableActions(s).some(a=>a.id==="explore"&&a.target==="2"));
  assert.strictEqual(act(s,"explore","1b"),s);
  s.rooms["1"].exits=["SIDE"];
  assert.ok(availableActions(s).some(a=>a.id==="explore"&&a.target==="1b"));
});
test("LINK loops require two already revealed neighboring side cards",()=>{
  const s=startRun("delver",31);
  for(const d of [2,3]){
    s.rooms[String(d)]={id:"corridor",title:"Corridor",region:regionAt(d),exits:["SIDE"],monster:null,loot:null};
    s.rooms[d+"b"]={id:"corridor",title:"Corridor",region:regionAt(d),exits:["LINK"],monster:null,loot:null};
  }
  assert.ok(connectedLocations("2b",s).includes("3b"));
  assert.ok(connectedLocations("3b",s).includes("2b"));
  s.rooms["3b"].exits=[];
  assert.ok(!connectedLocations("2b",s).includes("3b"));
});
test("room reveal respects its zone and never generates a moving enemy",()=>{
  for(let seed=1;seed<=70;seed++){
    let s=startRun("knight",seed);
    for(let d=1;d<=9;d++){
      if(currentMonster(s))s.rooms[s.position].monster.hp=0;
      const next=act(s,"explore",String(d));
      assert.notStrictEqual(next,s,"explore "+d);
      s=next;
      assert.equal(s.rooms[s.position].region,regionAt(d));
      assert.ok(!s.rooms[s.position].monster || s.rooms[s.position].monster.hp>0);
    }
  }
});
