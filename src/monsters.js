// Rogue Cards — canonical Monster statistics and behaviour.
// Difficulty climbs from UPPER to DEEP. Each behaviour uses 1–2, 3–4, 5, 6.
const BASE=[
 ["rat","Giant Rat","rat","UPPER",6,2,1,["Sniff: no attack.","Bite: ATTACK.","Scatter: next Hero attack has DIS.","Pack Bite: ATTACK +2."]],
 ["goblin","Goblin Raider","goblin","UPPER",8,3,2,["Mock: no attack.","Knife: ATTACK.","Swipe: discard 1 held Item or lose 2 HP.","Ambush: ATTACK with ADV."]],
 ["crawler","Sewer Crawler","rust","UPPER",8,3,2,["Hide: next Hero attack has DIS.","Claw: ATTACK.","Acid: ATTACK; on hit POISONED.","Lunge: ATTACK +2."]],
 ["bat","Cave Bat Swarm","eye","UPPER",7,3,3,["Circle: no attack.","Swoop: ATTACK.","Howl: next Hero action has DIS.","Swoop: ATTACK with ADV."]],
 ["troll","Bridge Troll","troll","MIDDLE",12,4,3,["Grumble: no attack.","Club: ATTACK.","Regenerate: heal 2 HP unless scorched by FIRE.","Crush: ATTACK; on hit +2 damage."]],
 ["wisp","Will-o'-Wisp","spiral","MIDDLE",9,4,4,["Flicker: next Hero attack DIS.","Spark: ATTACK.","Mislead: active Hero loses 2 HP.","Flash: ATTACK with ADV."]],
 ["eye","Floating Eye","eye","MIDDLE",9,3,4,["Stare: no attack.","Gaze: ATTACK using +2 ATK.","Freeze: next Hero action has DIS.","Gaze: ATTACK with ADV."]],
 ["mold","Living Mold","mushroom","MIDDLE",11,4,2,["Spread: next Hero attack DIS.","Spores: active Hero POISONED.","Digest: ATTACK.","Bloom: ATTACK with ADV."]],
 ["wraith","Restless Shade","ghost","DEEP",13,5,4,["Fade: next Hero attack DIS.","Cold Hand: ATTACK.","Drain: ATTACK; if hit discard a held Item.","Haunt: ATTACK with ADV."]],
 ["rust","Rust Monster","rust","DEEP",14,5,3,["Sniff: no attack.","Gnaw: ATTACK.","Corrode: discard a METAL Item or lose 3 HP.","Gnaw: ATTACK with ADV."]],
 ["cultist","Forgotten Acolyte","wizard","DEEP",14,5,4,["Chant: its next attack gains ADV.","Hex: ATTACK using +6 ATK.","Curse: active Hero POISONED.","Hex: ATTACK with ADV."]],
 ["sentinel","Iron Sentinel","warden","DEEP",16,6,5,["Guard: next Hero attack DIS.","Hammer: ATTACK.","Crush: ATTACK; on hit +2 damage.","Hammer: ATTACK with ADV."]]
];

const SPEC=Object.freeze({
 rat:{tags:["BEAST"],weakness:"With a BEAST Companion, treat this Monster's d6 6 as 1–2.",
   parley:"FEED: Discard 1 Item to send it away. No corpse.",remains:"EAT d6: 1–2 POISONED; 3–4 heal 2 HP; 5–6 heal d6 HP."},
 goblin:{tags:["BEAST","BARGAIN"],weakness:"With Pocket Goblin, treat this Monster's d6 6 as 1–2.",
   parley:"RECRUIT: Discard 2 Items. Keep this as Companion (+1 ATK); no corpse.",remains:"EAT d6: 1–2 lose d6 HP; 3–4 heal 2 HP; 5–6 draw 1 Item."},
 crawler:{tags:["ACID"],weakness:"Discard an ALCHEMY Item to turn its next 5 into 1–2.",
   parley:"DISTRACT: Discard a POTION. It flees; no loot.",remains:"EAT d6: 1–2 POISONED; 3–4 heal 2 HP; 5–6 remove POISONED."},
 bat:{tags:["BEAST","DARK"],weakness:"With FIRE gear, treat this Monster's 6 as 1–2.",
   parley:"SNEAK: Opposed d20+WIT vs d20+3. Win: pass safely; fail: fight.",remains:"EAT d6: 1–2 lose 2 HP; 3–4 heal 2 HP; 5–6 peek next Room."},
 troll:{tags:["BEAST","REGEN"],weakness:"FIRE cancels its next Regenerate behaviour (5).",
   parley:"TOLL: Discard 2 Items to avoid this fight.",remains:"EAT d6: 1–2 POISONED; 3–4 heal d6 HP; 5–6 draw 1 Item."},
 wisp:{tags:["LIGHT","MAGIC"],weakness:"After activating an ICE Item, its next behaviour 6 becomes 1–2.",
   parley:"ESCAPE: Opposed d20+WIT vs d20+5. Win: peek next Room and escape; fail: fight.",remains:"EAT d6: 1–2 lose d6 HP; 3–4 heal 2 HP; 5–6 next d20 has ADV."},
 eye:{tags:["GAZE","MAGIC"],weakness:"With Ring of the Sideways Eye, its 6 becomes 1–2.",
   parley:"COVER EYES: Discard 1 Item; it leaves. No corpse.",remains:"EAT d6: 1–2 POISONED; 3–4 heal 2 HP; 5–6 peek next Room."},
 mold:{tags:["ALCHEMY","PLANT"],weakness:"FIRE: Its 6 becomes 1–2; ICE: its 5 becomes 1–2.",
   parley:"FEED: Discard a POTION; skip this fight. No corpse.",remains:"EAT d6: 1–2 POISONED; 3–4 heal d6 HP; 5–6 remove POISONED."},
 wraith:{tags:["CURSED","MAGIC"],weakness:"With MAGIC gear, treat this Monster's 5 as 1–2.",
   parley:"APPEASE: While wearing CURSED gear, lose d6 HP; it leaves. No loot.",remains:"EAT d6: 1–2 lose d6 HP; 3–4 heal 2 HP; 5–6 draw 1 Item."},
 rust:{tags:["METAL"],weakness:"Without METAL equipment, its 5 becomes 1–2.",
   parley:"FEED: Discard a METAL Item. It leaves; draw 1 Item.",remains:"EAT d6: 1–2 POISONED; 3–4 heal 2 HP; 5–6 gain ADV on next DEF."},
 cultist:{tags:["CURSED","BARGAIN"],weakness:"MAGIC: Turn its next 6 into 1–2 once.",
   parley:"BARGAIN: With equipped CURSED gear, lose d6 HP; it leaves; draw 1 Item.",remains:"EAT d6: 1–2 lose d6 HP; 3–4 heal 2 HP; 5–6 draw 1 Item."},
 sentinel:{tags:["METAL","LIGHTNING"],weakness:"LIGHTNING damage deals +d6; ICE turns its next 6 into 1–2.",
   parley:"BRIBE: Discard 2 METAL Items to bypass it. No loot.",remains:"No edible corpse."}
});

export const V2_MONSTERS=Object.freeze(BASE.map(([id,title,art,stage,hp,atk,def,behavior],i)=>{
 const s=SPEC[id];if(!s)throw new Error("Missing Monster ecology: "+id);
 return {id,title,art,stage,hp,atk,def,behavior,copies:stage==="UPPER"?3:2,type:"monster",
  flavor:"",v2:{kind:"MONSTER",number:i+1,tags:s.tags,
   weakness:s.weakness,parley:s.parley,remains:s.remains}};
}));
export const V2_MONSTER_BY_ID=Object.freeze(Object.fromEntries(V2_MONSTERS.map(m=>[m.id,m])));
