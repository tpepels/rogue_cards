// Printable appendix generated from the same authoritative preset selections as decks.html.
// Recipes never drift when a card is renamed or a physical copy count changes.
import {PRESETS,ALL_ROOMS,ALL_OBJECTS,ALL_MONSTERS,SELECTABLE,cardKey,selectionForPreset,selectionSummary} from "./decks.js";

const container=document.getElementById("deck-recipe-appendix");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const selected=(preset,c)=>selectionForPreset(preset.id).has(cardKey(c));
const selectedCards=(preset,cards)=>cards.filter(c=>selected(preset,c));
const li=(items,qty=false)=>'<ul class="deck-list deck-single">'+items.map(c=>'<li>'+esc(c.title)+(qty?' ×'+c.copies:'')+'</li>').join("")+'</ul>';
const group=(name,cards,qty=false)=>'<div class="deck-recipe"><h3>'+esc(name)+' · '+cards.length+'</h3>'+li(cards,qty)+'</div>';
const roomPanel=preset=>{
 const roomSets=["UPPER","MIDDLE","DEEP"].map(stage=>group(stage,selectedCards(preset,ALL_ROOMS.filter(c=>c.stage===stage))));
 const monsters=group("MONSTERS (sort by depth)",selectedCards(preset,ALL_MONSTERS),true);
 return '<div><h2>'+esc(preset.name)+'</h2><p class="deck-compact">'+esc(preset.description)+'</p>'+
 roomSets.join("")+monsters+'</div>';
};
const equipmentPanel=preset=>{
 const picked=selectedCards(preset,ALL_OBJECTS);
 const groups=[
  group("TOOLS & EQUIPMENT",picked.filter(c=>["TOOL","EQUIPMENT"].includes(c.v2.kind)),true),
  group("COMPANIONS & RELICS",picked.filter(c=>["COMPANION","RELIC"].includes(c.v2.kind)),true),
  group("SCROLLS, RINGS & WANDS",picked.filter(c=>["SCROLL","RING","WAND"].includes(c.v2.kind)),true),
  group("POTIONS",picked.filter(c=>c.type==="potion"),true)
 ];
 return '<div><h2>'+esc(preset.name)+'</h2>'+groups.join("")+'</div>';
};
const classic=PRESETS.find(x=>x.id==="classic"),strange=PRESETS.find(x=>x.id==="strange"),everything=PRESETS.find(x=>x.id==="chaos");
const count=selectionSummary(selectionForPreset(everything.id));
const pageNumber=(i,label)=>'<div class="page-number">ROGUE CARDS · '+label+' · '+i+' / 4</div>';
container.innerHTML='<main class="sheet deck-appendix" aria-label="Recommended dungeon Room and Monster deck lists">'+
 '<div class="mast"><h1>CHOOSE YOUR DUNGEON</h1><div class="edition">RECOMMENDED DECKS<br>ROOMS & MONSTERS</div></div>'+
 '<p class="deck-intro">Two starting sets appear below. Gather the listed Room cards and shuffle each depth separately. Gather the Monsters (keeping their printed quantities) and shuffle into UPPER, MIDDLE and DEEP piles. The matching Object lists continue on page 4. All cards are printable on <strong>cards.html</strong>.</p>'+
 '<div class="deck-columns">'+roomPanel(classic)+roomPanel(strange)+'</div>'+
 '<div class="deck-note"><strong>Everything Goes:</strong> play 12 non-Corridor Rooms per depth; Corridors add visits. A defeated regional Monster awards 1 Item; Parley does not. Use all '+count.counts.UPPER+' UPPER, '+count.counts.MIDDLE+' MIDDLE and '+count.counts.DEEP+' DEEP Rooms, all 24 Monster types and every Object (with printed copies). It uses every PACT and unusual card. Details on page 4.</div>'+
 pageNumber(3,"ROOM & MONSTER LISTS")+'</main>'+
 '<main class="sheet deck-appendix" aria-label="Object deck recipes and custom dungeon instructions">'+
 '<div class="mast"><h1>OBJECT DECKS</h1><div class="edition">RECOMMENDED DECKS<br>ITEMS & YOUR OWN MIX</div></div>'+
 '<p class="deck-intro">The quantities below are the number of physical copies to include. Keep chosen Heroes’ starter Items aside; shuffle the remaining listed Objects into one shared draw pile (including Potions).</p>'+
 '<div class="deck-columns">'+equipmentPanel(classic)+equipmentPanel(strange)+'</div>'+
 '<div class="deck-note"><strong>Everything Goes:</strong> use every Room, all regional Monsters and all '+ALL_OBJECTS.length+' Object designs, with their printed copies. Keep eight Hero cards, the Amulet Vault and both Warden phases available for every deck.</div>'+
 '<div class="deck-note"><strong>Build your own:</strong> choose any mix of cards at <strong>decks.html</strong>; minimum 3 Rooms and 1 Monster type per depth, enough Objects for starting equipment and healing, and MAGIC Items if you wish to attempt SEAL. Some rare named-card combinations may not occur. Printed card quantities stay as shown; no rule changes are needed.</div>'+
 pageNumber(4,"OBJECTS & CUSTOM SETUP")+'</main>';
