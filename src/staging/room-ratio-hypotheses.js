/**
 * Three pre-registered, printed-Room-composition hypotheses.
 * Only the shuffled Room pool changes. Monster rules, Items, Hero stats,
 * Vault, Room outcomes and MCTS policy stay canonical.
 *
 * 16 non-Corridor Room copies per depth provides four spares after the
 * 12 counted non-Corridor visits. Repeating a printed Room ID means a
 * hypothetical physical reprint; there are no invented effects.
 */
import {canonicalStagingCatalogue,compileStaging} from "./catalogue.js";

const REGIONS=["UPPER","MIDDLE","DEEP"];
// Recipe construction needs every original Room, including ones absent in B.
const rooms=canonicalStagingCatalogue({roomBaseline:"full"}).rooms;
const byId=new Map(rooms.map(r=>[r.id,r]));
const entry=new Set([
 "u-nest","u-mimic","ex-u-guard-cell",
 "m-statue","m-crypt","ex-m-old-barracks",
 "d-reliquary","d-bones","d-gate","ex-d-watchpost"
]);
const conditional=new Set([
 "u-passage","u-fall","u-fountain",
 "m-flood","m-fungus","m-treasure","m-beetle","ex-m-prison-block",
 "d-shadow","d-mouth","d-bazaar","d-last-chest","d-last-bell",
 "ex-d-flooded-cell"
]);
// These eight printed support Rooms are identical in every hypothesis.
const support=Object.freeze({
 UPPER:["u-shrine","u-lantern-shrine","ex-u-coal-store"],
 MIDDLE:["m-altar","m-second-name","m-well"],
 DEEP:["d-apothecary","d-mirror"]
});
const corridorOrder=Object.freeze({
 UPPER:["u-candle","ex-u-cracked-hall","u-fork"],
 MIDDLE:["m-ladder","ex-m-drain-tunnel","m-red-detour"],
 DEEP:["d-whisper-junction","ex-d-ash-corridor","d-gilded"]
});
export const ROOM_RATIO_TARGETS=Object.freeze([
 {id:"room-ratio-corridor-chance",label:"A: Corridors and chance",
  corridorCount:3,counts:{
   UPPER:[4,6,6],MIDDLE:[4,7,5],DEEP:[5,6,5]}},
 {id:"room-ratio-balanced",label:"B: Balanced",
  corridorCount:2,counts:{
   UPPER:[6,6,4],MIDDLE:[7,5,4],DEEP:[6,5,5]}},
 {id:"room-ratio-guaranteed",label:"C: Guaranteed encounters",
  corridorCount:1,counts:{
   UPPER:[8,4,4],MIDDLE:[8,4,4],DEEP:[8,3,5]}}
]);
// Reuse every suitable printed Room before reprinting it. Any reprint is
// selected round-robin, so the same Room never dominates unnecessarily.
const fill=(choices,n)=>Array.from({length:n},(_,i)=>{
 if(!choices.length)throw Error("No printed Room in required category");
 return choices[i%choices.length];
});
const kind=r=>entry.has(r.id)?"entry":conditional.has(r.id)?"conditional":"none";
const ordered=(stage,category)=>rooms.filter(r=>r.stage===stage&&
 r.v2.kind!=="CORRIDOR"&&kind(r)===category)
 .map(r=>r.id).sort();

export function roomRatioDeck(target){
 if(!ROOM_RATIO_TARGETS.some(t=>t.id===target.id))
  throw Error("Unknown registered Room ratio hypothesis");
 const result={};
 for(const stage of REGIONS){
  const [guaranteed,chance,neutral]=target.counts[stage];
  if(guaranteed+chance+neutral!==16)
   throw Error("Room-ratio stage must have 16 ordinary Rooms: "+stage);
  const helpers=support[stage];
  if(neutral<helpers.length||helpers.some(id=>
   !byId.has(id)||kind(byId.get(id))!=="none"||
   byId.get(id).stage!==stage))
   throw Error("Unsafe fixed support Rooms in "+stage);
  const unused=ordered(stage,"none").filter(id=>!helpers.includes(id));
  const selection=[
   ...fill(ordered(stage,"entry"),guaranteed),
   ...fill(ordered(stage,"conditional"),chance),
   ...helpers,...fill(unused,neutral-helpers.length),
   ...corridorOrder[stage].slice(0,target.corridorCount)
  ];
  if(selection.length!==16+target.corridorCount||
    selection.some(id=>byId.get(id)?.stage!==stage))
   throw Error("Invalid Room-ratio pool for "+stage);
  result[stage]={selection};
 }
 return result;
}
export function roomRatioHypotheses(){
 const specs=ROOM_RATIO_TARGETS.map(target=>({
  schema:"rogue-cards-staging-v1",id:target.id,
  description:target.label+"; 12 counted non-Corridor visits per stage, "+
   "16 printed ordinary Room copies per stage plus "+
   target.corridorCount+" Corridor copies per stage. "+
   "Eight fixed support Rooms; no new card effects.",
  roomDeck:roomRatioDeck(target)
 }));
 for(const spec of specs)compileStaging(spec);
 return Object.freeze(specs);
}
