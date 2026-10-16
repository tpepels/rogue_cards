import {PRESETS,SELECTABLE,selectionGroups,FIXED_CARDS,cardKey,selectableByKey,selectionForPreset,selectionSummary,physicalDeck} from "./decks.js";
import {cardMarkup,printSheets,esc} from "./tabletop-view.js";
const mount=document.querySelector("#deck-builder");
const SAVE_KEY="rogue-cards-custom-paper-deck-v1";
const ink='<svg class="tt-print-filter-defs" width="0" height="0" aria-hidden="true"><defs><filter id="tt-xerox-ink" x="-2%" y="-2%" width="104%" height="104%"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncG type="discrete" tableValues="0 .025 .10 .92 1 1"/><feFuncB type="discrete" tableValues="0 .025 .10 .92 1 1"/></feComponentTransfer></filter></defs></svg>';
let current="strange";
let selection=selectionForPreset(current);
let openGroups=new Set(["UPPER","basic-items"]);
const available=new Set(SELECTABLE.map(cardKey));
const stored=()=>{
 try{return JSON.parse(localStorage.getItem(SAVE_KEY)||"null")}catch{return null}
};
function savedCustom(){
 const keys=stored();
 return Array.isArray(keys)?new Set(keys.filter(k=>available.has(k))):new Set(selection);
}
if(Array.isArray(stored())){current="custom";selection=savedCustom();}
const chosen=group=>group.cards.filter(card=>selection.has(cardKey(card)));
const count=stage=>selectionSummary(selection).counts[stage];
const cardLine=card=>{
 const c=cardKey(card),selected=selection.has(c);
 const summary=(card.printOnly?"NEW · ":"")+(card.v2?.kind||card.type)+(card.copies>1?" · "+card.copies+" copies":"");
 const pact=card.type==="room"&&card.v2?.choices.some(c=>c.label.includes("PACT"));
 return '<label class="db-card-option"><input type="checkbox" data-card="'+esc(c)+'" '+(selected?'checked':'')+'><span><strong>'+esc(card.title)+'</strong><small>'+esc(summary)+(pact?" · PACT":"")+'</small></span></label>';
};
function detail(group){
 const count=chosen(group).length;
 return '<details class="db-group" data-group="'+esc(group.id)+'" '+(openGroups.has(group.id)?"open":"")+'><summary><span>'+esc(group.label)+'</span><small>'+count+' / '+group.cards.length+' selected</small></summary>'+
 '<div class="db-group-actions"><button type="button" data-fill="'+esc(group.id)+'" data-mode="all">SELECT ALL</button><button type="button" data-fill="'+esc(group.id)+'" data-mode="none">CLEAR</button></div>'+
 '<div class="db-choices">'+group.cards.map(cardLine).join("")+'</div></details>';
}
function snapshot(){
 const rooms=["UPPER","MIDDLE","DEEP"].flatMap(stage=>selectionGroups.find(g=>g.id===stage).cards.filter(c=>selection.has(cardKey(c))&&c.printOnly).slice(0,2));
 const items=selectionGroups.find(g=>g.id==="basic-items").cards.filter(c=>selection.has(cardKey(c))&&c.printOnly).slice(0,3);
 const others=selectionGroups.find(g=>g.id==="other-items").cards.filter(c=>selection.has(cardKey(c))).slice(0,1);
 const cards=[...rooms,...items,...others];
 return cards.length?cards:SELECTABLE.filter(c=>selection.has(cardKey(c))).slice(0,9);
}
function updateOpen(){openGroups=new Set([...mount.querySelectorAll(".db-group[open]")].map(node=>node.dataset.group))}
function customize(){current="custom";try{localStorage.setItem(SAVE_KEY,JSON.stringify([...selection]))}catch{/* printing still works without browser storage */}}
function selectPreset(id){
 if(id==="custom")selection=savedCustom();
 else selection=selectionForPreset(id);
 current=id;
 render();
}
function render(){
 const report=selectionSummary(selection);
 const warnings=report.warnings.length?'<div class="db-warnings" role="status"><strong>Check this deck before printing</strong><ul>'+report.warnings.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul><p>Custom experiments are allowed even if they depart from the recommended setup.</p></div>':'<p class="db-valid">All required Room depths, Monster regions and Hero starters are present.</p>';
 const packs=PRESETS.map(p=>'<button type="button" class="db-preset '+(current===p.id?"is-active":"")+'" data-preset="'+esc(p.id)+'" aria-pressed="'+(current===p.id)+'"><span>'+esc(p.name)+'</span><small>'+esc(p.subtitle)+'</small><em>'+esc(p.description)+'</em></button>').join("");
 const note='<p class="db-note">Keep the eight Heroes, the Amulet Vault and both Warden phases in every set. Shuffle UPPER, MIDDLE and DEEP Rooms separately, plus their Monster piles and the chosen Object deck. Take your Heroes\' starting Items out before shuffling the Objects. In Everything Goes, visit 12 non-Corridor Rooms per depth; Corridors add extra visits. Each selected Item type prints in its intended physical quantity.</p>';
 mount.innerHTML=ink+
 '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS</div><div class="tt-sub">BUILD YOUR OWN DUNGEON · PHYSICAL CARDS</div></div><nav class="tt-nav"><a href="./cards.html">PRINT ALL CARDS</a><a href="./rules.html">HOW TO PLAY</a><a href="./tutorial.html">TUTORIAL</a></nav></div>'+
 '<main class="tt-shell db-shell"><section class="db-intro"><div class="tt-kicker">THREE SUGGESTED DUNGEONS · OR YOUR OWN</div><h1>The dungeon is yours to build.</h1><p>For a straightforward crawl, choose Classic. For strange decisions and occasional bargains, choose Strange Paths. Or use everything. Any preset can be changed card by card; the original unusual cards are never removed.</p></section>'+
 '<section class="db-presets" aria-label="Recommended dungeon decks">'+packs+'</section>'+
 '<section class="db-workbench" aria-label="Custom dungeon deck"><div class="db-workbench-heading"><div><h2>YOUR DUNGEON</h2><p>Choose a preset, then tick or untick any Room, Monster or Object. Your changes become a custom deck.</p></div><label class="db-which">DECK <select id="db-preset-select" aria-label="Recommended deck">'+PRESETS.map(p=>'<option value="'+p.id+'" '+(current===p.id?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'<option value="custom" '+(current==="custom"?"selected":"")+'>Custom selection</option></select></label></div>'+
 '<div class="db-numbers"><div><b>'+report.counts.UPPER+' / '+report.counts.MIDDLE+' / '+report.counts.DEEP+'</b><span>ROOMS BY DEPTH</span></div><div><b>'+report.monsters.UPPER+' / '+report.monsters.MIDDLE+' / '+report.monsters.DEEP+'</b><span>MONSTER TYPES</span></div><div><b>'+report.objects+'</b><span>OBJECT TYPES</span></div><div><b>'+report.pacts+'</b><span>PACT ROOMS</span></div><div><b>'+report.copies+'</b><span>PHYSICAL CARDS</span></div></div>'+
 warnings+note+
 '<div class="db-actions"><button id="db-print" type="button" class="db-primary">PRINT THIS DECK</button><button id="db-copy" type="button">COPY DECK LIST</button><span id="db-copy-status" aria-live="polite"></span></div>'+
 '<div class="db-groups">'+selectionGroups.map(detail).join("")+'</div></section>'+
 '<section class="db-preview"><h2>A FEW CARDS FROM THIS DECK</h2><p>A representative preview. Printing includes <strong>every selected card</strong> and its intended copies, not just these examples. New ordinary cards are deliberately blank until their own illustrations have been generated.</p><div class="tt-grid">'+snapshot().map(cardMarkup).join("")+'</div></section></main>'+
 '<div class="tt-print-only" aria-hidden="true">'+printSheets(physicalDeck(selection))+'</div>'+
 '<footer class="tt-footerbar"><a href="./index.html">CARD CATALOGUE</a> · <a href="./rules.html">THE RULEBOOK</a> · <a href="https://github.com/tpepels/rogue_cards">SOURCE</a></footer>';
 mount.querySelectorAll("[data-preset]").forEach(b=>b.addEventListener("click",()=>selectPreset(b.dataset.preset)));
 mount.querySelector("#db-preset-select").addEventListener("change",e=>selectPreset(e.target.value));
 mount.querySelectorAll("[data-card]").forEach(input=>input.addEventListener("change",e=>{
  updateOpen();const scrollY=window.scrollY;const key=e.target.dataset.card;
  if(e.target.checked)selection.add(key);else selection.delete(key);
  customize();render();window.scrollTo(0,scrollY);
 }));
 mount.querySelectorAll("[data-fill]").forEach(button=>button.addEventListener("click",()=>{
  updateOpen();const scrollY=window.scrollY;const group=selectionGroups.find(g=>g.id===button.dataset.fill);
  for(const c of group.cards){const key=cardKey(c);if(button.dataset.mode==="all")selection.add(key);else selection.delete(key)}
  customize();render();window.scrollTo(0,scrollY);
 }));
 mount.querySelectorAll("details.db-group").forEach(d=>d.addEventListener("toggle",()=>{if(d.open)openGroups.add(d.dataset.group);else openGroups.delete(d.dataset.group)}));
 mount.querySelector("#db-print").addEventListener("click",()=>window.print());
 mount.querySelector("#db-copy").addEventListener("click",async()=>{
  const names=SELECTABLE.filter(c=>selection.has(cardKey(c)));
  const text=["Rogue Cards deck - "+(PRESETS.find(p=>p.id===current)?.name||"Custom"),"8 Heroes, Vault and both Warden phases are always included.",
   ...["UPPER","MIDDLE","DEEP"].map(stage=>stage+" Rooms: "+names.filter(c=>c.type==="room"&&c.stage===stage).map(c=>c.title).join(", ")),
   "Monsters: "+names.filter(c=>c.type==="monster").map(c=>c.title).join(", "),
   "Objects: "+names.filter(c=>["item","potion"].includes(c.type)).map(c=>c.title+" x"+c.copies).join(", ")].join("\n");
  try{await navigator.clipboard.writeText(text);mount.querySelector("#db-copy-status").textContent="Deck list copied."}
  catch{mount.querySelector("#db-copy-status").textContent="Clipboard unavailable. Select and copy the card names from the lists below."}
 });
}
render();
