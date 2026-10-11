// Phase 3: every mystery family has the same number of appearances and identities.
// Only printed verbs are legal. Tags form a shared 14-property interaction vocabulary.
export const PROPERTIES = [
  ["fire","FIRE"],["water","WATER"],["cold","COLD"],["electricity","ELECTRICITY"],
  ["acid","ACID"],["poison","POISON"],["metal","METAL"],["wood","WOOD"],
  ["stone","STONE"],["dark","DARK"],["light","LIGHT"],["holy","HOLY"],
  ["digging","DIGGING"],["teleport","TELEPORT"],["organic","ORGANIC"]
].map(([id,title])=>({id,title}));

export const MAGIC = {
 scroll:{
  appearances:[
   ["ragged","Ragged Scroll"],["sealed","Sealed Scroll"],
   ["waxed","Waxed Scroll"],["crackling","Crackling Scroll"]
  ],
  effects:[
   {id:"flame",name:"Flame",property:"fire",rule:"READ: Deal 4 FIRE damage to a monster. WATER reduces this to 1."},
   {id:"mapping",name:"Mapping",property:"light",rule:"READ: Reveal a connected unexplored room without moving or triggering it."},
   {id:"ward",name:"Warding",property:"holy",rule:"READ: Gain 2 ward against the next two monster attacks."},
   {id:"banish",name:"Banishment",property:"teleport",rule:"READ: Move a non-Warden monster out of the room; it returns when revisited."}
  ]
 },
 wand:{
  appearances:[
   ["bone","Bone Wand"],["copper","Copper Wand"],["ash","Ash Wand"],["glass","Glass Wand"]
  ],
  effects:[
   {id:"spark",name:"Sparks",property:"electricity",rule:"ZAP: Deal 3 ELECTRICITY damage; +2 in WATER."},
   {id:"frost",name:"Frost",property:"cold",rule:"ZAP: Deal 2 COLD damage and freeze a monster for 1 monster turn."},
   {id:"burrow",name:"Digging",property:"digging",rule:"ZAP: Disarm the next TRAP or open the next LOCKED passage without a key."},
   {id:"corrode",name:"Acid",property:"acid",rule:"ZAP: Deal 2 ACID damage; +2 against METAL monsters."}
  ]
 },
 ring:{
  appearances:[
   ["etched","Etched Ring"],["ivory","Ivory Ring"],["twisted","Twisted Ring"],["brass","Brass Ring"]
  ],
  effects:[
   {id:"shield",name:"Protection",property:"metal",rule:"WEAR: +1 DEF."},
   {id:"lantern",name:"Light",property:"light",rule:"WEAR: DARK rooms do not impose their -1 attack penalty."},
   {id:"forager",name:"Sustenance",property:"wood",rule:"WEAR: Ignore the next 1 hunger loss each turn (minimum 0)."},
   {id:"resist",name:"Resistance",property:"poison",rule:"WEAR: Ignore poison and shade hunger-loss effects."}
  ]
 }
};
export const MAGICAL_CARDS = Object.entries(MAGIC).flatMap(([type,family])=>
  family.appearances.map(([id,title])=>({
    id, type, title, art:type==="ring"?"amulet":type==="wand"?"wizard":"whisper",
    rule:type==="scroll"?"READ: Reveal and resolve this scroll.":
      type==="wand"?"ZAP: Reveal and resolve; 3 charges total.":
      "WEAR: Reveal and equip; only one ring at a time.",
    flavor:type==="scroll"?"The runes will not stay still.":
      type==="wand"?"It hums with old secrets.":"A circle of unanswered questions."
  })));
export const MAGIC_IDENTITIES = Object.entries(MAGIC).flatMap(([type,family])=>family.effects.map(effect=>({
 id:type+"-"+effect.id,type:"identity",title:effect.name+" / "+type.toUpperCase(),
 art:type==="ring"?"amulet":type==="wand"?"wizard":"whisper",
 rule:effect.rule,flavor:"Keep hidden until this appearance is identified.",
 family:type,identity:effect.id,property:effect.property
})));
export const MAGIC_PRINT_COPIES = Object.fromEntries(
  MAGICAL_CARDS.map(c=>[c.type+":"+c.id,3])
);
export const magicDefinitions=(kind)=>MAGIC[kind]?.effects||[];
export const magicAppearance=(kind,id)=>MAGICAL_CARDS.find(c=>c.type===kind&&c.id===id);
export const MAGIC_TYPES=["scroll","wand","ring"];
