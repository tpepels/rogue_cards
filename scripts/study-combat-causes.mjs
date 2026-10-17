#!/usr/bin/env node
/**
 * Short, controlled combat diagnosis using the canonical Rogue Cards engine.
 *
 * These are isolated, explicitly constructed encounters with the printed
 * Monster cards, real Hero starters, real rolls and real reaction windows.
 * NOT a prediction of full-expedition win rates or natural encounter rates.
 *
 * Run: node scripts/study-combat-causes.mjs --trials 4 --samples 3 --depth 2
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
const count=(record,field)=>record?.[field]??0;
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
  if(policy==="elbereth"&&session.state.elberethAttempts===0){
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
const fighting=session=>{
 const s=session.state;
 return session.phase!=="terminal"&&s.alive()&&s.monster&&s.monsterHP>0;
};
function advance(session,rootAction=null,{heroHorizon=Infinity,stepLimit=240}={}){
 let heroActions=0,steps=0;
 while(fighting(session)&&heroActions<heroHorizon&&steps<stepLimit){
  const action=rootAction??choose(session);
  rootAction=null;
  if(session.phase==="combat")heroActions++;
  safeSubmit(session,action);
  steps++;
 }
 return {heroActions,steps,capped:steps===stepLimit&&fighting(session)};
}
function value(session,startingHp,startingItems){
 const s=session.state,alive=s.alive();
 const kill=!!s.monster&&s.monsterHP<=0||!s.monster;
 const missingMonsterHp=Math.max(0,s.monsterHP);
 return (totalHp(s)-startingHp)*1.1+
  (startingItems-totalItems(s))*(-1.8)-
  missingMonsterHp*0.85+(kill?12:0)-(alive?0:18)-
  s.heroes.filter(h=>h.hp>0&&h.poison).length*2;
}
function tactical(session,{samples,depth,decisionSeed}){
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
   advance(fork,candidate,{heroHorizon:depth,stepLimit:65});
   total+=value(fork,startHp,startItems);
  }
  const mean=total/samples;
  if(mean>bestValue+1e-9){best=candidate;bestValue=mean;}
 }
 return best;
}
function fight(source,{policy,healthReduction=0,seed,samples,depth}){
 const session=cloneSession(source),s=session.state;
 if(policy==="parley")session.phase="parley";
 s.rng=randomSource(seed);
 // Controlled starting-HP intervention; the original printed card stays
 // unchanged, including regeneration's normal maximum HP.
 s.monsterHP=Math.max(1,s.monsterHP-healthReduction);
 const startHp=totalHp(s),startItems=totalItems(s);
 const startDamage=s.metrics.damage,startBehaviors=sumMap(s.metrics.monsterBehaviorBands);
 const startElbereth=s.metrics.elberethAttempts,startFailures=s.metrics.elberethFailures;
 const startMonsterDraws=s.metrics.monsterDraws??0;
 const startParleyWins=s.metrics.negotiationsWon??0;
 let steps=0,heroTurns=0;
 while(fighting(session)&&steps<300){
  const action=policy==="tactical"?
   tactical(session,{samples,depth,decisionSeed:mix(seed^Math.imul(steps+1,0xc2b2ae35))}):
   choose(session,policy);
  if(session.phase==="combat")heroTurns++;
  safeSubmit(session,action);steps++;
 }
 const capped=fighting(session);
 return {
  alive:s.alive(),defeated:!capped&&s.monsterHP<=0,
  avoided:(s.metrics.negotiationsWon??0)>startParleyWins,
  capped,heroTurns,steps,
  hpLost:startHp-totalHp(s),
  totalDamage:s.metrics.damage-startDamage,
  monsterBehaviors:sumMap(s.metrics.monsterBehaviorBands)-startBehaviors,
  consumedItems:startItems-totalItems(s),
  elbereth:s.metrics.elberethAttempts-startElbereth,
  elberethFailures:s.metrics.elberethFailures-startFailures,
  extraMonsterDraws:(s.metrics.monsterDraws??0)-startMonsterDraws
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
   meanElberethFailures:mean("elberethFailures"),
   meanExtraMonsterDraws:mean("extraMonsterDraws"),
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
export function runDiagnostic({trials=4,samples=3,depth=2,seed=20261017,
 out="results/combat-causes-"+seed,quiet=false}={}){
 const rows=[];
 const arms=[
  {arm:"basic",policy:"basic",healthReduction:0},
  {arm:"basic_minus2hp",policy:"basic",healthReduction:2},
  {arm:"parley_first",policy:"parley",healthReduction:0},
  {arm:"elbereth_first",policy:"elbereth",healthReduction:0},
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
    const stats=fight(source,{...arm,seed:combatSeed,samples,depth});
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
  design:{trials,samples,depth,seed,parties:starterParties,
   monsterCount:monsters.length,arms:arms.map(a=>a.arm)},
  rows:rows.length,grouped:aggregate(rows),
  truncated:rows.filter(r=>r.capped).length,
  limitations:[
   "The chosen Room contributes no entry effect or prior attrition",
   "Sampled lookahead is a limited-horizon stochastic combat policy, not alpha-beta or certified optimal play",
   "Paired arms share initial dice streams; actions may consume dice in different order",
   "PARLEY is tested only as a deliberately chosen initial action; no future-Room decisions are included",
   "Queued additional Monsters are counted but the pilot ends when the first Monster is defeated",
   "The -2 HP arm starts the printed Monster already damaged; printed data are never edited"
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
    "win="+(100*group.winRate).toFixed(1)+"%",
    "HP lost="+group.meanHpLost.toFixed(2),
    "avoided="+(100*group.avoidRate).toFixed(1)+"%",
    "Monster responses="+group.meanMonsterBehaviors.toFixed(2)].join(" | "));
 }
 return {summary,rows};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const allowed=new Set(["--trials","--samples","--depth","--seed","--out"]);
 for(let i=0;i<args.length;i+=2)
  if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith("--"))
   throw Error("Invalid CLI argument "+(args[i]??""));
 const seed=option("seed",20261017,1,0xffffffff);
 const trial=option("trials",4,1,100);
 const samples=option("samples",3,1,32);
 const depth=option("depth",2,1,6);
 const outIndex=args.indexOf("--out");
 runDiagnostic({seed,trials:trial,samples,depth,
  out:outIndex<0?"results/combat-causes-"+seed:args[outIndex+1]});
}
