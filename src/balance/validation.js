import {join} from 'node:path';
import {HEROES} from '../tabletop-data.js';
import {summarizeTrials,evaluateFitness} from './fitness.js';
import {pairedComparison,wilsonInterval,meanInterval,normalQuantile} from './statistics.js';
import {DEFAULT_GOALS} from './goals.js';
import {lockConfiguration,writeJSON} from './artifacts.js';

export function assertIndependentHoldout(rows,tuningRows=[]){
 const used=new Set(tuningRows.map(r=>r.seed));
 for(const row of rows){
  if(row.split!=='holdout')throw Error('Confirmation requires holdout trials');
  if(used.has(row.seed))throw Error('Tuning seed reused in independent validation: '+row.seed);
 }
 return true;
}
const profileId=r=>typeof r.profile==='object'?r.profile.id:r.profileId??r.profile;
const ALL_PARTY_NAMES=[...HEROES.map(h=>h.id),...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(o=>h.id+'+'+o.id))];
export function assessValidation({rows,baselineRows=[],goals=DEFAULT_GOALS,profiles=['puct-c070-v1'],physicalChanges=0,arms=1,tuningRows=[]}={}){
 assertIndependentHoldout(rows,tuningRows);assertIndependentHoldout(baselineRows,tuningRows);
 const reasons=[],failures=[],results=[];
 const requested=profiles.map(p=>typeof p==='string'?p:p.id);
 if(new Set(requested).size!==requested.length)reasons.push('Duplicate validation profile IDs');
 if(!requested.length)reasons.push('At least one fixed validation profile is required');
 // Predeclared family: candidates × profiles × all rate targets and party
 // floors. Wide simultaneous intervals are intentional after arm selection.
 const family=Math.max(1,arms*profiles.length*(ALL_PARTY_NAMES.length+16)),confidence=1-(1-goals.validation.confidence)/family;
 for(const profile of profiles){
  const id=typeof profile==='string'?profile:profile.id,
   rs=rows.filter(r=>profileId(r)===id),bs=baselineRows.filter(r=>profileId(r)===id),
   summary=summarizeTrials(rs,{confidence}),fitness=evaluateFitness(summary,goals,{physicalChanges});
  const missing=ALL_PARTY_NAMES.filter(p=>!rs.some(r=>r.party===p));
  if(missing.length)reasons.push(id+': missing Hero/pair coverage ('+missing.length+')');
  const insufficient=ALL_PARTY_NAMES.filter(p=>rs.filter(r=>r.party===p).length<goals.validation.minTrialsPerParty);
  if(insufficient.length)reasons.push(id+': insufficient per-party sample ('+insufficient.length+' parties)');
  const seeds=new Set(rs.map(r=>r.seed));
  if(seeds.size<goals.validation.minIndependentSeeds)reasons.push(id+': insufficient independent seed sample');
  for(const size of ['solo','duo'])if(summary[size].vaultEntries<goals.validation.minVaultEntriesPerSize)reasons.push(id+': insufficient '+size+' Vault sample');
  for(const v of fitness.violations)if(v.code==='telemetry-coverage')reasons.push(id+': incomplete required telemetry');else if(v.hard&&v.code!=='coverage')failures.push(id+': '+v.code);
  const checks=[['soloVault',summary.solo.vaultCI],['soloConditionalWin',summary.solo.conditionalCI],['soloWin',summary.solo.winCI],['duoWin',summary.duo.winCI]];
  for(const [key,ci] of checks){
   if(!ci){reasons.push(id+': unknown '+key);continue;}
   const [lo,hi]=goals.objectives[key].range;
   if(ci[1]<lo||ci[0]>hi)failures.push(id+': '+key+' interval outside target');
   else if(goals.validation.requireTargetIntervals&&(ci[0]<lo||ci[1]>hi))reasons.push(id+': '+key+' interval crosses target tolerance');
  }
  for(const [size,floor] of [['solo',goals.constraints.minimumHeroWinRate],['duo',goals.constraints.minimumPairWinRate]])for(const p of summary[size].byParty){
   const ci=wilsonInterval(p.wins,p.n,confidence);
   if(ci[1]<floor)failures.push(id+': '+p.party+' below performance safeguard');
   else if(ci[0]<floor)reasons.push(id+': '+p.party+' safeguard uncertain');
  }
  const comparison={};
  for(const [size,length] of [['solo',1],['duo',2]]){
   const candidate=rs.filter(r=>r.heroes?.length===length),base=bs.filter(r=>r.heroes?.length===length);
   const c=pairedComparison(base,candidate,'won',{confidence});comparison[size]=c;
   if(c.pairs!==candidate.length||!c.pairs||c.seedClusters<goals.validation.minIndependentSeeds)reasons.push(id+': incomplete '+size+' baseline pairing/sample');
   if(c.interval){
    if(c.interval[1]<-goals.validation.maxWinRegression)failures.push(id+': confirmed '+size+' regression');
    else if(c.interval[0]<-goals.validation.maxWinRegression)reasons.push(id+': '+size+' regression cannot be excluded');
   }
  }
  const combine=key=>{
   const cells=[summary.solo,summary.duo].filter(s=>s.n).map(s=>s.continuous[key]);
   if(!cells.length||cells.some(c=>c.standardError===null))return null;
   const center=cells.reduce((n,c)=>n+c.estimate,0)/cells.length,se=Math.sqrt(cells.reduce((n,c)=>n+c.standardError**2,0))/cells.length,z=normalQuantile((1+confidence)/2);
   return [Math.max(0,center-z*se),Math.min(key==='encounters36'?Infinity:1,center+z*se)];
  };
  const fairness=summary.solo.byParty,nonBinomial={encounters36:combine('encounters36'),fightConversion:combine('fightConversion'),healingWaste:combine('healingWaste'),
   choiceDiversity:meanInterval(rs,'choiceDiversity',{confidence,bounds:[0,1]}).interval,
   heroFairness:fairness.length?[Math.max(0,Math.max(...fairness.map(p=>p.winCI[0]))-Math.min(...fairness.map(p=>p.winCI[1]))),Math.max(...fairness.map(p=>p.winCI[1]))-Math.min(...fairness.map(p=>p.winCI[0]))]:null};
  // Continuous goals need uncertainty too, not only a favorable point.
  for(const key of ['encounters36','fightConversion','heroFairness','healingWaste','choiceDiversity']){
   const value=fitness.values[key],[lo,hi]=goals.objectives[key].range;
   if(!Number.isFinite(value))reasons.push(id+': unknown '+key);
   else if(value<lo||value>hi)reasons.push(id+': '+key+' target not met');
   const interval=nonBinomial[key];
   if(!interval)reasons.push(id+': insufficient replication for '+key+' interval');
   else if(goals.validation.requireTargetIntervals&&(interval[0]<lo||interval[1]>hi))reasons.push(id+': '+key+' interval crosses target tolerance');
  }
  results.push({id,summary,fitness,comparison,nonBinomialIntervals:nonBinomial});
 }
 return {schema:'uba-validation-assessment-v1',status:failures.length?'rejected':reasons.length?'uncertain':'validated',confidence,familyComparisons:family,
  reasons:[...new Set(reasons)],failures:[...new Set(failures)],profiles:results,
  interpretation:'Validation is conditional on fixed policies and declared target tolerances. Human enjoyment and play duration require playtests.'};
}
export async function validateFinalists({candidates,goals=DEFAULT_GOALS,out,profiles=['puct-c070-v1'],runsPerParty=goals.search.holdoutRuns,seed=20261020,workers=1,budgetMs,tuningRows=[],parties,humanFeedback=null,maxTrials}={}){
 const {createCandidate}=await import('./candidate.js'),{compileCandidate,printableDiff,physicalChangeCount}=await import('./compiler.js'),
  {runLaboratory}=await import('./runner.js'),{getAgentProfile}=await import('./profiles.js');
 const baseline=createCandidate(),unique=new Map([[baseline.hash,baseline],...candidates.map(c=>[c.hash,c])]);
 const fixed=profiles.map(p=>getAgentProfile(p));
 for(const c of unique.values())compileCandidate(c);
 const locked=lockConfiguration(join(out,'validation-lock.json'),{candidates:[...unique.keys()],goals:goals.hash,
  profiles:fixed,seed,runsPerParty,parties:parties??ALL_PARTY_NAMES,tuningSeeds:[...new Set(tuningRows.map(r=>r.seed))].sort((a,b)=>a-b),humanFeedback});
 const result=await runLaboratory({candidates:[...unique.values()],profiles:fixed,parties,runsPerParty,seed,split:'holdout',out:join(out,'trials'),workers,budgetMs,maxTrials});
 assertIndependentHoldout(result.rows,tuningRows);
 const entries=candidates.map(c=>{
  const rows=result.rows.filter(r=>r.candidateHash===c.hash),baselineRows=result.rows.filter(r=>r.candidateHash===baseline.hash);
  const diff=printableDiff(c);
  const assessment=assessValidation({rows,baselineRows,goals,profiles:fixed,physicalChanges:physicalChangeCount(c),arms:candidates.length,tuningRows});
  if(!result.complete&&assessment.status==='validated'){assessment.status='uncertain';assessment.reasons.push('Incomplete holdout plan');}
  return {candidate:c,assessment,printableDiff:diff};
 });
 const report={schema:'uba-independent-validation-v1',lock:locked.hash,complete:result.complete,entries,humanFeedback};
 writeJSON(join(out,'validation.json'),report);
 return {...report,rows:result.rows};
}
