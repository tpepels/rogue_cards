import {PHASE6_CARDS,PHASE6_COPIES} from "./phase6-data.js";
import { ECOLOGY_CARDS, ECOLOGY_COPIES, INTRINSICS } from "./ecology.js";
import { MAGICAL_CARDS, MAGIC_IDENTITIES, MAGIC_PRINT_COPIES } from "./magic-data.js";
// One source of truth for both the playable prototype and printable card catalogue.
// All artwork is keyed by a small reusable ink-drawing vocabulary.
export const HEROES = [
  { id:"delver", type:"hero", title:"Cave Delver", art:"delver", hp:13, attack:3, defense:2, rule:"Scavenge: Begin with 2 rations. TECHNIQUE: next melee attack +3 ATK (once per monster).", flavor:"The map is wrong. Again." },
  { id:"wizard", type:"hero", title:"Hedge Wizard", art:"wizard", hp:12, attack:3, defense:1, rule:"Oddments: Begin with 3 mystery potions. TECHNIQUE: HEX deals 2 damage (once per monster).", flavor:"Almost certainly harmless." },
  { id:"knight", type:"hero", title:"Wandering Knight", art:"knight", hp:14, attack:3, defense:2, rule:"Armoured: Begin with +1 DEF (included). TECHNIQUE: HOLD +3 DEF for this response (once per monster).", flavor:"An honourable way to die." },
  { id:"rogue", type:"hero", title:"Cutpurse", art:"rogue", hp:11, attack:3, defense:1, rule:"Quick hands: Begin with ration, key, smoky potion. TECHNIQUE: EVADE next successful hit (once per monster).", flavor:"Every lock is a suggestion." }
];

export const MONSTERS = [
  { id:"rat", type:"monster", title:"Giant Rat", art:"rat", hp:2, attack:1, defense:0, rule:"Vermin. Small and hungry.", flavor:"It knows your scent." },
  { id:"goblin", type:"monster", title:"Goblin", art:"goblin", hp:3, attack:2, defense:0, rule:"Ambush: Its first hit deals +1 damage.", flavor:"A knife, a grin, a plan." },
  { id:"eye", type:"monster", title:"Floating Eye", art:"eye", hp:2, attack:1, defense:0, rule:"Gaze: If it survives your melee attack, suffer 1 damage.", flavor:"It sees what you forget." },
  { id:"rust", type:"monster", title:"Rust Monster", art:"rust", hp:4, attack:2, defense:1, rule:"Corrode: On a hit, lose 1 defence for this run.", flavor:"Your armour is its supper." },
  { id:"wraith", type:"monster", title:"Restless Shade", art:"ghost", hp:3, attack:2, defense:0, rule:"Cold touch: You lose 1 extra hunger when hit.", flavor:"Somebody never left." },
  { id:"troll", type:"monster", title:"Bridge Troll", art:"troll", hp:5, attack:2, defense:1, rule:"Thick hide: Defence 1.", flavor:"It remembers every insult." },
  { id:"sentinel", type:"monster", title:"Amulet Warden", art:"warden", hp:7, attack:3, defense:1, rule:"Guardian: The Amulet cannot be taken until this falls.", flavor:"Your name is not on the list." }
];

export const ROOMS = [
  { id:"corridor", type:"room", title:"Crooked Corridor", art:"corridor", terrain:"PASSAGE", region:"UPPER", exits:["SIDE","LINK"], rule:"SIDE / LINK. Safe passage; loot may be found.", flavor:"Neither arrow points out." },
  { id:"flood", type:"room", title:"Flooded Chamber", art:"water", terrain:"WATER", region:"MIDDLE", exits:["SIDE","LINK"], rule:"WATER: Thrown Frost / Electricity +2. CACHE: Key, DIGGING or 2 Hunger for Object.", flavor:"Something stirs below." },
  { id:"altar", type:"room", title:"Abandoned Altar", art:"altar", terrain:"SACRED", region:"DEEP", exits:["SIDE"], rule:"PRAY +1. Once: ENCHANT/CLEANSE equipment. BARGAIN: -2 HP for Object.", flavor:"The gods are not all absent." },
  { id:"fountain", type:"room", title:"Questionable Fountain", art:"fountain", terrain:"WATER", region:"MIDDLE", exits:["SIDE"], rule:"Once: Drink from the fountain. Its effect is uncertain.", flavor:"It smells of copper." },
  { id:"shop", type:"room", title:"Ruined Shop", art:"shop", terrain:"DUST", region:"UPPER", exits:["SIDE"], rule:"BARGAIN: Once, lose 2 HP to draw one Object. May be fatal.", flavor:"NO CREDIT. NO EXCEPTIONS." },
  { id:"crypt", type:"room", title:"Small Crypt", art:"crypt", terrain:"DARK", region:"DEEP", exits:["SIDE","LINK"], rule:"CACHE: Once, Key, DIGGING or 2 Hunger to draw one Object.", flavor:"There are seven coffins. Six lids." },
  { id:"nest", type:"room", title:"Fungal Nest", art:"mushroom", terrain:"SPORES", region:"MIDDLE", exits:["SIDE","LINK"], rule:"CACHE: Once, Key, DIGGING or 2 Hunger to draw one Object.", flavor:"Soft footsteps answer yours." },
  { id:"locked", type:"room", title:"Locked Gallery", art:"door", terrain:"LOCKED", region:"DEEP", exits:[], rule:"Spend a key on entry, or lose 2 hunger forcing the door.", flavor:"The lock has been repaired." },
  { id:"stairs", type:"room", title:"Stairwell", art:"stairs", terrain:"STAIRS", region:"UPPER", exits:["SIDE","LINK"], rule:"SIDE / LINK. A passage descends onward.", flavor:"Further down. Always further down." },
  { id:"trap", type:"room", title:"Tiled Passage", art:"trap", terrain:"TRAP", region:"MIDDLE", exits:[], rule:"On first entry: Spend a key or lose 2 HP.", flavor:"One tile is cleaner than the rest." }
];

export const APPEARANCES = [
  { id:"smoky", type:"potion", title:"Smoky Potion", art:"potion", rule:"DRINK or THROW. Its effect is unknown until tested.", flavor:"A pale curl moves inside." },
  { id:"milky", type:"potion", title:"Milky Potion", art:"potion", rule:"DRINK or THROW. Its effect is unknown until tested.", flavor:"Opaque as a cataract." },
  { id:"bubbling", type:"potion", title:"Bubbling Potion", art:"potion", rule:"DRINK or THROW. Its effect is unknown until tested.", flavor:"Still bubbling after years." },
  { id:"black", type:"potion", title:"Black Potion", art:"potion", rule:"DRINK or THROW. Its effect is unknown until tested.", flavor:"Light stops at the glass." },
  { id:"cloudy", type:"potion", title:"Cloudy Potion", art:"potion", rule:"DRINK or THROW. Its effect is unknown until tested.", flavor:"It settles upside down." }
];

export const EFFECTS = [
  { id:"healing", name:"Healing", drink:"Restore 5 HP.", thrown:"Deal 2 damage." },
  { id:"poison", name:"Poison", drink:"Lose 3 HP (Resistance ring blocks).", thrown:"Deal 5 damage, +2 against ORGANIC." },
  { id:"invisibility", name:"Invisibility", drink:"Ignore monster attacks for 3 turns.", thrown:"Blind the monster for 2 turns." },
  { id:"frost", name:"Frost", drink:"Restore 4 hunger.", thrown:"Deal 3 damage, +2 in water. Freeze the monster for 1 turn." },
  { id:"polymorph", name:"Polymorph", drink:"Permanently change attack by -1, 0 or +1.", thrown:"Turn the monster into a different random monster." }
];

export const ITEMS = [
  { id:"ration", type:"item", title:"Iron Ration", art:"ration", rule:"EAT: Restore 7 hunger.", flavor:"Tastes better in a crisis." },
  { id:"key", type:"item", title:"Rusty Key", art:"key", rule:"OPEN: Pass a locked room. Also jams a trap.", flavor:"Opens things that should stay closed." },
  { id:"amulet", type:"item", title:"Amulet of Yendor", art:"amulet", rule:"Carry this back to the entrance to win.", flavor:"Heavy for something so small." },
  { id:"dog", type:"item", title:"Faithful Dog", art:"dog", rule:"COMPANION: At turn end roll d6 for autonomous actions. Feed rations to retain the dog.", flavor:"A better judge of character than you." }
];

export const EVENTS = [
  { id:"unease", type:"event", title:"A Strange Feeling", art:"spiral", rule:"Lose 1 hunger.", flavor:"You are not the first." },
  { id:"bones", type:"event", title:"The Bones of Someone", art:"bones", rule:"Gain an Iron Ration.", flavor:"They almost made it." },
  { id:"whisper", type:"event", title:"Whispers Below", art:"whisper", rule:"Lose 2 hunger.", flavor:"Do not answer." },
  { id:"wind", type:"event", title:"Cold Draft", art:"wind", rule:"Restore 1 HP.", flavor:"There must be another opening." }
];

// Monster turn: draw and resolve exactly one behaviour card. Discard and reshuffle
// the shared pile when empty. Each copy is a physical card in the print kit.
export const BEHAVIOURS = [
  { id:"strike", type:"behaviour", title:"Strike", art:"key", copies:3, rule:"Attack once.", flavor:"The obvious choice is often enough." },
  { id:"lunge", type:"behaviour", title:"Lunge", art:"wind", copies:2, rule:"Attack once with +1 to the roll.", flavor:"Too quick to follow." },
  { id:"guard", type:"behaviour", title:"Guard", art:"knight", copies:2, rule:"Do not attack. Gain +1 DEF until your next behaviour.", flavor:"It waits behind its claws." },
  { id:"frenzy", type:"behaviour", title:"Frenzy", art:"spiral", copies:1, rule:"Attack twice, each with -1 to the roll.", flavor:"A dreadful commotion." },
  { id:"drain", type:"behaviour", title:"Drain", art:"ghost", copies:1, rule:"Do not attack. Hero loses 2 hunger.", flavor:"Something is missing." },
  { id:"recover", type:"behaviour", title:"Recover", art:"bones", copies:1, rule:"Do not attack. Monster regains 2 HP, up to maximum.", flavor:"It rises again." }
];

export const ENTRANCE = {
  id:"entrance", type:"room", title:"Dungeon Entrance", art:"stairs", terrain:"SAFE",
  rule:"RETURN WITH THE AMULET to ascend.", flavor:"Daylight is still possible."
};
export const VAULT = {
  id:"vault", type:"room", title:"Vault of Yendor", art:"crypt", terrain:"SACRED",
  rule:"Defeat the Amulet Warden. CLAIM the Amulet, then escape.", flavor:"There is no easy way back."
};

export const EQUIPMENT = [
  { id:"sword", type:"item", title:"Notched Sword", art:"key", rule:"ON REVEAL: d6 1=CURSED -1, 2-5=+1, 6=+2. EQUIP: apply modifier; cursed locks.", flavor:"Still sharp enough." },
  { id:"mail", type:"item", title:"Patchwork Mail", art:"knight", rule:"ON REVEAL: d6 1=CURSED -1, 2-5=+1, 6=+2. EQUIP: apply modifier; cursed locks.", flavor:"It smells of another hero." },
  { id:"charm", type:"item", title:"Lucky Bone", art:"bones", rule:"CONSUME: Restore 3 HP.", flavor:"A bit of somebody else." }
];

export const CATALOGUE = [...HEROES, ...MONSTERS, ...ITEMS, ...EQUIPMENT, ...APPEARANCES, ENTRANCE, VAULT, ...ROOMS, ...BEHAVIOURS, ...EVENTS, ...MAGICAL_CARDS, ...MAGIC_IDENTITIES, ...ECOLOGY_CARDS, ...INTRINSICS.map(x=>({...x,type:"intrinsic",art:"bones",flavor:"A permanent taste of the dungeon."})), ...PHASE6_CARDS];
export const TYPES = ["all","hero","monster","item","potion","room","behaviour","event","scroll","wand","ring","identity","ecology","intrinsic","tactic"];

// Print quantities describe a playable physical supply, not simply specimens.
// Distinct decks are printed separately and shuffled at setup.
export const PRINT_COPIES = {
  hero: { delver:1, wizard:1, knight:1, rogue:1 },
  monster: { rat:4, goblin:4, eye:3, rust:3, wraith:3, troll:3, sentinel:1 },
  room: { entrance:1, vault:1, corridor:4, flood:3, altar:2, fountain:2, shop:2,
    crypt:3, nest:3, locked:3, stairs:3, trap:3 },
  potion: { smoky:3, milky:3, bubbling:3, black:3, cloudy:3 },
  item: { ration:12, key:6, amulet:1, dog:1, sword:3, mail:3, charm:4 },
  behaviour: Object.fromEntries(BEHAVIOURS.map(x=>[x.id,x.copies])),
  event: { unease:2, bones:2, whisper:2, wind:2 },
  scroll:Object.fromEntries(MAGICAL_CARDS.filter(x=>x.type==="scroll").map(x=>[x.id,3])),
  wand:Object.fromEntries(MAGICAL_CARDS.filter(x=>x.type==="wand").map(x=>[x.id,3])),
  ring:Object.fromEntries(MAGICAL_CARDS.filter(x=>x.type==="ring").map(x=>[x.id,3])),
  identity:Object.fromEntries(MAGIC_IDENTITIES.map(x=>[x.id,1])),
  ecology:ECOLOGY_COPIES,
  tactic:PHASE6_COPIES,
  intrinsic:Object.fromEntries(INTRINSICS.map(x=>[x.id,1]))
};
export const printDeck = types => {
  const chosen = Array.isArray(types) ? types : [types];
  return CATALOGUE.filter(card=>chosen.includes(card.type))
    .flatMap(card=>Array.from({length:PRINT_COPIES[card.type]?.[card.id] || 0},(_,i)=>card.type==="ring"?{...card,blessing:["uncursed","blessed","cursed"][i%3]}:card));
};
