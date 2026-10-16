// Twelve Everything Goes Monsters. Each printed behavior has a matching engine opcode.
import {MONSTER_DEFEATS} from "./monster-defeats.js";
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
const REMAINS={"drain-leech":["EAT","POISON","HEAL:2","HEAL:d6"],"keyhole-mimic":["SEARCH","HURT:2","DRAW:1","DRAW:2"],"dust-skeleton":["SEARCH","HURT:2","PEEK:1","DRAW:1"],"lantern-moth":["EAT","POISON","CURE","NEXT_ADV"],"wax-golem":["SEARCH","HURT:2","HEAL:2","DRAW:1"],"drowned-jailer":["SEARCH","HURT:2","DRAW:1","DRAW:2"],"ropebound-hound":["EAT","HURT:2","HEAL:2","PEEK:2"],"bell-beetle":["EAT","POISON","CURE","DRAW:1"],"ash-penitent":["SEARCH","HURT:d6","CURE","HEAL:d6"],"vault-parasite":["EAT","HURT:2","HEAL:2","DRAW:2"],"bone-cantor":["SEARCH","POISON","PEEK:2","DRAW:1"],"glass-revenant":["SEARCH","HURT:2","DEF_ADV","DRAW:2"]};
const REMAINS_TEXT={"POISON":"become POISONED","HURT:2":"lose 2 HP","HURT:d6":"lose d6 HP","HEAL:2":"heal 2 HP","HEAL:d6":"heal d6 HP","DRAW:1":"draw 1 Item","DRAW:2":"draw 2 Items","PEEK:1":"peek next Room","PEEK:2":"peek next 2 Rooms","CURE":"remove POISONED","NEXT_ADV":"next Hero attack has ADV","DEF_ADV":"next Monster attack against you has DIS"};
export const EXTRA_MONSTERS=Object.freeze(ROWS.map(([id,title,stage,hp,atk,def,behavior,behaviorOps,parleyMode,parleyCost,weaknessTag,weaknessFace,tags],i)=>{
 const weakness=`With a ${weaknessTag} Item, treat behaviour ${weaknessFace} as 1–2.`;
 const defeat=MONSTER_DEFEATS[id];if(!defeat)throw Error("Missing Monster DEFEAT: "+id);
 const [genericRemains,...remainsOps]=REMAINS[id];
 const remains=genericRemains+": d6. 1–2: "+REMAINS_TEXT[remainsOps[0]]+"; 3–4: "+REMAINS_TEXT[remainsOps[1]]+"; 5–6: "+REMAINS_TEXT[remainsOps[2]]+".";
 const parley=parleyMode==="WIT"?
  `ESCAPE: opposed d20+WIT vs d20+${parleyCost}. Win: leave without reward; lose: fight.`:
  `OFFER: discard ${parleyCost} Item${parleyCost===1?"":"s"} to avoid this fight. No reward.`;
 return Object.freeze({id,title,stage,hp,atk,def,behavior,art:"expansion",copies:2,
  type:"monster",printOnly:true,rule:"",flavor:"",
  v2:{kind:"MONSTER",number:164+i,tags,weakness,weaknessTag,weaknessFace,
   parley,parleyMode,parleyCost,behaviorOps,genericRemains,remainsOps,
   defeat:defeat.text,defeatOps:defeat.ops,remains}});
}));
