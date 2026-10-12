import {V2_MONSTERS} from "./v2-monsters.js";
import {cardMarkup,printSheets} from "./tabletop-view.js";
const mount=document.getElementById("v2-monsters-app");
const filterSvg='<svg class="tt-print-filter-defs" width="0" height="0" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><filter id="tt-xerox-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncG type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncB type="discrete" tableValues="0 .025 .10 .92 1 1"/></feComponentTransfer></filter></defs></svg>';
let region="all";
function show(){
 const cards=region==="all"?V2_MONSTERS:V2_MONSTERS.filter(m=>m.stage===region);
 mount.innerHTML=filterSvg+
 '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS <small>V2</small></div><div class="tt-sub">PHASE 3 · MONSTER ECOLOGY PROTOTYPE</div></div><nav class="tt-nav" aria-label="V2 navigation"><a href="./">PLAYABLE V1</a><a href="./v2-rooms.html">ROOMS</a><a href="./v2-objects.html">ITEMS</a><a href="./rules-v2.html">V2 RULES</a></nav></div>'+
 '<main class="tt-shell tt-v2-object-gallery"><section class="tt-hero"><div class="tt-kicker">12 MONSTERS · 4 BEHAVIOUR BANDS · WEAKNESSES · PARLEY</div>'+
 '<h1>Know what hunts you.</h1><p>Every Monster still rolls its own d6 behaviour after each Hero turn. Equipment, magic and companions can change that roll. Monster weaknesses, bargains and edible remains live directly on their cards.</p><div class="tt-links"><a href="./v2-objects.html">EXPLORE ITEMS ↗</a><a href="./v2-rooms.html">EXPLORE ROOMS ↗</a></div></section>'+
 '<div class="tt-v2-notice"><b>V2 DEVELOPMENT PROTOTYPE.</b> These twelve cards are independent designs based on V1 creature stats. The existing V1 game remains unchanged. V2 Heroes, Warden, overall balance and all final playtests are still outstanding.</div>'+
 '<div class="tt-toolbar" id="v2-monsters"><h2>V2 MONSTERS <small>('+cards.length+' designs)</small></h2><div class="tt-toolbar-controls"><label for="v2-monster-region">REGION <select id="v2-monster-region" aria-label="V2 Monster region"><option value="all">ALL MONSTERS</option>'+["UPPER","MIDDLE","DEEP"].map(r=>'<option value="'+r+'"'+(region===r?' selected':'')+'>'+r+'</option>').join("")+'</select></label><button type="button" id="v2-monsters-print">PRINT SELECTED ↗</button></div></div>'+
 '<div class="tt-grid">'+cards.map(cardMarkup).join("")+'</div><p class="tt-archive">Print A4 portrait at 100%, with background graphics. Four 90 × 130 mm cards per A4. These are V2 prototype designs and do not replace V1.</p></main>'+
 '<footer class="tt-footerbar">V2 MONSTER LAB · <a href="./v2-objects.html">ITEMS</a> · <a href="./">V1</a></footer>'+
 '<div class="tt-print-only" aria-hidden="true">'+printSheets(cards)+'</div>';
 mount.querySelector("#v2-monster-region").addEventListener("change",event=>{region=event.target.value;show()});
 mount.querySelector("#v2-monsters-print").addEventListener("click",()=>window.print());
}
show();
