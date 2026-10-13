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
import {itemOptions} from "../item-access.js";
import {playerAttack,monsterRespond,executeItemOption}
 from "./combat.js";

export {ExpeditionState,strategies,roomPolicies}
 from "./expedition-state.js";
export {randomSource} from "./random.js";
export {d6Band} from "./dice-bands.js";
export {playerAttack,monsterRespond,executeItemOption,blessBeforeD20}
 from "./combat.js";

const STAGES=["UPPER","MIDDLE","DEEP"];
const owners=s=>s.heroes.map((h,i)=>({
 index:i,hero:h.card.id,hp:h.hp,maxHP:h.card.hp,poison:h.poison,
 alive:h.hp>0,
 inventory:h.inventory.map(card=>card.id),
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
  ended:!s.alive()||s.metrics.won,
  won:!!s.metrics.won
 };
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
 const affordable=ops=>{
  const cost=ops.reduce((sum,op)=>{
   const m=/^(COST|DISCARD):(\d+)$/.exec(op);
   return sum+(m?Number(m[2]):0);
  },0);
  return s.discardable(cost)&&
   (!ops.includes("CLEANSE_COST")||s.partyCount("CURSED")>0)&&
   (!ops.some(op=>["FUNGUS_BURN","CHOIR_SILENCE",
     "BOOKCASE_FIRE_OR_SCROLL"].includes(op))||
    s.has("torch")||s.has("lantern-heart")||
    s.partyCount("FIRE")>0||s.partyCount("MAGIC")>0);
 };
 return choices.map((ops,i)=>affordable(ops)?i:null)
  .filter(i=>i!==null);
}
/** Resolve exactly one printed choice through the canonical effect engine. */
export function chooseRoom(s,index){
 if(!legalRoomChoices(s).includes(index))
  throw Error("Illegal Room choice "+index);
 s.metrics.roomChoices[s.room.id+":"+index]=
  (s.metrics.roomChoices[s.room.id+":"+index]||0)+1;
 s.setActor(s.chooseActor());
 for(const code of ROOM_EFFECTS[s.room.id].choices[index]){
  const [operation,...args]=code.split(":");
  s.apply(operation,args,s.room);
 }
 return observeGame(s);
}
/** Legal combat options at the current state and timing, without AI scores. */
export function legalCombatActions(s,heroIndex){
 if(!s.monster||s.monsterHP<=0)return [];
 const hero=s.heroes[heroIndex];
 if(!hero||hero.hp<=0)return [];
 return [{kind:"attack",heroIndex},...itemOptions(s,hero,"combat")
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
  (a.kind==="attack"||a.optionIndex===action.optionIndex));
 if(!candidate)throw Error("Illegal combat action");
 const hero=s.heroes[action.heroIndex];
 s.setActor(hero);
 if(candidate.kind==="attack")playerAttack(s,hero);
 else{
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
 return new ExpeditionState(options);
}
