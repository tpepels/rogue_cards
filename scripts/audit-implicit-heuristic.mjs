#!/usr/bin/env node
/**
 * Independent canonical audit of the implicit heuristic's Hero-choice
 * ranking. Predicts *before* looking at independent encounter dice, then
 * evaluates every legal Hero on matched RNG starting streams.
 *
 * A static heuristic is not a calibrated probability. Compare paired
 * successor action ranks, not raw score against actual win frequency.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {makeScenario,identitySeed} from "./study-combat-phase2b.mjs";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {randomSource} from "../src/engine/random.js";
import {completeEncounter} from "./study-combat-causes.mjs";
import {implicitHeuristicBreakdown} from "../src/mcts-implicit.js";

const monsters=["crawler","troll","wisp","mold","wax-golem",
 "sentinel","bone-cantor","glass-revenant"];
const duoProfiles=["asymmetric-frontline","weakened-mages","exhausted-support"];
const clone=s=>({
 ...s,state:forkGameState(s.state),history:[],
 remainingReturns:[...s.remainingReturns],
 pendingNested:s.pendingNested?{
  ...s.pendingNested,
  root:{...s.pendingNested.root},
  responses:s.pendingNested.responses.map(x=>({...x})),
  actions:s.pendingNested.actions.map(x=>({...x}))
 }:null
});
const mean=(rows,key)=>rows.reduce((sum,r)=>sum+r[key],0)/rows.length;
const score=s=>{
 const {state}=s;
 const survivorRate=state.heroes.filter(h=>h.hp>0).length/state.heroes.length;
 const hpFraction=state.heroes.reduce((n,h)=>
  n+Math.max(0,h.hp)/h.card.hp,0)/state.heroes.length;
 return {clear:Number(s.phase==="between-rooms"&&!state.monster&&
  !state.monsterQueue.length),survivorRate,hpFraction};
};
export function auditImplicitHeuristic({
 seed=20261017,repetitions=3,evalSeeds=8,
 out="results/implicit-heuristic-audit-"+seed,write=true
}={}){
 if(!Number.isSafeInteger(seed)||seed<1||
  !Number.isInteger(repetitions)||repetitions<1||repetitions>200||
  !Number.isInteger(evalSeeds)||evalSeeds<1||evalSeeds>100)
  throw Error("Invalid implicit heuristic audit parameters");
 const rows=[],pairs=[];
 for(const monster of monsters)for(const profile of duoProfiles)
  for(let replicate=0;replicate<repetitions;replicate++){
   const scenarioId=monster+"__"+profile;
   const gameSeed=identitySeed(seed,"implicit|start|"+scenarioId+"|"+replicate);
   const s=makeScenario(monster,profile,{seed:gameSeed}).session;
   // For parley fixtures explicitly study the immediate "fight" branch.
   // This is a constructed combat boundary, not the policy's parley choice.
   if(s.phase==="parley"){
    const fight=sessionActions(s).find(a=>a.kind==="fight");
    if(!fight)throw Error("No fight at "+scenarioId);
    submitDecision(s,fight,{recordHistory:false,observeResult:false});
   }
   if(s.phase!=="combat-hero"||s.pendingNested)
    throw Error("Not a Hero-selection state "+scenarioId+" "+s.phase);
   const legal=sessionActions(s).filter(a=>a.kind==="choose-hero-turn");
   if(legal.length!==2)throw Error("Expected two Hero choices "+scenarioId);
   const actions=[];
   for(const action of legal){
    const successor=clone(s);
    submitDecision(successor,action,{recordHistory:false,observeResult:false});
    const heuristic=implicitHeuristicBreakdown(successor);
    if(heuristic.terminal)throw Error("Unexpected terminal Hero choice");
    const outcomes=[];
    for(let j=0;j<evalSeeds;j++){
     const continuation=clone(successor);
     continuation.state.rng=randomSource(identitySeed(seed,
      "implicit|heldout|"+scenarioId+"|"+replicate+"|"+j));
     completeEncounter(continuation);
     const result=score(continuation);
     outcomes.push({...result,fitness:result.clear+
      0.3*result.survivorRate+0.12*result.hpFraction});
    }
    const row={
     scenarioId,monster,profile,replicate,heroIndex:action.heroIndex,
     heuristic:heuristic.value,terms:heuristic.terms,
     variables:heuristic.variables,
     fitness:mean(outcomes,"fitness"),
     clear:mean(outcomes,"clear"),
     survivingHeroes:mean(outcomes,"survivorRate"),
     remainingHP:mean(outcomes,"hpFraction")
    };
    rows.push(row);actions.push(row);
   }
   const [a,b]=actions;
   const predicted=a.heuristic-b.heuristic;
   const observed=a.fitness-b.fitness;
   const predictedSign=Math.sign(Math.abs(predicted)<1e-10?0:predicted);
   const observedSign=Math.sign(Math.abs(observed)<1e-10?0:observed);
   const chosen=predictedSign>=0?a:b;
   const oracle=a.fitness>=b.fitness?a:b;
   pairs.push({
    scenarioId,monster,profile,replicate,
    predictedDelta:predicted,observedDelta:observed,
    predictedSign,observedSign,
    correct:observedSign===0?null:Number(predictedSign===observedSign),
    rankingRegret:oracle.fitness-chosen.fitness,
    predictedHero:chosen.heroIndex,betterHero:oracle.heroIndex
   });
  }
 const comparable=pairs.filter(p=>p.correct!==null);
 const disagreement=pairs.filter(p=>p.correct===0);
 const summary={
  schema:"implicit-heuristic-audit-v1",
  design:{seed,repetitions,evalSeeds,monsters,profiles:duoProfiles,
   stateCount:pairs.length,successorCount:rows.length,
   realCanonicalContinuations:rows.length*evalSeeds},
  comparisons:{
   informativePairs:comparable.length,
   rankingAccuracy:comparable.length?mean(comparable,"correct"):null,
   predictionTies:pairs.filter(p=>p.predictedSign===0).length,
   outcomeTies:pairs.filter(p=>p.observedSign===0).length,
   meanOracleRegret:mean(pairs,"rankingRegret"),
   meanObservedGap:0,
   largestRegrets:[...pairs].sort((a,b)=>b.rankingRegret-a.rankingRegret).slice(0,12),
   errorsByMonster:Object.fromEntries(monsters.map(m=>[
    m,disagreement.filter(p=>p.monster===m).length
   ]))
  },
  caveats:[
   "A heuristic [0,1] score is not a calibrated clear probability.",
   "The independent continuations use the fixed basic follow-up policy, NOT another MCTS.",
   "Both Hero choices use the same independent seed per scenario/replicate/continuation; different choices may consume different dice.",
   "A genuine Parley-start scenario is evaluated after opting into its legal Fight action.",
   "Confidence requires repetition across new encounter states and Monsters, not number of dice per one fixture."
  ]
 };
 summary.comparisons.meanObservedGap=
  mean(pairs.map(p=>({gap:Math.abs(p.observedDelta)})),"gap");
 if(write){
  const dir=resolve(out);
  if(existsSync(dir))throw Error("Output exists: "+dir);
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"summary.json"),JSON.stringify(summary,null,2)+"\n");
  writeFileSync(join(dir,"states.json"),JSON.stringify(rows,null,2)+"\n");
  writeFileSync(join(dir,"pair-comparisons.json"),JSON.stringify(pairs,null,2)+"\n");
 }
 return {summary,rows,pairs};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),opts={};
 for(let i=0;i<args.length;i+=2){
  if(!["--seed","--repetitions","--eval-seeds","--out"].includes(args[i])||
   !args[i+1]||Object.hasOwn(opts,args[i]))
   throw Error("Invalid implicit audit argument "+args[i]);
  opts[args[i]]=args[i+1];
 }
 const {summary}=auditImplicitHeuristic({
  seed:Number(opts["--seed"]??20261017),
  repetitions:Number(opts["--repetitions"]??3),
  evalSeeds:Number(opts["--eval-seeds"]??8),
  out:opts["--out"]??"results/implicit-heuristic-audit-"+(opts["--seed"]??20261017)
 });
 console.log(JSON.stringify(summary.comparisons,null,2));
}
