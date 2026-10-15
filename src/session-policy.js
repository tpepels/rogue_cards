/**
 * Progress-safe MCTS continuation policy for full canonical expeditions.
 *
 * The game permits free, reversible equipment changes at a safe boundary.
 * Because equip -> unequip -> equip can repeat indefinitely, no finite
 * game-step limit can guarantee termination for an unrestricted random
 * search policy. This policy still searches the COMPLETE legal action list
 * through real full-expedition MCTS, and never changes sessionActions(),
 * submitDecision(), printed cards, or combat rules.
 *
 * After twelve uninterrupted free equipment actions at one safe boundary,
 * progress with the actual legal "continue" action. There is no need to
 * launch an MCTS search whose output is unconditionally overridden.
 * This is a documented policy convention, not a new printed turn rule.
 */
import {sessionActions} from "./engine/decision-session.js";
import {searchDecision} from "./session-mcts.js";

export const MAX_CONSECUTIVE_EQUIPMENT_ACTIONS=12;
const equipmentKinds=new Set(["equip","unequip","transfer"]);
const safePhases=new Set(["between-rooms","explore"]);

export function createSessionPolicy(){
 return {consecutiveEquipment:0,cycleBreaks:0,equipmentActions:0};
}

export function selectSessionPolicyAction(session,policy,{
 budget=2,seed=1,maxSearchSteps=4000,knowledge="fair",observedReplay=null
}={}){
 const legal=sessionActions(session);
 if(!legal.length)throw Error("No legal policy action at "+session.phase);
 const progress=legal.find(a=>a.kind==="continue");
 // At the cap the study policy ALWAYS takes the real Continue action.
 // MCTS cannot influence this result, and searchDecision does not mutate
 // the session or advance its dice. Avoiding that discarded full-expedition
 // search preserves the exact chosen action and future chance sequence.
 if(progress&&safePhases.has(session.phase)&&
  policy.consecutiveEquipment>=MAX_CONSECUTIVE_EQUIPMENT_ACTIONS){
  policy.cycleBreaks++;
  policy.consecutiveEquipment=0;
  return progress;
 }
 // For any decision that can affect play, search the complete legal
 // action list, with the same budget and chance seed as before.
 const recommended=legal.length===1?legal[0]:searchDecision(session,{
  budget:Math.max(budget,legal.length),seed,
  maxSteps:maxSearchSteps,knowledge,strictTerminal:true,observedReplay,
  collectCoverage:false
 }).recommended;
 if(!recommended)throw Error("MCTS returned no legal recommendation");
 if(safePhases.has(session.phase)&&equipmentKinds.has(recommended.kind)){
  policy.consecutiveEquipment++;
  policy.equipmentActions++;
 }else{
  policy.consecutiveEquipment=0;
 }
 return recommended;
}
