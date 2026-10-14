/** Clone one *real* ExpeditionState, including the remaining dice stream.
 *
 * The physical card definitions are fixed read-only objects and retain
 * reference identity across equipment slots, room piles, inventories and
 * retained Rooms. There is no AI, hidden-deck resampling or random replay.
 */
import {ExpeditionState} from "./expedition-state.js";
import {HEROES,ROOMS,OBJECTS,MONSTERS,WARDEN,WARDEN_FURY,VAULT}
 from "../tabletop-data.js";
const cards=new WeakSet([...HEROES,...ROOMS,...OBJECTS,...MONSTERS,
 WARDEN,WARDEN_FURY,VAULT]);
function clone(value,seen){
 if(value===null||typeof value!=="object")return value;
 if(cards.has(value))return value;
 if(seen.has(value))return seen.get(value);
 let out;
 if(Array.isArray(value)){
  out=[];seen.set(value,out);
  for(const item of value)out.push(clone(item,seen));
 }else if(value instanceof Set){
  out=new Set();seen.set(value,out);
  for(const item of value)out.add(clone(item,seen));
 }else if(value instanceof Map){
  out=new Map();seen.set(value,out);
  for(const [k,v] of value)out.set(clone(k,seen),clone(v,seen));
 }else{
  if(Object.getPrototypeOf(value)!==Object.prototype &&
     Object.getPrototypeOf(value)!==null)
   throw Error("Cannot fork unsupported mutable game state");
  out={};seen.set(value,out);
  for(const [key,v] of Object.entries(value))out[key]=clone(v,seen);
 }
 return out;
}
export function forkGameState(state){
 if(!(state instanceof ExpeditionState)||typeof state.rng?.clone!=="function")
  throw Error("Only a clonable canonical ExpeditionState can be forked");
 const props=Object.fromEntries(Object.entries(state).filter(
  ([key])=>key!=="rng"&&key!=="_decisionHook"));
 const fork=Object.assign(Object.create(ExpeditionState.prototype),
  clone(props,new WeakMap()));
 fork.rng=state.rng.clone();
 return fork;
}
