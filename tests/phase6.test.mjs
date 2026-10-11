import test from "node:test";
import assert from "node:assert/strict";
import { startRun, act, availableActions, currentMonster, nextBehaviour, heroAttack, heroDefense, VERSION } from "../src/engine.js";
import { MONSTERS, printDeck } from "../src/data.js";
import { PHASE6_CARDS } from "../src/phase6-data.js";
const monster=(id="rat")=>{
 const c=MONSTERS.find(x=>x.id===id);
 return {...c,hp:15,maxHp:15,guard:0,frozen:0,blinded:0,ambushed:false,petUsed:false};
};
const doAction=(s,id,arg=null)=>{
 const n=act(s,id,arg);
 assert.notStrictEqual(n,s,"Rejected "+id);
 return n;
};
test("Phase 6 saves and physical tactical cards are defined",()=>{
 const s=startRun("delver",10);
 assert.equal(VERSION,6);
 assert.equal(s.version,6);
 assert.equal(PHASE6_CARDS.length,8);
 assert.equal(printDeck("tactic").length,8);
 assert.deepEqual(s.tactics,{guard:0,feint:0,used:false});
 assert.equal(s.pressure,0);
});
test("monster intention previews the actual undrawn shared behaviour card",()=>{
 const s=startRun("knight",222);
 s.rooms["0"].monster=monster();
 const before=[...s.decks.behaviour.draw];
 assert.equal(nextBehaviour(s),before.at(-1));
 assert.deepEqual(s.decks.behaviour.draw,before);
 s.decks.behaviour.draw=[];
 assert.equal(nextBehaviour(s),"reshuffle");
});
test("brace grants two defence and excludes feint during the same turn",()=>{
 let s=startRun("knight",12);
 s.rooms["0"].monster=monster();
 const old=heroDefense(s);
 s=doAction(s,"brace");
 assert.equal(heroDefense(s),old+2);
 assert.ok(!availableActions(s).some(a=>a.id==="feint"));
 s=doAction(s,"end");
 assert.equal(s.tactics.guard,0);
 assert.equal(s.tactics.used,false);
});
test("feint modifies the next melee d6 roll by two",()=>{
 let s=startRun("wizard",99);
 s.rooms["0"].monster=monster();
 s.rooms["0"].monster.frozen=1;
 s=doAction(s,"feint");
 s=doAction(s,"attack");
 assert.equal(s.lastRoll.label,"Hero");
 assert.equal(s.lastRoll.total,s.lastRoll.roll+heroAttack(s)+2);
 assert.equal(s.tactics.feint,0);
});
test("all four heroes receive separate once-per-monster techniques",()=>{
 for(const id of ["delver","knight","wizard","rogue"]){
  let s=startRun(id,6);
  s.rooms["0"].monster=monster();
  s=doAction(s,"technique");
  assert.equal(s.rooms["0"].monster.heroTechniqueUsed,true);
  assert.ok(!availableActions(s).some(a=>a.id==="technique"));
  if(id==="wizard")assert.equal(s.rooms["0"].monster.hp,13);
  if(id==="delver")assert.equal(s.tactics.feint,3);
  if(id==="knight")assert.equal(s.tactics.guard,3);
  if(id==="rogue")assert.equal(s.status.evade,1);
 }
});
test("cursed weapons cannot be replaced until cleansed at an Altar",()=>{
 let s=startRun("delver",15);
 s.rooms["0"].id="altar";
 s.inventory.push({kind:"sword",id:"sword",enchant:-1,cursed:true},{kind:"sword",id:"sword",enchant:2,cursed:false});
 s=doAction(s,"equip",s.inventory.findIndex(x=>x.kind==="sword"));
 assert.equal(heroAttack(s),s.attack-1);
 assert.ok(!availableActions(s).some(a=>a.id==="equip"&&s.inventory[a.index]?.kind==="sword"));
 assert.ok(availableActions(s).some(a=>a.id==="cleanse"&&a.target==="weapon"));
 s=doAction(s,"cleanse","weapon");
 assert.equal(s.equipped.weapon.cursed,false);
 assert.equal(s.equipped.weapon.enchant,1);
 assert.equal(s.hp,s.maxHp-2);
 assert.ok(!availableActions(s).some(a=>a.id==="enchant"));
});
test("enchanting costs an action and can be used once at each altar",()=>{
 let s=startRun("knight",77);
 s.rooms["0"].id="altar";
 s.inventory.push({kind:"mail",id:"mail"});
 s=doAction(s,"equip",s.inventory.findIndex(x=>x.kind==="mail"));
 s=doAction(s,"enchant","armour");
 assert.equal(s.rooms["0"].enchanted,true);
 assert.ok([-1,2,3].includes(s.equipped.armour.enchant));
 assert.ok(!availableActions(s).some(a=>a.id==="enchant"||a.id==="cleanse"));
});
test("environmental puzzle consumes existing physical supply",()=>{
 let s=startRun("delver",31);
 s.rooms["0"].id="crypt";
 s.rooms["0"].puzzle={solved:false};
 const stock=s.decks.loot.draw.length,held=s.inventory.length,hunger=s.hunger;
 s=doAction(s,"solve");
 assert.equal(s.hunger,hunger-2);
 assert.equal(s.decks.loot.draw.length,stock-1);
 assert.equal(s.inventory.length,held+1);
 assert.ok(!availableActions(s).some(a=>a.id==="solve"));
});
test("risk-reward bargain costs two HP and consumes one physical object",()=>{
 let s=startRun("delver",49);
 s.rooms["0"].id="shop";s.rooms["0"].bargain={used:false};
 const stock=s.decks.loot.draw.length,hp=s.hp;
 s=doAction(s,"bargain");
 assert.equal(s.hp,hp-2);
 assert.equal(s.bargains,1);
 assert.equal(s.decks.loot.draw.length,stock-1);
 assert.ok(!availableActions(s).some(a=>a.id==="bargain"));
});
test("100 deterministic expeditions retain a reachable main route and deeper pressure",()=>{
 let rooms=0,deep=0;
 for(let seed=1;seed<=100;seed++){
  let s=startRun("knight",seed);
  for(let d=1;d<=10;d++){
   s.hp=Math.max(50,s.hp);s.maxHp=60;s.hunger=24;
   if(currentMonster(s))s.rooms[s.position].monster.hp=0;
   s=doAction(s,"explore",String(d));
   rooms++;
   if(d>=7&&s.rooms[String(d)].monster)deep++;
   assert.ok(s.pressure>=Math.floor(d/3));
  }
 }
 assert.equal(rooms,1000);
 assert.ok(deep>100);
});
