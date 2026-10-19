/**
 * Numerical post-combat healing dose response on the canonical Balanced B
 * Room distribution. Zero healing is the canonical control; all other doses
 * are staging-only and will never appear on printed cards.
 */
import {BALANCED_ROOM_IDS,BALANCED_ROOMS} from "../room-balance.js";
import {compileStaging} from "./catalogue.js";
const STAGES=["UPPER","MIDDLE","DEEP"];
export const POST_COMBAT_HEAL_DOSES=Object.freeze([1,2,3,4,5,6,7,8,10]);
export const BALANCED_HEAL_ROOM_DECK=Object.freeze(
 Object.fromEntries(STAGES.map(stage=>[stage,Object.freeze({
  selection:Object.freeze(BALANCED_ROOM_IDS.filter(id=>
   BALANCED_ROOMS.find(r=>r.id===id)?.stage===stage))
 })]))
);
export function postCombatHealingHypotheses(){
 const specs=POST_COMBAT_HEAL_DOSES.map(amount=>({
  schema:"rogue-cards-staging-v1",
  id:"balanced-combat-heal-"+amount,
  description:"Balanced B physical Room composition; after each won "+
   "regional Monster fight heal the living Hero +"+amount+
   " HP up to maximum. No grant after parley, retreat, banishment "+
   "or Warden. Item/Room mechanics unchanged.",
  roomDeck:BALANCED_HEAL_ROOM_DECK,
  mechanics:{postCombatHeal:amount}
 }));
 for(const spec of specs)compileStaging(spec);
 return Object.freeze(specs);
}
