// Print-only, dungeon-first expansion. Intentionally NOT imported into engine/Oracle.
// These cards use existing rules, resolve inside one Room, and never create Pacts/KEEP effects.
const room=(id,title,stage,kind,prompt,choices,outcomes,flavor)=>({
 id,title,art:"expansion",stage,type:"room",copies:1,rule:prompt,flavor,
 printOnly:true,v2:{kind,prompt,choices:choices.map(([label,effect])=>({label,effect})),
  roll:{label:"ROOM",die:"d6",outcomes:outcomes.map(([range,effect])=>({range,effect}))},
  links:[],number:140}
});
const item=(id,title,kind,tags,trigger,copies,flavor)=>({
 id,title,art:"expansion",type:"item",copies,rule:trigger,flavor,printOnly:true,
 v2:{kind,tags,trigger,roll:null,alternative:"",links:[],number:140}
});
const R=[
 ["ex-u-guard-cell","Empty Guard Cell","UPPER","MYSTERY","The cell door hangs open.",
  [["SEARCH","Roll d6."],["WALK AWAY","Leave without taking anything."]],
  [["1–2","A prisoner stirs. Draw an UPPER Monster."],["3–4","Find a forgotten Item. Draw 1."],["5–6","Find a hidden bundle. Draw 2 Items."]],"The lock is on the outside."],
 ["ex-u-slick-passage","Slick Passage","UPPER","HAZARD","Water coats the stone.",
  [["DASH","Roll d6."],["STEP CAREFULLY","Lose 1 HP; cross safely."]],
  [["1–2","Slip on the stones. Lose 2 HP."],["3–4","Cross safely."],["5–6","Find a dropped Item. Draw 1."]],"A very old puddle."],
 ["ex-u-coal-store","Coal Store","UPPER","TREASURE","Sacks of cold coal crowd a store.",
  [["SCAVENGE","Roll d6."],["REST","Discard 1 Item to heal 3 HP."]],
  [["1–2","A shelf falls. Lose 2 HP."],["3–4","Find a useful Item. Draw 1."],["5–6","Find a hidden supply box. Draw 2 Items."]],"Someone left the fire out."],
 ["ex-u-cracked-hall","Cracked Hallway","UPPER","CORRIDOR","A cracked wall divides the passage.",
  [["CHECK THE WALL","Peek at the next Room."],["HURRY","Roll d6."]],
  [["1–2","Loose stones fall. Lose 1 HP."],["3–4","Nothing happens."],["5–6","Find a lost pack. Draw 1 Item."]],"The shortest way still turns."],
 ["ex-u-spoiled-pantry","Spoiled Pantry","UPPER","TREASURE","The bread has learned to move.",
  [["RUMMAGE","Roll d6."],["LEAVE","Shut the pantry and move on."]],
  [["1–2","Moldy air: become POISONED."],["3–4","Find 1 wrapped Item."],["5–6","Find 2 wrapped Items."]],"A bad smell has settled in."],
 ["ex-m-prison-block","Prison Block","MIDDLE","MYSTERY","A row of cells stands unlocked.",
  [["OPEN A CELL","Roll d6."],["PRY THE BARS","Lose 1 HP; draw 1 Item."]],
  [["1–2","A prisoner attacks. Draw a MIDDLE Monster."],["3–4","Find 1 abandoned Item."],["5–6","Find 2 Items beneath a cot."]],"No one remembers the sentence."],
 ["ex-m-slanted-causeway","Slanted Causeway","MIDDLE","HAZARD","The floor leans toward a dark shaft.",
  [["RUN","Roll d6."],["CRAWL","Lose 2 HP; draw 1 Item."]],
  [["1–2","Fall against the wall. Lose d6 HP."],["3–4","Reach the other end."],["5–6","Find a bundle. Draw 1 Item."]],"The angle gets worse."],
 ["ex-m-old-barracks","Abandoned Barracks","MIDDLE","TREASURE","Empty bunks line the stone walls.",
  [["SEARCH","Roll d6."],["SLEEP","Discard 1 Item to heal 4 HP."]],
  [["1–2","A sleeper wakes. Draw a MIDDLE Monster."],["3–4","Find a soldier's Item. Draw 1."],["5–6","Search the lockers. Draw 2 Items."]],"The beds are still warm."],
 ["ex-m-footbridge","Narrow Footbridge","MIDDLE","HAZARD","A thin walkway crosses black water.",
  [["CROSS","Roll d6."],["USE THE HANDRAIL","Lose 1 HP; cross safely."]],
  [["1–2","Fall and scrape the rocks. Lose d6 HP."],["3–4","Cross safely."],["5–6","Find a dropped Item. Draw 1."]],"It bends but does not break."],
 ["ex-m-drain-tunnel","Drain Tunnel","MIDDLE","CORRIDOR","An old drain splits the passage.",
  [["CHECK THE DRAIN","Roll d6."],["TAKE THE SIDE PASSAGE","Peek at the next 2 Rooms."]],
  [["1–2","Filth coats you. Become POISONED."],["3–4","The water carries nothing."],["5–6","Fish out an Item. Draw 1."]],"Something travels upstream."],
 ["ex-d-flooded-cell","Drowned Cell","DEEP","MYSTERY","A flooded cell holds a chained chest.",
  [["FORCE THE BARS","Roll d6."],["SQUEEZE THROUGH","Lose 2 HP; draw 1 Item."]],
  [["1–2","The occupant rises. Draw a DEEP Monster."],["3–4","Reach 1 Item in the water."],["5–6","Find 2 Items beneath the floor."]],"The water knows the prisoner."],
 ["ex-d-ash-corridor","Ash Corridor","DEEP","CORRIDOR","Grey ash drifts from a sealed door.",
  [["HURRY","Roll d6."],["COVER YOUR FACE","Lose 1 HP; cross safely."]],
  [["1–2","Breathe burning dust. Lose 3 HP."],["3–4","Cross safely."],["5–6","A cool draft restores 2 HP."]],"Nobody lit the fire."],
 ["ex-d-cracked-coffer","Cracked Coffer","DEEP","TREASURE","A small chest leaks rusty water.",
  [["OPEN","Roll d6."],["BREAK THE LOCK","Lose 2 HP; draw 1 Item."]],
  [["1–2","TRAP: the lid cuts you. Lose d6 HP."],["3–4","Take 1 Item."],["5–6","Take 2 Items."]],"The lid is already moving."],
 ["ex-d-iron-stairs","Iron Stairs","DEEP","HAZARD","Steps hang above an unseen drop.",
  [["CLIMB","Roll d6."],["TAKE YOUR TIME","Lose 1 HP; peek at next Room."]],
  [["1–2","A step falls away. Lose 3 HP."],["3–4","Reach the landing."],["5–6","Find 1 Item under the steps."]],"Each step makes a different note."],
 ["ex-d-watchpost","Vacant Watchpost","DEEP","LAIR","An abandoned guard post faces the Vault.",
  [["SEARCH","Roll d6."],["REST","Heal 2 HP and move on."]],
  [["1–2","The last guard returns. Draw a DEEP Monster."],["3–4","Find 1 Item."],["5–6","Find 2 Items in a hidden compartment."]],"There is dust on the sentry's chair."]
];
const O=[
 ["ex-bandages","Linen Bandages","TOOL",["ALCHEMY","TOOL"],"OUTSIDE COMBAT: Discard to heal d6 HP.",3,"Still clean enough."],
 ["ex-lockpicks","Lockpick Set","TOOL",["METAL","TOOL"],"AT A LOCKED ROOM: Discard to reroll that Room's d6 once. Use the new result.",2,"Four picks, three bent."],
 ["ex-rations","Dry Rations","TOOL",["TOOL"],"OUTSIDE COMBAT: Discard to heal 2 HP.",3,"Hard bread travels far."],
 ["ex-dagger","Plain Dagger","EQUIPMENT",["METAL","WEAPON"],"WEAPON: +1 ATK while equipped.",3,"Sharp enough to argue."],
 ["ex-mace","Heavy Mace","EQUIPMENT",["METAL","WEAPON"],"WEAPON: +2 ATK while equipped.",2,"The handle has old teeth marks."],
 ["ex-spear","Short Spear","EQUIPMENT",["WOOD","WEAPON"],"WEAPON: +1 ATK; +2 ATK instead against BEAST Monsters.",2,"Longer than the corridor."],
 ["ex-jerkin","Leather Jerkin","EQUIPMENT",["ARMOUR"],"ARMOUR: +1 DEF while equipped.",3,"The seams hold."],
 ["ex-helm","Iron Helm","EQUIPMENT",["METAL","ARMOUR"],"ARMOUR: +1 DEF. When hit, discard the Helm to prevent 3 damage.",2,"It smells of pennies."],
 ["ex-buckler","Wooden Buckler","EQUIPMENT",["WOOD","ARMOUR"],"ARMOUR: +2 DEF while equipped.",2,"Painted with a crooked sun."]
];
export const PRINT_ONLY_ROOMS=Object.freeze(R.map((row,i)=>Object.freeze({...room(...row),v2:{...room(...row).v2,number:140+i}})));
export const PRINT_ONLY_ITEMS=Object.freeze(O.map((row,i)=>Object.freeze({...item(...row),v2:{...item(...row).v2,number:155+i}})));
export const PRINT_ONLY_CARDS=Object.freeze([...PRINT_ONLY_ROOMS,...PRINT_ONLY_ITEMS]);

// Artwork aliases are intentionally explicit and separate from the 139 canonical image assignments.
// New art has not yet been commissioned; each printed expansion face reuses an existing dungeon illustration.
export const PRINT_ONLY_ART=Object.freeze({
 "room:ex-u-guard-cell":"131_the_hollow_knight.png",
 "room:ex-u-slick-passage":"009_dripping_passage.png",
 "room:ex-u-coal-store":"011_forgotten_supplies.png",
 "room:ex-u-cracked-hall":"112_forked_passage.png",
 "room:ex-u-spoiled-pantry":"012_rat_nest.png",
 "room:ex-m-prison-block":"018_the_puppet_judge.png",
 "room:ex-m-slanted-causeway":"118_rope_ladder_junction.png",
 "room:ex-m-old-barracks":"024_opened_crypt.png",
 "room:ex-m-footbridge":"027_bridge_of_whispering_rope.png",
 "room:ex-m-drain-tunnel":"033_lightless_hall.png",
 "room:ex-d-flooded-cell":"021_flooded_chamber.png",
 "room:ex-d-ash-corridor":"033_lightless_hall.png",
 "room:ex-d-cracked-coffer":"044_the_last_chest.png",
 "room:ex-d-iron-stairs":"034_broken_bridge.png",
 "room:ex-d-watchpost":"038_warden_s_threshold.png",
 "item:ex-bandages":"110_antidote.png",
 "item:ex-lockpicks":"060_rusty_key.png",
 "item:ex-rations":"011_forgotten_supplies.png",
 "item:ex-dagger":"068_notched_sword.png",
 "item:ex-mace":"070_whispering_blade.png",
 "item:ex-spear":"069_ashwood_staff.png",
 "item:ex-jerkin":"071_patchwork_mail.png",
 "item:ex-helm":"073_burial_mail.png",
 "item:ex-buckler":"072_warded_shield.png"
});
