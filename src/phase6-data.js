// Reference cards only: Phase 6 adds no hidden decks or random resources.
export const PHASE6_CARDS=[
 {id:"intent",type:"tactic",title:"Monster Intent",art:"eye",rule:"Reveal the top Behaviour card while a monster is present. Do not draw or discard until turn end. When reshuffling, intention is UNKNOWN.",flavor:"Knowing is not surviving."},
 {id:"brace",type:"tactic",title:"Brace",art:"knight",rule:"ACTION: Gain +2 DEF against this turn's monster response. Once per turn; cannot also Feint.",flavor:"Hold fast."},
 {id:"feint",type:"tactic",title:"Feint",art:"rogue",rule:"ACTION: Your next melee attack this turn gains +2 ATK. Once per turn; cannot also Brace.",flavor:"Make them blink."},
 {id:"techniques",type:"tactic",title:"Hero Techniques",art:"wizard",rule:"Once per monster: Delver +3 next melee ATK; Knight +3 DEF this response; Wizard deals 2 damage; Rogue dodges next hit.",flavor:"The first trick is always the best."},
 {id:"enchant",type:"tactic",title:"Enchant or Cleanse",art:"amulet",rule:"On ALTAR, once: ENCHANT equipped gear, d6: 1 cursed -1; 2-4 +1; 5-6 +2 (max +3). Or CLEANSE curse: -2 HP, bonus returns to +1.",flavor:"The gods count the price."},
 {id:"cache",type:"tactic",title:"Hidden Cache",art:"door",rule:"In Crypt, Nest or Flooded Chamber, spend 1 action and either a KEY, prepared DIGGING or 2 Hunger to draw one Object from supply. Once per room.",flavor:"Nothing is free beneath the earth."},
 {id:"bargain",type:"tactic",title:"Dangerous Bargain",art:"shop",rule:"In Shop or Altar, once per room: lose 2 HP to draw one Object from supply. May be fatal.",flavor:"That is the offer."},
 {id:"pressure",type:"tactic",title:"Descending Pressure",art:"stairs",rule:"Monsters already grow more common deeper. At depths 7-10 each gains +1 HP. Side chambers offer more loot but may cost turns and Hunger.",flavor:"Further down. Less mercy."}
];
export const PHASE6_COPIES=Object.fromEntries(PHASE6_CARDS.map(x=>[x.id,1]));
