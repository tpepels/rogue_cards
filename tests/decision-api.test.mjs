import test from "node:test";
import assert from "node:assert/strict";
import {ROOMS,MONSTERS,VAULT} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {legalActions,applyAction,legalRoomChoices,legalCombatActions}
 from "../src/engine/index.js";
import {ITEM_TIMING,itemOptions} from "../src/item-access.js";
const room=id=>ROOMS.find(c=>c.id===id);
const monster=id=>MONSTERS.find(c=>c.id===id);
test("one API enumerates exactly the canonical executable Room and combat choices",()=>{
 const s=new ExpeditionState({seed:2501,heroes:["warrior","wizard"]});
 s.beginRoom(room("u-passage"));
 const choices=legalActions(s,{phase:"room"});
 assert.deepEqual(choices.map(a=>a.index),legalRoomChoices(s));
 assert.ok(choices.every(a=>a.kind==="room-choice"&&a.roomId===s.room.id));
 const first=choices[0];
 applyAction(s,first);
 assert.equal(s.metrics.roomChoices[s.room.id+":"+first.index],1);
 s.monster=monster("rat");s.monsterHP=s.monster.hp;
 const legal=legalActions(s,{phase:"combat",heroIndex:0});
 assert.deepEqual(legal.map(({phase,...a})=>a),legalCombatActions(s,0));
 assert.ok(legal.some(a=>a.kind==="attack"));
 assert.ok(legal.some(a=>a.kind==="elbereth"&&a.mode==="ward"));
 assert.ok(legal.some(a=>a.kind==="elbereth"&&a.mode==="flee"));
 assert.throws(()=>applyAction(s,{phase:"combat",kind:"item",heroIndex:0,
  optionIndex:100}),/Illegal action/);
});
test("parley, Vault and post-Warden alternatives preserve printed affordability",()=>{
 const s=new ExpeditionState({seed:2503,heroes:["warrior"]});
 s.beginRoom(room("u-nest"));s.monster=monster("rat");s.monsterHP=s.monster.hp;
 assert.ok(legalActions(s,{phase:"parley"}).some(a=>a.kind==="fight"));
 assert.ok(legalActions(s,{phase:"parley"}).some(a=>a.kind==="parley"));
 s.monster=monster("sentinel");s.monsterHP=s.monster.hp;
 assert.ok(!legalActions(s,{phase:"parley"}).some(a=>a.kind==="parley"),
  "Cannot parley with Sentinel without two METAL Items");
 s.monster=null;s.beginRoom(VAULT);
 assert.ok(legalActions(s,{phase:"vault"}).some(a=>a.kind==="fight"));
 assert.ok(!legalActions(s,{phase:"vault"}).some(a=>a.kind==="seal"));
 s.vaultModifiers.smuggleAvailable=true;
 assert.ok(legalActions(s,{phase:"post-warden"}).some(a=>a.kind==="fight"));
 assert.throws(()=>applyAction(s,{phase:"vault",kind:"seal"}),/Illegal action/);
 assert.throws(()=>applyAction(s,{phase:"vault",kind:"fight"}),/requires a campaign continuation/);
});
test("retained, Hero and equipment options are explicit and actions cannot be fabricated",()=>{
 const s=new ExpeditionState({seed:2505,heroes:["warrior","witch"]});
 s.beginRoom(room("m-fungus"));
 s.keptRooms.push({card:room("m-fungus")});
 const modes=legalActions(s,{phase:"retained",roomId:"m-fungus"}).map(a=>a.mode);
 assert.ok(modes.includes("heal")&&modes.includes("save"));
 assert.ok(!modes.includes("burn")||s.discardable(1,"FIRE"));
 const save=legalActions(s,{phase:"retained",roomId:"m-fungus"})
  .find(a=>a.mode==="save");
 applyAction(s,save);
 assert.equal(s.returnChoices["m-fungus"],"save");
 assert.deepEqual(legalActions(s,{phase:"retained",roomId:"no-room"}),[]);
 const a=legalActions(s,{phase:"hero-ability",heroIndex:0});
 assert.deepEqual(a.map(x=>x.mode),["steady","risk"]);
 applyAction(s,a[1]);
 assert.equal(s.heroAbilityModes.warrior,"risk");
 assert.ok(legalActions(s,{phase:"equipment",heroIndex:0})
  .every(x=>x.kind==="equip"&&x.slot));
});
test("every classified Item timing is explicitly queryable without creating actions",()=>{
 const s=new ExpeditionState({seed:2507,heroes:["warrior","wizard"]});
 s.beginRoom(room("u-passage"));
 const timing=new Set(["combat","explore","between-rooms","room-choice",
  "after-roll","failed-d20","before-defence","after-hit","on-attack",
  "on-hit","on-poison","after-magic","room-roll"]);
 const phases=new Set(Object.values(ITEM_TIMING).flat());
 for(const phase of phases){
  if(["passive","combat"].includes(phase))continue;
  assert.ok(timing.has(phase),"Unknown timing "+phase);
  const actions=legalActions(s,{phase,heroIndex:0});
  assert.ok(actions.some(a=>a.kind==="continue"));
  const actual=itemOptions(s,s.heroes[0],phase);
  assert.equal(actions.filter(a=>a.kind==="item-trigger").length,actual.length);
 }
 assert.throws(()=>legalActions(s,{phase:"fabricated"}),/Unknown decision phase/);
});

test("Gilded Hallway's two printed actions have no unreachable d6 bands",()=>{
 const c=room("d-gilded");
 assert.equal(c.v2.roll,null);
 assert.deepEqual(c.v2.special.rollOps,[]);
 const s=new ExpeditionState({seed:2511,heroes:["warrior"]});
 s.beginRoom(c);
 assert.deepEqual(legalActions(s,{phase:"room"}).map(x=>x.index),[0,1]);
 const before=JSON.stringify(s.metrics.roomRollBands);
 assert.equal(s.roomRoll(),false);
 assert.equal(JSON.stringify(s.metrics.roomRollBands),before);
});

test("Midnight Bazaar never traps an empty-handed player with zero legal options",()=>{
 const s=new ExpeditionState({seed:78991,heroes:["warrior"]});
 s.beginRoom(room("d-bazaar"));
 const h=s.heroes[0];
 while(h.inventory.length)s.remove(h,h.inventory[0]);
 s.setActor(h);
 assert.equal(s.discardable(),false);
 assert.deepEqual(legalActions(s,{phase:"room"}).map(a=>a.index),[0]);
 const before=h.hp;
 const choice=legalActions(s,{phase:"room"})[0];
 applyAction(s,choice);
 assert.equal(h.hp,Math.max(0,before-2));
 assert.equal(s.metrics.roomChoices["d-bazaar:0"],1);
});
