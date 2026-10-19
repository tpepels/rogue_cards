/**
 * Physical healing alternatives to the diagnostic +5 HP after each won fight.
 *
 * These are STAGING-ONLY printable proposals, not additional universal rules.
 * Existing DEFEAT/REST/consumable healing is strengthened using existing HEAL
 * and COST opcodes; no automatic postCombatHeal is allowed in a printable arm.
 */
import {compileStaging} from "./catalogue.js";
import {BALANCED_HEAL_ROOM_DECK} from "./combat-healing-hypotheses.js";

const cards=(bandages,rations,tonics)=>[
 {collection:"items",id:"ex-bandages",set:{copies:bandages}},
 {collection:"items",id:"ex-rations",set:{copies:rations}},
 {collection:"items",id:"odd-thorn-tonic",set:{copies:tonics}}
];

// Only Monsters that currently give no direct healing are augmented.
// Their existing printed DEFEAT benefit (draw/peek/salvage/buff) remains.
const light={
 "goblin":2,"crawler":2,"dust-skeleton":2,
 "troll":2,"bell-beetle":2,"glass-revenant":2
};
const medium={
 ...light,"bat":2,"wisp":2,"ropebound-hound":2,
 "drowned-jailer":2,"bone-cantor":2,"cultist":2
};
const combat={
 ...medium,"eye":3,"rust":3,"sentinel":3,
 "keyhole-mimic":3,"vault-parasite":3,"wraith":3
};
const proposed=[
 {
  id:"printed-recovery-light",
  description:"More healing supplies, modest paid REST and six printed monster-specific DEFEAT heals.",
  cards:cards(5,4,3),
  roomRestHealing:{"ex-u-coal-store":5,"ex-m-old-barracks":5,
   "ex-d-watchpost":3},
  monsterHealing:light
 },
 {
  id:"printed-recovery-supplies",
  description:"Item and paid-REST focused recovery with twelve modest printed monster rewards.",
  cards:cards(9,6,5),
  roomRestHealing:{"ex-u-coal-store":6,"ex-m-old-barracks":7,
   "ex-d-watchpost":5},
  monsterHealing:medium
 },
 {
  id:"printed-recovery-combat",
  description:"More monster-specific printed rewards with smaller consumable growth and paid REST.",
  cards:cards(6,5,3),
  roomRestHealing:{"ex-u-coal-store":5,"ex-m-old-barracks":6,
   "ex-d-watchpost":4},
  monsterHealing:combat
 }
];
export const PRINTED_RECOVERY_IDS=Object.freeze(proposed.map(x=>x.id));
export const PRINTED_RECOVERY_REFERENCE_ID="balanced-combat-heal-5";
export function printedRecoveryHypotheses(){
 const specs=proposed.map(x=>({
  schema:"rogue-cards-staging-v1",id:x.id,description:x.description,
  roomDeck:BALANCED_HEAL_ROOM_DECK,cards:x.cards,
  roomRestHealing:x.roomRestHealing,monsterHealing:x.monsterHealing
 }));
 // Diagnosis/control arm only: this is NEVER considered a physical proposal.
 specs.push({
  schema:"rogue-cards-staging-v1",
  id:PRINTED_RECOVERY_REFERENCE_ID,
  description:"NON-PRINTABLE numerical reference: automatic +5 HP on each won regional combat.",
  roomDeck:BALANCED_HEAL_ROOM_DECK,mechanics:{postCombatHeal:5}
 });
 for(const spec of specs)compileStaging(spec);
 return Object.freeze(specs);
}
