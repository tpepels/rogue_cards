/**
 * Second-generation, independently preregistered physical-game hypotheses.
 * "Encounters" changes existing printed Room decisions and uses existing
 * real combat/parley rules. "Warden" ONLY changes Warden cards.
 */
import {ROOM_EFFECTS} from "../room-effect-model.js";
import {compileStaging} from "./catalogue.js";
import {encounterRoomSelection} from "./balance-hypotheses.js";

const spec=(id,description,changes)=>({
 schema:"rogue-cards-staging-v1",id,description,...changes
});
const card=(collection,id,set)=>({collection,id,set});
const regions=["UPPER","MIDDLE","DEEP"];
const chooseRooms={
 UPPER:["ex-u-slick-passage","ex-u-coal-store","ex-u-spoiled-pantry"],
 MIDDLE:["ex-m-slanted-causeway","ex-m-footbridge","ex-m-prison-block"],
 DEEP:["ex-d-cracked-coffer","ex-d-iron-stairs","ex-d-flooded-cell"]
};
const deep=x=>structuredClone(x);
function withRollEncounters({countPerRegion,bonus}){
 const pool=encounterRoomSelection(),effects={};
 for(const region of regions){
  const candidates=pool[region];
  if(countPerRegion!==999&&candidates.length<countPerRegion)
   throw Error("Insufficient Room outcomes in "+region);
  for(const row of candidates.slice(0,countPerRegion===999?candidates.length:countPerRegion)){
   const ops=deep(ROOM_EFFECTS[row.id]);
   // One additional physical Monster on a printed, ordinarily
   // nonhazardous result. A preemptive Hero turn and/or attack DIS
   // protects the player, without changing Monster cards.
   const band=row.bands[0];
   ops.outcomes[band]=[...ops.outcomes[band],"MONSTER_DRAW",...bonus];
   effects[row.id]=ops;
  }
 }
 return effects;
}
function withVoluntaryEncounters({countPerRegion,loot,freeTurn,avoidCost}){
 const result={};
 for(const region of regions){
  for(const id of chooseRooms[region].slice(0,countPerRegion)){
   const ops=deep(ROOM_EFFECTS[id]);
   ops.choices=[
    ["DRAW:"+loot,"MONSTER_DRAW",...(freeTurn?["SKIP:1"]:[])],
    avoidCost===0?["PEEK:1"]:["COST:"+avoidCost,"PEEK:1"]
   ];
   // The original Room roll outcomes remain for Items or retained
   // triggers which explicitly call a Room d6 elsewhere.
   result[id]=ops;
  }
 }
 return result;
}
function comboChanges(...groups){
 const changes={roomEffects:{}};
 for(const group of groups){
  for(const [id,value] of Object.entries(group))
   if(Object.hasOwn(changes.roomEffects,id))
    throw Error("Overlapping alternative Room interventions at "+id);
   else changes.roomEffects[id]=value;
 }
 return changes;
}
export function nextEncounterHypotheses(){
 const variants=[
  spec("safe-encounters-mild",
   "Four additional soft encounters per region: Monster appears, its first response is skipped.",
   {roomEffects:withRollEncounters({countPerRegion:4,bonus:["SKIP:1"]})}),
  spec("safe-encounters-disadvantage",
   "Four additional encounters per region where the Monster's next attack has DIS.",
   {roomEffects:withRollEncounters({countPerRegion:4,bonus:["MONSTER_DIS"]})}),
  spec("safe-encounters-strong",
   "All viable Rooms get one soft encounter outcome, with a skipped first Monster response.",
   {roomEffects:withRollEncounters({countPerRegion:999,bonus:["SKIP:1"]})}),
  spec("voluntary-loot-or-toll",
   "Nine Rooms offer voluntary Monster + draw 2 (one skipped response), or pay 1 Item to peek safely.",
   {roomEffects:withVoluntaryEncounters({
    countPerRegion:3,loot:2,freeTurn:true,avoidCost:1
   })}),
  spec("voluntary-loot-or-safe",
   "Nine Rooms offer voluntary Monster + draw 1 (skipped response), or a free safe peek.",
   {roomEffects:withVoluntaryEncounters({
    countPerRegion:3,loot:1,freeTurn:true,avoidCost:0
   })}),
  spec("voluntary-higher-loot",
   "Nine Rooms offer voluntary Monster + draw 3 (skipped response), or pay an Item to peek.",
   {roomEffects:withVoluntaryEncounters({
    countPerRegion:3,loot:3,freeTurn:true,avoidCost:1
   })}),
  spec("voluntary-fewer-rooms",
   "Three Rooms (one per region) offer a rewarded, avoidable encounter.",
   {roomEffects:withVoluntaryEncounters({
    countPerRegion:1,loot:2,freeTurn:true,avoidCost:1
   })}),
  spec("voluntary-fight-not-guarded",
   "Nine Rooms offer fight for loot without first-response protection, or discard to avoid it.",
   {roomEffects:withVoluntaryEncounters({
    countPerRegion:3,loot:2,freeTurn:false,avoidCost:1
   })}),
  spec("safe-encounters-dense",
   "All viable Rooms add an extra Monster encounter with attack DIS.",
   {roomEffects:withRollEncounters({countPerRegion:999,bonus:["MONSTER_DIS"]})})
 ];
 for(const v of variants)compileStaging(v);
 return Object.freeze(variants);
}
export function independentWardenHypotheses(){
 const options=[
  ["warden-phase1-18","Only Phase I Warden HP 20→18.",[
   card("warden","warden",{hp:18})]],
  ["warden-phase1-16","Only Phase I Warden HP 20→16.",[
   card("warden","warden",{hp:16})]],
  ["warden-phase1-14","Only Phase I Warden HP 20→14.",[
   card("warden","warden",{hp:14})]],
  ["warden-fury-8","Only Warden Fury HP 10→8; keep phase I canonical.",[
   card("wardenFury","warden-fury",{hp:8})]],
  ["warden-fury-6","Only Warden Fury HP 10→6; keep phase I canonical.",[
   card("wardenFury","warden-fury",{hp:6})]],
  ["warden-phase1-atk5","Only phase I Warden ATK 6→5.",[
   card("warden","warden",{atk:5})]],
  ["warden-fury-atk5","Only Warden Fury ATK 6→5.",[
   card("wardenFury","warden-fury",{atk:5})]],
  ["warden-phase1-def4","Only phase I Warden DEF 5→4.",[
   card("warden","warden",{def:4})]],
  ["warden-fury-def4","Only Warden Fury DEF 5→4.",[
   card("wardenFury","warden-fury",{def:4})]],
  ["warden-phase1-16-fury8","Combined Warden HP phase I 16 / Fury 8.",[
   card("warden","warden",{hp:16}),
   card("wardenFury","warden-fury",{hp:8})]],
  ["warden-phase1-18-fury8","Combined Warden HP phase I 18 / Fury 8.",[
   card("warden","warden",{hp:18}),
   card("wardenFury","warden-fury",{hp:8})]],
  ["warden-atk5-both","Both Warden phases ATK 6→5, HP unchanged.",[
   card("warden","warden",{atk:5}),
   card("wardenFury","warden-fury",{atk:5})]]
 ];
 const variants=options.map(([id,description,cards])=>
  spec(id,description,{cards}));
 for(const variant of variants){
  if(variant.roomEffects||variant.roomDeck||
   variant.cards.some(c=>!["warden","wardenFury"].includes(c.collection)))
   throw Error("Warden isolation violated");
  compileStaging(variant);
 }
 return Object.freeze(variants);
}
