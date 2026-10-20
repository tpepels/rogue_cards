/**
 * Overnight physical-recovery calibration AFTER the incomplete first study.
 * Each arm independently edits only existing printed healing, Item COPY
 * counts and Monster-specific DEFEAT rewards. No rules or Room distribution
 * change. One deliberately unprintable +5 arm is the numerical benchmark.
 */
import {canonicalStagingCatalogue,compileStaging} from "./catalogue.js";
import {BALANCED_HEAL_ROOM_DECK} from "./combat-healing-hypotheses.js";
import {BALANCED_RECOVERY_V1_MONSTER_IDS} from "../monster-defeats.js";

const monsters=canonicalStagingCatalogue().monsters;
// This is a historical study definition: compare the same original 19
// Monsters, even after those cards gain official printed healing in v1.
const nonHealing=monsters.filter(m=>
 BALANCED_RECOVERY_V1_MONSTER_IDS.includes(m.id));
const selected=stages=>nonHealing.filter(m=>stages.includes(m.stage)).map(m=>m.id);
const monstersFor={
 upper:selected(["UPPER"]),middle:selected(["MIDDLE"]),
 deep:selected(["DEEP"]),early:selected(["UPPER","MIDDLE"]),
 all:selected(["UPPER","MIDDLE","DEEP"])
};
const supply={
 modest:[5,4,3],
 medium:[9,6,5],
 heavy:[14,9,7],
 extreme:[20,12,10]
};
const rest={
 modest:[5,6,4],
 medium:[7,8,6],
 heavy:[9,10,8],
 extreme:[10,10,10]
};
const itemStrength={
 mild:{"ex-bandages":4,"ex-rations":3,"odd-thorn-tonic":4},
 strong:{"ex-bandages":6,"ex-rations":4,"odd-thorn-tonic":5},
 high:{"ex-bandages":8,"ex-rations":6,"odd-thorn-tonic":7},
 diceplus:{"ex-bandages":"d6+2","ex-rations":4,"odd-thorn-tonic":5},
 bandages6:{"ex-bandages":6},
 rations4:{"ex-rations":4},
 tonic6:{"odd-thorn-tonic":6}
};
const configs=[
 // Three orthogonal resource-only arms
 ["supply-modest","modest",null,null,null],
 ["supply-heavy","heavy",null,null,null],
 ["supply-extreme","extreme",null,null,null],
 // Three orthogonal Room-rest-only arms
 ["rest-modest",null,"modest",null,null],
 ["rest-heavy",null,"heavy",null,null],
 ["rest-extreme",null,"extreme",null,null],
 // Five Monster-only arms; early and later rewards tested separately
 ["defeat-upper-2",null,null,"upper",2],
 ["defeat-early-2",null,null,"early",2],
 ["defeat-all-2",null,null,"all",2],
 ["defeat-all-3",null,null,"all",3],
 ["defeat-all-d6",null,null,"all","d6"],
 // Supply + rest interactions
 ["supply-rest-medium","medium","medium",null,null],
 ["supply-rest-heavy","heavy","heavy",null,null],
 ["supply-rest-extreme","extreme","extreme",null,null],
 ["supply-rest-heavy-lowcost","heavy","medium",null,null],
 // Monster rewards + rest, without adding more consumables
 ["rest-defeat-upper","", "heavy","upper",3],
 ["rest-defeat-early",null,"heavy","early",3],
 ["rest-defeat-all",null,"heavy","all","d6"],
 // Monster rewards + consumable supply
 ["supply-defeat-upper","medium",null,"upper",3],
 ["supply-defeat-early","heavy",null,"early",3],
 ["supply-defeat-all","heavy",null,"all","d6"],
 // Mixed cases, including modest/specialist and aggressive broad recovery
 ["hybrid-modest","medium","medium","upper",2],
 ["hybrid-early","heavy","heavy","early",3],
 ["hybrid-all-three","medium","medium","all",3],
 ["hybrid-all-d6","heavy","heavy","all","d6"],
 ["hybrid-maximum","extreme","extreme","all","d6"],
 ...["mild","strong","high","diceplus","bandages6","rations4","tonic6"]
  .map(tier=>["item-values-"+tier,null,null,null,null,tier]),
 ...["modest","medium","heavy","extreme"].flatMap(quantity=>
  ["mild","strong","high"].map(strength=>[
   "item-quantity-"+quantity+"-"+strength,
   quantity,null,null,null,strength
  ])),
 ["item-value-rest-heavy",null,"heavy",null,null,"strong"],
 ["item-value-defeat-early",null,null,"early",3,"strong"],
 ["item-value-defeat-all",null,null,"all","d6","diceplus"],
 ["item-value-hybrid-early","medium","medium","early",3,"strong"],
 ["item-value-hybrid-maximum","heavy","heavy","all","d6","high"]
];
const names=new Set(configs.map(x=>x[0]));
if(names.size!==configs.length)throw Error("Duplicate overnight arm");
const makeSpec=([suffix,items,rooms,region,reward,strength])=>{
 const cards=items?[
  ["ex-bandages",supply[items][0]],
  ["ex-rations",supply[items][1]],
  ["odd-thorn-tonic",supply[items][2]]
 ].map(([id,copies])=>({collection:"items",id,set:{copies}})):[];
 const roomRestHealing=rooms?Object.fromEntries([
  "ex-u-coal-store","ex-m-old-barracks","ex-d-watchpost"
 ].map((id,i)=>[id,rest[rooms][i]])):{};
 const monsterHealing=region?Object.fromEntries(
  monstersFor[region].map(id=>[id,reward])):{};
 return Object.freeze({
  schema:"rogue-cards-staging-v1",id:"recovery-"+suffix,
  description:"Printed recovery: Items="+(items||"unchanged")+
   "; Item HP="+(strength||"canonical")+
   "; REST="+(rooms||"unchanged")+"; Monster DEFEAT="+
   (region||"unchanged")+(region?":"+reward:"")+
   "; original Balanced B Rooms and current Monster stats.",
  roomDeck:BALANCED_HEAL_ROOM_DECK,
  ...(cards.length?{cards}:{}),
  ...(strength?{itemHealing:itemStrength[strength]}:{}),
  ...(rooms?{roomRestHealing}:{}),
  ...(region?{monsterHealing}:{})
 });
};
export const RECOVERY_OVERNIGHT_PHYSICAL_IDS=Object.freeze(
 configs.map(c=>"recovery-"+c[0]));
export const RECOVERY_OVERNIGHT_REFERENCE_ID="recovery-diagnostic-five";
export function recoveryOvernightHypotheses(){
 const result=configs.map(makeSpec);
 result.push(Object.freeze({
  schema:"rogue-cards-staging-v1",
  id:RECOVERY_OVERNIGHT_REFERENCE_ID,
  description:"UNPRINTABLE diagnostic reference +5 HP after each won regional combat.",
  roomDeck:BALANCED_HEAL_ROOM_DECK,
  mechanics:{postCombatHeal:5}
 }));
 for(const spec of result)compileStaging(spec);
 return Object.freeze(result);
}
