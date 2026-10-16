// Twelve Everything Goes Monsters. Each printed behavior has a matching engine opcode.
const ROWS=[
 [
  "drain-leech",
  "Drain Leech",
  "UPPER",
  7,
  3,
  1,
  [
   "Cling: no attack.",
   "Bite: ATTACK.",
   "Drain: ATTACK; on hit, heal 1 HP.",
   "Leap: ATTACK with ADV."
  ],
  [
   "none",
   "hit",
   "heal-hit",
   "adv"
  ],
  "WIT",
  4,
  "FIRE",
  6,
  [
   "BEAST"
  ]
 ],
 [
  "keyhole-mimic",
  "Keyhole Mimic",
  "UPPER",
  9,
  3,
  2,
  [
   "Wait: no attack.",
   "Snap: ATTACK.",
   "Snatch: discard 1 carried Item, or lose 2 HP.",
   "Lunge: ATTACK with ADV."
  ],
  [
   "none",
   "hit",
   "steal",
   "adv"
  ],
  "ITEM",
  1,
  "METAL",
  6,
  [
   "DARK"
  ]
 ],
 [
  "dust-skeleton",
  "Dust Skeleton",
  "UPPER",
  8,
  3,
  3,
  [
   "Crumble: no attack.",
   "Claw: ATTACK.",
   "Dust: next Hero attack has DIS.",
   "Strike: ATTACK with +2 ATK."
  ],
  [
   "none",
   "hit",
   "dis",
   "strong"
  ],
  "WIT",
  4,
  "FIRE",
  5,
  [
   "CURSED"
  ]
 ],
 [
  "lantern-moth",
  "Lantern Moth",
  "UPPER",
  6,
  3,
  3,
  [
   "Hover: no attack.",
   "Swoop: ATTACK.",
   "Dazzle: next Hero attack has DIS.",
   "Sting: ATTACK with ADV."
  ],
  [
   "none",
   "hit",
   "dis",
   "adv"
  ],
  "WIT",
  3,
  "FIRE",
  6,
  [
   "BEAST",
   "LIGHT"
  ]
 ],
 [
  "wax-golem",
  "Wax Golem",
  "MIDDLE",
  12,
  4,
  3,
  [
   "Drip: no attack.",
   "Slap: ATTACK.",
   "Harden: next Hero attack has DIS.",
   "Strike: ATTACK with +2 damage."
  ],
  [
   "none",
   "hit",
   "dis",
   "heavy"
  ],
  "ITEM",
  1,
  "FIRE",
  5,
  [
   "MAGIC"
  ]
 ],
 [
  "drowned-jailer",
  "Drowned Jailer",
  "MIDDLE",
  11,
  4,
  4,
  [
   "Rattle keys: no attack.",
   "Hook: ATTACK.",
   "Confiscate: discard 1 Item, or lose 2 HP.",
   "Chain: ATTACK with ADV."
  ],
  [
   "none",
   "hit",
   "steal",
   "adv"
  ],
  "ITEM",
  2,
  "FIRE",
  6,
  [
   "CURSED",
   "METAL"
  ]
 ],
 [
  "ropebound-hound",
  "Ropebound Hound",
  "MIDDLE",
  10,
  5,
  2,
  [
   "Sniff: no attack.",
   "Bite: ATTACK.",
   "Tangle: next Hero attack has DIS.",
   "Lunge: ATTACK with ADV."
  ],
  [
   "none",
   "hit",
   "dis",
   "adv"
  ],
  "WIT",
  5,
  "BEAST",
  6,
  [
   "BEAST"
  ]
 ],
 [
  "bell-beetle",
  "Bell Beetle",
  "MIDDLE",
  12,
  4,
  3,
  [
   "Listen: no attack.",
   "Mandibles: ATTACK.",
   "Chime: next Hero attack has DIS.",
   "Crush: ATTACK with +2 damage."
  ],
  [
   "none",
   "hit",
   "dis",
   "heavy"
  ],
  "ITEM",
  1,
  "METAL",
  6,
  [
   "BEAST",
   "METAL"
  ]
 ],
 [
  "ash-penitent",
  "Ash Penitent",
  "DEEP",
  14,
  5,
  4,
  [
   "Bow: next Hero attack has DIS.",
   "Cinder hand: ATTACK.",
   "Ash: target becomes POISONED.",
   "Penitence: ATTACK with ADV."
  ],
  [
   "dis",
   "hit",
   "poison",
   "adv"
  ],
  "WIT",
  6,
  "MAGIC",
  6,
  [
   "CURSED"
  ]
 ],
 [
  "vault-parasite",
  "Vault Parasite",
  "DEEP",
  13,
  5,
  3,
  [
   "Coil: next Hero attack has DIS.",
   "Bite: ATTACK.",
   "Feed: ATTACK; on hit heal 1 HP.",
   "Clutch: ATTACK with ADV."
  ],
  [
   "dis",
   "hit",
   "heal-hit",
   "adv"
  ],
  "ITEM",
  2,
  "FIRE",
  6,
  [
   "BEAST",
   "DARK"
  ]
 ],
 [
  "bone-cantor",
  "Bone Cantor",
  "DEEP",
  15,
  5,
  4,
  [
   "Hymn: next Hero attack has DIS.",
   "Knuckle: ATTACK.",
   "Rot: target becomes POISONED.",
   "Final note: ATTACK with +2 damage."
  ],
  [
   "dis",
   "hit",
   "poison",
   "heavy"
  ],
  "WIT",
  6,
  "FIRE",
  5,
  [
   "CURSED",
   "MAGIC"
  ]
 ],
 [
  "glass-revenant",
  "Glass Revenant",
  "DEEP",
  13,
  6,
  5,
  [
   "Glimmer: next Hero attack has DIS.",
   "Shard: ATTACK.",
   "Fracture: next Monster attack ignores 2 DEF.",
   "Shatter: ATTACK with ADV."
  ],
  [
   "dis",
   "hit",
   "def-break",
   "adv"
  ],
  "WIT",
  6,
  "METAL",
  6,
  [
   "MAGIC"
  ]
 ]
];
export const EXTRA_MONSTERS=Object.freeze(ROWS.map(([id,title,stage,hp,atk,def,behavior,behaviorOps,parleyMode,parleyCost,weaknessTag,weaknessFace,tags],i)=>{
 const weakness=`With a ${weaknessTag} Item, treat behaviour ${weaknessFace} as 1–2.`;
 const parley=parleyMode==="WIT"?
  `ESCAPE: opposed d20+WIT vs d20+${parleyCost}. Win: leave without reward; lose: fight.`:
  `OFFER: discard ${parleyCost} Item${parleyCost===1?"":"s"} to avoid this fight. No reward.`;
 return Object.freeze({id,title,stage,hp,atk,def,behavior,art:"expansion",copies:2,
  type:"monster",printOnly:true,rule:"",flavor:"",
  v2:{kind:"MONSTER",number:164+i,tags,weakness,weaknessTag,weaknessFace,
   parley,parleyMode,parleyCost,behaviorOps,genericRemains:true,
   remains:"EAT: d6: 1–2 lose 2 HP; 3–4 heal 2 HP; 5–6 draw 1 Item."}});
}));
