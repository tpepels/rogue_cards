import {CATALOGUE,HEROES,MONSTERS,ROOMS,ITEMS,POTIONS,printDeck,EDITION,roomRegions} from "./tabletop-data.js";
import {cardMarkup,printSheets,esc} from "./tabletop-view.js";
const mount=document.getElementById("tabletop-app");
const keys=["hero","room","monster","item","potion"];
let selected="all",allCopies=true;
const preview=[HEROES[0],MONSTERS.find(x=>x.id==="eye"),ITEMS.find(x=>x.id==="key"),
 POTIONS[0],ROOMS.find(x=>x.id==="m-flood"),MONSTERS.find(x=>x.id==="wraith")];
function show(){
 const cards=allCopies?printDeck(selected):CATALOGUE.filter(c=>selected==="all"||c.type===selected);
 const physical=printDeck(selected);
 mount.innerHTML='<div class="tt-sitehead">'+
  '<div><div class="tt-brand">ROGUE CARDS</div><div class="tt-sub">TABLETOP EDITION · NO BROWSER GAME REQUIRED</div></div>'+
  '<nav class="tt-nav" aria-label="Main links"><a href="#cards">THE CARDS</a><a href="./rules.html">ONE A4 RULES</a><a href="./print-and-play.html">PRINT GUIDE</a></nav></div>'+
  '<main class="tt-shell">'+
  '<section class="tt-hero"><div class="tt-kicker">'+esc(EDITION)+' · 1–2 HEROES · d20 + d6</div>'+
  '<h1>The dungeon lives on the table.</h1>'+
  '<p>Reveal one Room at a time. Fight by opposed d20 rolls. Roll d6 for damage and for the monster’s behaviour, printed right on its card. Find the Amulet in the tenth Room. No map, no app, no hidden mechanics.</p>'+
  '<div class="tt-links"><a href="./rules.html">READ THE ONE-PAGE RULES ↗</a><a href="#cards">VIEW & PRINT THE CARDS ↗</a></div></section>'+
  '<div class="tt-info"><div><b>One A4 sheet</b><span>All shared rules, setup, combat, conditions and victory on one printable page.</span></div>'+
  '<div><b>Every effect on its card</b><span>Monster d6 behaviour, corpses, Room hazards, items, prayers, spells and curses.</span></div>'+
  '<div><b>90–120 minute target</b><span>A tabletop playtime goal, not a measured claim; printed cards are playable without this site.</span></div></div>'+
  '<div id="cards" class="tt-toolbar"><h2>THE PRINTABLE DECK <small>('+cards.length+' shown / '+physical.length+' physical copies)</small></h2>'+
  '<div class="tt-toolbar-controls">'+
  '<label for="deck-filter">TYPE <select id="deck-filter" aria-label="Card category"><option value="all">COMPLETE KIT</option>'+
  keys.map(x=>'<option value="'+x+'"'+(x===selected?' selected':'')+'>'+x.toUpperCase()+'</option>').join("")+
  '</select></label>'+
  '<button type="button" id="mode-toggle" aria-pressed="'+allCopies+'">'+(allCopies?"PRINT QUANTITIES":"ONE EACH")+'</button>'+
  '<button type="button" id="print-kit">PRINT THIS DECK ↗</button></div></div>'+
  '<div class="tt-grid">'+cards.map(cardMarkup).join("")+'</div>'+
  '<p class="tt-archive">Sort physical cards into three Room piles (UPPER, MIDDLE, DEEP) and three corresponding Monster piles. Reveal three Rooms per region, then face the fixed Amulet Vault. All other cards form the shuffled Item deck. Rules: one A4. The old browser simulation is retired from the active edition.</p>'+
  '</main><footer class="tt-footerbar">PHYSICAL-FIRST TABLETOP EDITION · <a href="./rules.html">CORE RULES</a> · <a href="https://github.com/tpepels/rogue_cards">SOURCE</a></footer>'+
  '<div class="tt-print-only" aria-hidden="true">'+printSheets(cards)+'</div>';
 const filter=mount.querySelector("#deck-filter");
 filter.value=selected;
 filter.addEventListener("change",e=>{selected=e.target.value;show();});
 mount.querySelector("#mode-toggle").addEventListener("click",()=>{allCopies=!allCopies;show();});
 mount.querySelector("#print-kit").addEventListener("click",()=>window.print());
}
show();
