import {CATALOGUE,PRINT_DECK,catalogue,printDeck,EDITION,ITEM_FAMILIES} from "./tabletop-data.js";
import {cardMarkup,printSheets} from "./tabletop-view.js";
const mount=document.getElementById("tabletop-app");
const ink='<svg class="tt-print-filter-defs" width="0" height="0" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><filter id="tt-xerox-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncG type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncB type="discrete" tableValues="0 .025 .10 .92 1 1"/></feComponentTransfer></filter></defs></svg>';
const options=[
 ["all","All cards"],["hero","Heroes"],["room","Rooms"],["monster","Monsters"],
 ...ITEM_FAMILIES.map(k=>[k,k.charAt(0)+k.slice(1).toLowerCase()+(k==="POTION"?"s":"s")])
];
let category="all",region="all",copies=false;
const filtered=items=>items.filter(c=>
 (category==="all"||(category==="hero"||category==="room"||category==="monster"?c.type===category:c.v2?.kind===category)) &&
 (region==="all"||c.stage===region));
function show(){
 const cards=filtered(copies?PRINT_DECK:CATALOGUE);
 const total=filtered(PRINT_DECK).length;
 const regions=["all","UPPER","MIDDLE","DEEP","FINAL"];
 const hasRegions=["all","room","monster"].includes(category);
 mount.innerHTML=ink+
 '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS</div><div class="tt-sub">THE PHYSICAL DUNGEON CARD GAME · '+EDITION.toUpperCase()+'</div></div>'+
 '<nav class="tt-nav" aria-label="Main links"><a href="./rules.html">RULES (ONE A4)</a><a href="#cards">CARDS & PRINTING</a></nav></div>'+
 '<main class="tt-shell"><section class="rc-intro">'+
 '<h1>One dungeon. One deck. One rulebook.</h1>'+
 '<p>Descend through nine strange Rooms and the Amulet Vault. Fight by opposed d20 rolls, discover the results of d6 rolls printed on every card, negotiate with Monsters, and gamble with magic. A complete solo or cooperative tabletop game - no app required.</p>'+
 '<p class="rc-subline">8 HEROES · 36 REGIONAL ROOMS · 12 CREATURES · 2 WARDEN PHASES · 52 OBJECTS</p>'+
 '<div class="tt-links"><a href="./rules.html">READ / PRINT THE A4 RULES ↗</a><a href="#cards">BROWSE / PRINT THE CARDS ↗</a></div></section>'+
 '<div id="cards" class="tt-toolbar"><h2>ALL CARDS <small class="rc-count">'+cards.length+' shown · '+total+' printed copies</small></h2>'+
 '<div class="tt-toolbar-controls rc-controls">'+
 '<label for="deck-filter">TYPE <select id="deck-filter" aria-label="Card category">'+options.map(([value,label])=>'<option value="'+value+'"'+(value===category?' selected':'')+'>'+label+'</option>').join("")+'</select></label>'+
 (hasRegions?'<label for="region-filter">DEPTH <select id="region-filter" aria-label="Dungeon region">'+regions.map(v=>'<option value="'+v+'"'+(v===region?' selected':'')+'>'+v+'</option>').join("")+'</select></label>':'')+
 '<button id="mode-toggle" type="button" aria-pressed="'+copies+'">'+(copies?"PRINT QUANTITIES":"ONE OF EACH")+'</button>'+
 '<button id="print-kit" type="button">PRINT SELECTED CARDS ↗</button></div></div>'+
 '<p class="rc-note">Print on A4 at 100%, with background graphics; four 90 × 130 mm cards per sheet. Switch to PRINT QUANTITIES for the complete physical deck. Equipment, rolls and unusual effects are on the cards.</p>'+
 '<div class="tt-grid">'+cards.map(cardMarkup).join("")+'</div></main>'+
 '<footer class="tt-footerbar"><a href="./rules.html">THE ONE-PAGE RULEBOOK</a> · <a href="https://github.com/tpepels/rogue_cards">SOURCE</a></footer>'+
 '<div class="tt-print-only" aria-hidden="true">'+printSheets(cards)+'</div>';
 mount.querySelector("#deck-filter").addEventListener("change",e=>{category=e.target.value;region="all";show()});
 if(hasRegions)mount.querySelector("#region-filter").addEventListener("change",e=>{region=e.target.value;show()});
 mount.querySelector("#mode-toggle").addEventListener("click",()=>{copies=!copies;show()});
 mount.querySelector("#print-kit").addEventListener("click",()=>window.print());
}
show();
