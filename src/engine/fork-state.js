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
import {EXTRA_MONSTERS} from "../monster-expansion.js";
import {PRINT_ONLY_ROOMS} from "../print-expansion.js";
const cards=new WeakSet([...HEROES,...ROOMS,...PRINT_ONLY_ROOMS,...OBJECTS,...MONSTERS,...EXTRA_MONSTERS,
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
// The three hidden piles only contain immutable catalogue definitions or
// frozen physical copies. Copy the array containers while reusing their
// printed cards. Register each copied container in seen to preserve aliases.
function copyImmutablePile(pile,seen){
 if(seen.has(pile))return seen.get(pile);
 const copied=pile.slice();
 seen.set(pile,copied);
 return copied;
}
function copyStagePiles(groups,seen){
 if(seen.has(groups))return seen.get(groups);
 const cloned=Object.create(Object.getPrototypeOf(groups));
 seen.set(groups,cloned);
 for(const stage of Object.keys(groups)){
  const source=groups[stage];
  cloned[stage]=Array.isArray(source)?
   copyImmutablePile(source,seen):clone(source,seen);
 }
 return cloned;
}
/** Clone telemetry counters without individually dispatching every scalar
 * value through the recursive generic cloner. The fast case applies only
 * to flat ordinary objects with primitive values; complex/nested values
 * fall back to the original recursive path. Register aliases in seen.
 */
function cloneMetrics(metrics,seen){
 if(seen.has(metrics))return seen.get(metrics);
 const copy=Object.create(Object.getPrototypeOf(metrics));
 seen.set(metrics,copy);
 for(const key of Object.keys(metrics)){
  const value=metrics[key];
  if(!value||typeof value!=="object"){
   copy[key]=value;
   continue;
  }
  const prior=seen.get(value);
  if(prior){copy[key]=prior;continue;}
  if(Object.getPrototypeOf(value)===Object.prototype||
     Object.getPrototypeOf(value)===null){
   let flat=true;
   for(const child of Object.values(value))
    if(child!==null&&typeof child==="object"){flat=false;break;}
   if(flat){
    const cloned=Object.assign(
     Object.create(Object.getPrototypeOf(value)),value);
    seen.set(value,cloned);
    copy[key]=cloned;
    continue;
   }
  }
  copy[key]=clone(value,seen);
 }
 return copy;
}
export function forkGameState(state,{fastPiles=false,fastMetrics=false}={}){
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
  const value=state[key];
  fork[key]=fastMetrics&&key==="metrics"&&value?
   cloneMetrics(value,seen):
   fastPiles&&key==="deck"&&Array.isArray(value)?
   copyImmutablePile(value,seen):
   fastPiles&&(key==="rooms"||key==="monsters")&&value?
    copyStagePiles(value,seen):clone(value,seen);
 }
 fork.rng=state.rng.clone();
 return fork;
}
