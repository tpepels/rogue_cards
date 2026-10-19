/**
 * Optional, public-information MCTS action-selection experiments.
 * Keep the default UCT path in session-mcts.js unchanged.
 * No game state, hidden deck, legal action, or canonical rule is modified.
 */
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
 implicitWeight=0,implicitExploitation=null
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
  const prior=puctPrior(candidate.id,preferredId,totalLegalActions);
  const score=q+c*totalLegalActions*prior*Math.sqrt(n)/(1+edge.visits);
  if(score>best+1e-12){best=score;tied=[candidate];}
  else if(Math.abs(score-best)<=1e-12)tied.push(candidate);
 }
 return rng.choose(tied);
}
