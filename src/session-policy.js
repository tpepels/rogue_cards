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
import {usefulSoloEquipmentAction,pragmaticSoloAction} from "./solo-pragmatic.js";
export {usefulSoloEquipmentAction,pragmaticSoloAction} from "./solo-pragmatic.js";

export const MAX_CONSECUTIVE_EQUIPMENT_ACTIONS=12;
const equipmentKinds=new Set(["equip","unequip","transfer"]);
const safePhases=new Set(["between-rooms","explore"]);

export function createSessionPolicy(){
 return {consecutiveEquipment:0,cycleBreaks:0,equipmentActions:0,
  equippedUpgradeCount:0,equipmentChoicesSuppressed:0,
  shortcutCounts:{},shortcutCount:0};
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
 onPolicyDecision=null,mctsPragmaticVariant="both",
 softTreeBonus=0.15,softTreeFirstVisitProbability=0.75,
 softRolloutProbability=0.75,implicitHpScale=1,implicitThreatScale=1
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
 if(!["external-only","tree-only","rollout-only","both"].includes(
  mctsPragmaticVariant))throw Error("Unknown MCTS pragmatic variant");
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
    implicitHeuristicMode,equipmentMode,mctsPragmaticVariant,
    softTreeBonus,softTreeFirstVisitProbability,softRolloutProbability,
    implicitHpScale,implicitThreatScale,onPolicyDecision
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
  softTreeBonus,softTreeFirstVisitProbability,softRolloutProbability,
  implicitHpScale,implicitThreatScale,
  simulationPolicy:equipmentMode==="solo-pragmatic"?
   ({both:"solo-pragmatic","external-only":"solo-pragmatic-external",
     "tree-only":"solo-pragmatic-tree",
     "rollout-only":"solo-pragmatic-rollout"})[mctsPragmaticVariant]:"default",
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
