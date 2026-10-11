import { HEROES, CATALOGUE, TYPES, EFFECTS, APPEARANCES } from "./data.js";
import { illustration } from "./art.js";
import { startRun, act, currentRoom, currentMonster, availableActions, validateSave, LAST_FLOOR, itemTitle } from "./engine.js";

const app = document.querySelector("#app");
const SAVE_KEY = "rogue-cards-v1";
let view = "play";
let filter = "all";
let state = restore();
let choosing = !state;
const heroById = id => HEROES.find(c => c.id === id);
const byId = (arr,id) => arr.find(c => c.id===id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function restore() {
  try { const value=JSON.parse(localStorage.getItem(SAVE_KEY)); return validateSave(value) ? value : null; }
  catch { return null; }
}
function save() { try { localStorage.setItem(SAVE_KEY,JSON.stringify(state)); } catch { /* storage optional */ } }
function labelFor(card) { return card.type.toUpperCase(); }
function cardMarkup(card, opts={}) {
  const stats = card.type === "hero" || card.type === "monster" ?
    '<div class="game-card__stats"><span><b>'+card.hp+'</b> HP</span><span><b>'+card.attack+'</b> ATK</span><span><b>'+card.defense+'</b> DEF</span></div>' : '';
  const tag = card.terrain ? '<span class="game-card__tag">'+esc(card.terrain)+'</span>' : '';
  const body = card.type === "potion" && opts.effect
    ? 'IDENTIFIED: '+esc(opts.effect.name.toUpperCase())+'<br>'+esc(opts.effect.drink)
    : esc(card.rule || "");
  return '<article class="game-card game-card--'+esc(card.type)+'" aria-label="'+esc(card.title)+' card">'+
   '<div class="game-card__meta"><span>RC / '+labelFor(card)+'</span><span>NO. '+esc(card.number ?? String(CATALOGUE.indexOf(card)+1).padStart(2,"0"))+'</span></div>'+
   '<h3 class="game-card__title">'+esc(card.title)+'</h3>'+
   '<div class="game-card__picture">'+illustration(card.art)+'<span class="picture-index">'+esc(card.type==='monster'?'!':card.type==='room'?'#':card.type==='potion'?'?':'*')+'</span></div>'+
   stats + tag +
   '<div class="game-card__rule">'+body+'</div>'+
   '<div class="game-card__flavor">“'+esc(card.flavor || 'Here lies trouble.')+'”</div>'+
   '</article>';
}
function sectionHeading(eyebrow,title,deck) { return '<div class="section-heading"><div><span class="eyebrow">'+eyebrow+'</span><h1>'+title+'</h1></div><p>'+deck+'</p></div>'; }
function heroSelect() {
  return sectionHeading("01 / PREPARE TO DIE", "CHOOSE YOUR BAD IDEA", "Four adventurers. One dungeon. No second chances. Select a card to begin a run.")+
   '<section class="hero-grid" aria-label="Choose a hero">'+HEROES.map(hero =>
     '<button class="hero-choice" type="button" data-hero="'+hero.id+'" aria-label="Start as '+esc(hero.title)+'">'+cardMarkup(hero)+'</button>'
   ).join("")+'</section>'+
   '<p class="fine-print">The dungeon is randomly generated. A new run reshuffles what every potion does. Nothing is uploaded to a server.</p>';
}
function meter(name,value,max,suffix="") {
  const fraction=Math.max(0,Math.min(100,Math.round(value/max*100)));
  return '<div class="meter"><div class="meter__labels"><span>'+name+'</span><strong>'+esc(value)+suffix+'</strong></div><div class="meter__bar"><i style="width:'+fraction+'%"></i></div></div>';
}
function itemCatalogue(item) {
  return item.kind==='potion' ? byId(APPEARANCES,item.id) : byId(CATALOGUE,item.id);
}
function runView() {
  if (!state || choosing) return heroSelect();
  const s=state, room=currentRoom(s), enemy=currentMonster(s), hero=heroById(s.heroId);
  const terminal=s.phase==='won'||s.phase==='dead';
  const steps=Array.from({length:LAST_FLOOR+1},(_,floor)=>{
    const here = s.position===floor, explored = floor<s.rooms.length;
    return '<span class="depth__room '+(here?'depth__room--here ':'')+(explored?'depth__room--seen':'')+'" title="'+(explored?esc(s.rooms[floor].title):'Unexplored')+'">'+(here?'@':explored?'#':'?')+'<small>'+floor+'</small></span>';
  }).join("");
  const actions=availableActions(s);
  const primary=actions.filter(a=>["explore","attack","claim","return","take"].includes(a.id));
  const other=actions.filter(a=>!primary.includes(a));
  const actionButton=(a,kind)=>'<button class="action action--'+kind+'" data-act="'+a.id+'" '+(a.index==null?'':'data-index="'+a.index+'"')+'>'+esc(a.label)+' <span aria-hidden="true">↗</span></button>';
  const roomDisplay={...room,type:"room",number:"D"+String(s.position).padStart(2,"0")};
  const monsterDisplay=enemy?{...enemy,type:"monster"}:null;
  const inventory=s.inventory.length ? s.inventory.map((item,idx)=>{
    const c=itemCatalogue(item);
    const known=item.kind==='potion'?s.known[item.id]:null;
    const additional=known?' / '+byId(EFFECTS,known)?.name.toUpperCase():'';
    return '<div class="inventory__item"><span class="inventory__index">'+String(idx+1).padStart(2,"0")+'</span><span>'+esc(itemTitle(item))+esc(additional)+'</span><span class="inventory__mark">'+(known?'!':item.kind==='potion'?'?':'+')+'</span></div>';
  }).join(""):'<p class="muted">Empty pockets.</p>';
  return sectionHeading("01 / DUNGEON EXPLORER", s.phase==="ascending"?"THE WAY BACK":terminal?(s.phase==="won"?"YOU ASCENDED":"YOU DIED"):"DOWN IS A KIND OF HOME",
    "Find the Amulet on floor 6 and carry it back to the entrance. Each action consumes 1 hunger.")+
  '<section class="play-layout"><aside class="run-sidebar">'+
  '<div class="stat-panel"><div class="panel-label">CHARACTER FILE / '+esc(hero.title)+'</div><div class="character-head">'+illustration(hero.art)+'<div><b>'+esc(hero.title)+'</b><span>TURN '+s.turn+' / FLOOR '+s.position+'</span></div></div>'+
  meter("HIT POINTS",s.hp,s.maxHp) + meter("HUNGER",s.hunger,30)+
  '<div class="numeric-stats"><span>ATK <b>'+s.attack+'</b></span><span>DEF <b>'+s.defense+'</b></span><span>AMULET <b>'+(s.hasAmulet?'YES':'NO')+'</b></span></div>'+
  '<div class="depth-label">THE DESCENT / KNOWN FLOORS</div><div class="depth" aria-label="Dungeon depth from zero to six">'+steps+'</div>'+
  '<button class="outline-button" data-choose="1">START NEW RUN</button></div>'+
  '<section class="notebook"><div class="panel-label">FIELD LOG / NEWEST FIRST</div><ol aria-label="Recent events">'+s.log.map((line,i)=>'<li><span>'+String(Math.max(1,s.turn-i)).padStart(2,"0")+'</span>'+esc(line)+'</li>').join("")+'</ol></section></aside>'+
  '<div class="encounter"><div class="encounter__cards"><div>'+cardMarkup(roomDisplay)+'</div><div>'+(monsterDisplay?cardMarkup(monsterDisplay):'<div class="empty-encounter"><span class="empty-encounter__glyph">'+(terminal?(s.phase==="won"?"*":"X"):"·")+'</span><strong>'+ (terminal?(s.phase==="won"?"ESCAPED":"RUN ENDED"):"NO MONSTER")+'</strong><p>'+ (room.loot?'There is something to pick up.':'For now, it is quiet.')+'</p></div>')+'</div></div>'+
  '<section class="command-panel"><div class="panel-label">AVAILABLE ACTIONS</div>'+
  (terminal?'<p class="end-message">'+(s.phase==="won"?"You escaped with the Amulet of Yendor.":'No resurrection. Your possessions remain in the dungeon.')+'</p><button class="action action--primary" data-choose="1">TRY ANOTHER RUN ↗</button>':
   '<div class="actions">'+(primary.length?primary.map(a=>actionButton(a,"primary")).join(""):"")+(other.length?other.map(a=>actionButton(a,"secondary")).join(""):"")+'</div>')+
  '</section><section class="inventory"><div class="panel-label">IN YOUR POCKETS / '+s.inventory.length+' ITEMS</div>'+inventory+'</section>'+
  '<p class="fine-print">Prototype rules: A monster retaliates after most actions. Throwing potions can bypass its defences. Your dog assists once per fight. Use the card gallery to print specimens.</p>'+
  '</div></section>';
}
function galleryView() {
  const cards=filter==="all"?CATALOGUE:CATALOGUE.filter(card=>card.type===filter);
  return sectionHeading("02 / THE CARD FILE", "PAPER CUTS & BAD DECISIONS", "Large 90 × 140 mm specimens. Sparse line drawings, black ink, handmade borders, and rules you can actually read.")+
  '<div class="gallery-tools"><div class="filters" aria-label="Filter cards">'+TYPES.map(type=>'<button type="button" class="filter '+(type===filter?'filter--active':'')+'" aria-pressed="'+(type===filter)+'" data-filter="'+type+'">'+type.toUpperCase()+'</button>').join("")+'</div><button class="outline-button print-button" data-print="1">PRINT / SAVE PDF ↗</button></div>'+
  '<p class="catalogue-count">FILED: '+cards.length+' / '+CATALOGUE.length+' SPECIMENS · 90 × 140 MM · A4 / 4 PER SHEET</p>'+
  '<section class="gallery" aria-label="Card catalogue">'+cards.map(card=>cardMarkup(card)).join("")+'</section>'+
  '<p class="fine-print">Prototype cards. Artwork is original SVG linework. Card effects and values are subject to playtesting; the identities of unidentified potions change every run.</p>';
}
function rulesView() {
  return sectionHeading("03 / FIELD NOTES", "READ BEFORE DESCENDING", "A one-page field manual for the playable vertical slice. The full tabletop rules are still in development.")+
  '<section class="rules-grid"><article><span class="eyebrow">I / OBJECTIVE</span><h2>GET IN. GET OUT.</h2><p>Choose an adventurer. Descend six floors, defeat the Amulet Warden, take the Amulet of Yendor and return to floor 0 alive. Death ends the run permanently.</p><p>Rooms remain in the dungeon, so you retrace your explored path when returning.</p></article>'+
  '<article><span class="eyebrow">II / TIME</span><h2>EVERY MOVE COUNTS.</h2><p>Each action costs 1 hunger. At zero hunger, each further action costs 1 HP. Rations restore 8 hunger. Keep enough provisions for the journey back.</p><p>Taking loot, drinking, throwing, attacking, exploring and praying all consume time.</p></article>'+
  '<article><span class="eyebrow">III / FIGHTING</span><h2>DO NOT STARE.</h2><p>In combat, melee damage is your attack plus 0–1, minus enemy defence (minimum 1). Your pet adds 1 damage to your first melee attack each fight.</p><p>Surviving monsters strike back for attack minus your defence (minimum 1), unless an effect prevents it.</p></article>'+
  '<article><span class="eyebrow">IV / EXPERIMENTS</span><h2>TRY THE BOTTLE.</h2><p>Every run randomly matches five potion appearances to five effects. The same appearance always means the same thing during that run.</p><p>Drinking and throwing a potion have different consequences. Once used, its appearance is identified in your inventory.</p></article>'+
  '<article><span class="eyebrow">V / CARD PHYSICS</span><h2>LET THINGS COLLIDE.</h2><p>Frost damages creatures more in flooded rooms. Keys open locks or disable traps. Prayer restores health at an altar. Monster traits can punish careless attacks.</p><p>The current interaction set is deliberately small; combinations will expand after playtests.</p></article>'+
  '<article><span class="eyebrow">VI / WHAT IS MISSING</span><h2>WORK IN PROGRESS.</h2><p>This first release uses a linear six-floor dungeon. Spatial exploration, shops, equipment slots, curses, divine favour, corpse effects and full room generation are planned but not yet playable.</p><p>The printable card file is a visual design catalogue, not yet a complete physical boxed game.</p></article></section>'+
  '<div class="colophon"><span>COLOPHON / NO TRACKERS · NO FONTS TO DOWNLOAD · NO BUILD STEP</span><p>These cards are meant to look like copies from a 1984 dungeon zine: blunt type, generous negative space, deliberately rough borders and economical pen drawings. Print at 100% scale on A4.</p></div>';
}
function render() {
  document.querySelectorAll(".site-nav__button").forEach(btn=>{
    const active=btn.dataset.view===view;
    btn.classList.toggle("site-nav__button--active",active);
    btn.setAttribute("aria-current",active?"page":"false");
  });
  document.body.dataset.view=view;
  app.innerHTML=view==="play"?runView():view==="cards"?galleryView():rulesView();
}
document.addEventListener("click",event=>{
  const button=event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) { view=button.dataset.view; render(); window.scrollTo({top:0,behavior:"instant"}); return; }
  if (button.dataset.filter) { filter=button.dataset.filter; render(); return; }
  if (button.dataset.print) { window.print(); return; }
  if (button.dataset.choose) { choosing=true; render(); return; }
  if (button.dataset.hero) { state=startRun(button.dataset.hero); choosing=false; save(); render(); return; }
  if (button.dataset.act && state) {
    const index=button.dataset.index===undefined?null:Number(button.dataset.index);
    const next=act(state,button.dataset.act,index);
    if (next!==state) { state=next; save(); render(); }
  }
});
render();
