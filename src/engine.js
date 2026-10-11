import { HEROES, MONSTERS, ROOMS, APPEARANCES, EFFECTS } from "./data.js";

export const VERSION = 1;
export const LAST_FLOOR = 6;

const find = (cards, id) => cards.find(card => card.id === id);
const log = (state, message) => { state.log.unshift(message); state.log.length = Math.min(state.log.length, 14); };
const rand = (state, limit) => {
  state.rng = (Math.imul(1664525, state.rng) + 1013904223) >>> 0;
  return Math.floor((state.rng / 4294967296) * limit);
};
const choice = (state, array) => array[rand(state, array.length)];
export const currentRoom = state => state.rooms[state.position];
export const currentMonster = state => currentRoom(state)?.monster?.hp > 0 ? currentRoom(state).monster : null;

function shuffle(state, entries) {
  const out = [...entries];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(state, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function addPotion(state, appearanceId) {
  state.inventory.push({ kind: "potion", id: appearanceId || choice(state, APPEARANCES).id });
}
export function startRun(heroId = "delver", seed = Date.now()) {
  const hero = find(HEROES, heroId) || HEROES[0];
  const state = {
    version: VERSION, seed: Number(seed) >>> 0, rng: (Number(seed) >>> 0) || 1,
    heroId: hero.id, hp: hero.hp, maxHp: hero.hp, attack: hero.attack,
    defense: hero.defense, hunger: 24, turn: 0, position: 0,
    phase: "descending", hasAmulet: false, known: {}, assignments: {},
    status: { invisible: 0 }, inventory: [], log: [],
    rooms: [{ id: "entrance", title: "Dungeon Entrance", art: "stairs", terrain: "SAFE",
      rule: "The only way out.", flavor: "Daylight already seems distant.",
      monster: null, loot: null, visited: true, used: false }]
  };
  const effects = shuffle(state, EFFECTS.map(effect => effect.id));
  APPEARANCES.forEach((app, i) => { state.assignments[app.id] = effects[i]; });
  if (hero.id === "delver") state.inventory.push({kind:"ration", id:"ration"}, {kind:"ration", id:"ration"});
  else if (hero.id === "wizard") { addPotion(state); addPotion(state); }
  else if (hero.id === "rogue") { addPotion(state,"smoky"); state.inventory.push({kind:"key",id:"key"}); }
  else state.inventory.push({kind:"ration",id:"ration"});
  log(state, "The stairs descend into the dark. Find the Amulet, then return alive.");
  return state;
}
function finish(state, monsterCanAct = true) {
  state.turn++;
  state.hunger = Math.max(0, state.hunger - 1);
  if (state.hunger === 0) { state.hp--; log(state, "Starvation costs 1 HP."); }
  if (state.hp > 0 && monsterCanAct) {
    const mon = currentMonster(state);
    if (mon) {
      if (state.status.invisible > 0) {
        log(state, mon.title + " cannot see you.");
      } else if (mon.stunned > 0) {
        log(state, mon.title + " is frozen.");
        mon.stunned--;
      } else if (mon.blind > 0) {
        log(state, mon.title + " misses while blinded.");
        mon.blind--;
      } else {
        let damage = Math.max(1, mon.attack - state.defense);
        if (mon.id === "goblin" && !mon.ambushed) { damage++; mon.ambushed = true; }
        state.hp -= damage;
        log(state, mon.title + " hits you for " + damage + ".");
        if (mon.id === "rust") { state.defense = Math.max(0, state.defense - 1); log(state, "Your armour rusts. Defence -1."); }
        if (mon.id === "wraith") { state.hunger = Math.max(0, state.hunger - 1); log(state, "The cold drains your strength."); }
      }
    }
  }
  if (state.status.invisible > 0) state.status.invisible--;
  if (state.hp <= 0) { state.hp = 0; state.phase = "dead"; log(state, "YOU DIE. The dungeon keeps your things."); }
}
function spawnRoom(state) {
  const depth = state.position;
  const template = depth === LAST_FLOOR ? find(ROOMS, "crypt") : choice(state, ROOMS);
  const room = { ...template, monster:null, loot:null, visited:true, used:false };
  const enemy = depth === LAST_FLOOR ? find(MONSTERS, "sentinel") :
    rand(state, 100) < (depth === 1 ? 62 : 75) ? choice(state, MONSTERS.slice(0, 6)) : null;
  if (enemy) room.monster = { ...enemy, stunned:0, blind:0, ambushed:false, petUsed:false };
  if (rand(state, 100) < 86 || depth === 1) {
    const lootRoll = rand(state, 10);
    room.loot = lootRoll < 4 ? {kind:"ration",id:"ration"} :
      lootRoll < 9 ? {kind:"potion",id:choice(state,APPEARANCES).id} : {kind:"key",id:"key"};
  }
  if (room.id === "shop" && !room.loot) room.loot = {kind:"ration",id:"ration"};
  if (room.id === "locked") {
    const idx = state.inventory.findIndex(x => x.kind === "key");
    if (idx >= 0) { state.inventory.splice(idx,1); log(state,"You open the gallery with your rusty key."); }
    else { state.hunger = Math.max(0, state.hunger - 2); log(state,"You force the lock. Hunger -2."); }
  }
  if (room.id === "trap") {
    const idx = state.inventory.findIndex(x => x.kind === "key");
    if (idx >= 0) { state.inventory.splice(idx,1); log(state,"Your key jams the trap mechanism."); }
    else { state.hp -= 2; log(state,"A pressure plate strikes. HP -2."); }
  }
  state.rooms.push(room);
  log(state, "FLOOR " + depth + ": " + room.title + (enemy ? ". " + enemy.title + " appears!" : "."));
  return room;
}
function killIfNeeded(state) {
  const mon = currentRoom(state).monster;
  if (mon && mon.hp <= 0) log(state, mon.title + " is defeated.");
}
export function availableActions(state) {
  if (!state || state.phase === "dead" || state.phase === "won") return [];
  const actions = [];
  const room = currentRoom(state);
  const mon = currentMonster(state);
  if (mon) {
    actions.push({id:"attack",label:"Attack"});
    state.inventory.forEach((item, index) => { if (item.kind === "potion") actions.push({id:"throw",index,label:"Throw " + appearanceTitle(item.id)}); });
  } else {
    if (room.loot) actions.push({id:"take",label:"Take " + itemTitle(room.loot)});
    if (state.phase === "descending" && state.position < LAST_FLOOR) actions.push({id:"explore",label:"Descend / explore"});
    if (state.phase === "descending" && state.position === LAST_FLOOR && !state.hasAmulet) actions.push({id:"claim",label:"Take the Amulet"});
    if (state.phase === "ascending" && state.position > 0) actions.push({id:"return",label:"Climb toward daylight"});
    if (room.id === "altar" && !room.used) actions.push({id:"pray",label:"Pray at altar"});
    if (room.id === "fountain" && !room.used) actions.push({id:"fountain",label:"Drink from fountain"});
  }
  state.inventory.forEach((item, index) => {
    if (item.kind === "potion") actions.push({id:"drink",index,label:"Drink " + appearanceTitle(item.id)});
    if (item.kind === "ration") actions.push({id:"eat",index,label:"Eat ration"});
  });
  return actions;
}
export function appearanceTitle(id) { return find(APPEARANCES,id)?.title || "Unknown potion"; }
export function itemTitle(item) {
  return item.kind === "potion" ? appearanceTitle(item.id) : item.kind === "key" ? "Rusty Key" : "Iron Ration";
}
function throwPotion(state, effect) {
  const mon = currentMonster(state);
  if (!mon) return;
  if (effect === "healing") { mon.hp -= 2; log(state,"The potion splashes: 2 damage."); }
  if (effect === "poison") { mon.hp -= 5; log(state,"Venom burns: 5 damage."); }
  if (effect === "invisibility") { mon.blind = 2; log(state,"The monster cannot see clearly."); }
  if (effect === "frost") { const dmg = currentRoom(state).terrain === "WATER" ? 5 : 3; mon.hp -= dmg; mon.stunned = 1; log(state,"Frost strikes: " + dmg + " damage."); }
  if (effect === "polymorph") {
    const options=MONSTERS.slice(0,6).filter(m => m.id !== mon.id);
    currentRoom(state).monster = { ...choice(state,options), stunned:0, blind:0, ambushed:false, petUsed:false };
    log(state,"It changes shape into " + currentRoom(state).monster.title + "!");
  } else killIfNeeded(state);
}
function drinkPotion(state, effect) {
  if (effect === "healing") { const healed=Math.min(5,state.maxHp-state.hp); state.hp += healed; log(state,"Warmth returns. HP +" + healed + "."); }
  if (effect === "poison") { state.hp -= 3; log(state,"Your throat burns. HP -3."); }
  if (effect === "invisibility") { state.status.invisible=4; log(state,"You disappear. Invisible for 3 turns."); }
  if (effect === "frost") { state.hunger=Math.min(30,state.hunger+4); log(state,"The cold clears your head. Hunger +4."); }
  if (effect === "polymorph") { const delta=rand(state,3)-1; state.attack=Math.max(1,state.attack+delta); log(state,"Your shape shifts. Attack " + (delta >= 0 ? "+" : "") + delta + "."); }
}
export function act(previous, id, index = null) {
  const legal = availableActions(previous).some(a => a.id === id && (a.index ?? null) === (index ?? null));
  if (!legal) return previous;
  const state = JSON.parse(JSON.stringify(previous));
  let monsterCanAct=true;
  const room = currentRoom(state);
  if (id === "explore") {
    state.position++;
    spawnRoom(state);
    monsterCanAct=false;
  } else if (id === "return") {
    state.position--;
    log(state, "You retrace your steps to " + currentRoom(state).title + ".");
    monsterCanAct=false;
  } else if (id === "attack") {
    const mon=currentMonster(state);
    let damage=Math.max(1,state.attack+rand(state,2)-mon.defense);
    if (!mon.petUsed) { damage++; mon.petUsed=true; log(state,"Your faithful pet joins the attack (+1)."); }
    mon.hp -= damage;
    log(state, "You strike " + mon.title + " for " + damage + ".");
    if (mon.id === "eye" && mon.hp > 0) { state.hp--; log(state,"Its gaze paralyses you briefly. HP -1."); }
    killIfNeeded(state);
  } else if (id === "take") {
    const item=room.loot;
    state.inventory.push(item);
    room.loot=null;
    log(state, "You found " + itemTitle(item) + ".");
  } else if (id === "claim") {
    state.hasAmulet=true; state.phase="ascending";
    log(state,"The Amulet of Yendor is yours. Now escape!");
  } else if (id === "pray") {
    room.used=true; state.hp=Math.min(state.maxHp,state.hp+2);
    log(state,"A distant god hears you. Restore up to 2 HP.");
  } else if (id === "fountain") {
    room.used=true;
    if (rand(state,2)===0) { state.hp=Math.min(state.maxHp,state.hp+2); log(state,"The fountain heals you."); }
    else { addPotion(state); log(state,"You fill a bottle with mysterious liquid."); }
  } else if (id === "eat") {
    state.inventory.splice(index,1);
    state.hunger=Math.min(30,state.hunger+8);
    log(state,"You eat a ration. Hunger +8.");
  } else if (id === "drink" || id === "throw") {
    const [item] = state.inventory.splice(index,1);
    const effect=state.assignments[item.id];
    state.known[item.id]=effect;
    log(state, appearanceTitle(item.id) + " identified: " + find(EFFECTS,effect).name + ".");
    if (id === "drink") drinkPotion(state,effect);
    else throwPotion(state,effect);
  }
  finish(state,monsterCanAct);
  if (state.phase !== "dead" && state.phase === "ascending" && state.position === 0) {
    state.phase="won"; log(state,"YOU ASCEND. The Amulet has reached daylight.");
  }
  return state;
}
export function validateSave(state) {
  return Boolean(state && state.version === VERSION && HEROES.some(x=>x.id===state.heroId) &&
    Array.isArray(state.rooms) && Array.isArray(state.inventory) && state.position >= 0 &&
    state.position < state.rooms.length && state.assignments && state.status &&
    ["descending","ascending","dead","won"].includes(state.phase));
}
