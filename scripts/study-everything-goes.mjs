#!/usr/bin/env node
/**
 * Fast canonical decision-session pacing check for Everything Goes.
 * Uses a deliberately simple deterministic policy, NOT MCTS; these results
 * are diagnostics and do not predict optimal player choices or table time.
 *
 * node scripts/study-everything-goes.mjs --runs 20 --seed 20261016
 */
import {createDecisionSession,sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {ALL_ROOMS,ALL_MONSTERS} from "../src/decks.js";
const argv=process.argv.slice(2);
const arg=(flag,fallback)=>argv.includes(flag)?argv[argv.indexOf(flag)+1]:fallback;
const runs=Number(arg("--runs","20")),startSeed=Number(arg("--seed","20261016"));
const hero=arg("--hero","warrior");
if(!Number.isInteger(runs)||runs<1||runs>10000||!Number.isSafeInteger(startSeed)||startSeed<0){
 console.error("Usage: node scripts/study-everything-goes.mjs --runs 20 --seed 20261016 [--hero warrior]");
 process.exit(2);
}
const roomById=new Map(ALL_ROOMS.map(c=>[c.id,c]));
const monsterById=new Map(ALL_MONSTERS.map(c=>[c.id,c]));
function select(session,actions,step,seed){
 const phase=session.pendingNested?.trigger?.phase||session.phase;
 const choose=kind=>actions.find(a=>a.kind===kind);
 if(phase==="room"){
  const roomChoices=actions.filter(a=>a.kind==="room-choice");
  return roomChoices[(seed+step)%roomChoices.length]||actions[0];
 }
 if(phase==="combat")return choose("attack")||actions[0];
 if(phase==="parley"){
  return (seed+step)%4===0?(choose("parley")||choose("fight")):choose("fight");
 }
 if(phase==="vault"||phase==="post-warden")
  return choose("fight")||actions[0];
 if(phase==="corpse")return choose("leave")||actions[0];
 if(phase==="between-rooms"){
  const injured=session.state.heroes.some(h=>h.hp>0&&h.hp<h.card.hp/2);
  if(injured){
   const healing=actions.find(a=>a.mode==="healing-tool");
   if(healing)return healing;
  }
 }
 if(phase==="effect-choice")return actions.find(a=>a.mode==="save"||a.mode==="keep")||actions[0];
 return choose("continue")||choose("skip")||choose("choose-hero-turn")||actions[0];
}
const records=[];
for(let i=0;i<runs;i++){
 const seed=startSeed+i,session=createDecisionSession({
  seed,heroes:[hero],gameMode:"everything-goes"
 });
 let steps=0;
 try{
  while(session.phase!=="terminal"&&steps<20000){
   const actions=sessionActions(session);
   if(!actions.length)throw Error("No legal actions in "+session.phase);
   const chosen=select(session,actions,steps,seed);
   submitDecision(session,chosen);
   steps++;
  }
  if(session.phase!=="terminal")throw Error("Nonterminal after "+steps+" actions");
 }catch(error){
  console.error("Failed seed "+seed+" at "+session.phase+
   " in "+(session.state.room?.id||"no Room")+": "+error.stack);
  process.exit(1);
 }
 const state=session.state,visits=state.metrics.monsterVisits;
 const ordinary=Object.entries(visits).reduce((n,[id,count])=>
  n+(monsterById.has(id)?count:0),0);
 const bosses=(visits.warden||0)+(visits["warden-fury"]||0);
 const regionalRooms=[...state.seenRooms].map(id=>roomById.get(id)).filter(Boolean);
 const normal=regionalRooms.filter(c=>c.v2.kind!=="CORRIDOR");
 const byStage=Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(stage=>[
  stage,{rooms:normal.filter(c=>c.stage===stage).length,
   corridors:regionalRooms.filter(c=>c.stage===stage&&c.v2.kind==="CORRIDOR").length,
   monsters:Object.entries(visits).reduce((n,[id,count])=>n+
    (monsterById.get(id)?.stage===stage?count:0),0)}
 ]));
 records.push({seed,won:!!state.metrics.won,steps,
  rooms:regionalRooms.length,normalRooms:normal.length,
  corridors:regionalRooms.length-normal.length,
  monsterEncounters:ordinary,
  ordinaryCombats:Math.max(0,state.metrics.combatStarts-bosses),
  kills:state.metrics.kills,itemsDrawn:state.metrics.drawn,
  bossPhases:bosses,byStage});
}
const mean=fn=>Number((records.reduce((n,r)=>n+fn(r),0)/runs).toFixed(3));
const count=fn=>records.filter(fn).length;
const stages=["UPPER","MIDDLE","DEEP"];
const report={
 schema:"everything-goes-pacing-v1",runs,startSeed,hero,policy:"simple-deterministic-not-MCTS",
 winRate:Number((count(r=>r.won)/runs).toFixed(3)),
 means:{rooms:mean(r=>r.rooms),normalRooms:mean(r=>r.normalRooms),
  corridors:mean(r=>r.corridors),ordinaryEncounters:mean(r=>r.monsterEncounters),
  ordinaryCombats:mean(r=>r.ordinaryCombats),kills:mean(r=>r.kills),
  drawnItems:mean(r=>r.itemsDrawn),bossPhases:mean(r=>r.bossPhases),
  steps:mean(r=>r.steps)},
 noOrdinaryCombatFraction:Number((count(r=>r.ordinaryCombats===0)/runs).toFixed(3)),
 byStage:Object.fromEntries(stages.map(stage=>[stage,{
  meanRooms:mean(r=>r.byStage[stage].rooms),
  meanCorridors:mean(r=>r.byStage[stage].corridors),
  meanMonsters:mean(r=>r.byStage[stage].monsters)}])),
 note:"Played Rooms and combat counts are engine telemetry, not elapsed physical playtime. Death and trapdoors can shorten runs."
};
console.log(JSON.stringify(report,null,2));
