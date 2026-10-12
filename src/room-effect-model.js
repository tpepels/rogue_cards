/** Reviewed, executable Room choice and outcome instructions. Each id maps
 * to exactly the two printed choices and each printed d6 band. No guessing.
 * Conditions marked "IF..." are handled by the expedition's policy/context. */
import {ROOMS,VAULT} from "./tabletop-data.js";
const C=(first,second,outcomes)=>({choices:[first,second],outcomes});
export const ROOM_EFFECTS=Object.freeze({
 "u-passage":C(["ROLL_ROOM"],["HURT:2","DRAW:1"],[
 ["MONSTER_DRAW"],["PEEK:1"],["DRAW:1"],["DRAW:1","PEEK:1"]]),
 "u-gate":C(["ROLL_ROOM"],["CHECK_ATK:3:DRAW1:HURT2"],[
 ["HURT:d6"],["DRAW:1"],["DRAW:2"]]),
 "u-supply":C(["ROLL_ROOM"],["COST:1","DRAW:2"],[
 ["MONSTER_DRAW"],["DRAW:1"],["DRAW:2","DISCARD:1"]]),
 "u-nest":C(["ROLL_ROOM"],["FIGHT_REWARD:1"],[
 ["FIGHT"],["BANISH"],["BANISH","DRAW:1"]]),
 "u-shrine":C(["ROLL_ROOM"],["COST:1","HEAL:d6","CURSED_RECHARGE"],[
 ["HURT:d6"],["HEAL:d6"],["CLEANSE","HEAL:2"]]),
 "u-fall":C(["ROLL_ROOM"],["HURT:1","PEEK:1"],[
 ["HURT:d6"],["HURT:2"],["DRAW:1"]]),
 "u-fountain":C(["ROLL_ROOM_RISK"],["COST:1","HEAL:2","ALCHEMY_HEAL"],[
 ["HURT:2"],["HEAL:d6"],["HEAL:d6","DRAW:1"]]),
 "u-merchant":C(["ROLL_ROOM"],["COST:2","DRAW:3"],[
 ["DISCARD:1"],["TRADE:1:2"],["DRAW:1"],["DRAW:2"]]),
 "u-lamp":C(["ROLL_ROOM"],["HURT:1","BANISH"],[
 ["MONSTER_DRAW"],["HEAL:2"],["DRAW:1"]]),
 "u-puppet":C(["ROLL_ROOM"],["PUPPET_BRIBE"],[
 ["HURT:d6"],["HEAL:2"],["DRAW:1"],["DRAW:2"]]),
 "u-bookcase":C(["ROLL_ROOM"],["BOOKCASE_FIRE_OR_SCROLL"],[
 ["HURT:d6"],["PEEK:1"],["DRAW:1"],["DRAW:1","HEAL:2"]]),
 "u-mimic":C(["ROLL_ROOM"],["HEAL:1"],[
 ["MONSTER_DRAW"],["DRAW:1"],["DRAW:2"]]),

 "m-flood":C(["ROLL_ROOM"],["HURT:2","PEEK:1"],[
 ["MONSTER_DRAW","NEXT_DIS"],["DRAW:1"],["DRAW:1","HEAL:2"],["DRAW:2"]]),
 "m-statue":C(["COST:1","ROLL_ROOM"],["HEAL:2"],[
 ["HURT:2"],["HEAL:d6"],["DRAW:2","DISCARD:1"]]),
 "m-vault":C(["ROLL_ROOM"],["HURT:d6","DRAW:1"],[
 ["POISON"],["DRAW:1"],["DRAW:2"]]),
 "m-crypt":C(["ROLL_ROOM"],["FIGHT_REWARD:2"],[
 ["FIGHT"],["BANISH"],["BANISH","DRAW:1"]]),
 "m-fungus":C(["ROLL_ROOM"],["FUNGUS_BURN"],[
 ["POISON","MONSTER_DRAW"],["HEAL:d6"],["DRAW:1","CURE"]]),
 "m-altar":C(["ROLL_ROOM"],["COST:1","CLEANSE"],[
 ["POISON"],["HEAL:d6"],["CURE","DRAW:1"]]),
 "m-bridge":C(["ROLL_ROOM"],["CHECK_WIT:4:HEAL2:HURTd6"],[
 ["HURT:d6","DISCARD:1"],["NONE"],["DRAW:2"]]),
 "m-well":C(["COST:1","ROLL_ROOM_COST_REROLL"],["PEEK:1"],[
 ["MONSTER_DRAW"],["HEAL:d6"],["DRAW:2"],["DRAW:3"]]),
 "m-auction":C(["COST:1","ROLL_ROOM"],["MONSTER_DRAW","FIGHT_REWARD:2"],[
 ["POISON"],["DRAW:2"],["DRAW:3"]]),
 "m-clock":C(["ROLL_ROOM"],["CHECK_ATK:5:DRAW1_RECHARGE:HURTd6"],[
 ["HURT:d6"],["HEAL:d6"],["DRAW:1"],["NEXT_WIT:2"]]),
 "m-beetle":C(["ROLL_ROOM"],["MONSTER_DRAW","FIGHT_REWARD:2"],[
 ["HURT:2"],["TRADE:1:2"],["DRAW:1"],["DRAW:2"]]),
 "m-treasure":C(["ROLL_ROOM_RISK"],["COST:1","HEAL:d6"],[
 ["MONSTER_DRAW"],["DRAW:1"],["DRAW:3","DISCARD:1"]]),

 "d-shadow":C(["ROLL_ROOM"],["HURT:2","PEEK:1"],[
 ["MONSTER_DRAW","MONSTER_ADV"],["DRAW:1"],["DRAW:2"]]),
 "d-bridge":C(["ROLL_ROOM"],["HURT:d6","DRAW:1"],[
 ["HURT:2d6"],["HURT:d6"],["DRAW:1"]]),
 "d-reliquary":C(["ROLL_ROOM"],["COST:2","DRAW:3","MAGIC_HEAL:2"],[
 ["HURT:d6","DRAW:1"],["DRAW:2"],["DRAW:3","SAVE_TRAP"]]),
 "d-bones":C(["ROLL_ROOM"],["MONSTER_DRAW","FIGHT_REWARD:2"],[
 ["MONSTER_DRAW"],["DRAW:1"],["DRAW:2","HEAL:2"]]),
 "d-oracle":C(["ROLL_ROOM"],["HEAL:2"],[
 ["HURT:d6"],["PEEK_SWAP:2"],["PEEK:1","DRAW:1"],["PEEK_SWAP:2","DRAW:2"]]),
 "d-gate":C(["ROLL_ROOM"],["FIGHT_REWARD:1","FIGHT_HEAL:d6"],[
 ["FIGHT"],["BANISH"],["BANISH","DRAW:1","CURSED_EXTRA_DRAW"]]),
 "d-mirror":C(["ROLL_ROOM"],["HURT:2","DRAW:1"],[
 ["POISON"],["CURE","HEAL:d6"],["SAVE_ATTACK_ADV"]]),
 "d-mouth":C(["ROLL_ROOM"],["CHECK_WIT:6:DRAW2:HURTd6"],[
 ["MONSTER_DRAW"],["HEAL:d6"],["DRAW:1","HEAL:1"],["DRAW:2"]]),
 "d-choir":C(["ROLL_ROOM"],["CHOIR_SILENCE"],[
 ["POISON","HURT:2"],["HEAL:d6"],["DRAW:2","CURE"]]),
 "d-bazaar":C(["COST:1","ROLL_ROOM"],["COST:2","DRAW:2","RECHARGE"],[
 ["MONSTER_DRAW"],["DRAW:2"],["DRAW:3","DISCARD:1"],["DRAW:3","SAVE_D20_REROLL"]]),
 "d-crown":C(["ROLL_ROOM"],["CLEANSE_COST","DRAW:2","RECHARGE"],[
 ["HURT:d6","POISON"],["CURE"],["HEAL:d6","CURE"],["SAVE_DEF:2"]]),
 "d-last-chest":C(["ROLL_ROOM_RISK_D6"],["COST:1","HEAL:d6"],[
 ["MONSTER_DRAW"],["DRAW:2"],["DRAW:3","HEAL_ALL:2"]]),
 "vault":C(["WARDEN_FIGHT"],["SEAL"],[
 ["MONSTER_ADV"],["NONE"],["NEXT_ADV"]])
});
export const ROOM_OPERATIONS=new Set([
 "NONE","ROLL_ROOM","ROLL_ROOM_RISK","ROLL_ROOM_RISK_D6","ROLL_ROOM_COST_REROLL",
 "HURT","HEAL","HEAL_ALL","DRAW","DISCARD","TRADE","COST","PEEK","PEEK_SWAP","MONSTER_DRAW","MONSTER_ADV",
 "FIGHT","BANISH","FIGHT_REWARD","FIGHT_HEAL","POISON","CURE","CLEANSE","RECHARGE",
 "CURSED_RECHARGE","PUPPET_BRIBE","BOOKCASE_FIRE_OR_SCROLL","FUNGUS_BURN",
 "CHOIR_SILENCE","ALCHEMY_HEAL","MAGIC_HEAL","CURSED_EXTRA_DRAW","CLEANSE_COST",
 "NEXT_ADV","NEXT_DIS","NEXT_WIT","SAVE_TRAP","SAVE_ATTACK_ADV","SAVE_D20_REROLL",
 "SAVE_DEF","CHECK_ATK","CHECK_WIT","SEAL","WARDEN_FIGHT"
]);
export function verifyRoomCoverage(){
 const cards=[...ROOMS,VAULT],existing=new Set(cards.map(r=>r.id));
 for(const card of cards){
  const data=ROOM_EFFECTS[card.id];
  if(!data||data.choices.length!==card.v2.choices.length||
    data.outcomes.length!==card.v2.roll.outcomes.length)
   throw new Error("Unimplemented printed Room "+card.id);
  for(const row of [...data.choices,...data.outcomes])for(const op of row)
   if(!ROOM_OPERATIONS.has(op.split(":")[0]))throw new Error("Unknown Room instruction "+card.id+" "+op);
 }
 for(const id of Object.keys(ROOM_EFFECTS))if(!existing.has(id))throw new Error("Orphaned Room "+id);
 return {rooms:cards.length,choices:cards.reduce((n,c)=>n+c.v2.choices.length,0),
  rollBands:cards.reduce((n,c)=>n+c.v2.roll.outcomes.length,0)};
}
verifyRoomCoverage();
