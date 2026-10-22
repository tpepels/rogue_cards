// Optional Everything Goes Item wave for 36-Room expeditions.
// All 18 cards have effects implemented in odd-item-effects.js.
// Artwork is intentionally absent until individually generated (176-193).
const ROWS=[
 [
  "loaded-coin",
  "Loaded Coin",
  "TOOL",
  [
   "METAL",
   "TOOL"
  ],
  "AFTER a d6 roll: discard to change it by +1 or -1 (minimum 1, maximum 6).",
  2,
  "It lands how it pleases."
 ],
 [
  "crooked-die",
  "Crooked Die",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "AFTER a d6 roll: discard to flip it to the opposite face (1 becomes 6, 2 becomes 5, 3 becomes 4).",
  2,
  "The pips crawl when nobody looks."
 ],
 [
  "lucky-thread",
  "Lucky Thread",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "BEFORE your d20 roll: discard to roll with ADV.",
  2,
  "Tied around a wrist three times."
 ],
 [
  "jinx-powder",
  "Jinx Powder",
  "TOOL",
  [
   "ALCHEMY",
   "TOOL"
  ],
  "BEFORE a Monster behaviour d6: discard to roll two dice and use the lower result.",
  2,
  "A pinch is usually enough."
 ],
 [
  "bent-mirror",
  "Bent Mirror",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "AFTER your d20 roll: discard to reroll it. You must keep the new result.",
  2,
  "It shows a face that is almost yours."
 ],
 [
  "fever-candle",
  "Fever Candle",
  "TOOL",
  [
   "TOOL",
   "FIRE"
  ],
  "OUTSIDE COMBAT: discard and lose 1 HP now; gain +3 on your next WIT test.",
  2,
  "Its wick burns from both ends."
 ],
 [
  "grave-salt",
  "Grave Salt",
  "TOOL",
  [
   "ALCHEMY",
   "TOOL"
  ],
  "BEFORE attacking a CURSED Monster: discard for +2 ATK and +2 DEF until that fight ends.",
  2,
  "The dead dislike the taste."
 ],
 [
  "hooked-chain",
  "Hooked Chain",
  "TOOL",
  [
   "METAL",
   "TOOL"
  ],
  "KEEP. Once per Room, AFTER a d6 roll, reduce it by 1 (minimum 1).",
  1,
  "Every link has a different purpose."
 ],
 [
  "sun-charm",
  "Sun Charm",
  "TOOL",
  [
   "TOOL",
   "LIGHT"
  ],
  "OUTSIDE COMBAT: discard to remove POISONED and clear all DIS penalties already waiting on you. Does not prevent new DIS.",
  2,
  "The rays are drawn the wrong way."
 ],
 [
  "mad-compass",
  "Mad Compass",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "BEFORE choosing a Room option: discard to peek at the next 2 Rooms. You may swap their order.",
  2,
  "It never points north."
 ],
 [
  "trick-knife",
  "Trick Knife",
  "EQUIPMENT",
  [
   "METAL",
   "WEAPON"
  ],
  "WEAPON: +1 ATK. Once per fight, AFTER your attack d20, change it by +1 or -1.",
  1,
  "Balanced for dishonest hands."
 ],
 [
  "chaos-idol",
  "Chaos Idol",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "AFTER a d6 or your d20 roll: discard to reroll that die twice. Keep the second new result.",
  1,
  "It never takes only once."
 ],
 [
  "witchbones",
  "Witchbones",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "AFTER a d6 roll: discard to set its face to 3 or 4.",
  2,
  "They always land in the middle."
 ],
 [
  "thorn-tonic",
  "Thorn Tonic",
  "TOOL",
  [
   "ALCHEMY",
   "TOOL"
  ],
  "OUTSIDE COMBAT: discard to heal 5 HP. Your next WIT test has DIS.",
  2,
  "One thorn to mend, one to sting."
 ],
 [
  "echo-bell",
  "Echo Bell",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "OUTSIDE COMBAT: discard; choose a kept Room with a later use. Mark one extra use of its printed effect. Spend one mark each time.",
  1,
  "Old promises answer twice."
 ],
 [
  "moon-lens",
  "Moon Lens",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "BEFORE choosing an option in a Room with a printed d6 table: discard and roll its d6 now. If you use that Room roll, keep this face; otherwise it expires on leaving.",
  2,
  "A future that might still happen."
 ],
 [
  "bone-dice",
  "Bone Dice",
  "TOOL",
  [
   "TOOL",
   "CURSED"
  ],
  "OUTSIDE COMBAT: discard; roll d6. 1-2: lose 1 HP; 3-4: draw 1 Item; 5-6: heal 2 HP.",
  2,
  "They ask to be thrown."
 ],
 [
  "red-string",
  "Red String",
  "TOOL",
  [
   "TOOL",
   "MAGIC"
  ],
  "OUTSIDE COMBAT (2 Heroes): discard. The face of your next d20 (after rerolls) is also the other Hero's next d20 face. They do not roll; each adds their own bonuses.",
  1,
  "Nobody remembers tying the knot."
 ]
];
export const ODD_ITEMS=Object.freeze(ROWS.map(([id,title,kind,tags,trigger,copies,flavor],i)=>
 Object.freeze({id:"odd-"+id,title,type:"item",stage:null,art:"expansion",
  copies,rule:trigger,flavor,printOnly:true,
  v2:{kind,tags,trigger,roll:null,alternative:"",links:[],number:176+i}})));
export const ODD_ITEM_IDS=Object.freeze(ODD_ITEMS.map(c=>c.id));
