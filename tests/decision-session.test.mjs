import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession,
 createGame,enterNextRoom,legalActions} from "../src/engine/index.js";
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
 const pos=s.deck.findIndex(x=>x.id==="wand-sparks");
 assert.ok(pos>=0);
 const [wand]=s.deck.splice(pos,1);
 s.noteDeckRemoval(wand);s.add(owner,wand);
 owner.hp=2;
 const beforeWandDie=s.rng.clone().die();
 // Guarantee overcharge's printed HP loss kills the acting Hero.
 if(beforeWandDie<2){
  // The actual RNG is used below; skip no behavior or chance outcome.
  // Search a fixed finite prefix of real RNG states to reach damage >=2.
  for(let i=0;i<8&&s.rng.clone().die()<2;i++)s.die();
 }
 assert.ok(s.rng.clone().die()>=2);
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
 assert.ok(s.discardedRoomIds.has(discarded));
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
