/**
 * Implicit value channel for single-agent stochastic Rogue Cards UCT.
 *
 * Original implicit minimax backups maintain heuristic and MC estimates
 * separately. Here all Hero actions maximize a shared objective and chance
 * outcomes are averaged, so this is an implicit MAX / expectation backup.
 * It is NOT a Q/RB quality-based reward added to terminal rollouts.
 */
export function implicitExpeditionHeuristic(session){
 const s=session.state;
 if(session.phase==="terminal")
  return s.metrics.won?1:0;
 if(!s.alive())return 0;
 const living=s.heroes.filter(h=>h.hp>0);
 const livingRate=living.length/s.heroes.length;
 const hpRate=s.heroes.reduce((v,h)=>v+
  Math.max(0,h.hp)/Math.max(1,h.card.hp),0)/s.heroes.length;
 // Count only public recorded progress, never inspect shuffled Rooms.
 const cleared=Number(s.metrics.cleared||0);
 // roomGoal is PER stage (UPPER/MIDDLE/DEEP), not the expedition total.
 // Three ordinary stages precede the Vault. Avoid reaching 100% progress
 // after completing just the first stage.
 const goal=Math.max(1,3*Number(s.roomGoal||3));
 const progress=Math.max(0,Math.min(1,cleared/goal));
 const statusPenalty=living.filter(h=>h.poison).length/s.heroes.length;
 // A combat-specific signal matters in *implicit* backups: the previous
 // heuristic assigned nearly the same value to a healthy Monster and
 // one at 1 HP. That deprived alpha of any useful tactical gradient.
 // Monster information is public after the encounter begins. We never
 // peek at unknown cards or future dice.
 const active=s.monster;
 const monsterProgress=active?
  1-Math.max(0,s.monsterHP)/Math.max(1,active.hp):1;
 const queued=Math.min(3,s.monsterQueue.length);
 const activeThreat=active?0.07*(1-monsterProgress)+0.025*queued:0;
 const itemResources=Math.min(1,
  s.heroes.reduce((n,h)=>n+h.inventory.length,0)/(3*s.heroes.length));
 // Normalize into the same [0,1] support as terminal 0/1 returns.
 return Math.max(0,Math.min(1,
  0.30*livingRate+0.28*hpRate+0.22*progress+
  0.13*monsterProgress+0.07*itemResources-
  0.05*statusPenalty-activeThreat));
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
