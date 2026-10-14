// Optional corridors and returning Rooms. Each effect is printed on its card.
const rows=[
 ["m-fungus","MIDDLE","Fungal Garden","MYSTERY","mushroom","Fungal faces sway in the spores.","PRESERVE","Keep this Room. On Monster behaviour, discard to set 1–2; next WIT roll has DIS. Discard a FIRE Item too to cancel the response.","PICK","Roll d6 to harvest.","HARVEST","garden"],
 ["m-bridge","MIDDLE","Bridge of Whispering Rope","HAZARD","stairs","The ropes are whispering names.","CUT A STRAND","Keep this Room as rope. At a non-Warden Monster, discard it and 1 Item to escape without reward.","CROSS","Roll d6. Knotted Rope may raise or lower the result by 1 (between 1 and 6).","CROSS","bridge"],
 [
  "m-well",
  "MIDDLE",
  "The Bottomless Well",
  "MYSTERY",
  "water",
  "An offering is never truly lost.",
  "OFFER",
  "Tuck 1 Item here; heal 3 HP and keep Room. On entering DEEP, leave the Item to heal 3 more HP, or roll this Room's d6 and recover it.",
  "LISTEN",
  "Peek at the next Room.",
  "DEEP RETURN",
  "well"
 ],
 ["m-clock","MIDDLE","Clockwork Confessional","MYSTERY","warden","A brass mouth demands a confession.","BORROW","Draw 1 Item; keep Room. At Vault, discard it and 1 Item to reveal Warden behaviour before acting; resolve afterward. If unpaid, use 6.","LIE","Roll d6 to deceive the machine.","LIE","debt"],
 ["u-fork","UPPER","Forked Passage","CORRIDOR","corridor","Two drafts indicate two possible routes.","CHOOSE","Reveal 2 Rooms; enter one and return the other to the bottom of its deck.","SEARCH","Roll d6 to search for an exit.","SEARCH","path"],
 ["u-echoes","UPPER","Hall of Three Echoes","CORRIDOR","whisper","One echo lies about the exit.","LISTEN","Take 3 Rooms face-down; randomly return 1 unseen to bottom. Reveal the other 2; enter one, return other to bottom.","RUSH","Roll d6 to follow an echo.","RUSH","path"],
 ["u-mossy","UPPER","Mossy Switchback","CORRIDOR","mushroom","A moss-covered slope doubles back.","REST","Heal 1 HP. Reveal 2 Rooms; enter one, leave other on top.","HURRY","Roll d6 to hurry downhill.","HURRY","path"],
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
 ["u-candle","UPPER","Candle Tunnel","CORRIDOR","wind","A small candle burns backward.","FOLLOW THE CANDLE","Reveal 2 Rooms; enter one, leave the other on top.","RISK THE FLAME","Roll d6.","EXTINGUISH","path"],
 ["m-maps","MIDDLE","Gallery of Cracked Maps","CORRIDOR","wizard","Three maps disagree about the corridor.","STUDY","Reveal 2 Rooms; discard 1 Item to reveal a third. Enter one, put the rest on bottom.","TEAR","Roll d6.","TEAR","path"],
 [
  "m-ladder",
  "MIDDLE",
  "Rope Ladder Junction",
  "CORRIDOR",
  "stairs",
  "Two routes.",
  "CLIMB",
  "Reveal 2 Rooms; enter 1. In a LAIR, first Hero attack has ADV; otherwise draw 1 Item.",
  "TAKE THE SHAFT",
  "Roll d6. Skip remaining Rooms; resolve the destination below.",
  "SHAFT",
  "shaft"
 ],
 ["m-red-detour","MIDDLE","The Red Detour","CORRIDOR","trap","Red arrows promise buried treasure.","IGNORE","Reveal 2 Rooms; enter one.","FOLLOW ARROWS","Roll d6 to follow the painted arrows.","FOLLOW","path"],
 [
  "d-whisper-junction",
  "DEEP",
  "Whispering Junction",
  "CORRIDOR",
  "ghost",
  "One path promises to follow you.",
  "PROMISE",
  "Reveal 2 Rooms. Enter 1. After your next Monster, enter the other.",
  "CURSED PASSAGE",
  "Roll d6 for a cursed detour; resolve the result, then continue DEEP.",
  "CURSED",
  "cursed"
 ],
 [
  "d-gilded",
  "DEEP",
  "Gilded Hallway",
  "CORRIDOR",
  "shop",
  "Gilt conceals an old door.",
  "GAMBLE",
  "Reveal 2 Rooms; enter one, discard the other. If the discarded Room was TREASURE, draw 1 Item.",
  "MAP EXIT",
  "Reveal 2 Rooms; enter 1. Keep this Room. After Warden Phase I, discard it and 2 Items (one MAGIC) to SMUGGLE.",
  "MAP EXIT",
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
  "Roll this Room's d6 now.",
  "PRAYER",
  "lantern"
 ],
 ["u-leech-pool","UPPER","Leech Pool","HAZARD","water","A jar of medicinal leeches needs blood.","JAR THE LEECHES","Heal 3 HP; keep this Room. On entering DEEP, discard an ALCHEMY Item or lose 2 HP; then discard Room.","WADE","Roll d6 to cross the pool.","WADE","leech"],
 [
  "u-rat-favor",
  "UPPER",
  "Rat King's Favor",
  "ENCOUNTER",
  "rat",
  "At Rat Nest, discard this kept Room to use the SOOTHE 5–6 outcome.",
  "ACCEPT",
  "Draw 1 Item. Keep this Room. If unused at Rat Nest, pay 1 Item at the next TREASURE Room or lose its first Item draw.",
  "DECLINE",
  "Roll this Room's d6 for a gift.",
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
  "Roll this Room's d6 for a blessing.",
  "BLESSING",
  "name"
 ],
 ["m-wax-bridge","MIDDLE","Wax Bridge","HAZARD","stairs","The bridge melts underfoot.","SCRAPE WAX","Keep this Room. Discard it to prevent 3 falling damage, or at Broken Bridge to resolve 3–4 instead of 1–2.","CROSS","Roll d6 to cross the wax.","CROSS","wax"],
 ["m-hungry-door","MIDDLE","The Hungry Door","MYSTERY","door","Its hinges chew.","FEED","Discard 1 Item; draw 2; keep Room. At Vault, discard 1 Item or Warden's first behaviour is 6. Then discard Room.","STARVE","Roll d6 to pass without feeding it.","STARVE","hungry"],
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
  "Roll this Room's d6 for medicine.",
  "MEDICINE",
  "apothecary"
 ],
 ["d-last-bell","DEEP","Chapel of the Last Bell","SHRINE","altar","Its bell sounds before being struck.","RING","Roll d6 to ring now.","SAVE","Keep Room. At Vault, lose 2 HP and discard. Roll Warden behaviour before acting; you may reroll and take the new result. Resolve after acting.","THE BELL","bell"]
];
const tables={
 "shaft":[
  ["1","Fall to DEEP; lose 4 HP; face a DEEP Monster.","TRAPDOOR:DEEP:4:MONSTER"],
  ["2–3","Fall to DEEP; lose 2 HP; face a DEEP Monster.","TRAPDOOR:DEEP:2:MONSTER"],
  ["4–5","Fall to DEEP; draw 1 Item.","TRAPDOOR:DEEP:0:DRAW1"],
  ["6","Find 3 Items; descend to DEEP.","TRAPDOOR:DEEP:0:DRAW3"]
 ],
 "cursed":[
  ["1–2","Draw a DEEP Monster.","MONSTER_DRAW"],
  ["3–4","Resolve the next MIDDLE Room's d6 result, then return to DEEP.","CURSED_DETOUR"],
  ["5–6","Find a secret cache. Draw 2 Items.","DRAW:2"]
 ],
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
// Printed results are separate from the legacy executable rollOps tables.
// The Oracle agent owns synchronising those handlers with this redesign.
const printedTables={
  "m-fungus": [
    [
      "1–2",
      "Spores: become POISONED; next WIT has DIS."
    ],
    [
      "3–4",
      "Eat safe caps: heal 2 HP."
    ],
    [
      "5–6",
      "Harvest 1 Item; remove POISONED."
    ]
  ],
  "m-bridge": [
    [
      "1–2",
      "TRAP: Rope snaps; lose d6 HP."
    ],
    [
      "3–4",
      "Cross safely."
    ],
    [
      "5–6",
      "Retrieve a pouch from the knots: draw 1 Item."
    ]
  ],
  "m-clock": [
    [
      "1–2",
      "Gears accuse you: lose 2 HP; next WIT has DIS."
    ],
    [
      "3–4",
      "Machine jams; nothing happens."
    ],
    [
      "5–6",
      "Penance slot opens: draw 1 Item."
    ]
  ],
  "u-fork": [
    [
      "1–2",
      "Dead end: reveal 2 Rooms; randomly enter one."
    ],
    [
      "3–4",
      "Reveal 2 Rooms; choose one."
    ],
    [
      "5–6",
      "Hidden third route: reveal 3 Rooms; choose one; return others to bottom."
    ]
  ],
  "u-echoes": [
    [
      "1–2",
      "Enter next Room unseen."
    ],
    [
      "3–4",
      "Reveal 2 Rooms; choose one."
    ],
    [
      "5–6",
      "Reveal 3 Rooms; enter one; return others to bottom."
    ]
  ],
  "u-mossy": [
    [
      "1–2",
      "Slip: lose 2 HP; enter next Room unseen."
    ],
    [
      "3–4",
      "Reveal 2 Rooms; choose one."
    ],
    [
      "5–6",
      "Follow moss: reveal 2 Rooms and order them; draw 1 herb-satchel Item."
    ]
  ],
  "u-candle": [
    [
      "1–2",
      "Pitch dark: enter next Room unseen; next ATK there has DIS."
    ],
    [
      "3–4",
      "Eyes adapt: reveal 2 Rooms; choose one."
    ],
    [
      "5–6",
      "Keep this Room as a candle; reveal 2 Rooms and choose one. Discard candle at Lightless Hall to cancel its attack DIS."
    ]
  ],
  "m-maps": [
    [
      "1–2",
      "Wrong map: move next Room unseen to bottom; enter following Room."
    ],
    [
      "3–4",
      "Reveal 2 Rooms, order them; enter first."
    ],
    [
      "5–6",
      "As 3–4; keep this Room. Discard to adjust one trapdoor d6 by ±1 (within 1–6)."
    ]
  ],
  "m-red-detour": [
    [
      "1–2",
      "Painted TRAP: lose d6 HP; enter next Room unseen."
    ],
    [
      "3–4",
      "Reveal 2 Rooms; enter a TREASURE if present, or choose one."
    ],
    [
      "5–6",
      "Reveal 3 Rooms; choose a TREASURE if present, else any one."
    ]
  ],
  "u-leech-pool": [
    [
      "1–2",
      "Leeches bite: lose 2 HP."
    ],
    [
      "3–4",
      "Cross safely."
    ],
    [
      "5–6",
      "They drink poison: remove POISONED, or heal 1 HP if healthy."
    ]
  ],
  "m-wax-bridge": [
    [
      "1–2",
      "TRAP: Deck melts; lose 2 HP."
    ],
    [
      "3–4",
      "Cross safely."
    ],
    [
      "5–6",
      "Retrieve an Item stuck in wax: draw 1."
    ]
  ],
  "m-hungry-door": [
    [
      "1–2",
      "Door bites: lose d6 HP; it swallows 1 Item. Lose 2 more HP to recover, or discard it."
    ],
    [
      "3–4",
      "Slip past while it chews."
    ],
    [
      "5–6",
      "Door spits up 1 Item; draw it."
    ]
  ],
  "d-last-bell": [
    [
      "1–2",
      "Bell attracts a DEEP Monster."
    ],
    [
      "3–4",
      "Keep Room; discard at next Monster to set its first behaviour to 1–2."
    ],
    [
      "5–6",
      "Keep Room; discard to skip next Monster's first response."
    ]
  ]
};
// Explicit executable transcription of rewritten retained/corridor Room rolls.
// Do not silently use the obsolete generic "path"/"debt" table after the
// printed card changes. A strict parity test covers these exact identifiers.
export const REVISED_ROOM_ROLL_OPS=Object.freeze({
 "m-fungus":[["POISON","NEXT_WIT_DIS"],["HEAL:2"],["DRAW:1","CURE"]],
 "m-bridge":[["HURT:d6"],["NONE"],["DRAW:1"]],
 "m-clock":[["HURT:2","NEXT_WIT_DIS"],["NONE"],["DRAW:1"]],
 "u-fork":[["FORK_REVEAL:2:RANDOM"],["FORK_REVEAL:2"],
   ["FORK_REVEAL:3"]],
 "u-echoes":[["NONE"],["FORK_REVEAL:2"],["FORK_REVEAL:3"]],
 "u-mossy":[["HURT:2"],["FORK_REVEAL:2"],
   ["FORK_ORDER:2","DRAW:1"]],
 "u-candle":[["NEXT_DIS"],["FORK_REVEAL:2"],
   ["KEEP_ROOM","FORK_REVEAL:2"]],
 "m-maps":[["PUSH_UNSEEN_ROOM"],["FORK_ORDER:2"],
   ["FORK_ORDER:2","KEEP_ROOM"]],
 "m-red-detour":[["HURT:d6"],["FORK_REVEAL:2:TREASURE"],
   ["FORK_REVEAL:3:TREASURE"]],
 "u-leech-pool":[["HURT:2"],["NONE"],["CURE_OR_HEAL:1"]],
 "m-wax-bridge":[["HURT:2"],["NONE"],["DRAW:1"]],
 "m-hungry-door":[["HURT:d6","HUNGRY_SWALLOW"],["NONE"],["DRAW:1"]],
 "d-last-bell":[["MONSTER_DRAW"],["BELL_SAVE:force"],
   ["BELL_SAVE:skip"]]
});
const make=([id,stage,title,kind,art,prompt,a,ea,b,eb,label,mode])=>({
 id,stage,title,art,type:"room",copies:1,rule:prompt,flavor:"",v2:{kind,prompt,
 choices:[{label:a,effect:ea},{label:b,effect:eb}],
 // Gilded Hallway has two corridor routes, neither of which rolls d6.
 // Do not print an unreachable third mechanism or register dead handlers.
 roll:id==="d-gilded"?null:
  {label,die:"d6",outcomes:(printedTables[id]||tables[mode]).map(([range,effect])=>({range,effect}))},
 links:[],special:{mode,corridor:kind==="CORRIDOR",
  rollOps:id==="d-gilded"?[]:
   REVISED_ROOM_ROLL_OPS[id]||tables[mode].map(x=>[x[2]])}}
});
export const SPECIAL_ROOM_CARDS=Object.freeze(rows.map(make));
export const ROOM_REVISIONS=Object.freeze(SPECIAL_ROOM_CARDS.filter(c=>["m-fungus","m-bridge","m-well","m-clock"].includes(c.id)));
export const EXTRA_ROOMS=Object.freeze(SPECIAL_ROOM_CARDS.filter(c=>!ROOM_REVISIONS.includes(c)));
