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
 "hero:warrior":"cave_delver.png",
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

/** The one physical edition uses one renderer per card family. */
export function composition(card){
 if(!card?.v2)throw new TypeError("Unknown canonical card");
 const layout={hero:"v2-hero",room:"v2-room",monster:"v2-monster",item:"v2-object",potion:"v2-object"}[card.type];
 if(!layout)throw new TypeError("Unknown card type: "+card.type);
 return layout;
}
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
 if(card.type==="hero"&&card.v2){
  const v=card.v2;
  return '<section class="tt-content tt-content--v2-hero" aria-label="Hero ability and starting equipment">'+
   '<div class="tt-v2-hero-start">START WITH: '+esc(v.starter.toUpperCase())+' + 1 RANDOM OBJECT</div>'+
   '<p class="tt-v2-hero-trigger">'+esc(v.trigger)+'</p>'+
   '<div class="tt-v2-results">'+v.roll.outcomes.map(o=>
    '<div class="tt-v2-result"><b>'+esc(o.range)+'</b><span>'+esc(o.effect)+'</span></div>').join("")+'</div></section>';
 }
 if(card.type==="monster"&&card.v2){
  const v=card.v2;
  return '<section class="tt-content tt-content--v2-monster" aria-label="Monster dice, weakness and bargain">'+
   '<div class="tt-v2-monster-head">'+(v.phase?'PHASE '+(v.phase===1?'I':'II')+' · ':'')+'BEHAVIOUR · ROLL d6 AFTER EACH HERO TURN</div>'+
   '<div class="tt-v2-monster-rows">'+card.behavior.map((effect,i)=>
     '<div class="tt-v2-result"><b>'+["1–2","3–4","5","6"][i]+'</b><span>'+esc(effect)+'</span></div>').join("")+'</div>'+
   '<p class="tt-v2-monster-rule"><b>WEAKNESS — </b>'+esc(v.weakness)+'</p>'+
   '<p class="tt-v2-monster-rule"><b>PARLEY — </b>'+esc(v.parley)+'</p>'+
   '<p class="tt-v2-monster-remains"><b>REMAINS — </b>'+esc(v.remains)+'</p></section>';
 }
 if(card.v2&&(card.type==="item"||card.type==="potion")){
  const v=card.v2;
  const tags=v.tags.map(tag=>'<span class="tt-v2-tag">'+esc(tag)+'</span>').join("");
  const dice=v.roll
   ?'<div class="tt-v2-roll-heading">ROLL d6</div>'+
    '<div class="tt-v2-results">'+v.roll.outcomes.map(row=>
      '<div class="tt-v2-result"><b>'+esc(row.range)+'</b><span>'+esc(row.effect)+'</span></div>').join("")+'</div>'
   :"";
  return '<section class="tt-content tt-content--v2 tt-content--v2-object" aria-label="Item effects and roll ranges">'+
   '<div class="tt-v2-kind">'+esc(v.kind)+' <span class="tt-v2-tags">'+tags+'</span></div>'+
   '<p class="tt-v2-trigger">'+esc(v.trigger)+'</p>'+
   dice+(v.alternative?'<div class="tt-v2-alternative">'+esc(v.alternative)+'</div>':"")+
   (card.type==="potion"?'<div class="tt-v2-identity">IDENTIFY: keep one spent copy face up.</div>':"")+
   '</section>';
 }
 if(card.v2&&card.type==="room"){
  const v=card.v2;
  const choices=v.choices.map(choice=>'<div class="tt-v2-choice"><b>'+esc(choice.label)+'</b><span>'+esc(choice.effect)+'</span></div>').join("");
  const results=v.roll.outcomes.map(outcome=>'<div class="tt-v2-result"><b>'+esc(outcome.range)+'</b><span>'+esc(outcome.effect)+'</span></div>').join("");
  return '<section class="tt-content tt-content--v2" aria-label="Room choices and d6 results">'+
   '<div class="tt-v2-kind">'+esc(v.kind)+' <span>CHOOSE ONE</span></div>'+
   '<p class="tt-v2-prompt">'+esc(v.prompt)+'</p>'+
   '<div class="tt-v2-choices">'+choices+'</div>'+
   '<div class="tt-v2-roll-heading">'+esc(v.roll.label)+' · ROLL '+esc(v.roll.die)+'</div>'+
   '<div class="tt-v2-results">'+results+'</div></section>';
 }
 throw new TypeError("No canonical card effects: "+card.type);
}
export function cardMarkup(card){
 if(!card||!card.type||!card.title||!card.art)throw new TypeError("Invalid tabletop card");
 const index=card.v2?.number??(CATALOGUE.findIndex(c=>c.id===card.id&&c.type===card.type)+1);
 const type=esc(card.type), layout=composition(card),asset=assetPath(card),plate=printPlate(card);
 const stage=card.stage?'<span class="tt-stage">'+esc(card.stage)+'</span>':"";
 const label='<h2 class="tt-title"><span>'+esc(card.title)+'</span></h2>';
 let middle;
 // The print plate and paste-on rule paper share one overlapping collage plane.
 // Neither is a browser background: the art is a genuine illustrated card layer.
 middle='<div class="tt-collage" aria-label="Illustration with pasted game instructions">'+
   '<div class="tt-visual">'+visual(card)+stats(card)+stage+'</div>'+
   content(card)+'</div>';
 return '<article class="tt-card tt-'+type+' tt-layout-'+layout+
  ' tt-plate-'+plate+(asset?' tt-has-art':' tt-needs-art')+
  '" data-v2-kind="'+esc(card.v2?.kind||"")+'" data-assembly="collage" data-plate="'+plate+'" data-type="'+type+'" data-id="'+esc(card.id)+'" data-layout="'+layout+
  '" data-art-status="'+(asset?'original':'placeholder')+
  '" aria-label="'+esc(card.title)+' card">'+
  label+middle+
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
