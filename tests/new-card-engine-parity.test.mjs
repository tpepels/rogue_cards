import test from "node:test";
import assert from "node:assert/strict";
import {ROOMS,MONSTERS,VAULT} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {mctsPublicStateHash} from "../src/session-mcts.js";
import {chooseRoom,legalActions,observeGame,createDecisionSession,sessionActions,submitDecision} from "../src/engine/index.js";

const room=id=>{const c=ROOMS.find(x=>x.id===id);assert.ok(c,id);return c;};
const game=seed=>new ExpeditionState({seed,heroes:["warrior"]});
const stageCards=(stage,except)=>ROOMS.filter(x=>x.stage===stage&&x.id!==except).slice(0,4);

test("printed corridors preserve all unchosen physical Rooms except GAMBLE",()=>{
 for(const id of ["u-fork","u-echoes","u-mossy","u-smuggler","u-candle",
  "m-maps","m-ladder","m-red-detour"]){
  const s=game(3001),r=room(id);
  const input=stageCards(r.stage,id);
  s.rooms[r.stage]=[...input];s.beginRoom(r);
  chooseRoom(s,0);
  assert.equal(s.rooms[r.stage].length,input.length,id+" lost a Room");
  assert.deepEqual([...s.rooms[r.stage]].map(x=>x.id).sort(),
   input.map(x=>x.id).sort(),id+" changed physical identities");
  assert.equal(s.discardedRoomIds.size,0,id+" silently discarded a Room");
 }
 const s=game(3002),r=room("d-gilded");
 s.rooms.DEEP=stageCards("DEEP",r.id);
 s.beginRoom(r);
 const original=s.rooms.DEEP.length;
 chooseRoom(s,0);
 assert.equal(s.rooms.DEEP.length,original-1,"GAMBLE must really discard one");
});

test("Candle roll 3-4 leaves the other revealed Room immediately on top",()=>{
 const s=game(3003),r=room("u-candle");
 const cards=stageCards("UPPER",r.id);
 s.rooms.UPPER=[...cards];s.beginRoom(r);
 s.die=()=>3;
 chooseRoom(s,1);
 assert.deepEqual(s.rooms.UPPER.slice(0,2),cards.slice(0,2));
 assert.equal(s.discardedRoomIds.size,0);
});

test("IGNORE at Red Detour does not roll an unprinted die",()=>{
 const s=game(3004),r=room("m-red-detour");
 s.rooms.MIDDLE=stageCards("MIDDLE",r.id);s.beginRoom(r);
 s.die=()=>{throw Error("IGNORE must not roll")};
 chooseRoom(s,0);
 assert.equal(s.rooms.MIDDLE.length,4);
});

test("new Pact Room upfront rewards use the printed Item quantities",()=>{
 for(const [id,gain] of [["m-clock",2],["u-rat-favor",1],["m-hungry-door",2]]){
  const s=game(3005),r=room(id);
  s.beginRoom(r);
  const before=s.heroes[0].inventory.length;
  chooseRoom(s,0);
  assert.equal(s.heroes[0].inventory.length-before,gain,id);
  assert.equal(s.pactUsed,true,id+" must consume the expedition Pact");
 }
});

test("only one Pact remains legal across both special and Fate Rooms",()=>{
 const s=game(3006);
 s.beginRoom(room("m-clock"));chooseRoom(s,0);
 s.beginRoom(room("u-rat-favor"));
 assert.deepEqual(legalActions(s,{phase:"room"}).filter(x=>x.kind==="room-choice")
  .map(x=>x.index),[1]);
 s.beginRoom(room("u-hollow-knight"));
 assert.deepEqual(legalActions(s,{phase:"room"}).filter(x=>x.kind==="room-choice")
  .map(x=>x.index),[1]);
 assert.equal(observeGame(s).pactUsed,true);
});

test("Cartographer BURN reveals and orders three Rooms, not free Items",()=>{
 const s=game(3007);s.beginRoom(room("u-cartographer"));
 const deckBefore=s.deck.length,peekCalls=[];
 s.peek=(n,order)=>{peekCalls.push([n,order]);};
 chooseRoom(s,1);
 assert.deepEqual(peekCalls,[[3,true]]);
 assert.equal(s.deck.length,deckBefore);
});

test("Choir STEAL draws one Item and deals three opening Monster damage",()=>{
 const s=game(3008);s.beginRoom(room("m-choir-nails"));
 const deckBefore=s.deck.length;chooseRoom(s,1);
 assert.equal(s.deck.length,deckBefore-1);
 s.beginRoom(room("d-shadow"));
 const monster=MONSTERS.find(m=>m.id==="wraith");
 s.monsters.DEEP=[monster];s.drawMonster();
 assert.equal(s.monster.id,"wraith");
 assert.equal(s.monsterHP,monster.hp-3);
 assert.equal(s.monsterAdv,true);
});

test("Hourglass BREAK grants no Items and may reverse a later Room result",()=>{
 const s=game(3009);s.beginRoom(room("m-hourglass"));
 const deckBefore=s.deck.length;chooseRoom(s,1);
 assert.equal(s.deck.length,deckBefore);
 s.beginRoom(room("u-shrine"));
 s._decisionHook=event=>{
  if(event.context==="hourglass-reverse-room-die")return {mode:"reverse"};
  throw Error("Unexpected decision "+JSON.stringify(event));
 };
 s.die=()=>3;
 s.roomRoll(1);
 assert.ok(!s.keptRooms.some(x=>x.card.id==="m-hourglass"));
 assert.equal(s.metrics.roomRollBands["u-shrine:2"],1);
});

test("Drowned Banner rolls its actual Vault d6 and grants DEF DIS on 5-6",()=>{
 const s=game(3010);s.beginRoom(room("m-drowned-banner"));
 chooseRoom(s,0);
 const faces=[6,4];s.die=()=>faces.shift()??3;
 s.beginRoom(VAULT);
 assert.equal(s.vaultModifiers.wardenDamage,4);
 assert.equal(s.heroes[0].nextDefenseDis,1);
});

test("Witness FREE modifies the Vault OMEN by one without granting HP",()=>{
 const s=game(3011);s.beginRoom(room("d-last-witness"));
 chooseRoom(s,0);
 const original=s.heroes[0].hp;
 s.beginRoom(VAULT);
 assert.equal(s.heroes[0].hp,original);
 assert.equal(s.vaultModifiers.omenAdjust,true);
 s._decisionHook=event=>{
  if(event.context==="witness-omen-adjust")return {mode:"up"};
  throw Error("Unexpected decision "+JSON.stringify(event));
 };
 s.roomRoll(4);
 assert.equal(s.metrics.roomRollBands["vault:2"],1);
});

test("Last Bell's optional 2 HP Vault payment is not forced when unaffordable",()=>{
 const s=game(3012);s.heroes[0].hp=1;
 s.keptRooms.push({card:room("d-last-bell")});
 s.beginRoom(VAULT);
 assert.equal(s.heroes[0].hp,1);
 assert.equal(s.telegraphedWardenBehavior??null,null);
});

test("Wax Bridge selects the safe 3-4 band, never an unprinted treasure award",()=>{
 const s=game(3020);
 s.keptRooms.push({card:room("m-wax-bridge")});
 s.beginRoom(room("d-bridge"));
 s.roomRoll(1);
 assert.equal(s.metrics.roomRollBands["d-bridge:1"],1);
 assert.equal(s.metrics.roomRollBands["d-bridge:2"]??0,0);
 assert.equal(s.keptRooms.some(x=>x.card.id==="m-wax-bridge"),false);
});

test("Rat King's Favor remains physically spent after its first printed trigger",()=>{
 const s=game(3021);
 s.beginRoom(room("u-rat-favor"));chooseRoom(s,0);
 s.beginRoom(room("u-nest"));
 const favor=s.keptRooms.find(x=>x.card.id==="u-rat-favor");
 assert.ok(favor?.spent,"Card remains sideways, rather than disappearing");
 s.ratFavor=false;
 s.beginRoom(room("u-nest"));
 assert.equal(s.ratFavor,false,"Spent Favor must not trigger twice");
 assert.ok(observeGame(s).keptRooms.find(x=>x.id==="u-rat-favor")?.spent);
});

test("Retained Pact choices selected by Oracle drive canonical Vault payments",()=>{
 const paid=game(3022);
 paid.beginRoom(room("m-clock"));chooseRoom(paid,0);
 const itemCount=paid.heroes[0].inventory.length;
 paid.returnChoices["m-clock"]="pay";
 paid.beginRoom(VAULT);
 assert.equal(paid.heroes[0].inventory.length,itemCount-1);
 assert.ok(paid.telegraphedWardenBehavior>=1);
 const refused=game(3023);
 refused.beginRoom(room("m-clock"));chooseRoom(refused,0);
 refused.returnChoices["m-clock"]="roll";
 refused.beginRoom(VAULT);
 assert.equal(refused.forcedBehavior,6);
 assert.equal(refused.telegraphedWardenBehavior??null,null);
});

test("Candle from a 5-6 roll can cancel Lightless Hall attack DIS",()=>{
 const s=game(3024);
 s.keptRooms.push({card:room("u-candle")});
 s.beginRoom(room("d-shadow"));
 s.apply("NEXT_DIS",[],room("d-shadow"));
 assert.equal(s.heroes[0].nextDis,0);
 assert.equal(s.keptRooms.some(x=>x.card.id==="u-candle"),false);
});

test("Kept Gallery map may shift an observed trapdoor die by one",()=>{
 const s=game(3025);
 s.keptRooms.push({card:room("m-maps")});
 s.beginRoom(room("u-fall"));
 s._decisionHook=event=>{
  if(event.context==="maps-adjust-trapdoor:u-fall"){
   assert.equal(observeGame(s).observedRoomFace,2);
   return {mode:"up"};
  }
  throw Error("Unexpected decision "+JSON.stringify(event));
 };
 s.roomRoll(2);
 assert.equal(s.metrics.roomRollBands["u-fall:1"],1);
 assert.equal(s.keptRooms.some(x=>x.card.id==="m-maps"),false);
});

test("Judge BRIBE is illegal after the Hollow Knight was SPARED",()=>{
 const s=game(3031);
 s.keptRooms.push({card:room("u-hollow-knight"),choice:0});
 s.beginRoom(room("u-puppet"));
 assert.deepEqual(legalActions(s,{phase:"room"}).filter(x=>x.kind==="room-choice")
  .map(x=>x.index),[0]);
});

test("Judge acquittal turns sideways at Talking Door and cannot be used twice",()=>{
 const s=game(3032),judge={card:room("u-puppet")};
 s.keptRooms.push(judge);
 s.beginRoom(room("d-mouth"));
 s.roomRoll(2);
 assert.equal(s.metrics.roomRollBands["d-mouth:3"],1);
 assert.equal(judge.spent,true);
 assert.equal(observeGame(s).keptRooms.find(x=>x.id==="u-puppet")?.spent,true);
 s.roomRoll(2);
 assert.equal(s.metrics.roomRollBands["d-mouth:0"],1);
});

test("Oracle session enumerator and transition honor the same global Pact limit",()=>{
 const session=createDecisionSession({seed:3033,heroes:["warrior"]});
 session.state.beginRoom(room("m-clock"));session.phase="room";
 const allowed=sessionActions(session).filter(x=>x.kind==="room-choice");
 assert.deepEqual(allowed.map(x=>x.index),[0,1]);
 submitDecision(session,allowed[0],{observeResult:false});
 for(let i=0;i<20&&session.pendingNested;i++){
  const reaction=sessionActions(session);
  assert.ok(reaction.length,"A pending Oracle reaction must have a legal choice");
  submitDecision(session,reaction[0],{observeResult:false});
 }
 assert.equal(session.pendingNested,null);
 assert.equal(session.state.pactUsed,true);
 session.state.beginRoom(room("u-hollow-knight"));session.phase="room";
 const after=sessionActions(session).filter(x=>x.kind==="room-choice");
 assert.deepEqual(after.map(x=>x.index),[1]);
});

test("retained Room mode changes Oracle information-set key",()=>{
 const first=createDecisionSession({seed:3061,heroes:["warrior"]});
 const second=createDecisionSession({seed:3061,heroes:["warrior"]});
 const crown=room("d-crown");
 first.state.keptRooms.push({card:crown,mode:"5"});
 second.state.keptRooms.push({card:crown,mode:"6"});
 assert.equal(observeGame(first.state).keptRooms[0].mode,"5");
 assert.equal(observeGame(second.state).keptRooms[0].mode,"6");
 assert.notEqual(mctsPublicStateHash(first),mctsPublicStateHash(second),
  "Search must distinguish the printed 5 and 6 Crown uses");
});

test("canonical Bazaar choice resolves Beetle Caravan's printed retained reward",()=>{
 const s=game(3071);
 s.draw(6); // Ensure the printed Bazaar payment is affordable.
 s.beginRoom(room("m-beetle"));
 s.die=()=>6;
 chooseRoom(s,0);
 assert.equal(s.keptRooms.filter(x=>x.card.id==="m-beetle").length,1);
 s.beginRoom(room("d-bazaar"));
 const before=s.metrics.drawn;
 chooseRoom(s,1); // The printed Bazaar choice draws 2 Items.
 assert.equal(s.metrics.drawn-before,3,
  "Kept BARGAIN must grant exactly one additional Item in the Oracle");
 assert.equal(s.keptRooms.filter(x=>x.card.id==="m-beetle").length,0);
});
