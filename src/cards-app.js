import {FIXED_CARDS,SELECTABLE,ALL_ROOMS,ALL_OBJECTS} from "./decks.js";
import {cardMarkup,printSheets,esc} from "./tabletop-view.js";
const mount=document.getElementById("all-cards");
const CATALOGUE=Object.freeze([...FIXED_CARDS,...SELECTABLE]);
const ink='<svg class="tt-print-filter-defs" width="0" height="0" aria-hidden="true"><defs><filter id="tt-xerox-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncG type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncB type="discrete" tableValues="0 .025 .10 .92 1 1"/></feComponentTransfer></filter></defs></svg>';
const options=[
 ["all","All cards"],["hero","Heroes"],["room","Rooms"],["monster","Monsters"],
 ["TOOL","Tools"],["EQUIPMENT","Weapons & Armour"],["COMPANION","Companions"],
 ["RELIC","Relics"],["SCROLL","Scrolls"],["RING","Rings"],["WAND","Wands"],["POTION","Potions"],
 ["expansion","24 new cards"]
];
let category="all",region="all",copies=false;
const isCategory=c=>category==="all"||
 (category==="expansion"?Boolean(c.printOnly):
 ["hero","room","monster"].includes(category)?c.type===category:c.v2?.kind===category);
const visible=()=>CATALOGUE.filter(c=>isCategory(c)&&(region==="all"||c.stage===region));
const expanded=cards=>cards.flatMap(c=>Array.from({length:copies?c.copies:1},()=>c));
function render(){
 const choices=visible(),printed=expanded(choices);
 const regions=["all","UPPER","MIDDLE","DEEP","FINAL"];
 const regionsAvailable=["all","room","monster","expansion"].includes(category);
 mount.innerHTML=ink+
 '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS</div><div class="tt-sub">COMPLETE PRINT CATALOGUE · '+CATALOGUE.length+' DESIGNS</div></div>'+
 '<nav class="tt-nav" aria-label="Main links"><a href="./index.html">HOME</a><a href="./rules.html">RULES & DECK RECIPES</a><a href="./decks.html">BUILD YOUR DECK</a><a href="./layout-editor.html">LAYOUT EDITOR</a></nav></div>'+
 '<main class="tt-shell"><section class="rc-intro"><h1>Every card, ready to print.</h1>'+
 '<p>All '+CATALOGUE.length+' printable designs, including '+ALL_ROOMS.length+' regional Rooms, '+ALL_OBJECTS.length+' Objects and the original Heroes, Monsters and Warden. No card is hidden inside a deck preset.</p>'+
 '<p class="rc-subline">24 NEW ORDINARY DUNGEON CARDS · ORIGINAL UNUSUAL CARDS PRESERVED</p>'+
 '<div class="tt-links"><a href="./rules.html">RULES & THREE RECOMMENDED DECKS ↗</a><a href="./decks.html">ASSEMBLE A CUSTOM DECK ↗</a></div></section>'+
 '<div id="cards" class="tt-toolbar"><h2>ALL PRINTABLE CARDS <small class="rc-count">'+choices.length+' designs · '+printed.length+' sheets-ready cards</small></h2>'+
 '<div class="tt-toolbar-controls rc-controls">'+
 '<label for="card-category">TYPE <select id="card-category" aria-label="Card category">'+options.map(([key,name])=>'<option value="'+key+'"'+(key===category?" selected":"")+'>'+name+'</option>').join("")+'</select></label>'+
 (regionsAvailable?'<label for="card-region">DEPTH <select id="card-region" aria-label="Dungeon depth">'+regions.map(key=>'<option value="'+key+'"'+(key===region?" selected":"")+'>'+key+'</option>').join("")+'</select></label>':"")+
 '<button id="card-quantities" type="button" aria-pressed="'+copies+'">'+(copies?"FULL PRINT QUANTITIES":"ONE OF EACH")+'</button>'+
 '<button id="card-print" type="button">PRINT SHOWN CARDS</button>'+
 '<button id="card-print-all" type="button">PRINT ALL COPIES</button></div></div>'+
 '<p class="rc-note">A4 · 100% scale · background graphics ON · 4 cards per sheet at 90 × 130 mm. PRINT SHOWN CARDS respects your filters; PRINT ALL COPIES prints the entire '+CATALOGUE.length+'-design collection at physical quantities. This is the complete card library, not a recommended deck. See the rules appendix for deck recipes. The 24 new cards currently reuse existing illustrations.</p>'+
 '<div class="tt-grid">'+choices.map(cardMarkup).join("")+'</div></main>'+
 '<footer class="tt-footerbar"><a href="./rules.html">THE RULES</a> · <a href="./decks.html">DECK BUILDER</a> · <a href="https://github.com/tpepels/rogue_cards">SOURCE</a></footer>'+
 '<div class="tt-print-only" aria-hidden="true">'+printSheets(printed)+'</div>';
 mount.querySelector("#card-category").addEventListener("change",e=>{category=e.target.value;region="all";render()});
 if(regionsAvailable)mount.querySelector("#card-region").addEventListener("change",e=>{region=e.target.value;render()});
 mount.querySelector("#card-quantities").addEventListener("click",()=>{copies=!copies;render()});
 mount.querySelector("#card-print").addEventListener("click",()=>window.print());
 mount.querySelector("#card-print-all").addEventListener("click",()=>{
  category="all";region="all";copies=true;render();window.print();
 });
}
render();
