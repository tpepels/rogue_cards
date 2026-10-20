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

/**
 * Calibratable progressive widening. Action order controls WHICH moves
 * are admitted, while k/alpha control HOW MANY. The default arguments
 * deliberately preserve the archived A/B/C/D experiment.
 *
 * Nodes can be encountered with a different current legal-action set after
 * fair hidden-state sampling. Drop now-illegal IDs, append newly legal IDs,
 * and never return an empty active set when legal actions are present.
 */
export function progressivelyWiden(node,candidates,rng,{
 preferredId=null,prioritized=false,priorWeights=null,k=2,alpha=0.55,
 order=null
}={}){
 if(!Number.isFinite(k)||k<1||!Number.isFinite(alpha)||
   alpha<=0||alpha>1)throw Error("Invalid progressive widening parameters");
 const ordering=order??(prioritized?(priorWeights?"public-prior":"soft-first"):"random");
 if(!["random","soft-first","public-prior"].includes(ordering))
   throw Error("Invalid progressive widening ordering");
 if(ordering==="public-prior"&&!(priorWeights instanceof Map))
   throw Error("Public-prior widening requires public prior weights");
 if(candidates.length<=3)return candidates;
 const makeOrder=list=>{
  const result=rng.shuffle(list).map(c=>c.id);
  if(ordering==="public-prior")
   result.sort((a,b)=>(priorWeights.get(b)??0)-(priorWeights.get(a)??0));
  if((ordering==="soft-first"||(order===null&&prioritized))&&preferredId){
   const index=result.indexOf(preferredId);
   if(index>=0){result.splice(index,1);result.unshift(preferredId);}
  }
  return result;
 };
 const current=new Set(candidates.map(c=>c.id));
 if(!node.wideningOrder)node.wideningOrder=makeOrder(candidates);
 else{
  const kept=node.wideningOrder.filter(id=>current.has(id));
  const known=new Set(kept);
  const newlyLegal=candidates.filter(c=>!known.has(c.id));
  node.wideningOrder=[...kept,...makeOrder(newlyLegal)];
 }
 const cap=Math.max(1,Math.min(candidates.length,
  Math.ceil(k*Math.pow(node.visits+1,alpha))));
 if(cap>=candidates.length)return candidates;
 const allowed=new Set(node.wideningOrder.slice(0,cap));
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
