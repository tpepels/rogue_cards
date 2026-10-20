import test from "node:test";
import assert from "node:assert/strict";
import {ODD_ITEMS} from "../src/item-expansion.js";
import {createGame,applyAction,legalActions} from "../src/engine/index.js";
import {MONSTERS,ROOMS} from "../src/tabletop-data.js";
import {modifyOddDie,rollOddHeroD20,rollOddMonsterBehavior,
 offerGraveSalt,activateOddTool} from "../src/odd-item-effects.js";
import {itemOptions} from "../src/item-access.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {ALL_OBJECTS} from "../src/decks.js";
import {cardMarkup} from "../src/tabletop-view.js";

const card=id=>ODD_ITEMS.find(c=>c.id==="odd-"+id);
function game(ids=[],{two=false}={}){
 const s=createGame({seed:33,heroes:two?["warrior","knight"]:["warrior"],
  gameMode:"everything-goes"});
 const h=s.heroes[0];
 for(const id of ids)s.add(h,card(id));
 return {s,h};
}
const choices=(s,...preferred)=>{s.chooseEffect=(context,modes,defaultMode)=>
 preferred.find(mode=>modes.includes(mode))||defaultMode;};
const dice=(s,...values)=>{
 let i=0;s.rng.die=()=>values[i++%values.length];
};
const get=(h,id)=>h.inventory.find(c=>c.id==="odd-"+id);

test("all 18 unusual Items are selectable, printed, and in the Item pool",()=>{
 assert.equal(ODD_ITEMS.length,18);
 assert.equal(new Set(ODD_ITEMS.map(c=>c.id)).size,18);
 assert.deepEqual(ODD_ITEMS.map(c=>c.v2.number),
  Array.from({length:18},(_,i)=>176+i));
 for(const item of ODD_ITEMS){
  assert.ok(ALL_OBJECTS.includes(item),item.id);
  assert.equal(item.printOnly,true);
  assert.ok(item.v2.trigger.length>10);
  assert.match(cardMarkup(item),/tt-layout-v2-object/);
  assert.match(cardMarkup(item),/data-art-status="(?:placeholder|generated)"/);
 }
});
test("loaded coin, opposite Crooked Die and middle Witchbones change any d6",()=>{
 for(const [id,choice,initial,wanted] of [
  ["loaded-coin","up",2,3],["crooked-die","flip",2,5],
  ["witchbones","four",1,4]
 ]){
  const {s,h}=game([id]);choices(s,choice);
  assert.equal(modifyOddDie(s,6,initial),wanted,id);
  assert.equal(get(h,id),undefined,id+" consumed");
 }
});
test("Hooked Chain shifts one d6 per Room without being discarded",()=>{
 const {s,h}=game(["hooked-chain"]);s.room=ROOMS[0];choices(s,"down");
 assert.equal(modifyOddDie(s,6,4),3);
 assert.equal(modifyOddDie(s,6,4),4);
 assert.ok(get(h,"hooked-chain"));
 h.used.clear();
 assert.equal(modifyOddDie(s,6,4),3);
});
test("Chaos Idol forces exactly two additional same-sized dice",()=>{
 const {s,h}=game(["chaos-idol"]);choices(s,"reroll-twice");dice(s,5,2);
 assert.equal(modifyOddDie(s,6,1),2);
 assert.equal(get(h,"chaos-idol"),undefined);
});
test("Lucky Thread grants ADV before d20, Bent Mirror changes a visible result",()=>{
 let x=game(["lucky-thread"]);choices(x.s,"adv");dice(x.s,4,17);
 assert.equal(rollOddHeroD20(x.s,x.h),17);
 assert.equal(get(x.h,"lucky-thread"),undefined);
 x=game(["bent-mirror"]);choices(x.s,"reroll");dice(x.s,15,3);
 assert.equal(rollOddHeroD20(x.s,x.h),3);
 assert.equal(get(x.h,"bent-mirror"),undefined);
});
test("Trick Knife adds ATK and adjusts one attack natural per fight",()=>{
 const {s,h}=game(["trick-knife"]);const knife=get(h,"trick-knife");
 h.slots.weapon=knife;s.monster=MONSTERS[0];s.monsterHP=s.monster.hp;
 choices(s,"up");dice(s,10);
 assert.ok(s.stats(h).atk>=h.card.atk+1);
 assert.equal(rollOddHeroD20(s,h,{attack:true}),11);
 assert.equal(rollOddHeroD20(s,h,{attack:true}),10);
 assert.ok(h.inventory.includes(knife));
});
test("Jinx Powder applies disadvantage before a Monster behaviour die",()=>{
 const {s,h}=game(["jinx-powder"]);choices(s,"jinx");dice(s,6,2);
 assert.equal(rollOddMonsterBehavior(s),2);
 assert.equal(get(h,"jinx-powder"),undefined);
});
test("Fever Candle and Thorn Tonic trade healing and WIT penalties",()=>{
 let x=game(["fever-candle"]);choices(x.s,"use");
 const hp=x.h.hp;
 assert.equal(activateOddTool(x.s,x.h,get(x.h,"fever-candle")),true);
 assert.equal(x.s.witBonus,3);assert.equal(x.h.hp,hp-1);
 x=game(["thorn-tonic"]);x.h.hp-=5;
 activateOddTool(x.s,x.h,get(x.h,"thorn-tonic"));
 assert.equal(x.h.hp,x.h.card.hp);assert.equal(x.h.nextWitDis,1);
});
test("Grave Salt applies only against CURSED Monsters and expires after battle",()=>{
 const {s,h}=game(["grave-salt"]);
 const mob=MONSTERS.find(m=>m.v2.tags.includes("CURSED"));
 assert.ok(mob);
 s.monster=mob;s.monsterHP=mob.hp;choices(s,"use");
 offerGraveSalt(s,h);
 const boosted=s.stats(h);
 // Discard can automatically re-equip a different owned weapon, so compare
 // against the same post-discard equipment without the temporary boon.
 h.graveSalt=false;const unboosted=s.stats(h);h.graveSalt=true;
 assert.equal(boosted.atk,unboosted.atk+2);
 assert.equal(boosted.def,unboosted.def+2);
 assert.equal(get(h,"grave-salt"),undefined);
});
test("Sun Charm removes poison and all pending DIS penalties",()=>{
 const {s,h}=game(["sun-charm"]);
 h.poison=true;h.nextDis=2;h.nextWitDis=1;h.nextDefenseDis=1;
 activateOddTool(s,h,get(h,"sun-charm"));
 assert.equal(h.poison,false);
 assert.equal(h.nextDis,0);assert.equal(h.nextWitDis,0);
 assert.equal(h.nextDefenseDis,0);
});
test("Mad Compass peeks two Rooms and can swap their real order",()=>{
 const {s,h}=game(["mad-compass"]);s.room=ROOMS[0];choices(s,"swap");
 const prior=s.rooms.UPPER.slice(0,2).map(c=>c.id);
 activateOddTool(s,h,get(h,"mad-compass"));
 assert.deepEqual(s.rooms.UPPER.slice(0,2).map(c=>c.id),prior.reverse());
});
test("Echo Bell duplicates exactly one held KEEP trophy use",()=>{
 const {s,h}=game(["echo-bell"]);
 s.keptRooms.push({card:ROOMS[0],choice:0});
 const option=itemOptions(s,h,"between-rooms").find(x=>x.card.id==="odd-echo-bell");
 assert.ok(option);
 activateOddTool(s,h,get(h,"echo-bell"));
 assert.equal(s.keptRooms.length,2);
 assert.equal(s.keptRooms.filter(x=>x.echoCopy).length,1);
});
test("Moon Lens rolls early and caches result for this Room only",()=>{
 const {s,h}=game(["moon-lens"]);s.room=ROOMS[0];dice(s,4);
 activateOddTool(s,h,get(h,"moon-lens"));
 assert.equal(s.moonLensFace.roomId,s.room.id);
 assert.equal(s.moonLensFace.face,4);
});
test("Bone Dice prints and executes the three normal d6 bands",()=>{
 for(const [face,kind] of [[1,"hurt"],[4,"draw"],[6,"heal"]]){
  const {s,h}=game(["bone-dice"]);dice(s,face);
  h.hp=Math.min(h.card.hp,h.card.hp-3);
  const before=h.hp,drawn=s.metrics.drawn;
  activateOddTool(s,h,get(h,"bone-dice"));
  assert.equal(get(h,"bone-dice"),undefined);
  if(kind==="hurt")assert.equal(h.hp,before-1);
  if(kind==="draw")assert.equal(s.metrics.drawn,drawn+1);
  if(kind==="heal")assert.equal(h.hp,before+2);
 }
});
test("Red String shares the first Hero's next d20 with the second Hero",()=>{
 const {s,h}=game(["red-string"],{two:true});
 activateOddTool(s,h,get(h,"red-string"));dice(s,13,2);
 assert.equal(rollOddHeroD20(s,h),13);
 assert.equal(rollOddHeroD20(s,s.heroes[1]),13);
 assert.equal(s.redString,null);
});
test("old canonical mode never adds a new Item; Everything Goes fork retains new state",()=>{
 const legacy=createGame({seed:33});
 assert.equal(legacy.deck.some(c=>c.id.startsWith("odd-")),false);
 const {s,h}=game(["moon-lens","hooked-chain"]);
 s.room=ROOMS[0];s.moonLensFace={roomId:s.room.id,face:5};
 const fork=forkGameState(s);
 assert.notEqual(fork,s);
 assert.equal(fork.moonLensFace.face,5);
 assert.equal(fork.heroes[0].inventory.find(c=>c.id==="odd-hooked-chain").id,
  "odd-hooked-chain");
});
test("new Item actions are public legal decisions and execute via the API",()=>{
 const {s,h}=game(["bone-dice"]);
 const action=legalActions(s,{phase:"between-rooms",heroIndex:0})
  .find(a=>a.cardId==="odd-bone-dice");
 assert.ok(action);
 applyAction(s,action);
 assert.equal(get(h,"bone-dice"),undefined);
});
