/**
 * Optional, public-information MCTS action-selection experiments.
 * Keep the default UCT path in session-mcts.js unchanged.
 * No game state, hidden deck, legal action, or canonical rule is modified.
 */
import {ROOM_EFFECTS} from "./room-effect-model.js";

export const MCTS_SEARCH_ARMS=Object.freeze([
 Object.freeze({id:"baseline",nodePriors:false,progressiveWidening:false}),
 Object.freeze({id:"priors",nodePriors:true,progressiveWidening:false}),
 Object.freeze({id:"widening",nodePriors:false,progressiveWidening:true}),
 Object.freeze({id:"combined",nodePriors:true,progressiveWidening:true})
]);

export function puctPrior(candidateId,preferredId,total){
 if(total<1)throw Error("PUCT requires a nonempty legal action set");
 // Existing soft pragmatic preference is only a public-information hint.
 // The preferred move gets three times the weight of each alternative.
 if(!preferredId||total===1)return 1/total;
 return (candidateId===preferredId?3:1)/(total+2);
}

/**
 * Prior over *all* currently legal public actions. Biases are deliberately
 * small, explicit, and do not consult future dice, private piles or outcomes.
 * Unlike pragmaticSoloPreference, this covers healing / Room decisions too.
 * These are test-policy hints, NOT additional card effects or hard actions.
 */
export function publicActionPriors(session,candidates,preferredId=null){
 const s=session.state,h=s.heroes[session.heroIndex>=0?
  session.heroIndex:0];
 const hp=h?.hp??0,maxHp=Math.max(1,h?.card.hp??1),
  missing=Math.max(0,maxHp-hp),fraction=missing/maxHp;
 const room=s.room,roomEffects=room?
  (s.cardPools?.roomEffects?.[room.id]??ROOM_EFFECTS[room.id]):null;
 const weights=new Map();
 for(const candidate of candidates){
  const a=candidate.action,id=candidate.id;
  let weight=1;
  if(a.kind==="item-trigger"&&a.mode==="healing-tool")
   weight=missing<2?0.35:1+2.0*fraction;
  else if(a.kind==="item-trigger"&&a.mode==="drink")
   weight=missing<2?0.7:1+0.45*fraction;
  else if(a.kind==="shrine-item"&&a.mode==="heal")
   weight=missing<2?0.4:1+1.5*fraction;
  else if(a.kind==="room-choice"&&roomEffects){
   const ops=roomEffects.choices[a.index]??[];
   if(ops.some(op=>/^HEAL(?::|$)/.test(op)))
    weight=missing<2?0.55:1+1.2*fraction;
   if(ops.some(op=>/^COST:/.test(op)))
    weight*=0.8;
  }else if(session.phase==="combat"&&a.kind==="attack"&&hp>2)
   weight=1.3;
  else if(session.phase==="combat"&&a.kind==="pass"&&hp>2)
   weight=0.55;
  if(id===preferredId)weight*=3;
  weights.set(id,weight);
 }
 const sum=[...weights.values()].reduce((n,x)=>n+x,0);
 if(!(sum>0))throw Error("Invalid public-action prior normalization");
 for(const [id,weight] of weights)
  weights.set(id,weight/sum);
 const mass=[...weights.values()];
 return {weights,nonUniform:Math.max(...mass)-Math.min(...mass)>1e-10};
}

export function progressivelyWiden(node,candidates,rng,{
 preferredId=null,prioritized=false,k=2,alpha=0.55
}={}){
 if(candidates.length<=3)return candidates;
 if(!Number.isFinite(k)||k<1||!Number.isFinite(alpha)||
    alpha<=0||alpha>1)throw Error("Invalid progressive widening parameters");
 if(!node.wideningOrder){
  const ordered=rng.shuffle(candidates).map(c=>c.id);
  if(prioritized&&preferredId){
   const i=ordered.indexOf(preferredId);
   if(i>=0){ordered.splice(i,1);ordered.unshift(preferredId);}
  }
  node.wideningOrder=ordered;
 }
 const cap=Math.max(1,Math.min(candidates.length,
  Math.ceil(k*Math.pow(node.visits+1,alpha))));
 if(cap>=candidates.length)return candidates;
 const allowed=new Set(node.wideningOrder.slice(0,cap));
 // Preserve canonical candidate array order for stable equality and traces.
 return candidates.filter(c=>allowed.has(c.id));
}

export function selectPUCT(node,candidates,rng,c,{
 preferredId=null,totalLegalActions=candidates.length,
 implicitWeight=0,implicitExploitation=null,priorWeights=null
}={}){
 if(!candidates.length)throw Error("PUCT has no active candidates");
 if(!Number.isFinite(c)||c<0)throw Error("Invalid PUCT exploration constant");
 const n=Math.max(1,node.visits);
 let best=-Infinity,tied=[];
 for(const candidate of candidates){
  const edge=candidate.edge;
  const q=edge.visits>0?
   (implicitWeight&&implicitExploitation?
    implicitExploitation(edge,implicitWeight):edge.wins/edge.visits):0.5;
  // Multiplying by action count retains a comparable exploration scale
  // when a large action set's uniform P would otherwise be tiny.
  const prior=priorWeights?.get(candidate.id)??
   puctPrior(candidate.id,preferredId,totalLegalActions);
  const score=q+c*totalLegalActions*prior*Math.sqrt(n)/(1+edge.visits);
  if(score>best+1e-12){best=score;tied=[candidate];}
  else if(Math.abs(score-best)<=1e-12)tied.push(candidate);
 }
 return rng.choose(tied);
}
