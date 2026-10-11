import test from "node:test";
import assert from "node:assert/strict";
import {startRun,act,availableActions,validateSave,currentRoom} from "../src/engine.js";
import {ECOLOGY,INTRINSICS,ECOLOGY_CARDS,corpseFor,buildBones} from "../src/ecology.js";
import {CATALOGUE,printDeck} from "../src/data.js";
const execute=(s,id,arg=null)=>{const n=act(s,id,arg);assert.notStrictEqual(n,s,id+" rejected");return n;};

test("v5 setups include physical ecology state and do not accept v4 saves",()=>{
 const s=startRun("delver",123);
 assert.equal(s.version,5);
 assert.ok(validateSave(s));
 assert.deepEqual(s.intrinsics,[]);
 assert.equal(s.prayer.cooldown,0);
 assert.equal(s.pet.active,false);
 assert.equal(validateSave({...s,version:4}),false);
});
test("monster corpses can be collected and eaten with bounded intrinsic effects",()=>{
 let s=startRun("delver",13);
 s.rooms["0"].monster={id:"rat",type:"monster",title:"Giant Rat",hp:0,maxHp:2};
 // A real defeated monster deposits its corpse in the active room.
 assert.deepEqual(corpseFor({id:"rat"},s.turn),{kind:"corpse",id:"rat",created:1,food:4});
 s.rooms["0"].corpse=corpseFor({id:"rat"},s.turn);
 s=execute(s,"take-corpse");
 assert.equal(s.inventory.filter(x=>x.kind==="corpse").length,1);
 const i=s.inventory.findIndex(x=>x.kind==="corpse");
 s=execute(s,"eat-corpse",i);
 assert.equal(s.corpsesEaten,1);
 assert.ok(s.hunger<=24);
 assert.ok(s.intrinsics.every(x=>INTRINSICS.some(i=>i.id===x)));
});
test("prayer resolves using a d6, has a six-turn cooldown and possible consequences",()=>{
 let s=startRun("knight",8);
 s=execute(s,"pray");
 assert.ok(["blessing","displeasure"].includes(s.prayer.lastResult));
 assert.ok(s.prayer.cooldown>=5);
 assert.ok(!availableActions(s).some(a=>a.id==="pray"));
 const status=s.prayer.lastResult;
 assert.strictEqual(act(s,"pray"),s);
 assert.equal(s.prayer.lastResult,status);
});
test("autonomous dog rolls at turn end, maintains hunger and is not a passive attack bonus",()=>{
 let s=startRun("delver",222);
 s.inventory.push({kind:"dog",id:"dog"});
 s=execute(s,"equip",s.inventory.length-1);
 assert.equal(s.pet.active,true);
 assert.equal(s.pet.hunger,9);
 s=execute(s,"end");
 assert.ok(["roam","sniff","rest","follow","attack"].includes(s.pet.lastAction));
 assert.ok(s.pet.hunger<=9);
});
test("bones snapshots are bounded and a later expedition can carry the record",()=>{
 let s=startRun("rogue",1);
 s.inventory.push({kind:"sword",id:"sword"});
 s.hp=1;s.hunger=0;
 s=execute(s,"end");
 assert.equal(s.phase,"dead");
 assert.ok(s.bonesOutcome.items.length<=3);
 const next=startRun("wizard",2,s.bonesOutcome);
 assert.equal(next.bonesRecord.heroId,"rogue");
 assert.equal(next.bonesRecord.attempted,false);
 assert.ok(validateSave(next));
});
test("all ecology rules are printable with species-specific hazards",()=>{
 assert.equal(Object.keys(ECOLOGY).length,7);
 assert.ok(Object.values(ECOLOGY).every(x=>Number.isInteger(x.hazard)));
 const cards=printDeck(["ecology","intrinsic"]);
 assert.equal(cards.length,ECOLOGY_CARDS.reduce((s,c)=>s+(c.id==="corpse"?6:1),0)+INTRINSICS.length);
 assert.ok(CATALOGUE.some(c=>c.id==="prayer"&&c.type==="ecology"));
});

test("dog scavenges a corpse autonomously instead of allowing the hero to eat it",()=>{
 let s=startRun("delver",19);
 s.inventory.push({kind:"dog",id:"dog"});
 s=execute(s,"equip",s.inventory.length-1);
 s.pet.hunger=4;
 s.rooms["0"].corpse=corpseFor({id:"rat"},s.turn);
 s=execute(s,"end");
 assert.equal(s.pet.lastAction,"feed");
 assert.equal(s.pet.hunger,7);
 assert.equal(s.rooms["0"].corpse,null);
});
test("prayer cooldown counts six full turns after the invocation turn",()=>{
 let s=startRun("knight",19);
 s=execute(s,"pray");
 s=execute(s,"end");
 assert.equal(s.prayer.cooldown,6);
 for(let i=0;i<5;i++)s=execute(s,"end");
 assert.equal(s.prayer.cooldown,1);
 assert.ok(!availableActions(s).some(a=>a.id==="pray"));
 s=execute(s,"end");
 assert.equal(s.prayer.cooldown,0);
 assert.ok(availableActions(s).some(a=>a.id==="pray"));
});
