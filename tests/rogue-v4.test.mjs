import test from "node:test";
import assert from "node:assert/strict";
import {HEROES,ROOMS,MONSTERS,VAULT,CATALOGUE} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {engraveElbereth,monsterRespond} from "../src/engine/combat.js";
import {fateMonsterEntry} from "../src/room-fates.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";

const room=id=>ROOMS.find(x=>x.id===id);
const monster=id=>MONSTERS.find(x=>x.id===id);

test("V4 preserves 139 cards and all 64 regional Rooms",()=>{
 assert.equal(CATALOGUE.length,139);
 assert.equal(ROOMS.length,64);
 for(const hero of HEROES){
  assert.match(hero.v2.trigger,/^ONCE PER ROOM, .*: .*; or roll d6 for a risky result\.$/);
  assert.ok(hero.v2.roll?.outcomes.length>=3);
 }
});

test("chained rerolls charge 1, then 2 HP and replace the result",()=>{
 const s=new ExpeditionState({seed:1});
 s.beginRoom(room("u-fountain"));
 const h=s.heroes[0],before=h.hp;
 const rolls=[1,6];s.die=()=>rolls.shift();
 assert.equal(s.pushLuck(2,{accept:(_face,count)=>count<=2}),6);
 assert.equal(before-h.hp,3);
 assert.deepEqual(s.rerollHistory.map(x=>x.cost),[1,2]);
 assert.deepEqual(s.rerollHistory.map(x=>x.face),[1,6]);
});

test("trapdoor from Upper skips remaining Upper Rooms and lands with a Monster",()=>{
 const s=new ExpeditionState({seed:11});
 s.beginRoom(room("u-fall"));
 s.fallThrough("MIDDLE",{damage:2,monster:true});
 assert.equal(s.stageProgress.UPPER,3);
 const hp=s.chooseActor().hp;
 s.beginRoom(room("m-vault"));
 assert.equal(s.chooseActor().hp,hp-2);
 assert.equal(s.monster?.stage,"MIDDLE");
 assert.equal(s.pendingTrapLanding,null);
});

test("the balanced Ladder shaft reaches DEEP instead of bypassing the entire Vault run",()=>{
 const s=new ExpeditionState({seed:15});
 s.beginRoom(room("m-ladder"));
 s.roomRoll(1);
 assert.equal(s.stageProgress.MIDDLE,3);
 assert.equal(s.stageProgress.DEEP,0);
 assert.equal(s.pendingTrapLanding.stage,"DEEP");
 assert.equal(s.pendingTrapLanding.monster,true);
 assert.equal(s.pendingTrapLanding.damage,4);
 assert.equal(s.trapdoorHistory[0].to,"DEEP");
});

test("a cursed passage resolves a previous depth without advancing progress",()=>{
 const s=new ExpeditionState({seed:19});
 s.rooms.MIDDLE=[room("m-statue")];
 s.beginRoom(room("d-whisper-junction"));
 s.roomRoll(4);
 assert.equal(s.secretFinds,1);
 assert.equal(s.room.id,"d-whisper-junction");
 assert.equal(s.stageProgress.DEEP,0);
});

test("Elbereth protects once, but cannot protect against the Warden or Sentinel",()=>{
 const s=new ExpeditionState({seed:23});
 s.beginRoom(room("u-nest"));s.monster=monster("rat");s.monsterHP=6;
 const h=s.heroes[0];
 const a=engraveElbereth(s,h,{face:20});
 assert.equal(a.success,true);assert.equal(s.monsterSkip,1);
 monsterRespond(s,h);assert.equal(s.monsterSkip,0);
 s.monster=monster("sentinel");
 assert.deepEqual(engraveElbereth(s,h,{face:20}),{legal:false});
});

test("failed Elbereth triggers the Monster immediately, not twice",()=>{
 const s=new ExpeditionState({seed:29});
 s.beginRoom(room("u-nest"));s.monster=monster("rat");s.monsterHP=6;
 const h=s.heroes[0],before=s.metrics.cardCounts.rat||0;
 assert.equal(engraveElbereth(s,h,{face:1}).success,false);
 assert.equal(s.metrics.cardCounts.rat||0,before+1);
 monsterRespond(s,h);
 assert.equal(s.metrics.cardCounts.rat||0,before+1);
 assert.equal(s.elberethSkipResponse,false);
});

test("the spared Hollow Knight may be retained until the Vault",()=>{
 const s=new ExpeditionState({seed:37});
 s.beginRoom(room("u-hollow-knight"));s.apply("ROOM_FATE",["0"],s.room);
 s.returnChoices["u-hollow-knight"]="save";
 assert.equal(fateMonsterEntry(s,monster("wraith")),false);
 assert.ok(s.keptRooms.some(x=>x.card.id==="u-hollow-knight"));
 s.beginRoom(VAULT);
 assert.equal(s.vaultModifiers.wardenOpeningSkip,true);
});

test("Ferryman sacrifice and Witness mercy unlock separate Vault alternatives",()=>{
 const s=new ExpeditionState({seed:41});
 s.beginRoom(room("m-ferryman-oath"));s.apply("ROOM_FATE",["0"],s.room);
 s.returnChoices["m-ferryman-oath"]="smuggle";
 s.beginRoom(room("d-last-witness"));s.apply("ROOM_FATE",["0"],s.room);
 s.beginRoom(VAULT);
 assert.equal(s.vaultModifiers.smuggleAvailable,true);
 assert.equal(s.vaultModifiers.bargainAvailable,true);
});

test("the new rules survive complete seeded expeditions",()=>{
 for(let seed=1;seed<=8;seed++){
  const result=simulateFullExpedition({seed,heroes:seed%2?["warrior"]:["wizard","priest"],
   strategy:seed%2?"survival":"magic"});
  assert.equal(result.unresolved,0);
  assert.equal(result.roundLimit,false);
  assert.ok(Array.isArray(result.trapdoors));
  assert.ok(Array.isArray(result.rerolls));
 }
});
