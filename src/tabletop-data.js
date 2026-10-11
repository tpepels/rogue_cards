// Tabletop Rogue Cards. This module is the source for PRINTED cards, not a computer game.
// No invisible state, browser generation, or lookup table is required at the table.
export const EDITION="Tabletop 1";
export const CARD_WIDTH_MM=90, CARD_HEIGHT_MM=130;
const hero=(id,title,art,hp,atk,def,wit,rule,flavor)=>({id,type:"hero",title,art,hp,atk,def,wit,rule,flavor,copies:1});
export const HEROES=[
hero("delver","Cave Delver","delver",22,4,3,3,"ONCE PER ROOM — Reroll one of your d20s after seeing the result. You must use the new roll.","You know these tunnels."),
hero("wizard","Hedge Wizard","wizard",18,2,2,6,"ACTION — Arcane Bolt: attack with WIT instead of ATK; a hit deals d6+2 damage. Once per encounter, make this roll with ADV.","Almost certainly harmless."),
hero("knight","Wandering Knight","knight",24,4,4,2,"ONCE PER ROOM — When you would take damage, reduce it by d6 (minimum 0).","Not every shield is made of steel."),
hero("rogue","Cutpurse","rogue",20,5,3,4,"ONCE PER ROOM — Your attack has ADV. If it hits, deal +1 damage.","Every lock is a suggestion.")
];
const room=(id,title,art,stage,rule,flavor,copies=1)=>({id,type:"room",title,art,stage,rule,flavor,copies});
export const ROOMS=[
room("u-passage","Dripping Passage","corridor","UPPER","REVEAL — Draw an UPPER Monster. AFTER VICTORY — Take 1 Item.","The stones sweat."),
room("u-gate","Rusty Gate","door","UPPER","REVEAL — WIT DC 13. On failure suffer d6 damage. Then draw an UPPER Monster.","This door opens inward."),
room("u-supply","Forgotten Supplies","shop","UPPER","QUIET — Take 2 Items. Each Hero may keep one; discard any excess.","Someone expected to return."),
room("u-nest","Rat Nest","rat","UPPER","REVEAL — Draw an UPPER Monster. If you eat its corpse, roll twice and keep either result.","Little teeth in the dark."),
room("u-shrine","Abandoned Shrine","altar","UPPER","QUIET — Each Hero may PRAY: d20+WIT vs DC 13. Success: heal d6 HP. Failure: lose d6 HP.","Something is listening."),
room("u-fall","Collapsing Stairs","stairs","UPPER","REVEAL — Every Hero tests WIT DC 12; failure: d6 damage. Draw 1 Item.","Down is easier than up."),
room("m-flood","Flooded Chamber","water","MIDDLE","REVEAL — Draw a MIDDLE Monster. All d20 attacks here have DIS unless you carry a Rope.","Stagnant water hides movement."),
room("m-statue","Stone Watcher","altar","MIDDLE","QUIET — One Hero may offer an Item: discard it, then heal d6 HP and take 1 Item.","A stone face judges you."),
room("m-vault","Buried Lockbox","door","MIDDLE","REVEAL — WIT DC 14 to open. Success: take 2 Items. Failure: suffer d6 damage; take 1 Item.","The lock remembers its maker."),
room("m-crypt","Opened Crypt","crypt","MIDDLE","REVEAL — Draw a MIDDLE Monster. AFTER VICTORY — Take 1 Item or heal d6 HP.","The final coffin is empty."),
room("m-fungus","Fungal Garden","mushroom","MIDDLE","REVEAL — Each Hero tests WIT DC 14; failure: POISONED. Draw a MIDDLE Monster.","You hear spores fall."),
room("m-altar","Candle Altar","altar","MIDDLE","QUIET — Each Hero may PRAY: d20+WIT vs DC 14. Success: remove a status or heal d6. Failure: become POISONED.","Wax like old bone."),
room("d-shadow","Lightless Hall","crypt","DEEP","REVEAL — Draw a DEEP Monster. Its first attack has ADV unless a Hero carries a Torch.","An absence of stars."),
room("d-bridge","Broken Bridge","stairs","DEEP","REVEAL — WIT DC 15 for each Hero; failure: d6+2 damage. Rope grants ADV on this test.","Do not look down."),
room("d-reliquary","Lost Reliquary","amulet","DEEP","QUIET — Each Hero chooses: take 2 Items and suffer d6 damage, OR heal d6 HP.","The offering tray is still warm."),
room("d-bones","Hall of Teeth","bones","DEEP","REVEAL — Draw a DEEP Monster. Its first d6 behaviour roll is 6.","Many pilgrims came before."),
room("d-oracle","Broken Oracle","eye","DEEP","QUIET — Roll d20+WIT vs DC 15. Success: look at the next Room and choose to keep it or draw another. Failure: suffer d6 damage.","Ask nothing you cannot bear."),
room("d-gate","Warden's Threshold","door","DEEP","REVEAL — Draw a DEEP Monster. AFTER VICTORY — Heal d6 HP or take 1 Item.","There are marks on both sides.")
];
export const VAULT={id:"vault",type:"room",title:"The Amulet Vault",art:"amulet",stage:"FINAL",rule:"REVEAL — Face the Amulet Warden. Its defeat ends the expedition immediately. You win; do not return to the Entrance.",flavor:"The prize was never unattended.",copies:1};
const monster=(id,title,art,stage,hp,atk,def,behavior,corpse,flavor,copies=2)=>({id,type:"monster",title,art,stage,hp,atk,def,behavior,corpse,flavor,copies});
export const MONSTERS=[
monster("rat","Giant Rat","rat","UPPER",7,2,1,["Hesitate: no attack.","Bite: ATTACK.","Scurry: next Hero attack has DIS.","Pack Bite: ATTACK +2."],"EAT d6: 1–2 POISONED; 3–4 heal 2 HP; 5–6 keep card: once per room, +2 on a WIT test.","Too hungry to fear you.",3),
monster("goblin","Goblin Raider","goblin","UPPER",9,3,2,["Taunt: no attack.","Knife: ATTACK.","Duck: next Hero attack has DIS.","Ambush: ATTACK with ADV."],"EAT d6: 1–2 suffer d6 damage; 3–4 heal 2 HP; 5–6 keep card: once per room, gain ADV on a trap test.","A knife, a grin, a plan.",3),
monster("crawler","Sewer Crawler","rust","UPPER",8,2,2,["Hide: next Hero attack has DIS.","Claw: ATTACK.","Acid: ATTACK; on hit become POISONED.","Lunge: ATTACK +2."],"EAT d6: 1–2 POISONED; 3–4 heal 2; 5–6 keep card: ignore the next POISONED condition (discard then).","The pipes are alive.",2),
monster("bat","Cave Bat Swarm","eye","UPPER",6,3,3,["Circle: no attack.","Swoop: ATTACK.","Confuse: active Hero has DIS on next action.","Swoop: ATTACK with ADV."],"EAT d6: 1–2 suffer 2 HP; 3–4 heal 2; 5–6 keep card: once per room, reroll a failed DEF d20.","A thousand small shadows.",2),
monster("troll","Bridge Troll","troll","MIDDLE",14,4,3,["Glare: no attack.","Club: ATTACK.","Regenerate: heal 2 HP.","Crush: ATTACK; on hit +2 damage."],"EAT d6: 1–2 POISONED; 3–4 heal d6; 5–6 keep card: when entering a new Room heal 1 HP.","It wants a toll.",2),
monster("wisp","Will-o'-Wisp","spiral","MIDDLE",8,4,5,["Flicker: next Hero attack has DIS.","Spark: ATTACK.","Lead Astray: active Hero loses 1 HP.","Flash: ATTACK with ADV."],"EAT d6: 1–2 suffer d6; 3–4 heal 2; 5–6 keep card: your next spell attack has ADV (discard).","Do not follow the lights.",2),
monster("eye","Floating Eye","eye","MIDDLE",9,2,4,["Stare: no attack.","Gaze: ATTACK using WIT in place of ATK.","Freeze: active Hero has DIS next action.","Gaze: ATTACK with ADV."],"EAT d6: 1–2 POISONED; 3–4 heal 2; 5–6 keep card: once per room, +2 WIT.","It sees what you forget.",2),
monster("mold","Living Mold","mushroom","MIDDLE",12,3,2,["Spread: next Hero attack has DIS.","Spores: active Hero becomes POISONED.","Digest: ATTACK.","Bloom: ATTACK with ADV."],"EAT d6: 1–2 POISONED; 3–4 heal d6; 5–6 keep card: your first damage in a Room is reduced by 2.","A patient appetite.",2),
monster("wraith","Restless Shade","ghost","DEEP",11,5,4,["Fade: next Hero attack has DIS.","Cold Hand: ATTACK.","Drain: ATTACK; on hit discard one held Item.","Haunt: ATTACK with ADV."],"EAT d6: 1–2 suffer d6; 3–4 heal 2; 5–6 keep card: ignore one status (discard after use).","It knows your name.",2),
monster("rust","Rust Monster","rust","DEEP",12,4,3,["Sniff: no attack.","Gnaw: ATTACK.","Corrode: active Hero's armour loses 1 DEF until Room ends.","Gnaw: ATTACK with ADV."],"EAT d6: 1–2 POISONED; 3–4 heal 2; 5–6 keep card: once per room, +2 DEF against one attack.","Metal is its meal.",2),
monster("cultist","Forgotten Acolyte","wizard","DEEP",12,4,4,["Chant: next attack has ADV.","Hex: ATTACK using WIT +5.","Curse: active Hero POISONED.","Hex: ATTACK +2."],"EAT d6: 1–2 suffer d6; 3–4 heal 2; 5–6 keep card: once per room, your spell deals +2 damage.","The prayer never ended.",2),
monster("sentinel","Iron Sentinel","warden","DEEP",15,5,5,["Guard: next Hero attack has DIS.","Hammer: ATTACK.","Crush: ATTACK; +2 damage on hit.","Hammer: ATTACK with ADV."],"No edible corpse.","An engine without a master.",2)
];
export const WARDEN=monster("warden","Amulet Warden","warden","FINAL",22,6,5,
["Observe: no attack.","Sword: ATTACK.","Command: active Hero has DIS on next d20.","Judgment: ATTACK +2, with ADV."],
"No edible corpse.","A final question answered in blood.",1);
const item=(id,title,art,rule,flavor,copies=2)=>({id,type:"item",title,art,rule,flavor,copies});
export const ITEMS=[
item("sword","Notched Sword","key","WEAPON — +2 ATK while equipped. Your first hit each Room deals +1 damage.","Sharp enough.",3),
item("staff","Ashwood Staff","wizard","WEAPON — +1 ATK. When you attack using WIT, deal +1 damage.","Knots like fingers.",2),
item("dagger","Quick Dagger","rogue","WEAPON — +1 ATK. Once per Room, reroll a damage d6.","The edge whispers.",2),
item("mail","Patchwork Mail","knight","ARMOUR — +2 DEF. Your WIT tests have DIS while equipped.","Heavier than hope.",3),
item("cloak","Moth-Eaten Cloak","ghost","ARMOUR — +1 DEF; +2 on WIT tests against traps.","The lining has pockets.",2),
item("shield","Warded Shield","knight","ARMOUR — +1 DEF. Once per Room, cancel 2 incoming damage.","Painted prayers.",2),
item("cursed-blade","Whispering Blade","key","CURSED WEAPON — +3 ATK; after each successful hit lose 1 HP. Cannot unequip until cleansed at an Altar.","It never sleeps.",1),
item("cursed-mail","Burial Mail","bones","CURSED ARMOUR — +3 DEF, -2 WIT. Cannot unequip until cleansed at an Altar.","The last wearer is close.",1),
item("rope","Knotted Rope","stairs","GEAR — Carry to pass the Broken Bridge with ADV and avoid the Flooded Chamber attack penalty.","Never trust the last knot.",3),
item("torch","Pitch Torch","wind","GEAR — Ignore first-attack darkness penalties. Discard after entering the third Room since you found it.","A little moving daylight.",3),
item("key","Rusty Key","key","GEAR — Discard this card to pass any printed lock or chest WIT test automatically.","Open things that should stay closed.",3),
item("bandage","Bandages","ration","CONSUME — Restore d6 HP to a Hero in your Room. An action during combat; free as your one safe action.","Not quite sterile.",4),
item("antidote","Antidote","potion","CONSUME — Remove POISONED from a Hero. An action during combat; free as your one safe action.","It tastes worse than poison.",2),
item("fire-scroll","Scroll of Flame","spiral","SPELL — Discard. Attack using WIT; on hit deal 2d6 damage. One action.","The page burns last.",2),
item("ice-scroll","Scroll of Frost","wind","SPELL — Discard. Monster's next response is skipped. One action.","A cold silence.",2),
item("dog","Loyal Hound","dog","COMPANION — Once per encounter, after you hit, the dog deals +d6 damage. It stays with you until replaced.","Smarter than its master.",2),
item("raven","Tunnel Raven","eye","COMPANION — Once per Room, get ADV on a WIT test. You may look at the next Room card.","It always knows the way.",1)
];
const potion=(id,title,art,rule,flavor,copies=3)=>({id,type:"potion",title,art,rule,flavor,copies,mystery:true});
export const POTIONS=[
potion("smoky","Smoky Potion","potion","FIRST USE — Roll d6 and write the result on this card's ID line. 1–2: suffer d6 damage; 3–4: heal d6 HP; 5–6: gain ADV on the next d20. Every Smoky Potion uses this result for this expedition.","It smells like burned herbs.",3),
potion("milky","Milky Potion","potion","FIRST USE — Roll d6; note result by appearance. 1–2: become POISONED; 3–4: remove a status; 5–6: restore 2d6 HP. All Milky Potions share the result.","No one knows what floats within.",3),
potion("amber","Amber Potion","potion","FIRST USE — Roll d6; note result by appearance. 1–2: take d6 damage; 3–4: +2 ATK in this Room; 5–6: gain ADV on your next three d20 rolls. All Amber Potions share the result.","Something catches the light.",3)
];
export const CATEGORIES=["hero","room","monster","item","potion"];
export const CATALOGUE=[...HEROES,...ROOMS,VAULT,...MONSTERS,WARDEN,...ITEMS,...POTIONS];
export const PRINT_DECK=[...HEROES,
  ...ROOMS.flatMap(c=>Array.from({length:c.copies},()=>c)),
  VAULT,
  ...MONSTERS.flatMap(c=>Array.from({length:c.copies},()=>c)),
  WARDEN,
  ...ITEMS.flatMap(c=>Array.from({length:c.copies},()=>c)),
  ...POTIONS.flatMap(c=>Array.from({length:c.copies},()=>c))];
export const printDeck=type=>PRINT_DECK.filter(c=>!type||type==="all"||c.type===type);
export const roomRegions=["UPPER","MIDDLE","DEEP"];
