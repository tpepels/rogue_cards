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
import {ROOMS,MONSTERS,OBJECTS} from "./tabletop-data.js";

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
 const items=reduceSeen(ITEM_COPIES,s.metrics.objectAcquisitions);
 if(items.length!==s.deck.length)throw Error(
  "Public Item accounting differs from deck: "+
  items.length+" vs "+s.deck.length);
 const rooms={},monsters={};
 for(const stage of STAGES){
  const seen=s.seenRooms||new Set(s.room?[s.room.id]:[]);
  const revealed=(s.peekedRoomIds?.[stage]||[]).filter(id=>!seen.has(id));
  const available=STAGE_ROOMS[stage].filter(r=>
   !seen.has(r.id)&&!revealed.includes(r.id));
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
export function forkExpeditionState(s,{diceSeed,deckSeed,knowledge,blueprint=null}){
 if(blueprint&&(blueprint.source!==s||blueprint.knowledge!==knowledge))
  throw Error("Rollout deck blueprint does not match this state/knowledge");
 const prepared=blueprint||prepareRolloutDecks(s,knowledge);
 if(!["fair","oracle"].includes(knowledge))throw Error("Bad rollout knowledge");
 const payload=Object.fromEntries(Object.entries(s).filter(([k])=>k!=="rng"));
 // The single structuredClone call is important: equipped items and used sets
 // must retain identity with the same cloned inventory card objects.
 const fork=Object.assign(Object.create(ExpeditionState.prototype),
  structuredClone(payload));
 const rng=randomSource(diceSeed>>>0);
 fork.rng=rng;
 const deckRng=randomSource(deckSeed>>>0);
 if(knowledge==="fair"){
  // All populations were derived from public card history before sampling.
  fork.deck=drawWithoutReplacement(prepared.items,s.deck.length,deckRng);
  for(const stage of STAGES){
   const {known,available,remaining}=prepared.rooms[stage];
   const unknown=drawWithoutReplacement(available,remaining-known.length,deckRng);
   fork.rooms[stage]=[...known,...unknown];
  }
  for(const stage of STAGES){
   const {pool,count}=prepared.monsters[stage];
   fork.monsters[stage]=drawWithoutReplacement(pool,count,deckRng);
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
  fork.agentConfig={...fork.agentConfig,knowledge,budget:0};
  fork.agentInformation=null;
 }
 fork.rolloutActive=true;
 fork.agentDecisionSerial=0;
 return fork;
}
