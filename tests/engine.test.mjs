import test from "node:test";
import assert from "node:assert/strict";
import {
 startRun, act, currentRoom, currentMonster, availableActions, validateSave,
 connectedLocations, LAST_FLOOR, MAX_ACTIONS, PHYSICAL_RULES, heroAttack, heroDefense
} from "../src/engine.js";
import { HEROES, MONSTERS, CATALOGUE, BEHAVIOURS, APPEARANCES, EFFECTS, PRINT_COPIES } from "../src/data.js";
const action=(s,id,arg=null)=>{
  const next=act(s,id,arg);
  assert.notStrictEqual(next,s,"Rejected action "+id+"("+arg+")");
  return next;
};
const clear=s=>{if(currentMonster(s))currentMonster(s).hp=0;return s;};
test("catalogue and physical components complete",()=>{
  assert.equal(new Set(CATALOGUE.map(c=>c.type+":"+c.id)).size,CATALOGUE.length);
  assert.ok(CATALOGUE.every(c=>c.title&&c.art&&c.rule&&c.flavor));
  assert.equal(BEHAVIOURS.reduce((n,b)=>n+b.copies,0),10);
  assert.equal(PRINT_COPIES.monster.sentinel,1);
  assert.equal(PRINT_COPIES.room.vault,1);
});
test("reproducible setup and randomized potion mapping",()=>{
  for(const hero of HEROES){
    const s=startRun(hero.id,304);
    assert.deepEqual(s,startRun(hero.id,304));
    assert.equal(s.version,7);
    assert.equal(s.position,"0");
    assert.equal(s.hunger,18);
    assert.equal(s.hp,hero.hp);
    assert.equal(s.actionsLeft,MAX_ACTIONS);
    assert.ok(validateSave(s));
  }
  const w=startRun("wizard",3);
  assert.equal(new Set(Object.values(w.assignments)).size,EFFECTS.length);
  assert.equal(Object.keys(w.assignments).length,APPEARANCES.length);
  assert.equal(w.inventory.filter(i=>i.kind==="potion").length,3);
  assert.equal(startRun("delver",1).inventory.filter(i=>i.kind==="ration").length,2);
  assert.equal(startRun("rogue",1).inventory.filter(i=>i.kind==="key").length,1);
});
test("legacy and malformed saves rejected",()=>{
  assert.equal(validateSave(null),false);
  assert.equal(validateSave({...startRun(),version:1}),false);
  assert.equal(validateSave({...startRun(),position:"99"}),false);
  assert.equal(validateSave({...startRun(),actionsLeft:3}),false);
});
test("hybrid graph comprises spine and side branches",()=>{
  assert.deepEqual(connectedLocations("0"),["1"]);
  assert.deepEqual(connectedLocations("1"),["0","2","1b"]);
  assert.deepEqual(connectedLocations("5b"),["5"]);
  assert.deepEqual(connectedLocations("10"),["9"]);
  assert.equal(LAST_FLOOR,10);
});
test("two actions; end early draws behaviour and costs hunger",()=>{
  let s=startRun("delver",1);
  s=action(s,"explore","1");
  assert.equal(s.actionsLeft,1);
  assert.equal(s.turn,1);
  s=action(s,"end");
  assert.equal(s.turn,2);
  assert.equal(s.actionsLeft,2);
  assert.equal(s.hunger,17);
  clear(s);
  s.rooms["1"].exits=["SIDE","LINK"];
  s=action(s,"explore","1b");
  assert.equal(s.actionsLeft,1);
  assert.ok(s.rooms["1b"]);
  s=action(s,"travel","1");
  assert.equal(s.position,"1");
  assert.equal(s.actionsLeft,2);
  assert.equal(s.turn,3);
});
test("monster blocks unexplored passages but allows retreat",()=>{
  let s=startRun("knight",4);
  s=action(s,"explore","1");
  if(!currentMonster(s)){
    const m=MONSTERS.find(m=>m.id==="goblin");
    s.rooms["1"].monster={...m,maxHp:m.hp,guard:0,frozen:0,blinded:0,ambushed:false,petUsed:false};
  }
  const a=availableActions(s);
  assert.ok(a.some(x=>x.id==="attack"));
  assert.ok(a.some(x=>x.id==="travel"&&x.target==="0"));
  assert.ok(!a.some(x=>x.id==="explore"));
  assert.strictEqual(act(s,"explore","2"),s);
  s=action(s,"travel","0");
  assert.equal(s.position,"0");
  assert.ok(s.rooms["1"].monster.hp>0);
});
test("revisited rooms preserve their contents",()=>{
  let s=startRun("delver",6);
  s=action(s,"explore","1"); clear(s);
  const room=JSON.stringify(s.rooms["1"]);
  s=action(s,"travel","0");
  s=action(s,"travel","1");
  assert.equal(JSON.stringify(s.rooms["1"]),room);
});
test("all deck sizes match the physical kit",()=>{
  const s=startRun("delver",2);
  assert.equal(s.decks.behaviour.draw.length,10);
  assert.ok(s.decks.rooms.draw.length>=20);
  assert.equal(s.decks.monsters.draw.length,20);
  assert.equal(s.decks.events.draw.length,8);
  assert.ok(s.decks.loot.draw.length>30);
});
test("d6 rolls and natural 1/natural 6 rules",()=>{
  assert.deepEqual(PHYSICAL_RULES,{die:6,target:4,normalDamage:2,criticalDamage:3,
    encounterSpine:4,encounterBranch:3});
  let sawOne=false,sawSix=false;
  for(let seed=1;seed<300;seed++){
    let s=startRun("delver",seed);
    s.rooms["0"].monster={...MONSTERS[0],maxHp:80,hp:80,guard:0,frozen:0,blinded:0,ambushed:false,petUsed:false};
    s=action(s,"attack");
    const r=s.lastRoll;
    if(r.roll===1){sawOne=true;assert.equal(r.hit,false);}
    if(r.roll===6){sawSix=true;assert.equal(r.hit,true);assert.equal(r.damage,3);}
    assert.ok(r.roll>=1&&r.roll<=6);
  }
  assert.equal(sawOne,true);
  assert.equal(sawSix,true);
});
test("equipment changes derived attack and defence",()=>{
  let s=startRun("delver",18);
  s.inventory.push({kind:"sword",id:"sword"},{kind:"mail",id:"mail"});
  const base=heroAttack(s), def=heroDefense(s);
  s=action(s,"equip",s.inventory.findIndex(x=>x.kind==="sword"));
  assert.equal(heroAttack(s),base+1);
  s=action(s,"equip",s.inventory.findIndex(x=>x.kind==="mail"));
  assert.equal(heroDefense(s),def+1);
  assert.equal(s.turn,2);
});
test("drinking identifies an appearance",()=>{
  let s=startRun("wizard",222);
  const i=s.inventory.findIndex(x=>x.kind==="potion");
  const id=s.inventory[i].id, effect=s.assignments[id];
  s=action(s,"drink",i);
  assert.equal(s.known[id],effect);
  assert.equal(Object.keys(s.known).length,1);
});
test("behaviour deck reshuffles its ten-card discard",()=>{
  let s=startRun("knight",234);
  s.rooms["0"].monster={...MONSTERS[0],hp:70,maxHp:70,guard:0,frozen:0,blinded:0,ambushed:false,petUsed:false};
  for(let i=0;i<15;i++){
    s.hp=70;s.hunger=24;
    s=action(s,"end");
    assert.ok(BEHAVIOURS.some(b=>b.id===s.lastBehaviour));
  }
  assert.equal(s.decks.behaviour.draw.length,5);
  assert.equal(s.decks.behaviour.discard.length,5);
  assert.equal(s.actionsLeft,2);
});
test("vault gate, amulet retrieval, and explored return path",()=>{
  let s=startRun("knight",2026);
  for(let d=1;d<=LAST_FLOOR;d++){
    clear(s);s.hp=100;s.hunger=24;
    s=action(s,"explore",String(d));
  }
  assert.equal(s.rooms["10"].id,"vault");
  assert.equal(currentMonster(s).id,"sentinel");
  assert.ok(!availableActions(s).some(a=>a.id==="claim"));
  clear(s);
  s=action(s,"claim");
  assert.equal(s.phase,"ascending");
  assert.ok(!availableActions(s).some(a=>a.id==="explore"));
  for(let d=LAST_FLOOR-1;d>=0;d--){
    s.hp=100;s.hunger=24;
    s=action(s,"travel",String(d));
  }
  assert.equal(s.phase,"won");
  assert.equal(availableActions(s).length,0);
});
test("death final and illegal actions preserve state",()=>{
  let s=startRun("rogue",44);
  const before=JSON.stringify(s);
  assert.strictEqual(act(s,"attack"),s);
  assert.equal(JSON.stringify(s),before);
  s.hp=1;s.hunger=0;s=action(s,"end");
  assert.equal(s.phase,"dead");
  assert.equal(s.hp,0);
  assert.deepEqual(availableActions(s),[]);
});
test("500 seeded action-driven runs terminate",()=>{
  for(let seed=1;seed<=500;seed++){
    let s=startRun(HEROES[seed%4].id,seed);
    for(let steps=0;steps<350&&!["won","dead"].includes(s.phase);steps++){
      const a=availableActions(s);
      const chosen=a.find(x=>x.id==="eat"&&s.hunger<12)||
        a.find(x=>x.id==="consume"&&s.hp<s.maxHp-2)||
        a.find(x=>x.id==="throw")||a.find(x=>x.id==="attack")||
        a.find(x=>x.id==="take")||a.find(x=>x.id==="claim")||
        a.find(x=>x.id==="travel"&&s.phase==="ascending"&&!x.target.endsWith("b")&&Number(x.target)<Number(s.position))||
        a.find(x=>x.id==="explore"&&!x.target.endsWith("b"))||
        a.find(x=>x.id==="end");
      assert.ok(chosen,"No actions for seed "+seed);
      const next=act(s,chosen.id,chosen.index??chosen.target??null);
      assert.notStrictEqual(next,s,"Action rejected at seed "+seed);
      s=next;
    }
    assert.ok(["won","dead"].includes(s.phase),"Run "+seed+" never terminated");
  }
});

test("starting items are reserved from the finite printed Object pile",()=>{
  const inventorySizes={delver:2,knight:1,wizard:3,rogue:3};
  for(const [hero,size] of Object.entries(inventorySizes)){
    const s=startRun(hero,55);
    assert.equal(s.decks.loot.draw.length,80-size);
    assert.equal(s.inventory.length,size);
  }
});
function readyForMiddleRegion(seed) {
  const s=startRun("delver",seed);
  for(let i=1;i<=3;i++){
    s.rooms[String(i)]={id:"corridor",title:"Crooked Corridor",region:"UPPER",
      exits:["SIDE","LINK"],monster:null,loot:null,used:false,visited:true};
  }
  s.position="3";
  return s;
}
test("trap damage is fatal before a later event could heal the hero",()=>{
  let tested=0;
  for(let seed=1;seed<=1200;seed++){
    const s=readyForMiddleRegion(seed);
    s.hp=1;
    const after=action(s,"explore","4");
    if(after.rooms["4"].id==="trap" && !after.inventory.some(x=>x.kind==="key")) {
      assert.equal(after.hp,0);
      assert.equal(after.phase,"dead");
      assert.ok(!after.log[0]?.startsWith("Event:"),"An event revived the hero");
      tested++;
      break;
    }
  }
  assert.ok(tested>=1,"No deterministic trap seed found");
});
test("fountain potion comes from the printed Object supply",()=>{
  let checked=0;
  for(let seed=1;seed<=1300;seed++){
    let s=readyForMiddleRegion(seed);
    s=action(s,"explore","4");
    if(s.rooms["4"].id!=="fountain") continue;
    s.rooms["4"].monster=null;
    const before=s.decks.loot.draw.length;
    const held=s.inventory.length;
    s=action(s,"fountain");
    if(s.inventory.length===held+1){
      assert.equal(s.decks.loot.draw.length,before-1);
      checked++;break;
    }
  }
  assert.ok(checked>=1,"No seeded fountain potion result found");
});
