import {FIXED_CARDS,SELECTABLE,ALL_ROOMS,ALL_MONSTERS,ALL_OBJECTS} from "./decks.js";
import {cardMarkup,printSheets,esc} from "./tabletop-view.js";
const mount=document.getElementById("all-cards")||document.getElementById("tabletop-app");
const home=mount?.id==="tabletop-app";
const CATALOGUE=Object.freeze([...FIXED_CARDS,...SELECTABLE]);
const ink='<svg class="tt-print-filter-defs" width="0" height="0" aria-hidden="true"><defs><filter id="tt-xerox-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncG type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncB type="discrete" tableValues="0 .025 .10 .92 1 1"/></feComponentTransfer></filter></defs></svg>';
const options=[
 ["all","All cards"],["hero","Heroes"],["room","Rooms"],["monster","Monsters"],
 ["TOOL","Tools"],["EQUIPMENT","Weapons & Armour"],["COMPANION","Companions"],
 ["RELIC","Relics"],["SCROLL","Scrolls"],["RING","Rings"],["WAND","Wands"],["POTION","Potions"],
 ["expansion","54 expansion cards"]
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
 '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS</div><div class="tt-sub">COMPLETE PHYSICAL EDITION · '+CATALOGUE.length+' CARD DESIGNS</div></div>'+
 '<nav class="tt-nav" aria-label="Main links"><a href="./index.html">HOME</a><a href="./tutorial.html">LEARN TO PLAY</a><a href="./rules.html">RULES</a><a href="./decks.html">BUILD YOUR DECK</a><a href="./cards.html">ALL CARDS</a><a href="./layout-editor.html">LAYOUT EDITOR</a></nav></div>'+
 '<main class="tt-shell"><section class="rc-intro"><h1>'+(home?"Many dungeons. One rulebook.":"Every card, ready to print.")+'</h1>'+
 (home?'<p>Play solo or with two Heroes. Choose a Room, resolve its printed effects and fight Monsters with a d20 + ATK against their fixed AC (12 + DEF). Descend through three depths to claim the Amulet. No app is needed once the cards are printed.</p>':
 '<p>Browse and print the complete library of '+CATALOGUE.length+' card designs. Every printable Hero, Room, Monster, Item, Potion and Warden phase is included.</p>')+
 '<p class="rc-subline">'+FIXED_CARDS.filter(c=>c.type==="hero").length+' HEROES · '+ALL_ROOMS.length+' REGIONAL ROOMS + VAULT · '+ALL_MONSTERS.length+' REGIONAL MONSTERS + 2 WARDEN PHASES · '+ALL_OBJECTS.length+' OBJECTS</p>'+
 '<div class="tt-links"><a href="./decks.html">CHOOSE YOUR DUNGEON DECK ↗</a><a href="./tutorial.html">LEARN TO PLAY WITH THE CARDS ↗</a><a href="./rules.html">READ / PRINT THE RULEBOOK ↗</a><a href="./cards.html">PRINT ALL '+CATALOGUE.length+' CARD DESIGNS ↗</a></div></section>'+
 '<div id="cards" class="tt-toolbar"><h2>ALL '+CATALOGUE.length+' CARD DESIGNS <small class="rc-count">'+choices.length+' shown · '+printed.length+' printable cards</small></h2>'+
 '<div class="tt-toolbar-controls rc-controls">'+
 '<label for="card-category">TYPE <select id="card-category" aria-label="Card category">'+options.map(([key,name])=>'<option value="'+key+'"'+(key===category?" selected":"")+'>'+name+'</option>').join("")+'</select></label>'+
 (regionsAvailable?'<label for="card-region">DEPTH <select id="card-region" aria-label="Dungeon depth">'+regions.map(key=>'<option value="'+key+'"'+(key===region?" selected":"")+'>'+key+'</option>').join("")+'</select></label>':"")+
 '<button id="card-quantities" type="button" aria-pressed="'+copies+'">'+(copies?"FULL PRINT QUANTITIES":"ONE OF EACH")+'</button>'+
 '<button id="card-print" type="button">PRINT SHOWN CARDS</button>'+
 '<button id="card-print-all" type="button">PRINT ALL COPIES</button></div></div>'+
 '<p class="rc-note">A4 · 100% scale · background graphics ON · 4 cards per sheet at 90 × 130 mm. PRINT SHOWN CARDS respects your filters; PRINT ALL COPIES prints the entire '+CATALOGUE.length+'-design collection in its physical quantities, including duplicate copies. For one playable dungeon rather than the entire library, use BUILD YOUR DECK. Every design has its own illustration.</p>'+
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
