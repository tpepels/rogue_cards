/** Shared solo-pragmatic decision helpers for play and MCTS. */
import {itemOptions} from "./item-access.js";
const safePhases=new Set(["between-rooms","explore"]);

/**
 * Solo research policy, not a rule of the game. Choose a single useful
 * equipment upgrade from currently legal canonical equip actions.
 * Equipped WEAPON/ARMOUR strength is evaluated with the exact current
 * ExpeditionState.stats() implementation, not a duplicated item list.
 * A vacant RING/COMPANION slot can be filled once; a filled slot is not
 * changed without a known stat improvement. No unequip/re-equip cycles.
 *
 * This intentionally leaves all non-equipment actions to normal MCTS.
 * It does not inspect hidden decks, mutate the live state, or alter
 * sessionActions()/applyAction()/printed equipment permissions.
 */
export function usefulSoloEquipmentAction(session,legal){
 if(session.state.heroes.length!==1||
  !safePhases.has(session.phase)||session.state.monster)return null;
 const h=session.state.heroes[0],s=session.state;
 if(!h||h.hp<=0)return null;
 const candidates=[];
 const currentStats=s.stats(h);
 for(const action of legal){
  if(action.phase!=="equipment"||action.kind!=="equip"||
   action.heroIndex!==0)continue;
  const card=h.inventory[action.index];
  if(!card||card.id!==action.cardId||
   !["weapon","armour","ring","companion"].includes(action.slot))
   continue;
  const before=h.slots[action.slot];
  let utility=0;
  if(action.slot==="weapon"||action.slot==="armour"){
   // Only simulate a reversible PUBLIC equipment slot assignment.
   // No state transition, die roll, item consumption, or hidden card.
   h.slots[action.slot]=card;
   let afterStats;
   try{afterStats=s.stats(h);}
   finally{
    if(before)h.slots[action.slot]=before;
    else delete h.slots[action.slot];
   }
   utility=action.slot==="weapon"?
    afterStats.atk-currentStats.atk:
    afterStats.def-currentStats.def;
  }else if(!before)utility=0.5;
  if(utility>0)candidates.push({action,utility});
 }
 candidates.sort((a,b)=>b.utility-a.utility||
  a.action.slot.localeCompare(b.action.slot)||
  a.action.index-b.action.index);
 return candidates[0]?.action??null;
}



/**
 * Conservative, opt-in solo human-play shortcuts. Each action is selected
 * from canonical sessionActions() and checked for real printed costs.
 *
 * "low HP -> heal" applies ONLY to reliable healing Tools with a known
 * positive effect at a safe between-Rooms boundary. Unidentified
 * Potions, once-per-Room reactions and random Item outcomes go to MCTS.
 *
 * "low HP -> avoid" applies at the actual parley boundary. If a
 * non-costly WIT parley is offered we try it; a paid dismissal is
 * allowed when HP is critically low and the Hero will keep at least
 * one Item where that is necessary. High-HP Heroes facing a Monster
 * with actual printed DEFEAT operations fight for those rewards.
 * Borderline cases remain MCTS decisions; there is no false
 * guaranteed-flee assumption.
 */
export function pragmaticSoloAction(session,legal){
 if(session.state.heroes.length!==1)return null;
 const s=session.state,h=s.heroes[0];
 if(!h||h.hp<=0||!legal.length)return null;
 const maxHP=h.card.hp,hp=h.hp,missing=maxHP-hp;
 if(session.phase==="between-rooms"&&!s.monster&&
   hp<=Math.ceil(maxHP*0.42)&&missing>=2){
  const available=itemOptions(s,h,"between-rooms");
  // These are exact known heal-only effects from printed Tools. Potions
  // may be unidentified/random and must NOT be blindly consumed.
  const tools=["ex-rations","ex-bandages"];
  for(const id of tools){
   if(id==="ex-bandages"&&missing<4)continue;
   const option=available.find(o=>o.card.id===id&&
    o.mode==="healing-tool");
   const action=option&&legal.find(a=>a.kind==="item-trigger"&&
    a.phase==="between-rooms"&&a.cardId===id&&
    a.heroIndex===0&&a.mode==="healing-tool");
   if(action)return {action,rule:"safe-heal:"+id};
  }
 }
 // PASS advances directly to the Monster response. If the only
 // alternative is an ordinary attack and the Hero can survive a
 // potential Room backlash, repeatedly searching PASS adds no value.
 // At critical HP or with Elbereth/Item actions, retain full MCTS.
 if(session.phase==="combat"&&hp>2&&
   legal.length===2&&legal.some(a=>a.kind==="attack")&&
   legal.some(a=>a.kind==="pass")){
  return {action:legal.find(a=>a.kind==="attack"),
   rule:"only-attack-or-pass"};
 }
 if(session.phase==="room"&&s.room?.v2.kind==="SHRINE"&&
   hp<=Math.ceil(maxHP*0.25)&&missing>=2){
  // Staff heals exactly 2 HP, but replaces the Room's normal choice.
  // Only force it at genuinely critical HP; at higher HP let MCTS
  // compare the potentially valuable printed Room alternatives.
  const staff=legal.find(a=>a.kind==="shrine-item"&&
   a.mode==="heal"&&a.cardId==="staff"&&a.heroIndex===0);
  if(staff)return {action:staff,rule:"critical-hp-shrine-heal"};
 }
 if(session.phase!=="parley"||s.monster?.stage==="FINAL")return null;
 const fight=legal.find(a=>a.kind==="fight");
 const parley=legal.find(a=>a.kind==="parley");
 if(!fight||!parley)return null;
 const m=s.monster;
 // Visible current defensive and offensive stats. No hidden pile
 // or future random faces are consulted.
 const stats=s.stats(h);
 const expectedThreat=Math.max(0.1,(21-Math.max(2,
  12+stats.def-m.atk))/20)*3.5;
 const lowHP=hp<=Math.max(4,Math.ceil(maxHP*0.40),
  Math.ceil(1.6*expectedThreat));
 const printedReward=Array.isArray(m.v2?.defeatOps)&&
  m.v2.defeatOps.some(op=>{
   if(typeof op!=="string")return true;
   // A HEAL-only corpse reward is worthless at full HP.
   if(op.startsWith("HEAL:")&&missing<=0)return false;
   return true;
  });
 // WIT parley can fail and still lead to combat. It is an attempt to
 // avoid a dangerous fight, not a guarantee of success.
 const noItemCost=m.v2?.parleyMode==="WIT"||
  ["bat","wisp"].includes(m.id);
 const parleyCost=m.v2?.parleyMode==="ITEM"?
  m.v2.parleyCost:
  ({rat:1,goblin:2,troll:2,eye:1,rust:1,
    sentinel:2})[m.id]??null;
 const affordable=parleyCost!==null&&
  h.inventory.length>parleyCost;
 const criticalHP=hp<=Math.max(2,Math.ceil(maxHP*0.25));
 const hurtsToParley=["wraith","cultist"].includes(m.id);
 if(lowHP){
  // At critical HP, saving the Hero is worth losing even the last
  // two Items when the printed parley guarantees a safe dismissal.
  // Noncritical low HP prefers retaining at least one Item.
  if(noItemCost||(parleyCost!==null&&
    (criticalHP||affordable)&&!hurtsToParley))
   return {action:parley,
    rule:(criticalHP?"critical-hp-avoid:":"low-hp-avoid:")+m.id};
  // Unable to safely avoid? Let the full search assess actual costs
  // and odds, rather than force a dangerous paid negotiation.
  return null;
 }
 // Approximate combat attrition from visible AC (12+DEF), Monster HP
 // and typical Monster behavior: no hidden dice or card information.
 const threshold=12+m.def-stats.atk;
 const hitChance=Math.max(0.05,Math.min(0.95,(21-threshold)/20));
 const expectedHeroTurns=s.monsterHP/(3.5*hitChance);
 const expectedFightLoss=Math.max(0,expectedHeroTurns-1)*
  expectedThreat*0.55;
 const healthy=hp>=Math.max(6,Math.ceil(maxHP*0.65),
  Math.ceil(expectedFightLoss*1.25+3));
 if(healthy&&printedReward)
  return {action:fight,rule:"healthy-reward-fight:"+m.id};
 return null;
}

