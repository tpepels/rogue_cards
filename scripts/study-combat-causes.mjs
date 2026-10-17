#!/usr/bin/env node
/**
 * Short, controlled combat diagnosis using the canonical Rogue Cards engine.
 *
 * These are isolated, explicitly constructed encounters with the printed
 * Monster cards, real Hero starters, real rolls and real reaction windows.
 * NOT a prediction of full-expedition win rates or natural encounter rates.
 *
 * Run: node scripts/study-combat-causes.mjs --trials 4 --samples 3
 * Results: results/combat-causes-<seed>/summary.json and fights.csv
 */
import {mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {forkGameState} from "../src/engine/fork-state.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {randomSource} from "../src/engine/random.js";
import {MONSTERS,ROOMS} from "../src/tabletop-data.js";
import {EXTRA_MONSTERS} from "../src/monster-expansion.js";

const args=process.argv.slice(2);
function option(name,otherwise,min,max){
 const i=args.indexOf("--"+name);
 if(i<0)return otherwise;
 const value=Number(args[i+1]);
 if(!Number.isSafeInteger(value)||value<min||value>max)
  throw Error("--"+name+" must be an integer from "+min+" to "+max);
 return value;
}
const mix=n=>{
 n=(n+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const stages=["UPPER","MIDDLE","DEEP"];
const allMonsters=[...MONSTERS,...EXTRA_MONSTERS].filter(m=>stages.includes(m.stage));
const priorityIds=new Set(["crawler","troll","wisp","mold","wax-golem","sentinel","bone-cantor","glass-revenant"]);
const monsters=allMonsters.filter(m=>priorityIds.has(m.id));
const starterParties=[["warrior"],["warrior","knight"]];
const totalHp=s=>s.heroes.reduce((n,h)=>n+Math.max(0,h.hp),0);
const totalItems=s=>s.heroes.reduce((n,h)=>n+h.inventory.length,0);
const usedItems=s=>Object.values(s.metrics.itemUses||{}).reduce(
 (n,usage)=>n+(usage.total||0),0);
const poisoned=s=>s.heroes.filter(h=>h.hp>0&&h.poison).length;
const sumMap=m=>Object.values(m??{}).reduce((a,b)=>a+b,0);
const safeSubmit=(session,action)=>
 submitDecision(session,action,{observeResult:false,recordHistory:false});
const cloneSession=session=>({
 ...session,
 state:forkGameState(session.state),
 history:[],
 remainingReturns:[...session.remainingReturns],
 pendingNested:session.pendingNested?{
  ...session.pendingNested,
  root:{...session.pendingNested.root},
  responses:session.pendingNested.responses.map(x=>({...x})),
  actions:session.pendingNested.actions.map(x=>({...x}))
 }:null
});
export function makeEncounter(monster,heroes,seed){
 const session=createDecisionSession({seed,heroes,gameMode:"everything-goes"});
 const s=session.state;
 // Use a real physical Room card for canonical settlement, but do not
 // trigger that Room's effects. This controls the encounter in isolation.
 const room=ROOMS.find(c=>c.stage===monster.stage&&
  c.v2?.kind!=="CORRIDOR");
 if(!room)throw Error("No canonical Room for "+monster.stage);
 s.room=room;
 s.monster=monster;
 s.monsterHP=monster.hp;
 s.monsterQueue=[];
 s.elberethAttempts=0;
 s._actedCombatMask=0;
 s.metrics.combatStarts=1;
 s.metrics.encounterStarts=1;
 s.metrics.battles=1;
 session.phase="combat-hero";
 session.heroIndex=-1;
 session.monsterRound=0;
 return session;
}
function choose(session,policy="basic"){
 const actions=sessionActions(session);
 if(!actions.length)throw Error("No legal action at "+session.phase);
 if(session.pendingNested){
  // Do not spend scarce resources merely because a reaction is offered.
  // Reliable Hero ability is chosen when legal, otherwise skip/save/keep.
  const kind=session.pendingNested.trigger?.phase;
  if(kind==="hero-trigger"){
   const steady=actions.find(a=>a.kind==="hero-mode"&&a.mode==="steady");
   if(steady)return steady;
  }
  return actions.find(a=>["skip","save","keep","accept"].includes(a.kind)||
   ["save","keep","accept"].includes(a.mode))??actions[0];
 }
 if(session.phase==="combat-hero"){
  return [...actions].sort((a,b)=>{
   const h1=session.state.heroes[a.heroIndex],h2=session.state.heroes[b.heroIndex];
   return session.state.stats(h2).atk-session.state.stats(h1).atk||
    a.heroIndex-b.heroIndex;
  })[0];
 }
 if(session.phase==="combat"){
  if(policy==="elbereth"&&session.state.elberethAttempts<2){
   const ward=actions.find(a=>a.kind==="elbereth"&&a.mode==="ward");
   if(ward)return ward;
  }
  return actions.find(a=>a.kind==="attack")??actions[0];
 }
 if(session.phase==="parley")
  return actions.find(a=>a.kind===(policy==="parley"?"parley":"fight"))??
   actions.find(a=>a.kind==="fight")??actions[0];
 if(session.phase==="corpse")
  return actions.find(a=>a.kind==="leave")??actions[0];
 if(["between-rooms","explore"].includes(session.phase))
  return actions.find(a=>a.kind==="continue")??actions[0];
 if(session.phase==="room")
  return actions.find(a=>a.kind==="room-choice")??actions[0];
 return actions[0];
}
/**
 * The session controller, not monsterHP alone, defines the encounter end:
 * after a kill there may be a corpse choice and several queued Monsters.
 * A terminal party wipe also ends the experiment; round caps do not.
 */
export function encounterOutcome(session){
 const {state:s}=session;
 if(s.metrics.roundLimit||s.metrics.unresolved)return "unresolved";
 if(session.pendingNested)return "ongoing";
 if(session.phase==="terminal")
  return !s.alive()?"wipe":s.metrics.won||s.metrics.escaped?"cleared":"unresolved";
 if(session.phase==="between-rooms"&&!s.room&&!s.monster&&
    s.monsterQueue.length===0)return "cleared";
 return "ongoing";
}
const encounterPhases=new Set([
 "combat-hero","combat","monster-response","parley","corpse"
]);
/**
 * Finish EVERY active/queued Monster (including post-kill decisions) using
 * only the canonical phase machine. Do not continue into another Room.
 * A phase cap is an invalid measurement, never a successful encounter.
 */
export function completeEncounter(session,{
 policy="basic",firstAction=null,stepLimit=1200,selectAction=null
}={}){
 let steps=0,heroTurns=0,poisonSeen=poisoned(session.state)>0;
 let maxPoisoned=poisoned(session.state);
 let outcome=encounterOutcome(session);
 while(outcome==="ongoing"&&steps<stepLimit){
  if(!encounterPhases.has(session.phase))
   throw Error("Unexpected phase during encounter: "+session.phase+
    " ("+(session.state.monster?.id??"no Monster")+")");
  const action=firstAction??(selectAction?
   selectAction(session,steps):choose(session,policy));
  firstAction=null;
  if(session.phase==="combat"&&!session.pendingNested)heroTurns++;
  safeSubmit(session,action);
  const countPoisoned=poisoned(session.state);
  maxPoisoned=Math.max(maxPoisoned,countPoisoned);
  poisonSeen||=countPoisoned>0;
  steps++;
  outcome=encounterOutcome(session);
 }
 if(outcome==="ongoing"||outcome==="unresolved")
  throw Error("Encounter did not settle canonically: "+
   JSON.stringify({phase:session.phase,pending:!!session.pendingNested,
    monster:session.state.monster?.id??null,
    queue:session.state.monsterQueue.map(m=>m.id),
    steps,stepLimit,roundLimit:!!session.state.metrics.roundLimit}));
 return {outcome,steps,heroTurns,poisonSeen,maxPoisoned};
}
function value(session,startingHp,startingItems){
 const outcome=encounterOutcome(session);
 if(outcome!=="cleared"&&outcome!=="wipe")
  throw Error("Cannot score unfinished encounter: "+outcome);
 const s=session.state;
 return (totalHp(s)-startingHp)*1.1+
  (startingItems-totalItems(s))*(-1.8)+
  (outcome==="cleared"?12:-18);
}
export function tactical(session,{samples,decisionSeed}){
 // session.phase remains 'combat' while a canonical attack or Monster
 // response is suspended at a nested player reaction. NEVER change RNG
 // or fork a new search from that unfinished action: its dice prefix
 // must replay identically when the reaction is submitted.
 if(session.pendingNested)return choose(session);
 const actions=sessionActions(session);
 if(session.phase!=="combat"||actions.length===1)return choose(session);
 // Limit branching, but never remove the regular attack. Item options are
 // real legal actions, not abstract estimates of card text.
 const relevant=actions.filter(a=>a.kind==="attack"||
  a.kind==="elbereth"||
  a.kind==="item").slice(0,8);
 const candidates=relevant.length?relevant:[choose(session)];
 const startHp=totalHp(session.state),startItems=totalItems(session.state);
 let best=candidates[0],bestValue=-Infinity;
 for(const candidate of candidates){
  let total=0;
  for(let trial=0;trial<samples;trial++){
   const fork=cloneSession(session);
   // Each candidate receives the same independently sampled future stream.
   fork.state.rng=randomSource(mix(decisionSeed^Math.imul(trial+1,0x85ebca6b)));
   completeEncounter(fork,{firstAction:candidate});
   total+=value(fork,startHp,startItems);
  }
  const mean=total/samples;
  if(mean>bestValue+1e-9){best=candidate;bestValue=mean;}
 }
 return best;
}
function fight(source,{policy,healthReduction=0,seed,samples}){
 const session=cloneSession(source),s=session.state;
 if(policy==="parley")session.phase="parley";
 s.rng=randomSource(seed);
 // Controlled starting-HP intervention; the printed Monster stays unchanged.
 s.monsterHP=Math.max(1,s.monsterHP-healthReduction);
 const startHp=totalHp(s),startItems=totalItems(s);
 const startDamage=s.metrics.damage,startBehaviors=sumMap(s.metrics.monsterBehaviorBands);
 const startElbereth=s.metrics.elberethAttempts,startFailures=s.metrics.elberethFailures;
 const startMonsterDraws=s.metrics.monsterDraws??0;
 const startParleyWins=s.metrics.negotiationsWon??0;
 const startBanishments=s.metrics.banishments??0;
 const startKills=s.metrics.kills??0;
 const startBattles=s.metrics.battles??0;
 const startItemsUsed=usedItems(s),startSpent=s.metrics.spent??0;
 const startDrawn=s.metrics.drawn??0;
 const startHpByHero=s.heroes.map(h=>h.hp);
 // Both experimental rollouts and real test arms must use exactly the
 // same encounter-completion loop, including each queued Monster.
 const {outcome,steps,heroTurns,poisonSeen,maxPoisoned}=completeEncounter(
  session,{policy,selectAction:policy==="tactical"?
   (at,step)=>tactical(at,{
    samples,decisionSeed:mix(seed^Math.imul(step+1,0xc2b2ae35))
   }):null});
 // Only a genuinely cleared Room with no queue is a safe completion.
 if(outcome==="cleared"&&
    (s.monster||s.monsterQueue.length||session.pendingNested||
     session.phase!=="between-rooms"))
  throw Error("Encounter falsely reported as safe");
 const avoided=(s.metrics.negotiationsWon??0)>startParleyWins;
 const banished=(s.metrics.banishments??0)>startBanishments;
 const killed=(s.metrics.kills??0)-startKills;
 return {
  alive:s.alive(),resolvedSafely:outcome==="cleared",
  defeated:killed>0,monstersKilled:killed,avoided,banished,
  capped:false,heroTurns,steps,
  outcome,monstersHandled:1+(s.metrics.battles??0)-startBattles,
  partyHpBefore:startHp,partyHpAfter:totalHp(s),
  heroHpBefore:startHpByHero.join("/"),
  heroHpAfter:s.heroes.map(h=>h.hp).join("/"),
  heroDeaths:s.heroes.filter(h=>h.hp<=0).length,
  poisonSeen,maxPoisoned,poisonAtEnd:poisoned(s),
  hpLost:startHp-totalHp(s),
  totalDamage:s.metrics.damage-startDamage,
  monsterBehaviors:sumMap(s.metrics.monsterBehaviorBands)-startBehaviors,
  // Inventory delta is NOT items spent: drawn rewards can make it negative.
  inventoryDelta:startItems-totalItems(s),
  consumedItems:(s.metrics.spent??0)-startSpent,
  itemsUsed:usedItems(s)-startItemsUsed,
  itemsDrawn:(s.metrics.drawn??0)-startDrawn,
  elbereth:s.metrics.elberethAttempts-startElbereth,
  elberethFailures:s.metrics.elberethFailures-startFailures,
  extraMonsterDraws:(s.metrics.monsterDraws??0)-startMonsterDraws,
  queuedMonsters:s.monsterQueue.length
 };
}
function aggregate(rows){
 const groups=new Map();
 for(const r of rows){
  const k=[r.partyType,r.stage,r.arm].join("|");
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(r);
 }
 return [...groups].map(([k,rs])=>{
  const [partyType,stage,arm]=k.split("|"),n=rs.length;
  const mean=field=>rs.reduce((v,r)=>v+r[field],0)/n;
  return {partyType,stage,arm,n,winRate:mean("defeated"),
   wipeRate:1-mean("alive"),meanHpLost:mean("hpLost"),
   meanMonsterBehaviors:mean("monsterBehaviors"),
   meanHeroTurns:mean("heroTurns"),
   meanConsumedItems:mean("consumedItems"),
   meanItemsUsed:mean("itemsUsed"),
   meanHeroDeaths:mean("heroDeaths"),
   poisonSeenRate:mean("poisonSeen"),
   meanElberethFailures:mean("elberethFailures"),
   meanExtraMonsterDraws:mean("extraMonsterDraws"),
   safeResolutionRate:mean("resolvedSafely"),
   meanQueuedMonsters:mean("queuedMonsters"),
   avoidRate:mean("avoided"),
   capped:rs.filter(r=>r.capped).length};
 });
}
function csv(rows){
 const keys=Object.keys(rows[0]??{});
 return keys.join(",")+"\n"+rows.map(r=>keys.map(k=>{
  const val=String(r[k]??"");
  return /[",\n]/.test(val)?'"'+val.replaceAll('"','""')+'"':val;
 }).join(",")).join("\n")+"\n";
}
export function runDiagnostic({trials=4,samples=3,seed=20261017,
 out="results/combat-causes-"+seed,quiet=false}={}){
 const rows=[];
 const arms=[
  {arm:"basic",policy:"basic",healthReduction:0},
  {arm:"basic_minus2hp",policy:"basic",healthReduction:2},
  {arm:"parley_first",policy:"parley",healthReduction:0},
  {arm:"elbereth_twice",policy:"elbereth",healthReduction:0},
  {arm:"tactical",policy:"tactical",healthReduction:0},
  {arm:"tactical_minus2hp",policy:"tactical",healthReduction:2}
 ];
 let index=0;
 for(const monster of monsters)for(const heroes of starterParties){
  for(let trial=0;trial<trials;trial++){
   const gameSeed=mix(seed^Math.imul(++index,0x9e3779b9));
   const source=makeEncounter(monster,heroes,gameSeed);
   const combatSeed=mix(gameSeed^0x75cdd1e1);
   for(const arm of arms){
    const stats=fight(source,{...arm,seed:combatSeed,samples});
    rows.push({monsterId:monster.id,monster:monster.title,stage:monster.stage,
     party:heroes.join("+"),partyType:heroes.length===1?"solo":"duo",
     trial,seed:gameSeed,arm:arm.arm,...stats});
   }
  }
  if(!quiet)console.error("Analyzed "+monster.title);
 }
 const summary={
  schema:"combat-causes-v1",
  scope:"Isolated canonical encounters at full starting Hero HP, starting Items and no previous Rooms; not full-expedition probabilities",
  design:{trials,samples,seed,parties:starterParties,
   monsterCount:monsters.length,arms:arms.map(a=>a.arm)},
  rows:rows.length,grouped:aggregate(rows),
  truncated:rows.filter(r=>r.capped).length,
  limitations:[
   "The chosen Room contributes no entry effect or prior attrition",
   "Sampled lookahead is a limited-horizon stochastic combat policy, not alpha-beta or certified optimal play",
   "Paired arms share initial dice streams; actions may consume dice in different order",
   "PARLEY is tested only as a deliberately chosen initial action; no future-Room decisions are included",
   "All queued Monsters are resolved by canonical combat and corpse decisions, or the encounter ends in a party wipe",
   "The -2 HP arm starts the printed Monster already damaged; printed data are never edited",
   "Tactical samples play the complete encounter with a basic continuation after the candidate action; deeper tactical policy work is Phase 2"
  ]
 };
 if(!quiet){
  const directory=resolve(out);
  if(existsSync(directory))throw Error("Output directory exists: "+directory);
  mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,"summary.json"),JSON.stringify(summary,null,2)+"\n");
  writeFileSync(join(directory,"fights.csv"),csv(rows));
  console.log("Wrote "+directory+"/summary.json and fights.csv");
  console.log("Scenarios: "+rows.length+", truncated: "+summary.truncated);
  for(const group of summary.grouped)console.log(
   [group.partyType,group.stage,group.arm,
    "kill="+(100*group.winRate).toFixed(1)+"%",
    "safe="+(100*group.safeResolutionRate).toFixed(1)+"%",
    "HP lost="+group.meanHpLost.toFixed(2),
    "avoided="+(100*group.avoidRate).toFixed(1)+"%",
    "Monster responses="+group.meanMonsterBehaviors.toFixed(2)].join(" | "));
 }
 return {summary,rows};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const allowed=new Set(["--trials","--samples","--seed","--out"]);
 for(let i=0;i<args.length;i+=2)
  if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith("--"))
   throw Error("Invalid CLI argument "+(args[i]??""));
 const seed=option("seed",20261017,1,0xffffffff);
 const trial=option("trials",4,1,100);
 const samples=option("samples",3,1,32);
 const outIndex=args.indexOf("--out");
 runDiagnostic({seed,trials:trial,samples,
  out:outIndex<0?"results/combat-causes-"+seed:args[outIndex+1]});
}
