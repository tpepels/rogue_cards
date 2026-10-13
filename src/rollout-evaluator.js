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
import {forkExpeditionState} from "./rollout-state.js";
import {rolloutRoomContinuation,rolloutCombatContinuation}
 from "./expedition-campaign.js";
import {planRoom,planCombat} from "./decision-planner.js";
import {itemOptions} from "./item-access.js";

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
 if(result.complete&&result.won)return 1;
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
function summarize(values){
 const n=values.length,mean=values.reduce((sum,v)=>sum+v,0)/n;
 const variance=n>1?values.reduce((sum,v)=>sum+(v-mean)**2,0)/(n-1):0;
 return {mean,sd:Math.sqrt(variance),samples:n};
}
export function pairedRoomRollouts(s,legal){
 const choices=[0,1].filter(i=>legal[i]);
 if(!choices.length)throw Error("No legal Room option");
 if(choices.length===1)return {choice:choices[0],scores:
  [legal[0]?0:-Infinity,legal[1]?0:-Infinity],samples:0};
 const n=s.agentConfig.budget;
 const values=choices.map(()=>[]);
 const origin=snapshot(s);
 s.agentDecisionSerial=(s.agentDecisionSerial||0)+1;
 for(let k=0;k<n;k++){
  const seeds=scenarioSeed(s,"room",k);
  for(const [j,choice] of choices.entries()){
   const fork=forkExpeditionState(s,{...seeds,
    knowledge:s.agentConfig.knowledge});
   const result=rolloutRoomContinuation(fork,choice,{
    depth:s.agentConfig.rolloutRooms});
   values[j].push(value(fork,result,origin));
  }
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
 const eligible=itemOptions(s,h,"combat");
 if(!eligible.length)return planCombat(s,h);
 const actions=[{action:"attack"},...eligible.map((_,i)=>({
  action:"item",itemIndex:i
 }))];
 const n=s.agentConfig.budget;
 const index=s.heroes.indexOf(h);
 if(index<0)throw Error("Unknown acting Hero");
 const origin=snapshot(s),values=actions.map(()=>[]);
 s.agentDecisionSerial=(s.agentDecisionSerial||0)+1;
 for(let k=0;k<n;k++){
  const seeds=scenarioSeed(s,"combat",k);
  for(let i=0;i<actions.length;i++){
   const fork=forkExpeditionState(s,{...seeds,
    knowledge:s.agentConfig.knowledge});
   const result=rolloutCombatContinuation(fork,index,actions[i],{
    maxHeroActions:s.agentConfig.combatActions,
    roomDepth:s.agentConfig.combatRoomDepth});
   values[i].push(value(fork,result,origin));
  }
 }
 const means=values.map(v=>summarize(v).mean);
 const prior=planCombat(s,h);
 // Avoid noise-generated Item spending: favor the ordinary planner in a
 // tie, but never invalidate the actual sampled outcome comparison.
 let best=0;
 for(let i=1;i<actions.length;i++)
  if(means[i]>means[best]+1e-9)best=i;
 const baselineIndex=prior.action==="item"?eligible.findIndex(o=>
  o.card===prior.card&&o.mode===prior.mode)+1:0;
 if(baselineIndex>=0&&Math.abs(means[baselineIndex]-means[best])<1e-6)
  best=baselineIndex;
 if(best===0)return {action:"attack",score:means[0],
  attackScore:means[0],options:eligible.length,legal:eligible,
  reason:"full_effect_combat_rollout",samples:n};
 return {action:"item",card:eligible[best-1].card,
  mode:eligible[best-1].mode,score:means[best],attackScore:means[0],
  options:eligible.length,legal:eligible,
  reason:"full_effect_combat_rollout",samples:n};
}
