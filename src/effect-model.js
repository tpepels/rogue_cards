/**
 * Phase 5: executable, explicit d6 card outcomes.
 * Cards remain the source of player-facing wording; this file is a reviewable
 * mechanical transcription, NOT a natural-language regex guessing engine.
 * Outcomes are in the precise printed order, one operation list per dice band.
 * A context dispatches each operation and must reject unknown operation names.
 */
import {OBJECTS} from "./tabletop-data.js";
const O=(...bands)=>bands;
export const ROLL_EFFECTS=Object.freeze({
 "crowbar":O(["HURT:2"],["DRAW:1"],["DRAW:2"]),
 "chalk":O(["HURT:1"],["PEEK:1"],["PEEK_SWAP:2"]),
 "spore-jar":O(["POISON"],["SKIP:1"],["SKIP:2"]),
 "coin":O(["NONE"],["DRAW:1"],["DRAW:2"]),
 "needle":O(["HURT:2"],["CURE"],["HEAL:d6","CURE"]),
 "sword":O(["HURT:1","SWORD_FIRE"],["NEXT_DAMAGE:2"],["NEXT_DAMAGE:d6"]),
 "shield":O(["NONE"],["BLOCK:2"],["BLOCK:ALL"]),
 "dog":O(["NONE"],["NEXT_DAMAGE:2"],["NEXT_DAMAGE:d6"]),
 "raven":O(["HURT:1"],["PEEK:1"],["PEEK_SWAP:2"]),
 "moth":O(["HURT:1"],["CURE"],["CURE","HEAL:d6"]),
 "goblin-pet":O(["DISCARD:1"],["TRADE:1:2"],["DRAW:1"]),
 "mirror":O(["VULNERABLE:2"],["DEF_ADV"],["REFLECT:2"]),
 "skull":O(["HURT:2"],["PEEK:1"],["PEEK_SWAP:2"]),
 "scroll-flame":O(["HURT:d6","FORCE_BEHAVIOR:6"],["DAMAGE:d6+2","ELEMENT:FIRE"],["DAMAGE:2d6","ELEMENT:FIRE","SKIP:1"]),
 "scroll-frost":O(["FORCE_BEHAVIOR:6"],["SKIP:1","ELEMENT:ICE"],["SKIP:2","ELEMENT:ICE"]),
 "scroll-lightning":O(["HURT:d6"],["DAMAGE:d6+3","ELEMENT:LIGHTNING"],["DAMAGE:2d6","ELEMENT:LIGHTNING"],["DAMAGE:3d6","ELEMENT:LIGHTNING"]),
 "scroll-unlock":O(["HURT:d6","MONSTER_DRAW"],["ROOM_OUTCOME:3"],["ROOM_OUTCOME:5"]),
 "scroll-reveal":O(["HURT:d6","NEXT_DIS"],["PEEK:2"],["PEEK_SWAP:2","DRAW:1"]),
 "scroll-banish":O(["FORCE_BEHAVIOR:6"],["SKIP:1"],["BANISH_OR_SKIP:2"]),
 "scroll-mischief":O(["MONSTER_DRAW_OR_FORCE:6"],["HEAL:d6","DRAW:1"],["CHOOSE_BEHAVIOR"],["DRAW:3","DISCARD:1"]),
 "scroll-last":O(["HURT:d6"],["DAMAGE:2d6"],["DAMAGE:3d6","HEAL:d6"]),
 "ring-luck":O(["D20_MOD:-2"],["D20_MOD:2"],["D20_REROLL:HIGH"]),
 "ring-bargain":O(["DISCARD:1"],["DRAW:1"],["TRADE:1:3","GOBLIN_EXTRA"]),
 "ring-eye":O(["HURT:1"],["PEEK:1"],["PEEK_SWAP:2"]),
 "ring-spores":O(["HURT:2"],["CURE"],["CURE","HEAL:d6"]),
 "ring-hunger":O(["HURT:d6","NEXT_DIS"],["HURT:1","NEXT_DAMAGE:2"],["NEXT_DAMAGE:d6"]),
 "ring-ashes":O(["HURT:2","FORCE_BEHAVIOR:6"],["NEXT_DAMAGE:2"],["NEXT_DAMAGE:d6"]),
 "ring-echo":O(["HURT:1","KEEP_ROOM_ROLL"],["REROLL_ROOM:NEW"],["REROLL_ROOM:BEST"]),
 "wand-sparks":O(["HURT:1"],["DAMAGE:d6","ELEMENT:FIRE"],["DAMAGE:2d6","ELEMENT:FIRE"]),
 "wand-undo":O(["HURT:1"],["D20_REROLL:NEW"],["D20_REROLL:HIGH"]),
 "wand-morph":O(["HURT:2"],["REWRITE_BEHAVIOR:6:1"],["SKIP:1","DRAW:1"]),
 "wand-turn":O(["HURT:1"],["SKIP:1"],["SKIP:2"]),
 "wand-market":O(["DISCARD:1"],["TRADE:1:2"],["DRAW:1"],["DRAW:2"]),
 "wand-frost":O(["HURT:2"],["SKIP:1","ELEMENT:ICE"],["SKIP:1","HEAL:2","ELEMENT:ICE"]),
 "wand-door":O(["HURT:d6"],["ROOM_OUTCOME:3"],["ROOM_OUTCOME:5"]),
 "smoky":O(["HURT:d6"],["HEAL:d6"],["NEXT_ADV"]),
 "milky":O(["POISON"],["CURE"],["HEAL:2d6"]),
 "amber":O(["HURT:d6"],["NEXT_ATK:2"],["NEXT_ADV"]),
 "fizzy":O(["MONSTER_DRAW"],["HEAL:d6"],["DRAW:1"],["DRAW:2"]),
 "mushroom":O(["POISON"],["CURE","HEAL:2"],["HEAL:d6","POISON_IMMUNE"]),
 "midnight":O(["HURT:2"],["SKIP:1"],["PEEK_SWAP:2"]),
 "antidote":O(["HURT:1"],["CURE"],["CURE","HEAL:d6"]),
 "laughing":O(["HURT:d6"],["HEAL:d6"],["HEAL:d6","DRAW:1"])
});
export const NON_ROLL_EFFECTS=Object.freeze({
 key:"LOCK_OVERRIDE",rope:"ROOM_ROPE",torch:"ROOM_FIRE_OR_SKIP",
 staff:"WEAPON_BASIC_HIT", "cursed-blade":"CURSED_WEAPON",
 mail:"ARMOUR_WIT_DIS", "cursed-mail":"CURSED_ARMOUR",
 "lantern-heart":"ROOM_FIRE_OR_RECHARGE","crown-relic":"SACRIFICE_CRITICAL"
});
export const ALLOWED_OPERATIONS=new Set([
 "NONE","HURT","HEAL","POISON","CURE","POISON_IMMUNE","DRAW","DISCARD","TRADE",
 "PEEK","PEEK_SWAP","MONSTER_DIS","SKIP","MONSTER_DRAW","MONSTER_DRAW_OR_FORCE",
 "DAMAGE","ELEMENT","FORCE_BEHAVIOR","REWRITE_BEHAVIOR","SWORD_FIRE",
 "NEXT_DAMAGE","NEXT_ATK","NEXT_ADV","NEXT_DIS","DEF_ADV","BLOCK","REFLECT",
 "VULNERABLE","D20_MOD","D20_REROLL","BANISH_OR_SKIP","CHOOSE_BEHAVIOR",
 "ROOM_OUTCOME","REROLL_ROOM","KEEP_ROOM_ROLL","GOBLIN_EXTRA","BREAK_WAND"
]);
export const bandFor=(card,roll)=>{
 const out=card.v2.roll?.outcomes;
 if(!out)throw new Error("No d6 outcome on "+card.id);
 if(!Number.isInteger(roll)||roll<1||roll>6)throw new RangeError("Invalid d6 value");
 const index=out.findIndex(({range})=>{
  const [lo,hi=lo]=range.split("–").map(Number);
  return roll>=lo&&roll<=hi;
 });
 if(index<0)throw new Error("Uncovered d6 "+roll+" for "+card.id);
 return index;
};
export function verifyObjectCoverage(){
 const byId=new Map(OBJECTS.map(c=>[c.id,c]));
 for(const c of OBJECTS){
  const rows=ROLL_EFFECTS[c.id];
  if(c.v2.roll){
   if(!rows||rows.length!==c.v2.roll.outcomes.length)throw new Error("Missing printed roll transcription: "+c.id);
   for(const band of rows)for(const op of band){
    const key=op.split(":")[0];
    if(!ALLOWED_OPERATIONS.has(key))throw new Error("Unimplemented operation "+op+" on "+c.id);
   }
  } else if(!NON_ROLL_EFFECTS[c.id])throw new Error("Missing non-roll ability: "+c.id);
 }
 for(const id of [...Object.keys(ROLL_EFFECTS),...Object.keys(NON_ROLL_EFFECTS)])
  if(!byId.has(id))throw new Error("Nonexistent Object handler: "+id);
 return {objects:OBJECTS.length,rollCards:Object.keys(ROLL_EFFECTS).length,
  nonRollCards:Object.keys(NON_ROLL_EFFECTS).length,
  outcomeBands:Object.values(ROLL_EFFECTS).reduce((n,a)=>n+a.length,0)};
}
export function applyCardRoll(context,card,roll){
 const index=bandFor(card,roll),ops=ROLL_EFFECTS[card.id]?.[index];
 if(!ops)throw new Error("Missing handler for "+card.id);
 for(const raw of ops){
  const [name,...args]=raw.split(":");
  if(!ALLOWED_OPERATIONS.has(name))throw new Error("Unknown mechanic "+raw);
  context.apply(name,args,card);
 }
 return {index,range:card.v2.roll.outcomes[index].range,effect:card.v2.roll.outcomes[index].effect};
}
verifyObjectCoverage();
