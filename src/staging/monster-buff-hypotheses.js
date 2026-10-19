/**
 * Phase A: measure buffs to the CURRENT printed Monster cards, before any
 * Room/Corridor/encounter frequency change. Existing physical rules only.
 * Staging never changes original cards, Hero stats, Warden or rewards.
 *
 * Every arm uses the identical physical Balanced B Room selection.
 * Diagnostic +5 post-fight healing is deliberately NOT enabled here: these
 * curves measure current printable Monster strength, not a hidden rule.
 */
import {canonicalStagingCatalogue,compileStaging} from "./catalogue.js";
import {BALANCED_HEAL_ROOM_DECK} from "./combat-healing-hypotheses.js";

const original=canonicalStagingCatalogue().monsters;
const STAGES=["UPPER","MIDDLE","DEEP"];
const arms=[
 ["monster-buff-hp1","ALL",{hp:1}],
 ["monster-buff-hp2","ALL",{hp:2}],
 ["monster-buff-atk1","ALL",{atk:1}],
 ["monster-buff-def1","ALL",{def:1}],
 ["monster-buff-hp1-atk1","ALL",{hp:1,atk:1}],
 ["monster-buff-hp1-def1","ALL",{hp:1,def:1}],
 ["monster-buff-upper-hp1","UPPER",{hp:1}],
 ["monster-buff-upper-atk1","UPPER",{atk:1}],
 ["monster-buff-middle-hp1","MIDDLE",{hp:1}],
 ["monster-buff-middle-atk1","MIDDLE",{atk:1}],
 ["monster-buff-deep-hp1","DEEP",{hp:1}],
 ["monster-buff-deep-atk1","DEEP",{atk:1}]
];
export const MONSTER_BUFF_ARMS=Object.freeze(arms.map(([id,stage,deltas])=>
 Object.freeze({id,stage,deltas:Object.freeze(deltas)})));

export function monsterBuffHypotheses(){
 const specs=MONSTER_BUFF_ARMS.map(({id,stage,deltas})=>{
  const cards=original.filter(m=>stage==="ALL"||m.stage===stage)
   .map(m=>({
    collection:"monsters",id:m.id,
    set:Object.fromEntries(Object.entries(deltas)
     .map(([stat,delta])=>[stat,m[stat]+delta]))
   }));
  return Object.freeze({
   schema:"rogue-cards-staging-v1",id,
   description:"Printed Monster stats "+JSON.stringify(deltas)+
    " on "+stage+" only; same Balanced B Rooms, encounters, behavior, "+
    "Items, rewards and Warden; zero post-combat auto-healing.",
   roomDeck:BALANCED_HEAL_ROOM_DECK,
   cards
  });
 });
 for(const spec of specs)compileStaging(spec);
 return Object.freeze(specs);
}
