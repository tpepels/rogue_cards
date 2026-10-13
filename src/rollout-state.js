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
export function forkExpeditionState(s,{diceSeed,deckSeed,knowledge}){
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
  // Inventory acquisitions include all public starters, draws and transfers.
  const pool=reduceSeen(copies(OBJECTS),s.metrics.objectAcquisitions);
  if(pool.length!==s.deck.length)throw Error("Public Item accounting differs from deck: "+
   pool.length+" vs "+s.deck.length);
  fork.deck=drawWithoutReplacement(pool,s.deck.length,deckRng);
  for(const stage of STAGES){
   const seen=s.seenRooms||new Set(s.room?[s.room.id]:[]);
   const revealed=(s.peekedRoomIds?.[stage]||[]).filter(id=>
    !seen.has(id));
   const available=ROOMS.filter(r=>r.stage===stage&&
    !seen.has(r.id)&&!revealed.includes(r.id));
   const remaining=s.rooms[stage]?.length||0;
   const known=revealed.slice(0,remaining).map(id=>
    ROOMS.find(r=>r.id===id));
   const unknown=drawWithoutReplacement(available,remaining-known.length,deckRng);
   fork.rooms[stage]=[...known,...unknown];
  }
  for(const stage of STAGES){
   const remaining=s.monsters[stage]?.length||0;
   const all=copies(MONSTERS.filter(m=>m.stage===stage));
   const pool=reduceSeen(all,s.metrics.monsterVisits);
   const supply=pool.length>=remaining?pool:all;
   fork.monsters[stage]=drawWithoutReplacement(supply,remaining,deckRng);
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
