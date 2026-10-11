import {CATALOGUE,CARD_WIDTH_MM,CARD_HEIGHT_MM,printDeck} from "./tabletop-data.js";
import {illustration} from "./art.js";
export {CARD_WIDTH_MM,CARD_HEIGHT_MM};
export const CARDS_PER_SHEET=4;
export const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/** Curated art assignments. Assets are part of this repository, and never loaded from an external server.
 * Some illustration subjects represent existing cards with different printed titles:
 * e.g. Abandoned Storeroom illustrates Forgotten Supplies, and the Ironbound Chest
 * illustrates Buried Lockbox. This changes presentation ONLY, not physical rules.
 */
export const CARD_ART=Object.freeze({
 "hero:delver":"cave_delver.png",
 "monster:eye":"floating_eye.png",
 "item:key":"rusty_key.png",
 "potion:smoky":"smoky_potion.png",
 "room:m-flood":"flooded_chamber.png",
 "room:u-supply":"abandoned_storeroom.png",
 "monster:goblin":"goblin_scavenger.png",
 "room:m-vault":"ironbound_chest.png",
 "room:d-oracle":"strange_feeling.png",
 "room:m-statue":"cracked_oracle.png"
});
/** Fixed plate offsets for print reproducibility, not CSS randomness or game state.
 * Identical cards share an intentional slightly imperfect edition mark.
 */
export function printPlate(card){
 const key=card.type+":"+card.id;
 let hash=2166136261;
 for(const char of key)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 return ["a","b","c","d"][hash%4];
}
export const assetPath=card=>{
 const file=CARD_ART[card.type+":"+card.id];
 return file?"./assets/illustrations/"+file:null;
};

/** Choose an art/text composition deliberately; never hide overflowing text by scaling the font. */
const SPLIT_ROOMS=new Set(["m-flood"]);
const DENSE_MONSTERS=new Set(["rat","goblin","crawler","bat","troll","eye","mold","wraith","cultist","rust","sentinel","warden","wisp"]);
const DENSE_ROOMS=new Set(["u-shrine","m-altar","d-oracle","m-vault","d-reliquary","m-fungus","u-nest"]);
const DENSE_ITEMS=new Set(["cursed-blade","cursed-mail","dog","raven"]);
export function composition(card){
 if(card.type==="hero")return "portrait-stats";
 if(card.type==="monster")return DENSE_MONSTERS.has(card.id)?"monster-dense":"monster";
 if(card.type==="room")return SPLIT_ROOMS.has(card.id)?"room-split":DENSE_ROOMS.has(card.id)?"scene-compact":"room-scene";
 if(card.type==="potion")return "mystery";
 if(card.type==="item")return DENSE_ITEMS.has(card.id)?"item-compact":"illustration-dominant";
 return "illustration-dominant";
}
const rulify=rule=>esc(rule).replace(
 /(^|(?:\.\s+))((?:REVEAL|QUIET|ALTAR|AFTER VICTORY|FIRST USE|ONCE PER ROOM|ACTION|DRINK|EQUIP|CONSUME|SPELL|WEAPON|ARMOUR|GEAR|COMPANION|CURSED WEAPON|CURSED ARMOUR|RELIC)(?:\s*\([^)]*\))?)(\s*[—:])/g,
 (_,prefix,verb,sep)=>prefix+'<strong class="tt-rule-key">'+verb+sep+'</strong>'
);
function visual(card){
 const asset=assetPath(card);
 const image=asset
  ?'<img class="tt-art-image" src="'+esc(asset)+'" alt="" loading="eager" decoding="async">'
  :'<div class="tt-art-placeholder" aria-hidden="true">'+illustration(card.art)+'</div>';
 return '<div class="tt-illustration">'+image+'</div>';
}
function stats(card){
 if(card.type!=="hero"&&card.type!=="monster")return "";
 const values=[["HP",card.hp,"♥"],["ATK","+"+card.atk,"⚔"],["DEF","+"+card.def,"⬟"],
 ...(card.type==="hero"?[["WIT","+"+card.wit,"✶"]]:[])];
 return '<div class="tt-stats" aria-label="Printed character statistics">'+values.map(([name,value,mark])=>
  '<div class="tt-stat"><span class="tt-stat-symbol" aria-hidden="true">'+mark+'</span><b>'+esc(value)+'</b><small>'+esc(name)+'</small></div>').join("")+'</div>';
}
function content(card,{sidebar=false}={}){
 if(card.type==="monster"){
  return '<section class="tt-content tt-content--monster tt-record" aria-label="Monster behaviour and remains">'+
   '<div class="tt-label">BEHAVIOUR <span>ROLL d6 AFTER EACH HERO ACTION</span></div>'+
   '<div class="tt-behaviours">'+card.behavior.map((line,i)=>
    '<div class="tt-behaviour-row"><b>'+["1–2","3–4","5","6"][i]+'</b><span>'+esc(line)+'</span></div>').join("")+'</div>'+
   '<p class="tt-corpse"><b>CORPSE — </b>'+esc(card.corpse)+'</p>'+
   '</section>';
 }
 const cls='tt-content'+(sidebar?' tt-content--sidebar':'')+
  (card.type==="room"?' tt-content--room':card.type==="potion"?' tt-content--potion':
   card.type==="item"?' tt-content--item':' tt-content--hero');
 return '<section class="'+cls+'" aria-label="Card effect">'+
  '<p class="tt-rule">'+rulify(card.rule)+'</p>'+
  (card.mystery?'<div class="tt-identified">FIRST USE: keep this card as the identification reminder.</div>':"")+
  '</section>';
}
export function cardMarkup(card){
 if(!card||!card.type||!card.title||!card.art)throw new TypeError("Invalid tabletop card");
 const index=CATALOGUE.findIndex(c=>c.id===card.id&&c.type===card.type)+1;
 const type=esc(card.type), layout=composition(card),asset=assetPath(card),plate=printPlate(card);
 const stage=card.stage?'<span class="tt-stage">'+esc(card.stage)+'</span>':"";
 const front='<header class="tt-head"><span class="tt-masthead">ROGUE CARDS</span><strong class="tt-type">'+esc(card.type.toUpperCase())+'</strong></header>';
 const label='<h2 class="tt-title"><span>'+esc(card.title)+'</span></h2>';
 let middle;
 if(layout==="room-split"){
   // Identical text is printed *beside* the room illustration instead of repeated below it.
   middle='<div class="tt-visual tt-visual--split">'+
    visual(card)+content(card,{sidebar:true})+stage+'</div>';
 }else{
   middle='<div class="tt-visual">'+visual(card)+stats(card)+stage+'</div>'+content(card);
 }
 return '<article class="tt-card tt-'+type+' tt-layout-'+layout+
  ' tt-plate-'+plate+(asset?' tt-has-art':' tt-needs-art')+
  '" data-plate="'+plate+'" data-type="'+type+'" data-id="'+esc(card.id)+'" data-layout="'+layout+
  '" data-art-status="'+(asset?'original':'placeholder')+
  '" aria-label="'+esc(card.title)+' card">'+
  front+label+middle+
  '<footer class="tt-footer"><i>'+esc(card.flavor||"")+'</i><span>No. '+
  String(index).padStart(2,"0")+'</span></footer></article>';
}
export function printSheets(cards=printDeck("all")){
 if(!Array.isArray(cards))throw new TypeError("Expected a physical card list");
 const pages=[];
 for(let i=0;i<cards.length;i+=CARDS_PER_SHEET){
  pages.push('<section class="tt-sheet" aria-label="Print sheet '+(pages.length+1)+'">'+cards.slice(i,i+CARDS_PER_SHEET).map(cardMarkup).join("")+'</section>');
 }
 return pages.join("");
}
