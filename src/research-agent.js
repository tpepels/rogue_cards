/**
 * Research policy: fair-information versus perfect-deck-information planners.
 *
 * CRITICAL: Oracle can see remaining Item, Room and Monster card order. Neither
 * agent gets s.rng, future die faces, a copy of PRNG state, or actual future
 * simulation. Chance samples use a separately seeded random stream and cannot
 * consume/peek the real expedition dice.
 *
 * This is bounded, approximate stochastic decision lookahead, NOT an exact
 * optimal-policy solver or a full-game tree search.
 */
import {ROOMS,OBJECTS,MONSTERS} from "./tabletop-data.js";
import {ROOM_EFFECTS} from "./room-effect-model.js";
import {ROLL_EFFECTS,bandFor} from "./effect-model.js";
import {itemOptions} from "./item-access.js";
import {planRoom,planParley,planCombat,planSeal,partySummary,forecastCombat,
 estimatedDice,hitProbability,expectedAttack,remainingMonsterHP,
 responseThreat,futureItemValue,effectivePlannerWeights} from "./decision-planner.js";

export const AGENT_KNOWLEDGE=Object.freeze(["fair","oracle"]);
export const AGENT_WEIGHTS=Object.freeze({
 damage:1,death:1,resource:1,draw:1,spell:1,parley:1,
 itemReserve:1,itemMargin:.1,lookahead:1,parleyThreshold:0,sealThreshold:0
});
export const OPTIMIZATION_RANGES=Object.freeze({
 damage:[.55,1.8],death:[.55,1.8],resource:[.55,1.8],
 draw:[.55,1.8],spell:[.55,1.8],parley:[.55,1.8],
 itemReserve:[.2,2.5],itemMargin:[-.5,1.5],
 lookahead:[0,2],parleyThreshold:[-7,7],sealThreshold:[-.3,.3]
});
const u32=n=>n>>>0;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function validateAgentConfig(config){
 if(!config||typeof config!=="object"||Array.isArray(config))
  throw Error("agentConfig must be an object");
 const knowledge=config.knowledge??"fair";
 if(!AGENT_KNOWLEDGE.includes(knowledge))throw Error("Invalid agent knowledge: "+knowledge);
 const budget=config.budget??0;
 if(!Number.isSafeInteger(budget)||budget<0||budget>128)
  throw Error("Agent chance budget must be integer 0..128");
 const samplingSeed=config.samplingSeed??277218221;
 if(!Number.isSafeInteger(samplingSeed)||samplingSeed<0||samplingSeed>0xffffffff)
  throw Error("Agent sample seed must be UINT32");
 const weights={...AGENT_WEIGHTS,...(config.weights||{})};
 if(!config.weights||typeof config.weights!=="object"||Array.isArray(config.weights))
  throw Error("Agent weights must be an object");
 for(const [name,value] of Object.entries(config.weights)){
  if(!(name in OPTIMIZATION_RANGES)||!Number.isFinite(value))
   throw Error("Unknown or nonfinite agent weight "+name);
  const [lo,hi]=OPTIMIZATION_RANGES[name];
  if(value<lo||value>hi)throw Error("Agent weight "+name+" outside ["+lo+", "+hi+"]");
 }
 return Object.freeze({knowledge,budget,samplingSeed,weights:Object.freeze(weights)});
}
const idOf=card=>card.id;
/** Returns an immutable *observation*, never an alias to hidden piles.
 * Fair observation contains no IDs from hidden piles. Oracle sees full
 * remaining card order. The next Room is array[0]; next drawn Item/Monster
 * is at the END of their respective arrays.
 */
export function observeDecks(s,knowledge){
 if(!AGENT_KNOWLEDGE.includes(knowledge))throw Error("Invalid agent knowledge");
 if(knowledge==="fair")return Object.freeze({
  knowledge:"fair",remainingItems:s.deck.length,
  roomCounts:Object.freeze(Object.fromEntries(
   Object.entries(s.rooms).map(([stage,pile])=>[stage,pile.length]))),
  monsterCounts:Object.freeze(Object.fromEntries(
   Object.entries(s.monsters).map(([stage,pile])=>[stage,pile.length])))
 });
 const roomOrder=Object.fromEntries(Object.entries(s.rooms).map(
  ([stage,pile])=>[stage,Object.freeze(pile.map(idOf))]));
 const monsterOrder=Object.fromEntries(Object.entries(s.monsters).map(
  ([stage,pile])=>[stage,Object.freeze(pile.map(idOf))]));
 return Object.freeze({knowledge:"oracle",
  remainingItems:s.deck.length,
  items:Object.freeze(s.deck.map(idOf)),
  rooms:Object.freeze(roomOrder),monsters:Object.freeze(monsterOrder)});
}
function observationScores(s,obs){
 if(obs.knowledge!=="oracle")return Object.freeze({
  expectedMagicDraws:Math.max(0,9-s.metrics.cleared)*.45,
  nextItemValue:3.2,nextMonsterThreat:0});
 const cards=obs.items.slice(-Math.min(12,obs.items.length));
 const futureMagic=cards.filter(id=>
  OBJECTS.find(c=>c.id===id)?.v2.tags.includes("MAGIC")).length;
 const region=s.room?.stage;
 const coming=region==="FINAL"?null:obs.monsters[region]?.at(-1);
 const m=MONSTERS.find(mon=>mon.id===coming);
 const f=m?forecastCombat(s,m):null;
 return Object.freeze({expectedMagicDraws:Math.min(9-s.metrics.cleared,
   futureMagic),nextItemValue:cards.length?
   cards.reduce((sum,id)=>sum+(OBJECTS.find(c=>c.id===id)?.v2.tags.includes("MAGIC")?5:3),0)/cards.length:0,
  nextMonsterThreat:f?.expectedLoss||0});
}
/** All policy observations are derived afresh from the current state, never
 * cached across mutable Room / deck changes. The fair agent only receives
 * aggregate counts and public card definitions; it cannot inspect pile order.
 */
export function prepareAgentObservation(s){
 if(!s.agentConfig)throw Error("Research agent not configured");
 const observation=observeDecks(s,s.agentConfig.knowledge);
 const scores=observationScores(s,observation);
 s.agentInformation=scores; // purely derived advisory features
 return observation;
}
const hash=str=>{
 let h=2166136261;
 for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);
 return u32(h);
};
const mix=n=>{n=u32(n+0x9e3779b9);n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);return u32(n^(n>>>16));};
function chanceSource(s,tag){
 // Do NOT use s.plannerSeed, s.rng, or real expedition seed. This source
 // is independent of the game's hidden future dice, including in oracle mode.
 let state=mix(s.agentConfig.samplingSeed^hash(tag)^
  Math.imul(s.agentDecisionSerial||0,0x27d4eb2f));
 return n=>{state=mix(state);return 1+state%n;};
}
const STAGE_ROOM_PRIOR=Object.freeze(Object.fromEntries(
 ["UPPER","MIDDLE","DEEP"].map(stage=>[
  stage,Object.freeze(ROOMS.filter(r=>r.stage===stage).map(idOf))])));
const ROOM_BY_ID=new Map(ROOMS.map(r=>[r.id,r]));
const MONSTER_BY_ID=new Map(MONSTERS.map(r=>[r.id,r]));
const OBJECT_BY_ID=new Map(OBJECTS.map(r=>[r.id,r]));
function futureRoom(s,observation,step,die){
 const stage=s.room?.stage;
 if(!stage||stage==="FINAL")return null;
 if(observation.knowledge==="oracle"){
  return ROOM_BY_ID.get(observation.rooms[stage]?.[step])||null;
 }
 const prior=STAGE_ROOM_PRIOR[stage].filter(id=>id!==s.room.id);
 return ROOM_BY_ID.get(prior[(die(prior.length)-1)]||"")||null;
}
function futureMonster(s,obs,step,die){
 const stage=s.room?.stage;
 if(!stage||stage==="FINAL")return null;
 if(obs.knowledge==="oracle"){
  return MONSTER_BY_ID.get(obs.monsters[stage]?.at(-(step+1)))||null;
 }
 const prior=MONSTERS.filter(m=>m.stage===stage);
 return prior.length?prior[die(prior.length)-1]:null;
}
function futureItem(s,obs,step,die){
 if(obs.knowledge==="oracle")
  return OBJECT_BY_ID.get(obs.items.at(-(step+1)))||null;
 return OBJECTS[die(OBJECTS.length)-1]||null;
}
/** Coarse outcome model for *decision scoring* only. Every real choice still
 * passes through the unchanged full-effect expedition runtime.
 */
function approximate(s,ops,die,lookahead,obs){
 let hp=0,resources=0,extraMonster=0,futureItemIndex=0;
 let utility=0;
 for(const raw of ops){
  const [kind,arg]=raw.split(":"),amount=estimatedDice(arg);
  if(kind==="DRAW"){
   for(let i=0;i<Math.min(4,amount);i++){
    const item=futureItem(s,obs,futureItemIndex++,die);
    const magic=item?.v2?.tags?.includes("MAGIC");
    utility+=magic&&s.strategy==="magic"?1.3:0.4;
   }
   resources+=amount;
  }else if(kind==="DISCARD"||kind==="COST")resources-=amount;
  else if(kind==="TRADE"){resources-=amount;resources+=Number(raw.split(":")[2])||0;}
  else if(kind==="HEAL"||kind==="HEAL_ALL")hp+=amount;
  else if(kind==="HURT")hp-=amount;
  else if(kind==="MONSTER_DRAW")extraMonster++;
  else if(kind==="POISON")hp-=1.8;
  else if(kind==="CURE")hp+=.6;
  else if(kind==="RECHARGE")utility+=s.exhaustedWand()?1.2:0;
  else if(kind==="FIGHT")extraMonster+=.5;
  else if(kind==="FIGHT_HEAL")hp+=amount*.6;
  else if(kind==="FIGHT_REWARD")resources+=amount*.6;
 }
 const monster=extraMonster>0?futureMonster(s,obs,0,die):null;
 if(monster){
  const f=forecastCombat(s,monster);
  hp-=f.expectedLoss*extraMonster;
 }
 const party=partySummary(s);
 const cap=Math.max(1,party.max);
 const projected=clamp(party.hp+hp,0,cap);
 if(projected<=0)utility-=s.agentConfig.weights.death*25;
 utility+=Math.min(hp,party.missing)*1.15*s.agentConfig.weights.damage;
 utility-=Math.max(0,-hp)*1.7*s.agentConfig.weights.damage;
 utility+=resources*1.6*s.agentConfig.weights.resource;
 return {projected,resources:party.cards+resources,utility};
}
function roomOptionRollout(s,legal,choice,observation){
 if(!legal[choice])return -Infinity;
 const room=s.room,ops=ROOM_EFFECTS[room.id],budget=s.agentConfig.budget;
 if(!budget)return 0;
 const die=chanceSource(s,"room:"+room.id+":"+choice);
 const weights=s.agentConfig.weights;
 let total=0;
 for(let i=0;i<budget;i++){
  const face=die(6),out=ops.outcomes[bandFor(room,face)];
  const immediate=approximate(s,[...ops.choices[choice],...out],die,true,observation);
  let future=0;
  for(let depth=0;depth<2;depth++){
   const upcoming=futureRoom(s,observation,depth,die);
   if(!upcoming)break;
   const outcome=ROOM_EFFECTS[upcoming.id].outcomes[
    bandFor(upcoming,die(6))];
   // Future available Room choices are estimated, not solved recursively.
   const hazard=approximate(s,outcome,die,true,observation);
   const healthPenalty=hazard.utility<0?
    Math.abs(hazard.utility)*(immediate.projected<
      partySummary(s).max*.45?1.3:.7):0;
   future+=hazard.utility*.12-healthPenalty*.08;
  }
  total+=immediate.utility+future;
 }
 return weights.lookahead*total/budget;
}
export function agentPlanRoom(s,legal){
 const obs=prepareAgentObservation(s);
 const baseline=planRoom(s,legal);
 if(!s.agentConfig.budget)return baseline;
 s.agentDecisionSerial=(s.agentDecisionSerial||0)+1;
 const scores=baseline.scores.map((v,i)=>
  Number.isFinite(v)?v+roomOptionRollout(s,legal,i,obs)*.28:v);
 const choice=scores[1]>scores[0]?1:0;
 return {choice,scores,margin:Math.abs(scores[1]-scores[0]),
  reason:"bounded_chance_room_lookahead",samples:s.agentConfig.budget,
  knowledge:s.agentConfig.knowledge};
}
export function agentPlanParley(s,m){
 prepareAgentObservation(s);
 const result=planParley(s,m);
 if(result.reason==="unknown_monster"||result.reason==="cannot_pay")return result;
 const margin=result.score-(s.agentConfig.weights.parleyThreshold);
 return {...result,attempt:result.score>s.agentConfig.weights.parleyThreshold,
  reason:"agent_parley_threshold",margin};
}
export function agentPlanCombat(s,h){
 prepareAgentObservation(s);
 // Baseline tactical forecast already marginalizes printed die bands. Agent
 // parameters control risk, future reservation and the attack-vs-Item margin.
 const result=planCombat(s,h);
 return {...result,reason:"agent_expected_combat_value",
  knowledge:s.agentConfig.knowledge};
}
export function agentPlanSeal(s){
 prepareAgentObservation(s);
 const result=planSeal(s);
 if(result.reason==="unaffordable")return result;
 const threshold=s.agentConfig.weights.sealThreshold;
 const margin=result.margin-threshold;
 return {...result,attempt:margin>0,margin,
  reason:"agent_seal_threshold"};
}
