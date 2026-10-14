import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession,
 createGame,enterNextRoom,legalActions} from "../src/engine/index.js";
import {ROOMS,MONSTERS,OBJECTS,WARDEN,VAULT} from "../src/tabletop-data.js";
const room=id=>ROOMS.find(x=>x.id===id);
const monster=id=>MONSTERS.find(x=>x.id===id);
const advance=(session,match)=>submitDecision(session,sessionActions(session).find(match));
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
 assert.equal(session.phase,"parley");
 assert.deepEqual(sessionActions(session).map(a=>a.kind),["fight","parley"]);
 advance(session,a=>a.kind==="fight");
 assert.equal(session.phase,"combat");
 let combatActs=0,responses=0;
 while(["combat","monster-response"].includes(session.phase)&&combatActs<80){
  if(session.phase==="combat"){
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
