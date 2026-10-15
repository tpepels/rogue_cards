/**
 * Information-set UCT over the actual pausable Rogue Cards session.
 *
 * Every simulation starts from the exact public decision boundary, forks
 * real mutable state, determinizes hidden decks under Fair knowledge (or
 * keeps their real order for Oracle), and uses independent future dice.
 * Every later decision, including nested reactions and saved Rooms, is
 * selected from sessionActions() and applied by submitDecision().
 *
 * No scripted combat/Room bot, fabricated Items, or partial-health victory
 * proxy is used. Truncated nonterminal trials are counted and by default
 * fail loudly; callers cannot mistake them for win/loss samples.
 */
import {forkGameState} from "./engine/fork-state.js";
import {observeGame} from "./engine/index.js";
import {observeSession,sessionActions,submitDecision}
 from "./engine/decision-session.js";
import {randomSource} from "./engine/random.js";
import {prepareRolloutDecks,sampleRolloutDecks} from "./rollout-state.js";

export const MAX_ROLLOUT_EQUIPMENT_ACTIONS=6;
const freeEquipmentKinds=new Set(["equip","unequip","transfer"]);
const progressionPhases=new Set(["between-rooms","explore"]);
const u32=n=>n>>>0;
const mix=n=>{
 n=u32(n+0x9e3779b9);
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return u32(n^(n>>>16));
};
const hash=text=>{
 let h=2166136261;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
 return h>>>0;
};
const actionKey=action=>JSON.stringify(Object.keys(action).sort()
 .map(key=>[key,action[key]]));
const cloneSession=s=>({
 ...s,state:forkGameState(s.state),
 history:s.history.map(x=>({...x})),
 remainingReturns:[...s.remainingReturns],
 pendingNested:s.pendingNested?{
  ...s.pendingNested,
  responses:[...s.pendingNested.responses],
  actions:s.pendingNested.actions.map(a=>({...a}))
 }:null
});
// A public tree key must describe the exact same information as
// observeSession(), but observeSession() also enumerates every legal action.
// MCTS already has those actions. Avoid doing that expensive work twice at
// every node (especially at safe equipment boundaries).
export const mctsPublicStateHash=s=>{
 const nested=s.pendingNested;
 return hash(JSON.stringify({
  phase:nested?"reaction":s.phase,
  trigger:nested?nested.trigger??null:null,
  heroIndex:nested?null:s.heroIndex??null,
  game:nested?nested.observation:observeGame(s.state)
 }));
};
function nodeFor(tree,key,actions){
 let node=tree.get(key);
 if(!node){node={visits:0,edges:new Map()};tree.set(key,node);}
 // One canonical fingerprint per legal action. It was previously sorted
 // and JSON-stringified repeatedly for insertion, selection, lookup and
 // history tracking. Keep each edge paired with its action for this step.
 const candidates=actions.map(action=>{
  const id=actionKey(action);
  let edge=node.edges.get(id);
  if(!edge){
   edge={action:{...action},visits:0,wins:0};
   node.edges.set(id,edge);
  }
  return {action,id,edge};
 });
 return {node,candidates};
}
function select(node,candidates,rng,c){
 const unseen=[];
 for(const candidate of candidates)
  if(candidate.edge.visits===0)unseen.push(candidate);
 if(unseen.length)return rng.choose(unseen);
 // Preserve identical UCT scores and the same single tie-breaking draw,
 // without allocating score objects or computing log(visits) per action.
 const logVisits=Math.log(Math.max(2,node.visits));
 const scores=new Array(candidates.length);
 let maximum=-Infinity;
 for(let i=0;i<candidates.length;i++){
  const e=candidates[i].edge;
  const score=e.wins/e.visits+c*Math.sqrt(logVisits/e.visits);
  scores[i]=score;
  if(score>maximum)maximum=score;
 }
 const tied=[];
 for(let i=0;i<candidates.length;i++)
  if(Math.abs(scores[i]-maximum)<1e-12)tied.push(candidates[i]);
 return rng.choose(tied);
}
const interval=(wins,visits)=>{
 if(!visits)return null;
 const p=wins/visits,z=1.959963984540054,zz=z*z;
 const denominator=1+zz/visits,mid=(p+zz/(2*visits))/denominator;
 const half=z*Math.sqrt(p*(1-p)/visits+zz/(4*visits*visits))/denominator;
 return [Math.max(0,mid-half),Math.min(1,mid+half)];
};
const rootStats=(node,rootActions)=>{
 return rootActions.map(a=>{
  const e=node?.edges.get(actionKey(a));
  const visits=e?.visits||0,wins=e?.wins||0;
  return {action:a,visits,wins,estimatedWinRate:visits?wins/visits:null,
   wilson95:interval(wins,visits)};
 });
};
/**
 * Evaluate CURRENT canonical decision.
 *
 * This function is synchronous for simple integration with UI/CLI.
 * Large budgets should run in worker_threads using one isolated tree per
 * worker and aggregate raw (wins, visits) rather than average percentages.
 */
export function searchDecision(session,{budget=100,seed=1,
 knowledge="fair",exploration=Math.SQRT2,maxSteps=4000,
 strictTerminal=true,observedReplay=null,collectCoverage=true,
 rootActions=null,transactional=true}={}){
 if(!Number.isInteger(budget)||budget<1||budget>100000)
  throw Error("MCTS budget must be an integer in [1,100000]");
 if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>100000)
  throw Error("MCTS maxSteps must be an integer in [1,100000]");
 if(!["fair","oracle"].includes(knowledge))
  throw Error("Knowledge must be fair or oracle");
 if(!Number.isFinite(exploration)||exploration<0)
  throw Error("Exploration coefficient must be nonnegative");
 if(typeof transactional!=="boolean")throw Error("transactional must be boolean");
 if(observedReplay!==null&&(
  !Number.isInteger(observedReplay.replayAt)||
  observedReplay.replayAt<1||
  !Number.isInteger(observedReplay.diceSeed)||
  !Number.isInteger(observedReplay.deckSeed)))
  throw Error("Invalid prior observed chance replay");
 rootActions=rootActions??sessionActions(session);
 if(!rootActions.length)throw Error("No pending player choice to search");
 const original=JSON.stringify(observeSession(session));
 const actualRng=session.state.rng.snapshot();
 // Pending mid-roll observations must be replayed with their ACTUAL dice
 // before sampling the unknown future at that reaction boundary.
 const blueprint=knowledge==="fair"&&!session.pendingNested?
  prepareRolloutDecks(session.state,"fair"):null;
 const tree=new Map(),rootKey="root:"+mctsPublicStateHash(session),rng=randomSource(seed);
 let wins=0,completed=0,incomplete=0,maximumDepth=0;
 let rolloutEquipmentAdvances=0;
 const incompleteReasons={};
 const phaseOpportunities={},phaseSelections={},actionOpportunities={},
  actionSelections={},cardOpportunities={},cardSelections={};
 const increment=(counter,key)=>{counter[key]=(counter[key]||0)+1};
 const record=(actions,selected,phase)=>{
  increment(phaseOpportunities,phase);
  increment(phaseSelections,phase);
  for(const a of actions){
   increment(actionOpportunities,a.kind);
   if(a.cardId)increment(cardOpportunities,a.cardId);
  }
  increment(actionSelections,selected.kind);
  if(selected.cardId)increment(cardSelections,selected.cardId);
 };
 for(let i=0;i<budget;i++){
  const sim=cloneSession(session),s=sim.state;
  const chanceSeed=mix(seed^Math.imul(i+1,0x9e3779b9)),
   deckSeed=mix(seed^Math.imul(i+1,0x85ebca6b));
  // Never change the already-observed die/Room revealed inside a pending
  // reaction. Replay it exactly first, then sample only future chance.
  if(!sim.pendingNested){
   s.rng=randomSource(chanceSeed);
   if(knowledge==="fair"){
    const drawn=sampleRolloutDecks(session.state,{
     knowledge:"fair",blueprint,deckSeed});
    s.deck=drawn.deck.slice();
    for(const stage of ["UPPER","MIDDLE","DEEP"]){
     s.rooms[stage]=drawn.rooms[stage].slice();
     s.monsters[stage]=drawn.monsters[stage].slice();
    }
   }
  }
  const originalRootWasPending=Boolean(sim.pendingNested);
  const chanceSwitchIndex=originalRootWasPending?
   sim.pendingNested.responses.length+1:null;
  let observedRootResolved=!originalRootWasPending;
  // Earlier nested responses may have been observed inside a sampled
  // counterfactual continuation. Reconstruct that SAME past before
  // resampling the as-yet-unseen future for this MCTS trial.
  const onObservedReplay=eventState=>{
   if(knowledge==="fair"){
    const drawn=sampleRolloutDecks(eventState,{
     knowledge:"fair",deckSeed:observedReplay.deckSeed});
    eventState.deck=drawn.deck.slice();
    for(const stage of ["UPPER","MIDDLE","DEEP"]){
     eventState.rooms[stage]=drawn.rooms[stage].slice();
     eventState.monsters[stage]=drawn.monsters[stage].slice();
    }
   }
   eventState.rng=randomSource(observedReplay.diceSeed);
  };
  const onReplay=eventState=>{
   // A revealed corridor has removed its shown Rooms from the hidden pile.
   if(knowledge==="fair"){
    const drawn=sampleRolloutDecks(eventState,{
     knowledge:"fair",deckSeed});
    eventState.deck=drawn.deck.slice();
    for(const stage of ["UPPER","MIDDLE","DEEP"]){
     eventState.rooms[stage]=drawn.rooms[stage].slice();
     eventState.monsters[stage]=drawn.monsters[stage].slice();
    }
   }
   eventState.rng=randomSource(chanceSeed);
  };
  const path=[],choiceRng=randomSource(mix(seed^Math.imul(i+1,0xc2b2ae35)));
  let historyKey=rootKey,depth=0,error=null,equipmentStreak=0;
  // Keep the last 120 actions with constant-time recording. Error
  // reports still reconstruct the exact same chronological action trace.
  const reproductionTrace=new Array(120);
  let traceCount=0,traceCursor=0;
  const recentActions=()=>traceCount<120?
   reproductionTrace.slice(0,traceCount):
   [...reproductionTrace.slice(traceCursor),
    ...reproductionTrace.slice(0,traceCursor)];
  try{
   while(sim.phase!=="terminal"&&depth<maxSteps){
    const actions=sessionActions(sim);
    if(!actions.length){error="no-legal-actions:"+JSON.stringify({
     phase:sim.phase,roomId:sim.state.room?.id,
     monsterId:sim.state.monster?.id,
     heroHP:sim.state.heroes.map(h=>h.hp),
     inventory:sim.state.heroes.map(h=>h.inventory.map(c=>c.id)),
     pendingTrigger:sim.pendingNested?.trigger??null,
     roomChoiceOperations:sim.state.room?.v2.choices??null
    });break}
    const key=historyKey+":"+mctsPublicStateHash(sim);
    const {node,candidates}=nodeFor(tree,key,actions);
    // The printed rules allow reversible zero-time equipment changes.
    // Each root alternative is still evaluated. During sampled future
    // play, after six consecutive equipment actions, take the real
    // Continue action instead of oscillating forever.
    const progress=progressionPhases.has(sim.phase)&&
     equipmentStreak>=MAX_ROLLOUT_EQUIPMENT_ACTIONS?
     candidates.find(c=>c.action.kind==="continue"):null;
    const selected=progress||select(node,candidates,choiceRng,exploration);
    const choice=selected.action;
    if(progress)rolloutEquipmentAdvances++;
    equipmentStreak=progressionPhases.has(sim.phase)&&
     freeEquipmentKinds.has(choice.kind)?equipmentStreak+1:0;
    const edge=selected.edge;
    if(collectCoverage)record(actions,choice,sim.pendingNested?
     "reaction:"+sim.pendingNested.trigger.phase:sim.phase);
    path.push({node,edge});
    const from=sim.phase;
    reproductionTrace[traceCursor]={depth,phase:from,
     pending:sim.pendingNested?.trigger??null,
     roomId:sim.state.room?.id??null,
     monsterId:sim.state.monster?.id??null,
     heroHP:sim.state.heroes.map(h=>h.hp),action:choice};
    if(++traceCursor===120)traceCursor=0;
    if(traceCount<120)traceCount++;
    const replayObserved=originalRootWasPending&&!observedRootResolved&&
     Boolean(sim.pendingNested);
    const replaySwitches=replayObserved?[
     ...(observedReplay?[{at:observedReplay.replayAt,
      callback:onObservedReplay}]:[]),
     {at:chanceSwitchIndex,callback:onReplay}
    ]:[];
    submitDecision(sim,choice,{replaySwitches,transactional});
    if(replayObserved&&!sim.pendingNested)observedRootResolved=true;
    // The exact public observation at the next boundary keys the tree.
    historyKey=mix(hash(historyKey+from+selected.id)).toString(16);
    depth++;
   }
   if(sim.phase!=="terminal"&&!error)error="maxSteps";
   if(sim.phase==="terminal"&&(sim.state.metrics.roundLimit||
      sim.state.metrics.unresolved))
    error="unresolved-game-or-combat-round-limit";
  }catch(e){
   // Never convert unsupported printed operations into a loss.
   error="rule-error:"+(e.message||String(e));
   if(strictTerminal){
    const failure=Error("MCTS unsupported branch at trial "+i+
     ", depth "+depth+": "+error);
    failure.repro={searchSeed:seed,knowledge,budget,maxSteps,
     trial:i,depth,chanceSeed,deckSeed,
     rootPhase:session.pendingNested?"reaction:"+
      session.pendingNested.trigger.phase:session.phase,
     rootRoomId:session.state.room?.id??null,
     failingPhase:sim.pendingNested?"reaction:"+
      sim.pendingNested.trigger.phase:sim.phase,
     failingRoomId:sim.state.room?.id??null,
     failingMonsterId:sim.state.monster?.id??null,
     heroHP:sim.state.heroes.map(h=>h.hp),
     observedReplay,recentActions:recentActions()};
    throw failure;
   }
  }
  maximumDepth=Math.max(maximumDepth,depth);
  if(error){
   incomplete++;
   incompleteReasons[error]=(incompleteReasons[error]||0)+1;
   if(strictTerminal){
    const failure=Error("MCTS sampled nonterminal at trial "+i+
     ", depth "+depth+": "+error);
    // A missing legal action or step cap is not a loss. Capture the
    // determinized chance seeds and last canonical actions, as we do
    // for exceptions from printed rules.
    failure.repro={searchSeed:seed,knowledge,budget,maxSteps,
     trial:i,depth,chanceSeed,deckSeed,
     rootPhase:session.pendingNested?"reaction:"+
      session.pendingNested.trigger.phase:session.phase,
     rootRoomId:session.state.room?.id??null,
     failingPhase:sim.pendingNested?"reaction:"+
      sim.pendingNested.trigger.phase:sim.phase,
     failingRoomId:sim.state.room?.id??null,
     failingMonsterId:sim.state.monster?.id??null,
     heroHP:sim.state.heroes.map(h=>h.hp),
     reason:error,observedReplay,recentActions:recentActions()};
    throw failure;
   }
   continue;
  }
  const result=Number(!!sim.state.metrics.won);
  completed++;wins+=result;
  for(const {node,edge} of path){
   node.visits++;edge.visits++;edge.wins+=result;
  }
 }
 if(JSON.stringify(observeSession(session))!==original||
    session.state.rng.snapshot()!==actualRng)
  throw Error("MCTS mutated the actual player state or future dice");
 const root=tree.get(rootKey+":"+mctsPublicStateHash(session));
 const decisions=rootStats(root,rootActions).sort((a,b)=>
  b.visits-a.visits||((b.estimatedWinRate??0)-(a.estimatedWinRate??0)));
 // Select robust child (most visits), not an exploratory single lucky win.
 const chosen=decisions[0];
 return {knowledge,seed,budget,completed,incomplete,incompleteReasons,
  terminalWins:wins,terminalWinRate:completed?wins/completed:null,
  maximumDepth,treeNodes:tree.size,
  rolloutEquipmentAdvances,
  maxConsecutiveRolloutEquipmentActions:MAX_ROLLOUT_EQUIPMENT_ACTIONS,
  rootActionCount:rootActions.length,choices:decisions,
  recommended:chosen?.action??null,
  actionCoverage:{phaseOpportunities,phaseSelections,
   actionOpportunities,actionSelections,
   cardOpportunities,cardSelections},
  rootEveryActionTried:decisions.every(x=>x.visits>0),
  complete:incomplete===0,
  limitations:[
   "Only currently wired pending action windows are searched",
   "Information-set UCT samples unknown cards without seeing future dice",
   "Confidence intervals represent conditional rollout wins, not independent human-play strength",
   "Uninstrumented printed auto-effects remain outside the action tree",
   "After six consecutive reversible equipment moves in a sampled rollout "+
    "the canonical Continue action is selected; every legal root action "+
    "is still searched and all printed consequences are executed"
  ]};
}
