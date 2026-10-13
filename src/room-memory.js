// Optional corridors and returning Rooms. Each effect is printed on its card.
const rows=[
 [
  "m-fungus",
  "MIDDLE",
  "Fungal Garden",
  "MYSTERY",
  "mushroom",
  "Mushrooms mimic familiar faces.",
  "PRESERVE",
  "Keep this Room. Instead of entering a later Room, discard it to heal 3 HP.",
  "PICK",
  "Roll d6 to harvest now.",
  "HARVEST",
  "garden"
 ],
 [
  "m-bridge",
  "MIDDLE",
  "Bridge of Whispering Rope",
  "HAZARD",
  "stairs",
  "The ropes remember a safe crossing.",
  "REMEMBER",
  "Keep this Room. When a Monster appears, discard it and an Item to escape.",
  "CROSS",
  "Roll d6 to cross now.",
  "CROSS",
  "bridge"
 ],
 [
  "m-well",
  "MIDDLE",
  "The Bottomless Well",
  "MYSTERY",
  "water",
  "An offering is never truly lost.",
  "OFFER",
  "Tuck 1 Item beneath this Room; heal 3 HP. Keep it. Entering DEEP, roll to retrieve the Item.",
  "LISTEN",
  "Peek at the next Room.",
  "DEEP RETURN",
  "well"
 ],
 [
  "m-clock",
  "MIDDLE",
  "Clockwork Confessional",
  "MYSTERY",
  "warden",
  "A brass mouth remembers every confession.",
  "BORROW",
  "Draw 1 Item. Keep this Room. At the Vault, discard an Item or roll d6.",
  "REFUSE",
  "Roll d6 now.",
  "PAYMENT",
  "debt"
 ],
 [
  "u-fork",
  "UPPER",
  "Forked Passage",
  "CORRIDOR",
  "corridor",
  "Two suspicious drafts.",
  "CHOOSE",
  "Reveal 2 Rooms. Enter 1; discard the other.",
  "SEARCH",
  "Roll d6, then reveal 2 Rooms and enter 1.",
  "SEARCH",
  "path"
 ],
 [
  "u-echoes",
  "UPPER",
  "Hall of Three Echoes",
  "CORRIDOR",
  "whisper",
  "One passage lies.",
  "LISTEN",
  "Reveal 3 Rooms. Discard 1 randomly, enter 1 of the others; put the last on the bottom.",
  "RUSH",
  "Roll d6, then reveal 2 Rooms and enter 1.",
  "RUSH",
  "path"
 ],
 [
  "u-mossy",
  "UPPER",
  "Mossy Switchback",
  "CORRIDOR",
  "mushroom",
  "A gentle way doubles back.",
  "REST",
  "Heal 1 HP. Reveal 2 Rooms; enter 1 and leave the other on top.",
  "HURRY",
  "Roll d6. Reveal 2 Rooms; enter 1.",
  "HURRY",
  "path"
 ],
 [
  "u-smuggler",
  "UPPER",
  "Smuggler's Crawl",
  "CORRIDOR",
  "corridor",
  "There are coins in the cracks.",
  "SQUEEZE",
  "Lose 1 HP; draw 1 Item. Reveal 2 Rooms; enter 1.",
  "TURN BACK",
  "Roll d6, then enter the next Room.",
  "TURN BACK",
  "path"
 ],
 [
  "u-candle",
  "UPPER",
  "Candle Tunnel",
  "CORRIDOR",
  "wind",
  "One candle burns backward.",
  "SAVE A PATH",
  "Reveal 2 Rooms. Enter 1; save the other for your next Room choice.",
  "EXTINGUISH",
  "Roll d6. Reveal 2 Rooms; enter 1.",
  "EXTINGUISH",
  "path"
 ],
 [
  "m-maps",
  "MIDDLE",
  "Gallery of Cracked Maps",
  "CORRIDOR",
  "wizard",
  "Three maps disagree.",
  "STUDY",
  "Reveal 2 Rooms; discard an Item to reveal a third. Enter 1.",
  "TEAR",
  "Roll d6. Reveal 2 Rooms and enter 1.",
  "TEAR",
  "path"
 ],
 [
  "m-ladder",
  "MIDDLE",
  "Rope Ladder Junction",
  "CORRIDOR",
  "stairs",
  "The ladder has two exits.",
  "CLIMB",
  "Reveal 2 Rooms; enter 1. If LAIR, gain ADV on your first attack; otherwise draw 1 Item.",
  "SLIDE",
  "Roll d6. Reveal 2 Rooms and enter 1.",
  "SLIDE",
  "path"
 ],
 [
  "m-red-detour",
  "MIDDLE",
  "The Red Detour",
  "CORRIDOR",
  "trap",
  "Red arrows point to treasure.",
  "FOLLOW",
  "Roll d6. Reveal 2 Rooms; enter TREASURE if shown, otherwise choose 1.",
  "IGNORE",
  "Reveal 2 Rooms; enter 1.",
  "FOLLOW",
  "path"
 ],
 [
  "d-whisper-junction",
  "DEEP",
  "Whispering Junction",
  "CORRIDOR",
  "ghost",
  "One path promises to follow you.",
  "PROMISE",
  "Reveal 2 Rooms. Enter 1. After your next Monster, enter the other.",
  "REFUSE",
  "Roll d6. Reveal 2 Rooms and enter 1.",
  "REFUSE",
  "path"
 ],
 [
  "d-gilded",
  "DEEP",
  "Gilded Hallway",
  "CORRIDOR",
  "shop",
  "Gilt conceals an old door.",
  "GAMBLE",
  "Reveal 2 Rooms; enter 1. If the discarded Room is TREASURE, draw 1 Item.",
  "PLAY SAFE",
  "Roll d6. Reveal 2 Rooms; enter 1.",
  "PLAY SAFE",
  "path"
 ],
 [
  "u-lantern-shrine",
  "UPPER",
  "Lantern Shrine",
  "SHRINE",
  "altar",
  "A lamp for the lost.",
  "SAVE",
  "Keep this Room. Discard it before a later Room d6 roll to add +2 (maximum 6).",
  "PRAY",
  "Roll d6 now.",
  "PRAYER",
  "lantern"
 ],
 [
  "u-leech-pool",
  "UPPER",
  "Leech Pool",
  "HAZARD",
  "water",
  "The leeches remember their debt.",
  "BORROW",
  "Heal 3 HP. Keep this Room. Entering DEEP, discard an Item or lose 2 HP.",
  "WADE",
  "Roll d6 now.",
  "WADE",
  "leech"
 ],
 [
  "u-rat-favor",
  "UPPER",
  "Rat King's Favor",
  "ENCOUNTER",
  "rat",
  "The king requests a handshake.",
  "ACCEPT",
  "Draw 1 Item. Keep this Room. At your next TREASURE Room, discard an Item or forfeit its first drawn Item.",
  "DECLINE",
  "Roll d6 for a gift.",
  "GIFT",
  "rat"
 ],
 [
  "m-second-name",
  "MIDDLE",
  "Shrine of the Second Name",
  "SHRINE",
  "altar",
  "Your shadow knows a second name.",
  "REMEMBER",
  "Keep this Room. If damage would reduce a Hero to 0 HP, discard it; that Hero stays at 1 HP.",
  "FORGET",
  "Roll d6 for a blessing.",
  "BLESSING",
  "name"
 ],
 [
  "m-wax-bridge",
  "MIDDLE",
  "Wax Bridge",
  "HAZARD",
  "stairs",
  "The bridge is slowly melting.",
  "SAVE",
  "Keep this Room. When a Monster appears, discard it and lose 1 HP to escape.",
  "CROSS",
  "Roll d6 now.",
  "CROSS",
  "wax"
 ],
 [
  "m-hungry-door",
  "MIDDLE",
  "The Hungry Door",
  "MYSTERY",
  "door",
  "Its hinges chew quietly.",
  "BORROW",
  "Draw 2 Items; discard 1. Keep this Room. At the Vault, discard an Item or roll d6.",
  "LEAVE",
  "Roll d6 now.",
  "PAYMENT",
  "hungry"
 ],
 [
  "d-apothecary",
  "DEEP",
  "Forgotten Apothecary",
  "SHRINE",
  "shop",
  "A bottle labelled 'for later'.",
  "SAVE",
  "Keep this Room. When you next take damage, discard it to prevent 2 damage.",
  "DRINK",
  "Roll d6 for medicine.",
  "MEDICINE",
  "apothecary"
 ],
 [
  "d-last-bell",
  "DEEP",
  "Chapel of the Last Bell",
  "SHRINE",
  "altar",
  "No one knows who rings the bell.",
  "DEFER",
  "Keep this Room. At the Vault, ring it: roll d6.",
  "RING",
  "Roll d6 now.",
  "THE BELL",
  "bell"
 ]
];
const tables={
 "path": [
  [
   "1–2",
   "Lose 1 HP.",
   "HURT:1"
  ],
  [
   "3–4",
   "No effect.",
   "NONE"
  ],
  [
   "5–6",
   "Draw 1 Item.",
   "DRAW:1"
  ]
 ],
 "garden": [
  [
   "1–2",
   "Become POISONED.",
   "POISON"
  ],
  [
   "3–4",
   "Heal 2 HP.",
   "HEAL:2"
  ],
  [
   "5–6",
   "Draw 1 Item.",
   "DRAW:1"
  ]
 ],
 "bridge": [
  [
   "1–2",
   "TRAP: Lose d6 HP.",
   "HURT:d6"
  ],
  [
   "3–4",
   "Cross safely.",
   "NONE"
  ],
  [
   "5–6",
   "Draw 1 Item.",
   "DRAW:1"
  ]
 ],
 "well": [
  [
   "1–3",
   "Lose 2 HP; recover your Item.",
   "HURT:2"
  ],
  [
   "4–5",
   "Recover your Item.",
   "NONE"
  ],
  [
   "6",
   "Recover it; heal 1 HP.",
   "HEAL:1"
  ]
 ],
 "debt": [
  [
   "1–2",
   "Lose 3 HP.",
   "HURT:3"
  ],
  [
   "3–4",
   "Lose 1 HP.",
   "HURT:1"
  ],
  [
   "5–6",
   "The debt is forgiven.",
   "NONE"
  ]
 ],
 "lantern": [
  [
   "1–2",
   "Lose 1 HP.",
   "HURT:1"
  ],
  [
   "3–4",
   "Heal 1 HP.",
   "HEAL:1"
  ],
  [
   "5–6",
   "Draw 1 Item.",
   "DRAW:1"
  ]
 ],
 "leech": [
  [
   "1–2",
   "Lose 2 HP.",
   "HURT:2"
  ],
  [
   "3–4",
   "No effect.",
   "NONE"
  ],
  [
   "5–6",
   "Heal 1 HP.",
   "HEAL:1"
  ]
 ],
 "rat": [
  [
   "1–2",
   "Lose 1 HP.",
   "HURT:1"
  ],
  [
   "3–4",
   "No effect.",
   "NONE"
  ],
  [
   "5–6",
   "Draw 1 Item.",
   "DRAW:1"
  ]
 ],
 "name": [
  [
   "1–2",
   "Lose 1 HP.",
   "HURT:1"
  ],
  [
   "3–4",
   "Heal 2 HP.",
   "HEAL:2"
  ],
  [
   "5–6",
   "Draw 1 Item.",
   "DRAW:1"
  ]
 ],
 "wax": [
  [
   "1–2",
   "Lose 2 HP.",
   "HURT:2"
  ],
  [
   "3–4",
   "No effect.",
   "NONE"
  ],
  [
   "5–6",
   "Draw 1 Item.",
   "DRAW:1"
  ]
 ],
 "hungry": [
  [
   "1–2",
   "Lose 3 HP.",
   "HURT:3"
  ],
  [
   "3–4",
   "Lose 1 HP.",
   "HURT:1"
  ],
  [
   "5–6",
   "No effect.",
   "NONE"
  ]
 ],
 "apothecary": [
  [
   "1–2",
   "Become POISONED.",
   "POISON"
  ],
  [
   "3–4",
   "Heal 2 HP.",
   "HEAL:2"
  ],
  [
   "5–6",
   "Heal 3 HP.",
   "HEAL:3"
  ]
 ],
 "bell": [
  [
   "1–2",
   "Lose 2 HP.",
   "HURT:2"
  ],
  [
   "3–4",
   "No effect.",
   "NONE"
  ],
  [
   "5–6",
   "ADV on the next attack.",
   "NEXT_ADV"
  ]
 ]
};
const make=([id,stage,title,kind,art,prompt,a,ea,b,eb,label,mode])=>({
 id,stage,title,art,type:"room",copies:1,rule:prompt,flavor:"",v2:{kind,prompt,
 choices:[{label:a,effect:ea},{label:b,effect:eb}],
 roll:{label,die:"d6",outcomes:tables[mode].map(([range,effect])=>({range,effect}))},
 links:[],special:{mode,corridor:kind==="CORRIDOR",rollOps:tables[mode].map(x=>[x[2]])}}
});
export const SPECIAL_ROOM_CARDS=Object.freeze(rows.map(make));
export const ROOM_REVISIONS=Object.freeze(SPECIAL_ROOM_CARDS.filter(c=>["m-fungus","m-bridge","m-well","m-clock"].includes(c.id)));
export const EXTRA_ROOMS=Object.freeze(SPECIAL_ROOM_CARDS.filter(c=>!ROOM_REVISIONS.includes(c)));
