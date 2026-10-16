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
  [["1–2","A prisoner stirs. Draw an UPPER Monster."],["3–4","Draw 1 Item from the cell."],["5–6","Draw 2 Items from a hidden bundle."]],"The lock is on the outside."],
 ["ex-u-slick-passage","Slick Passage","UPPER","HAZARD","Water coats the stone.",
  [["DASH","Roll d6."],["STEP CAREFULLY","Lose 1 HP; cross safely."]],
  [["1–2","Slip on the stones. Lose 2 HP."],["3–4","Cross safely."],["5–6","Draw 1 Item from the floor."]],"A very old puddle."],
 ["ex-u-coal-store","Coal Store","UPPER","TREASURE","Sacks of cold coal crowd a store.",
  [["SCAVENGE","Roll d6."],["REST","Discard 1 Item to heal 3 HP."]],
  [["1–2","A shelf falls. Lose 2 HP."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],"Someone left the fire out."],
 ["ex-u-cracked-hall","Cracked Hallway","UPPER","CORRIDOR","A cracked wall divides the passage.",
  [["CHECK THE WALL","Peek at the next Room."],["HURRY","Roll d6."]],
  [["1–2","Loose stones fall. Lose 1 HP; draw an UPPER Monster."],["3–4","Nothing happens."],["5–6","Draw 1 Item from a lost pack."]],"The shortest way still turns."],
 ["ex-u-spoiled-pantry","Spoiled Pantry","UPPER","TREASURE","The bread has learned to move.",
  [["RUMMAGE","Roll d6."],["LEAVE","Shut the pantry and move on."]],
  [["1–2","Moldy air: become POISONED."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],"A bad smell has settled in."],
 ["ex-m-prison-block","Prison Block","MIDDLE","MYSTERY","A row of cells stands unlocked.",
  [["OPEN A CELL","Roll d6."],["PRY THE BARS","Lose 1 HP; draw 1 Item."]],
  [["1–2","A prisoner attacks. Draw a MIDDLE Monster."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],"No one remembers the sentence."],
 ["ex-m-slanted-causeway","Slanted Causeway","MIDDLE","HAZARD","The floor leans toward a dark shaft.",
  [["RUN","Roll d6."],["CRAWL","Lose 2 HP; draw 1 Item."]],
  [["1–2","Fall against the wall. Lose d6 HP."],["3–4","Reach the other end."],["5–6","Draw 1 Item."]],"The angle gets worse."],
 ["ex-m-old-barracks","Abandoned Barracks","MIDDLE","TREASURE","Empty bunks line the stone walls.",
  [["SEARCH","Roll d6."],["SLEEP","Discard 1 Item to heal 4 HP."]],
  [["1–2","A sleeper wakes. Draw a MIDDLE Monster."],["3–4","Draw 1 Item from a bunk."],["5–6","Draw 2 Items from the lockers."]],"The beds are still warm."],
 ["ex-m-footbridge","Narrow Footbridge","MIDDLE","HAZARD","A thin walkway crosses black water.",
  [["CROSS","Roll d6."],["USE THE HANDRAIL","Lose 1 HP; cross safely."]],
  [["1–2","Fall and scrape the rocks. Lose d6 HP."],["3–4","Cross safely."],["5–6","Draw 1 Item from the floor."]],"It bends but does not break."],
 ["ex-m-drain-tunnel","Drain Tunnel","MIDDLE","CORRIDOR","An old drain splits the passage.",
  [["CHECK THE DRAIN","Roll d6."],["TAKE THE SIDE PASSAGE","Peek at the next 2 Rooms."]],
  [["1–2","Filth coats you. Become POISONED; draw a MIDDLE Monster."],["3–4","The water carries nothing."],["5–6","Draw 1 Item from the water."]],"Something travels upstream."],
 ["ex-d-flooded-cell","Drowned Cell","DEEP","MYSTERY","A flooded cell holds a chained chest.",
  [["FORCE THE BARS","Roll d6."],["SQUEEZE THROUGH","Lose 2 HP; draw 1 Item."]],
  [["1–2","The occupant rises. Draw a DEEP Monster."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],"The water knows the prisoner."],
 ["ex-d-ash-corridor","Ash Corridor","DEEP","CORRIDOR","Grey ash drifts from a sealed door.",
  [["HURRY","Roll d6."],["COVER YOUR FACE","Lose 1 HP; cross safely."]],
  [["1–2","Burning ash fills the passage. Lose 1 HP; draw a DEEP Monster."],["3–4","Cross safely."],["5–6","Heal 2 HP."]],"Nobody lit the fire."],
 ["ex-d-cracked-coffer","Cracked Coffer","DEEP","TREASURE","A small chest leaks rusty water.",
  [["OPEN","Roll d6."],["BREAK THE LOCK","Lose 2 HP; draw 1 Item."]],
  [["1–2","TRAP: the lid cuts you. Lose d6 HP."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],"The lid is already moving."],
 ["ex-d-iron-stairs","Iron Stairs","DEEP","HAZARD","Steps hang above an unseen drop.",
  [["CLIMB","Roll d6."],["TAKE YOUR TIME","Lose 1 HP; peek at next Room."]],
  [["1–2","A step falls away. Lose 3 HP."],["3–4","Reach the landing."],["5–6","Draw 1 Item."]],"Each step makes a different note."],
 ["ex-d-watchpost","Vacant Watchpost","DEEP","LAIR","An abandoned guard post faces the Vault.",
  [["SEARCH","Roll d6."],["REST","Heal 2 HP and move on."]],
  [["1–2","The last guard returns. Draw a DEEP Monster."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],"There is dust on the sentry's chair."]
];
const O=[
 ["ex-bandages","Linen Bandages","TOOL",["ALCHEMY","TOOL"],"OUTSIDE COMBAT: Discard to heal d6 HP.",3,"Still clean enough."],
 ["ex-lockpicks","Lockpick Set","TOOL",["METAL","TOOL"],"After rolling d6 at Rusty Gate, Chest with a Pulse, Buried Lockbox or The Last Chest: discard to reroll once. The new result stands.",2,"Four picks, three bent."],
 ["ex-rations","Dry Rations","TOOL",["TOOL"],"OUTSIDE COMBAT: Discard to heal 2 HP.",3,"Hard bread travels far."],
 ["ex-dagger","Plain Dagger","EQUIPMENT",["METAL","WEAPON"],"WEAPON: +1 ATK while equipped.",3,"Sharp enough to argue."],
 ["ex-mace","Heavy Mace","EQUIPMENT",["METAL","WEAPON"],"WEAPON: +2 ATK while equipped.",2,"The handle has old teeth marks."],
 ["ex-spear","Short Spear","EQUIPMENT",["WOOD","WEAPON"],"WEAPON: +1 ATK, or +2 ATK against Monsters tagged BEAST.",2,"Longer than the corridor."],
 ["ex-jerkin","Leather Jerkin","EQUIPMENT",["ARMOUR"],"ARMOUR: +1 DEF while equipped.",3,"The seams hold."],
 ["ex-helm","Iron Helm","EQUIPMENT",["METAL","ARMOUR"],"ARMOUR: +1 DEF. When hit, discard this equipped Helm to prevent 3 damage from that hit.",2,"It smells of pennies."],
 ["ex-buckler","Wooden Buckler","EQUIPMENT",["WOOD","ARMOUR"],"ARMOUR: +2 DEF while equipped.",2,"Painted with a crooked sun."]
];
const ENTRY_MONSTERS=Object.freeze({"ex-u-guard-cell":"UPPER","ex-m-old-barracks":"MIDDLE","ex-d-watchpost":"DEEP"});
export const PRINT_ONLY_ROOMS=Object.freeze(R.map((row,i)=>{
 const base=room(...row),stage=ENTRY_MONSTERS[base.id];
 const prompt=stage?`On entry: Draw a ${stage} Monster. ${base.v2.prompt}`:base.v2.prompt;
 return Object.freeze({...base,rule:prompt,v2:{...base.v2,prompt,number:140+i}});
}));
export const PRINT_ONLY_ITEMS=Object.freeze(O.map((row,i)=>Object.freeze({...item(...row),v2:{...item(...row).v2,number:155+i}})));
export const PRINT_ONLY_CARDS=Object.freeze([...PRINT_ONLY_ROOMS,...PRINT_ONLY_ITEMS]);

// Dedicated artwork for the 24 added Rooms and Items (numbers 140-163).
// The twelve new regional Monsters (164-175) acquire individual entries here
// only after the illustration generator has successfully saved their PNGs.
// Until then, their printable card faces deliberately show a blank image area.
export const PRINT_ONLY_ART=Object.freeze({
 "room:ex-u-guard-cell":"140_empty_guard_cell.png",
 "room:ex-u-slick-passage":"141_slick_passage.png",
 "room:ex-u-coal-store":"142_coal_store.png",
 "room:ex-u-cracked-hall":"143_cracked_hallway.png",
 "room:ex-u-spoiled-pantry":"144_spoiled_pantry.png",
 "room:ex-m-prison-block":"145_prison_block.png",
 "room:ex-m-slanted-causeway":"146_slanted_causeway.png",
 "room:ex-m-old-barracks":"147_abandoned_barracks.png",
 "room:ex-m-footbridge":"148_narrow_footbridge.png",
 "room:ex-m-drain-tunnel":"149_drain_tunnel.png",
 "room:ex-d-flooded-cell":"150_drowned_cell.png",
 "room:ex-d-ash-corridor":"151_ash_corridor.png",
 "room:ex-d-cracked-coffer":"152_cracked_coffer.png",
 "room:ex-d-iron-stairs":"153_iron_stairs.png",
 "room:ex-d-watchpost":"154_vacant_watchpost.png",
 "item:ex-bandages":"155_linen_bandages.png",
 "item:ex-lockpicks":"156_lockpick_set.png",
 "item:ex-rations":"157_dry_rations.png",
 "item:ex-dagger":"158_plain_dagger.png",
 "item:ex-mace":"159_heavy_mace.png",
 "item:ex-spear":"160_short_spear.png",
 "item:ex-jerkin":"161_leather_jerkin.png",
 "item:ex-helm":"162_iron_helm.png",
 "item:ex-buckler":"163_wooden_buckler.png"
});
