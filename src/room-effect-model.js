/** Reviewed, executable Room choice and outcome instructions. Each id maps
 * to exactly the two printed choices and each printed d6 band. No guessing.
 * Conditions marked "IF..." are handled by the expedition's policy/context. */
import {ROOMS,VAULT} from "./tabletop-data.js";
import {PRINT_ONLY_ROOMS} from "./print-expansion.js";
const C=(first,second,outcomes)=>({choices:[first,second],outcomes});
export const ROOM_EFFECTS=Object.freeze({
 "ex-u-guard-cell":C(["ROLL_ROOM"],["NONE"],[["MONSTER_DRAW"],["DRAW:1"],["DRAW:2"]]),
 "ex-u-slick-passage":C(["ROLL_ROOM"],["HURT:1"],[["HURT:2"],["NONE"],["DRAW:1"]]),
 "ex-u-coal-store":C(["ROLL_ROOM"],["COST:1","HEAL:3"],[["HURT:2"],["DRAW:1"],["DRAW:2"]]),
 "ex-u-cracked-hall":C(["PEEK:1"],["ROLL_ROOM"],[["HURT:1","MONSTER_DRAW"],["NONE"],["DRAW:1"]]),
 "ex-u-spoiled-pantry":C(["ROLL_ROOM"],["NONE"],[["POISON"],["DRAW:1"],["DRAW:2"]]),
 "ex-m-prison-block":C(["ROLL_ROOM"],["HURT:1","DRAW:1"],[["MONSTER_DRAW"],["DRAW:1"],["DRAW:2"]]),
 "ex-m-slanted-causeway":C(["ROLL_ROOM"],["HURT:2","DRAW:1"],[["HURT:d6"],["NONE"],["DRAW:1"]]),
 "ex-m-old-barracks":C(["ROLL_ROOM"],["COST:1","HEAL:4"],[["MONSTER_DRAW"],["DRAW:1"],["DRAW:2"]]),
 "ex-m-footbridge":C(["ROLL_ROOM"],["HURT:1"],[["HURT:d6"],["NONE"],["DRAW:1"]]),
 "ex-m-drain-tunnel":C(["ROLL_ROOM"],["PEEK:2"],[["POISON","MONSTER_DRAW"],["NONE"],["DRAW:1"]]),
 "ex-d-flooded-cell":C(["ROLL_ROOM"],["HURT:2","DRAW:1"],[["MONSTER_DRAW"],["DRAW:1"],["DRAW:2"]]),
 "ex-d-ash-corridor":C(["ROLL_ROOM"],["HURT:1"],[["HURT:1","MONSTER_DRAW"],["NONE"],["HEAL:2"]]),
 "ex-d-cracked-coffer":C(["ROLL_ROOM"],["HURT:2","DRAW:1"],[["HURT:d6"],["DRAW:1"],["DRAW:2"]]),
 "ex-d-iron-stairs":C(["ROLL_ROOM"],["HURT:1","PEEK:1"],[["HURT:3"],["NONE"],["DRAW:1"]]),
 "ex-d-watchpost":C(["ROLL_ROOM"],["HEAL:2"],[["MONSTER_DRAW"],["DRAW:1"],["DRAW:2"]]),

 "u-passage":C(["ROLL_ROOM"],["PASSAGE_PRY"],[["MONSTER_DRAW"],["PEEK:1"],["DRAW:1"],["DRAW:1","PEEK:1"]]),
 "u-gate":C(["ROLL_ROOM"],["CHECK_ATK:3:DRAW1:HURT2_DEF_DIS"],[
 ["HURT:d6"],["DRAW:1"],["DRAW:2"]]),
 "u-supply":C(["ROLL_ROOM"],["SUPPLY_BARTER"],[
 ["DISCARD_OR_HURT:1:2"],["SALVAGE"],["DRAW:2","DISCARD:1"]]),
 "u-nest":C(["ROLL_ROOM"],["CHECK_ATK:3:DRAW1:HURTd6"],[
 ["HURT:2","NEXT_WIT_DIS"],["NONE"],["DRAW:1"]]),
 "u-shrine":C(["ROLL_ROOM"],["COST:1","HEAL:d6","CURSED_RECHARGE"],[
 ["HURT:d6"],["HEAL:d6"],["CLEANSE","HEAL:2"]]),
 "u-fall":C(["ROLL_ROOM"],["HURT:1","PEEK:1"],[
 ["TRAPDOOR:MIDDLE:d6:MONSTER"],["TRAPDOOR:MIDDLE:2"],["TRAPDOOR:MIDDLE:0:DRAW2"]]),
 "u-fountain":C(["ROLL_ROOM_RISK"],["COST:1","ALCHEMY_HEAL_OR_TWO"],[
 ["HURT:2"],["HEAL:d6"],["HEAL:d6","DRAW:1"]]),
 "u-merchant":C(["ROLL_ROOM"],["COST:2","DRAW:3"],[
 ["DISCARD:1"],["TRADE:1:2"],["DRAW:1"],["DRAW:2"]]),
 "u-lamp":C(["ROLL_ROOM"],["HURT:1","PEEK:1"],[
 ["LAMP_EAT"],["NONE"],["DRAW:1"]]),
 "u-puppet":C(["ROLL_ROOM"],["COST:1","KEEP_ROOM"],[["DISCARD_OR_HURT:1:d6"],["PEEK:1"],["SALVAGE"],["DRAW:2"]]),
 "u-bookcase":C(["ROLL_ROOM"],["BOOKCASE_FIRE_OR_SCROLL"],[["HURT:d6"],["PEEK:1"],["DRAW:1"],["DRAW:1","PEEK:1"]]),
 "u-mimic":C(["ROLL_ROOM"],["PEEK:1"],[
 ["HURT:d6","MIMIC_TUCK"],["DRAW:1"],["DRAW:2"]]),

 "m-flood":C(["ROLL_ROOM"],["HURT:2","PEEK:1"],[["MONSTER_DRAW","NEXT_DIS"],["DRAW:1"],["DRAW:2"]]),
 "m-statue":C(["COST:1","ROLL_ROOM"],["PEEK:2"],[["HURT:2","NEXT_WIT_DIS"],["HEAL:d6"],["DRAW:2","DISCARD:1"]]),
 "m-vault":C(["ROLL_ROOM"],["HURT:d6","DRAW:1"],[
 ["POISON"],["DRAW:1"],["DRAW:2"]]),
 "m-crypt":C(["ROLL_ROOM"],["CHECK_ATK:4:DRAW2:HURTd6"],[
 ["HURT:2","NEXT_WIT_DIS"],["NONE"],["DRAW:1"]]),
 "m-fungus":C(["ROLL_ROOM"],["FUNGUS_BURN"],[
 ["POISON","MONSTER_DRAW"],["HEAL:d6"],["DRAW:1","CURE"]]),
 "m-altar":C(["ROLL_ROOM"],["COST:1","CLEANSE"],[["HURT:2"],["HEAL:d6"],["CURE","DRAW:1"]]),
 "m-bridge":C(["ROLL_ROOM"],["CHECK_WIT:4:HEAL2:HURTd6"],[
 ["HURT:d6","DISCARD:1"],["NONE"],["DRAW:2"]]),
 "m-well":C(["COST:1","ROLL_ROOM_COST_REROLL"],["PEEK:1"],[
 ["MONSTER_DRAW"],["HEAL:d6"],["DRAW:2"],["DRAW:3"]]),
 "m-auction":C(["PAY_ITEM_OR_HP:1:2","ROLL_ROOM"],["COST:2","DOUBLE_BID"],[["PAY_ITEM_OR_HP:1:2"],["DRAW:2"],["DRAW:3"]]),
 "m-clock":C(["ROLL_ROOM"],["CHECK_ATK:5:DRAW1_RECHARGE:HURTd6"],[
 ["HURT:d6"],["HEAL:d6"],["DRAW:1"],["NEXT_WIT:2"]]),
 "m-beetle":C(["ROLL_ROOM"],["MONSTER_DRAW","FIGHT_REWARD:2"],[
 ["HURT:2"],["TRADE:1:2"],["DRAW:1"],["DRAW:2"]]),
 "m-treasure":C(["ROLL_ROOM_RISK"],["COST:1","KEEP_ROOM"],[
 ["MONSTER_DRAW"],["DRAW:1"],["DRAW:3","DISCARD:1"]]),

 "d-shadow":C(["ROLL_ROOM"],["HURT:1","PEEK:2"],[["MONSTER_DRAW","NEXT_DIS"],["DRAW:1"],["DRAW:2"]]),
 "d-bridge":C(["ROLL_ROOM"],["HURT:d6","DRAW:1"],[
 ["TRAPDOOR:FINAL:2d6"],["HURT:d6"],["DRAW:1"]]),
 "d-reliquary":C(["ROLL_ROOM"],["RELIQUARY_OFFER"],[
 ["HURT:d6","DRAW:1"],["DRAW:2"],["DRAW:2","KEEP_ROOM"]]),
 "d-bones":C(["ROLL_ROOM"],["MONSTER_DRAW","FIGHT_REWARD:3"],[["HURT:d6","NEXT_DIS"],["DRAW:1"],["DRAW:2"]]),
 "d-oracle":C(["ORACLE_PROPHECY"],["PEEK:1"],[]),
 "d-gate":C(["ROLL_ROOM"],["FIGHT_REWARD:2","FIGHT_HEAL:d6"],[
 ["FIGHT"],["BANISH"],["BANISH","DRAW:1","CURSED_EXTRA_DRAW"]]),
 "d-mirror":C(["ROLL_ROOM"],["HURT:2","REVERSE_NEXT_ROOM"],[
 ["DISCARD_OR_HURT:1:3"],["PEEK_SWAP:2"],["KEEP_ROOM"]]),
 "d-mouth":C(["ROLL_ROOM"],["CHECK_WIT:6:DRAW2:HURTd6"],[["MONSTER_DRAW"],["PAY_ITEM_OR_HP:1:2"],["PEEK:2"],["DRAW:2"]]),
 "d-choir":C(["ROLL_ROOM"],["CHOIR_SILENCE"],[
 ["POISON","NEXT_WIT_DIS"],["PEEK:1"],["DRAW:1","CURE"]]),
 "d-bazaar":C(["PAY_ITEM_OR_HP:1:2","ROLL_ROOM"],["COST:2","DRAW:2","RECHARGE"],[
 ["MONSTER_DRAW"],["DRAW:2"],["DRAW:3","DISCARD:1"],["DRAW:3","SAVE_D20_REROLL"]]),
 "d-crown":C(["ROLL_ROOM"],["COST_CURSED:1","DRAW:2"],[
 ["HURT:d6","FORCE_BEHAVIOR:6"],["FORCE_BEHAVIOR:1"],["KEEP_CROWN:5"],["KEEP_CROWN:6"]]),
 "d-last-chest":C(["ROLL_ROOM_RISK_D6"],["COST:1","HEAL:d6"],[
 ["MONSTER_DRAW"],["DRAW:2"],["DRAW:2","KEEP_ROOM"]]),
 "vault":C(["WARDEN_FIGHT"],["SEAL"],[
 ["MONSTER_ADV"],["NONE"],["NEXT_ADV"]]),
 ...Object.fromEntries(ROOMS.filter(r=>r.v2.special).map(r=>[r.id,
  C(["ROOM_SPECIAL:0"],["ROOM_SPECIAL:1"],r.v2.special.rollOps)])),
 ...Object.fromEntries(ROOMS.filter(r=>r.v2.fate).map(r=>[r.id,
 C(["ROOM_FATE:0"],["ROOM_FATE:1"],[])]))
});
export const ROOM_OPERATIONS=new Set([
 "NONE","DISCARD_OR_HURT","MIMIC_TUCK","RELIQUARY_OFFER","REVERSE_NEXT_ROOM","COST_CURSED","KEEP_CROWN","FORCE_BEHAVIOR","ROLL_ROOM","ROLL_ROOM_RISK","ROLL_ROOM_RISK_D6","ROLL_ROOM_COST_REROLL",
 "HURT","HEAL","HEAL_ALL","DRAW","DISCARD","SALVAGE","ORACLE_PROPHECY","LAMP_EAT","CRYPT_WHISPER","KEEP_ROOM","DOUBLE_BID","PASSAGE_PRY","TRADE","COST","PAY_ITEM_OR_HP","PEEK","PEEK_SWAP","MONSTER_DRAW","MONSTER_ADV",
 "FIGHT","BANISH","FIGHT_REWARD","FIGHT_HEAL","SKIP","MONSTER_DIS","POISON","CURE","CLEANSE","RECHARGE",
 "CURSED_RECHARGE","SUPPLY_BARTER","PUPPET_BRIBE","BOOKCASE_FIRE_OR_SCROLL","FUNGUS_BURN",
 "CHOIR_SILENCE","ALCHEMY_HEAL_OR_TWO","MAGIC_HEAL","CURSED_EXTRA_DRAW","CLEANSE_COST",
 "NEXT_ADV","NEXT_DIS","NEXT_WIT","NEXT_WIT_DIS",
 "FORK_REVEAL","FORK_ORDER","CURE_OR_HEAL","HUNGRY_SWALLOW",
 "BELL_SAVE","PUSH_UNSEEN_ROOM","SAVE_TRAP","SAVE_ATTACK_ADV","SAVE_D20_REROLL",
 "SAVE_DEF","CHECK_ATK","CHECK_WIT","SEAL","WARDEN_FIGHT","ROOM_SPECIAL","ROOM_FATE","TRAPDOOR","CURSED_DETOUR"
]);
export function verifyRoomCoverage(){
 const cards=[...ROOMS,...PRINT_ONLY_ROOMS,VAULT],existing=new Set(cards.map(r=>r.id));
 for(const card of cards){
  const data=ROOM_EFFECTS[card.id];
  if(!data||data.choices.length!==card.v2.choices.length||
    data.outcomes.length!==(card.v2.roll?.outcomes.length||0))
   throw new Error("Unimplemented printed Room "+card.id);
  for(const row of [...data.choices,...data.outcomes])for(const op of row)
   if(!ROOM_OPERATIONS.has(op.split(":")[0]))throw new Error("Unknown Room instruction "+card.id+" "+op);
 }
 for(const id of Object.keys(ROOM_EFFECTS))if(!existing.has(id))throw new Error("Orphaned Room "+id);
 return {rooms:cards.length,choices:cards.reduce((n,c)=>n+c.v2.choices.length,0),
  rollBands:cards.reduce((n,c)=>n+(c.v2.roll?.outcomes.length||0),0)};
}
verifyRoomCoverage();
