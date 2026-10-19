/**
 * Printed Item healing values shared by the pausable canonical engine and
 * printable staged card definitions. No new Item timing or recovery rule.
 * Changing printed amounts never changes the original canonical source cards.
 */
export const ITEM_HEALING_DEFAULTS=Object.freeze({
 "ex-bandages":"d6",
 "ex-rations":2,
 "odd-thorn-tonic":3
});
export const ITEM_HEALING_OPTIONS=Object.freeze({
 "ex-bandages":Object.freeze(["d6","d6+2",4,6,8]),
 "ex-rations":Object.freeze([2,3,4,5,6]),
 "odd-thorn-tonic":Object.freeze([3,4,5,6,7,8])
});
export function validItemHealing(id,amount){
 return Object.hasOwn(ITEM_HEALING_OPTIONS,id)&&
  ITEM_HEALING_OPTIONS[id].includes(amount);
}
export function printedHealingValue(card){
 const defaultValue=ITEM_HEALING_DEFAULTS[card?.id];
 if(defaultValue===undefined)throw Error("Not a supported healing Item");
 const value=card.v2?.healingAmount??defaultValue;
 if(!validItemHealing(card.id,value))
  throw Error("Unsupported printed Item healing "+card.id+":"+value);
 return value;
}
export function resolvePrintedItemHealing(state,card){
 const value=printedHealingValue(card);
 if(value==="d6")return state.die();
 if(value==="d6+2")return state.die()+2;
 return value;
}
