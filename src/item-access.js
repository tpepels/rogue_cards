/**
 * All printed Object timing is classified here, separately from value/scoring.
 * Only legal ACTION entries spend a Hero combat turn. Reactions are never
 * offered as actions; they are handled at their actual trigger by campaign.
 */
import {OBJECTS} from "./tabletop-data.js";
import {ODD_ITEMS} from "./item-expansion.js";
import {PRINT_ONLY_ITEMS} from "./print-expansion.js";
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
 !(card.v2.kind==="POTION"&&
   h.keptUsedPotions?.some(entry=>entry.card===card))&&
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
   if(s.monster&&kind==="WAND"&&actions.has(id)&&h.hp>1)push(card,"overcharge");
   // Potions and printed non-combat tools may consume a combat action.
   if(s.monster&&kind==="POTION")push(card,"drink");
   if(s.monster&&id==="needle"&&(h.poison||h.hp<h.card.hp))push(card,"recover");
  }else if(phase==="explore"){
   if(["odd-sun-charm","odd-fever-candle","odd-thorn-tonic"].includes(id))
    push(card,"odd-tool");
   if(["odd-mad-compass","odd-moon-lens"].includes(id)&&s.room?.stage!=="FINAL"&&
      (id!=="odd-moon-lens"||!!s.room?.v2.roll&&s.moonLensFace==null))
    push(card,"odd-tool");
   if(s.room?.stage!=="FINAL"&&scouts.has(id)&&id!=="scroll-reveal"&&
    (id!=="ring-eye"||equipped(h,card))&&(id!=="raven"||equipped(h,card)))push(card,"scout");
   if(s.room?.stage!=="FINAL"&&id==="scroll-reveal")push(card,"scout");
   if(s.room?.stage!=="FINAL"&&id==="scroll-mischief")push(card,"exploration-action");
   if(s.room?.v2.kind==="ENCOUNTER"&&encounter.has(id)&&
    (id!=="ring-bargain"||equipped(h,card))&&
    (id!=="goblin-pet"||equipped(h,card)))push(card,"encounter");
   // Lantern Heart is a discard-to-recharge Item action. Staff and
   // encounter Wand SHRINE alternatives REPLACE the Room's choice; they
   // must never be combined with the ordinary printed Room reward.
   if(s.room?.v2.kind==="SHRINE"&&s.exhaustedWand()&&
    id==="lantern-heart")push(card,"recharge");
  }else if(phase==="room-choice"){
   if(locks.has(s.room?.id)&&["crowbar","scroll-unlock","wand-door"].includes(id))
    push(card,"lock");
   if(s.room&&card.v2.links.includes(s.room.id)&&
    ["key","rope","torch","lantern-heart","scroll-flame","scroll-frost",
     "scroll-lightning","spore-jar"].includes(id))push(card,"room-option");
  }else if(phase==="after-roll"){
   if(["ring-luck","wand-undo"].includes(id)&&
      (id!=="ring-luck"||equipped(h,card)))push(card,"d20-reaction");
  }else if(phase==="failed-d20"){
   if(id==="crown-relic")push(card,"rescue-failed-roll");
  }else if(phase==="before-defence"){
   if(id==="mirror")push(card,"defence-reaction");
  }else if(phase==="after-hit"){
   if(id==="shield"&&equipped(h,card))push(card,"defence-reaction");
  }else if(phase==="on-attack"){
   if(id==="ring-ashes"&&equipped(h,card))push(card,"attack-trigger");
  }else if(phase==="on-hit"){
   if(["sword","dog"].includes(id)&&equipped(h,card))
    push(card,"attack-trigger");
  }else if(phase==="on-poison"){
   if(recover.has(id)&&(id==="needle"||equipped(h,card))&&h.poison)
    push(card,"poison-reaction");
  }else if(phase==="after-magic"){
   if(id==="ring-hunger"&&equipped(h,card))push(card,"magic-reaction");
  }else if(phase==="room-roll"){
   if(id==="ring-echo"&&equipped(h,card))push(card,"room-reroll");
  }else if(phase==="between-rooms"){
   if(["odd-fever-candle","odd-sun-charm","odd-thorn-tonic","odd-bone-dice"].includes(id)||
      id==="odd-echo-bell"&&s.keptRooms.length>0||
      id==="odd-red-string"&&s.living().length===2&&!s.redString)
     push(card,"odd-tool");
   if(kind==="POTION")push(card,"drink");
   if(id==="needle"&&(h.poison||h.hp<h.card.hp))push(card,"recover");
   if(["ex-bandages","ex-rations"].includes(id)&&h.hp<h.card.hp)push(card,"healing-tool");
  }else if(phase==="passive"){
   if(passive.has(id)&&(["staff","cursed-blade","mail","cursed-mail"].includes(id)?
      equipped(h,card):
      card.v2.links.includes(s.room?.id)))
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
 if(scouts.has(id)||encounter.has(id)||id==="staff"||id==="lantern-heart"||
   id==="scroll-mischief")phases.push("explore");
 if(["key","rope","torch","lantern-heart","crowbar","scroll-unlock","wand-door",
   "scroll-flame","scroll-frost","scroll-lightning","spore-jar"].includes(id))
  phases.push("room-choice");
 if(["ring-luck","wand-undo"].includes(id))phases.push("after-roll");
 if(id==="crown-relic")phases.push("failed-d20");
 if(id==="mirror")phases.push("before-defence");
 if(id==="shield")phases.push("after-hit");
 if(["sword","dog"].includes(id))phases.push("on-hit");
 if(id==="ring-ashes")phases.push("on-attack");
 if(recover.has(id))phases.push("on-poison");
 if(id==="ring-echo")phases.push("room-roll");
 if(id==="ring-hunger")phases.push("after-magic");
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

/** All 79 Item definitions must have an explicit mechanical timing route.
 * This is a contract INDEX, not a proof that every branch has a deterministic
 * executable test. The latter is deliberately reported separately.
 * Keep the old ITEM_TIMING registry intact for original-mode consumers.
 */
const extraTimings=Object.freeze({
 "ex-bandages":["between-rooms","out-of-combat-heal"],
 "ex-lockpicks":["room-roll-reroll"],
 "ex-rations":["between-rooms","out-of-combat-heal"],
 "ex-dagger":["equipped-weapon"],
 "ex-mace":["equipped-weapon"],
 "ex-spear":["equipped-weapon","beast-matchup"],
 "ex-jerkin":["equipped-armour"],
 "ex-helm":["equipped-armour","on-hit"],
 "ex-buckler":["equipped-armour"],
 "odd-loaded-coin":["after-d6"],
 "odd-crooked-die":["after-d6"],
 "odd-lucky-thread":["before-own-d20"],
 "odd-jinx-powder":["before-monster-behaviour"],
 "odd-bent-mirror":["after-own-d20"],
 "odd-fever-candle":["explore","between-rooms"],
 "odd-grave-salt":["before-attack-cursed"],
 "odd-hooked-chain":["after-d6","once-per-room"],
 "odd-sun-charm":["explore","between-rooms"],
 "odd-mad-compass":["explore","before-room-choice"],
 "odd-trick-knife":["equipped-weapon","after-own-attack-d20"],
 "odd-chaos-idol":["after-d6","after-own-d20"],
 "odd-witchbones":["after-d6"],
 "odd-thorn-tonic":["explore","between-rooms"],
 "odd-echo-bell":["between-rooms-kept-trophy"],
 "odd-moon-lens":["explore-before-room-roll"],
 "odd-bone-dice":["between-rooms"],
 "odd-red-string":["between-rooms-two-heroes","shared-d20"]
});
export const ITEM_TIMING_ALL=Object.freeze({
 ...ITEM_TIMING,
 ...Object.fromEntries([...PRINT_ONLY_ITEMS,...ODD_ITEMS].map(card=>{
  const timing=extraTimings[card.id];
  if(!timing?.length)throw Error("Unclassified extra Item "+card.id);
  return [card.id,Object.freeze(timing)];
 }))
});
export function auditAllItemTiming(){
 const cards=[...OBJECTS,...PRINT_ONLY_ITEMS,...ODD_ITEMS];
 const ids=cards.map(c=>c.id);
 if(ids.length!==79||new Set(ids).size!==79)
  throw Error("Expected 79 unique Everything Goes Item designs");
 const actual=Object.keys(ITEM_TIMING_ALL);
 if(actual.length!==79||actual.some(id=>!ids.includes(id)))
  throw Error("Item timing registry and printable Item catalogue disagree");
 for(const card of cards)
  if(!ITEM_TIMING_ALL[card.id]?.length)
   throw Error("Missing executable timing path for "+card.id);
 return {classified:79,cards:ids.length,legacy:OBJECTS.length,
  expansion:PRINT_ONLY_ITEMS.length,unusual:ODD_ITEMS.length};
}
auditAllItemTiming();
