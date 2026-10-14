/**
 * Reusable, headless Rogue Cards rules API for a future computer game.
 *
 * No AI, Monte Carlo, DOM, Node or rendering dependencies. Methods are
 * deterministic for a given seed and sequence of commands. Deliberately
 * exposes *atomic* rules transitions; a UI controls the action sequence,
 * player input, pauses and presentation. Research policies remain in
 * expedition-campaign / research-agent, outside this module.
 */
import {ExpeditionState} from "./expedition-state.js";
import {ROOM_EFFECTS} from "../room-effect-model.js";
import {fateChoiceLegal} from "../room-fates.js";
import {itemOptions} from "../item-access.js";
import {sealCost} from "./vault.js";
import {playerAttack,monsterRespond,executeItemOption,engraveElbereth}
 from "./combat.js";

export {ExpeditionState,strategies,roomPolicies}
 from "./expedition-state.js";
export {seal,sealCost} from "./vault.js";
export {randomSource} from "./random.js";
export {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "./decision-session.js";
export {d6Band} from "./dice-bands.js";
export {playerAttack,monsterRespond,executeItemOption,engraveElbereth,blessBeforeD20}
 from "./combat.js";

const STAGES=["UPPER","MIDDLE","DEEP"];
const owners=s=>s.heroes.map((h,i)=>({
 index:i,hero:h.card.id,hp:h.hp,maxHP:h.card.hp,poison:h.poison,
 alive:h.hp>0,
 inventory:h.inventory.map(card=>card.id),
 inventoryCopies:h.inventory.map(card=>card._physicalCopy||card.id),
 usedPotionTokens:(h.keptUsedPotions||[]).map(x=>({
  cardId:x.card.id,copy:x.card._physicalCopy||x.card.id,kind:x.kind})),
 usedThisRoom:[...h.used].map(x=>typeof x==="string"?x:
  x._physicalCopy||x.id).sort(),
 exhaustedCopies:h.inventory.filter(c=>s.exhausted.has(c))
  .map(c=>c._physicalCopy||c.id).sort(),
 keptEffects:[...h.kept],
 modifiers:Object.fromEntries([
  "nextAdv","nextDis","nextAtk","nextDamage","nextWitDis",
  "nextHitBlock","nextDarknessDis","ignoreDarknessOnce",
  "nextDefenseAdv","nextDefenseBonus","nextDefenseDis",
  "nextDefensePenalty","damageVulnerability","scouting",
  "defDuration","immune"
 ].map(k=>[k,h[k]??null])),
 equipped:Object.fromEntries(Object.entries(h.slots)
  .map(([slot,card])=>[slot,card.id]))
}));

/** A *public* JSON-serializable snapshot safe to send to a UI or save log.
 * Does not expose real hidden deck ordering, RNG closures or Oracle fields.
 */
export function observeGame(s){
 return {
  phase:s.room?.stage==="FINAL"?"vault":s.monster?"combat":
   s.room?"room":"between-rooms",
  room:s.room?{id:s.room.id,title:s.room.title,stage:s.room.stage,
   kind:s.room.v2.kind,choices:s.room.v2.choices}:null,
  monster:s.monster?{id:s.monster.id,title:s.monster.title,
   hp:s.monsterHP,maxHP:s.monster.hp}:null,
  heroes:owners(s),
  progress:{...s.stageProgress,cleared:s.metrics.cleared},
  inventoryDeckRemaining:s.deck.length,
  roomCardsRemaining:Object.fromEntries(STAGES.map(stage=>
   [stage,s.rooms[stage].length])),
  monsterCardsRemaining:Object.fromEntries(STAGES.map(stage=>
   [stage,s.monsters[stage].length])),
  scoutedRooms:Object.fromEntries(STAGES.map(stage=>
   [stage,[...(s.peekedRoomIds[stage]||[])]])),
  knownBottomRooms:Object.fromEntries(STAGES.map(stage=>
   [stage,[...(s.publicBottomRoomIds?.[stage]||[])]])),
  telegraphedWardenBehavior:s.telegraphedWardenBehavior??null,
  observedRoomReroll:s._pendingRoomReroll?
   {...s._pendingRoomReroll}:null,
  offeredSavedPath:s._pendingRoomSwap?{...s._pendingRoomSwap}:null,
  keptRooms:s.keptRooms.map(x=>({id:x.card.id,
     choice:x.choice??null,item:x.item?.id??null})),
   returnChoices:{...s.returnChoices},
   endingOptions:s.room?.stage==="FINAL"?{...s.vaultModifiers}:null,
   ended:!s.alive()||s.metrics.won||!!s.metrics.escaped,
  won:!!s.metrics.won,
   elberethAttempts:s.elberethAttempts,
  combatFlags:{actedMask:s._actedCombatMask||0,
   monsterSkip:s.monsterSkip,monsterAdv:s.monsterAdv,
   monsterDis:s.monsterDis,forcedBehavior:s.forcedBehavior,
   mustFightFollowingWisp:s.mustFightFollowingWisp||false,
   heroFirstAdv:s.heroFirstAdv,trapGuard:s.trapGuard,
   poisonRoom:s.poisonRoom,ratFavor:s.ratFavor,
   nextLadder:s.nextLadder,skipNextMonster:s.skipNextMonster},
  revealedDestinations:{savedPath:s.savedPath?.id??null,
   whisperRoom:s.whisperRoom?.id??null,
   savedPathGrace:s.savedPathGrace},
   trapdoors:s.trapdoorHistory.map(x=>({...x})),
   rerolls:s.rerollHistory.map(x=>({...x})),
   ending:s.endingKind
 };
}

// A UI can select an ability's reliable or risky branch before its trigger.
export function setHeroAbilityMode(s,heroId,mode){
 if(!["steady","risk"].includes(mode)||!s.heroes.some(h=>h.card.id===heroId))
  throw Error("Invalid Hero ability choice");
 s.heroAbilityModes[heroId]=mode;
 return observeGame(s);
}
// Kept Rooms explicitly offer a second decision when their trigger occurs.
export function setReturnChoice(s,roomId,choice){
 if(!["save","escape","leave","recover","smuggle","heal","burn",
   "roll","pay","use"].includes(choice))
  throw Error("Invalid return choice");
 if(!s.keptRooms.some(x=>x.card.id===roomId))
  throw Error("Room not retained: "+roomId);
 if(!legalActions(s,{phase:"retained",roomId}).some(a=>a.mode===choice))
  throw Error("Return choice is not printed or affordable for "+roomId+
   ": "+choice);
 s.returnChoices[roomId]=choice;
 return observeGame(s);
}
/** A UI chooses the Room; it never needs to inspect the hidden pile. */
export function enterNextRoom(s){
 if(!s.alive())throw Error("Party has been defeated");
 if(s.room)throw Error("Finish the current Room before drawing another");
 const stage=STAGES.find(k=>s.stageProgress[k]<3&&s.rooms[k].length);
 if(!stage)return null; // Vault is the next stage; resolve it explicitly.
 const room=s.rooms[stage].shift();
 s.beginRoom(room);
 const prompt=/Draw an? (UPPER|MIDDLE|DEEP) Monster/.exec(s.room.v2.prompt);
 if(prompt)s.drawMonster();
 return observeGame(s);
}
/** Tests exactly the printed costs and available resources, without
 * injecting the scripted/optimized experiment heuristics.
 */
export function legalRoomChoices(s){
 if(!s.room||s.room.stage==="FINAL")return [];
 const choices=ROOM_EFFECTS[s.room.id]?.choices;
 if(!choices)throw Error("Room has no executable choices: "+s.room.id);
 const affordable=(ops,index)=>{
  if(s.room.v2.fate&&!fateChoiceLegal(s,s.room.id,index))return false;
  // ROOM_SPECIAL delegates to retained/corridor handlers. Their real
  // printed upfront costs must be checked here, not deferred until an
  // action was already selected. This is a legality contract.
  if(s.room.v2.special&&index===0&&
    ["m-hungry-door","m-well"].includes(s.room.id)&&
    !s.discardable(1))return false;
  const cost=ops.reduce((sum,op)=>{
   const m=/^(COST|DISCARD):(\d+)$/.exec(op);
   return sum+(m?Number(m[2]):0);
  },0);
  return s.discardable(cost)&&
   (!ops.includes("CLEANSE_COST")||s.partyCount("CURSED")>0)&&
   (!ops.some(op=>["FUNGUS_BURN","CHOIR_SILENCE",
     "BOOKCASE_FIRE_OR_SCROLL"].includes(op))||
    s.has("torch")||s.has("lantern-heart")||
    s.partyCount("FIRE")>0||s.partyCount("MAGIC")>0||
     ops.includes("CHOIR_SILENCE")&&s.keptRooms.some(x=>x.card.id==="m-treasure"));
 };
 return choices.map((ops,i)=>affordable(ops,i)?i:null)
  .filter(i=>i!==null);
}
/** Resolve exactly one printed choice through the canonical effect engine. */
export function chooseRoom(s,index){
 if(!legalRoomChoices(s).includes(index))
  throw Error("Illegal Room choice "+index);
 s.metrics.roomChoices[s.room.id+":"+index]=
  (s.metrics.roomChoices[s.room.id+":"+index]||0)+1;
 s.setActor(s.chooseRecipient("room-action"));
 for(const code of ROOM_EFFECTS[s.room.id].choices[index]){
  // A lethal cost or printed effect ends the expedition. Subsequent
  // instructions must not create decisions or revive a wiped party.
  if(!s.alive())break;
  const [operation,...args]=code.split(":");
  s.apply(operation,args,s.room);
 }
 // Loyal Hound's Beetle Caravan link gives a SCOUT after BARGAIN,
 // not a free 5-6 outcome or a modifier to STEAL.
 if(s.room.id==="m-beetle"&&index===0&&
    s.heroes.some(h=>h.hp>0&&s.equipped(h,"dog"))&&s.alive())
  s.peek(1);
 return observeGame(s);
}
/** Legal combat options at the current state and timing, without AI scores. */
export function legalCombatActions(s,heroIndex){
 if(!s.monster||s.monsterHP<=0)return [];
 const hero=s.heroes[heroIndex];
 if(!hero||hero.hp<=0)return [];
 return [{kind:"attack",heroIndex},{kind:"pass",heroIndex},
   ...(!["sentinel","warden","warden-fury"].includes(s.monster.id)&&s.elberethAttempts<2?
    [{kind:"elbereth",heroIndex,mode:"ward"},
     ...(s.discardable()?[{kind:"elbereth",heroIndex,mode:"flee"}]:[])]:[]),
   ...itemOptions(s,hero,"combat")
  .map((option,i)=>({kind:"item",heroIndex,optionIndex:i,
   cardId:option.card.id,mode:option.mode}))];
}
/** Apply a Hero's chosen attack or Item using the exact simulation rules.
 * Monster response is a *separate* UI-controlled transition.
 */
export function takeCombatAction(s,action){
 if(!action||!Number.isInteger(action.heroIndex))
  throw Error("Combat action requires a Hero index");
 const legal=legalCombatActions(s,action.heroIndex);
 const candidate=legal.find(a=>a.kind===action.kind&&
  (a.kind==="attack"||a.kind==="pass"||
      a.kind==="elbereth"&&a.mode===action.mode||
      a.kind==="item"&&a.optionIndex===action.optionIndex));
 if(!candidate)throw Error("Illegal combat action");
 const hero=s.heroes[action.heroIndex];
 s.setActor(hero);
 if(candidate.kind==="attack")playerAttack(s,hero);
 else if(candidate.kind==="pass"){/* Printed pass consumes this Hero's turn. */}
 else if(candidate.kind==="elbereth"){
  // ELBERETH is a standalone printed combat action, not an Item.
  // On failure it immediately performs its Monster response; the
  // subsequent response command consumes elberethSkipResponse.
  const result=engraveElbereth(s,hero,{mode:candidate.mode});
  if(!result.legal)throw Error("ELBERETH became illegal");
 }else{
  const option=itemOptions(s,hero,"combat")[candidate.optionIndex];
  if(!executeItemOption(s,hero,option))
   throw Error("Combat Item was not activated");
 }
 return observeGame(s);
}
export function takeMonsterResponse(s,heroIndex){
 const hero=s.heroes[heroIndex];
 if(!hero||!s.monster||s.monsterHP<=0)
  throw Error("No active Monster response");
 monsterRespond(s,hero);
 return observeGame(s);
}
/** End an already-resolved Room, including corridor progress accounting.
 * The surrounding game flow decides when to prompt for this action.
 */
export function finishCurrentRoom(s){
 if(!s.room||s.room.stage==="FINAL")
  throw Error("No regional Room to finish");
 if(s.monster&&s.monsterHP>0||s.monsterQueue.length)
  throw Error("Cannot leave Room with unresolved Monsters");
 if(!s.room.v2.special?.corridor){
  s.metrics.cleared++;
  s.stageProgress[s.room.stage]++;
 }
 s.endRoom();
 s.room=null;
 return observeGame(s);
}
export function createGame(options={}){
 // Do not allow experiment-only policy parameters to leak into the
 // future computer game's public constructor. AI/equipment decisions
 // are currently handled by the old scripted runner, not by this API.
 const allowed=new Set(["seed","heroes"]);
 for(const key of Object.keys(options))
  if(!allowed.has(key))
   throw Error("Unknown public game option "+key+
    " (experiment policies belong in expedition-campaign.js)");
 return new ExpeditionState(options);
}


/**
 * One read-only legal-action surface for *all currently representable*
 * player timing windows. Callers must supply the phase explicitly when a
 * reaction or a retained-Room trigger is being resolved. This API never
 * guesses that an inactive trigger is legal.
 *
 * Every returned action has a stable kind, phase and identifying attributes.
 * Research search and future UI consume the same actions; no heuristic
 * weights or hidden deck ordering may affect their legality.
 */
export function legalActions(s,{phase=null,heroIndex=0,roomId=null,
 cost=0,context=null}={}){
 if(!phase)phase=s.monster?"combat":s.room?.stage==="FINAL"?"vault":
  s.room?"room":"between-rooms";
 if(phase==="effect-choice"){
  const pending=s._pendingEffectChoices;
  return pending?.context?pending.modes.map(mode=>({
   phase,kind:"effect-option",context:pending.context,mode})):[];
 }
 if(phase==="spend-item"){
  return (s._pendingSpendOptions||[]).map(x=>({
   phase,kind:"discard-card",heroIndex:x.heroIndex,
   index:x.index,cardId:x.cardId}));
 }
 if(phase==="remains"){
  if(!s.room||s.room.stage==="FINAL"||s.monster)return [];
  return (s.keptMonsterRewards||[]).flatMap((x,index)=>
   x.monsterId==="eye"?[{
    phase,kind:"use-eye",index,monsterId:"eye"}]:[]);
 }
 if(phase==="corridor"){
  const offered=s._offeredRoomChoices||[];
  return offered.map((room,index)=>({phase,kind:"enter-shown-room",
   roomId:room.id,index}));
 }
 if(phase==="hero-trigger"){
  const h=s.heroes[heroIndex];
  if(!h||h.hp<=0)return [];
  const onceToken=h.card.id==="witch"&&context==="after-scroll-or-potion"?
   "witch-ability":"hero";
  if(h.used.has(onceToken))return [];
  return [{phase,kind:"skip",heroIndex},
   ...["steady","risk"].map(mode=>({phase,kind:"hero-mode",heroIndex,mode}))];
 }
 if(phase==="saved-reroll"){
  const h=s.heroes[heroIndex];
  return h?.hp>0&&h.kept.includes("reroll")?
   [{phase,kind:"keep",heroIndex},{phase,kind:"reroll",heroIndex}]:[];
 }
 if(phase==="reroll"){
  const h=s.heroes[heroIndex];
  if(!h||h.hp<=0||!Number.isInteger(cost)||cost<1||cost>3)return [];
  return [{phase,kind:"keep",heroIndex,cost},
   ...(h.hp>cost?[{phase,kind:"reroll",heroIndex,cost}]:[])];
 }
 if(phase==="corpse"){
  if(!s.monster||s.monsterHP>0||s.monster.stage==="FINAL"||
    s.monster.id==="sentinel"||!s.alive())return [];
  const id=s.monster.id;
  const remains={
   rat:["eat"],crawler:["eat"],bat:["eat"],troll:["eat"],
   mold:["eat"],rust:["eat"],goblin:["search"],
   eye:["keep-eye"],wraith:["release","keep-whisper"]
  };
  return [{phase,kind:"leave"},...(remains[id]||[])
   .map(kind=>({phase,kind}))];
 }
 if(phase==="monster-response"){
  const h=s.heroes[heroIndex];
  return h?.hp>0&&s.monster&&s.monsterHP>0?
   [{phase,kind:"respond",heroIndex}]:[];
 }
 if(phase==="room"){
  const printed=legalRoomChoices(s)
   .map(index=>({phase,kind:"room-choice",index,roomId:s.room.id}));
  if(s.room?.v2.kind!=="SHRINE")return printed;
  const substitutes=[];
  for(const [heroIndex,h] of s.heroes.entries()){
   if(h.hp<=0)continue;
   if(s.equipped(h,"staff")){
    if(h.hp<h.card.hp)substitutes.push({phase,kind:"shrine-item",
     heroIndex,cardId:"staff",mode:"heal"});
    if(s.exhaustedWand())substitutes.push({phase,kind:"shrine-item",
     heroIndex,cardId:"staff",mode:"recharge"});
   }
   if(h.inventory.some(c=>c.id==="wand-market")&&s.exhaustedWand())
    substitutes.push({phase,kind:"shrine-item",
     heroIndex,cardId:"wand-market",mode:"recharge"});
  }
  return [...printed,...substitutes];
 }
 if(phase==="combat-hero"){
  return s.heroes.map((h,i)=>({h,i})).filter(x=>x.h.hp>0&&
   !(s._actedCombatMask&(1<<x.i)))
   .map(x=>({phase,kind:"choose-hero-turn",heroIndex:x.i}));
 }
 if(phase==="combat")return legalCombatActions(s,heroIndex)
  .map(a=>({...a,phase}));
 if(phase==="parley"){
  if(!s.monster||s.monster.stage==="FINAL"||!s.alive())return [];
  const m=s.monster.id;
  const needs={"rat":1,"goblin":2,"troll":2,"eye":1,"rust":1,"sentinel":2};
  const tag=["rust","sentinel"].includes(m)?"METAL":null;
  const canPay=m in needs?s.discardable(needs[m],tag):
   ["crawler","mold"].includes(m)?s.heroes.some(h=>
    h.hp>0&&h.inventory.some(c=>c.v2.kind==="POTION")):
   ["wraith","cultist"].includes(m)?s.anyEquippedTag("CURSED"):
   ["bat","wisp"].includes(m);
  return [{phase,kind:"fight"},...(canPay?[{phase,kind:"parley"}]:[])];
 }
 if(phase==="vault"){
  if(s.room?.stage!=="FINAL"||!s.alive())return [];
  const options=[{phase,kind:"fight"}];
  if(s.discardable(sealCost(s),"MAGIC"))options.push({phase,kind:"seal"});
  return options;
 }
 if(phase==="post-warden"){
  if(s.room?.stage!=="FINAL"||!s.alive())return [];
  const v=s.vaultModifiers||{},options=[{phase,kind:"fight"}];
  if(v.smuggleAvailable&&s.discardable(2)&&s.discardable(1,"MAGIC"))
   options.push({phase,kind:"smuggle"});
  if(v.bargainAvailable&&s.discardable(2))
   options.push({phase,kind:"bargain"});
  if(v.unthroneAvailable&&s.discardable(1,"MAGIC"))
   options.push({phase,kind:"unthrone"});
  if(v.smuggleAvailable&&s.discardable())
   options.push({phase,kind:"escape"});
  return options;
 }
 if(phase==="hero-ability"){
  const h=s.heroes[heroIndex];
  if(!h||h.hp<=0||h.used.has("hero"))return [];
  return ["steady","risk"].map(mode=>({phase,kind:"hero-mode",heroIndex,mode}));
 }
 if(phase==="retained"){
  const kept=s.keptRooms.find(k=>k.card.id===roomId);
  if(!kept)return [];
  const alternatives={
   "m-well":["leave","roll"],"m-clock":["pay","roll"],
   "m-hungry-door":["pay","roll"],
   "u-hollow-knight":["escape","save"],
   "m-ferryman-oath":["recover","smuggle"],
   "m-bridge":["use","save"],"m-wax-bridge":["use","save"],
   "u-puppet":["use","save"]
  };
  let modes=alternatives[roomId]||[];
  if(roomId==="m-ferryman-oath"&&kept.choice!==0)
   modes=[];
  if(["m-clock","m-hungry-door"].includes(roomId)&&!s.discardable())
   modes=modes.filter(x=>x!=="pay");
  return modes.map(mode=>({phase,kind:"return",roomId,mode}));
 }
 if(phase==="equipment"){
  const h=s.heroes[heroIndex];
  if(!h||h.hp<=0||s.monster)return [];
  const equips=h.inventory.flatMap((card,index)=>{
   const slot=card.v2.tags.includes("WEAPON")?"weapon":
    card.v2.tags.includes("ARMOUR")?"armour":
    card.v2.kind==="RING"?"ring":
    card.v2.kind==="COMPANION"?"companion":null;
   return !slot||h.slots[slot]===card||s.cursed(h.slots[slot])?[]:
    [{phase,kind:"equip",heroIndex,index,cardId:card.id,slot}];
  });
  const unequips=Object.entries(h.slots).flatMap(([slot,card])=>
   card&&!s.cursed(card)?[{phase,kind:"unequip",heroIndex,slot,
    cardId:card.id}]:[]);
  const transfers=h.inventory.flatMap((card,index)=>
   Object.entries(s.heroes).filter(([i,to])=>Number(i)!==heroIndex&&
    to.hp>0&&!(s.cursed(card)&&s.equipped(h,card.id)))
    .map(([i])=>({phase,kind:"transfer",heroIndex,index,
     toHeroIndex:Number(i),cardId:card.id})));
  return [...equips,...unequips,...transfers];
 }
 const itemPhases=new Set(["explore","between-rooms","room-choice",
  "after-roll","failed-d20","before-defence","after-hit",
  "on-attack","on-hit","on-poison","after-magic","room-roll"]);
 if(itemPhases.has(phase)){
  const h=s.heroes[heroIndex];
  if(!h||h.hp<=0)return [];
  return [{phase,kind:"continue"},...itemOptions(s,h,phase)
   .map((o,index)=>({phase,kind:"item-trigger",heroIndex,
    index,cardId:o.card.id,mode:o.mode}))];
 }
 throw Error("Unknown decision phase "+phase);
}
/**
 * Apply already-legal atomic decisions; multi-step Vault/PARLEY/Warden
 * resolution remains owned by the expedition phase controller. The explicit
 * refusal to apply those actions here is preferable to simulating a
 * different rule path. Researchers use full-effect campaign continuations.
 */
export function applyAction(s,action){
 if(!action||typeof action!=="object"||typeof action.phase!=="string")
  throw Error("Action requires a phase");
 const legal=legalActions(s,{phase:action.phase,
  heroIndex:action.heroIndex??0,roomId:action.roomId??null});
 const selected=legal.find(candidate=>
  Object.keys(candidate).every(key=>candidate[key]===action[key]));
 if(!selected)throw Error("Illegal action "+JSON.stringify(action));
 if(action.phase==="room"){
  if(selected.kind==="room-choice")return chooseRoom(s,selected.index);
  const h=s.heroes[selected.heroIndex],
   item=h.inventory.find(c=>c.id===selected.cardId);
  if(!item)throw Error("Missing printed Shrine replacement Item");
  s.directItem(h,item,"shrine-skip-choice",()=>{
   if(selected.mode==="heal")s.heal(h,2);
   else if(!s.recharge())throw Error("No exhausted Wand to recharge");
   return true;
  });
  return observeGame(s);
 }
 if(action.phase==="combat")return takeCombatAction(s,selected);
 if(action.kind==="hero-mode")return setHeroAbilityMode(
  s,s.heroes[action.heroIndex].card.id,action.mode);
 if(action.kind==="return"){
  // Store the chosen branch until the canonical retained-Room handler
  // resolves its existing printed trigger, not a fabricated new effect.
  s.returnChoices[action.roomId]=action.mode;return observeGame(s);
 }
 if(action.kind==="equip"){
  const h=s.heroes[action.heroIndex],c=h.inventory[action.index];
  h.slots[action.slot]=c;return observeGame(s);
 }
 if(action.kind==="unequip"){
  delete s.heroes[action.heroIndex].slots[action.slot];
  return observeGame(s);
 }
 if(action.kind==="transfer"){
  const from=s.heroes[action.heroIndex],to=s.heroes[action.toHeroIndex];
  const [card]=from.inventory.splice(action.index,1);
  if(card?.id!==action.cardId)throw Error("Transferred Item changed");
  for(const [slot,item] of Object.entries(from.slots))
   if(item===card)delete from.slots[slot];
  // Transfer is not a new acquisition; no double counting or hidden auto-equip.
  to.inventory.push(card);
  return observeGame(s);
 }
 if(action.kind==="item-trigger"){
  const h=s.heroes[action.heroIndex],o=itemOptions(s,h,action.phase)[action.index];
  if(!o)throw Error("Selected Item opportunity no longer exists");
  if(o.mode==="recharge"){
   if(o.card.id!=="lantern-heart")throw Error("Unsupported free Item recharge");
   s.directItem(h,o.card,o.mode,()=>{
    s.consume(h,o.card);
    if(!s.recharge())throw Error("No exhausted Wand to recharge");
    return true;
   });
  }else if(s.activate(h,o.card,{mode:o.mode})){
   // Ghost Coin explicitly says DISCARD on use; unlike a Potion it
   // is a TOOL and is not automatically consumed by s.activate().
   if(o.card.id==="coin"&&h.inventory.includes(o.card))s.consume(h,o.card);
  }else throw Error("Item activation failed: "+
   JSON.stringify({cardId:o.card.id,mode:o.mode,phase:action.phase,
    roomId:s.room?.id,monsterId:s.monster?.id,
    physicalCopy:o.card._physicalCopy}));
  return observeGame(s);
 }
 if(action.kind==="use-eye"){
  const [reward]=s.keptMonsterRewards.splice(action.index,1);
  if(!reward||reward.monsterId!=="eye")
   throw Error("Selected Eye must be physically retained");
  s.peek(2,true);return observeGame(s);
 }
 if(action.kind==="continue")return observeGame(s);
 throw Error("Multi-stage "+action.phase+" requires a campaign continuation; no substitute rules");
}
