/**
 * Compact independent paired-seed comparisons for MCTS diagnosis.
 *
 * Only matched initial seeds are paired. The two comparisons deliberately
 * share full16 to avoid a fourth expensive full expedition per source:
 *   full16 vs frontier16 (tree algorithm, equal rollout allocation);
 *   classic2 vs full16 (search budget, same tree algorithm).
 */
import {pairedAgentStatistics} from "./mcts-paired-statistics.js";

export const MCTS_DIAGNOSTIC_ARMS=Object.freeze([
 {id:"classic2",budget:2,treeMode:"full"},
 {id:"classic16",budget:16,treeMode:"full"},
 {id:"frontier16",budget:16,treeMode:"frontier"}
]);
export const MCTS_DIAGNOSTIC_COMPARISONS=Object.freeze([
 {id:"tree-16",baseline:"classic16",candidate:"frontier16",
  question:"Full vs frontier UCT at the same visit budget"},
 {id:"budget-full",baseline:"classic2",candidate:"classic16",
  question:"Does a larger budget improve full-tree MCTS?"},
 {id:"old-vs-deep",baseline:"classic2",candidate:"frontier16",
  question:"Descriptive old-vs-deeper search comparison (budget and tree both differ)"}
]);
const kindGroup=(phase,firstKind,secondKind)=>{
 if(!phase)return "unknown";
 if(["equip","unequip","transfer"].includes(firstKind)||
    ["equip","unequip","transfer"].includes(secondKind))return "equipment";
 if(phase.startsWith("reaction:"))return "printed-reaction";
 if(phase==="room"||phase==="retained-entry")return "room-choice";
 if(phase.startsWith("combat")||phase==="monster-response"||
    phase==="corpse"||phase==="parley")return "combat-or-monster";
 if(["between-rooms","explore"].includes(phase))return "progression";
 if(["vault","post-warden"].includes(phase))return "vault";
 return "other";
};
/**
 * Since both expeditions have the same initial game seed and search never
 * consumes ACTUAL future dice, their canonical game states are identical
 * as long as the applied action prefix is identical.
 *
 * Once a decision diverges no later difference is causally attributable;
 * report ONLY the first split, not an invented card-level explanation.
 */
export function firstPolicyDivergence(left=[],right=[]){
 const n=Math.min(left.length,right.length);
 for(let i=0;i<n;i++){
  const a=left[i],b=right[i];
  if(a.step!==b.step||a.actionFingerprint!==b.actionFingerprint){
   return {step:i,phase:a.phase,category:kindGroup(a.phase,
    a.action?.kind,b.action?.kind),
    roomId:a.roomId??null,monsterId:a.monsterId??null,
    heroHp:a.heroHp,
    baselineAction:a.action,candidateAction:b.action,
    baselineResources:a.resources,candidateResources:b.resources,
    prefixLength:i,trustworthySameState:a.step===b.step&&
     a.phase===b.phase&&a.roomId===b.roomId&&
     a.monsterId===b.monsterId};
  }
 }
 if(left.length!==right.length)return {
  step:n,phase:null,category:"trace-exhausted",
  prefixLength:n,trustworthySameState:false
 };
 return null;
}
const orderedRows=rows=>[...rows].sort((a,b)=>a.i-b.i);
export function summarizeMctsDiagnostics(records,{maxExamples=12}={}){
 const rows=orderedRows(records);
 const comparisons={};
 for(const contrast of MCTS_DIAGNOSTIC_COMPARISONS){
  const paired=rows.map(row=>({
   i:row.i,baseline:row.agents[contrast.baseline],
   candidate:row.agents[contrast.candidate]
  }));
  const stats=pairedAgentStatistics(paired);
  const lossesByFirstPhase={},lossExamples=[];
  let traceCensored=0;
  for(const row of rows){
   const old=row.agents[contrast.baseline],fresh=row.agents[contrast.candidate];
   if(old.won!==1||fresh.won!==0)continue;
   const mismatch=firstPolicyDivergence(old.trace,fresh.trace);
   const category=mismatch?.category??"no-observed-decision-split";
   lossesByFirstPhase[category]=(lossesByFirstPhase[category]||0)+1;
   if(!mismatch||!mismatch.trustworthySameState)traceCensored++;
   if(lossExamples.length<maxExamples)lossExamples.push({
    sourceIndex:row.i,gameSeed:row.gameSeed,
    heroes:row.heroes,firstDivergence:mismatch
   });
  }
  comparisons[contrast.id]={
   question:contrast.question,
   baselineAgent:contrast.baseline,candidateAgent:contrast.candidate,
   ...stats,
   lossesByFirstDecisionCategory:lossesByFirstPhase,
   traceCensored,lossExamples,
   // There are two preplanned contrasts; do not treat p<0.05 on either
   // as confirmatory familywise evidence without adjustment.
   exploratoryBonferroniP:stats.exactMcNemarP===null?
    null:Math.min(1,stats.exactMcNemarP*3)
  };
 }
 return comparisons;
}
