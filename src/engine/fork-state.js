/** Clone one *real* ExpeditionState, including the remaining dice stream.
 *
 * The physical card definitions are fixed read-only objects and retain
 * reference identity across equipment slots, room piles, inventories and
 * retained Rooms. There is no AI, hidden-deck resampling or random replay.
 */
import {ExpeditionState} from "./expedition-state.js";
import {isPhysicalCard} from "./physical-cards.js";
import {HEROES,ROOMS,OBJECTS,MONSTERS,WARDEN,WARDEN_FURY,VAULT}
 from "../tabletop-data.js";
const cards=new WeakSet([...HEROES,...ROOMS,...OBJECTS,...MONSTERS,
 WARDEN,WARDEN_FURY,VAULT]);
function clone(value,seen){
 if(value===null||typeof value!=="object")return value;
 if(cards.has(value)||isPhysicalCard(value))return value;
 if(seen.has(value))return seen.get(value);
 let out;
 if(Array.isArray(value)){
  out=new Array(value.length);seen.set(value,out);
  for(let i=0;i<value.length;i++)out[i]=clone(value[i],seen);
 }else if(value instanceof Set){
  out=new Set();seen.set(value,out);
  for(const item of value)out.add(clone(item,seen));
 }else if(value instanceof Map){
  out=new Map();seen.set(value,out);
  for(const [k,v] of value)out.set(clone(k,seen),clone(v,seen));
 }else{
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)
   throw Error("Cannot fork unsupported mutable game state");
  out=Object.create(proto);seen.set(value,out);
  for(const key of Object.keys(value))out[key]=clone(value[key],seen);
 }
 return out;
}
// Room, Monster and Item decks contain exclusively immutable printed cards
// (or immutable physical-copy wrappers). Copy only the pile arrays; never
// recursively walk every one of their cards on every search transition.
// Preserve WeakMap aliases for defensive consistency with general cloning.
const cloneImmutablePile=(pile,seen)=>{
 const result=pile.slice();seen.set(pile,result);return result;
};
const cloneImmutableStages=(stages,seen)=>{
 const result=Object.create(Object.getPrototypeOf(stages));
 seen.set(stages,result);
 for(const key of Object.keys(stages))
  result[key]=cloneImmutablePile(stages[key],seen);
 return result;
};
export function forkGameState(state){
 if(!(state instanceof ExpeditionState)||typeof state.rng?.clone!=="function")
  throw Error("Only a clonable canonical ExpeditionState can be forked");
 // Fork the live state directly. Building and then recursively cloning
 // an intermediate Object.entries/filter/fromEntries payload adds arrays,
 // tuple allocations and callbacks to every MCTS transition.
 const fork=Object.create(ExpeditionState.prototype);
 const seen=new WeakMap();
 seen.set(state,fork);
 for(const key of Object.keys(state)){
  if(key==="rng"||key==="_decisionHook")continue;
  if(key==="deck"&&Array.isArray(state.deck))
   fork[key]=cloneImmutablePile(state.deck,seen);
  else if((key==="rooms"||key==="monsters")&&
    state[key]&&["UPPER","MIDDLE","DEEP"].every(
     stage=>Array.isArray(state[key][stage])))
   fork[key]=cloneImmutableStages(state[key],seen);
  else fork[key]=clone(state[key],seen);
 }
 fork.rng=state.rng.clone();
 return fork;
}
