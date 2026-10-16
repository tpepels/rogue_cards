// Paper-deck composition only. None of these selections mutate engine or Oracle decks.
import {HEROES,ROOMS,MONSTERS,OBJECTS,VAULT,WARDEN_CARDS} from "./tabletop-data.js";
import {PRINT_ONLY_ROOMS,PRINT_ONLY_ITEMS} from "./print-expansion.js";
import {EXTRA_MONSTERS} from "./monster-expansion.js";
import {ODD_ITEMS} from "./item-expansion.js";
export const ALL_ROOMS=Object.freeze([...ROOMS,...PRINT_ONLY_ROOMS]);
export const ALL_MONSTERS=Object.freeze([...MONSTERS,...EXTRA_MONSTERS]);
export const ALL_OBJECTS=Object.freeze([...OBJECTS,...PRINT_ONLY_ITEMS,...ODD_ITEMS]);
export const SELECTABLE=Object.freeze([...ALL_ROOMS,...ALL_MONSTERS,...ALL_OBJECTS]);
export const FIXED_CARDS=Object.freeze([...HEROES,VAULT,...WARDEN_CARDS]);
export const cardKey=c=>c.type+":"+c.id;
const potionIds=new Set(["smoky","milky","amber","fizzy","mushroom","midnight","antidote","laughing"]);
const keys=list=>list.trim().split(/\s+/).filter(Boolean).map(k=>k.includes(":")?k:(potionIds.has(k)?"potion:":k.startsWith("u-")||k.startsWith("m-")||k.startsWith("d-")?"room:":"item:")+k);
const rooms=(stage,items)=>items.trim().split(/\s+/).map(id=>"room:"+id);
const items=text=>keys(text);
const monsters=text=>text.trim().split(/\s+/).map(id=>"monster:"+id);
const SIMPLE=[...rooms("UPPER","ex-u-guard-cell ex-u-slick-passage ex-u-coal-store ex-u-cracked-hall ex-u-spoiled-pantry u-passage u-gate u-supply u-fountain u-bookcase u-mimic u-shrine"),
 ...rooms("MIDDLE","ex-m-prison-block ex-m-slanted-causeway ex-m-old-barracks ex-m-footbridge ex-m-drain-tunnel m-flood m-statue m-vault m-crypt m-altar m-auction m-beetle"),
 ...rooms("DEEP","ex-d-flooded-cell ex-d-ash-corridor ex-d-cracked-coffer ex-d-iron-stairs ex-d-watchpost d-shadow d-bridge d-bones d-gate d-mouth d-oracle d-last-chest")];
const STRANGE=[...rooms("UPPER","ex-u-guard-cell ex-u-slick-passage ex-u-coal-store ex-u-cracked-hall ex-u-spoiled-pantry u-passage u-gate u-supply u-fountain u-mimic u-bookcase u-hollow-knight u-rat-favor"),
 ...rooms("MIDDLE","ex-m-prison-block ex-m-slanted-causeway ex-m-old-barracks ex-m-footbridge ex-m-drain-tunnel m-flood m-vault m-crypt m-auction m-well m-bridge m-clock m-ferryman-oath"),
 ...rooms("DEEP","ex-d-flooded-cell ex-d-ash-corridor ex-d-cracked-coffer ex-d-iron-stairs ex-d-watchpost d-shadow d-bones d-gate d-oracle d-mouth d-sleeping-crown d-last-witness d-last-bell")];
const BASICS=items("ex-bandages ex-lockpicks ex-rations ex-dagger ex-mace ex-spear ex-jerkin ex-helm ex-buckler key rope torch crowbar chalk needle sword staff mail shield spore-jar coin scroll-flame scroll-frost scroll-unlock scroll-reveal wand-sparks wand-frost antidote smoky amber milky mushroom fizzy");
const MAGICAL=items("ex-bandages ex-lockpicks ex-rations ex-dagger ex-mace ex-spear ex-jerkin ex-helm ex-buckler key rope torch crowbar chalk needle sword staff mail shield spore-jar coin mirror skull dog raven moth scroll-flame scroll-frost scroll-lightning scroll-unlock scroll-reveal scroll-banish scroll-mischief scroll-last wand-sparks wand-undo wand-morph wand-turn wand-frost ring-luck ring-eye ring-bargain antidote smoky milky amber fizzy mushroom midnight laughing");
const EVERYWHERE=SELECTABLE.map(cardKey);
const CLASSIC_MONSTERS=monsters("rat goblin bat troll eye mold wraith rust sentinel");
export const PRESETS=Object.freeze([
 {id:"classic",name:"Classic Crawl",subtitle:"Doors, traps, loot, monsters.",description:"Twelve Rooms per depth. No Pacts. Straightforward Rooms and practical gear, with enough magic to attempt the Vault.",roomCount:36,selection:Object.freeze([...SIMPLE,...BASICS,...CLASSIC_MONSTERS])},
 {id:"strange",name:"Strange Paths",subtitle:"A normal dungeon with occasional bargains.",description:"Thirteen Rooms per depth, six possible Pacts and a broader mix of equipment and spells. The recommended starting experience.",roomCount:39,selection:Object.freeze([...STRANGE,...MAGICAL,...MONSTERS.map(cardKey)])},
 {id:"chaos",name:"Everything Goes",subtitle:"Every oddity, every possible pact.",description:"All canonical cards plus the ordinary expansion, including every route, curse, bargain and unusual combination.",roomCount:ALL_ROOMS.length,selection:Object.freeze(EVERYWHERE)}
]);
const pool=new Map(SELECTABLE.map(c=>[cardKey(c),c]));
const fixedKeys=new Set(FIXED_CARDS.map(cardKey));
if(pool.size!==SELECTABLE.length)throw new Error("Duplicate physical-card identity in print builder");
for(const preset of PRESETS){
 if(new Set(preset.selection).size!==preset.selection.length)throw new Error("Duplicate card in "+preset.id);
 for(const key of preset.selection)if(!pool.has(key))throw new Error("Missing "+key+" in "+preset.id);
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  const count=preset.selection.filter(k=>pool.get(k)?.type==="room"&&pool.get(k)?.stage===stage).length;
  if(count<3)throw new Error(preset.id+" has too few "+stage+" Rooms: "+count);
 }
 for(const starter of HEROES.map(h=>h.v2.starter)){
  if(!preset.selection.some(k=>pool.get(k)?.id===starter&&["item","potion"].includes(pool.get(k).type)))
   throw new Error(preset.id+" excludes a Hero starting Item: "+starter);
 }
}
export const selectableByKey=key=>pool.get(key)||null;
export const selectionForPreset=id=>{
 const preset=PRESETS.find(x=>x.id===id);
 if(!preset)throw new Error("Unknown deck: "+id);
 return new Set(preset.selection);
};
export function physicalDeck(selection){
 const wanted=selection instanceof Set?selection:new Set(selection);
 const chosen=SELECTABLE.filter(c=>wanted.has(cardKey(c)));
 return [...FIXED_CARDS,...chosen].flatMap(c=>Array.from({length:c.copies},()=>c));
}
export function selectionSummary(selection){
 const chosen=SELECTABLE.filter(c=>selection.has(cardKey(c)));
 const counts=Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(stage=>[stage,chosen.filter(c=>c.type==="room"&&c.stage===stage).length]));
 const mobs=Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(stage=>[stage,chosen.filter(c=>c.type==="monster"&&c.stage===stage).length]));
 const objects=chosen.filter(c=>c.type==="item"||c.type==="potion");
 const starters=HEROES.filter(h=>!objects.some(o=>o.id===h.v2.starter)).map(h=>h.title);
 const magic=objects.filter(c=>c.v2.tags.includes("MAGIC")).reduce((total,c)=>total+c.copies,0);
 const warnings=[];
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  if(counts[stage]<3)warnings.push(stage+": select at least three Rooms");
  if(!mobs[stage])warnings.push(stage+": select at least one Monster type");
 }
 if(starters.length)warnings.push("Missing starter Items for: "+starters.join(", "));
 if(objects.reduce((t,c)=>t+c.copies,0)<12)warnings.push("Very small Object deck: fewer than 12 physical copies");
 if(magic<6)warnings.push("Fewer than six MAGIC copies: a cooperative SEAL may be impossible, but combat victory is still allowed");
 return {counts,monsters:mobs,objects:objects.length,magic,pacts:chosen.filter(c=>c.type==="room"&&/· PACT/.test(c.v2.choices.map(x=>x.label).join(" "))).length,
  extra:chosen.filter(c=>c.printOnly).length,unique:chosen.length+FIXED_CARDS.length,copies:physicalDeck(selection).length,warnings};
}
export const selectionGroups=Object.freeze([
 ...["UPPER","MIDDLE","DEEP"].map(stage=>({id:stage,label:stage+" ROOMS",cards:ALL_ROOMS.filter(c=>c.stage===stage)})),
 ...["UPPER","MIDDLE","DEEP"].map(stage=>({id:"monster-"+stage,label:stage+" MONSTERS",cards:ALL_MONSTERS.filter(c=>c.stage===stage)})),
 {id:"basic-items",label:"TOOLS & EQUIPMENT",cards:ALL_OBJECTS.filter(c=>["TOOL","EQUIPMENT"].includes(c.v2.kind))},
 {id:"other-items",label:"COMPANIONS, RELICS, SCROLLS, RINGS, WANDS & POTIONS",cards:ALL_OBJECTS.filter(c=>!["TOOL","EQUIPMENT"].includes(c.v2.kind))}
]);
if(new Set(selectionGroups.flatMap(g=>g.cards.map(cardKey))).size!==SELECTABLE.length)throw new Error("A selectable card is missing from the deck builder groups");
