/** Versioned physical edition. Proposals never mutate these source cards. */
import {createHash} from 'node:crypto';
import {physicalDeck,selectionForPreset} from '../decks.js';
import {ROOM_EFFECTS} from '../room-effect-model.js';
import {ROLL_EFFECTS,NON_ROLL_EFFECTS} from '../effect-model.js';
import {ITEM_HEALING_DEFAULTS} from '../item-healing.js';

export const BASELINE_ID='balanced-recovery-v1';
export function deepFreeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const entry of Object.values(value))deepFreeze(entry);
  Object.freeze(value);
 }
 return value;
}
export function stableStringify(value){
 if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort()
  .map(key=>JSON.stringify(key)+':'+stableStringify(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
export const contentHash=value=>createHash('sha256').update(stableStringify(value)).digest('hex');
export function inventory(cards){
 const counts=new Map();
 for(const c of cards){const key=c.type+':'+c.id;counts.set(key,(counts.get(key)??0)+1);}
 return Object.fromEntries([...counts].sort(([a],[b])=>a.localeCompare(b)));
}
const cards=physicalDeck(selectionForPreset('balanced'));
export const BASELINE_MANIFEST=deepFreeze({
 schema:'uba-baseline-v1',id:BASELINE_ID,roomBaseline:'balanced-b',
 inventory:inventory(cards),
 fingerprint:contentHash({id:BASELINE_ID,cards,
  roomEffects:ROOM_EFFECTS,rollEffects:ROLL_EFFECTS,
  nonRollEffects:NON_ROLL_EFFECTS,itemHealing:ITEM_HEALING_DEFAULTS})
});
