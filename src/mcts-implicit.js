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
export function implicitHeuristicBreakdown(session,mode="legacy"){
 if(!["legacy","solo-hp","solo-threat"].includes(mode))
  throw Error("Unknown implicit heuristic mode "+mode);
 const s=session.state;
 if(mode!=="legacy"&&s.heroes.length!==1)
  throw Error("Solo implicit heuristic requires exactly one Hero");
 if(session.phase==="terminal"||!s.alive()){
  // A solo wipe is always zero, even if a stale won flag were set.
  const value=Number(s.alive()&&session.phase==="terminal"&&!!s.metrics.won);
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
 if(mode!=="legacy"){
  // SOLO ONLY. A "living Heroes" ratio would be a constant 1 until the
  // terminal wipe. Instead, HP and current tactical exposure differentiate
  // surviving states; a dead Hero evaluates EXACTLY zero above.
  // Two published experimental arms differ ONLY in threat treatment.
  terms.living=0;
  terms.remainingHP=0.52*hpRate;
  terms.stageProgress=0.20*progress;
  terms.monsterDamage=0.12*monsterProgress;
  terms.items=0.08*itemResources;
  terms.poison=-0.12*statusPenalty;
  terms.actorSelection=0; // one Hero: no actor-choice signal
  terms.activeMonsterAndQueue=mode==="solo-threat"?
   -(active?(0.10+0.12*(1-hpRate))*(1-monsterProgress)+
      0.04*queued:0):0;
 }
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
export function implicitExpeditionHeuristic(session,mode="legacy"){
 return implicitHeuristicBreakdown(session,mode).value;
}
/**
 * The implicit channel on an action is the EXPECTATION of the already
 * recursively MAX-backed successor state values. Do NOT take the mean
 * of unbacked evaluation samples down the entire simulation path.
 */
export function implicitSelectedMean(edge){
 if(Number.isFinite(edge.implicitValue))return edge.implicitValue;
 return edge.implicitVisits?edge.implicitSum/edge.implicitVisits:0.5;
}
export function implicitUCTExploitation(edge,weight){
 if(!(weight>=0&&weight<=1))throw Error("Invalid implicit UCT weight");
 if(!edge.visits)return 0;
 return (1-weight)*edge.wins/edge.visits+
  weight*implicitSelectedMean(edge);
}
/**
 * Bottom-up implicit MAX / chance EXPECTATION backup.
 *
 * path[i+1].node is the *actual next searched state*, not an independent
 * raw heuristic sample. Its own value has already been backed up from all
 * its explored children. For stochastic outcomes, maintain one successor
 * bucket per observed child-node identity (or frontier public observation).
 * Child-node values REPLACE the previous backed value, and visit counts
 * estimate the occurrence probabilities of stochastic outcomes.
 *
 * Recomputes every edge and parent MAX on the selected ancestor path.
 * This avoids the former double averaging of already backed-up minimax
 * values into independent leaf-sample means.
 */
export function backupImplicit(path,leafValue,leafKey="frontier"){
 if(!Number.isFinite(leafValue)||leafValue<0||leafValue>1)
  throw Error("Implicit value must be normalized to [0,1]");
 if(!path.length)return leafValue;
 for(let i=path.length-1;i>=0;i--){
  const {node,edge}=path[i];
  const childNode=i+1<path.length?path[i+1].node:null;
  const successorKey=childNode??("leaf:"+leafKey);
  const value=childNode?childNode.implicitValue:leafValue;
  if(!Number.isFinite(value)||value<0||value>1)
   throw Error("Child node lacks a backed-up implicit value");
  const successors=edge.implicitSuccessors??=new Map();
  let bucket=successors.get(successorKey);
  if(!bucket){
   bucket={count:0,value,rawSum:0};
   successors.set(successorKey,bucket);
  }
  bucket.count++;
  if(childNode){
   // The recursive successor has its OWN minimax/MAX backup. Never
   // re-average its old backing into a running raw-leaf estimate.
   bucket.value=value;
  }else{
   bucket.rawSum+=value;
   bucket.value=bucket.rawSum/bucket.count;
  }
  edge.implicitVisits=(edge.implicitVisits||0)+1;
  edge.implicitSum=(edge.implicitSum||0)+value;
  let weighted=0,visits=0;
  for(const successor of successors.values()){
   weighted+=successor.count*successor.value;
   visits+=successor.count;
  }
  edge.implicitValue=weighted/visits;
  const children=[...node.edges.values()].filter(e=>
   Number.isFinite(e.implicitValue));
  if(!children.length)throw Error("Implicit node has no evaluated child");
  node.implicitValue=Math.max(...children.map(e=>e.implicitValue));
 }
 return path[0].node.implicitValue;
}
