// V2 ecology specimens: independent overlays on the V1 Monster catalogue.
// V1 Monster behaviour, HP/ATK/DEF, gallery, rules and print deck are untouched.
// Every V2 Monster prints a weakness and a negotiation or capture possibility.
import {MONSTERS} from "./tabletop-data.js";
const SPEC=Object.freeze({
 rat:{tags:["BEAST"],weakness:"With a BEAST Companion, treat this Monster's d6 6 as 1–2.",
   parley:"FEED: Discard 1 Item to send it away. No corpse.",remains:"EAT d6: 1–2 POISONED; 3–4 heal 2 HP; 5–6 heal d6 HP."},
 goblin:{tags:["BEAST","BARGAIN"],weakness:"With Pocket Goblin, treat this Monster's d6 6 as 1–2.",
   parley:"RECRUIT: Discard 2 Items. Keep as Companion (+1 ATK); no other reward.",remains:"EAT d6: 1–2 lose d6 HP; 3–4 heal 2 HP; 5–6 draw 1 Item."},
 crawler:{tags:["ACID"],weakness:"Discard an ALCHEMY Item to turn its next 5 into 1–2.",
   parley:"DISTRACT: Discard a POTION. It flees; no loot.",remains:"EAT d6: 1–2 POISONED; 3–4 heal 2 HP; 5–6 remove POISONED."},
 bat:{tags:["BEAST","DARK"],weakness:"With FIRE gear, treat this Monster's 6 as 1–2.",
   parley:"LURE: Discard 1 Item to make it leave. No corpse.",remains:"EAT d6: 1–2 lose 2 HP; 3–4 heal 2 HP; 5–6 peek next Room."},
 troll:{tags:["BEAST","REGEN"],weakness:"FIRE damage stops its next Regenerate behaviour (5).",
   parley:"TOLL: Discard 2 Items to avoid this fight.",remains:"EAT d6: 1–2 POISONED; 3–4 heal d6 HP; 5–6 draw 1 Item."},
 wisp:{tags:["LIGHT","MAGIC"],weakness:"After activating an ICE Item, its next behaviour 6 becomes 1–2.",
   parley:"FOLLOW: Lose d6 HP; peek at the next 2 Rooms. Wisp leaves.",remains:"EAT d6: 1–2 lose d6 HP; 3–4 heal 2 HP; 5–6 next d20 has ADV."},
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
export const V2_MONSTERS=Object.freeze(MONSTERS.map((m,i)=>{
 const m3=SPEC[m.id];
 if(!m3)throw Error("Missing Phase 3 Monster ecology: "+m.id);
 return {...m,behavior:[...m.behavior],v2:{kind:"MONSTER",number:i+1,
  tags:m3.tags,weakness:m3.weakness,parley:m3.parley,remains:m3.remains}};
}));
export const V2_MONSTER_BY_ID=Object.freeze(Object.fromEntries(V2_MONSTERS.map(m=>[m.id,m])));
