/**
 * Canonical balanced Room distribution, selected after the A/B/C study.
 * This is the printed physical recipe: 16 non-Corridor copies and two
 * Corridors per depth. Extra copies have unchanged original rules.
 * The full catalogue remains available for custom and archival decks.
 */
import {ROOMS} from "./tabletop-data.js";
import {PRINT_ONLY_ROOMS} from "./print-expansion.js";
const stages=["UPPER","MIDDLE","DEEP"];
const all=[...ROOMS,...PRINT_ONLY_ROOMS];
const map=new Map(all.map(room=>[room.id,room]));
const guaranteed=new Set([
 "u-nest","u-mimic","ex-u-guard-cell",
 "m-statue","m-crypt","ex-m-old-barracks",
 "d-reliquary","d-bones","d-gate","ex-d-watchpost"
]);
const chance=new Set([
 "u-passage","u-fall","u-fountain",
 "m-flood","m-fungus","m-treasure","m-beetle","ex-m-prison-block",
 "d-shadow","d-mouth","d-bazaar","d-last-chest","d-last-bell",
 "ex-d-flooded-cell"
]);
const supports={
 UPPER:["u-shrine","u-lantern-shrine","ex-u-coal-store"],
 MIDDLE:["m-altar","m-second-name","m-well"],
 DEEP:["d-apothecary","d-mirror"]
};
const corridors={
 UPPER:["u-candle","ex-u-cracked-hall"],
 MIDDLE:["m-ladder","ex-m-drain-tunnel"],
 DEEP:["d-whisper-junction","ex-d-ash-corridor"]
};
const targets={
 UPPER:[6,6,4],MIDDLE:[7,5,4],DEEP:[6,5,5]
};
const kind=card=>guaranteed.has(card.id)?"guaranteed":
 chance.has(card.id)?"conditional":"neutral";
const candidates=(stage,category)=>all.filter(card=>
 card.stage===stage&&card.v2.kind!=="CORRIDOR"&&kind(card)===category)
 .map(card=>card.id).sort();
const repeat=(ids,n)=>Array.from({length:n},(_,i)=>{
 if(!ids.length)throw Error("Missing balanced Room candidates");
 return ids[i%ids.length];
});
export const BALANCED_ROOM_IDS=Object.freeze(
 stages.flatMap(stage=>{
  const [entry,conditional,neutral]=targets[stage];
  const fixed=supports[stage];
  const other=candidates(stage,"neutral").filter(id=>!fixed.includes(id));
  const selected=[
   ...repeat(candidates(stage,"guaranteed"),entry),
   ...repeat(candidates(stage,"conditional"),conditional),
   ...fixed,...repeat(other,neutral-fixed.length),
   ...corridors[stage]
  ];
  if(selected.length!==18||
   selected.filter(id=>map.get(id).v2.kind!=="CORRIDOR").length!==16)
   throw Error("Unbalanced printed Room count: "+stage);
  return selected;
 })
);
export const BALANCED_ROOMS=Object.freeze(
 BALANCED_ROOM_IDS.map(id=>map.get(id)));
export const BALANCED_ROOM_COUNTS=Object.freeze(
 BALANCED_ROOM_IDS.reduce((counts,id)=>{
  counts[id]=(counts[id]??0)+1;return counts;
 },{}));
export const BALANCED_ROOM_DISTRIBUTION=Object.freeze({
 guaranteed:19,conditional:16,neutral:13,corridors:6
});
