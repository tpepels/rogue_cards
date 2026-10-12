import test from "node:test";
import assert from "node:assert/strict";
import {HEROES,ROOMS,MONSTERS,OBJECTS,VAULT} from "../src/tabletop-data.js";
import {ROLL_EFFECTS,NON_ROLL_EFFECTS,bandFor,verifyObjectCoverage} from "../src/effect-model.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {seal} from "../src/expedition-campaign.js";

const byId=id=>OBJECTS.find(c=>c.id===id);
const room=id=>ROOMS.find(c=>c.id===id);
function fixture(seed=1){
 const s=new ExpeditionState({seed,heroes:["warrior"],strategy:"seal"});
 s.beginRoom(room("u-passage"));
 const h=s.heroes[0];
 s.hurt(h,8);h.poison=true;
 // Resource spending must be affordable, even after several effects.
 for(let n=0;n<12;n++)s.add(h,byId("key"));
 s.monster=MONSTERS.find(m=>m.id==="rat");s.monsterHP=16;
 s.pendingDamage=4;s.pendingD20=10;s.pendingRoomFace=3;
 s.setActor(h);
 return {s,h};
}
function checkOperation(kind,before,s,h,description){
 const changed=(next,prior)=>assert.notEqual(next,prior,description+" "+kind+" did nothing");
 switch(kind){
  case "HURT":assert.ok(h.hp<before.hp,description);break;
  case "HEAL":assert.ok(h.hp>before.hp,description);break;
  case "DRAW":assert.ok(s.metrics.drawn>before.drawn,description);break;
  case "DISCARD":assert.ok(s.metrics.spent>before.spent,description);break;
  case "TRADE":assert.ok(s.metrics.spent>before.spent,description);break;
  case "PEEK":case "PEEK_SWAP":assert.ok(s.metrics.scouted>before.scouted,description);break;
  case "POISON":assert.equal(h.poison,true,description);break;
  case "CURE":assert.equal(h.poison,false,description);break;
  case "POISON_IMMUNE":assert.equal(h.immune,true,description);break;
  case "DAMAGE":assert.ok(s.monsterHP<before.monsterHP,description);break;
  case "SKIP":assert.ok(s.monsterSkip>before.skip,description);break;
  case "NEXT_ATK":assert.ok(h.nextAtk>before.nextAtk,description);break;
  case "NEXT_DAMAGE":assert.ok(h.nextDamage>before.nextDamage,description);break;
  case "NEXT_ADV":assert.ok(h.nextAdv>before.nextAdv,description);break;
  case "NEXT_DIS":assert.ok(h.nextDis>before.nextDis,description);break;
  case "DEF_ADV":assert.equal(h.nextDefenseAdv,true,description);break;
  case "MONSTER_DIS":assert.equal(s.monsterDis,true,description);break;
  case "VULNERABLE":assert.ok(h.damageVulnerability>before.vulnerable,description);break;
  case "BLOCK":assert.ok(s.pendingDamage<before.pendingDamage,description);break;
  case "REFLECT":assert.equal(s.pendingDamage,0,description);break;
  case "FORCE_BEHAVIOR":assert.notEqual(s.forcedBehavior,0,description);break;
  case "REWRITE_BEHAVIOR":assert.ok(s.rewrites.size>0,description);break;
  case "D20_MOD":changed(s.pendingD20Modifier,before.d20mod);break;
  case "D20_REROLL":assert.ok(s.pendingD20>=1&&s.pendingD20<=20,description);break;
  case "MONSTER_DRAW":assert.ok(s.monsterQueue.length>before.queue,description);break;
  case "ELEMENT":assert.ok(["FIRE","ICE","LIGHTNING"].includes(s.damageElement),description);break;
 }
}
test("each printed Item face executes its typed operations with observable effects",()=>{
 const covered=new Set(),checked=new Set();
 for(const [i,card] of OBJECTS.entries()){
  if(!card.v2.roll)continue;
  for(let face=1;face<=6;face++){
   const {s,h}=fixture(i*31+face+5);
   s.add(h,card);
   const band=bandFor(card,face),operations=ROLL_EFFECTS[card.id][band];
   const seen=[];
   const original=s.apply.bind(s);
   s.apply=(kind,args,origin)=>{
    const before={hp:h.hp,drawn:s.metrics.drawn,spent:s.metrics.spent,
     scouted:s.metrics.scouted,monsterHP:s.monsterHP,skip:s.monsterSkip,
     nextAtk:h.nextAtk,nextDamage:h.nextDamage,nextAdv:h.nextAdv,
     nextDis:h.nextDis,vulnerable:h.damageVulnerability,
     pendingDamage:s.pendingDamage,queue:s.monsterQueue.length,
     d20mod:s.pendingD20Modifier};
    const result=original(kind,args,origin);
    if(["HURT","HEAL","DRAW","DISCARD","TRADE","PEEK","PEEK_SWAP",
      "POISON","CURE","POISON_IMMUNE","DAMAGE","SKIP","NEXT_ATK",
      "NEXT_DAMAGE","NEXT_ADV","NEXT_DIS","DEF_ADV","MONSTER_DIS",
      "VULNERABLE","BLOCK","REFLECT","FORCE_BEHAVIOR","REWRITE_BEHAVIOR",
      "D20_MOD","D20_REROLL","MONSTER_DRAW","ELEMENT"].includes(kind))
     checkOperation(kind,before,s,h,card.id+" face "+face);
    seen.push(kind);checked.add(kind);
    return result;
   };
   assert.equal(s.activate(h,card,{face}),true,card.id+" "+face);
   // Nested Room outcomes can add extra operations; the printed Item
   // operations must still appear in their declared order.
   let offset=0;
   for(const op of operations){
    const pos=seen.indexOf(op.split(":")[0],offset);
    assert.ok(pos>=offset,card.id+" face "+face+": missing "+op);
    offset=pos+1;
   }
   assert.equal(s.metrics.unresolved,0,card.id+" "+face);
   assert.ok(s.heroes.every(x=>Number.isFinite(x.hp)&&x.hp>=0&&x.hp<=x.card.hp));
   assert.ok(Number.isFinite(s.monsterHP));
   covered.add(card.id+":"+band);
  }
 }
 assert.equal(covered.size,verifyObjectCoverage().outcomeBands);
 for(const op of ["HURT","HEAL","DRAW","DAMAGE","SKIP","POISON","CURE",
  "NEXT_ADV","NEXT_DIS","MONSTER_DRAW"])assert.ok(checked.has(op),op);
});

test("all nine non-dice Objects have specific functional coverage",()=>{
 assert.deepEqual(Object.keys(NON_ROLL_EFFECTS).sort(),
  ["crown-relic","cursed-blade","cursed-mail","key","lantern-heart",
   "mail","rope","staff","torch"].sort());
 const {s,h}=fixture(992);
 for(const [id,slot,bonus] of [["staff","weapon",1],["cursed-blade","weapon",4],
  ["mail","armour",2],["cursed-mail","armour",3]]){
  const state=new ExpeditionState({seed:100+bonus,heroes:["warrior"]});
  const hero=state.heroes[0],card=byId(id);
  if(hero.slots[slot])state.remove(hero,hero.slots[slot]);
  state.add(hero,card);
  assert.equal(hero.slots[slot],card,id+" did not equip");
  assert.equal(state.stats(hero)[slot==="weapon"?"atk":"def"],
   hero.card[slot==="weapon"?"atk":"def"]+bonus,id);
  if(id.startsWith("cursed"))assert.equal(state.cursed(card),true);
 }
 for(const [id,location] of [["rope","u-fall"],["torch","u-lamp"],
  ["lantern-heart","u-lamp"],["key","u-gate"]]){
  const state=new ExpeditionState({seed:445,heroes:["warrior"]});
  const hero=state.heroes[0],card=byId(id);
  state.beginRoom(room(location));state.setActor(hero);state.add(hero,card);
  const before=state.metrics.drawn,spentBefore=state.metrics.spent;
  state.roomRoll(1);
  assert.ok(state.metrics.drawn>before,id+" did not produce the highest Room result");
  if(id==="key")assert.ok(state.metrics.spent>spentBefore,"Rusty Key was not spent");
 }
 const crown=byId("crown-relic"),scroll=byId("scroll-flame");
 const sealState=new ExpeditionState({seed:915,heroes:["wizard"],strategy:"seal"});
 sealState.beginRoom(VAULT);const wizard=sealState.heroes[0];
 for(const item of [...wizard.inventory])
  if(item.v2.tags.includes("MAGIC"))sealState.remove(wizard,item);
 sealState.add(wizard,crown);
 for(let i=0;i<3;i++)sealState.add(wizard,scroll);
 const beforeHP=wizard.hp;
 sealState.die=()=>1; // failed opposed d20; Crown turns it into a success.
 assert.equal(seal(sealState),true);
 assert.equal(sealState.metrics.sealWin,true);
 assert.ok(!wizard.inventory.includes(crown),"Crown must be spent");
 assert.equal(wizard.hp,beforeHP-1);
});
