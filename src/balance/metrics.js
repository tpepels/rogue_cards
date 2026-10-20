import {cloneMetrics,compactExperimentSnapshot} from "../experiment-telemetry.js";
import {healingOpportunitySources} from './healing-opportunities.js';

const actionCell=()=>({available:0,opportunities:0,selected:0,resolved:0});
const healingCell=()=>({attempts:0,offered:0,restored:0,wasted:0});
const add=(map,key,value)=>{map[key]=(map[key]??0)+value;};
const keyFor=(phase,action)=>phase+":"+action.kind;

/** Incremental aggregation of ACTUAL decision boundaries and committed
 * engine effects only. This never observes hypothetical MCTS states.
 * 'available' counts legal action records; 'opportunities' counts boundaries
 * offering a kind. 'resolved' counts selections whose root transaction has
 * committed, including its nested responses. Selected is not success.
 */
export function createTrialTelemetry(initialState){
 const initial=initialState.heroes.map(h=>({id:h.card.id,hp:h.hp}));
 const hpCap=initialState.heroes.reduce((n,h)=>n+h.card.hp,0);
 const actions={available:0,selected:0,resolved:0,pending:0,
  byPhase:{},byKind:{},bySource:{}};
 const pending=[];
 const opportunityCell=()=>({available:0,opportunities:0,selected:0,resolved:0,healingEvents:0,offered:0,restored:0,wasted:0});
 const healingOpportunities={total:opportunityCell(),bySource:{},byStage:{}};
 const healingCells=(source,stage)=>[healingOpportunities.total,
  healingOpportunities.bySource[source]??=opportunityCell(),healingOpportunities.byStage[stage]??=opportunityCell()];
 const damageBySource={},damageByStage={},damageByHero={},damageByContext={},damageByAttribution={};
 const healingByStageSource={},healingByHero={};
 const inventoryByStage={};
 const meaningful={};
 const alternative=action=>JSON.stringify({kind:action.kind,mode:action.mode,
  cardId:action.cardId,choice:action.kind==="room-choice"?action.index:undefined,
  heroIndex:["choose-hero-turn","equip","unequip","transfer"].includes(action.kind)?action.heroIndex:undefined,
  toHeroIndex:action.toHeroIndex,
  roomId:action.kind==="choose-room"?action.roomId:undefined});
 let ruleEvents=0,committedTransactions=0,vaultEntryHpFraction=null,unattributedHpEffects=0;
 const sourceFor=(state,action)=>{
  const h=state.heroes[action.heroIndex??0];
  const item=h?.inventory[action.index];
  if(action.cardId)return "item:"+action.cardId;
  if(action.kind?.includes("item")&&item)return "item:"+item.id;
  if(action.id||action.itemId)return "item:"+(action.id??action.itemId);
  if(action.roomId)return "room:"+action.roomId;
  return state.monster?"monster:"+state.monster.id:
   state.room?"room:"+state.room.id:"between-rooms";
 };
 function select({phase,legal,chosen,state}){
  const phaseCell=actions.byPhase[phase]??=actionCell();
  const kinds=new Set(),sources=new Set();
  const healingSources=new Set(),stage=state.room?.stage??'between-rooms';
  for(const action of legal){
   const key=keyFor(phase,action),source=sourceFor(state,action);
   (actions.byKind[key]??=actionCell()).available++;
   (actions.bySource[source]??=actionCell()).available++;
   kinds.add(key);sources.add(source);
   for(const healingSource of healingOpportunitySources(state,action)){
    healingSources.add(healingSource);
    for(const cell of healingCells(healingSource,stage))cell.available++;
   }
  }
  for(const healingSource of healingSources)for(const cell of healingCells(healingSource,stage))cell.opportunities++;
  for(const key of kinds)actions.byKind[key].opportunities++;
  for(const source of sources)actions.bySource[source].opportunities++;
  actions.available+=legal.length;phaseCell.available+=legal.length;
  phaseCell.opportunities++;phaseCell.selected++;actions.selected++;
  const key=keyFor(phase,chosen),source=sourceFor(state,chosen);
  actions.byKind[key].selected++;actions.bySource[source].selected++;
  const chosenHealingSources=healingOpportunitySources(state,chosen);
  for(const healingSource of chosenHealingSources)for(const cell of healingCells(healingSource,stage))cell.selected++;
  pending.push({phase,key,source,stage,healingSources:chosenHealingSources});actions.pending=pending.length;
  if(legal.length>1){
   const context=phase+":"+(chosen.context??chosen.roomId??
    (phase==="room"?state.room?.id:null)??"");
   const cell=meaningful[context]??={available:new Set(),selected:{},n:0};
   for(const action of legal)cell.available.add(alternative(action));
   add(cell.selected,alternative(chosen),1);cell.n++;
  }
 }
 function settle(effects,state,committed){
  if(!committed){
   if(effects.length)throw Error("Uncommitted rules events escaped transaction");
   return;
  }
  committedTransactions++;
  for(const x of pending){
   actions.resolved++;actions.byPhase[x.phase].resolved++;
   actions.byKind[x.key].resolved++;actions.bySource[x.source].resolved++;
   for(const healingSource of x.healingSources)for(const cell of healingCells(healingSource,x.stage))cell.resolved++;
  }
  pending.length=0;actions.pending=0;
  ruleEvents+=effects.length;
  for(const e of effects){
   if((e.damage>0||e.offered>0)&&(!e.source||e.source.startsWith('unattributed:')))unattributedHpEffects++;
   if(e.type==="damage"){
    add(damageBySource,e.source,e.damage);add(damageByStage,e.stage,e.damage);
    add(damageByHero,e.heroId,e.damage);
    add(damageByContext,e.context,e.damage);add(damageByAttribution,e.attribution,e.damage);
   }else if(e.type==="healing"){
    for(const cell of healingCells(e.source,e.stage)){
     cell.healingEvents++;for(const k of ['offered','restored','wasted'])cell[k]+=e[k];
    }
    for(const cell of [healingByHero[e.heroId]??=healingCell(),
     (healingByStageSource[e.stage]??={})[e.source]??=healingCell()]){
     cell.attempts++;
     for(const k of ["offered","restored","wasted"])cell[k]+=e[k];
    }
   }else if(e.type==="room-entry"&&e.stage==="FINAL"&&vaultEntryHpFraction===null){
    vaultEntryHpFraction=e.hp.reduce((n,h)=>n+Math.max(0,h.hp),0)/Math.max(1,hpCap);
   }else if(["inventory-add","inventory-remove","item-use"].includes(e.type)){
    const cell=(inventoryByStage[e.stage]??={})[e.itemId]??=
     {acquired:0,removed:0,used:0};
    cell[e.type==="inventory-add"?"acquired":e.type==="inventory-remove"?"removed":"used"]++;
   }
  }
 }
 function finish(session){
  if(pending.length)throw Error("Unresolved actual decision selections at trial end");
  const state=session.state,canonical=cloneMetrics(state);
  const byHero=initial.map(h=>{
   const final=state.heroes.find(x=>x.card.id===h.id).hp;
   const restored=healingByHero[h.id]?.restored??0,damage=damageByHero[h.id]??0;
   return {id:h.id,initial:h.hp,final,restored,damage,
    residual:final-(h.hp+restored-damage)};
  });
  if(byHero.some(h=>h.residual!==0))throw Error("HP conservation failed in committed telemetry");
  if(Object.values(damageByStage).reduce((n,x)=>n+x,0)!==canonical.damage)
   throw Error("Committed damage differs from canonical metrics");
  if(Object.values(healingByHero).reduce((n,x)=>n+x.restored,0)!==canonical.healing.total.restored)
   throw Error("Committed healing differs from canonical metrics");
  const total=Object.values(meaningful).reduce((n,x)=>n+x.n,0);
  // Normalize entropy within each phase/printed-trigger context by the
  // log2 of distinct legal alternatives offered there across this trial.
  // Weight by observed non-forced selections. Different phases alone
  // cannot manufacture diversity; deterministic choices have score zero.
  const choiceDiversity=total?Math.min(1,Object.values(meaningful).reduce((sum,c)=>{
   if(c.available.size<2)return sum;
   const entropy=Object.values(c.selected).reduce((n,x)=>n-(x/c.n)*Math.log2(x/c.n),0);
   return sum+c.n/total*entropy/Math.log2(c.available.size);
  },0)):0;
  const visits=canonical.monsterVisits??{};
  const ordinaryEncounters=Object.entries(visits)
   .filter(([id])=>!["warden","warden-fury"].includes(id))
   .reduce((n,[,count])=>n+count,0);
  const ordinaryFights=Object.entries(canonical.monsterFightStartsById??{})
   .filter(([id])=>!["warden","warden-fury"].includes(id))
   .reduce((n,[,count])=>n+count,0);
  const wardenFightStarts=visits.warden??0;
  const wardenPhaseStarts=wardenFightStarts+(visits["warden-fury"]??0);
  const wardenCombatWins=Number(!!canonical.won&&!canonical.sealWin&&
   state.endingKind==="amulet_taken");
  return {...canonical,actions,healingOpportunities,hp:{byHero},ordinaryEncounters,ordinaryFights,vaultEntryHpFraction,
   damageBySource,damageByStage,damageByContext,damageByAttribution,healingByStageSource,healingByHero,
   inventory:{itemUses:canonical.itemUses,itemResults:canonical.itemResults,
    acquisitions:canonical.objectAcquisitions,draws:canonical.objectDraws,
    opportunities:canonical.itemOpportunities,byStage:inventoryByStage,
    final:compactExperimentSnapshot(session)},
   warden:{fightStarts:wardenFightStarts,phaseStarts:wardenPhaseStarts,combatWins:wardenCombatWins,
    sealAttempts:Number(!!canonical.sealAttempt),sealWins:Number(!!canonical.sealWin),
    ending:state.endingKind??null},choiceDiversity,
   choiceDiversityDefinition:{range:[0,1],
    method:"selection-weighted within-phase/printed-trigger entropy / log2(distinct legal alternatives offered); forced boundaries excluded",
    meaningfulSelections:total,contexts:Object.keys(meaningful).length},
   telemetry:{schema:"uba-trial-telemetry-v1",ruleEvents,committedTransactions,unattributedHpEffects,
    unsupported:[
     "Unattributed damage uses explicit unattributed:context keys; damageByContext and damageByAttribution preserve this uncertainty.",
     "Healing availability counts legal printed source/action pairs with a possible healing operation; chance outcomes remain uncertain. Offered HP comes only from resolved effects, never unchosen counterfactual healing.",
     "Room and Monster copy identifiers are null where the canonical engine has no physical-copy token."
    ]}};
 }
 return {select,settle,finish};
}
