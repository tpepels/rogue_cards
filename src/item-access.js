/**
 * All printed Object timing is classified here, separately from value/scoring.
 * Only legal ACTION entries spend a Hero combat turn. Reactions are never
 * offered as actions; they are handled at their actual trigger by campaign.
 */
import {OBJECTS} from "./tabletop-data.js";
const actions=new Set(["scroll-flame","scroll-frost","scroll-lightning",
 "scroll-banish","scroll-mischief","scroll-last","wand-sparks",
 "wand-morph","wand-turn","wand-frost","spore-jar"]);
const scouts=new Set(["raven","ring-eye","skull","chalk","scroll-reveal"]);
const encounter=new Set(["goblin-pet","ring-bargain","coin","wand-market"]);
const locks=new Set(["u-gate","u-mimic","m-vault","d-last-chest"]);
const fireSkipRooms=new Set(["u-lamp","m-crypt","d-shadow"]);
const passive=new Set(["key","rope","torch","staff","cursed-blade",
 "mail","cursed-mail","lantern-heart"]);
const reacts=new Set(["sword","dog","shield","mirror","ring-luck",
 "ring-spores","ring-hunger","ring-ashes","ring-echo",
 "wand-undo","crown-relic","moth"]);
const recover=new Set(["needle","moth","ring-spores"]);
const onRoom=new Set(["ring-eye","ring-echo","ring-spores","ring-ashes",
 "ring-hunger","raven","dog","key","rope","torch","staff",
 "lantern-heart","cursed-blade","mail","cursed-mail",
 "crowbar","scroll-unlock","wand-door","scroll-flame","scroll-frost",
 "scroll-lightning","scroll-reveal","coin","needle","spore-jar",
 "skull","chalk","goblin-pet","ring-bargain","wand-market",
 "sword","shield","mirror","ring-luck","wand-undo","crown-relic",
 "moth","ring-hunger"]);
const due=(h,card)=>!(/ONCE PER ROOM/i.test(card.v2.trigger)&&h.used.has(card));
const active=(s,h,card)=>h.hp>0&&
 (!card.v2.roll||!(card.v2.kind==="WAND"&&s.exhausted.has(card)))&&
 due(h,card);
const equipped=(h,card)=>Object.values(h.slots).some(c=>c===card);
/** An opportunity is a printed trigger becoming available, not merely ownership. */
export function itemOptions(s,h,phase){
 if(!h||h.hp<=0)return [];
 const options=[];
 const push=(card,mode)=>{if(active(s,h,card))options.push({card,mode,phase})};
 for(const card of h.inventory){
  const id=card.id,kind=card.v2.kind;
  if(phase==="combat"){
   if(s.monster&&actions.has(id))push(card,"action");
   if(s.monster&&id==="torch"&&fireSkipRooms.has(s.room?.id))push(card,"torch-skip");
   if(s.monster&&id==="lantern-heart")push(card,"lantern-skip");
   if(s.monster&&id==="lantern-heart"&&s.exhaustedWand())push(card,"lantern-recharge");
   // OVERCHARGE is printed on every Wand: only when upright; not a normal roll.
   if(s.monster&&kind==="WAND"&&h.hp>1)push(card,"overcharge");
   // Potions and printed non-combat tools may consume a combat action.
   if(s.monster&&kind==="POTION")push(card,"drink");
   if(s.monster&&id==="needle"&&(h.poison||h.hp<h.card.hp))push(card,"recover");
  }else if(phase==="explore"){
   if(s.room?.stage!=="FINAL"&&scouts.has(id)&&id!=="scroll-reveal"&&
    (id!=="ring-eye"||equipped(h,card))&&(id!=="raven"||equipped(h,card)))push(card,"scout");
   if(s.room?.stage!=="FINAL"&&id==="scroll-reveal")push(card,"scout");
   if(s.room?.v2.kind==="ENCOUNTER"&&encounter.has(id)&&
    (id!=="ring-bargain"||equipped(h,card))&&
    (id!=="goblin-pet"||equipped(h,card)))push(card,"encounter");
   if(s.room?.v2.kind==="SHRINE"&&s.exhaustedWand()&&
    (id==="staff"&&equipped(h,card)||id==="lantern-heart"))push(card,"recharge");
  }else if(phase==="room-choice"){
   if(locks.has(s.room?.id)&&["crowbar","scroll-unlock","wand-door"].includes(id))
    push(card,"lock");
   if(s.room&&card.v2.links.includes(s.room.id)&&
    ["key","rope","torch","lantern-heart","scroll-flame","scroll-frost",
     "scroll-lightning","spore-jar"].includes(id))push(card,"room-option");
  }else if(phase==="after-roll"){
   if(["ring-luck","wand-undo","crown-relic"].includes(id)&&
      (id!=="ring-luck"||equipped(h,card)))push(card,"d20-reaction");
  }else if(phase==="before-defence"){
   if(["mirror","shield"].includes(id)&&
     (id!=="shield"||equipped(h,card)))push(card,"defence-reaction");
  }else if(phase==="on-attack"){
   if(["sword","dog","ring-ashes"].includes(id)&&equipped(h,card))
    push(card,"attack-trigger");
  }else if(phase==="on-poison"){
   if(recover.has(id)&&(id==="needle"||equipped(h,card))&&h.poison)
    push(card,"poison-reaction");
  }else if(phase==="room-roll"){
   if(id==="ring-echo"&&equipped(h,card))push(card,"room-reroll");
  }else if(phase==="between-rooms"){
   if(kind==="POTION")push(card,"drink");
   if(id==="needle"&&(h.poison||h.hp<h.card.hp))push(card,"recover");
  }else if(phase==="passive"){
   if(passive.has(id)&&(!["staff","cursed-blade","mail","cursed-mail"].includes(id)||equipped(h,card)))
    push(card,"passive");
  }
 }
 return options;
}
export const ITEM_TIMING=Object.freeze(Object.fromEntries(OBJECTS.map(card=>{
 const id=card.id;
 let phases=[];
 if(actions.has(id)||id==="spore-jar"||id==="torch"||id==="lantern-heart"||
  id==="needle"||card.v2.kind==="WAND"||card.v2.kind==="POTION")phases.push("combat");
 if(scouts.has(id)||encounter.has(id)||id==="staff"||id==="lantern-heart")phases.push("explore");
 if(["key","rope","torch","lantern-heart","crowbar","scroll-unlock","wand-door",
   "scroll-flame","scroll-frost","scroll-lightning","spore-jar"].includes(id))
  phases.push("room-choice");
 if(["ring-luck","wand-undo","crown-relic"].includes(id))phases.push("after-roll");
 if(["mirror","shield"].includes(id))phases.push("before-defence");
 if(["sword","dog","ring-ashes"].includes(id))phases.push("on-attack");
 if(recover.has(id))phases.push("on-poison");
 if(id==="ring-echo")phases.push("room-roll");
 if(["needle"].includes(id)||card.v2.kind==="POTION")phases.push("between-rooms");
 if(passive.has(id))phases.push("passive");
 // Passive attack/defence buffs can also be used without an explicit activation.
 if(["ring-hunger","ring-spores","moth","goblin-pet",
  "ring-bargain","ring-eye","raven"].includes(id)&&!phases.includes("passive"))
  phases.push("passive");
 if(!phases.length)throw Error("No timing category for Object "+id);
 return [id,Object.freeze([...new Set(phases)])];
})));
export function auditItemTiming(){
 const ids=OBJECTS.map(o=>o.id);
 if(new Set(ids).size!==ids.length)throw Error("Duplicate Object ID");
 for(const id of ids)if(!ITEM_TIMING[id]?.length)throw Error("Object cannot be used: "+id);
 return {objects:ids.length,categorized:ids.length,
  combatActionIds:[...actions],phaseCounts:Object.fromEntries(
   [...new Set(Object.values(ITEM_TIMING).flat())].map(p=>[p,
    ids.filter(id=>ITEM_TIMING[id].includes(p)).length]))};
}
auditItemTiming();
