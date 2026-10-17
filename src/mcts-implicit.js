/**
 * Implicit value channel for single-agent stochastic Rogue Cards UCT.
 *
 * Original implicit minimax backups maintain heuristic and MC estimates
 * separately. Here all Hero actions maximize a shared objective and chance
 * outcomes are averaged, so this is an implicit MAX / expectation backup.
 * It is NOT a Q/RB quality-based reward added to terminal rollouts.
 */
/**
 * Explain every term of the actual implicit evaluation used by UCT.
 * Numeric components are raw contributions before [0,1] clipping.
 * No roll, hidden deck card or future RNG is inspected.
 */
export function implicitHeuristicBreakdown(session){
 const s=session.state;
 if(session.phase==="terminal"||!s.alive()){
  const value=Number(session.phase==="terminal"&&!!s.metrics.won);
  return {terminal:true,value,unclipped:value,terms:{},
   variables:{phase:session.phase,won:!!s.metrics.won,
    alive:s.alive()}};
 }
 const party=s.heroes;
 const living=party.filter(h=>h.hp>0);
 const livingRate=living.length/party.length;
 const hpRate=party.reduce((v,h)=>v+
  Math.max(0,h.hp)/Math.max(1,h.card.hp),0)/party.length;
 // roomGoal counts Rooms PER stage, not per expedition.
 const cleared=Number(s.metrics.cleared||0);
 const goal=Math.max(1,3*Number(s.roomGoal||3));
 const progress=Math.max(0,Math.min(1,cleared/goal));
 const statusPenalty=living.filter(h=>h.poison).length/party.length;
 const active=s.monster;
 const monsterProgress=active?
  1-Math.max(0,s.monsterHP)/Math.max(1,active.hp):1;
 const queued=Math.min(3,s.monsterQueue.length);
 const activeThreat=active?0.07*(1-monsterProgress)+0.025*queued:0;
 const itemResources=Math.min(1,
  party.reduce((n,h)=>n+h.inventory.length,0)/(3*party.length));
 let actorSignal=0,actorHit=null,actorMonsterHit=null;
 if(active&&session.phase==="combat"&&session.heroIndex>=0){
  const h=party[session.heroIndex];
  if(h?.hp>0){
   const stat=s.stats(h);
   // Approximates unmodified natural d20 chance; combat rules and
   // ADV/DIS/Items/hero powers can differ considerably.
   const chance=(atk,def)=>Math.max(1,Math.min(19,
    21-(12+def-atk)))/20;
   actorHit=chance(stat.atk,active.def);
   actorMonsterHit=chance(active.atk,stat.def);
   const hpSafety=Math.max(0,Math.min(1,h.hp/h.card.hp));
   actorSignal=0.035*(actorHit-.5)-
    0.035*actorMonsterHit*(1-hpSafety);
  }
 }
 const terms={
  living:0.30*livingRate,
  remainingHP:0.28*hpRate,
  stageProgress:0.22*progress,
  monsterDamage:0.13*monsterProgress,
  items:0.07*itemResources,
  poison:-0.05*statusPenalty,
  activeMonsterAndQueue:-activeThreat,
  actorSelection:actorSignal
 };
 const unclipped=Object.values(terms).reduce((n,v)=>n+v,0);
 return {
  terminal:false,
  value:Math.max(0,Math.min(1,unclipped)),unclipped,terms,
  variables:{phase:session.phase,livingRate,hpRate,cleared,goal,
   progress,poisonRate:statusPenalty,monsterId:active?.id??null,
   monsterHP:s.monsterHP,monsterProgress,queued,itemResources,
   actorIndex:session.heroIndex,actorHit,actorMonsterHit}
 };
}
export function implicitExpeditionHeuristic(session){
 return implicitHeuristicBreakdown(session).value;
}
export function implicitSelectedMean(edge){
 return edge.implicitVisits?edge.implicitSum/edge.implicitVisits:0.5;
}
export function implicitUCTExploitation(edge,weight){
 if(!(weight>=0&&weight<=1))throw Error("Invalid implicit UCT weight");
 if(!edge.visits)return 0;
 return (1-weight)*edge.wins/edge.visits+
  weight*implicitSelectedMean(edge);
}
/**
 * Back up a statically evaluated frontier node to its ancestors.
 * Each edge stores running sampled values; the parent stores the MAX over
 * its explored children. No minimization over chance outcomes: the RNG
 * contributes an expectation, while Heroes share a cooperative objective.
 */
export function backupImplicit(path,leafValue){
 if(!Number.isFinite(leafValue)||leafValue<0||leafValue>1)
  throw Error("Implicit value must be normalized to [0,1]");
 let value=leafValue;
 for(let i=path.length-1;i>=0;i--){
  const {edge,node}=path[i];
  edge.implicitVisits=(edge.implicitVisits||0)+1;
  edge.implicitSum=(edge.implicitSum||0)+value;
  let maximum=-Infinity;
  for(const child of node.edges.values()){
   if(child.implicitVisits)
    maximum=Math.max(maximum,implicitSelectedMean(child));
  }
  if(!Number.isFinite(maximum))throw Error("Missing backed-up implicit child");
  node.implicitValue=maximum;
  value=maximum;
 }
 return value;
}
