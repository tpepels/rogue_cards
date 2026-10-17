/**
 * Experimental two-Hero-action sampled expectimax for frontier MCTS rollouts.
 *
 * All branches run through the canonical decision-session API. This is a
 * cooperative stochastic search (max over choices, average over dice), NOT
 * adversarial minimax; reactions and Monster queues are never fabricated.
 *
 * A "ply" is one combat action or one Parley decision. Choosing which Hero
 * acts is a deterministic preliminary choice and does not consume a ply.
 */
import {forkGameState} from "./engine/fork-state.js";
import {sessionActions,submitDecision} from "./engine/decision-session.js";
import {randomSource} from "./engine/random.js";

const mix=n=>{
 n=(n+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const snapshot=session=>({
 ...session,
 state:forkGameState(session.state),
 history:[],
 remainingReturns:[...session.remainingReturns],
 pendingNested:session.pendingNested?{
  ...session.pendingNested,
  responses:[...session.pendingNested.responses],
  actions:session.pendingNested.actions.map(a=>({...a}))
 }:null
});
const submit=(s,a)=>submitDecision(s,a,{
 observeResult:false,recordHistory:false
});
const combatPhases=new Set(["combat-hero","combat","parley"]);
const terminal=s=>s.phase==="terminal"||
 (s.phase==="between-rooms"&&!s.state.monster&&
 s.state.monsterQueue.length===0);
/**
 * Resolve forced player reaction/response phases before evaluating a node.
 * Suspended canonical dice are kept as-is; no resampling within replay.
 */
const forcedChoice=s=>{
 const actions=sessionActions(s);
 if(!actions.length)throw Error("No canonical action in sampled encounter");
 if(s.pendingNested){
  const trigger=s.pendingNested.trigger?.phase;
  if(trigger==="hero-trigger"){
   const steady=actions.find(a=>a.kind==="hero-mode"&&a.mode==="steady");
   if(steady)return steady;
  }
  return actions.find(a=>
   ["skip","save","keep","accept"].includes(a.kind)||
   ["save","keep","accept"].includes(a.mode))??actions[0];
 }
 return actions.find(a=>a.kind==="leave")??
  actions.find(a=>a.kind==="respond")??actions[0];
};
function settle(session,maxSteps){
 let steps=0;
 while(!terminal(session)&&!(!session.pendingNested&&
  combatPhases.has(session.phase))){
  if(++steps>maxSteps)throw Error("Sampled expectimax settle limit");
  submit(session,forcedChoice(session));
 }
 if(session.state.metrics.roundLimit||session.state.metrics.unresolved)
  throw Error("Sampled expectimax unresolved canonical encounter");
}
/** Local state evaluator. Public features only; never inspect hidden deck. */
export function combatLeafValue(s){
 const game=s.state;
 if(game.metrics.roundLimit||game.metrics.unresolved)
  throw Error("Cannot score a truncated canonical state");
 const party=game.heroes;
 const living=party.filter(h=>h.hp>0);
 if(!living.length)return -1200;
 // Clear has precedence over remaining HP; unfinished encounters receive
 // an explicit liability for active/queued Monsters (including Elbereth).
 const cleared=s.phase==="between-rooms"&&!game.monster&&
  game.monsterQueue.length===0;
 let value=cleared?400:0;
 for(const h of party){
  value+=h.hp>0?8*h.hp/h.card.hp:-340;
  if(h.hp>0&&h.poison)value-=14;
 }
 value-=game.monster?65*Math.max(0,game.monsterHP)/Math.max(1,game.monster.hp):0;
 value-=game.monsterQueue.length*80;
 value+=party.reduce((a,h)=>a+h.inventory.length,0)*2;
 return value;
}
const choices=s=>{
 const legal=sessionActions(s);
 if(s.phase==="combat-hero")
  return legal.filter(a=>a.kind==="choose-hero-turn");
 if(s.phase==="parley")
  return legal.filter(a=>a.kind==="fight"||a.kind==="parley");
 if(s.phase!=="combat")return [];
 const attack=legal.filter(a=>a.kind==="attack");
 return [...attack,...legal.filter(a=>a.kind!=="attack")].slice(0,8);
};
function lookahead(s,depth,seed,samples,maxSteps){
 if(terminal(s))return combatLeafValue(s);
 if(!combatPhases.has(s.phase))
  throw Error("Expectimax reached a noncombat leaf at "+s.phase);
 if(depth<=0)return combatLeafValue(s);
 const actions=choices(s);
 if(!actions.length)throw Error("No canonical combat candidates");
 // A Hero selection is a zero-ply deterministic choice; the subsequent
 // actual combat action is searched under the same depth budget.
 if(s.phase==="combat-hero"){
  return Math.max(...actions.map(action=>{
   const next=snapshot(s);
   submit(next,action);
   settle(next,maxSteps);
   return lookahead(next,depth,mix(seed^Math.imul(action.heroIndex+1,919)),samples,maxSteps);
  }));
 }
 let best=-Infinity;
 for(const action of actions){
  let total=0;
  for(let j=0;j<samples;j++){
   const fork=snapshot(s);
   fork.state.rng=randomSource(mix(seed^Math.imul(j+1,0x85ebca6b)));
   submit(fork,action);
   settle(fork,maxSteps);
   total+=lookahead(fork,depth-1,
    mix(seed^Math.imul(j+1,0xc2b2ae35)),samples,maxSteps);
  }
  best=Math.max(best,total/samples);
 }
 return best;
}
/**
 * Chooses a single legal action; never mutates the real rollout session.
 * Default settings are deliberately small because a full MCTS expedition
 * can enter many fights. A/B comparisons must use matched CPU budgets.
 */
export function sampledCombatRolloutAction(session,{
 samples=2,ply=2,seed=1,maxSteps=80
}={}){
 if(!Number.isInteger(samples)||samples<1||samples>6||
  !Number.isInteger(ply)||ply<1||ply>3||
  !Number.isInteger(maxSteps)||maxSteps<1||maxSteps>1000)
  throw Error("Invalid sampled combat rollout budget");
 if(session.pendingNested||!combatPhases.has(session.phase))return null;
 const legal=choices(session);
 if(legal.length<=1)return legal[0]??null;
 let best=legal[0],bestScore=-Infinity;
 // Pair identical chance streams across root alternatives.
 const rootSeed=mix(seed);
 for(const action of legal){
  const fork=snapshot(session);
  // Root Hero selection has no dice: evaluate the next full Hero action
  // with the same remaining ply budget. For actual combat/Parley we need
  // an expectation over sampled chance outcomes.
  let score=0;
  if(session.phase==="combat-hero"){
   submit(fork,action);
   settle(fork,maxSteps);
   score=lookahead(fork,ply,rootSeed,samples,maxSteps);
  }else{
   for(let j=0;j<samples;j++){
    const trial=snapshot(session);
    trial.state.rng=randomSource(mix(rootSeed^Math.imul(j+1,0x85ebca6b)));
    submit(trial,action);
    settle(trial,maxSteps);
    score+=lookahead(trial,ply-1,
     mix(rootSeed^Math.imul(j+1,0xc2b2ae35)),samples,maxSteps);
   }
   score/=samples;
  }
  if(score>bestScore+1e-9){bestScore=score;best=action;}
 }
 return best;
}
