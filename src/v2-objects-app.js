import {V2_ITEMS,V2_POTIONS,V2_OBJECTS,V2_OBJECT_COPIES,V2_ITEM_FAMILIES,V2_OBJECTS_BY_FAMILY} from "./v2-objects.js";
import {cardMarkup,printSheets} from "./tabletop-view.js";
const mount=document.getElementById("v2-objects-app");
let selected="all",quantities=false;
const filter=cards=>selected==="all"?cards:selected==="POTION"?cards.filter(c=>c.type==="potion"):cards.filter(c=>c.v2.kind===selected);
const ink='<svg class="tt-print-filter-defs" width="0" height="0" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><filter id="tt-xerox-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncG type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncB type="discrete" tableValues="0 .025 .10 .92 1 1"/></feComponentTransfer></filter></defs></svg>';
function show(){
 const cards=filter(quantities?V2_OBJECT_COPIES:V2_OBJECTS);
 const physical=filter(V2_OBJECT_COPIES);
 const counts=[...V2_ITEM_FAMILIES,"POTION"].map(kind=>kind+" "+V2_OBJECTS_BY_FAMILY[kind].length).join(" · ");
 mount.innerHTML=ink+
  '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS <small>V2</small></div><div class="tt-sub">PHASE 2 · OBJECT EXPANSION · PLAYTEST PROTOTYPE</div></div>'+
  '<nav class="tt-nav" aria-label="V2 navigation"><a href="./">PLAYABLE V1 DECK</a><a href="./v2-rooms.html">36 V2 ROOMS</a><a href="./rules-v2.html">V2 RULES</a></nav></div>'+
  '<main class="tt-shell tt-v2-object-gallery"><section class="tt-hero"><div class="tt-kicker">44 UNIQUE ITEMS · 8 POTIONS · SCROLLS, RINGS AND WANDS</div>'+
  '<h1>Strange things in your pockets.</h1>'+
  '<p>Tools, cursed equipment, familiars, relics, scrolls, rings and wands. Every object has a clear printed action and, where appropriate, a d6 table. Magic can work, backfire, break, or reveal something unexpected.</p>'+
  '<div class="tt-links"><a href="./v2-rooms.html">36 CONNECTED ROOMS ↗</a><a href="./rules-v2.html">V2 ONE-A4 RULES ↗</a></div></section>'+
  '<div class="tt-v2-notice"><b>V2 DEVELOPMENT DECK — NOT A COMPLETE GAME YET.</b> V1 card counts and canonical play remain unchanged. Room and object interactions can be reviewed here, but the V2 Heroes and Monsters have not yet been migrated or balanced. This gallery reuses curated PNGs where available; all other artwork is a monochrome placeholder.</div>'+
  '<div class="tt-info"><div><b>Risk on the cards</b><span>d6 tables for unusual effects; simple reliable gear where rolling would add no decision.</span></div>'+
  '<div><b>Physical limits</b><span>Consumed Scrolls are discarded, Ring effects reset each Room, drained Wands lie sideways.</span></div>'+
  '<div><b>Interlocking dungeon</b><span>Named Room references, SHRINE recharge, curses, tools, bargain and alchemy tags.</span></div></div>'+
  '<div id="v2-objects" class="tt-toolbar"><h2>V2 ITEMS & POTIONS <small>('+cards.length+' cards / '+physical.length+' printable copies)</small></h2>'+
  '<div class="tt-toolbar-controls"><label for="v2-family">FAMILY <select id="v2-family" aria-label="V2 object family">'+
  '<option value="all">ALL OBJECTS</option>'+[...V2_ITEM_FAMILIES,"POTION"].map(kind=>
   '<option value="'+kind+'"'+(kind===selected?' selected':'')+'>'+kind+'</option>').join("")+
  '</select></label>'+
  '<button type="button" id="v2-quantity" aria-pressed="'+quantities+'">'+(quantities?"PRINT QUANTITIES":"ONE EACH")+'</button>'+
  '<button type="button" id="v2-print">PRINT THESE CARDS ↗</button></div></div>'+
  '<p class="tt-v2-object-count">'+counts+'</p>'+
  '<div class="tt-grid">'+cards.map(cardMarkup).join("")+'</div>'+
  '<p class="tt-archive">Print A4 portrait at 100% with background graphics: four 90 × 130 mm cards per page. This deck belongs to the V2 development rules and is not yet the complete gameplay print kit. For now, V1 remains the stable edition.</p>'+
  '</main><footer class="tt-footerbar">V2 OBJECT LAB · <a href="./v2-rooms.html">V2 ROOM LAB</a> · <a href="./">PLAYABLE V1</a></footer>'+
  '<div class="tt-print-only" aria-hidden="true">'+printSheets(cards)+'</div>';
 mount.querySelector("#v2-family").addEventListener("change",e=>{selected=e.target.value;show()});
 mount.querySelector("#v2-quantity").addEventListener("click",()=>{quantities=!quantities;show()});
 mount.querySelector("#v2-print").addEventListener("click",()=>window.print());
}
show();
