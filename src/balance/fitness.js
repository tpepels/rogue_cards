import {HEROES} from '../tabletop-data.js';
import {mean,wilsonInterval,stratifiedBootstrap,meanInterval,ratioInterval} from './statistics.js';

const sum=(rows,key)=>rows.reduce((n,r)=>n+(Number.isFinite(r[key])?r[key]:0),0);
const average=(rows,key)=>rows.every(r=>Number.isFinite(r[key]))?mean(rows.map(r=>r[key])):null;
const REQUIRED_METRICS=['won','vaultReached','roomsCleared','ordinaryEncounters','ordinaryFights','damage','healingRestored','healingWasted'];
const observedTotal=(rows,key)=>rows.every(r=>Number.isFinite(r[key]))?sum(rows,key):null;
function pool(rows,confidence){
 const n=rows.length,wins=sum(rows,'won'),reached=rows.filter(r=>r.vaultReached),completed=rows.filter(r=>r.roomsCleared>=36),
  parties=[...new Set(rows.map(r=>r.party))].sort(),byParty=parties.map(p=>{const rs=rows.filter(r=>r.party===p);return {party:p,n:rs.length,wins:sum(rs,'won'),winRate:average(rs,'won'),winCI:wilsonInterval(sum(rs,'won'),rs.length,confidence),vaultRate:average(rs,'vaultReached')};});
 const fights=observedTotal(rows,'ordinaryFights'),encounters=observedTotal(rows,'ordinaryEncounters'),restored=observedTotal(rows,'healingRestored'),wasted=observedTotal(rows,'healingWasted');
 const finiteRates=byParty.map(r=>r.winRate).filter(Number.isFinite);
 const continuous={encounters36:meanInterval(rows.filter(r=>r.roomsCleared>0),r=>r.ordinaryEncounters*36/r.roomsCleared,{confidence,bounds:[0,Infinity]}),
  fightConversion:ratioInterval(rows,'ordinaryFights','ordinaryEncounters',{confidence,bounds:[0,1]}),
  healingWaste:ratioInterval(rows,'healingWasted',r=>r.healingRestored+r.healingWasted,{confidence,bounds:[0,1]}),
  damage:meanInterval(rows,'damage',{confidence,bounds:[0,Infinity]}),healingRestored:meanInterval(rows,'healingRestored',{confidence,bounds:[0,Infinity]})};
 return {n,wins,winRate:n?wins/n:null,winCI:wilsonInterval(wins,n,confidence),vaultEntries:reached.length,vaultRate:n?reached.length/n:null,vaultCI:wilsonInterval(reached.length,n,confidence),
  conditionalWin:reached.length?sum(reached,'won')/reached.length:null,conditionalCI:wilsonInterval(sum(reached,'won'),reached.length,confidence),
  encounters:average(rows,'ordinaryEncounters'),encounters36:mean(rows.filter(r=>r.roomsCleared>0).map(r=>r.ordinaryEncounters*36/r.roomsCleared)),
  complete36Runs:completed.length,complete36Encounters:average(completed,'ordinaryEncounters'),continuous,
  encounters36CI:continuous.encounters36.interval,fightConversionCI:continuous.fightConversion.interval,healingWasteCI:continuous.healingWaste.interval,
  fightConversion:encounters&&fights!==null?fights/encounters:null,ordinaryEncounters:encounters,ordinaryFights:fights,
  damage:average(rows,'damage'),healingRestored:n&&restored!==null?restored/n:null,healingWasted:n&&wasted!==null?wasted/n:null,healingWasteFraction:restored!==null&&wasted!==null&&restored+wasted?wasted/(restored+wasted):null,
  minimumPartyWin:finiteRates.length?Math.min(...finiteRates):null,partySpread:finiteRates.length?Math.max(...finiteRates)-Math.min(...finiteRates):null,
  byParty,winStratified:stratifiedBootstrap(rows,'won',{samples:500,confidence}),
  sealWins:sum(rows,'sealWin'),sealAttempts:sum(rows,'attemptsSeal'),
  wardenFightStarts:sum(rows,'wardenFightStarts'),wardenCombatWins:sum(rows,'wardenCombatWins'),
  wardenConditionalWin:sum(rows,'wardenFightStarts')?sum(rows,'wardenCombatWins')/sum(rows,'wardenFightStarts'):null,
  endings:Object.fromEntries(['win','death','escape'].map(e=>[e,rows.filter(r=>r.ending===e).length]))};
}
function addTree(target,value){
 if(!value||typeof value!=='object')return;
 for(const [k,v] of Object.entries(value))if(typeof v==='number'&&Number.isFinite(v))target[k]=(target[k]??0)+v;else if(v&&typeof v==='object'&&!Array.isArray(v))addTree(target[k]??={},v);
}
export function summarizeTrials(rows,{confidence=0.95}={}){
 const solo=rows.filter(r=>(r.heroes?.length??r.party.split('+').length)===1),duo=rows.filter(r=>(r.heroes?.length??r.party.split('+').length)===2),telemetry={};
 for(const r of rows)addTree(telemetry,r.telemetry??r.metrics??{});
 const choiceValues=rows.map(r=>r.choiceDiversity??r.telemetry?.choiceDiversity).filter(Number.isFinite);
 const profileKeys=[...new Set(rows.map(r=>r.profileHash??r.profile).filter(Boolean))],byProfile={};
 for(const key of profileKeys){const rs=rows.filter(r=>(r.profileHash??r.profile)===key);byProfile[key]={profileId:rs[0].profileId??null,
  solo:pool(rs.filter(r=>(r.heroes?.length??r.party.split('+').length)===1),confidence),duo:pool(rs.filter(r=>(r.heroes?.length??r.party.split('+').length)===2),confidence)};}
 return {schema:'uba-summary-v1',n:rows.length,solo:pool(solo,confidence),duo:pool(duo,confidence),telemetry,choiceDiversity:choiceValues.length===rows.length?mean(choiceValues):null,
  metricCoverage:Object.fromEntries(REQUIRED_METRICS.map(k=>[k,rows.filter(r=>Number.isFinite(r[k])).length])),
  profiles:profileKeys,byProfile,
  postCombatHealTriggers:sum(rows,'postCombatHealTriggers'),
  sourceMetrics:{healingByStage:sumTrees(rows,'healingByStage'),healingBySource:sumTrees(rows,'healingBySource'),damageByStage:sumTrees(rows,'damageByStage'),damageBySource:sumTrees(rows,'damageBySource'),
   healingByCategory:sumTrees(rows,'healingByCategory')},
  limitations:['Simulation outcomes apply to the frozen agents, not tabletop players.','Normalized encounters exclude zero-Room deaths and differ from observed complete-36 expeditions.']};
}
const sumTrees=(rows,key)=>{const out={};for(const r of rows)addTree(out,r[key]);return out;};
export function evaluateFitness(summary,goals,{physicalChanges=0,expectedParties}={}){
 const s=summary.solo,d=summary.duo,values={soloVault:s.vaultRate,soloConditionalWin:s.conditionalWin,soloWin:s.winRate,duoWin:d.winRate,
  encounters36:mean([s.encounters36,d.encounters36].filter(Number.isFinite)),fightConversion:mean([s.fightConversion,d.fightConversion].filter(Number.isFinite)),
  heroFairness:s.partySpread,healingWaste:mean([s.healingWasteFraction,d.healingWasteFraction].filter(Number.isFinite)),choiceDiversity:summary.choiceDiversity,complexity:physicalChanges};
 const violations=[];
 if(summary.profiles?.length>1)violations.push({code:'mixed-agents',hard:true,profiles:summary.profiles});
 const unobserved=Object.entries(summary.metricCoverage??{}).filter(([,n])=>n<summary.n).map(([k])=>k);
 if(unobserved.length)violations.push({code:'telemetry-coverage',hard:true,missing:unobserved});
 const actual=new Set([...s.byParty,...d.byParty].map(p=>p.party));
 const required=expectedParties??[
  ...(goals.constraints.requireAllHeroes?HEROES.map(h=>h.id):[]),
  ...(goals.constraints.requireAllPairs?HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(o=>h.id+'+'+o.id)):[])];
 const missing=required.map(p=>Array.isArray(p)?p.join('+'):p).filter(p=>!actual.has(p));
 if(missing.length)violations.push({code:'coverage',missing,hard:true});
 if(summary.postCombatHealTriggers)violations.push({code:'hidden-healing',hard:true});
 if(s.minimumPartyWin!==null&&s.minimumPartyWin<goals.constraints.minimumHeroWinRate)violations.push({code:'hero-floor',value:s.minimumPartyWin,hard:false});
 if(d.minimumPartyWin!==null&&d.minimumPartyWin<goals.constraints.minimumPairWinRate)violations.push({code:'pair-floor',value:d.minimumPartyWin,hard:false});
 if(physicalChanges>goals.constraints.maxPhysicalChanges)violations.push({code:'physical-complexity',value:physicalChanges,hard:true});
 const keys=Object.keys(goals.objectives).sort(),missingMetrics=[];
 const objectives=keys.map(k=>{
  const v=values[k],o=goals.objectives[k];
  if(!Number.isFinite(v)){missingMetrics.push(k);return -1;}
  const [lo,hi]=o.range,scale=Math.max(hi-lo,Math.abs(hi),1e-6),distance=v<lo?lo-v:v>hi?v-hi:0;
  return 1-distance/scale;
 });
 // Unknown metrics are explicit penalties, never silently treated as success.
 const weight=keys.reduce((n,k)=>n+goals.objectives[k].weight,0);
 const score=keys.reduce((n,k,i)=>n+goals.objectives[k].weight*objectives[i],0)/Math.max(weight,1);
 return {eligible:summary.n>0&&!violations.some(v=>v.hard),score,keys,objectives,values,missingMetrics,violations,
  interpretation:'Point estimates for screening only; fairness floors require independent confidence checks before validation.'};
}
export const dominates=(a,b)=>a.length===b.length&&a.every((x,i)=>x>=b[i])&&a.some((x,i)=>x>b[i]);
export function paretoFrontier(entries){
 const legal=entries.filter(e=>e.fitness?.eligible);
 const identified=legal.filter(e=>e.fitness.keys);
 if(identified.some(e=>JSON.stringify(e.fitness.keys)!==JSON.stringify(identified[0].fitness.keys)))throw Error('Incompatible objective vector ordering');
 return legal.filter(e=>!legal.some(other=>other!==e&&dominates(other.fitness.objectives,e.fitness.objectives)));
}
