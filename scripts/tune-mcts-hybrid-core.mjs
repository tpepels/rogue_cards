/**
 * One reproducible *out-of-search* fitness trial for the experimental
 * UCT -> sampled-combat-expectimax -> implicit-backup architecture.
 *
 * Evaluates the recommended action on two independent, canonical
 * encounter continuations. The MCTS search never sees those dice.
 * This deliberately measures combat-root decision quality, not the
 * probability of winning a full 36-Room expedition.
 */
import {makeScenario,identitySeed} from "./study-combat-phase2b.mjs";
import {makeSoloScenario} from "./solo-encounter-fixtures.mjs";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {completeEncounter,encounterOutcome} from "./study-combat-causes.mjs";
import {searchDecision,mctsActionKey} from "../src/session-mcts.js";
import {randomSource} from "../src/engine/random.js";
import {forkGameState} from "../src/engine/fork-state.js";

const idParts=id=>{
 const i=id.indexOf("__");
 if(i<0)throw Error("Invalid scenario ID "+id);
 return [id.slice(0,i),id.slice(i+2)];
};
const duplicate=s=>({
 ...s,state:forkGameState(s.state),history:[],
 remainingReturns:[...s.remainingReturns],
 pendingNested:s.pendingNested?{
  ...s.pendingNested,
  responses:s.pendingNested.responses.map(x=>({...x})),
  actions:s.pendingNested.actions.map(x=>({...x}))
 }:null
});
export const candidateId=c=>c.name??"c"+c.c.toFixed(3)+"-a"+c.alpha.toFixed(3);
export function evaluateHybridJob({
 candidate,scenarioId,replicate=0,phase="train",seed=20261017,
 budget=16,samples=1,tacticalMax=2,independentTrials=2
}={}){
 if(!candidate||!Number.isFinite(candidate.c)||!Number.isFinite(candidate.alpha))
  throw Error("Invalid hybrid tuning candidate");
 const [monsterId,profileId]=idParts(scenarioId);
 // Each replicate changes the *starting* deck and starting combat state;
 // candidate-independent hashing keeps the paired scenarios identical.
 const stateSeed=identitySeed(seed,phase+"|state|"+scenarioId+"|"+replicate);
 const scenario=profileId.startsWith("solo-")?
  makeSoloScenario(scenarioId,{seed:stateSeed}):
  makeScenario(monsterId,profileId,{seed:stateSeed});
 const session=scenario.session;
 let legal=sessionActions(session);
 // Solo actor selection is forced and contains zero tactical information.
 // Advance to the first consequential combat action, not into another Room.
 if(legal.length===1&&session.phase==="combat-hero"){
  submitDecision(session,legal[0],{
   observeResult:false,recordHistory:false
  });
  legal=sessionActions(session);
 }
 if(legal.length<2)throw Error("No consequential legal root choice for "+scenarioId);
 const chanceSeed=identitySeed(seed,phase+"|search|"+scenarioId+"|"+replicate);
 const start=performance.now();
 const result=searchDecision(session,{
  budget,seed:chanceSeed,knowledge:"fair",
  treeMode:"frontier",strictTerminal:true,maxSteps:5000,
  collectCoverage:false,exploration:candidate.c,
  implicitWeight:candidate.alpha,
  implicitHeuristicMode:candidate.heuristicMode??"legacy",
  implicitHpScale:candidate.implicitHpScale??1,
  implicitThreatScale:candidate.implicitThreatScale??1,
  rolloutCombatMode:candidate.rolloutCombatMode??"sampled-expectimax",
  rolloutCombatSamples:samples,
  rolloutCombatMaxDecisions:tacticalMax,
  simulationPolicy:candidate.simulationPolicy??"default",
  softTreeBonus:candidate.softTreeBonus??0.15,
  softTreeFirstVisitProbability:
   candidate.softTreeFirstVisitProbability??0.75,
  softRolloutProbability:candidate.softRolloutProbability??0.75
 });
 const searchMs=performance.now()-start;
 const recommended=result.recommended;
 if(!recommended||!legal.some(a=>mctsActionKey(a)===mctsActionKey(recommended)))
  throw Error("MCTS returned illegal/no action at "+scenarioId);
 const evalStart=performance.now();
 const outcomes=[];
 for(let j=0;j<independentTrials;j++){
  const fork=duplicate(session);
  fork.state.rng=randomSource(identitySeed(
   seed,phase+"|EVAL|"+scenarioId+"|"+replicate+"|"+j
  ));
  const originalHp=fork.state.heroes.map(h=>h.hp);
  const beforeItems=Object.values(fork.state.metrics.itemUses||{})
   .reduce((n,x)=>n+(x.total||0),0);
  completeEncounter(fork,{firstAction:recommended});
  const finished=encounterOutcome(fork);
  if(finished!=="cleared"&&finished!=="wipe")
   throw Error("Unsettled independent encounter");
  const alive=fork.state.heroes.filter(h=>h.hp>0).length;
  const survivorRate=alive/fork.state.heroes.length;
  const hpFraction=fork.state.heroes.reduce((n,h)=>
   n+Math.max(0,h.hp)/h.card.hp,0
  )/fork.state.heroes.length;
  const uses=Object.values(fork.state.metrics.itemUses||{})
   .reduce((n,x)=>n+(x.total||0),0)-beforeItems;
  const killed=originalHp.filter((hp,i)=>
   hp>0&&fork.state.heroes[i].hp<=0).length;
  // Offline selection-only objective; NOT injected into UCT returns.
  // Survival dominates fractional HP and disposable resource use.
  const fitness=(finished==="cleared"?1:0)+
   0.3*survivorRate+0.12*hpFraction-0.015*Math.max(0,uses);
  outcomes.push({
   clear:Number(finished==="cleared"),killed,
   hpFraction,uses,fitness
  });
 }
 const evalMs=performance.now()-evalStart;
 const mean=k=>outcomes.reduce((n,x)=>n+x[k],0)/outcomes.length;
 return {
  candidate:candidateId(candidate),c:candidate.c,alpha:candidate.alpha,
  rolloutCombatMode:candidate.rolloutCombatMode??"sampled-expectimax",
  heuristicMode:candidate.heuristicMode??"legacy",
  simulationPolicy:candidate.simulationPolicy??"default",
  softTreeBonus:candidate.softTreeBonus??0.15,
  softTreeFirstVisitProbability:
   candidate.softTreeFirstVisitProbability??0.75,
  softRolloutProbability:candidate.softRolloutProbability??0.75,
  implicitHpScale:candidate.implicitHpScale??1,
  implicitThreatScale:candidate.implicitThreatScale??1,
  scenarioId,replicate,phase,seed,budget,samples,tacticalMax,
  action:mctsActionKey(recommended),
  searchMs,evalMs,rolloutCombatSearches:result.rolloutCombatSearches||0,
  rolloutWins:result.terminalWins,
  implicitRootValue:result.implicitRootValue??null,
  clear:mean("clear"),killed:mean("killed"),
  hpFraction:mean("hpFraction"),uses:mean("uses"),
  fitness:mean("fitness"),outcomes
 };
}
