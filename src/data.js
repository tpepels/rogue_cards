// One source of truth for both the playable prototype and printable card catalogue.
// All artwork is keyed by a small reusable ink-drawing vocabulary.
export const HEROES = [
  { id:"delver", type:"hero", title:"Cave Delver", art:"delver", hp:12, attack:3, defense:1, rule:"Scavenge: Begin with an extra ration.", flavor:"The map is wrong. Again." },
  { id:"wizard", type:"hero", title:"Hedge Wizard", art:"wizard", hp:10, attack:2, defense:1, rule:"Oddments: Begin with two unidentified potions.", flavor:"Almost certainly harmless." },
  { id:"knight", type:"hero", title:"Wandering Knight", art:"knight", hp:14, attack:3, defense:2, rule:"Armoured: Your defence reduces incoming damage.", flavor:"An honourable way to die." },
  { id:"rogue", type:"hero", title:"Cutpurse", art:"rogue", hp:11, attack:3, defense:1, rule:"Quick hands: Start with a smoky potion and a key.", flavor:"Every lock is a suggestion." }
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
  { id:"corridor", type:"room", title:"Crooked Corridor", art:"corridor", terrain:"PASSAGE", rule:"Someone has scratched arrows into the stone.", flavor:"Neither arrow points out." },
  { id:"flood", type:"room", title:"Flooded Chamber", art:"water", terrain:"WATER", rule:"Fire potions do nothing here. Frost potions deal +2 damage.", flavor:"Something stirs below." },
  { id:"altar", type:"room", title:"Abandoned Altar", art:"altar", terrain:"SACRED", rule:"Once: Pray to restore 2 HP.", flavor:"The gods are not all absent." },
  { id:"fountain", type:"room", title:"Questionable Fountain", art:"fountain", terrain:"WATER", rule:"Once: Drink from the fountain. Its effect is uncertain.", flavor:"It smells of copper." },
  { id:"shop", type:"room", title:"Ruined Shop", art:"shop", terrain:"DUST", rule:"A looted counter holds something useful.", flavor:"NO CREDIT. NO EXCEPTIONS." },
  { id:"crypt", type:"room", title:"Small Crypt", art:"crypt", terrain:"DARK", rule:"Disturbing the dead is usually a bad idea.", flavor:"There are seven coffins. Six lids." },
  { id:"nest", type:"room", title:"Fungal Nest", art:"mushroom", terrain:"SPORES", rule:"The air tastes like old bread.", flavor:"Soft footsteps answer yours." },
  { id:"locked", type:"room", title:"Locked Gallery", art:"door", terrain:"LOCKED", rule:"Spend a key on entry, or lose 2 hunger forcing the door.", flavor:"The lock has been repaired." },
  { id:"stairs", type:"room", title:"Stairwell", art:"stairs", terrain:"STAIRS", rule:"Worn steps descend into the dark.", flavor:"Further down. Always further down." },
  { id:"trap", type:"room", title:"Tiled Passage", art:"trap", terrain:"TRAP", rule:"On entry: Lose 2 HP unless you have a key to jam the mechanism.", flavor:"One tile is cleaner than the rest." }
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
  { id:"poison", name:"Poison", drink:"Lose 3 HP.", thrown:"Deal 5 damage." },
  { id:"invisibility", name:"Invisibility", drink:"Ignore monster attacks for 3 turns.", thrown:"Blind the monster for 2 turns." },
  { id:"frost", name:"Frost", drink:"Restore 3 hunger.", thrown:"Deal 3 damage, +2 in water. Freeze the monster for 1 turn." },
  { id:"polymorph", name:"Polymorph", drink:"Permanently change attack by -1, 0 or +1.", thrown:"Turn the monster into a different random monster." }
];

export const ITEMS = [
  { id:"ration", type:"item", title:"Iron Ration", art:"ration", rule:"EAT: Restore 7 hunger.", flavor:"Tastes better in a crisis." },
  { id:"key", type:"item", title:"Rusty Key", art:"key", rule:"OPEN: Pass a locked room. Also jams a trap.", flavor:"Opens things that should stay closed." },
  { id:"amulet", type:"item", title:"Amulet of Yendor", art:"amulet", rule:"Carry this back to the entrance to win.", flavor:"Heavy for something so small." },
  { id:"dog", type:"item", title:"Faithful Dog", art:"dog", rule:"Once each battle, add 1 melee damage.", flavor:"A better judge of character than you." }
];

export const EVENTS = [
  { id:"unease", type:"event", title:"A Strange Feeling", art:"spiral", rule:"You feel the dungeon rearranging behind you.", flavor:"You are not the first." },
  { id:"bones", type:"event", title:"The Bones of Someone", art:"bones", rule:"A dead adventurer holds an ordinary ration.", flavor:"They almost made it." },
  { id:"whisper", type:"event", title:"Whispers Below", art:"whisper", rule:"Lose 1 hunger. Something knows your name.", flavor:"Do not answer." },
  { id:"wind", type:"event", title:"Cold Draft", art:"wind", rule:"A gust extinguishes your imaginary torch.", flavor:"There must be another opening." }
];

export const CATALOGUE = [...HEROES, ...MONSTERS, ...ITEMS, ...APPEARANCES, ...ROOMS, ...EVENTS];
export const TYPES = ["all","hero","monster","item","potion","room","event"];
