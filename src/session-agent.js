/** Run ONE complete expedition by choosing every pausable player decision
 * through the canonical game session. Multi-option decisions use UCT;
 * forced one-action transitions do not waste Monte Carlo samples.
 *
 * All card outcomes come from the printed effect engine; every discarded
 * branch is a genuine hypothetical action evaluated to a real ending.
 */
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "./engine/decision-session.js";
import {searchDecision} from "./session-mcts.js";
const mix=n=>{n=(n+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const count=(m,k)=>{m[k]=(m[k]||0)+1};
const cloneMetrics=s=>JSON.parse(JSON.stringify(s.metrics));
export function playSessionWithMCTS({
 seed,heroes=["warrior"],gameMode="original",knowledge="fair",
 budget=2,maxSearchSteps=4000,maxGameSteps=7000,
 strictTerminal=true,traceLimit=120,extraObjectId=null,
 onDecision=null,retainSearches=true,equipmentProgressCap=0
}={}){
 if(!Number.isSafeInteger(seed)||seed<0)throw Error("Expected a nonnegative game seed");
 if(onDecision!==null&&typeof onDecision!=="function")throw Error("onDecision must be a function");
 if(!Number.isInteger(maxGameSteps)||maxGameSteps<1)
  throw Error("Invalid maxGameSteps");
 if(!Number.isInteger(equipmentProgressCap)||equipmentProgressCap<0)
  throw Error("Invalid equipmentProgressCap");
 if(!Number.isInteger(traceLimit)||traceLimit<0)
  throw Error("Invalid traceLimit");
 const session=createDecisionSession({seed,heroes,gameMode,extraObjectId});
 const decisionCounts={},chosenCounts={},choiceCoverage={},
  availableCardActions={},chosenCardActions={};
 const trace=[],searches=[];
 let searchedDecisions=0,forcedDecisions=0;
 let consecutiveEquipment=0,equipmentProgressBreaks=0;
 for(let step=0;step<maxGameSteps&&session.phase!=="terminal";step++){
  const actions=sessionActions(session);
  if(!actions.length)throw Error("No legal action at phase "+session.phase);
  const phase=session.pendingNested?
   "reaction:"+session.pendingNested.trigger.phase:session.phase;
  count(decisionCounts,phase);
  for(const action of actions){
   count(choiceCoverage,phase+":"+action.kind);
   if(action.cardId)count(availableCardActions,action.cardId+":"+action.kind);
  }
  let chosen,diagnostic=null;
  const started=onDecision?performance.now():0;
  const cycleBreak=equipmentProgressCap>0&&
   (phase==="between-rooms"||phase==="explore")&&
   consecutiveEquipment>=equipmentProgressCap&&
   actions.some(a=>a.kind==="continue");
  if(cycleBreak){
   chosen=actions.find(a=>a.kind==="continue");
   forcedDecisions++;equipmentProgressBreaks++;
  }else if(actions.length===1){
   chosen=actions[0];forcedDecisions++;
  }else{
   // Independent search seeds at *each actual decision* - not a scripted
   // fallback chosen by the party's strategy. Avoid reusing samples when
   // subsequent choices involve the same printed card.
   diagnostic=searchDecision(session,{
    knowledge,budget,strictTerminal,maxSteps:maxSearchSteps,
    seed:mix(seed^Math.imul(step+1,0x85ebca6b))
   });
   if(!diagnostic.recommended||!diagnostic.complete||
      !diagnostic.rootEveryActionTried&&budget>=actions.length)
    throw Error("Incomplete MCTS decision "+step+" at "+phase);
   chosen=diagnostic.recommended;
   searchedDecisions++;
   if(retainSearches)searches.push({
    step,phase,roomId:session.state.room?.id??null,
    monsterId:session.state.monster?.id??null,
    budget:diagnostic.budget,rootActionCount:diagnostic.rootActionCount,
    treeNodes:diagnostic.treeNodes,maximumDepth:diagnostic.maximumDepth,
    terminalWins:diagnostic.terminalWins,
    choices:diagnostic.choices
   });
  }
  if((phase==="between-rooms"||phase==="explore")&&
     ["equip","unequip","transfer"].includes(chosen.kind))
   consecutiveEquipment++;
  else consecutiveEquipment=0;
  count(chosenCounts,phase+":"+chosen.kind);
  if(chosen.cardId)count(chosenCardActions,chosen.cardId+":"+chosen.kind);
  if(trace.length<traceLimit)trace.push({
   step,phase,roomId:session.state.room?.id??null,
   monsterId:session.state.monster?.id??null,
   selected:chosen,via:diagnostic?"uct":"forced"
  });
  const selectedAt=onDecision?performance.now():0;
  if(onDecision)onDecision({moment:"before",step,phase,session,
   actions,chosen,diagnostic,cycleBreak,searchMs:selectedAt-started});
  let dice=[];
  submitDecision(session,chosen,onDecision?{
   onCommittedDice:rolls=>{dice=rolls;}}:{});
  if(onDecision)onDecision({moment:"after",step,phase,session,
   actions,chosen,diagnostic,cycleBreak,dice,
   searchMs:selectedAt-started,transitionMs:performance.now()-selectedAt});
 }
 if(session.phase!=="terminal")
  throw Error("Actual expedition did not finish in "+maxGameSteps+" decisions");
 const s=session.state;
 if(s.metrics.roundLimit||s.metrics.unresolved)
  throw Error("Actual expedition reached unresolved round limit");
 if(!s.metrics.won&&s.alive()&&!s.metrics.escaped)
  throw Error("Terminal phase without a genuine printed ending");
 return {
  schema:"canonical-session-mcts-v1",
  seed,heroes,knowledge,budget,extraObjectId,won:!!s.metrics.won,
  ending:s.endingKind,
  resolved:true,actions:session.actionCount,
  searchedDecisions,forcedDecisions,equipmentProgressBreaks,metrics:cloneMetrics(s),
  decisionCounts,chosenCounts,choiceCoverage,
  availableCardActions,chosenCardActions,trace,searches,
  knownLimitations:[
   "The session still has automatic strategy-dependent choices in some printed effects",
   "Hero and Item trigger coverage is measured at pausable boundaries, not automatically exhaustive",
   "This is a state-dependent UCT policy, not a certified optimal strategy"
  ]
 };
}
