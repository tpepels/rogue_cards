import { HEROES, CATALOGUE, TYPES, EFFECTS, APPEARANCES, BEHAVIOURS, printDeck } from "./data.js";
import { MAGIC_TYPES, MAGIC } from "./magic-data.js";
import { illustration } from "./art.js";
import { cardMarkup, printSheets, escapeHtml as esc } from "./card-view.js";
import {
  startRun, act, currentRoom, currentMonster, availableActions, validateSave,
  LAST_FLOOR, MAX_ACTIONS, MAX_HUNGER, heroAttack, heroDefense, knownIdentity,
  nodeLabel, itemTitle, regionAt
} from "./engine.js";

const app=document.querySelector("#app");
const SAVE_KEY="rogue-cards-v5";
const BONES_KEY="rogue-cards-bones-v5";
let view="play";
let filter="all";
let kitMode=false;
let state=load();
let choosing=!state;
let confirmingRestart=false;
const byId=(cards,id)=>cards.find(c=>c.id===id);
function load() {
  try {const value=JSON.parse(localStorage.getItem(SAVE_KEY));return validateSave(value)?value:null;}
  catch {return null;}
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY,JSON.stringify(state));
    if(state?.phase==="dead"&&state.bonesOutcome)localStorage.setItem(BONES_KEY,JSON.stringify(state.bonesOutcome));
  }
  catch { /* Local persistence is optional. */ }
}
function heading(issue,title,deck) {
  return '<div class="section-heading"><div><span class="eyebrow">'+esc(issue)+'</span><h1>'+esc(title)+'</h1></div><p>'+esc(deck)+'</p></div>';
}
function heroSelect() {
  return heading("01 / HERO SELECTION","CHOOSE YOUR BAD IDEA","A longer dungeon expedition. Two actions per turn, a shared monster-behaviour deck, and d6 combat.")+
    '<div class="hero-grid" aria-label="Choose an adventurer">'+HEROES.map(hero=>
      '<button class="hero-choice" type="button" data-hero="'+esc(hero.id)+'" aria-label="Start as '+esc(hero.title)+'">'+cardMarkup(hero)+'</button>').join("")+'</div>'+
    '<p class="fine-print">A new run shuffles room, monster, loot, event, behaviour, and four mystery-item identity sets. A previous adventurer may leave recoverable bones. This game stores the current run locally in your browser.</p>';
}
function meter(label,value,max) {
  const percent=Math.max(0,Math.min(100,Math.round(value/max*100)));
  return '<div class="meter"><div class="meter__labels"><span>'+esc(label)+'</span><strong>'+esc(value)+' / '+esc(max)+'</strong></div><div class="meter__bar"><i style="width:'+percent+'%"></i></div></div>';
}
function mapView(s) {
  let rows='';
  for(let i=0;i<=LAST_FLOOR;i++){
    const main=s.rooms[String(i)];
    const branch=s.rooms[i+"b"];
    const sideOpen=main?.exits?.includes("SIDE");
    const mainCurrent=s.position===String(i);
    const branchCurrent=s.position===i+"b";
    const node=(id,room,current,label)=>
      '<span class="map-cell '+(room?'map-cell--known ':'')+(current?'map-cell--active':'')+'">'+
      '<b>'+esc(label)+'</b> <small>'+ (room?esc(room.title):(id.endsWith("b")?"·":"?"))+'</small></span>';
    rows+='<li class="map-row" data-region="'+esc(regionAt(i))+'">'+node(String(i),main,mainCurrent,""+i)+
      (i>0&&i<LAST_FLOOR?(sideOpen?node(i+"b",branch,branchCurrent,"SIDE"):'<span class="map-cell map-cell--void">NO EXIT</span>'): '<span class="map-cell map-cell--void">—</span>')+'</li>';
  }
  return '<section class="map-panel" aria-label="Discovered dungeon map"><div class="panel-label">YOUR DUNGEON / 10 DEPTHS</div>'+
    '<p class="help-text">Main rooms always connect forward. SIDE opens optional chambers; adjacent discovered LINK chambers make shortcuts. Monsters stay in their room.</p>'+
    '<ol class="map-rows">'+rows+'</ol></section>';
}
function inventoryView(s) {
  const held=s.inventory.map((item,index)=>{
    const identified=item.kind==="potion" ? knownIdentity(s,item.id) : (s.magicKnown?.[item.kind]?.[item.id]||null);
    return '<li class="inventory__item"><span class="inventory__index">'+String(index+1).padStart(2,"0")+'</span>'+
      '<span>'+esc(itemTitle(item))+(item.kind==="ring"?' <small>['+esc(item.blessing||"uncursed")+']</small>':'')+(identified?' <small>('+esc(identified)+')</small>':'')+'</span>'+
      '<span class="inventory__mark">'+(item.kind==="potion"&&!identified?'?':'+')+'</span></li>';
  }).join("");
  const identities=APPEARANCES.map(app=>
    '<div class="identification__row"><span>'+esc(app.title)+'</span><b>'+esc(knownIdentity(s,app.id)||"???")+'</b></div>').join("");
  return '<section class="inventory"><div class="panel-label">BACKPACK / '+s.inventory.length+' OBJECTS</div>'+
    '<ul class="inventory-list">'+(held||'<li class="muted">Nothing in your pack.</li>')+'</ul>'+
    '<div class="equipped"><div class="panel-label">EQUIPMENT</div>'+
    '<div>WEAPON <b>'+esc(s.equipped.weapon||"None")+'</b></div>'+
    '<div>ARMOUR <b>'+esc(s.equipped.armour||"None")+'</b></div>'+
    '<div>COMPANION <b>'+(s.equipped.companion?"DOG":"None")+'</b></div>'+
    '<div>RING <b>'+esc(s.equipped.ring?(s.equipped.ring.id+" / "+s.equipped.ring.blessing):"None")+'</b></div></div>'+
    '<div class="identification"><div class="panel-label">POTION IDENTIFICATION</div>'+identities+'</div>'+
    MAGIC_TYPES.map(type=>'<div class="identification"><div class="panel-label">'+type.toUpperCase()+' IDENTIFICATION</div>'+
      MAGIC[type].appearances.map(([id,title])=>'<div class="identification__row"><span>'+esc(title)+'</span><b>'+
        esc(MAGIC[type].effects.find(x=>x.id===s.magicKnown?.[type]?.[id])?.name||"???")+'</b></div>').join('')+'</div>').join('')+
    '</section>';
}
function controls(s) {
  const terminal=s.phase==="won"||s.phase==="dead";
  const actions=availableActions(s);
  const mainIds=["attack","explore","travel","take","take-corpse","take-bones","claim"];
  const renderButton=a=>{
    const attrs=(a.target!=null?' data-target="'+esc(a.target)+'"':'')+
      (a.index!=null?' data-index="'+a.index+'"':'');
    return '<button class="action '+(mainIds.includes(a.id)?"action--primary":"action--secondary")+
      '" data-act="'+esc(a.id)+'"'+attrs+' type="button">'+esc(a.label)+
      '<span aria-hidden="true">↗</span></button>';
  };
  const roll=s.lastRoll;
  return '<section class="command-panel"><div class="panel-label">TURN '+s.turn+' / '+s.actionsLeft+' OF '+MAX_ACTIONS+' ACTIONS LEFT</div>'+
    '<div class="command-status"><strong>'+esc(nodeLabel(s.position))+'</strong>'+
    '<span>'+ (s.phase==="ascending"?"ESCAPE WITH THE AMULET":"FIND THE AMULET AT DEPTH 10") +'</span></div>'+
    (roll?'<div class="roll-report">LAST ROLL: '+esc(roll.label)+' · d6='+roll.roll+' · TOTAL '+roll.total+
      ' vs '+roll.threshold+' · '+(roll.hit?"HIT":"MISS")+'</div>':'')+
    (s.lastBehaviour?'<p class="behaviour-report">LAST MONSTER CARD: <b>'+esc(byId(BEHAVIOURS,s.lastBehaviour)?.title||s.lastBehaviour)+'</b></p>':'')+
    (terminal?'<p class="end-message">'+(s.phase==="won"?"YOU ASCEND. The Amulet has reached daylight.":"YOU DIE. Your possessions remain below.")+'</p>'+
      '<button class="action action--primary" type="button" data-choose="1">BEGIN ANOTHER RUN ↗</button>':
      '<div class="actions">'+actions.filter(a=>a.id!=="end").map(renderButton).join("")+
      actions.filter(a=>a.id==="end").map(renderButton).join("")+'</div>')+'</section>';
}
function runView() {
  if(!state||choosing) return heroSelect();
  const s=state, room=currentRoom(s), enemy=currentMonster(s), hero=byId(HEROES,s.heroId);
  const roomDisplay={...room,type:"room",number:s.position.toUpperCase()};
  const monsterDisplay=enemy?{...enemy,type:"monster",defense:enemy.defense+(enemy.guard||0)}:null;
  return heading("01 / THE EXPEDITION",s.phase==="ascending"?"FIND THE WAY BACK":
    s.phase==="won"?"ASCENSION":s.phase==="dead"?"YOU HAVE DIED":"DOWN INTO THE DARK",
    "Explore three dungeon regions. Printed SIDE and LINK exits create branches and shortcuts; monsters never move.")+
    '<div class="mobile-hud" role="group" aria-label="Character status">'+
    '<span>HP <b>'+s.hp+'/'+s.maxHp+'</b></span><span>HUNGER <b>'+s.hunger+'</b></span>'+
    '<span>ATK <b>'+heroAttack(s)+'</b></span><span>DEF <b>'+heroDefense(s)+'</b></span>'+
    '<span>ACTIONS <b>'+s.actionsLeft+'</b></span></div>'+
    '<div class="expedition-layout"><div class="expedition-main">'+controls(s)+
    '<div class="encounter"><div class="panel-label">CURRENT LOCATION / '+esc(nodeLabel(s.position))+'</div><div class="encounter__cards">'+
      '<div>'+cardMarkup(roomDisplay)+'</div>'+
      '<div>'+(monsterDisplay?cardMarkup(monsterDisplay):
        '<div class="empty-encounter"><span class="empty-encounter__glyph">·</span><strong>NO HOSTILE CREATURE</strong><p>'+(
          room.loot?"Loot is available in this chamber.":"The room is quiet.")+'</p></div>')+'</div></div></div>'+
    '<p class="fine-print">Attack: d6 + ATK vs 4 + DEF. Natural 1 misses; natural 6 hits for 3 damage. Other hits deal 2. The monster draws one behaviour after your turn.</p>'+
    '</div><aside class="expedition-side"><section class="stat-panel"><div class="panel-label">CHARACTER FILE</div>'+
    '<div class="character-head">'+illustration(hero.art)+'<div><b>'+esc(hero.title)+'</b><span>TURN '+s.turn+' / '+esc(nodeLabel(s.position))+'</span></div></div>'+
    meter("HIT POINTS",s.hp,s.maxHp)+meter("HUNGER",s.hunger,MAX_HUNGER)+
    '<div class="panel-label">LIVING DUNGEON</div>'+
    '<p class="fine-print">DOG: '+esc(s.pet.active?"Hunger "+s.pet.hunger+" / "+(s.pet.lastAction||"following"):"No companion")+
    ' · FAVOUR '+s.prayer.favour+' · PRAYER IN '+s.prayer.cooldown+' TURNS</p>'+
    '<p class="fine-print">INTRINSICS: '+esc(s.intrinsics.join(", ")||"None")+'</p>'+
    '<div class="numeric-stats"><span>ATK <b>'+heroAttack(s)+'</b></span><span>DEF <b>'+heroDefense(s)+'</b></span><span>AMULET <b>'+(s.hasAmulet?"YES":"NO")+'</b></span></div>'+
    '<button class="outline-button" type="button" data-choose="1">NEW RUN</button></section>'+
    mapView(s)+inventoryView(s)+
    '<section class="notebook"><div class="panel-label">FIELD LOG / MOST RECENT FIRST</div><ol>'+
    s.log.slice(0,18).map(message=>'<li>'+esc(message)+'</li>').join("")+'</ol></section></aside></div>';
}
function galleryView() {
  const specimens=filter==="all"?CATALOGUE:CATALOGUE.filter(card=>card.type===filter);
  const cards=kitMode?(filter==="all"?TYPES.slice(1).flatMap(type=>printDeck(type)):printDeck(filter)):specimens;
  return heading("02 / THE CARD FILE",kitMode?"CUT, SHUFFLE, PLAY":"PAPER CUTS & BAD DECISIONS",
    kitMode?"Print real quantities for the physical prototype. Keep room, monster, object, event and behaviour decks separate.":
      "Oversized 90 × 140 mm black-and-white zine cards. Filter specimens, or print the complete playtest kit.")+
    '<div class="gallery-tools"><div class="filters" aria-label="Card category">'+
    TYPES.map(t=>'<button type="button" class="filter '+(t===filter?"filter--active":"")+
      '" aria-pressed="'+(t===filter)+'" data-filter="'+t+'">'+t.toUpperCase()+'</button>').join("")+
    '</div><div class="kit-toggle" role="group" aria-label="Print mode">'+
    '<button class="filter '+(!kitMode?"filter--active":"")+'" data-kit="specimens" aria-pressed="'+(!kitMode)+'">SPECIMENS</button>'+
    '<button class="filter '+(kitMode?"filter--active":"")+'" data-kit="kit" aria-pressed="'+kitMode+'">PHYSICAL KIT</button></div>'+
    '<button class="outline-button print-button" data-print="1">PRINT CARDS / SAVE PDF ↗</button></div>'+
    '<p class="catalogue-count">FILED: '+cards.length+' PRINTABLE CARDS · 90 × 140 MM · A4 / 4 PER SHEET</p>'+
    '<p class="print-instructions">For physical play, select PHYSICAL KIT and print at 100% scale. You also need the <a href="./field-guide.html">field guide and tracking sheets ↗</a>, one six-sided die, and a pencil.</p>'+
    '<section class="gallery" aria-label="Card catalogue">'+cards.map(card=>cardMarkup(card)).join("")+'</section>'+printSheets(cards);
}
function rulesView() {
  return heading("03 / FIELD NOTES","THE TWO-ACTION DUNGEON",
    "Phase 3: four unidentified magical families, fifteen shared properties, and printed interactions, alongside the Phase 2 dungeon rules.")+
    '<div class="rules-cta"><a class="outline-button" href="./field-guide.html">OPEN PRINTABLE FIELD GUIDE ↗</a><a class="outline-button" href="./playmat.html">OPEN DUNGEON SHEET ↗</a><a class="outline-button" href="./magic-guide.html">MAGIC / IDENTIFICATION ↗</a></div>'+
    '<div class="rules-grid">'+
    '<article><span class="eyebrow">I / OBJECTIVE</span><h2>DESCEND. RETURN.</h2><p>Explore the main passage to depth 10, defeat the Amulet Warden, claim the Amulet of Yendor, and retrace your route to depth 0. Death ends the run.</p><p>Room cards show their SIDE and LINK exits. SIDE opens a side chamber; adjacent explored LINK chambers connect into occasional loops. Three regions use separate Room piles.</p></article>'+
    '<article><span class="eyebrow">II / TWO ACTIONS</span><h2>YOU MOVE TWICE.</h2><p>On each turn take up to two actions: explore, move, attack, take loot, eat, use or equip an item, pray, or claim the Amulet. You may end early.</p><p>After the turn, spend 1 hunger and draw one shared monster-behaviour card if a living monster is present.</p></article>'+
    '<article><span class="eyebrow">III / COMBAT</span><h2>ROLL ONE D6.</h2><p>Roll d6 + attack against 4 + defender defence. Natural 1 always misses. Natural 6 always hits and deals 3 damage. Other hits deal 2 damage.</p><p>Monster attacks use exactly the same roll. A living Floating Eye punishes melee attacks, even when you miss.</p></article>'+
    '<article><span class="eyebrow">IV / MONSTER DECK</span><h2>DRAW ONE CARD.</h2><p>Strike, Lunge, Guard, Frenzy, Drain and Recover make up a ten-card shared behaviour pile. Shuffle its discards when empty. Status effects may prevent a draw.</p><p>Guard grants +1 monster defence during your next two actions.</p></article>'+
    '<article><span class="eyebrow">V / SECRET BOTTLES</span><h2>DISCOVER THE CONTENTS.</h2><p>Randomly pair potion appearances with identities at setup. An appearance retains its identity all run. Drink or throw to identify it. Note the result.</p><p>The physical kit includes identity cards for scrolls, wands and rings, plus potion slips. Use the separate magic identification guide.</p></article>'+
    '<article><span class="eyebrow">VI / PHYSICAL TABLE</span><h2>KEEP A SMALL MAP.</h2><p>Use the A4 dungeon sheet to track explored rooms, loot, wounds, and passages. Only the current large room and monster cards need to be displayed.</p><p>Print the physical kit with duplicate cards. The full intended run is 90–120 minutes, pending actual table-timed testing.</p></article>'+
    '</div>';
}
function restartView() {
  return heading("01 / RESET","ABANDON THIS EXPEDITION?",
    "The current v2 run will be replaced. Exploration, gear, and potion discoveries cannot be restored.")+
    '<section class="restart-prompt"><p>Starting a new run discards this dungeon and changes the randomized potion identities.</p>'+
    '<div class="restart-prompt__actions"><button class="action action--primary" data-confirm-restart="1">DISCARD RUN ↗</button>'+
    '<button class="action action--secondary" data-cancel-restart="1">KEEP PLAYING</button></div></section>';
}
function render() {
  document.querySelectorAll(".site-nav__button").forEach(button=>{
    const selected=button.dataset.view===view;
    button.classList.toggle("site-nav__button--active",selected);
    button.setAttribute("aria-current",selected?"page":"false");
  });
  document.body.dataset.view=view;
  app.innerHTML=confirmingRestart?restartView():view==="play"?runView():view==="cards"?galleryView():rulesView();
}
document.addEventListener("click",event=>{
  const button=event.target.closest("button");
  if(!button) return;
  if(button.dataset.view) {view=button.dataset.view;confirmingRestart=false;render();window.scrollTo(0,0);return;}
  if(button.dataset.filter) {filter=button.dataset.filter;render();return;}
  if(button.dataset.kit) {kitMode=button.dataset.kit==="kit";render();return;}
  if(button.dataset.print) {window.print();return;}
  if(button.dataset.choose) {
    if(state && !["dead","won"].includes(state.phase)) confirmingRestart=true;
    else choosing=true;
    render();return;
  }
  if(button.dataset.cancelRestart) {confirmingRestart=false;render();return;}
  if(button.dataset.confirmRestart) {
    confirmingRestart=false;choosing=true;state=null;
    try {localStorage.removeItem(SAVE_KEY);} catch { /* storage optional */ }
    render();return;
  }
  if(button.dataset.hero) {
    let bones=null;
    try {bones=JSON.parse(localStorage.getItem(BONES_KEY));localStorage.removeItem(BONES_KEY);}catch {bones=null;}
    state=startRun(button.dataset.hero,Date.now(),bones);choosing=false;save();render();return;
  }
  if(button.dataset.act && state){
    const arg=button.dataset.target??(button.dataset.index===undefined?null:Number(button.dataset.index));
    const next=act(state,button.dataset.act,arg);
    if(next!==state) {state=next;save();render();}
  }
});
render();
