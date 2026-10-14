/**
 * Matched, state-conditional action contrasts through the canonical session.
 *
 * Every root alternative starts from the SAME decision, hidden-deck sample
 * and future dice seed. After taking that alternative, all subsequent
 * optional choices use session MCTS, never a scripted expedition policy.
 *
 * This estimates the value of a CHOICE at one reachable game state. It does
 * not establish a card's average value across all naturally reached states.
 * Run independent source states before drawing population balance conclusions.
 */
import {forkGameState} from "./engine/fork-state.js";
import {sessionActions,observeSession,submitDecision}
 from "./engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction,
 MAX_CONSECUTIVE_EQUIPMENT_ACTIONS} from "./session-policy.js";
import {randomSource} from "./engine/random.js";
import {prepareRolloutDecks,sampleRolloutDecks} from "./rollout-state.js";

const stages=["UPPER","MIDDLE","DEEP"];
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const copySession=session=>({
 ...session,
 state:forkGameState(session.state),
 history:session.history.map(x=>({...x})),
 remainingReturns:[...session.remainingReturns],
 pendingNested:session.pendingNested?{
  ...session.pendingNested,
  root:{...session.pendingNested.root},
  responses:session.pendingNested.responses.map(a=>({...a})),
  actions:session.pendingNested.actions.map(a=>({...a}))
 }:null
});
const matchDecks=(state,source,deckSeed,blueprint=null)=>{
 const sampled=sampleRolloutDecks(source,{
  knowledge:"fair",deckSeed,blueprint
 });
 state.deck=sampled.deck.slice();
 for(const stage of stages){
  state.rooms[stage]=sampled.rooms[stage].slice();
  state.monsters[stage]=sampled.monsters[stage].slice();
 }
};
const logFactorials=[0];
function logFactorial(n){
 while(logFactorials.length<=n){
  const i=logFactorials.length;
  logFactorials.push(logFactorials[i-1]+Math.log(i));
 }
 return logFactorials[n];
}
/** Exact two-sided McNemar p value, conditional on discordant pairs. */
function exactMcNemar(positive,negative){
 const n=positive+negative;
 if(!n)return 1;
 const k=Math.min(positive,negative);
 const values=[];
 for(let i=0;i<=k;i++)
  values.push(logFactorial(n)-logFactorial(i)-
   logFactorial(n-i)-n*Math.LN2);
 const peak=Math.max(...values);
 return Math.min(1,2*Math.exp(peak)*
  values.reduce((sum,x)=>sum+Math.exp(x-peak),0));
}
const pairedInterval=(positive,negative,n)=>{
 if(n<2)return null;
 const difference=(positive-negative)/n;
 const variance=((positive+negative)-n*difference*difference)/(n-1);
 const half=1.959963984540054*Math.sqrt(Math.max(0,variance)/n);
 return [Math.max(-1,difference-half),Math.min(1,difference+half)];
};
function playMatched(session,action,{
 knowledge,diceSeed,deckSeed,policySeed,futureBudget,
 maxSearchSteps,maxGameSteps,blueprint
}){
 const sim=copySession(session);
 const wasPending=Boolean(sim.pendingNested);
 const switchIndex=wasPending?sim.pendingNested.responses.length+1:null;
 if(!wasPending){
  sim.state.rng=randomSource(diceSeed);
  if(knowledge==="fair")
   matchDecks(sim.state,session.state,deckSeed,blueprint);
 }
 const afterReplay=state=>{
  if(knowledge==="fair")matchDecks(state,state,deckSeed);
  state.rng=randomSource(diceSeed);
 };
 const initial=submitDecision(sim,action,{
  afterReactionReplay:wasPending?afterReplay:null,
  replayAt:switchIndex
 });
 // For nested root transactions, keep the chance switch fixed at the
 // first newly chosen reaction across all later replay attempts.
 let decisions=1,searches=0;
 const policy=createSessionPolicy();
 const actionKinds={},recentActions=[];
 if(!initial?.actions)throw Error("Canonical initial decision failed");
 while(sim.phase!=="terminal"&&decisions<maxGameSteps){
  const legal=sessionActions(sim);
  if(!legal.length)throw Error("No legal action at "+sim.phase);
  const chosen=selectSessionPolicyAction(sim,policy,{
   budget:futureBudget,knowledge,maxSearchSteps,
   seed:mix(policySeed^Math.imul(decisions+1,0x85ebca6b)),
   observedReplay:wasPending&&sim.pendingNested?
    {replayAt:switchIndex,diceSeed,deckSeed}:null
  });
  if(legal.length>1)searches++;
  actionKinds[chosen.kind]=(actionKinds[chosen.kind]||0)+1;
  recentActions.push({step:decisions,phase:sim.phase,
   roomId:sim.state.room?.id??null,action:chosen,
   heroHP:sim.state.heroes.map(h=>h.hp)});
  if(recentActions.length>40)recentActions.shift();
  submitDecision(sim,chosen,{
   afterReactionReplay:wasPending&&sim.pendingNested?afterReplay:null,
   replayAt:wasPending&&sim.pendingNested?switchIndex:null
  });
  decisions++;
 }
 if(sim.phase!=="terminal"){
  const problem=Error("Nonterminal matched continuation: "+JSON.stringify({
   decisions,maxGameSteps,phase:sim.phase,
   roomId:sim.state.room?.id??null,monsterId:sim.state.monster?.id??null,
   heroHP:sim.state.heroes.map(h=>h.hp),actionKinds,policy,
   recentActions
  }));
  problem.repro={phase:sim.phase,decisions,actionKinds,policy,recentActions};
  throw problem;
 }
 if(sim.state.metrics.roundLimit||sim.state.metrics.unresolved)
  throw Error("Unresolved game/combat round limit in matched continuation");
 if(!sim.state.metrics.won&&sim.state.alive()&&!sim.state.metrics.escaped)
  throw Error("Terminal state without a printed ending");
 return {won:Number(!!sim.state.metrics.won),decisions,searches,
  policyCycleBreaks:policy.cycleBreaks,
  ending:sim.state.endingKind};
}
export function compareSessionActions(session,{
 trials=30,seed=1,knowledge="fair",futureBudget=2,
 maxSearchSteps=4000,maxGameSteps=7000,referenceIndex=0,
 resumeTrials=[],onTrial=null,actionIndices=null
}={}){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)
  throw Error("Seed must be a uint32 integer");
 for(const [key,n,max] of [
  ["trials",trials,100000],["futureBudget",futureBudget,100000],
  ["maxSearchSteps",maxSearchSteps,100000],
  ["maxGameSteps",maxGameSteps,100000]
 ]){
  if(!Number.isSafeInteger(n)||n<1||n>max)
   throw Error(key+" must be a positive integer <= "+max);
 }
 if(!["fair","oracle"].includes(knowledge))
  throw Error("Knowledge must be fair or oracle");
 if(!Array.isArray(resumeTrials)||resumeTrials.length>trials)
  throw Error("Invalid resumed paired trial count");
 if(onTrial!==null&&typeof onTrial!=="function")
  throw Error("onTrial must be a callback");
 const offered=sessionActions(session);
 if(actionIndices!==null&&(!Array.isArray(actionIndices)||
  actionIndices.length<2||new Set(actionIndices).size!==actionIndices.length||
  actionIndices.some(i=>!Number.isInteger(i)||i<0||i>=offered.length)))
  throw Error("actionIndices must identify distinct legal root actions");
 const actions=actionIndices===null?offered:actionIndices.map(i=>offered[i]);
 if(actions.length<2)throw Error("At least two legal root choices are required");
 if(!Number.isInteger(referenceIndex)||referenceIndex<0||
    referenceIndex>=actions.length)throw Error("Invalid referenceIndex");
 const original=JSON.stringify(observeSession(session));
 const rng=session.state.rng.snapshot();
 const blueprint=knowledge==="fair"&&!session.pendingNested?
  prepareRolloutDecks(session.state,"fair"):null;
 const results=actions.map(action=>({
  action,wins:0,observations:0,totalDecisions:0,totalSearches:0,
  totalCycleBreaks:0
 }));
 const pairs=actions.map(()=>({positive:0,negative:0,ties:0}));
 for(let trial=0;trial<trials;trial++){
  const root=mix(seed^Math.imul(trial+1,0x9e3779b9));
  const chance=mix(root^0x85ebca6b);
  const deck=mix(root^0xc2b2ae35);
  const policy=mix(root^0x27d4eb2f);
  let samples=resumeTrials[trial];
  if(samples===undefined){
   samples=[];
   for(let i=0;i<actions.length;i++){
    let result;
    try{
     result=playMatched(session,actions[i],{
      knowledge,diceSeed:chance,deckSeed:deck,policySeed:policy,
      futureBudget,maxSearchSteps,maxGameSteps,blueprint
     });
    }catch(error){
     const failure=Error("Matched trial "+trial+", action "+i+" ("+
      JSON.stringify(actions[i])+"): "+(error.stack||error));
     failure.repro={trial,actionIndex:i,action:actions[i],
      matchedDiceSeed:chance,matchedDeckSeed:deck,
      matchedPolicySeed:policy,continuation:error.repro??null};
     throw failure;
    }
    samples.push(result);
   }
   // One checkpoint means ALL root actions used the same paired seed.
   if(onTrial)onTrial(trial,samples);
  }
  if(!Array.isArray(samples)||samples.length!==actions.length||
   samples.some(x=>!x||![0,1].includes(x.won)||
    !Number.isInteger(x.decisions)||x.decisions<1||
    !Number.isInteger(x.searches)||x.searches<0))
   throw Error("Invalid paired trial checkpoint at index "+trial);
  for(let i=0;i<actions.length;i++){
   const result=samples[i],row=results[i];
   row.wins+=result.won;row.observations++;
   row.totalDecisions+=result.decisions;
   row.totalSearches+=result.searches;
   row.totalCycleBreaks+=result.policyCycleBreaks||0;
  }
  const ref=samples[referenceIndex].won;
  for(let i=0;i<actions.length;i++){
   const value=samples[i].won;
   if(value>ref)pairs[i].positive++;
   else if(value<ref)pairs[i].negative++;
   else pairs[i].ties++;
  }
 }
 const table=results.map((row,i)=>({
  ...row,winRate:row.wins/row.observations,
  differenceVsReference:(pairs[i].positive-pairs[i].negative)/trials,
  paired95:pairedInterval(pairs[i].positive,pairs[i].negative,trials),
  mcnemarExactP:exactMcNemar(pairs[i].positive,pairs[i].negative),
  discordantPositive:pairs[i].positive,
  discordantNegative:pairs[i].negative,
  tiedPairs:pairs[i].ties
 }));
 // Control familywise error over all non-reference actions at this root.
 const sorted=table.map((r,i)=>({i,p:r.mcnemarExactP}))
  .filter(x=>x.i!==referenceIndex).sort((a,b)=>a.p-b.p);
 let floor=0;
 for(let rank=0;rank<sorted.length;rank++){
  const {i,p}=sorted[rank];
  floor=Math.max(floor,Math.min(1,p*(sorted.length-rank)));
  table[i].holmAdjustedP=floor;
 }
 table[referenceIndex].holmAdjustedP=null;
 if(JSON.stringify(observeSession(session))!==original||
    session.state.rng.snapshot()!==rng)
  throw Error("Paired comparison mutated the real session");
 return {
  schema:"canonical-session-paired-actions-v1",
  phase:session.pendingNested?"reaction:"+session.pendingNested.trigger.phase:
   session.phase,
  roomId:session.state.room?.id??null,
  monsterId:session.state.monster?.id??null,
  sourceObservation:observeSession(session),
  knowledge,seed,trials,referenceIndex,futureBudget,maxSearchSteps,
  maxGameSteps,actionIndices,actions:table,
  exactPairedSeeds:true,canonicalTerminalContinuations:true,
  allFutureChoicesViaMCTS:true,
  reversibleEquipmentPolicy:{maxConsecutiveEquipmentActions:
   MAX_CONSECUTIVE_EQUIPMENT_ACTIONS,mode:"search-all-then-progress"},
  validity:"Conditional on this one reachable state; not an average card effect.",
  limitations:[
   "A single reachable state cannot establish average card balance",
   "MCTS is approximate; its learned continuation policy affects contrasts",
   "After 12 consecutive free equipment changes, the continuation policy "+
    "takes the canonical continue action; all legal alternatives are still searched",
   "Nested full-game MCTS rollouts advance via the real Continue action "+
    "after six consecutive reversible equipment moves; the physical rules "+
    "and full root legal-action set remain unchanged",
   "Different actions can consume a shared random stream differently",
   "Do not treat the paired normal interval as reliable with very small trials",
   "Across multiple source states/cards, adjust significance again"
  ]
 };
}
