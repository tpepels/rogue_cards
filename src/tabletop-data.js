// Rogue Cards — the ONE canonical physical edition. No legacy card catalogue.
import {HEROES} from "./heroes.js";
import {V2_ROOMS as ROOMS,V2_REGIONS as roomRegions} from "./rooms.js";
import {V2_ITEMS as ITEMS,V2_POTIONS as POTIONS,V2_OBJECTS as OBJECTS,V2_OBJECTS_BY_FAMILY as OBJECTS_BY_FAMILY} from "./objects.js";
import {V2_MONSTERS as MONSTERS} from "./monsters.js";
import {VAULT,WARDEN,WARDEN_FURY,WARDEN_CARDS} from "./warden.js";
export {HEROES,ROOMS,roomRegions,ITEMS,POTIONS,OBJECTS,OBJECTS_BY_FAMILY,MONSTERS,VAULT,WARDEN,WARDEN_FURY,WARDEN_CARDS};
export const EDITION="Rogue Cards";
export const CARD_WIDTH_MM=90,CARD_HEIGHT_MM=130;
export const CATEGORIES=Object.freeze(["hero","room","monster","item","potion"]);
export const ITEM_FAMILIES=Object.freeze(["TOOL","EQUIPMENT","COMPANION","RELIC","SCROLL","RING","WAND","POTION"]);
export const CATALOGUE=Object.freeze([...HEROES,...ROOMS,VAULT,...MONSTERS,...WARDEN_CARDS,...ITEMS,...POTIONS]);
export const PRINT_DECK=Object.freeze(CATALOGUE.flatMap(card=>Array.from({length:card.copies},()=>card)));
export const printDeck=(type="all",family="all")=>PRINT_DECK.filter(card=>
 (type==="all"||card.type===type)&&(family==="all"||card.v2?.kind===family));
export const catalogue=(type="all",family="all")=>CATALOGUE.filter(card=>
 (type==="all"||card.type===type)&&(family==="all"||card.v2?.kind===family));
