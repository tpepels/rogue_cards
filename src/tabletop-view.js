import {CATALOGUE,CARD_WIDTH_MM,CARD_HEIGHT_MM,printDeck} from "./tabletop-data.js";
import {illustration} from "./art.js";
export {CARD_WIDTH_MM,CARD_HEIGHT_MM};
export const CARDS_PER_SHEET=4;
export const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function cardMarkup(card){
 if(!card||!card.type||!card.title||!card.art)throw new TypeError("Invalid tabletop card");
 const index=CATALOGUE.findIndex(c=>c.id===card.id&&c.type===card.type)+1;
 const stats=card.type==="hero"||card.type==="monster"
   ?'<div class="tt-stats">'+[
    ["HP",card.hp],["ATK","+"+card.atk],["DEF","+"+card.def],
    ...(card.type==="hero"?[["WIT","+"+card.wit]]:[])
    ].map(([name,value])=>'<div class="tt-stat"><b>'+esc(value)+'</b><small>'+esc(name)+'</small></div>').join("")+'</div>':"";
 const feature=card.type==="monster"?
   '<div class="tt-label">BEHAVIOUR · ROLL d6 AFTER EACH HERO ACTION</div>'+
   '<div class="tt-behaviours">'+card.behavior.map((line,i)=>
     '<div><b>'+["1–2","3–4","5","6"][i]+'</b><span>'+esc(line)+'</span></div>').join("")+'</div>'+
   '<p class="tt-corpse"><b>CORPSE — </b>'+esc(card.corpse)+'</p>'
   :'<p class="tt-rule">'+esc(card.rule)+'</p>';
 const stage=card.stage?'<span class="tt-stage">'+esc(card.stage)+'</span>':"";
 const mystery=card.mystery?'<div class="tt-identified">IDENTIFIED THIS RUN: ________</div>':"";
 return '<article class="tt-card tt-'+esc(card.type)+'" data-type="'+esc(card.type)+
   '" data-id="'+esc(card.id)+'" aria-label="'+esc(card.title)+' card">'+
   '<header class="tt-head"><span>ROGUE CARDS</span><strong>'+esc(card.type.toUpperCase())+'</strong></header>'+
   '<h2 class="tt-title">'+esc(card.title)+'</h2>'+
   '<div class="tt-visual">'+stats+'<div class="tt-illustration">'+illustration(card.art)+'</div>'+stage+'</div>'+
   '<div class="tt-content">'+feature+mystery+'</div>'+
   '<footer class="tt-footer"><i>'+esc(card.flavor||"")+'</i><span>No. '+String(index).padStart(2,"0")+'</span></footer>'+
   '</article>';
}
export function printSheets(cards=printDeck("all")){
 if(!Array.isArray(cards))throw new TypeError("Expected a physical card list");
 const pages=[];
 for(let i=0;i<cards.length;i+=CARDS_PER_SHEET){
  pages.push('<section class="tt-sheet" aria-label="Print sheet '+(pages.length+1)+'">'+cards.slice(i,i+CARDS_PER_SHEET).map(cardMarkup).join("")+'</section>');
 }
 return pages.join("");
}
