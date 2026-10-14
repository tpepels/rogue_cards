/**
 * Matched-scenario stochastic lookahead using REAL full-effect actions.
 *
 * Evaluation does not inspect future real dice. Each alternative receives
 * identical independently sampled dice/deck seeds. Fair state forks resample
 * unknown piles from public information; Oracle state forks keep real order.
 *
 * Horizon: current Room + configurable subsequent Rooms; combat up to N hero
 * actions, then optional next Room. Truncated states receive a transparent
 * nonterminal heuristic; this is not exact full-expedition expectimax.
 */
import {forkExpeditionState,sampleRolloutDecks,prepareRolloutDecks} from "./rollout-state.js";
import {rolloutRoomContinuation,rolloutCombatContinuation,
 rolloutParleyContinuation,rolloutVaultContinuation,
 rolloutEndingContinuation} from "./expedition-campaign.js";
import {planRoom,planCombat} from "./decision-planner.js";
import {itemOptions} from "./item-access.js";
import {legalActions} from "./engine/index.js";

const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=x=>{let v=(x+0x9e3779b9)>>>0;
 v=Math.imul(v^(v>>>16),0x85ebca6b);
 v=Math.imul(v^(v>>>13),0xc2b2ae35);
 return (v^(v>>>16))>>>0;};
const hash=str=>{let h=2166136261;
 for(const c of str)h=Math.imul(h^c.charCodeAt(0),16777619);
 return h>>>0;
};
function scenarioSeed(s,kind,n){
 const tag=[kind,s.room?.id||"vault",s.monster?.id||"none",
  s.metrics.cleared,s.metrics.rounds,s.agentDecisionSerial||0,n].join(":");
 const root=mix(s.agentConfig.samplingSeed^hash(tag));
 return {diceSeed:mix(root^0xc6e4ab31),deckSeed:mix(root^0x517cc1b7)};
}
function value(s,result,origin){
 // Do not assign heuristic credit to a completed loss or empty-handed exit.
 if(result.complete)return result.won?1:0;
 if(!s.alive()||s.metrics.roundLimit||s.metrics.unresolved)return 0;
 const max=s.heroes.reduce((n,h)=>n+h.card.hp,0);
 const hp=s.heroes.reduce((n,h)=>n+Math.max(0,h.hp),0);
 const hpFraction=hp/Math.max(1,max);
 const poisoned=s.heroes.filter(h=>h.hp>0&&h.poison).length;
 const inventory=s.heroes.reduce((n,h)=>n+h.inventory.length,0);
 const magic=s.heroes.reduce((n,h)=>n+
  h.inventory.filter(c=>c.v2.tags.includes("MAGIC")).length,0);
 const sealCost=s.heroes.length===2?6:3;
 const progress=Math.max(0,s.metrics.cleared-origin.cleared);
 const monster=s.monster?.hp?clamp(s.monsterHP/s.monster.hp,0,1):0;
 const currentBattle=s.monster?1-monster:1;
 const w=s.agentConfig?.weights||{};
 // Anchored in exact simulated changes to HP, items, action resolution
 // and future progress, not a fabricated full-game victory prediction.
 const health=hpFraction*(w.damage??1);
 const riskPenalty=hpFraction<.27?(w.death??1)*.12:0;
 const resource=(inventory-origin.inventory)*.015*(w.resource??1);
 const magicPremium=Math.min(magic,sealCost)*.009*(w.spell??1);
 const battle=currentBattle*.06;
 const position=Math.min(3,progress)*.018;
 const lowHp=poisoned*.018;
 return clamp(.17+health*.47+resource+magicPremium+battle+position-
  riskPenalty-lowHp,0,.98);
}
function snapshot(s){
 return {cleared:s.metrics.cleared,
  inventory:s.heroes.reduce((n,h)=>n+h.inventory.length,0)};
}
/** Sample hidden decks ONCE, but clone the ORIGINAL (smaller) expedition
 * state per alternative. Copy sampled pile arrays into each fork: mutations
 * never leak between actions, and dice start at the identical scenario seed.
 *
 * Compared with cloning an already-forked state, this avoids copying the
 * additional sampled-deck structures into each action branch.
 */
function evaluateSampledAlternatives(s,choices,seeds,blueprint,assess){
 const knowledge=s.agentConfig.knowledge;
 const sampledDecks=sampleRolloutDecks(s,{
  knowledge,deckSeed:seeds.deckSeed,blueprint});
 for(let i=0;i<choices.length;i++){
  const fork=forkExpeditionState(s,{...seeds,
   knowledge,blueprint,sampledDecks});
  assess(fork,choices[i],i);
 }
}
function noteScenario(source,fork,result,kind,nestedBefore){
 const audit=source.metrics.rolloutAudit??={
  roomBranches:0,combatBranches:0,otherDecisionBranches:0,
  terminalBranches:0,
  nonterminalBranches:0,terminalWins:0,futureReplannedBranches:0
 };
 audit[kind==="room"?"roomBranches":kind==="combat"?
  "combatBranches":"otherDecisionBranches"]++;
 if(result.complete){
  audit.terminalBranches++;
  audit.terminalWins+=Number(!!result.won);
 }else{
  audit.nonterminalBranches++;
  if(source.agentConfig.strictTerminal)
   throw Error("Nonterminal "+kind+" branch in strict terminal rollout: "+
    (source.room?.id||"unknown")+"/"+(source.monster?.id||"none"));
 }
 audit.futureReplannedBranches+=Math.max(0,
  (fork.metrics.rolloutAudit?.roomBranches||0)+
  (fork.metrics.rolloutAudit?.combatBranches||0)+
  (fork.metrics.rolloutAudit?.otherDecisionBranches||0)-nestedBefore);
}
function summarize(values){
 const n=values.length,mean=values.reduce((sum,v)=>sum+v,0)/n;
 const variance=n>1?values.reduce((sum,v)=>sum+(v-mean)**2,0)/(n-1):0;
 return {mean,sd:Math.sqrt(variance),samples:n};
}
export function pairedRoomRollouts(s,legal){
 const canonical=legalActions(s,{phase:"room"}).map(a=>a.index);
 const choices=[0,1].filter(i=>legal[i]&&canonical.includes(i));
 if(!choices.length)throw Error("No legal Room option");
 if(canonical.some(i=>!legal[i])||[0,1].some(i=>legal[i]&&!canonical.includes(i)))
  throw Error("Canonical Room legality disagrees with expedition runner: "+s.room.id);
 if(choices.length===1)return {choice:choices[0],scores:
  [legal[0]?0:-Infinity,legal[1]?0:-Infinity],samples:0};
 const n=s.agentConfig.budget;
 const values=choices.map(()=>[]);
 const origin=snapshot(s);
 const blueprint=prepareRolloutDecks(s,s.agentConfig.knowledge);
 s.agentDecisionSerial=(s.agentDecisionSerial||0)+1;
 for(let k=0;k<n;k++){
  const seeds=scenarioSeed(s,"room",k);
  evaluateSampledAlternatives(s,choices,seeds,blueprint,(fork,choice,j)=>{
   const before=(fork.metrics.rolloutAudit?.roomBranches||0)+
    (fork.metrics.rolloutAudit?.combatBranches||0);
   const result=rolloutRoomContinuation(fork,choice,{
    depth:s.agentConfig.rolloutRooms});
   noteScenario(s,fork,result,"room",before);
   values[j].push(value(fork,result,origin));
  });
 }
 const means=values.map(v=>summarize(v).mean);
 const scores=[legal[0]?means[choices.indexOf(0)]:-Infinity,
  legal[1]?means[choices.indexOf(1)]:-Infinity];
 const baseline=planRoom(s,legal);
 const choice=scores[1]>scores[0]?1:scores[0]>scores[1]?0:baseline.choice;
 return {choice,scores,samples:n,reason:"full_effect_room_rollout",
  margin:Math.abs(scores[1]-scores[0]),
  knowledge:s.agentConfig.knowledge};
}
export function pairedCombatRollouts(s,h){
 const index=s.heroes.indexOf(h);
 const legal=legalActions(s,{phase:"combat",heroIndex:index});
 const eligible=itemOptions(s,h,"combat");
 const actions=legal.map(a=>a.kind==="item"?
  {action:"item",itemIndex:a.optionIndex}:a.kind==="elbereth"?
  {action:"elbereth",mode:a.mode}:{action:"attack"});
 if(actions.length<2)return planCombat(s,h);
 const n=s.agentConfig.budget;
 if(index<0)throw Error("Unknown acting Hero");
 const origin=snapshot(s),values=actions.map(()=>[]);
 const blueprint=prepareRolloutDecks(s,s.agentConfig.knowledge);
 s.agentDecisionSerial=(s.agentDecisionSerial||0)+1;
 for(let k=0;k<n;k++){
  const seeds=scenarioSeed(s,"combat",k);
  evaluateSampledAlternatives(s,actions,seeds,blueprint,(fork,action,i)=>{
   const before=(fork.metrics.rolloutAudit?.roomBranches||0)+
    (fork.metrics.rolloutAudit?.combatBranches||0);
   const result=rolloutCombatContinuation(fork,index,action,{
    maxHeroActions:s.agentConfig.combatActions,
    roomDepth:s.agentConfig.combatRoomDepth});
   noteScenario(s,fork,result,"combat",before);
   values[i].push(value(fork,result,origin));
  });
 }
 const means=values.map(v=>summarize(v).mean);
 const prior=planCombat(s,h);
 // Avoid noise-generated Item spending: favor the ordinary planner in a
 // tie, but never invalidate the actual sampled outcome comparison.
 let best=0;
 for(let i=1;i<actions.length;i++)
  if(means[i]>means[best]+1e-9)best=i;
 const baselineIndex=prior.action==="item"?actions.findIndex(a=>
  a.action==="item"&&eligible[a.itemIndex]?.card===prior.card&&
  eligible[a.itemIndex]?.mode===prior.mode):0;
 if(baselineIndex>=0&&Math.abs(means[baselineIndex]-means[best])<1e-6)
  best=baselineIndex;
 if(actions[best].action==="attack")return {action:"attack",score:means[best],
  attackScore:means[0],options:actions.length,legal:eligible,
  reason:"full_effect_combat_rollout",samples:n};
 if(actions[best].action==="elbereth")return {action:"elbereth",
  mode:actions[best].mode,score:means[best],attackScore:means[0],
  options:actions.length,legal:eligible,
  reason:"full_effect_combat_rollout",samples:n};
 const picked=eligible[actions[best].itemIndex];
 return {action:"item",card:picked.card,mode:picked.mode,
  score:means[best],attackScore:means[0],
  options:actions.length,legal:eligible,
  reason:"full_effect_combat_rollout",samples:n};
}


/**
 * One canonical legal-action enumeration for PARLEY, Vault SEAL, or
 * post-Warden outcomes. Each sibling takes the same sampled decks/dice.
 * All continuations resolve real game mechanics to a terminal win/loss
 * when strictTerminal is enabled. Never score a fabricated shortcut.
 */
export function pairedPhaseRollouts(s,phase){
 if(!["parley","vault","post-warden"].includes(phase))
  throw Error("Not a searchable expedition decision phase: "+phase);
 const choices=legalActions(s,{phase});
 if(!choices.length)throw Error("No legal actions for "+phase);
 if(choices.length===1)return {action:choices[0],scores:[1],samples:0};
 const n=s.agentConfig.budget;
 if(!n)throw Error("Phase rollout needs a positive sampling budget");
 const values=choices.map(()=>[]),origin=snapshot(s);
 const blueprint=prepareRolloutDecks(s,s.agentConfig.knowledge);
 s.agentDecisionSerial=(s.agentDecisionSerial||0)+1;
 for(let k=0;k<n;k++){
  const seeds=scenarioSeed(s,phase,k);
  evaluateSampledAlternatives(s,choices,seeds,blueprint,(fork,action,i)=>{
   const r=phase==="parley"?
    rolloutParleyContinuation(fork,action.kind,{roomDepth:9}):
    phase==="vault"?rolloutVaultContinuation(fork,action.kind):
    rolloutEndingContinuation(fork,action.kind);
   noteScenario(s,fork,r,phase,0);
   values[i].push(value(fork,r,origin));
  });
 }
 const scores=values.map(x=>summarize(x).mean);
 let best=0;
 for(let i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;
 return {action:choices[best],actions:choices,scores,samples:n,
  knowledge:s.agentConfig.knowledge,reason:"canonical_terminal_"+phase};
}
