/**
 * Player-controlled expedition phase machine.
 *
 * Every call to submitDecision resolves ONE chosen legal action and stops
 * at the next printed decision boundary. It shares the same mutable
 * ExpeditionState, dice, Room ops, Item executor and combat primitives as
 * the full-effect expedition runner - no cards are simulated separately.
 *
 * Nested in-roll decisions are exposed transactionally by the decision
 * hook. Exhaustive correctness across all possible timing interactions
 * still requires stateful test coverage; this file does not certify it.
 */
import {VAULT} from "../tabletop-data.js";
import {ExpeditionState} from "./expedition-state.js";
import {createGame,observeGame,legalActions,applyAction,
 takeMonsterResponse,finishCurrentRoom} from "./index.js";
import {resolveParley} from "./parley.js";
import {consumeCorpse,resolveSpecialRemains,settleMonsterVictory}
 from "./combat-outcomes.js";
import {seal} from "./vault.js";
import {forkGameState} from "./fork-state.js";
import {itemOptions} from "../item-access.js";
const itemOptionsAtTrigger=(state,args)=>itemOptions(state,
 state.heroes[args.heroIndex],args.phase).map(x=>({id:x.card.id,mode:x.mode}));
import {beginWarden,wardenOptions,applyWardenChoice} from "./vault-encounter.js";

const STAGES=["UPPER","MIDDLE","DEEP"];
const stageReady=s=>STAGES.find(k=>s.stageProgress[k]<s.roomGoal&&s.rooms[k].length);
const opposite=()=>[];
const ended=s=>!s.alive()||s.metrics.won||s.metrics.escaped;
const nextHero=(s,from)=>s.heroes.findIndex((h,i)=>i>=from&&h.hp>0);
const pendingReturnIds=s=>{
 const stage=s.room?.stage,ids=[];
 if(!stage)return ids;
 if(stage==="DEEP"&&!s.enteredDeep&&s.keptRooms.some(x=>x.card.id==="m-well"))
  ids.push("m-well");
 if(stage==="FINAL"){
  for(const id of ["m-clock","m-hungry-door","m-ferryman-oath"]){
   if(s.keptRooms.some(x=>x.card.id===id))ids.push(id);
  }
 }
 return ids.filter(id=>legalActions(s,{phase:"retained",roomId:id}).length>1);
};
const canonical=session=>{
 const {state:s,phase,heroIndex,returnRoomId}=session;
 if(phase==="between-rooms"||phase==="explore"){
  const src=phase==="explore"?"explore":"between-rooms";
  const opts=legalActions(s,{phase:src,heroIndex})
   .filter(x=>x.kind!=="continue");
  // Equipment can be changed at a safe action boundary, not mid-roll.
  const equipment=s.heroes.flatMap((h,i)=>
   h.hp>0?legalActions(s,{phase:"equipment",heroIndex:i}):[]);
  const remains=phase==="explore"?
   legalActions(s,{phase:"remains"}):[];
  return [...opts,...equipment,...remains,
   {phase:src,kind:"continue",heroIndex}];
 }
 if(phase==="retained-entry")return legalActions(s,{
  phase:"retained",roomId:returnRoomId});
 if(phase==="room")return legalActions(s,{phase:"room"});
 if(phase==="parley")return legalActions(s,{phase:"parley"});
 if(phase==="combat-hero")return legalActions(s,{phase:"combat-hero"});
 if(phase==="combat")return legalActions(s,{phase:"combat",heroIndex});
 if(phase==="monster-response")return legalActions(s,{
  phase:"monster-response",heroIndex});
 if(phase==="corpse")return legalActions(s,{phase:"corpse"});
 if(phase==="vault")return legalActions(s,{phase:"vault"});
 if(phase==="post-warden")return legalActions(s,{phase:"post-warden"});
 if(phase==="terminal")return [];
 throw Error("Unknown session phase "+phase);
};
// Search may reuse an already-enumerated, same-boundary legal action list.
// An issued list is tied to this exact session object and committed step;
// external callers without a ticket retain full canonical revalidation.
const issuedLegalLists=new WeakMap();
export const sessionActions=(session,{issueTicket=false}={})=>{
 const list=session.pendingNested?session.pendingNested.actions:canonical(session);
 if(issueTicket){
  // Freeze the issued array and shallow action records. Otherwise a caller
  // could append or mutate a fabricated action after it was enumerated
  // and incorrectly have it treated as verified by the search fast path.
  for(const action of list)Object.freeze(action);
  Object.freeze(list);
  issuedLegalLists.set(list,{
   session,state:session.state,phase:session.phase,
   heroIndex:session.heroIndex,pendingNested:session.pendingNested,
   count:session.actionCount
  });
 }
 return list;
};
export function observeSession(session){
 if(session.pendingNested)return {
  phase:"reaction",parentPhase:session.phase,
  trigger:session.pendingNested.trigger,
  game:session.pendingNested.observation,
  actions:session.pendingNested.actions,
  actionCount:session.actionCount,completeDecisionCoverage:false
 };
 return {phase:session.phase,heroIndex:session.heroIndex,
  pendingReturnRoom:session.returnRoomId,
  game:observeGame(session.state),
  actions:canonical(session),
  actionCount:session.actionCount,
  // True only when literally all pending player decisions are represented.
  completeDecisionCoverage:false,
  unverifiedInteractionClasses:[
   "rare combined nested Hero/Item/Room reactions",
   "all contextual preconditions of printed passive effects",
   "all simultaneous retained Room and Monster behavior triggers"
  ]};
}
function done(session){
 if(ended(session.state)){
  session.phase="terminal";session.returnRoomId=null;return true;
 }
 return false;
}
function awaitingMonster(session){
 const s=session.state;
 if(!s.monster&&s.monsterQueue.length){
  s.monster=s.monsterQueue.shift();s.monsterHP=s.monster.hp;
  s.monsterFirstAttackPending=true;
  if(s.queuedForcedWisp===s.monster){
   s.mustFightFollowingWisp=true;s.queuedForcedWisp=null;
  }
  s.banished=false;s.elberethAttempts=0;s.elberethSkipResponse=false;
  if(s.monster.stage!=="FINAL"&&s.useRetainedPotion(
   "laughter","queued-monster:"+s.monster.id))
   s.forcedBehavior=1;
 }
 if(!s.monster)return false;
 session.heroIndex=nextHero(s,0);
 if(session.heroIndex<0)return !!done(session);
 s._actedCombatMask=0;
 session.phase=s.monster.stage==="FINAL"||s.mustFightFollowingWisp?
  "combat-hero":"parley";
 s.mustFightFollowingWisp=false;
 session.monsterRound=0;
 s.metrics.battles++;
 if(session.phase==="combat-hero")s.metrics.combatStarts++;
 return true;
}
function roomSettled(session){
 if(done(session))return;
 if(awaitingMonster(session))return;
 const s=session.state;
 if(s.room?.stage==="FINAL")throw Error("Vault must end in a terminal result");
 finishCurrentRoom(s,{observeResult:false});
 session.phase="between-rooms";session.heroIndex=0;
}
function finishEntry(session){
 const s=session.state;
 session.returnRoomId=null;session.remainingReturns=[];
 s.completeRoomEntry();
 if(done(session))return;
 if(s.room.stage==="FINAL"){
  // The printed Vault OMEN is resolved after entry modifiers.
  s.roomRoll();if(!done(session))session.phase="vault";
  return;
 }
 // The printed entry Monster draw happens before the Room's choice.
 const prompt=/Draw an? (UPPER|MIDDLE|DEEP) Monster/.exec(s.room.v2.prompt);
 if(prompt)s.drawMonster();
 if(done(session))return;
 session.phase="explore";session.heroIndex=nextHero(s,0);
 if(session.heroIndex<0)done(session);
}
function queuedReturn(session){
 while(session.remainingReturns.length){
  const id=session.remainingReturns.shift();
  if(legalActions(session.state,{phase:"retained",roomId:id}).length>1){
   session.returnRoomId=id;session.phase="retained-entry";return;
  }
 }
 finishEntry(session);
}
function drawNext(session){
 const s=session.state,stage=stageReady(s);
 const room=stage?s.rooms[stage].shift():VAULT;
 s.beginRoom(room,{deferEntry:true});
 session.remainingReturns=pendingReturnIds(s);
 queuedReturn(session);
}
function endMonster(session){
 const s=session.state,m=s.monster;
 if(!m)throw Error("No Monster to end");
 // The Warden has a printed midpoint, not the normal kill/Corpse window.
 if(m.id==="warden"&&s.monsterHP<=10){
  session.phase="post-warden";session.heroIndex=0;return;
 }
 if(s.monsterHP>0)return;
 if(m.id==="warden-fury"){
  settleMonsterVictory(s,m,{warden:true});
  s.metrics.won=true;s.endingKind="amulet_taken";done(session);return;
 }
 if(m.stage!=="FINAL"&&!s.banished&&m.id!=="sentinel"&&s.alive()){
  session.phase="corpse";return;
 }
 settleMonsterVictory(s,m);
 if(!done(session)&&!awaitingMonster(session))roomSettled(session);
}
function afterAttack(session){
 const s=session.state;
 if(done(session))return;
 // Printed banishment/transformation effects can remove the active Monster
 // without killing it. That is a completed encounter, not a corpse or
 // 'No Monster to end' error. Continue with any queued encounter.
 if(!s.monster){
  if(!awaitingMonster(session))roomSettled(session);
  return;
 }
 if(s.monsterHP<=0||s.monster.id==="warden"&&s.monsterHP<=10){
  endMonster(session);return;
 }
 // An action may kill its acting Hero without defeating the Monster.
 // The Monster still responds against the living party member, as the
 // canonical monsterRespond() resolver already does in this situation.
 if(s.heroes[session.heroIndex]?.hp<=0){
  session.heroIndex=nextHero(s,0);
  if(session.heroIndex<0){done(session);return;}
 }
 session.phase="monster-response";
}
function afterMonsterResponse(session){
 const s=session.state;
 if(done(session))return;
 if(!s.monster){
  if(!awaitingMonster(session))roomSettled(session);
  return;
 }
 if(s.monsterHP<=0||s.monster.id==="warden"&&s.monsterHP<=10){
  endMonster(session);return;
 }
 const available=s.heroes.some((h,i)=>h.hp>0&&
  !(s._actedCombatMask&(1<<i)));
 if(!available){
  s._actedCombatMask=0;session.monsterRound++;s.metrics.rounds++;
  if(session.monsterRound>=300){
   s.metrics.roundLimit=true;session.phase="terminal";return;
  }
 }
 if(!s.alive()){done(session);return;}
 session.heroIndex=-1;session.phase="combat-hero";
}
export function createDecisionSession(options={}){
 // The public createGame() deliberately rejects interventions. Only this
 // research session entrypoint accepts a physical extra starting Item.
 const {extraObjectId=null,...gameOptions}=options;
 const state=extraObjectId===null?createGame(gameOptions):
  new ExpeditionState({...gameOptions,extraObjectId});
 return {state,phase:"between-rooms",heroIndex:0,
  remainingReturns:[],returnRoomId:null,
  monsterRound:0,actionCount:0,history:[]};
}
/** The controller is the ONLY place that accepts a player's choice in the
 * new pausable API. Unexpected actions are rejected BEFORE mutating state.
 */
function submitDecisionDirect(session,action,{observeResult=true,recordHistory=true,
 verifiedAction=false}={}){
 if(session.phase==="terminal")throw Error("Expedition already ended");
 const selected=verifiedAction?action:canonical(session).find(x=>
  Object.keys(x).every(k=>x[k]===action?.[k])&&
  Object.keys(action||{}).every(k=>x[k]===action[k]));
 if(!selected)throw Error("Illegal pending decision "+JSON.stringify(action));
 const {state:s,phase}=session;
 const before=phase;
 if(phase==="between-rooms"||phase==="explore"){
  if(selected.kind==="continue"){
   if(phase==="between-rooms")drawNext(session);
   else{
    const next=nextHero(s,session.heroIndex+1);
    if(next<0)session.phase="room";
    else session.heroIndex=next;
   }
  }else applyAction(s,selected,{observeResult:false,prevalidated:verifiedAction});
 }else if(phase==="retained-entry"){
  applyAction(s,selected,{observeResult:false,prevalidated:verifiedAction});queuedReturn(session);
 }else if(phase==="room"){
  applyAction(s,selected,{observeResult:false,prevalidated:verifiedAction});
  if(!done(session)&&!awaitingMonster(session))roomSettled(session);
 }else if(phase==="parley"){
  if(selected.kind==="parley"&&resolveParley(s)){
   if(!done(session)&&!awaitingMonster(session))roomSettled(session);
  }else if(!done(session)){
   s.metrics.combatStarts++;
   s._actedCombatMask=0;session.phase="combat-hero";session.heroIndex=-1;
  }
 }else if(phase==="combat-hero"){
  session.heroIndex=selected.heroIndex;session.phase="combat";
 }else if(phase==="combat"){
  applyAction(s,selected,{observeResult:false,prevalidated:verifiedAction});
  s._actedCombatMask|=1<<selected.heroIndex;
  afterAttack(session);
 }else if(phase==="monster-response"){
  takeMonsterResponse(s,selected.heroIndex,{observeResult:false});afterMonsterResponse(session);
 }else if(phase==="corpse"){
  const m=s.monster;
  if(selected.kind==="eat")consumeCorpse(s,m);
  else if(["search","keep-eye","release","keep-whisper"].includes(
   selected.kind))resolveSpecialRemains(s,m,selected.kind);
  settleMonsterVictory(s,m);
  if(!done(session)&&!awaitingMonster(session))roomSettled(session);
 }else if(phase==="vault"){
  if(selected.kind==="seal"&&seal(s)){
   s.metrics.won=true;s.endingKind="amulet_sealed";done(session);
  }else if(done(session)){
   // A failed SEAL's printed HP payment can kill the last Hero.
   // The game ends here without starting an impossible Warden turn.
  }else{
   if(selected.kind==="seal")s.monsterAdv=true;
   beginWarden(s);s.metrics.battles++;s.metrics.combatStarts++;
   s._actedCombatMask=0;
   session.phase="combat-hero";session.heroIndex=-1;
   session.monsterRound=0;
  }
 }else if(phase==="post-warden"){
  const result=applyWardenChoice(s,selected.kind);
  if(result.complete||done(session))done(session);
  else{
   s.metrics.battles++;s.metrics.combatStarts++;session.monsterRound=0;
   s._actedCombatMask=0;
   session.heroIndex=-1;session.phase="combat-hero";
  }
 }else throw Error("Unreachable phase "+phase);
 // A complete printed choice may inflict its final HP loss while the
 // controller is transitioning into its next phase (notably Vault or
 // post-Warden choices). A party wipe takes precedence over any pending
 // combat turn: never expose combat-hero with zero living Heroes.
 done(session);
 session.actionCount++;
 if(recordHistory)session.history.push({from:before,choice:{...selected},to:session.phase});
 return observeResult?observeSession(session):undefined;
}

class NeedReaction extends Error {
 constructor(event,actions,observation){
  super("Decision required at "+event.phase);
  this.event=event;this.actions=actions;this.observation=observation;
 }
}
// The same legal reaction enumerator is used for replay transactions and
// speculative search. Never infer reactions from printed card heuristics.
function canonicalReactionActions(state,event){
 const args={phase:event.phase,heroIndex:event.heroIndex??0,
  roomId:event.roomId??null,cost:event.cost??0,
  context:event.context??null};
 let actions=legalActions(state,args);
 if(event.cardId)actions=actions.filter(x=>x.kind==="continue"||
  x.kind==="item-trigger"&&x.cardId===event.cardId);
 if(event.allowedModes)actions=actions.filter(x=>
  event.allowedModes.includes(x.mode||x.kind));
 if(actions.length===0)throw Error("No legal printed reaction: "+JSON.stringify({
  event,roomId:state.room?.id,monsterId:state.monster?.id,
  inventory:state.heroes[args.heroIndex]?.inventory.map(c=>c.id),
  slots:Object.fromEntries(Object.entries(
   state.heroes[args.heroIndex]?.slots||{}).map(([k,v])=>[k,v?.id])),
  available:itemOptionsAtTrigger(state,args)
 }));
 return actions;
}
const sameAction=(a,b)=>a&&b&&
 Object.keys(a).length===Object.keys(b).length&&
 Object.keys(a).every(k=>a[k]===b[k]);

/** Transaction journal for the strictly non-suspending rules paths.
 *
 * A safe choice is still executed through submitDecisionDirect(), including
 * full canonical legality checks and printed action dispatch. Instead of
 * deep-copying the entire expedition, snapshot only the touched state:
 * phase metadata, the append-only history, and equipped/owned cards for
 * physical equipment operations. Any exception restores those exact
 * original objects and arrays, so a rejected transaction is atomic.
 *
 * All other actions - including entering Rooms, rolling dice, activating
 * Items, and continuing an existing nested reaction - retain the normal
 * copy/replay fork. No speculation about whether printed effects trigger.
 */
const EMPTY_REPLAY_SWITCHES=Object.freeze([]);
const freeEquipmentActions=new Set(["equip","unequip","transfer"]);
function safeDirectAction(session,action,directSettlements=false){
 if(session.pendingNested||!action||typeof action!=="object")return false;
 const phase=session.phase;
 if((phase==="between-rooms"||phase==="explore")&&
    action.phase==="equipment"&&freeEquipmentActions.has(action.kind))
  return true;
 if(phase==="explore"&&action.phase==="explore"&&
    action.kind==="continue")return true;
 if(phase==="combat-hero"&&action.phase==="combat-hero"&&
    action.kind==="choose-hero-turn")return true;
 if(phase==="parley"&&action.phase==="parley"&&
    action.kind==="fight")return true;
 // PASS has no dice, printed effects or nested triggers. It only marks
 // this Hero's turn as spent and advances to the Monster response.
 if(phase==="combat"&&action.phase==="combat"&&
    action.kind==="pass")return true;
 if(!directSettlements)return false;
 // These two FIGHT transitions are pure canonical bookkeeping: no die,
 // physical card cost, nested reaction, or conditional printed effect.
 if(phase==="vault"&&action.phase==="vault"&&action.kind==="fight")
  return true;
 if(phase==="post-warden"&&action.phase==="post-warden"&&
    action.kind==="fight")return true;
 // Declining a regional corpse is safe only with no delayed reward,
 // stolen Item, queued Monster, or tucked Item return. The guarded
 // settlement then only clears deterministic combat/Room metadata.
 if(phase==="corpse"&&action.phase==="corpse"&&
    action.kind==="leave"){
  const s=session.state;
  return !!(s.monster&&s.monsterHP<=0&&s.room&&
   // Printed DEFEAT effects may draw Items or ask which Hero benefits;
   // those outcomes require the canonical transactional replay path.
   !s.monster.v2?.defeatOps?.length&&
   s.room.stage!=="FINAL"&&!s.monsterQueue.length&&
   !s.pendingReward&&!s.pendingFightHeal&&
   !(s.stashedMonsterItems?.length)&&
   !(s.tuckedRoomItems?.some(x=>x.roomId===s.room.id)));
 }
 return false;
}
function beginDirectTransaction(session,action){
 const s=session.state;
 const meta={
  phase:session.phase,heroIndex:session.heroIndex,
  returnRoomId:session.returnRoomId,
  monsterRound:session.monsterRound,
  actionCount:session.actionCount,
  historyLength:session.history.length,
  actedMask:s._actedCombatMask,
  hadActedMask:Object.hasOwn(s,"_actedCombatMask"),
  actor:s.actor
 };
 const ending=action.phase==="vault"&&action.kind==="fight"||
  action.phase==="post-warden"&&action.kind==="fight";
 const corpse=action.phase==="corpse"&&action.kind==="leave";
 // These snapshots only cover explicitly audited, non-suspending
 // transitions. All unpredictable printed effects still fork/replay.
 const settlement=ending||corpse?{
  monster:s.monster,monsterHP:s.monsterHP,
  monsterFirstAttackPending:s.monsterFirstAttackPending,
  hadMonsterFirstAttackPending:Object.hasOwn(s,"monsterFirstAttackPending"),
  monsterAdv:s.monsterAdv,heroFirstAdv:s.heroFirstAdv,
  monsterSkip:s.monsterSkip,
  endingKind:s.endingKind,
  pendingReward:s.pendingReward,pendingFightHeal:s.pendingFightHeal,
  room:s.room,elberethAdv:s.elberethAdv,
  metrics:{
   battles:s.metrics.battles,combatStarts:s.metrics.combatStarts,kills:s.metrics.kills,
   cleared:s.metrics.cleared,won:s.metrics.won,
   escaped:s.metrics.escaped,
   hadEscaped:Object.hasOwn(s.metrics,"escaped"),
   monsterVisits:{...s.metrics.monsterVisits}
  },
  progress:{...s.stageProgress},
  heroes:corpse?s.heroes.map(h=>({
   hero:h,poison:h.poison,immune:h.immune,used:new Set(h.used),
   nextHitBlock:h.nextHitBlock,
   ignoreDarknessOnce:h.ignoreDarknessOnce,
   defDuration:h.defDuration,nextDefenseBonus:h.nextDefenseBonus
  })):null
 }:null;
 const indices=action.phase==="equipment"?
  [...new Set([action.heroIndex,action.toHeroIndex]
   .filter(i=>Number.isInteger(i)))]:[];
 const touched=indices.map(i=>{
  const hero=s.heroes[i];
  // The existing canonical legality validator will reject any invalid
  // Hero or stale action, before mutating game state.
  return hero?{hero,inventory:hero.inventory.slice(),
   slots:{...hero.slots}}:null;
 }).filter(Boolean);
 return ()=>{
  session.phase=meta.phase;
  session.heroIndex=meta.heroIndex;
  session.returnRoomId=meta.returnRoomId;
  session.monsterRound=meta.monsterRound;
  session.actionCount=meta.actionCount;
  session.history.length=meta.historyLength;
  if(meta.hadActedMask)s._actedCombatMask=meta.actedMask;
  else delete s._actedCombatMask;
  s.actor=meta.actor;
  if(settlement){
   s.monster=settlement.monster;
   s.monsterHP=settlement.monsterHP;
   if(settlement.hadMonsterFirstAttackPending)
    s.monsterFirstAttackPending=settlement.monsterFirstAttackPending;
   else delete s.monsterFirstAttackPending;
   s.monsterAdv=settlement.monsterAdv;
   s.heroFirstAdv=settlement.heroFirstAdv;
   s.monsterSkip=settlement.monsterSkip;
   s.endingKind=settlement.endingKind;
   s.pendingReward=settlement.pendingReward;
   s.pendingFightHeal=settlement.pendingFightHeal;
   s.room=settlement.room;
   s.elberethAdv=settlement.elberethAdv;
   for(const [key,value] of Object.entries(settlement.metrics))
    if(key==="monsterVisits"){
     for(const k of Object.keys(s.metrics.monsterVisits))
      delete s.metrics.monsterVisits[k];
     Object.assign(s.metrics.monsterVisits,value);
    }else if(key==="hadEscaped"){
     if(!value)delete s.metrics.escaped;
    }else if(key==="escaped"){
     if(settlement.metrics.hadEscaped)s.metrics.escaped=value;
    }else s.metrics[key]=value;
   Object.assign(s.stageProgress,settlement.progress);
   for(const h of settlement.heroes||[]){
    h.hero.poison=h.poison;h.hero.immune=h.immune;
    h.hero.used.clear();
    for(const item of h.used)h.hero.used.add(item);
    h.hero.nextHitBlock=h.nextHitBlock;
    h.hero.ignoreDarknessOnce=h.ignoreDarknessOnce;
    h.hero.defDuration=h.defDuration;
    h.hero.nextDefenseBonus=h.nextDefenseBonus;
   }
  }
  for(const {hero,inventory,slots} of touched){
   hero.inventory.splice(0,hero.inventory.length,...inventory);
   for(const key of Object.keys(hero.slots))delete hero.slots[key];
   Object.assign(hero.slots,slots);
  }
 };
}
/** Re-execute one pending canonical rules call on an isolated exact-RNG
 * fork. A nested trigger suspends the entire transaction. On selection,
 * replay the SAME dice/printed effects and commit once, when complete.
 * No used Item, HP, die or deck mutation escapes an interrupted call.
 */
export function submitDecision(session,action,{
 afterReactionReplay=null,replayAt=null,replaySwitches=[],
 transactional=true,observeResult=true,recordHistory=true,
 verifiedLegalActions=null,fastPileClones=false,
 reuseEmptyReplaySwitches=false,directSettlements=false,
 fastMetricClones=false,profileEvent=null,onCommittedDice=null
}={}){
 if(typeof transactional!=="boolean"||typeof observeResult!=="boolean"||
    typeof recordHistory!=="boolean"||typeof fastPileClones!=="boolean")
  throw Error("transactional, observeResult, recordHistory and fastPileClones must be boolean");
 if(typeof reuseEmptyReplaySwitches!=="boolean")
  throw Error("reuseEmptyReplaySwitches must be boolean");
 if(typeof directSettlements!=="boolean")
  throw Error("directSettlements must be boolean");
 if(typeof fastMetricClones!=="boolean")
  throw Error("fastMetricClones must be boolean");
 if(onCommittedDice!==null&&typeof onCommittedDice!=="function")
  throw Error("onCommittedDice must be a function");
 if(profileEvent!==null&&typeof profileEvent!=="function")
  throw Error("profileEvent must be a function");
 if(afterReactionReplay!==null&&typeof afterReactionReplay!=="function")
  throw Error("Reaction replay observer must be a function");
 if(replayAt!==null&&(!Number.isInteger(replayAt)||replayAt<1))
  throw Error("Invalid observed reaction replay index");
 if(!Array.isArray(replaySwitches)||replaySwitches.some(x=>
  !x||!Number.isInteger(x.at)||x.at<1||
  typeof x.callback!=="function"))
  throw Error("Invalid multi-stage replay switches");
 // Almost every canonical rollout action has no replay callback.
 // Avoid allocating an empty list at those decisions. Defensive copy
 // remains mandatory when the caller provides a mutable switch list.
 const switches=reuseEmptyReplaySwitches&&
  !replaySwitches.length&&!afterReactionReplay?
   EMPTY_REPLAY_SWITCHES:[...replaySwitches];
 if(afterReactionReplay)switches.push({
  at:replayAt,callback:afterReactionReplay
 });
 if(session.phase==="terminal")throw Error("Expedition already ended");
 const ticket=verifiedLegalActions?issuedLegalLists.get(verifiedLegalActions):null;
 if(verifiedLegalActions&&(!ticket||ticket.session!==session||
    ticket.state!==session.state||ticket.phase!==session.phase||
    ticket.heroIndex!==session.heroIndex||
    ticket.pendingNested!==session.pendingNested||
    ticket.count!==session.actionCount||
    !verifiedLegalActions.includes(action)))
  throw Error("Stale or unissued canonical legal-action ticket");
 // Revalidate nested responses against their current printed trigger.
 // Only a just-issued root choice can skip repeated enumeration safely.
 const verifiedRoot=Boolean(ticket&&!session.pendingNested);
 // Trusted deterministic rules paths have a reversible, narrow write set.
 // Skipping their full-state fork is especially valuable in MCTS, where
 // many legal equipment moves are evaluated before the next Room.
 if(transactional&&!switches.length&&
    safeDirectAction(session,action,directSettlements)){
  const rollback=beginDirectTransaction(session,action);
  try{
   const result=submitDecisionDirect(session,action,{
    observeResult,recordHistory,verifiedAction:verifiedRoot});
   if(onCommittedDice)onCommittedDice([]);
   return result;
  }catch(error){rollback();throw error}
 }
 const waiting=session.pendingNested;
 let root,responses;
 if(waiting){
  const selected=waiting.actions.find(a=>sameAction(a,action));
  if(!selected)throw Error("Illegal pending reaction "+JSON.stringify(action));
  root=waiting.root;responses=[...waiting.responses,selected];
 }else{root=action;responses=[];}
 const forkStarted=profileEvent?performance.now():0;
 const fork={
  ...session,state:forkGameState(session.state,{fastPiles:fastPileClones,
   fastMetrics:fastMetricClones}),
  remainingReturns:[...session.remainingReturns],
  history:recordHistory?session.history.slice():session.history,
  pendingNested:null
 };
 if(profileEvent)profileEvent("canonicalFork",session.phase,
  performance.now()-forkStarted);
 // Trace ONLY actual committed dice, never hypothetical MCTS draws.
 // Nested choices replay the same root action; pending replays are not
 // emitted, and the RNG is restored before the real state is updated.
 const diceTape=onCommittedDice?[]:null;
 const originalDie=fork.state.rng.die;
 if(diceTape)fork.state.rng.die=sides=>{
  const face=originalDie(sides);
  diceTape.push({sides,face,roomId:fork.state.room?.id??null,
   monsterId:fork.state.monster?.id??null,
   stage:fork.state.room?.stage??null});
  return face;
 };
 let position=0;
 fork.state._decisionHook=event=>{
  const actions=canonicalReactionActions(fork.state,event);
  if(position<responses.length){
   const requested=responses[position++];
   const selected=actions.find(a=>sameAction(a,requested));
   if(!selected)throw Error("Replayed reaction ceased to be legal: "+
    JSON.stringify({requested,legal:actions}));
   // The current observed reaction and all preceding dice are fixed.
   // A hypothetical agent may resample only the still-hidden future
   // AFTER the last previously committed reaction is replayed.
   // A sampled path may itself reach another reaction before the
   // originally chosen root action finishes. On every retry, switch at
   // the SAME observed reaction, not after the latest pending reply.
   for(const switchAt of switches)
    if(position===(switchAt.at??responses.length))
     switchAt.callback(fork.state);
   return selected;
  }
  throw new NeedReaction(event,actions,observeGame(fork.state));
 };
 try{
  const committedObservation=submitDecisionDirect(fork,root,{
   observeResult,recordHistory,verifiedAction:verifiedRoot});
  if(position!==responses.length)throw Error("Pending decision replay diverged");
  delete fork.state._decisionHook;
  if(diceTape)fork.state.rng.die=originalDie;
  // Preserve the canonical game-state object identity across accepted
  // decisions. Forked Hero/Item aliases remain consistent *within* it.
  const real=session.state;
  for(const key of Object.keys(real))if(!(key in fork.state))delete real[key];
  Object.assign(real,fork.state);
  fork.state=real;
  Object.assign(session,fork,{pendingNested:null});
  if(diceTape)onCommittedDice(diceTape);
  // submitDecisionDirect already produced this canonical observation
  // after all printed effects settled; enumerating actions again here
  // was duplicate work on every committed decision.
  return committedObservation;
 }catch(e){
  if(!(e instanceof NeedReaction))throw e;
  session.pendingNested={root,responses,
   trigger:e.event,actions:e.actions,observation:e.observation};
  return observeResult?observeSession(session):undefined;
 }
}

/**
 * Internal MCTS-only transition for a *disposable* hypothetical session.
 * It executes the exact canonical phase machine with the same printed
 * reaction hook as fork/replay, but defers copying until a reaction actually
 * suspends. The caller MUST restore a preceding simulation checkpoint if
 * that occurs. Do not use for a real/player-owned session: non-reaction
 * rule exceptions intentionally propagate without transactional rollback.
 */
export function submitSpeculativeDecision(session,action,{
 restore,verifiedLegalActions=null,observeResult=false,recordHistory=false
}={}){
 if(typeof restore!=="function")
  throw Error("Speculative MCTS transition requires a rollback callback");
 if(session.pendingNested)
  throw Error("Nested responses must use canonical fork and replay");
 if(session.phase==="terminal")throw Error("Expedition already ended");
 const ticket=verifiedLegalActions?issuedLegalLists.get(verifiedLegalActions):null;
 if(verifiedLegalActions&&(!ticket||ticket.session!==session||
    ticket.state!==session.state||ticket.phase!==session.phase||
    ticket.heroIndex!==session.heroIndex||
    ticket.pendingNested!==session.pendingNested||
    ticket.count!==session.actionCount||
    !verifiedLegalActions.includes(action)))
  throw Error("Stale or unissued canonical legal-action ticket");
 const state=session.state;
 if(state._decisionHook)
  throw Error("Cannot speculate while a canonical decision hook is active");
 state._decisionHook=event=>{
  const actions=canonicalReactionActions(state,event);
  throw new NeedReaction(event,actions,observeGame(state));
 };
 try{
  return submitDecisionDirect(session,action,{
   observeResult,recordHistory,verifiedAction:Boolean(ticket)});
 }catch(error){
  // This path is only for search-owned disposable simulations; nonetheless,
  // restore the checkpoint on ordinary rule errors as well, so their
  // reproduction state matches the original canonical transaction.
  if(!(error instanceof NeedReaction)){
   restore();
   throw error;
  }
  // Roll back EVERY earlier printed effect and consumed die. The pending
  // choice and public observation are from the identical canonical hook
  // used by the ordinary full-fork transaction.
  restore();
  session.pendingNested={
   root:action,responses:[],trigger:error.event,
   actions:error.actions,observation:error.observation
  };
  return observeResult?observeSession(session):undefined;
 }finally{
  delete state._decisionHook;
 }
}
