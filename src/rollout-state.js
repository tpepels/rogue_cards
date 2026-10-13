/**
 * Isolated, reproducible game-state forks for stochastic planning.
 *
 * The actual expedition RNG (a closure) is EXCLUDED from the clone. Both
 * candidates receive a newly seeded dice stream and the same sampled
 * hidden piles. Fair resampling uses only publicly revealed card IDs/counts,
 * never the hidden identities or order from the real state.
 */
import {ExpeditionState} from "./expedition-runtime.js";
import {randomSource} from "./playtest.js";
import {ROOMS,MONSTERS,OBJECTS,HEROES,VAULT,WARDEN,WARDEN_FURY} from "./tabletop-data.js";

const STAGES=["UPPER","MIDDLE","DEEP"];
const copies=cards=>cards.flatMap(card=>
 Array.from({length:card.copies||1},()=>card));
// Printed data never changes during an expedition. Do not expand all 52
// Object definitions or all Monster copies for every hypothetical branch.
const ITEM_COPIES=copies(OBJECTS);
const MONSTER_COPIES=Object.fromEntries(STAGES.map(stage=>[
 stage,copies(MONSTERS.filter(m=>m.stage===stage))]));
const STAGE_ROOMS=Object.fromEntries(STAGES.map(stage=>[
 stage,ROOMS.filter(r=>r.stage===stage)]));
const ROOM_BY_ID=new Map(ROOMS.map(r=>[r.id,r]));
// Only *canonical printed cards* may be shared between rollout forks.
// They are fixed rules data, never mutable Hero state / equipment slots.
const PRINTED_CARDS=new WeakSet([
 ...OBJECTS,...ROOMS,...MONSTERS,...HEROES,VAULT,WARDEN,WARDEN_FURY
]);
/**
 * Copy only mutable expedition data. Unlike structuredClone, this does not
 * duplicate the large, read-only print/card definitions in every deck,
 * inventory, starter, equipped slot, Monster queue and Room reference.
 *
 * Preserve aliases through one WeakMap: actor must point at the copied Hero,
 * and an equipped card must be the exact same canonical card as the one in
 * that copied Hero's inventory. Map/Set contents (including spent cards) must
 * likewise remain identity-consistent.
 */
function cloneMutable(value,seen){
 if(value===null||typeof value!=="object")return value;
 if(PRINTED_CARDS.has(value))return value;
 const prior=seen.get(value);if(prior)return prior;
 let out;
 if(Array.isArray(value)){
  out=new Array(value.length);seen.set(value,out);
  for(let i=0;i<value.length;i++)out[i]=cloneMutable(value[i],seen);
  return out;
 }
 if(value instanceof Set){
  out=new Set();seen.set(value,out);
  for(const x of value)out.add(cloneMutable(x,seen));
  return out;
 }
 if(value instanceof Map){
  out=new Map();seen.set(value,out);
  for(const [k,v] of value)out.set(cloneMutable(k,seen),cloneMutable(v,seen));
  return out;
 }
 const proto=Object.getPrototypeOf(value);
 if(proto!==Object.prototype&&proto!==null)
  throw Error("Unsupported mutable rollout type "+
   (value.constructor?.name||"unknown"));
 out=Object.create(proto);seen.set(value,out);
 for(const key of Object.keys(value))out[key]=cloneMutable(value[key],seen);
 return out;
}
export function cloneRolloutState(s,{mode="card-aware"}={}){
 if(!["card-aware","structured"].includes(mode))
  throw Error("Invalid rollout clone mode "+mode);
 const payload=Object.fromEntries(Object.entries(s).filter(([k])=>k!=="rng"));
 const copied=mode==="structured"?structuredClone(payload):
  cloneMutable(payload,new WeakMap());
 return Object.assign(Object.create(ExpeditionState.prototype),copied);
}
const drawWithoutReplacement=(population,count,rng)=>{
 if(count===0)return [];
 if(population.length<count)throw Error(
  "Insufficient public pool to generate fair hidden deck: "+
  population.length+" for "+count);
 return rng.shuffle(population).slice(0,count);
};
const reduceSeen=(cards,counts)=>{
 const remaining=new Map(Object.entries(counts||{}));
 return cards.filter(card=>{
  const n=remaining.get(card.id)||0;
  if(n>0){remaining.set(card.id,n-1);return false}
  return true;
 });
};
const sameIds=(a,b)=>a.length===b.length&&
 a.every((x,i)=>x.id===b[i].id);
/**
 * Prepare *public information only* once at each decision boundary.
 * It is intentionally short-lived: the source state changes after a move.
 * Reusing it for a later decision is rejected instead of silently using
 * stale counts or a stale hidden-deck model.
 */
export function prepareRolloutDecks(s,knowledge){
 if(!["fair","oracle"].includes(knowledge))
  throw Error("Bad rollout knowledge");
 if(knowledge==="oracle")return {source:s,knowledge};
 // Count actual removals from the hidden deck. Returned/saved Items may
 // be reacquired without removing another physical card from the pile.
 const items=reduceSeen(ITEM_COPIES,s.deckRemovedCounts);
 if(items.length!==s.deck.length)throw Error(
  "Public Item accounting differs from deck: "+
  items.length+" vs "+s.deck.length);
 const rooms={},monsters={};
 for(const stage of STAGES){
  const seen=s.seenRooms||new Set(s.room?[s.room.id]:[]);
  const removed=s.discardedRoomIds||new Set();
  const revealed=(s.peekedRoomIds?.[stage]||[])
   .filter(id=>!seen.has(id)&&!removed.has(id));
  const heldPaths=[s.savedPath,s.whisperRoom].filter(
   card=>card?.stage===stage).map(card=>card.id);
  const excluded=new Set([...seen,...removed,...revealed,...heldPaths]);
  const available=STAGE_ROOMS[stage].filter(r=>!excluded.has(r.id));
  const remaining=s.rooms[stage]?.length||0;
  const known=revealed.slice(0,remaining).map(id=>ROOM_BY_ID.get(id));
  if(remaining-known.length>available.length)
   throw Error("Insufficient public Room pool for "+stage);
  rooms[stage]={known,available,remaining};
  const count=s.monsters[stage]?.length||0;
  const all=MONSTER_COPIES[stage];
  const pool=reduceSeen(all,s.metrics.monsterVisits);
  monsters[stage]={pool:pool.length>=count?pool:all,count};
 }
 return {source:s,knowledge,items,rooms,monsters};
}
/**
 * Draw ONE immutable hypothetical hidden-deck scenario for every action
 * competing at a decision. The deck RNG sequence is identical to the
 * original per-action fork: Items, all stage Rooms, all stage Monsters.
 *
 * Each later fork copies the sampled pile ARRAYS so drawing/reordering in
 * one branch cannot mutate another branch's piles. Canonical card objects
 * are immutable and may safely be shared.
 *
 * No real hidden card identities are read for a fair scenario.
 */
export function sampleRolloutDecks(s,{knowledge,deckSeed,blueprint=null}){
 if(knowledge!=="fair"&&knowledge!=="oracle")
  throw Error("Bad rollout knowledge");
 if(blueprint&&(blueprint.source!==s||blueprint.knowledge!==knowledge))
  throw Error("Rollout deck blueprint does not match this state/knowledge");
 if(knowledge==="oracle")return null; // Existing real order already copied.
 const prepared=blueprint||prepareRolloutDecks(s,knowledge);
 const deckRng=randomSource(deckSeed>>>0);
 const deck=drawWithoutReplacement(prepared.items,s.deck.length,deckRng);
 const rooms={},monsters={};
 for(const stage of STAGES){
  const {known,available,remaining}=prepared.rooms[stage];
  const unknown=drawWithoutReplacement(available,remaining-known.length,deckRng);
  rooms[stage]=[...known,...unknown];
 }
 for(const stage of STAGES){
  const {pool,count}=prepared.monsters[stage];
  monsters[stage]=drawWithoutReplacement(pool,count,deckRng);
 }
 return {source:s,knowledge,deckSeed:deckSeed>>>0,deck,rooms,monsters};
}
export function forkExpeditionState(s,{diceSeed,deckSeed,knowledge,
 blueprint=null,cloneMode="card-aware",sampledDecks=null}){
 if(blueprint&&(blueprint.source!==s||blueprint.knowledge!==knowledge))
  throw Error("Rollout deck blueprint does not match this state/knowledge");
 if(!["fair","oracle"].includes(knowledge))throw Error("Bad rollout knowledge");
 if(sampledDecks&&(sampledDecks.source!==s||
    sampledDecks.knowledge!=="fair"||knowledge!=="fair"||
    sampledDecks.deckSeed!==(deckSeed>>>0)))
  throw Error("Sampled rollout decks do not match source, knowledge or seed");
 const prepared=sampledDecks?null:
  blueprint||prepareRolloutDecks(s,knowledge);
 const fork=cloneRolloutState(s,{mode:cloneMode});
 // The forced choice belongs to the real experiment, not the game rules.
 // Allowing future hypothetical planning to see it would contaminate all
 // earlier decisions and violate the matched pre-choice state contract.
 fork.forceRoomChoice=null;
 const rng=randomSource(diceSeed>>>0);
 fork.rng=rng;
 if(knowledge==="fair"){
  const scenario=sampledDecks||sampleRolloutDecks(s,{
   knowledge,deckSeed,blueprint:prepared});
  // Shallow-copy *arrays*; the printed cards themselves are immutable.
  fork.deck=scenario.deck.slice();
  for(const stage of STAGES){
   fork.rooms[stage]=scenario.rooms[stage].slice();
   fork.monsters[stage]=scenario.monsters[stage].slice();
  }
 }else{
  // Hidden order is copied, not generated. The Oracle knows it already.
  for(const stage of STAGES){
   if(!sameIds(fork.rooms[stage],s.rooms[stage])||
    !sameIds(fork.monsters[stage],s.monsters[stage]))
    throw Error("Oracle deck order corrupted during fork");
  }
 }
 // Bounded rollout policy uses the same tuned weights but MUST NOT recurse
 // into a new rollout search. This is a policy continuation, not a new solver.
 if(fork.agentConfig){
  // The outer decision branches every action. Optionally, each continuation
  // replans future decisions with a smaller budget. Those child forks
  // always use budget zero: finite two-ply search, never recursive explosion.
  const nextBudget=s.rolloutActive?0:(fork.agentConfig.replanBudget||0);
  fork.agentConfig={...fork.agentConfig,knowledge,budget:nextBudget,
   replanBudget:0};
  fork.agentInformation=null;
 }
 fork.rolloutActive=true;
 fork.agentDecisionSerial=0;
 return fork;
}
