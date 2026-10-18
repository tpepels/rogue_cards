/**
 * Progress-safe MCTS continuation policy for full canonical expeditions.
 *
 * The game permits free, reversible equipment changes at a safe boundary.
 * Because equip -> unequip -> equip can repeat indefinitely, no finite
 * game-step limit can guarantee termination for an unrestricted random
 * search policy. On every non-forced decision it searches the COMPLETE
 * legal action list through real full-expedition MCTS, and never changes sessionActions(),
 * submitDecision(), printed cards, or combat rules.
 *
 * After twelve uninterrupted free equipment actions at one safe boundary,
 * progress with the actual legal "continue" action. There is no need to
 * launch an MCTS search whose output is unconditionally overridden.
 * This is a documented policy convention, not a new printed turn rule.
 */
import {sessionActions} from "./engine/decision-session.js";
import {searchDecision} from "./session-mcts.js";
import {resolveSearchProfile} from "./mcts-hybrid-defaults.js";
import {itemOptions} from "./item-access.js";

export const MAX_CONSECUTIVE_EQUIPMENT_ACTIONS=12;
const equipmentKinds=new Set(["equip","unequip","transfer"]);
const safePhases=new Set(["between-rooms","explore"]);

export function createSessionPolicy(){
 return {consecutiveEquipment:0,cycleBreaks:0,equipmentActions:0,
  equippedUpgradeCount:0,equipmentChoicesSuppressed:0,
  shortcutCounts:{},shortcutCount:0};
}

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
  m.v2.defeatOps.length>0;
 // WIT parley can fail and still lead to combat. It is an attempt to
 // avoid a dangerous fight, not a guarantee of success.
 const noItemCost=m.v2?.parleyMode==="WIT"||
  ["bat","wisp"].includes(m.id);
 const parleyCost=m.v2?.parleyMode==="ITEM"?
  m.v2.parleyCost:
  ({rat:1,goblin:2,troll:2,eye:1,rust:1,
    sentinel:2,crawler:1,mold:1})[m.id]??null;
 const affordable=parleyCost!==null&&
  h.inventory.length>parleyCost;
 const hurtsToParley=["wraith","cultist"].includes(m.id);
 if(lowHP){
  if(noItemCost||affordable&&!hurtsToParley)
   return {action:parley,rule:"low-hp-avoid:"+m.id};
  // Unable to safely avoid? Let the full search assess actual costs
  // and odds, rather than force a dangerous paid negotiation.
  return null;
 }
 const healthy=hp>=Math.max(6,Math.ceil(maxHP*0.65),
  Math.ceil(expectedThreat*3));
 if(healthy&&printedReward)
  return {action:fight,rule:"healthy-reward-fight:"+m.id};
 return null;
}

function markShortcut(policy,onPolicyDecision,rule,action){
 policy.shortcutCount=(policy.shortcutCount||0)+1;
 policy.shortcutCounts??={};
 policy.shortcutCounts[rule]=(policy.shortcutCounts[rule]||0)+1;
 if(onPolicyDecision)onPolicyDecision({rule,action});
 return action;
}

/** True only when the study has already committed to progress; MCTS
 * cannot change the next action at this boundary.
 */
export function forcesEquipmentProgress(session,policy,legal){
 return safePhases.has(session.phase)&&
  policy.consecutiveEquipment>=MAX_CONSECUTIVE_EQUIPMENT_ACTIONS&&
  legal.some(a=>a.kind==="continue");
}

export function selectSessionPolicyAction(session,policy,{
 budget=2,seed=1,maxSearchSteps=4000,knowledge="fair",observedReplay=null,
 legalActions=null,searchProfile="classic",deepMinBudget=16,
 deepVisitsPerAction=4,treeMode=null,mctsOptimizations=null,onSearchProfile=null,
 onSearchResult=null,
 rolloutCombatMode=null,rolloutCombatSamples=2,
 rolloutCombatMaxDecisions=8,implicitWeight=null,exploration=null,
 implicitHeuristicMode="legacy",equipmentMode="legacy",
 onPolicyDecision=null
}={}){
 // Performance A/B flags cannot change the search budget, legal actions,
 // game rules, chance knowledge, or UCT algorithm.
 const optimizationKeys=new Set([
  "reuseEmptyReplaySwitches","reuseEdgeActions",
  "streamHistoryHash","reuseSelectionScratch",
  "directSettlements","fastMetricClones","speculativeTransitions",
  "checkpointEvery","lazyInitialCheckpoint","profileTransitions",
  "canonicalReactionPhases","deferReactionCheckpoints",
  "onDemandCheckpoints","nativeHash",
  "lazyColdEdges","reuseTraceSlots","fastPileClones"
 ]);
 if(mctsOptimizations!==null&&(
    !mctsOptimizations||typeof mctsOptimizations!=="object"||
    Array.isArray(mctsOptimizations)||
    Object.entries(mctsOptimizations).some(([key,value])=>
     !optimizationKeys.has(key)||
     (key==="checkpointEvery"?
      !Number.isInteger(value)||value<1||value>256:
      typeof value!=="boolean"))))
  throw Error("Invalid performance-only MCTS optimization flags");
 if(onSearchProfile!==null&&typeof onSearchProfile!=="function")
  throw Error("onSearchProfile must be a function");
 if(onSearchResult!==null&&typeof onSearchResult!=="function")
  throw Error("onSearchResult must be a function");
 if(onPolicyDecision!==null&&typeof onPolicyDecision!=="function")
  throw Error("onPolicyDecision must be a function");
 if(treeMode!==null&&!["full","frontier"].includes(treeMode))
  throw Error("Invalid explicit MCTS treeMode");
 const parameters=resolveSearchProfile({
  searchProfile,rolloutCombatMode,implicitWeight,exploration
 });
 if(!Number.isInteger(deepMinBudget)||deepMinBudget<2||
    deepMinBudget>100000||!Number.isInteger(deepVisitsPerAction)||
    deepVisitsPerAction<1||deepVisitsPerAction>1000)
  throw Error("Invalid deep UCT budget parameters");
 // The caller often already enumerated the exact canonical decisions.
 // Reuse that array instead of rebuilding equipment options a second time.
 const legal=legalActions??sessionActions(session);
 if(!legal.length)throw Error("No legal policy action at "+session.phase);
 if(!["legacy","solo-efficient","solo-pragmatic"].includes(equipmentMode))
  throw Error("Unknown equipment policy mode");
 if(equipmentMode!=="legacy"&&session.state.heroes.length!==1)
  throw Error("Solo-efficient equipment policy requires exactly one Hero");
 if(equipmentMode==="solo-pragmatic"){
  const shortcut=pragmaticSoloAction(session,legal);
  if(shortcut)return markShortcut(policy,onPolicyDecision,
   shortcut.rule,shortcut.action);
 }
 if(equipmentMode!=="legacy"&&safePhases.has(session.phase)){
  const upgrade=usefulSoloEquipmentAction(session,legal);
  if(upgrade){
   policy.equipmentActions++;
   policy.equippedUpgradeCount++;
   policy.consecutiveEquipment++;
   if(equipmentMode==="solo-pragmatic")
    return markShortcut(policy,onPolicyDecision,
     "profitable-equipment",upgrade);
   return upgrade;
  }
  // Do not offer reversible equipment actions as search candidates
  // after all profitable canonical slot upgrades have been handled.
  // This is a policy-level candidate restriction, not a legality change.
  const choices=legal.filter(a=>!equipmentKinds.has(a.kind)||
   a.phase!=="equipment");
  if(choices.length!==legal.length){
   policy.equipmentChoicesSuppressed+=legal.length-choices.length;
   return selectSessionPolicyAction(session,policy,{
    budget,seed,maxSearchSteps,knowledge,observedReplay,
    legalActions:choices,searchProfile,deepMinBudget,deepVisitsPerAction,
    treeMode,mctsOptimizations,onSearchProfile,onSearchResult,
    rolloutCombatMode,rolloutCombatSamples,
    rolloutCombatMaxDecisions,implicitWeight,exploration,
    implicitHeuristicMode,equipmentMode:"legacy",
    onPolicyDecision
   });
  }
 }
 const progress=legal.find(a=>a.kind==="continue");
 // At the cap the study policy ALWAYS takes the real Continue action.
 // MCTS cannot influence this result, and searchDecision does not mutate
 // the session or advance its dice. Avoiding that discarded full-expedition
 // search preserves the exact chosen action and future chance sequence.
 if(progress&&forcesEquipmentProgress(session,policy,legal)){
  policy.cycleBreaks++;
  policy.consecutiveEquipment=0;
  return progress;
 }
 if(!Number.isInteger(rolloutCombatSamples)||rolloutCombatSamples<1||
  rolloutCombatSamples>6||
  !Number.isInteger(rolloutCombatMaxDecisions)||
  rolloutCombatMaxDecisions<1||rolloutCombatMaxDecisions>64)
  throw Error("Invalid opt-in MCTS rollout sample parameters");
 // For any decision that can affect play, search the complete legal
 // action list, with the same budget and chance seed as before.
 // Experimental deeper UCT is a DIFFERENT policy, never the implicit
 // default for existing statistical/checkpointed Oracle studies.
 const searchBudget=["deep-uct","combat-hybrid"].includes(searchProfile)?
  Math.max(budget,deepMinBudget,legal.length*deepVisitsPerAction):
  Math.max(budget,legal.length);
 const found=legal.length===1?null:searchDecision(session,{
  budget:searchBudget,seed,
  maxSteps:maxSearchSteps,knowledge,strictTerminal:true,observedReplay,
  rootActions:legal,collectCoverage:false,
  treeMode:treeMode??(searchProfile!=="classic"||
   parameters.rolloutCombatMode!=="random"?"frontier":"full"),
  rolloutCombatMode:parameters.rolloutCombatMode,rolloutCombatSamples,
  rolloutCombatMaxDecisions,implicitWeight:parameters.implicitWeight,
  exploration:parameters.exploration,implicitHeuristicMode,
  ...(mctsOptimizations??{})
 });
 if(onSearchProfile&&found?.transitionProfile)
  onSearchProfile(found.transitionProfile);
 if(onSearchResult&&found)onSearchResult(found);
 const recommended=found?found.recommended:legal[0];
 if(!recommended)throw Error("MCTS returned no legal recommendation");
 if(safePhases.has(session.phase)&&equipmentKinds.has(recommended.kind)){
  policy.consecutiveEquipment++;
  policy.equipmentActions++;
 }else{
  policy.consecutiveEquipment=0;
 }
 return recommended;
}
