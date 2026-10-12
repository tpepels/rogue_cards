import {V2_ROOMS,V2_ROOMS_BY_REGION,V2_REGIONS} from "./v2-rooms.js";
import {cardMarkup,printSheets,esc} from "./tabletop-view.js";
const mount=document.getElementById("v2-rooms-app");
let selected="all";
const filterRooms=()=>selected==="all"?V2_ROOMS:V2_ROOMS_BY_REGION[selected];
const filterSvg='<svg class="tt-print-filter-defs" width="0" height="0" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><filter id="tt-xerox-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncG type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncB type="discrete" tableValues="0 .025 .10 .92 1 1"/></feComponentTransfer></filter></defs></svg>';
function show(){
 const rooms=filterRooms();
 const kinds=[...new Set(rooms.map(c=>c.v2.kind))];
 mount.innerHTML=filterSvg+
  '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS <small>V2</small></div><div class="tt-sub">PHASE 1 · ROOM EXPANSION · PRINTABLE DESIGN DRAFT</div></div>'+
  '<nav class="tt-nav" aria-label="V2 site links"><a href="./">PLAYABLE V1 DECK</a><a href="./v2-objects.html">V2 ITEMS</a><a href="./v2-monsters.html">V2 MONSTERS</a><a href="./rules-v2.html">V2 RULES</a><a href="#v2-cards">V2 ROOMS</a></nav></div>'+
  '<main class="tt-shell tt-v2-hub"><section class="tt-hero"><div class="tt-kicker">36 UNIQUE ROOMS · 12 PER REGION · d6 ON EACH CARD</div>'+
  '<h1>Thirty-six ways to get lost.</h1>'+
  '<p>Every Room offers a choice, with the consequence of its risky action printed as d6 ranges on the card. Encounter dangerous objects, bargains, shrines, peculiar NPCs, monsters and unpredictable treasure. Roll and see what happens.</p>'+
  '<div class="tt-links"><a href="./rules-v2.html">READ THE V2 PLAYTEST RULES ↗</a><a href="#v2-cards">EXPLORE THE ROOM CARDS ↗</a><a href="./v2-objects.html">VIEW V2 ITEMS ↗</a></div></section>'+
  '<div class="tt-v2-notice"><b>V2 DEVELOPMENT DECK, NOT YET THE FULL GAME.</b> The current V1 game and print quantities are unchanged. Phase 2 Items and Potions now have their own printable prototype; V2 Heroes, Monsters and full-deck balance are not yet migrated. Existing original illustrations are reused where mapped, while new faces use monochrome placeholders until dedicated art is assigned.</div>'+
  '<div class="tt-info"><div><b>36 Room designs</b><span>12 Upper, 12 Middle and 12 Deep. The Vault remains the final, fixed tenth Room.</span></div>'+
  '<div><b>Choices before dice</b><span>Risk a roll or choose a different cost or reward. Every result is on the physical card.</span></div>'+
  '<div><b>Objects interact</b><span>Key, Rope, Torch, cursed gear, companions and more matter in specific Rooms.</span></div></div>'+
  '<div id="v2-cards" class="tt-toolbar"><h2>PHASE 1 ROOMS <small>('+rooms.length+' designs)</small></h2>'+
  '<div class="tt-toolbar-controls"><label for="v2-region">REGION <select id="v2-region" aria-label="V2 Room region">'+
  '<option value="all">ALL ROOMS</option>'+
  V2_REGIONS.map(x=>'<option value="'+x+'"'+(x===selected?' selected':'')+'>'+x+'</option>').join("")+
  '</select></label><button type="button" id="v2-print">PRINT SELECTED ROOMS ↗</button></div></div>'+
  '<p class="tt-v2-tally">'+kinds.map(kind=>'<strong>'+esc(kind)+'</strong> · '+rooms.filter(c=>c.v2.kind===kind).length).join(' &nbsp; / &nbsp; ')+'</p>'+
  '<div class="tt-grid">'+rooms.map(cardMarkup).join("")+'</div>'+
  '<p class="tt-archive">Print at 100%, A4 portrait with background graphics, four 90 × 130 mm cards per page. Shuffle each regional Room pile separately and reveal three of each in order. V2 Items and Potions are available in the separate V2 Object Lab. The final Vault and Monsters still come from the existing playable V1 deck; the combined V2 edition is not yet fully migrated.</p>'+
  '</main><footer class="tt-footerbar">V2 ROOM LAB · <a href="./">CURRENT PLAYABLE CARDS</a> · <a href="./rules-v2.html">V2 DRAFT RULES</a></footer>'+
  '<div class="tt-print-only" aria-hidden="true">'+printSheets(rooms)+'</div>';
 mount.querySelector("#v2-region").addEventListener("change",event=>{selected=event.target.value;show()});
 mount.querySelector("#v2-print").addEventListener("click",()=>window.print());
}
show();
