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
import {observeSession,sessionActions,submitDecision,submitSpeculativeDecision}
 from "./engine/decision-session.js";
import {randomSource} from "./engine/random.js";
import {prepareRolloutDecks,sampleRolloutDecks} from "./rollout-state.js";
import {sampledCombatRolloutAction} from "./combat-rollout-expectimax.js";
import {resolveExploration} from "./mcts-hybrid-defaults.js";
import {implicitExpeditionHeuristic,implicitUCTExploitation,
 backupImplicit,implicitSelectedMean} from "./mcts-implicit.js";
// sampleRolloutDecks allocates fresh arrays for each call. These are owned
// by the current hypothetical game and can be assigned without copying.

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
// Canonical action shapes repeat thousands of times per expedition.
// Cache only the sorted KEY SCHEMA, never an action's mutable values.
const actionSchemas=new Map();
export const mctsActionKey=action=>{
 const keys=Object.keys(action),shape=keys.join("\u0000");
 let ordered=actionSchemas.get(shape);
 if(!ordered){
  ordered=keys.sort();
  actionSchemas.set(shape,ordered);
 }
 return JSON.stringify(ordered.map(key=>[key,action[key]]));
};
const actionKey=mctsActionKey;
const cloneSession=(s,recordHistory=true,fastPileClones=false,
 fastMetricClones=false)=>({
 ...s,state:forkGameState(s.state,{fastPiles:fastPileClones,
  fastMetrics:fastMetricClones}),
 history:recordHistory?s.history.slice():[],
 remainingReturns:[...s.remainingReturns],
 pendingNested:s.pendingNested?{
  ...s.pendingNested,
  responses:[...s.pendingNested.responses],
  actions:s.pendingNested.actions.map(a=>({...a}))
 }:null
});
// Preserve the EXACT JSON/FNV public-observation fingerprint, including
// property ordering and nesting, without allocating and serializing an
// extra enclosing object at every MCTS node. Normal phase/hero prefixes
// are reusable, but game-state JSON is recalculated on every decision:
// cached state snapshots would become stale after mutable rules effects.
let nativeHashPart=null;
/** Injection keeps browser session MCTS independent of Node native modules. */
export function registerNativeMctsHash(fn){
 if(typeof fn!=="function")throw Error("Native hashPart must be callable");
 nativeHashPart=fn;
}
const hashPart=(initial,chunk)=>{
 let h=initial;
 for(let i=0;i<chunk.length;i++)
  h=Math.imul(h^chunk.charCodeAt(i),16777619);
 return h>>>0;
};
const phaseHashPrefixes=new Map();
export const mctsLegacyPublicStateHash=s=>{
 const nested=s.pendingNested;
 return hash(JSON.stringify({
  phase:nested?"reaction":s.phase,
  trigger:nested?nested.trigger??null:null,
  heroIndex:nested?null:s.heroIndex??null,
  game:nested?nested.observation:observeGame(s.state)
 }));
};
export const mctsPublicStateHash=(s,useNative=false)=>{
 const nested=s.pendingNested;
 let initial;
 if(nested){
  initial=hash('{"phase":"reaction","trigger":'+
   JSON.stringify(nested.trigger??null)+',"heroIndex":null,"game":');
 }else{
  const key=s.phase+"|"+(s.heroIndex??null);
  initial=phaseHashPrefixes.get(key);
  if(initial===undefined){
   initial=hash('{"phase":'+JSON.stringify(s.phase)+
    ',"trigger":null,"heroIndex":'+JSON.stringify(s.heroIndex??null)+
    ',"game":');
   phaseHashPrefixes.set(key,initial);
  }
 }
 const game=nested?nested.observation:observeGame(s.state);
 if(useNative){
  if(!nativeHashPart)
   throw Error("Native MCTS hash unavailable; build and load native addon");
  // Only one N-API call per observation; the closing brace is a single
  // UTF-16 code unit and needs no native round-trip.
  const h=nativeHashPart(initial,JSON.stringify(game));
  return Math.imul(h^125,16777619)>>>0;
 }
 return hashPart(hashPart(initial,JSON.stringify(game)),"}");
};
function nodeFor(tree,key,actions,reuseEdgeActions=false){
 let node=tree.get(key),isNew=false;
 if(!node){node={visits:0,edges:new Map()};tree.set(key,node);isNew=true;}
 // One canonical fingerprint per legal action. It was previously sorted
 // and JSON-stringified repeatedly for insertion, selection, lookup and
 // history tracking. Keep each edge paired with its action for this step.
 const candidates=actions.map(action=>{
  const id=actionKey(action);
  let edge=node.edges.get(id);
  if(!edge){
   edge={action:reuseEdgeActions&&Object.isFrozen(action)?action:{...action},
    visits:0,wins:0};
   node.edges.set(id,edge);
  }
  return {action,id,edge};
 });
 return {node,candidates,isNew};
}
function select(node,candidates,rng,c,scratch=null,implicitWeight=0){
 const unseen=scratch?scratch.unseen:[];
 if(scratch)unseen.length=0;
 for(const candidate of candidates)
  if(candidate.edge.visits===0)unseen.push(candidate);
 if(unseen.length)return rng.choose(unseen);
 // Preserve identical UCT scores and the same single tie-breaking draw,
 // without allocating score objects or computing log(visits) per action.
 const logVisits=Math.log(Math.max(2,node.visits));
 const scores=scratch?scratch.scores:new Array(candidates.length);
 if(scratch)scores.length=candidates.length;
 let maximum=-Infinity;
 for(let i=0;i<candidates.length;i++){
  const e=candidates[i].edge;
  const exploitation=implicitWeight?
   implicitUCTExploitation(e,implicitWeight):e.wins/e.visits;
  const score=exploitation+c*Math.sqrt(logVisits/e.visits);
  scores[i]=score;
  if(score>maximum)maximum=score;
 }
 const tied=scratch?scratch.tied:[];
 if(scratch)tied.length=0;
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
 knowledge="fair",exploration=null,maxSteps=4000,
 strictTerminal=true,observedReplay=null,collectCoverage=true,
 rootActions=null,transactional=true,fastTransitions=true,
 reuseLegalActions=true,fastStateHash=true,treeMode="full",
 lazyColdEdges=false,reuseTraceSlots=false,fastPileClones=false,
 reuseEdgeActions=false,streamHistoryHash=false,
 reuseSelectionScratch=false,reuseEmptyReplaySwitches=false,directSettlements=false,
 fastMetricClones=false,speculativeTransitions=false,
 checkpointEvery=32,lazyInitialCheckpoint=false,
 profileTransitions=false,canonicalReactionPhases=false,
 deferReactionCheckpoints=false,onDemandCheckpoints=false,
 nativeHash=false,rolloutCombatMode="random",
 rolloutCombatSamples=2,rolloutCombatMaxDecisions=8,
 implicitWeight=0,implicitHeuristicMode="legacy"}={}){
 if(!Number.isInteger(budget)||budget<1||budget>100000)
  throw Error("MCTS budget must be an integer in [1,100000]");
 if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>100000)
  throw Error("MCTS maxSteps must be an integer in [1,100000]");
 if(!["fair","oracle"].includes(knowledge))
  throw Error("Knowledge must be fair or oracle");
 // Explicit C overrides the provisional profile. Omitted C preserves
 // classic sqrt(2), using C=0.7 when either hybrid extension is enabled.
 const effectiveExploration=resolveExploration({
  exploration,rolloutCombatMode,implicitWeight
 });
 if(typeof transactional!=="boolean"||typeof fastTransitions!=="boolean"||
    typeof reuseLegalActions!=="boolean"||typeof fastStateHash!=="boolean"||
    typeof lazyColdEdges!=="boolean"||typeof reuseTraceSlots!=="boolean"||
    typeof fastPileClones!=="boolean")
  throw Error("transactional, fastTransitions, reuseLegalActions, fastStateHash, lazyColdEdges, reuseTraceSlots and fastPileClones must be boolean");
 if(typeof reuseEdgeActions!=="boolean"||typeof streamHistoryHash!=="boolean"||
    typeof reuseSelectionScratch!=="boolean")
  throw Error("reuseEdgeActions, streamHistoryHash and reuseSelectionScratch must be boolean");
 if(typeof reuseEmptyReplaySwitches!=="boolean")
  throw Error("reuseEmptyReplaySwitches must be boolean");
 if(typeof directSettlements!=="boolean")
  throw Error("directSettlements must be boolean");
 if(typeof fastMetricClones!=="boolean")
  throw Error("fastMetricClones must be boolean");
 if(typeof speculativeTransitions!=="boolean")
  throw Error("speculativeTransitions must be boolean");
 if(typeof lazyInitialCheckpoint!=="boolean")
  throw Error("lazyInitialCheckpoint must be boolean");
 if(typeof profileTransitions!=="boolean")
  throw Error("profileTransitions must be boolean");
 if(typeof canonicalReactionPhases!=="boolean")
  throw Error("canonicalReactionPhases must be boolean");
 if(typeof deferReactionCheckpoints!=="boolean")
  throw Error("deferReactionCheckpoints must be boolean");
 if(typeof onDemandCheckpoints!=="boolean")
  throw Error("onDemandCheckpoints must be boolean");
 if(typeof nativeHash!=="boolean")
  throw Error("nativeHash must be boolean");
 if(nativeHash&&(!fastStateHash||!nativeHashPart))
  throw Error("nativeHash requires fastStateHash and loaded native MCTS addon");
 if(!Number.isInteger(checkpointEvery)||checkpointEvery<1||checkpointEvery>256)
  throw Error("checkpointEvery must be an integer in [1,256]");
 if(!["full","frontier"].includes(treeMode))
  throw Error("treeMode must be full or frontier");
 if(!["random","sampled-expectimax"].includes(rolloutCombatMode))
  throw Error("Invalid combat rollout mode");
 if(rolloutCombatMode!=="random"&&treeMode!=="frontier")
  throw Error("Combat rollout lookahead requires frontier tree mode");
 if(!Number.isInteger(rolloutCombatSamples)||
  rolloutCombatSamples<1||rolloutCombatSamples>6||
  !Number.isInteger(rolloutCombatMaxDecisions)||
  rolloutCombatMaxDecisions<1||rolloutCombatMaxDecisions>64)
  throw Error("Invalid combat rollout sample/call limit");
 if(!Number.isFinite(implicitWeight)||implicitWeight<0||
  implicitWeight>1)
  throw Error("Implicit backup weight must be in [0,1]");
 if(!["legacy","solo-hp","solo-threat"].includes(implicitHeuristicMode))
  throw Error("Unknown implicit heuristic mode");
 if(implicitHeuristicMode!=="legacy"&&session.state.heroes.length!==1)
  throw Error("Solo implicit heuristic requires exactly one Hero");
 const stateHash=fastStateHash?
  (nativeHash?s=>mctsPublicStateHash(s,true):mctsPublicStateHash):
  mctsLegacyPublicStateHash;
 // Opt-in counts and inclusive timers; normal searches allocate no profile.
 const transitionProfile=profileTransitions?{totals:{},byPhase:{}}:null;
 const mark=(kind,phase,elapsedMs=0)=>{
  if(!transitionProfile)return;
  const add=metrics=>{
   const metric=metrics[kind]??(metrics[kind]={count:0,elapsedMs:0});
   metric.count++;
   metric.elapsedMs+=elapsedMs;
  };
  add(transitionProfile.totals);
  add(transitionProfile.byPhase[phase]??={});
 };
 const profiledClone=(source,kind,phase)=>{
  const started=transitionProfile?performance.now():0;
  const copy=cloneSession(source,!fastTransitions,
   fastPileClones,fastMetricClones);
  if(transitionProfile)mark(kind,phase,performance.now()-started);
  return copy;
 };
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
 const tree=new Map(),rootKey="root:"+stateHash(session),rng=randomSource(seed);
 let wins=0,completed=0,incomplete=0,maximumDepth=0;
 let rolloutEquipmentAdvances=0,rolloutCombatSearches=0;
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
 // Last-120 error reproduction slots are reused across simulated turns
 // and trials. This buffer cannot influence selection or canonical dice.
 // Reused only within this synchronous search; independent calls and
 // worker threads never share UCT scratch storage.
 const selectionScratch=reuseSelectionScratch?{unseen:[],scores:[],tied:[]}:null;
 const pooledTrace=new Array(120);
 for(let i=0;i<budget;i++){
  // Rollout histories are never read by game rules. Avoid copying the
  // original history only to discard it immediately afterward.
  const sim=profiledClone(session,"trialClone",session.phase),s=sim.state;
  const chanceSeed=mix(seed^Math.imul(i+1,0x9e3779b9)),
   deckSeed=mix(seed^Math.imul(i+1,0x85ebca6b));
  // Never change the already-observed die/Room revealed inside a pending
  // reaction. Replay it exactly first, then sample only future chance.
  if(!sim.pendingNested){
   s.rng=randomSource(chanceSeed);
   if(knowledge==="fair"){
    const drawn=sampleRolloutDecks(session.state,{
     knowledge:"fair",blueprint,deckSeed});
    s.deck=drawn.deck;
    for(const stage of ["UPPER","MIDDLE","DEEP"]){
     s.rooms[stage]=drawn.rooms[stage];
     s.monsters[stage]=drawn.monsters[stage];
    }
   }
  }
  // Checkpoints retain the determinized hidden piles and remaining dice.
  // Reconstruct the last few completed canonical actions only if a
  // printed effect actually suspends for a nested player decision.
  // Lazy mode recreates the first checkpoint from exact sampled seeds
  // only when a printed reaction actually requires a rollback.
  let checkpoint=speculativeTransitions&&transactional&&
   !lazyInitialCheckpoint&&!onDemandCheckpoints?
   profiledClone(sim,"initialCheckpointClone",sim.phase):null;
  const rebuildInitialTrial=()=>{
   const rebuilt=profiledClone(session,"initialRecoveryClone",session.phase);
   if(!rebuilt.pendingNested){
    rebuilt.state.rng=randomSource(chanceSeed);
    if(knowledge==="fair"){
     const drawn=sampleRolloutDecks(session.state,{
      knowledge:"fair",blueprint,deckSeed});
     rebuilt.state.deck=drawn.deck;
     for(const stage of ["UPPER","MIDDLE","DEEP"]){
      rebuilt.state.rooms[stage]=drawn.rooms[stage];
      rebuilt.state.monsters[stage]=drawn.monsters[stage];
     }
    }
   }
   return rebuilt;
  };
  let sinceCheckpoint=[];
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
    eventState.deck=drawn.deck;
    for(const stage of ["UPPER","MIDDLE","DEEP"]){
     eventState.rooms[stage]=drawn.rooms[stage];
     eventState.monsters[stage]=drawn.monsters[stage];
    }
   }
   eventState.rng=randomSource(observedReplay.diceSeed);
  };
  const onReplay=eventState=>{
   // A revealed corridor has removed its shown Rooms from the hidden pile.
   if(knowledge==="fair"){
    const drawn=sampleRolloutDecks(eventState,{
     knowledge:"fair",deckSeed});
    eventState.deck=drawn.deck;
    for(const stage of ["UPPER","MIDDLE","DEEP"]){
     eventState.rooms[stage]=drawn.rooms[stage];
     eventState.monsters[stage]=drawn.monsters[stage];
    }
   }
   eventState.rng=randomSource(chanceSeed);
  };
  const path=[],choiceRng=randomSource(mix(seed^Math.imul(i+1,0xc2b2ae35)));
  let historyKey=rootKey,depth=0,error=null,equipmentStreak=0;
  let implicitFrontierDepth=0,implicitFrontierValue=null;
  let implicitFrontierKey=null;
  let rolloutCombatThisTrial=0;
  // Standard UCT: expand one new action per trial, then use the same
  // random default policy from actual legal canonical actions. "full"
  // preserves the historical study's tree bookkeeping and seed results.
  let inRollout=false;
  // Keep the last 120 actions with constant-time recording. Error
  // reports still reconstruct the exact same chronological action trace.
  const reproductionTrace=reuseTraceSlots?pooledTrace:new Array(120);
  let traceCount=0,traceCursor=0;
  const recentActions=()=>traceCount<120?
   reproductionTrace.slice(0,traceCount):
   [...reproductionTrace.slice(traceCursor),
    ...reproductionTrace.slice(0,traceCursor)];
  try{
   while(sim.phase!=="terminal"&&depth<maxSteps){
    const actions=sessionActions(sim,{issueTicket:reuseLegalActions});
    if(!actions.length){error="no-legal-actions:"+JSON.stringify({
     phase:sim.phase,roomId:sim.state.room?.id,
     monsterId:sim.state.monster?.id,
     heroHP:sim.state.heroes.map(h=>h.hp),
     inventory:sim.state.heroes.map(h=>h.inventory.map(c=>c.id)),
     pendingTrigger:sim.pendingNested?.trigger??null,
     roomChoiceOperations:sim.state.room?.v2.choices??null
    });break}
    // In "frontier" mode, a newly expanded UCT edge is followed by a
    // default rollout rather than allocating thousands of single-visit
    // subtrees. This is still real MCTS: revisited paths expand deeper.
    // The selected legal action, its dice and all printed effects remain
    // canonical; only search bookkeeping differs.
    const forced=progressionPhases.has(sim.phase)&&
     equipmentStreak>=MAX_ROLLOUT_EQUIPMENT_ACTIONS;
    let choice,selectedId,progress=false;
    if(treeMode==="frontier"&&inRollout){
     const continueAction=forced?actions.find(a=>a.kind==="continue"):null;
     let combatChoice=null;
     if(!continueAction&&rolloutCombatMode==="sampled-expectimax"&&
       !sim.pendingNested&&actions.length>1&&
       ["combat-hero","combat","parley"].includes(sim.phase)&&
       rolloutCombatThisTrial<rolloutCombatMaxDecisions){
      combatChoice=sampledCombatRolloutAction(sim,{
       samples:rolloutCombatSamples,ply:2,
       seed:mix(seed^Math.imul(i+1,0x632be59b)^
        Math.imul(depth+1,0x85ebca6b))
      });
      if(combatChoice){
       // Use the canonical ticketed action, not a separately enumerated
       // equivalent, so nested replay remains exactly reproducible.
       const candidate=actions.find(a=>actionKey(a)===actionKey(combatChoice));
       if(!candidate)throw Error("Expectimax returned an illegal MCTS action");
       combatChoice=candidate;
       rolloutCombatThisTrial++;rolloutCombatSearches++;
      }
     }
     choice=continueAction||combatChoice||choiceRng.choose(actions);
     progress=Boolean(continueAction);
     // The history key is not used after entering a default rollout.
     selectedId=null;
    }else{
     const key=historyKey+":"+stateHash(sim);
     let node=tree.get(key),selectedEdge;
     if(!node&&lazyColdEdges){
      // On the first visit all actions are unvisited. The original
      // nodeFor/select therefore draws uniformly from the legal list.
      // Allocate only that chosen edge, and materialize the other zero-
      // visit edges when the position is revisited. RNG and UCT stay exact.
      node={visits:0,edges:new Map()};
      tree.set(key,node);
      const forcedChoice=forced?
       actions.find(a=>a.kind==="continue"):null;
      choice=forcedChoice||choiceRng.choose(actions);
      selectedId=actionKey(choice);
      selectedEdge={action:reuseEdgeActions&&Object.isFrozen(choice)?choice:{...choice},
       visits:0,wins:0};
      node.edges.set(selectedId,selectedEdge);
      progress=Boolean(forcedChoice);
     }else{
      const found=nodeFor(tree,key,actions,reuseEdgeActions);
      node=found.node;
      const forcedCandidate=forced?
       found.candidates.find(c=>c.action.kind==="continue"):null;
      const selected=forcedCandidate||
       select(node,found.candidates,choiceRng,effectiveExploration,selectionScratch,
        implicitWeight);
      choice=selected.action;
      selectedId=selected.id;
      selectedEdge=selected.edge;
      progress=Boolean(forcedCandidate);
     }
     if(implicitWeight>0&&!implicitFrontierDepth&&
       selectedEdge.visits===0)
      implicitFrontierDepth=path.length+1;
     path.push({node,edge:selectedEdge});
     if(treeMode==="frontier"&&selectedEdge.visits===0)
      inRollout=true;
    }
    if(progress)rolloutEquipmentAdvances++;
    equipmentStreak=progressionPhases.has(sim.phase)&&
     freeEquipmentKinds.has(choice.kind)?equipmentStreak+1:0;
    if(collectCoverage)record(actions,choice,sim.pendingNested?
     "reaction:"+sim.pendingNested.trigger.phase:sim.phase);
    const from=sim.phase;
    if(reuseTraceSlots){
     let entry=reproductionTrace[traceCursor];
     if(!entry){
      entry={depth:0,phase:null,pending:null,roomId:null,
       monsterId:null,heroHP:[],action:null};
      reproductionTrace[traceCursor]=entry;
     }
     entry.depth=depth;
     entry.phase=from;
     entry.pending=sim.pendingNested?.trigger??null;
     entry.roomId=sim.state.room?.id??null;
     entry.monsterId=sim.state.monster?.id??null;
     entry.heroHP.length=0;
     for(const hero of sim.state.heroes)entry.heroHP.push(hero.hp);
     entry.action=choice;
    }else{
     reproductionTrace[traceCursor]={depth,phase:from,
      pending:sim.pendingNested?.trigger??null,
      roomId:sim.state.room?.id??null,
      monsterId:sim.state.monster?.id??null,
      heroHP:sim.state.heroes.map(h=>h.hp),action:choice};
    }
    if(++traceCursor===120)traceCursor=0;
    if(traceCount<120)traceCount++;
    const replayObserved=originalRootWasPending&&!observedRootResolved&&
     Boolean(sim.pendingNested);
    const replaySwitches=replayObserved?[
     ...(observedReplay?[{at:observedReplay.replayAt,
      callback:onObservedReplay}]:[]),
     {at:chanceSwitchIndex,callback:onReplay}
    ]:[];
    // Profiling found that Room decisions frequently request nested
    // reactions. For those phases the canonical transaction avoids
    // speculative checkpoint recovery and replay of earlier decisions.
    const canonicalReactionPhase=canonicalReactionPhases&&
     (from==="room"||from==="retained-entry");
    const canSpeculate=speculativeTransitions&&transactional&&
     !canonicalReactionPhase&&!sim.pendingNested&&!replaySwitches.length;
    if(transitionProfile&&speculativeTransitions&&canonicalReactionPhase)
     mark("canonicalReactionPhase",from);
    // The current decision has been selected, but has not changed any
    // game state or dice. Take a checkpoint only before speculative work.
    if(onDemandCheckpoints&&canSpeculate&&!checkpoint){
     checkpoint=profiledClone(sim,"onDemandCheckpointClone",from);
     sinceCheckpoint=[];
    }
    const transitionStarted=transitionProfile?performance.now():0;
    if(canSpeculate){
     let restored=false;
     submitSpeculativeDecision(sim,choice,{
      verifiedLegalActions:reuseLegalActions?actions:null,
      observeResult:!fastTransitions,recordHistory:!fastTransitions,
      restore:()=>{
       restored=true;
       const recoveryStarted=transitionProfile?performance.now():0;
       const recovered=checkpoint?
        profiledClone(checkpoint,"recoveryClone",from):
        rebuildInitialTrial();
       // All preceding actions completed without a nested reaction.
       // Replaying the exact canonical decisions restores RNG and piles.
       for(const prior of sinceCheckpoint){
        const replayStarted=transitionProfile?performance.now():0;
        submitDecision(recovered,prior,{
         transactional,observeResult:!fastTransitions,
         recordHistory:!fastTransitions,
         fastPileClones,reuseEmptyReplaySwitches,directSettlements,
         fastMetricClones,profileEvent:transitionProfile?mark:null
        });
        if(transitionProfile)mark("replayedAction",from,
         performance.now()-replayStarted);
        if(recovered.pendingNested)
         throw Error("Speculative MCTS checkpoint replay diverged");
       }
       Object.assign(sim,recovered);
       if(transitionProfile)mark("checkpointRecovery",from,
        performance.now()-recoveryStarted);
      }
     });
     if(restored&&sim.pendingNested)mark("nestedRecovery",from);
     sinceCheckpoint.push(choice);
    }else{
     submitDecision(sim,choice,{replaySwitches,transactional,
      observeResult:!fastTransitions,recordHistory:!fastTransitions,
      verifiedLegalActions:reuseLegalActions?actions:null,
      fastPileClones,reuseEmptyReplaySwitches,directSettlements,
      fastMetricClones,profileEvent:transitionProfile?mark:null});
    }
    if(transitionProfile)mark(canSpeculate?
     "speculativeTransition":"canonicalTransition",from,
     performance.now()-transitionStarted);
    // No speculative decisions run while a reaction is pending. The
    // canonical fork/replay handles every intervening response; checkpoint
    // again after the reaction finishes. Terminal copies are also unused.
    // Historical behavior remains the default for paired comparison.
    if(onDemandCheckpoints){
     // Canonical decisions cannot need rollback from the speculative
     // prefix. Interval boundaries invalidate the checkpoint until the
     // next speculative action; pending reactions require no snapshot.
     if(!canSpeculate||sinceCheckpoint.length>=checkpointEvery){
      checkpoint=null;
      sinceCheckpoint=[];
     }
    }else if(speculativeTransitions&&transactional&&
       (!deferReactionCheckpoints||
        (sim.phase!=="terminal"&&!sim.pendingNested))&&
       (sim.pendingNested||!canSpeculate||
        sinceCheckpoint.length>=checkpointEvery)){
     checkpoint=profiledClone(sim,"checkpointClone",sim.phase);
     sinceCheckpoint=[];
    }
    if(replayObserved&&!sim.pendingNested)observedRootResolved=true;
    // Capture the first stable expansion frontier, independent of the
    // eventual terminal binary rollout reward. Suspended reaction states
    // are never evaluated before the canonical replay has completed.
    if(implicitWeight>0&&implicitFrontierDepth&&
       implicitFrontierValue===null&&!sim.pendingNested)
    {
     implicitFrontierValue=implicitExpeditionHeuristic(sim,implicitHeuristicMode);
     // This hash contains only the public observation at the actual
     // frontier, not the determinized future hidden deck.
     implicitFrontierKey=String(stateHash(sim));
    }
    // The exact public observation at the next boundary keys the tree.
    if(!inRollout||treeMode==="full")
     historyKey=mix(streamHistoryHash?
      hashPart(hashPart(hashPart(2166136261,historyKey),from),selectedId):
      hash(historyKey+from+selectedId)).toString(16);
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
  if(implicitWeight>0&&implicitFrontierDepth)
   backupImplicit(path.slice(0,implicitFrontierDepth),
    implicitFrontierValue??implicitExpeditionHeuristic(sim,implicitHeuristicMode),
    implicitFrontierKey??String(stateHash(sim)));
 }
 if(JSON.stringify(observeSession(session))!==original||
    session.state.rng.snapshot()!==actualRng)
  throw Error("MCTS mutated the actual player state or future dice");
 const root=tree.get(rootKey+":"+stateHash(session));
 const decisions=rootStats(root,rootActions).map(d=>{
  if(!implicitWeight)return d;
  const edge=root?.edges.get(actionKey(d.action));
  return {...d,implicitValue:edge?.implicitVisits?
   implicitSelectedMean(edge):null};
 }).sort((a,b)=>
  b.visits-a.visits||((b.estimatedWinRate??0)-(a.estimatedWinRate??0)));
 // Select robust child (most visits), not an exploratory single lucky win.
 const chosen=decisions[0];
 return {knowledge,seed,budget,completed,incomplete,incompleteReasons,
  terminalWins:wins,terminalWinRate:completed?wins/completed:null,
  maximumDepth,treeNodes:tree.size,
  rolloutEquipmentAdvances,
  maxConsecutiveRolloutEquipmentActions:MAX_ROLLOUT_EQUIPMENT_ACTIONS,
  ...(rolloutCombatMode!=="random"?{
   rolloutCombatMode,rolloutCombatSearches,
   rolloutCombatSamples,rolloutCombatMaxDecisions}:{}),
  ...(implicitWeight>0?{implicitWeight,implicitRootValue:root?.implicitValue??null,
   implicitHeuristicMode}:{}),
  ...(rolloutCombatMode!=="random"||implicitWeight>0?
   {exploration:effectiveExploration}:{}),
  rootActionCount:rootActions.length,choices:decisions,
  recommended:chosen?.action??null,
  actionCoverage:{phaseOpportunities,phaseSelections,
   actionOpportunities,actionSelections,
   cardOpportunities,cardSelections},
  rootEveryActionTried:decisions.every(x=>x.visits>0),
  complete:incomplete===0,
  ...(transitionProfile?{transitionProfile}:{}),
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
