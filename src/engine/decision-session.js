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
const stageReady=s=>STAGES.find(k=>s.stageProgress[k]<3&&s.rooms[k].length);
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
export const sessionActions=session=>
 session.pendingNested?session.pendingNested.actions:canonical(session);
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
 return true;
}
function roomSettled(session){
 if(done(session))return;
 if(awaitingMonster(session))return;
 const s=session.state;
 if(s.room?.stage==="FINAL")throw Error("Vault must end in a terminal result");
 finishCurrentRoom(s);
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
 const state=createGame(options);
 return {state,phase:"between-rooms",heroIndex:0,
  remainingReturns:[],returnRoomId:null,
  monsterRound:0,actionCount:0,history:[]};
}
/** The controller is the ONLY place that accepts a player's choice in the
 * new pausable API. Unexpected actions are rejected BEFORE mutating state.
 */
function submitDecisionDirect(session,action){
 if(session.phase==="terminal")throw Error("Expedition already ended");
 const actions=canonical(session);
 const selected=actions.find(x=>
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
  }else applyAction(s,selected);
 }else if(phase==="retained-entry"){
  applyAction(s,selected);queuedReturn(session);
 }else if(phase==="room"){
  applyAction(s,selected);
  if(!done(session)&&!awaitingMonster(session))roomSettled(session);
 }else if(phase==="parley"){
  if(selected.kind==="parley"&&resolveParley(s)){
   if(!done(session)&&!awaitingMonster(session))roomSettled(session);
  }else if(!done(session)){
   s._actedCombatMask=0;session.phase="combat-hero";session.heroIndex=-1;
  }
 }else if(phase==="combat-hero"){
  session.heroIndex=selected.heroIndex;session.phase="combat";
 }else if(phase==="combat"){
  applyAction(s,selected);
  s._actedCombatMask|=1<<selected.heroIndex;
  afterAttack(session);
 }else if(phase==="monster-response"){
  takeMonsterResponse(s,selected.heroIndex);afterMonsterResponse(session);
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
   beginWarden(s);s.metrics.battles++;
   s._actedCombatMask=0;
   session.phase="combat-hero";session.heroIndex=-1;
   session.monsterRound=0;
  }
 }else if(phase==="post-warden"){
  const result=applyWardenChoice(s,selected.kind);
  if(result.complete||done(session))done(session);
  else{
   s.metrics.battles++;session.monsterRound=0;
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
 session.history.push({from:before,choice:{...selected},to:session.phase});
 return observeSession(session);
}

class NeedReaction extends Error {
 constructor(event,actions,observation){
  super("Decision required at "+event.phase);
  this.event=event;this.actions=actions;this.observation=observation;
 }
}
const sameAction=(a,b)=>a&&b&&
 Object.keys(a).length===Object.keys(b).length&&
 Object.keys(a).every(k=>a[k]===b[k]);

/** Re-execute one pending canonical rules call on an isolated exact-RNG
 * fork. A nested trigger suspends the entire transaction. On selection,
 * replay the SAME dice/printed effects and commit once, when complete.
 * No used Item, HP, die or deck mutation escapes an interrupted call.
 */
export function submitDecision(session,action,{
 afterReactionReplay=null,replayAt=null,replaySwitches=[]
}={}){
 if(afterReactionReplay!==null&&typeof afterReactionReplay!=="function")
  throw Error("Reaction replay observer must be a function");
 if(replayAt!==null&&(!Number.isInteger(replayAt)||replayAt<1))
  throw Error("Invalid observed reaction replay index");
 if(!Array.isArray(replaySwitches)||replaySwitches.some(x=>
  !x||!Number.isInteger(x.at)||x.at<1||
  typeof x.callback!=="function"))
  throw Error("Invalid multi-stage replay switches");
 const switches=[...replaySwitches];
 if(afterReactionReplay)switches.push({
  at:replayAt,callback:afterReactionReplay
 });
 if(session.phase==="terminal")throw Error("Expedition already ended");
 const waiting=session.pendingNested;
 let root,responses;
 if(waiting){
  const selected=waiting.actions.find(a=>sameAction(a,action));
  if(!selected)throw Error("Illegal pending reaction "+JSON.stringify(action));
  root=waiting.root;responses=[...waiting.responses,selected];
 }else{root=action;responses=[];}
 const fork={
  ...session,state:forkGameState(session.state),
  remainingReturns:[...session.remainingReturns],
  history:session.history.map(x=>({...x})),
  pendingNested:null
 };
 let position=0;
 fork.state._decisionHook=event=>{
  const args={phase:event.phase,heroIndex:event.heroIndex??0,
   roomId:event.roomId??null,cost:event.cost??0,
   context:event.context??null};
  let actions=legalActions(fork.state,args);
  if(event.cardId)actions=actions.filter(x=>x.kind==="continue"||
   x.kind==="item-trigger"&&x.cardId===event.cardId);
  if(event.allowedModes)actions=actions.filter(x=>
   event.allowedModes.includes(x.mode||x.kind));
  if(actions.length===0)throw Error("No legal printed reaction: "+JSON.stringify({
   event,roomId:fork.state.room?.id,monsterId:fork.state.monster?.id,
   inventory:fork.state.heroes[args.heroIndex]?.inventory.map(c=>c.id),
   slots:Object.fromEntries(Object.entries(
    fork.state.heroes[args.heroIndex]?.slots||{}).map(([k,v])=>[k,v?.id])),
   available:itemOptionsAtTrigger(fork.state,args)
  }));
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
  submitDecisionDirect(fork,root);
  if(position!==responses.length)throw Error("Pending decision replay diverged");
  delete fork.state._decisionHook;
  // Preserve the canonical game-state object identity across accepted
  // decisions. Forked Hero/Item aliases remain consistent *within* it.
  const real=session.state;
  for(const key of Object.keys(real))if(!(key in fork.state))delete real[key];
  Object.assign(real,fork.state);
  fork.state=real;
  Object.assign(session,fork,{pendingNested:null});
  return observeSession(session);
 }catch(e){
  if(!(e instanceof NeedReaction))throw e;
  session.pendingNested={root,responses,
   trigger:e.event,actions:e.actions,observation:e.observation};
  return observeSession(session);
 }
}
