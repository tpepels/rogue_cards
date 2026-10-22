// Rogue Cards — canonical Monster statistics and behaviour.
import {MONSTER_DEFEATS} from "./monster-defeats.js";
// Difficulty climbs from UPPER to DEEP. Each behaviour uses 1–2, 3–4, 5, 6.
const BASE=[
 ["rat","Giant Rat","rat","UPPER",6,2,1,["Sniff: no attack.","Bite: ATTACK.","Scatter: next Hero attack has DIS.","Pack Bite: ATTACK with +2 ATK."]],
 ["goblin","Goblin Raider","goblin","UPPER",8,3,2,["Mock: no attack.","Knife: ATTACK.","Swipe: tuck 1 carried Item under this Monster; if none, lose 2 HP. Recover it on defeat; otherwise discard it.","Ambush: ATTACK with ADV."]],
 ["crawler","Sewer Crawler","rust","UPPER",8,3,2,["Hide: next Hero attack has DIS.","Claw: ATTACK.","Acid: ATTACK; on hit, discard 1 METAL Item or take 2 extra damage.","Lunge: ATTACK with +2 ATK."]],
 ["bat","Cave Bat Swarm","eye","UPPER",7,3,3,["Circle: no attack.","Swoop: ATTACK.","Howl: next Hero d20 roll has DIS.","Swoop: ATTACK with ADV."]],
 ["troll","Bridge Troll","troll","MIDDLE",12,4,3,["Grumble: no attack.","Club: ATTACK.","Regenerate: heal 2 HP unless damaged by FIRE since last Regenerate.","Crush: ATTACK; deal +2 damage on hit."]],
 ["wisp","Will-o'-Wisp","spiral","MIDDLE",9,4,4,["Flicker: next Hero attack has DIS.","Spark: ATTACK.","Lure: move next Room unseen to deck bottom; next Hero attack has DIS.","Flash: ATTACK with ADV; on hit, next Hero attack has DIS."]],
 ["eye","Floating Eye","eye","MIDDLE",9,3,4,["Stare: no attack.","Gaze: opposed d20+WIT vs d20+4; on failure, next Hero attack has DIS.","Freeze: next Hero d20 roll has DIS.","Gaze: ATTACK with ADV."]],
 ["mold","Living Mold","mushroom","MIDDLE",11,4,2,["Spread: next Hero attack has DIS.","Spores: active Hero becomes POISONED.","Digest: ATTACK.","Bloom: ATTACK with ADV."]],
 ["wraith","Restless Shade","ghost","DEEP",13,5,4,["Fade: next Hero attack has DIS.","Cold Hand: ATTACK.","Drain: ATTACK; on hit, deal 2 extra damage.","Haunt: ATTACK with ADV."]],
 ["rust","Rust Monster","rust","DEEP",14,5,3,["Sniff: no attack.","Gnaw: ATTACK.","Corrode: discard a METAL Item or lose 3 HP.","Gnaw: ATTACK with ADV."]],
 ["cultist","Forgotten Acolyte","wizard","DEEP",14,5,4,["Chant: its next attack gains ADV.","Hex: ATTACK using +6 ATK.","Curse: next attack has ADV; its target Hero has -2 DEF for that attack.","Hex: ATTACK with ADV."]],
 ["sentinel","Iron Sentinel","warden","DEEP",16,6,5,["Guard: next Hero attack has DIS.","Hammer: ATTACK.","Crush: ATTACK; on hit, deal +2 damage.","Hammer: ATTACK with ADV."]]
];

const SPEC=Object.freeze({
 rat:{tags:["BEAST"],weakness:"With a BEAST Companion, treat behaviour 6 as 1–2.",
   parley:"FEED: Discard 1 Item to send it away. No corpse.",remains:"EAT: Roll d6. 1–2 become POISONED; 3–4 heal 2 HP; 5–6 heal d6 HP."},
 goblin:{tags:["BARGAIN"],weakness:"With Pocket Goblin, behaviour 6 becomes 1–2.",
   parley:"RECRUIT: Discard 2 Items; keep as Companion (+1 ATK), no corpse.",remains:"SEARCH POCKETS, d6: 1–2 lose 1 HP; 3–4 draw 1 Item; 5–6 draw 1, peek next Room. No EAT."},
 crawler:{tags:["ACID"],weakness:"Discard ALCHEMY Item: next behaviour 5 becomes 1–2.",
   parley:"DISTRACT: discard POTION to escape. In Flooded Chamber, Acid gives the next Monster attack against you ADV. No reward.",remains:"EAT: Roll d6.  1–2 become POISONED; 3–4 heal 2 HP; 5–6 remove POISONED."},
 bat:{tags:["BEAST","DARK"],weakness:"With equipped FIRE gear, treat behaviour 6 as 1–2.",
   parley:"SNEAK: Opposed d20+WIT vs d20+3. Win: pass safely; fail: fight.",remains:"EAT: Roll d6.  1–2 lose 2 HP; 3–4 heal 2 HP; 5–6 peek next Room."},
 troll:{tags:["BEAST","REGEN"],weakness:"FIRE damage prevents the next Regenerate (5).",
   parley:"TOLL: Discard 2 Items to avoid this fight.",remains:"EAT: Roll d6.  1–2 become POISONED; 3–4 heal d6 HP; 5–6 draw 1 Item."},
 wisp:{tags:["LIGHT","MAGIC"],weakness:"After using ICE Item, change next behaviour 6 to 1–2.",
   parley:"ESCAPE: opposed d20+WIT vs d20+5. Win: keep this Monster face up; fight at next Corridor or before Vault. Lose: fight now.",remains:"No EAT. When defeated, discard this Monster."},
 eye:{tags:["GAZE","MAGIC"],weakness:"With Ring of the Sideways Eye, treat behaviour 6 as 1–2.",
   parley:"COVER EYES: Discard 1 Item; it leaves. No trophy.",remains:"KEEP EYE after defeat: retain this Monster; discard to peek next 2 Rooms and order them. No EAT."},
 mold:{tags:["ALCHEMY","PLANT"],weakness:"FIRE: treat behaviour 6 as 1–2; ICE: treat behaviour 5 as 1–2.",
   parley:"FEED: Discard a POTION; skip this fight. No corpse.",remains:"EAT: Roll d6.  1–2 become POISONED; 3–4 heal d6 HP; 5–6 remove POISONED."},
 wraith:{tags:["CURSED","MAGIC"],weakness:"With equipped MAGIC gear, behaviour 5 becomes 1–2.",
   parley:"APPEASE: with equipped CURSED gear, lose d6 HP to send it away; no reward.",remains:"On defeat, RELEASE: peek next Room; or KEEP WHISPER: discard later to set a MAGIC/CURSED Monster's behaviour to 1–2. No EAT."},
 rust:{tags:["METAL"],weakness:"Without equipped METAL gear, behaviour 5 becomes 1–2.",
   parley:"FEED: Discard a METAL Item. It leaves; draw 1 Item.",remains:"EAT: Roll d6.  1–2 become POISONED; 3–4 heal 2 HP; 5–6 the next Monster attack against you has DIS."},
 cultist:{tags:["CURSED","BARGAIN"],weakness:"Equipped MAGIC gear: next behaviour 6 becomes 1–2.",
   parley:"BARGAIN: with equipped CURSED gear, lose d6 HP; it leaves; draw 1 Item.",remains:"DEATH THROES: killed by a WEAPON, deal 1 HP damage to attacker. MAGIC silences it. No EAT."},
 sentinel:{tags:["METAL","LIGHTNING"],weakness:"LIGHTNING deals +d6 damage; ICE changes the next behaviour 6 to 1–2.",
   parley:"BRIBE: Discard 2 METAL Items to bypass it. No loot.",remains:"Cannot EAT this Monster."}
});

export const V2_MONSTERS=Object.freeze(BASE.map(([id,title,art,stage,hp,atk,def,behavior],i)=>{
 const s=SPEC[id];if(!s)throw new Error("Missing Monster ecology: "+id);
 const defeat=MONSTER_DEFEATS[id];if(!defeat)throw Error("Missing Monster DEFEAT: "+id);
 return {id,title,art,stage,hp:Math.max(1,Math.ceil(hp/2)),atk:Math.max(1,atk-2),def,behavior,copies:stage==="UPPER"?3:2,type:"monster",
  flavor:"",v2:{kind:"MONSTER",number:i+1,tags:s.tags,
   weakness:s.weakness,parley:s.parley,remains:s.remains,
   defeat:defeat.text,defeatOps:defeat.ops}};
}));
export const V2_MONSTER_BY_ID=Object.freeze(Object.fromEntries(V2_MONSTERS.map(m=>[m.id,m])));
