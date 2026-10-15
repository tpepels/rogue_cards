import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession,
 createGame,enterNextRoom,legalActions,randomSource} from "../src/engine/index.js";
import {ROOMS,MONSTERS,OBJECTS,WARDEN,VAULT} from "../src/tabletop-data.js";
const room=id=>ROOMS.find(x=>x.id===id);
const monster=id=>MONSTERS.find(x=>x.id===id);
const advance=(session,match)=>submitDecision(session,sessionActions(session).find(match));
const finishNested=session=>{
 for(let i=0;i<30&&observeSession(session).phase==="reaction";i++){
  advance(session,a=>["continue","skip","keep"].includes(a.kind)||
   a.kind==="enter-shown-room"||a.mode==="save"||
   a.kind==="hero-mode");
 }
 assert.notEqual(observeSession(session).phase,"reaction");
};
test("entry truly pauses before the SAME delayed printed effects as direct engine entry",()=>{
 const session=createDecisionSession({seed:9031,heroes:["warrior"]});
 const direct=createGame({seed:9031,heroes:["warrior"]});
 assert.equal(session.phase,"between-rooms");
 assert.ok(sessionActions(session).some(a=>a.kind==="continue"));
 advance(session,a=>a.kind==="continue");
 assert.equal(session.phase,"explore");
 enterNextRoom(direct);
 assert.equal(session.state.room.id,direct.room.id);
 assert.deepEqual(session.state.heroes.map(h=>h.hp),direct.heroes.map(h=>h.hp));
 assert.equal(session.state.metrics.roomRollBands[session.state.room.id+":0"],
  direct.metrics.roomRollBands[direct.room.id+":0"]);
 // Exploration is optional; advancing does not select a Room choice.
 assert.equal(Object.keys(session.state.metrics.roomChoices).length,0);
 while(session.phase==="explore")advance(session,a=>a.kind==="continue");
 assert.equal(session.phase,"room");
 assert.deepEqual(sessionActions(session).map(a=>a.index),
  legalActions(direct,{phase:"room"}).map(a=>a.index));
 advance(session,a=>a.index===0||a.kind==="room-choice");
 finishNested(session);
 assert.equal(Object.values(session.state.metrics.roomChoices).reduce((a,b)=>a+b,0),1);
});
test("retained Well decision is prompted before entry, not preset days earlier",()=>{
 const session=createDecisionSession({seed:9032,heroes:["warrior"]});
 const s=session.state;
 s.stageProgress.UPPER=3;s.stageProgress.MIDDLE=3;
 const held=s.deck.find(c=>c.id==="rope");
 assert.ok(held);
 s.keptRooms.push({card:room("m-well"),item:null});
 advance(session,a=>a.kind==="continue");
 assert.equal(session.phase,"retained-entry");
 assert.equal(session.returnRoomId,"m-well");
 assert.deepEqual(sessionActions(session).map(x=>x.mode),["leave","roll"]);
 const hp=s.chooseActor().hp;
 advance(session,a=>a.mode==="leave");
 assert.equal(s.returnChoices["m-well"],"leave");
 assert.notEqual(session.phase,"retained-entry");
 assert.ok(s.chooseActor().hp>=hp);
 assert.ok(!s.keptRooms.some(x=>x.card.id==="m-well"));
});
test("combat has a separate player action and Monster response, then full rewards",()=>{
 const session=createDecisionSession({seed:9033,heroes:["warrior"]});
 const s=session.state;
 advance(session,a=>a.kind==="continue");
 while(session.phase==="explore")advance(session,a=>a.kind==="continue");
 // Construct a printed Monster at the normal rules boundary.
 s.monster=monster("rat");s.monsterHP=3;
 const choose=sessionActions(session)[0];
 advance(session,a=>a.index===choose.index);
 finishNested(session);
 assert.equal(session.phase,"parley");
 assert.deepEqual(sessionActions(session).map(a=>a.kind),["fight","parley"]);
 advance(session,a=>a.kind==="fight");
 assert.equal(session.phase,"combat-hero");
 let combatActs=0,responses=0;
 while(["combat-hero","combat","monster-response","reaction"].includes(
  observeSession(session).phase)&&combatActs<80){
  if(observeSession(session).phase==="reaction"){
   advance(session,a=>["continue","skip","keep"].includes(a.kind)||
    a.kind==="hero-mode");
  }else if(session.phase==="combat-hero"){
   advance(session,a=>a.kind==="choose-hero-turn");
  }else if(session.phase==="combat"){
   advance(session,a=>a.kind==="attack");combatActs++;
  }else{
   advance(session,a=>a.kind==="respond");responses++;
  }
 }
 assert.ok(combatActs>=1);
 assert.ok(session.actionCount>=combatActs+responses);
 assert.ok(["corpse","between-rooms","terminal"].includes(session.phase));
 if(session.phase==="corpse"){
  const before=s.metrics.corpses;
  advance(session,a=>a.kind==="leave");
  assert.equal(s.metrics.corpses,before);
  assert.ok(["between-rooms","terminal"].includes(session.phase));
 }
 assert.ok(session.phase!=="combat");
});
test("the Warden attacking both Heroes ends combat immediately after the second death",()=>{
 const session=createDecisionSession({seed:4223,heroes:["warrior","rogue"]});
 const s=session.state;
 s.beginRoom(VAULT);
 for(const h of s.heroes){
  for(const card of [...h.inventory])s.remove(h,card);
  h.hp=1;
 }
 s.monster=WARDEN;s.monsterHP=WARDEN.hp;
 // Printed Warden Blade (3-4): attack each Hero.
 s.forcedBehavior=3;
 // The real opposed d20 attack/defence dice hit both Heroes.
 s.rng=randomSource(833);
 s._actedCombatMask=1;
 session.phase="monster-response";session.heroIndex=0;
 assert.deepEqual(sessionActions(session),[
  {phase:"monster-response",kind:"respond",heroIndex:0}
 ]);
 const reply=submitDecision(session,sessionActions(session)[0]);
 assert.equal(reply.phase,"terminal");
 assert.deepEqual(s.heroes.map(h=>h.hp),[0,0]);
 assert.deepEqual(sessionActions(session),[]);
 assert.equal(s.metrics.won,false);
 assert.equal(s.metrics.roundLimit,false);
});

test("a lethal Wand reroll cannot request a dead Hero's Crown in canonical combat",()=>{
 const session=createDecisionSession({seed:120659042,heroes:["warrior"]});
 const s=session.state,h=s.heroes[0];
 // Keep the original physical copies, including a possible initial draw.
 for(const card of [...h.inventory])
  if(!["wand-undo","crown-relic"].includes(card.id))s.remove(h,card);
 for(const id of ["wand-undo","crown-relic"]){
  if(h.inventory.some(card=>card.id===id))continue;
  const index=s.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,"Missing physical copy of "+id);
  const [card]=s.deck.splice(index,1);
  s.noteDeckRemoval(card);s.add(h,card);
 }
 h.hp=1;s.beginRoom(VAULT);
 s.monster=WARDEN;s.monsterHP=WARDEN.hp;
 s.rng=randomSource(1);
 session.phase="combat";session.heroIndex=0;
 const attack=sessionActions(session).find(a=>a.kind==="attack");
 assert.ok(attack);
 const pending=submitDecision(session,attack);
 assert.equal(pending.phase,"reaction");
 const wandChoice=sessionActions(session).find(a=>
  a.phase==="after-roll"&&a.cardId==="wand-undo"&&
  a.kind==="item-trigger");
 assert.ok(wandChoice,"The live Hero may choose a Wand after its failed d20");
 assert.doesNotThrow(()=>submitDecision(session,wandChoice),
  "The Wand misfire must not create an illegal dead-Hero Crown prompt");
 assert.equal(s.heroes[0].hp,0);
 assert.equal(session.phase,"terminal");
 assert.equal(s.metrics.won,false);
 assert.deepEqual(sessionActions(session),[]);
 assert.ok(s.heroes[0].inventory.some(x=>x.id==="crown-relic"),
  "The unspent Crown remains physical but cannot activate after death");
});

test("a lethal Priest Blessing during an affordable SEAL ends the decision at party defeat",()=>{
 const session=createDecisionSession({seed:4452,heroes:["priest"]});
 const s=session.state;
 for(const stage of ["UPPER","MIDDLE","DEEP"])s.stageProgress[stage]=3;
 s.beginRoom(VAULT);
 session.phase="vault";
 // Obtain actual physical MAGIC cards from the original deck.
 while(!s.discardable(3,"MAGIC")){
  const i=s.deck.findIndex(c=>c.v2.tags.includes("MAGIC")&&
   !c.v2.tags.includes("CURSED")&&c.id!=="crown-relic");
  assert.ok(i>=0,"Three physical MAGIC payments must be available");
  const [card]=s.deck.splice(i,1);
  s.noteDeckRemoval(card);s.add(s.heroes[0],card);
 }
 s.heroes[0].hp=1;
 // First printed risky Priest result is 1, and its HP die is also 1.
 s.rng=randomSource(1);
 const sealAction=sessionActions(session).find(a=>a.kind==="seal");
 assert.ok(sealAction,"Actual printed SEAL is affordable");
 submitDecision(session,sealAction);
 let risky=false;
 for(let steps=0;steps<40&&session.pendingNested;steps++){
  const actions=sessionActions(session);
  const selected=actions.find(a=>a.phase==="hero-trigger"&&
   a.mode==="risk")||
   actions.find(a=>a.kind==="discard-card")||
   actions.find(a=>a.kind==="continue")||actions[0];
  assert.ok(selected,"The printed transaction must have a legal reaction");
  if(selected.phase==="hero-trigger")risky=true;
  submitDecision(session,selected);
 }
 assert.ok(risky,"The actual Priest blessing was offered during SEAL");
 assert.equal(session.pendingNested,null);
 assert.equal(s.heroes[0].hp,0);
 assert.equal(session.phase,"terminal");
 assert.deepEqual(sessionActions(session),[]);
 assert.equal(s.metrics.won,false);
 assert.equal(s.monster,null,
  "A dead party must not start a Warden encounter");
});

test("Vault is a real paused SEAL versus Warden decision and has an actual ending",()=>{
 const session=createDecisionSession({seed:9034,heroes:["wizard"]});
 const s=session.state;
 for(const st of ["UPPER","MIDDLE","DEEP"])s.stageProgress[st]=3;
 advance(session,a=>a.kind==="continue");
 assert.equal(s.room.id,"vault");
 assert.equal(session.phase,"vault");
 assert.ok(sessionActions(session).some(a=>a.kind==="fight"));
 advance(session,a=>a.kind==="fight");
 assert.equal(s.monster.id,"warden");
 assert.equal(session.phase,"combat-hero");
 advance(session,a=>a.kind==="choose-hero-turn");
 assert.equal(session.phase,"combat");
 assert.ok(sessionActions(session).some(a=>a.kind==="attack"));
 assert.throws(()=>submitDecision(session,{phase:"vault",kind:"seal"}),/Illegal pending/);
});
test("a playable seeded expedition uses no scripted bots or unimplemented choice transitions",()=>{
 for(const seed of [6,19,31,47]){
  const session=createDecisionSession({seed,heroes:["warrior","wizard"]});
  for(let i=0;i<7000&&session.phase!=="terminal";i++){
   const actions=sessionActions(session);
   assert.ok(actions.length>0,"No legal player action: "+session.phase);
   let chosen=actions.find(a=>a.kind==="continue")||
    actions.find(a=>a.kind==="fight")||
    actions.find(a=>a.kind==="room-choice")||
    actions.find(a=>a.kind==="leave")||
    actions.find(a=>a.kind==="respond")||
    actions.find(a=>a.kind==="attack")||actions[0];
   submitDecision(session,chosen);
  }
  assert.equal(session.phase,"terminal", "Session failed to terminate: "+seed);
  const snap=observeSession(session);
  assert.equal(snap.actions.length,0);
  assert.ok(snap.game.won||!session.state.alive()||session.state.metrics.escaped,
   "Terminal session must reflect a genuine printed ending");
  assert.ok(session.state.metrics.cleared>=0);
 }
});


test("transactional Room rerolls pause before HP, Item or RNG is spent",()=>{
 const session=createDecisionSession({seed:1842,heroes:["warrior"]});
 const s=session.state;
 s.beginRoom(room("u-fountain"));session.phase="room";
 const hp=s.heroes[0].hp,random=s.rng.snapshot();
 const first=submitDecision(session,sessionActions(session)[0]);
 assert.equal(first.phase,"reaction");
 assert.equal(first.trigger.phase,"reroll");
 assert.equal(first.trigger.cost,1);
 assert.equal(s.heroes[0].hp,hp);
 assert.equal(s.rng.snapshot(),random,"Paused dice cannot leak into real RNG");
 assert.ok(first.actions.some(a=>a.kind==="keep"));
 submitDecision(session,first.actions.find(a=>a.kind==="keep"));
 assert.equal(session.pendingNested,null);
 assert.notEqual(session.phase,"room");
});
test("damage-triggered Mirror use and skipping are genuinely different legal actions",()=>{
 const setup=()=>{
  const session=createDecisionSession({seed:1843,heroes:["warrior"]});
  const s=session.state;
  s.beginRoom(room("u-nest"));
  const i=s.deck.findIndex(c=>c.id==="mirror");
  assert.ok(i>=0);const [mirror]=s.deck.splice(i,1);
  s.noteDeckRemoval(mirror);s.add(s.heroes[0],mirror);
  s.monster=monster("rat");s.monsterHP=s.monster.hp;
  s.forcedBehavior=4;
  session.phase="monster-response";session.heroIndex=0;
  return session;
 };
 const skip=setup(),use=setup(),before=skip.state.rng.snapshot();
 for(const session of [skip,use]){
  const r=submitDecision(session,sessionActions(session)[0]);
  assert.equal(r.phase,"reaction");
  assert.equal(r.trigger.phase,"before-defence");
  assert.ok(r.actions.some(a=>a.kind==="continue"));
  assert.ok(r.actions.some(a=>a.cardId==="mirror"));
 }
 assert.equal(skip.state.rng.snapshot(),before);
 submitDecision(skip,sessionActions(skip).find(a=>a.kind==="continue"));
 submitDecision(use,sessionActions(use).find(a=>a.cardId==="mirror"));
 assert.equal(skip.state.metrics.objectActivations.mirror||0,0);
 assert.ok(use.state.metrics.objectActivations.mirror>=1);
 assert.equal(skip.pendingNested,null);
 assert.equal(use.pendingNested,null);
});
test("a Monster responds to the surviving Hero when the acting Hero dies during a combat Item",()=>{
 const session=createDecisionSession({seed:3573,heroes:["warrior","wizard"]});
 const s=session.state;
 s.beginRoom(room("d-last-bell"));
 s.monster=monster("wraith");s.monsterHP=50;
 session.phase="combat";session.heroIndex=0;
 const owner=s.heroes[0];
 let wand=owner.inventory.find(x=>x.id==="wand-sparks");
 if(!wand){
  const other=s.heroes[1],
   held=other.inventory.findIndex(x=>x.id==="wand-sparks");
  if(held>=0){
   [wand]=other.inventory.splice(held,1);
   s.add(owner,wand);
  }else{
   const pos=s.deck.findIndex(x=>x.id==="wand-sparks");
   assert.ok(pos>=0,"Physical Wand Sparks must exist");
   [wand]=s.deck.splice(pos,1);
   s.noteDeckRemoval(wand);s.add(owner,wand);
  }
 }
 owner.hp=2;
 const beforeWandDie=s.rng.clone().die(6);
 // Guarantee overcharge's printed HP loss kills the acting Hero.
 if(beforeWandDie<2){
  // The actual RNG is used below; skip no behavior or chance outcome.
  // Search a fixed finite prefix of real RNG states to reach damage >=2.
  for(let i=0;i<128&&s.rng.clone().die(6)<2;i++)s.die();
 }
 assert.ok(s.rng.clone().die(6)>=2);
 const action=sessionActions(session).find(a=>
  a.kind==="item"&&a.cardId==="wand-sparks"&&a.mode==="overcharge");
 assert.ok(action,"Wand must offer its printed overcharge combat action");
 submitDecision(session,action);
 assert.equal(s.heroes[0].hp,0);
 assert.equal(session.phase,"monster-response");
 assert.equal(session.heroIndex,1,
  "The remaining living Hero receives the Monster response");
 assert.deepEqual(sessionActions(session),[
  {phase:"monster-response",kind:"respond",heroIndex:1}
 ]);
 submitDecision(session,sessionActions(session)[0]);
 if(session.pendingNested)finishNested(session);
 assert.notEqual(session.phase,"monster-response",
  "No dead-Hero action deadlock after the canonical Monster response");
 assert.equal(s.heroes[1].hp>0,true,
  "The surviving Hero remains a real target after the response");
});

test("a pending Monster response cannot deadlock on a defeated active Hero",()=>{
 const session=createDecisionSession({seed:1589946866,
  heroes:["wizard","warrior"]});
 const s=session.state;
 s.beginRoom(room("d-last-bell"));
 s.monster=monster("wraith");s.monsterHP=s.monster.hp;
 s.heroes[0].hp=0;s.heroes[1].hp=17;
 session.phase="monster-response";session.heroIndex=0;
 const actions=sessionActions(session);
 assert.deepEqual(actions,[{phase:"monster-response",
  kind:"respond",heroIndex:1}]);
 submitDecision(session,actions[0]);
 if(session.pendingNested)finishNested(session);
 assert.notEqual(session.phase,"monster-response");
 assert.ok(s.heroes[1].hp>0);
});

test("Wizard can decline or choose an actual ability at the attack trigger",()=>{
 const session=createDecisionSession({seed:1844,heroes:["wizard"]});
 const s=session.state;
 s.beginRoom(room("u-nest"));s.strategy="magic";
 s.monster=monster("rat");s.monsterHP=12;
 session.phase="combat";session.heroIndex=0;
 const r=submitDecision(session,sessionActions(session).find(x=>x.kind==="attack"));
 assert.equal(r.phase,"reaction");
 assert.equal(r.trigger.phase,"hero-trigger");
 assert.equal(r.trigger.heroId,"wizard");
 assert.deepEqual(r.actions.map(a=>a.kind),["skip","hero-mode","hero-mode"]);
 submitDecision(session,r.actions.find(a=>a.mode==="steady"));
 assert.equal(s.heroes[0].used.has("hero"),true);
 assert.equal(s.monsterHP,10);
});
test("first DEEP Monster exposes retained Hollow Knight escape/save in the middle of a Room effect",()=>{
 const session=createDecisionSession({seed:1845,heroes:["warrior"]});
 const s=session.state;
 s.beginRoom(room("d-bones"));
 s.keptRooms.push({card:room("u-hollow-knight"),choice:0});
 session.phase="room";
 const choice=sessionActions(session).find(a=>a.index===1);
 const r=submitDecision(session,choice);
 assert.equal(r.phase,"reaction");
 assert.equal(r.trigger.phase,"retained");
 assert.equal(r.trigger.roomId,"u-hollow-knight");
 assert.ok(r.trigger.monsterId);
 submitDecision(session,r.actions.find(x=>x.mode==="escape"));
 assert.ok(!s.keptRooms.some(x=>x.card.id==="u-hollow-knight"));
 assert.notEqual(session.phase,"parley");
});


test("revealed corridor branches stop at a real player decision instead of scripted sorting",()=>{
 const session=createDecisionSession({seed:1846,heroes:["warrior"]});
 const s=session.state;
 s.beginRoom(room("u-fork"));session.phase="room";
 const r=submitDecision(session,sessionActions(session).find(a=>a.index===0));
 assert.equal(r.phase,"reaction");
 assert.equal(r.trigger.phase,"corridor");
 assert.equal(r.actions.length,2);
 assert.ok(r.actions.every(a=>a.kind==="enter-shown-room"));
 assert.deepEqual(r.actions.map(a=>a.roomId),r.trigger.offeredIds);
 const next=r.actions[1],discarded=r.actions[0].roomId;
 submitDecision(session,next);
 assert.equal(s.rooms.UPPER[0].id,next.roomId);
 assert.ok(!s.discardedRoomIds.has(discarded));
 assert.ok(s.publicBottomRoomIds.UPPER.includes(discarded));
 assert.ok(s.rooms.UPPER.some(x=>x.id===discarded));
 assert.equal(session.pendingNested,null);
});
test("forking remaining RNG states yields the same results without consuming source dice",()=>{
 const session=createDecisionSession({seed:1847,heroes:["warrior"]});
 const game=session.state,initial=game.rng.snapshot();
 const next=game.rng.clone();
 assert.equal(game.rng.snapshot(),initial);
 assert.equal(next.die(20),game.rng.die(20));
 assert.notEqual(next.snapshot(),initial);
});


test("Ashwood Staff replaces (never stacks with) a printed Shrine Room choice",()=>{
 const session=createDecisionSession({seed:1960,heroes:["warrior"]}),s=session.state;
 const i=s.deck.findIndex(o=>o.id==="staff");
 assert.ok(i>=0);
 const [staff]=s.deck.splice(i,1);s.noteDeckRemoval(staff);
 s.add(s.heroes[0],staff);s.heroes[0].slots.weapon=staff;
 s.beginRoom(room("u-shrine"));session.phase="room";
 s.hurt(s.heroes[0],3);
 const options=sessionActions(session);
 assert.equal(options.filter(x=>x.kind==="room-choice").length,2);
 assert.ok(options.some(x=>x.kind==="shrine-item"&&x.mode==="heal"));
 const before=s.heroes[0].hp;
 advance(session,x=>x.kind==="shrine-item"&&x.mode==="heal");
 assert.equal(s.heroes[0].hp,Math.min(s.heroes[0].card.hp,before+2));
 assert.equal(Object.keys(s.metrics.roomChoices).length,0);
 assert.equal(s.metrics.itemUses.staff.total,1);
});
test("Lantern Heart and Ghost Coin pay exact Item costs when chosen",()=>{
 const session=createDecisionSession({seed:1961,heroes:["warrior"]}),s=session.state;
 const grant=id=>{
  const i=s.deck.findIndex(x=>x.id===id);assert.ok(i>=0);
  const [c]=s.deck.splice(i,1);s.noteDeckRemoval(c);s.add(s.heroes[0],c);
  return c;
 };
 s.beginRoom(room("u-shrine"));session.phase="explore";
 const wand=grant("wand-sparks"),lantern=grant("lantern-heart");
 s.exhausted.add(wand);
 const use=sessionActions(session).find(x=>x.cardId==="lantern-heart"&&x.mode==="recharge");
 assert.ok(use);
 advance(session,x=>x.cardId==="lantern-heart"&&x.mode==="recharge");
 assert.ok(!s.heroes[0].inventory.includes(lantern));
 assert.ok(!s.exhausted.has(wand));
 const second=createDecisionSession({seed:1962,heroes:["warrior"]});
 const t=second.state;t.beginRoom(room("u-merchant"));second.phase="explore";
 const i=t.deck.findIndex(c=>c.id==="coin");assert.ok(i>=0);
 const [coin]=t.deck.splice(i,1);t.noteDeckRemoval(coin);t.add(t.heroes[0],coin);
 const action=sessionActions(second).find(x=>x.cardId==="coin");
 assert.ok(action);
 submitDecision(second,action);
 assert.ok(!t.heroes[0].inventory.includes(coin));
 assert.ok((t.metrics.objectActivations.coin||0)>=1);
});


test("either Hero may act first in combat and PASS consumes exactly one Hero turn",()=>{
 const session=createDecisionSession({seed:1981,heroes:["warrior","wizard"]}),s=session.state;
 s.beginRoom(room("u-nest"));
 s.monster=monster("rat");s.monsterHP=s.monster.hp;
 session.phase="combat-hero";session.heroIndex=-1;
 s._actedCombatMask=0;
 assert.deepEqual(sessionActions(session).map(x=>x.heroIndex),[0,1]);
 advance(session,a=>a.kind==="choose-hero-turn"&&a.heroIndex===1);
 assert.equal(session.phase,"combat");
 assert.ok(sessionActions(session).some(a=>a.kind==="pass"));
 advance(session,a=>a.kind==="pass");
 assert.equal(session.phase,"monster-response");
 assert.equal(s._actedCombatMask,2);
 advance(session,a=>a.kind==="respond");
 assert.equal(session.phase,"combat-hero");
 assert.deepEqual(sessionActions(session).map(x=>x.heroIndex),[0]);
 advance(session,a=>a.heroIndex===0);
 assert.ok(sessionActions(session).some(a=>a.kind==="attack"));
});
test("actual between-Room equipment can be unequipped and exchanged without creating Items",()=>{
 const session=createDecisionSession({seed:1982,heroes:["warrior","wizard"]}),s=session.state;
 const i=s.deck.findIndex(c=>c.id==="sword");assert.ok(i>=0);
 const card=s.deck.splice(i,1)[0];s.noteDeckRemoval(card);
 s.add(s.heroes[0],card);
 assert.ok(s.equipped(s.heroes[0],"sword"));
 const acquired=s.metrics.objectAcquisitions.sword;
 const undo=sessionActions(session).find(a=>a.kind==="unequip"&&
  a.heroIndex===0&&a.cardId==="sword");
 assert.ok(undo);
 submitDecision(session,undo);
 assert.equal(s.equipped(s.heroes[0],"sword"),false);
 const transfer=sessionActions(session).find(a=>a.kind==="transfer"&&
  a.heroIndex===0&&a.toHeroIndex===1&&a.cardId==="sword");
 assert.ok(transfer);
 const fromBefore=s.heroes[0].inventory.filter(c=>c.id==="sword").length;
 const toBefore=s.heroes[1].inventory.filter(c=>c.id==="sword").length;
 submitDecision(session,transfer);
 // Multiple physical copies of the same Item share an immutable definition
 // object; assert *counts*, not reference-based inventory membership.
 assert.equal(s.heroes[0].inventory.filter(c=>c.id==="sword").length,
  fromBefore-1);
 assert.equal(s.heroes[1].inventory.filter(c=>c.id==="sword").length,
  toBefore+1);
 assert.equal(s.metrics.objectAcquisitions.sword,acquired);
 const equip=sessionActions(session).find(a=>a.kind==="equip"&&
  a.heroIndex===1&&a.cardId==="sword");
 assert.ok(equip);
 submitDecision(session,equip);
 assert.ok(s.equipped(s.heroes[1],"sword"));
});

test("saved corridor path is an observed, searchable choice before the next Room",()=>{
 for(const mode of ["drawn","saved"]){
  const session=createDecisionSession({seed:31229,heroes:["warrior"]});
  const s=session.state,pile=s.rooms.UPPER;
  const index=pile.findIndex(card=>card.id==="u-gate");
  assert.ok(index>=0);
  const [saved]=pile.splice(index,1);
  const drawn=pile[0];
  s.savedPath=saved;s.savedPathGrace=0;
  const before=s.rng.snapshot();
  const continueAction=sessionActions(session).find(a=>a.kind==="continue");
  assert.ok(continueAction,"Room entry requires the explicit continue action");
  const pending=submitDecision(session,continueAction);
  assert.equal(pending.phase,"reaction");
  assert.equal(pending.trigger.phase,"effect-choice");
  assert.equal(pending.trigger.context,"saved-corridor-exit");
  assert.deepEqual(pending.game.offeredSavedPath,{
   drawn:drawn.id,saved:saved.id,stage:"UPPER"
  });
  assert.deepEqual(pending.actions.map(a=>a.mode),["drawn","saved"]);
  assert.equal(s.rng.snapshot(),before,
   "A suspended Room choice must not consume real dice");
  submitDecision(session,pending.actions.find(a=>a.mode===mode));
  assert.equal(s.room.id,mode==="saved"?saved.id:drawn.id);
  const deferred=mode==="saved"?drawn:saved;
  assert.ok(s.rooms.UPPER.includes(deferred));
  assert.equal(s.savedPath,null);
  assert.equal(s._pendingRoomSwap,undefined);
 }
});

test("nested reroll replay preserves an earlier sampled result before switching unseen future",()=>{
 const session=createDecisionSession({seed:1842,heroes:["warrior"]});
 const s=session.state;
 s.beginRoom(ROOMS.find(r=>r.id==="u-fountain"));
 session.phase="room";
 const initial=submitDecision(session,sessionActions(session)[0]);
 assert.equal(initial.phase,"reaction");
 assert.equal(initial.trigger.phase,"reroll");
 const rootDice=s.rng.snapshot();
 const reroll=initial.actions.find(a=>a.kind==="reroll");
 assert.ok(reroll,"First push-your-luck reroll should be affordable");
 const second=submitDecision(session,reroll,{
  replayAt:1,afterReactionReplay:state=>state.rng.restore(123)
 });
 assert.equal(second.phase,"reaction");
 assert.equal(second.trigger.phase,"reroll");
 assert.equal(second.trigger.cost,2);
 assert.equal(s.rng.snapshot(),rootDice,
  "Original RNG stays untouched during both suspended reactions");
 const selected=second.actions.find(a=>a.kind==="keep");
 assert.ok(selected);
 const seen=[];
 submitDecision(session,selected,{replaySwitches:[
  {at:1,callback:state=>{seen.push(1);state.rng.restore(123);}},
  {at:2,callback:state=>{seen.push(2);state.rng.restore(567);}}
 ]});
 assert.deepEqual(seen,[1,2]);
});

test("Coffin Moth curing poison invalidates the next Ring of the Mold King reaction",()=>{
 const session=createDecisionSession({seed:118,heroes:["warrior"]});
 const state=session.state,hero=state.heroes[0];
 for(const card of [...hero.inventory])
  if(!["moth","ring-spores"].includes(card.id))state.remove(hero,card);
 for(const id of ["moth","ring-spores"]){
  if(hero.inventory.some(card=>card.id===id))continue;
  const index=state.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,"Missing original physical "+id);
  const [card]=state.deck.splice(index,1);
  state.noteDeckRemoval(card);state.add(hero,card);
 }
 assert.equal(hero.slots.companion?.id,"moth");
 assert.equal(hero.slots.ring?.id,"ring-spores");
 hero.poison=true;
 state.room=room("d-bones");
 state.monster=monster("sentinel");
 state.monsterHP=state.monster.hp;
 state.forcedBehavior=1; // Printed Sentinel 1-2: no damage.
 state.rng=randomSource(5376); // Moth d6=3: REMOVE POISONED.
 session.phase="monster-response";
 session.heroIndex=0;
 const respond=sessionActions(session).find(a=>a.kind==="respond");
 assert.ok(respond);
 submitDecision(session,respond);
 const moth=sessionActions(session).find(a=>
  a.kind==="item-trigger"&&a.cardId==="moth"&&a.phase==="on-poison");
 assert.ok(moth,"The still-poisoned Hero has a real Coffin Moth choice");
 assert.doesNotThrow(()=>submitDecision(session,moth));
 assert.equal(state.heroes[0].poison,false);
 assert.notEqual(observeSession(session).phase,"reaction");
 assert.equal(state.metrics.objectActivations.moth,1);
 assert.equal(state.metrics.objectActivations["ring-spores"]||0,0);
 assert.deepEqual(sessionActions(session).filter(a=>a.cardId==="ring-spores"),[]);
});

test("skipping Coffin Moth retains the legal Ring of the Mold King poison reaction",()=>{
 const session=createDecisionSession({seed:119,heroes:["warrior"]});
 const state=session.state,hero=state.heroes[0];
 for(const card of [...hero.inventory])
  if(!["moth","ring-spores"].includes(card.id))state.remove(hero,card);
 for(const id of ["moth","ring-spores"]){
  if(hero.inventory.some(card=>card.id===id))continue;
  const index=state.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0);
  const [card]=state.deck.splice(index,1);
  state.noteDeckRemoval(card);state.add(hero,card);
 }
 hero.poison=true;
 state.room=room("d-bones");
 state.monster=monster("sentinel");
 state.monsterHP=state.monster.hp;
 state.forcedBehavior=1;
 session.phase="monster-response";
 session.heroIndex=0;
 submitDecision(session,sessionActions(session).find(a=>a.kind==="respond"));
 const skipMoth=sessionActions(session).find(a=>a.kind==="continue");
 assert.ok(skipMoth);
 submitDecision(session,skipMoth);
 assert.equal(state.heroes[0].poison,true);
 const ring=sessionActions(session).find(a=>a.cardId==="ring-spores"&&
  a.phase==="on-poison"&&a.kind==="item-trigger");
 assert.ok(ring,"Skipping Moth leaves the independently legal Ring reaction");
});


const parity=(fast,reference)=>{
 assert.deepEqual(observeSession(fast),observeSession(reference));
 assert.equal(fast.state.rng.snapshot(),reference.state.rng.snapshot());
 assert.equal(fast.actionCount,reference.actionCount);
 assert.deepEqual(fast.history,reference.history);
};
const pairedAction=(fast,reference,match)=>{
 const a=sessionActions(fast).find(match);
 const b=sessionActions(reference).find(match);
 assert.ok(a&&b,"Expected same legal canonical action");
 assert.deepEqual(a,b);
 const resultFast=submitDecision(fast,a);
 const resultReference=submitDecision(reference,b,{transactional:false});
 assert.deepEqual(resultFast,resultReference);
 parity(fast,reference);
};
test("transactional equipment changes match the full fork and preserve all physical aliases",()=>{
 const fast=createDecisionSession({seed:59321,heroes:["warrior","witch"]});
 const reference=createDecisionSession({seed:59321,heroes:["warrior","witch"]});
 const sword=fast.state.heroes[0].inventory.find(c=>c.id==="sword");
 assert.ok(sword,"Warrior needs original starting Sword");
 assert.strictEqual(fast.state.heroes[0].slots.weapon,sword);
 pairedAction(fast,reference,a=>a.kind==="unequip"&&a.cardId==="sword");
 pairedAction(fast,reference,a=>a.kind==="equip"&&a.cardId==="sword");
 pairedAction(fast,reference,a=>a.kind==="transfer"&&a.cardId==="sword"&&a.toHeroIndex===1);
 const moved=fast.state.heroes[1].inventory.find(c=>c.id==="sword");
 assert.strictEqual(moved,sword,"Transfer does not manufacture a different Sword");
 pairedAction(fast,reference,a=>a.kind==="equip"&&a.cardId==="sword");
 assert.strictEqual(fast.state.heroes[1].slots.weapon,sword);
 pairedAction(fast,reference,a=>a.kind==="unequip"&&a.cardId==="sword");
 pairedAction(fast,reference,a=>a.kind==="transfer"&&a.cardId==="sword"&&a.toHeroIndex===0);
 assert.strictEqual(fast.state.heroes[0].inventory.find(c=>c.id==="sword"),sword);
});

test("transactional safe phase transitions are identical to fully copied canonical decisions",()=>{
 const fast=createDecisionSession({seed:45321,heroes:["warrior","witch"]});
 const reference=createDecisionSession({seed:45321,heroes:["warrior","witch"]});
 pairedAction(fast,reference,a=>a.phase==="between-rooms"&&a.kind==="continue");
 assert.equal(fast.phase,"explore");
 pairedAction(fast,reference,a=>a.phase==="explore"&&a.kind==="continue");
 assert.equal(fast.phase,"explore");
 pairedAction(fast,reference,a=>a.phase==="explore"&&a.kind==="continue");
 assert.equal(fast.phase,"room");
 const rat=monster("rat");
 for(const session of [fast,reference]){
  session.state.monster=rat;session.state.monsterHP=rat.hp;
  session.phase="parley";
 }
 parity(fast,reference);
 pairedAction(fast,reference,a=>a.phase==="parley"&&a.kind==="fight");
 assert.equal(fast.phase,"combat-hero");
 pairedAction(fast,reference,a=>a.phase==="combat-hero"&&a.kind==="choose-hero-turn");
 assert.equal(fast.phase,"combat");
});

test("transactional equipment rollback restores the precise original objects after partial failure",()=>{
 const session=createDecisionSession({seed:6231,heroes:["warrior","witch"]});
 const sword=session.state.heroes[0].inventory.find(c=>c.id==="sword");
 const receiving=session.state.heroes[1].inventory;
 const originalPush=receiving.push;
 const action=sessionActions(session).find(a=>
  a.kind==="transfer"&&a.cardId==="sword"&&a.toHeroIndex===1);
 assert.ok(action);
 const before=JSON.stringify(observeSession(session));
 const rng=session.state.rng.snapshot();
 const sourceArray=session.state.heroes[0].inventory;
 receiving.push=function(...items){
  Array.prototype.push.apply(this,items);
  throw Error("injected error after actual inventory mutation");
 };
 try{
  assert.throws(()=>submitDecision(session,action),/injected error/);
 }finally{
  if(Object.prototype.hasOwnProperty.call(receiving,"push"))delete receiving.push;
  assert.strictEqual(receiving.push,originalPush);
 }
 assert.strictEqual(session.state.heroes[0].inventory,sourceArray);
 assert.strictEqual(session.state.heroes[1].inventory,receiving);
 assert.strictEqual(session.state.heroes[0].inventory.find(c=>c.id==="sword"),sword);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),rng);
 assert.equal(session.actionCount,0);
 assert.deepEqual(session.history,[]);
});

test("transactional mode never bypasses canonical copy/replay for nested Room reactions",()=>{
 const fast=createDecisionSession({seed:1842,heroes:["warrior"]});
 const reference=createDecisionSession({seed:1842,heroes:["warrior"]});
 for(const session of [fast,reference]){
  session.state.beginRoom(room("u-fountain"));
  session.phase="room";
 }
 pairedAction(fast,reference,a=>a.kind==="room-choice"&&a.index===0);
 assert.equal(observeSession(fast).phase,"reaction");
 assert.deepEqual(fast.state.heroes.map(h=>h.hp),
  reference.state.heroes.map(h=>h.hp),"Interrupted rolls cannot leak HP changes");
 pairedAction(fast,reference,a=>a.kind==="keep");
});


test("silent canonical transitions preserve every legal action, die and observation",()=>{
 for(const heroes of [["warrior"],["warrior","witch"]]){
  const fast=createDecisionSession({seed:9031,heroes});
  const reference=createDecisionSession({seed:9031,heroes});
  let triggeredReaction=false;
  for(let i=0;i<40&&fast.phase!=="terminal";i++){
   const legal=sessionActions(reference);
   assert.deepEqual(sessionActions(fast),legal,"Divergent legal actions at "+i);
   assert.ok(legal.length,"Expected an actionable canonical decision");
   const action=legal.find(a=>a.kind==="continue"||a.kind==="attack"||
    a.kind==="fight"||a.kind==="keep"||a.kind==="skip"||
    a.kind==="respond"||a.kind==="choose-hero-turn")||legal[0];
   if(fast.pendingNested)triggeredReaction=true;
   assert.equal(submitDecision(fast,action,{
    observeResult:false,recordHistory:false}),undefined);
   submitDecision(reference,action);
   assert.deepEqual(observeSession(fast),observeSession(reference),
    "Skipping UI observations changed printed consequences at "+i);
   assert.equal(fast.state.rng.snapshot(),reference.state.rng.snapshot(),
    "Skipping UI observations changed remaining real dice at "+i);
   assert.deepEqual(fast.state.metrics,reference.state.metrics);
   assert.equal(fast.history.length,0,"Fast internal study does not need display history");
   assert.equal(reference.history.length,reference.actionCount);
  }
  assert.ok(fast.actionCount>10);
  assert.deepEqual(sessionActions(fast),sessionActions(reference));
  // Decisions are not silently removed when printing of the UI is skipped.
  assert.equal(fast.actionCount,reference.actionCount);
 }
});

test("silent Room reaction replay preserves actual dice and interrupts atomically",()=>{
 const fast=createDecisionSession({seed:1842,heroes:["warrior"]});
 const legacy=createDecisionSession({seed:1842,heroes:["warrior"]});
 for(const s of [fast,legacy]){
  s.state.beginRoom(room("u-fountain"));s.phase="room";
 }
 const first=sessionActions(fast)[0];
 assert.equal(submitDecision(fast,first,{
  observeResult:false,recordHistory:false}),undefined);
 const pending=submitDecision(legacy,first);
 assert.equal(pending.phase,"reaction");
 assert.deepEqual(observeSession(fast),observeSession(legacy));
 assert.equal(fast.state.rng.snapshot(),legacy.state.rng.snapshot());
 const choice=sessionActions(fast).find(x=>x.kind==="keep");
 assert.ok(choice);
 assert.equal(submitDecision(fast,choice,{
  observeResult:false,recordHistory:false}),undefined);
 submitDecision(legacy,choice);
 assert.deepEqual(observeSession(fast),observeSession(legacy));
 assert.equal(fast.state.rng.snapshot(),legacy.state.rng.snapshot());
 assert.deepEqual(fast.state.metrics,legacy.state.metrics);
});

test("transactional combat PASS preserves canonical state, dice and rollback-safe actor identity",()=>{
 const make=()=>{
  const session=createDecisionSession({seed:70166,heroes:["warrior","witch"]});
  const enemy=MONSTERS.find(m=>m.id==="rat");
  assert.ok(enemy);
  session.state.monster=enemy;session.state.monsterHP=enemy.hp;
  session.phase="combat";session.heroIndex=1;
  return session;
 };
 const fast=make(),legacy=make();
 const action=sessionActions(fast).find(x=>
  x.phase==="combat"&&x.kind==="pass");
 assert.ok(action,"PASS must be an actual printed legal combat decision");
 const originalActor=fast.state.actor;
 const future=fast.state.rng.snapshot();
 const a=submitDecision(fast,action,{transactional:true});
 const b=submitDecision(legacy,sessionActions(legacy).find(x=>
  x.kind==="pass"),{transactional:false});
 assert.deepEqual(a,b);
 assert.deepEqual(observeSession(fast),observeSession(legacy));
 assert.deepEqual(fast.state.metrics,legacy.state.metrics);
 assert.equal(fast.state.rng.snapshot(),future);
 assert.equal(fast.state.rng.snapshot(),legacy.state.rng.snapshot());
 assert.equal(fast.state.actor.card.id,legacy.state.actor.card.id);
 assert.notStrictEqual(fast.state.actor,originalActor,
  "The canonical acting Hero should be updated by PASS");
});
