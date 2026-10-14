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
import {observeSession,sessionActions,submitDecision}
 from "./engine/decision-session.js";
import {randomSource} from "./engine/random.js";
import {prepareRolloutDecks,sampleRolloutDecks} from "./rollout-state.js";

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
const publicState=s=>{
 const observation=observeSession(s);
 return hash(JSON.stringify({
  phase:observation.phase,
  trigger:observation.trigger??null,
  heroIndex:observation.heroIndex??null,
  game:observation.game
 }));
};
function nodeFor(tree,key,actions){
 let node=tree.get(key);
 if(!node){node={visits:0,edges:new Map()};tree.set(key,node);}
 for(const action of actions){
  const id=actionKey(action);
  if(!node.edges.has(id))node.edges.set(id,{
   action:{...action},visits:0,wins:0
  });
 }
 return node;
}
function select(node,actions,rng,c){
 const unseen=actions.filter(action=>node.edges.get(actionKey(action)).visits===0);
 if(unseen.length)return rng.choose(unseen);
 const scored=actions.map(action=>{
  const e=node.edges.get(actionKey(action));
  return {action,score:e.wins/e.visits+
   c*Math.sqrt(Math.log(Math.max(2,node.visits))/e.visits)};
 });
 const maximum=Math.max(...scored.map(x=>x.score));
 return rng.choose(scored.filter(x=>Math.abs(x.score-maximum)<1e-12)).action;
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
 strictTerminal=true}={}){
 if(!Number.isInteger(budget)||budget<1||budget>100000)
  throw Error("MCTS budget must be an integer in [1,100000]");
 if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>100000)
  throw Error("MCTS maxSteps must be an integer in [1,100000]");
 if(!["fair","oracle"].includes(knowledge))
  throw Error("Knowledge must be fair or oracle");
 if(!Number.isFinite(exploration)||exploration<0)
  throw Error("Exploration coefficient must be nonnegative");
 const rootActions=sessionActions(session);
 if(!rootActions.length)throw Error("No pending player choice to search");
 const original=JSON.stringify(observeSession(session));
 const actualRng=session.state.rng.snapshot();
 const blueprint=knowledge==="fair"?
  prepareRolloutDecks(session.state,"fair"):null;
 const tree=new Map(),rootKey="root:"+publicState(session),rng=randomSource(seed);
 let wins=0,completed=0,incomplete=0,maximumDepth=0;
 const incompleteReasons={};
 for(let i=0;i<budget;i++){
  const sim=cloneSession(session),s=sim.state;
  // Oracle sees deck order, never the real continuation of the future dice.
  s.rng=randomSource(mix(seed^Math.imul(i+1,0x9e3779b9)));
  if(knowledge==="fair"){
   const drawn=sampleRolloutDecks(session.state,{
    knowledge:"fair",blueprint,
    deckSeed:mix(seed^Math.imul(i+1,0x85ebca6b))});
   s.deck=drawn.deck.slice();
   for(const stage of ["UPPER","MIDDLE","DEEP"]){
    s.rooms[stage]=drawn.rooms[stage].slice();
    s.monsters[stage]=drawn.monsters[stage].slice();
   }
  }
  const path=[],choiceRng=randomSource(mix(seed^Math.imul(i+1,0xc2b2ae35)));
  let historyKey=rootKey,depth=0,error=null;
  try{
   while(sim.phase!=="terminal"&&depth<maxSteps){
    const actions=sessionActions(sim);
    if(!actions.length){error="no-legal-actions:"+sim.phase;break}
    const key=historyKey+":"+publicState(sim);
    const node=nodeFor(tree,key,actions);
    const choice=select(node,actions,choiceRng,exploration);
    const edge=node.edges.get(actionKey(choice));
    path.push({node,edge});
    const from=sim.phase;
    submitDecision(sim,choice);
    // The exact public observation at the next boundary keys the tree.
    historyKey=mix(hash(historyKey+from+actionKey(choice))).toString(16);
    depth++;
   }
   if(sim.phase!=="terminal"&&!error)error="maxSteps";
  }catch(e){
   // Never convert unsupported printed operations into a loss.
   error="rule-error:"+(e.message||String(e));
   if(strictTerminal)throw Error("MCTS unsupported branch at trial "+i+
    ", depth "+depth+": "+error);
  }
  maximumDepth=Math.max(maximumDepth,depth);
  if(error){
   incomplete++;
   incompleteReasons[error]=(incompleteReasons[error]||0)+1;
   if(strictTerminal)throw Error("MCTS sampled nonterminal at trial "+i+
    ", depth "+depth+": "+error);
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
 const root=tree.get(rootKey+":"+publicState(session));
 const decisions=rootStats(root,rootActions).sort((a,b)=>
  b.visits-a.visits||((b.estimatedWinRate??0)-(a.estimatedWinRate??0)));
 const chosen=decisions.slice().sort((a,b)=>
  (b.visits===0?0:b.estimatedWinRate??0)-
  (a.visits===0?0:a.estimatedWinRate??0))[0];
 return {knowledge,seed,budget,completed,incomplete,incompleteReasons,
  terminalWins:wins,terminalWinRate:completed?wins/completed:null,
  maximumDepth,treeNodes:tree.size,
  rootActionCount:rootActions.length,choices:decisions,
  recommended:chosen?.action??null,
  complete:incomplete===0,
  limitations:[
   "Only currently wired pending action windows are searched",
   "Information-set UCT samples unknown cards without seeing future dice",
   "Confidence intervals represent conditional rollout wins, not independent human-play strength",
   "Uninstrumented printed auto-effects remain outside the action tree"
  ]};
}
