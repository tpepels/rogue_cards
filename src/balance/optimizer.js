import {existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createCandidate} from './candidate.js';
import {compileCandidate,printableDiff,printableDeck,physicalChangeCount} from './compiler.js';
import {DEFAULT_GOALS,contentHash} from './goals.js';
import {randomSource} from './statistics.js';
import {candidateFromGenes,validateSearchSpace,randomGenes,mutateGenes,recombineGenes} from './mutations.js';
import {evaluateFitness,summarizeTrials,paretoFrontier} from './fitness.js';
import {writeJSON,readJSON,lockConfiguration} from './artifacts.js';
import {sourceFingerprint,readTrialRecords} from './io.js';
import {getAgentProfile} from './profiles.js';
import {runLaboratory,ALL_PARTIES} from './runner.js';
import {validateFinalists} from './validation.js';
import {saveComparison} from './report.js';
import {BASELINE_MANIFEST} from './baseline.js';
import {exportPrintProposal} from './print.js';
import {writeResultsStatusForOutput} from './results-status.js';

export function proposePopulation({base=createCandidate(),space,seed=1,generation=0,population=8,archive=[],algorithm='evolutionary',mutationRate=0.3,randomFraction=0.25,protectedCards=[]}={}){
 validateSearchSpace(space,{base,protectedCards});
 if(!['random','evolutionary'].includes(algorithm))throw Error('Unknown optimization algorithm');
 const rng=randomSource(Number.parseInt(contentHash({seed,generation}).slice(0,8),16)),seen=new Set([base.hash,...archive.map(e=>e.candidate.hash)]),seenGenes=new Set(),out=[];
 const parents=chooseRefinements(archive.filter(e=>e.genes),Math.max(2,Math.ceil(population/2)));
 for(let attempt=0;attempt<population*200&&out.length<population;attempt++){
  let genes;
  if(!parents.length||algorithm==='random'||rng()<randomFraction)genes=randomGenes(space,rng);
  else{
   const a=parents[Math.floor(rng()*parents.length)],b=parents[Math.floor(rng()*parents.length)];
   genes=mutateGenes(recombineGenes(a.genes,b.genes,space,rng),space,rng,mutationRate);
  }
  const geneHash=contentHash(genes);if(seenGenes.has(geneHash))continue;seenGenes.add(geneHash);
  let candidate;try{candidate=candidateFromGenes({base,space,genes});}catch{continue;}
  if(seen.has(candidate.hash))continue;
  seen.add(candidate.hash);out.push({candidate,genes,born:generation});
 }
 return out;
}
export function chooseRefinements(entries,count){
 const sorted=[...entries].sort((a,b)=>b.fitness.score-a.fitness.score||a.candidate.hash.localeCompare(b.candidate.hash));
 const frontier=paretoFrontier(sorted),chosen=[];
 // Greedy objective-space spacing preserves a range of playable compromises.
 const candidates=[...frontier];
 while(candidates.length&&chosen.length<count){
  const best=!chosen.length?0:candidates.reduce((best,e,i)=>{
   const distance=x=>Math.min(...chosen.map(c=>x.fitness.objectives.reduce((s,v,k)=>s+(v-c.fitness.objectives[k])**2,0)));
   return distance(e)>distance(candidates[best])?i:best;
  },0);
  chosen.push(candidates.splice(best,1)[0]);
 }
 for(const e of sorted)if(chosen.length<count&&!chosen.includes(e))chosen.push(e);
 return chosen;
}
const mergeRows=(a,b)=>[...new Map([...a,...b].map(r=>[[r.candidateHash,r.profileHash,r.party,r.seed].join('|'),r])).values()];
const SELECTION_FIELDS=['id','candidateHash','party','heroes','seed','profileHash','profileId','split','repeat','won','vaultReached','roomsCleared','ordinaryEncounters','ordinaryFights','damage','healingRestored','healingWasted','ending','vaultEntryHpFraction','attemptsSeal','sealWin','wardenFightStarts','wardenCombatWins','choiceDiversity','postCombatHealTriggers'];
const selectionRows=rows=>rows.map(r=>Object.fromEntries(SELECTION_FIELDS.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]])));
function evaluateEntry(entry,rows,goals,parties){
 const summary=summarizeTrials(rows),diff=printableDiff(entry.candidate),fitness=evaluateFitness(summary,goals,{physicalChanges:physicalChangeCount(entry.candidate),expectedParties:parties});
 // Detailed canonical observations remain in checksummed raw laboratory
 // records; the optimizer checkpoint retains only selection inputs.
 return {...entry,summary,diff,fitness,rows:selectionRows(rows)};
}
export async function optimizeBalance(options={}){
 const {goals=DEFAULT_GOALS,base=createCandidate(),seed=20261020,workers=1,out='results/ultimate-balance',algorithm='evolutionary',profile='puct-c070-v1',parties=ALL_PARTIES,
  protectedCards=[],maxTrials,validate=true}=options;
 const settings={...goals.search,...options.search},space=settings.space;
 // Operator-only pause boundary: intentionally excluded from the immutable
 // scientific input lock. Resuming without it continues the same experiment.
 const stopAfterGeneration=options.stopAfterGeneration;
 if(options.stopAfterCurrentGeneration&&stopAfterGeneration!==undefined)
  throw Error('Choose either stopAfterCurrentGeneration or stopAfterGeneration, not both');
 if(stopAfterGeneration!==undefined&&(!Number.isSafeInteger(stopAfterGeneration)||
  stopAfterGeneration<1||stopAfterGeneration>settings.generations))
  throw Error('Invalid stopAfterGeneration: expected a completed generation between 1 and '+settings.generations);
 validateSearchSpace(space,{base,protectedCards});compileCandidate(base);
 const fixedProfile=getAgentProfile(profile),started=Date.now(),budgetMs=options.budgetMs??12*60*60*1000;
 const remaining=()=>Math.max(0,budgetMs-(Date.now()-started));
 mkdirSync(out,{recursive:true});
 // Independent confirmation defaults to the same pinned policy used for
 // optimization. Legacy checkpoints retain their originally locked policies.
 // New balance runs use the strongest pinned agent for both selection and
 // independent confirmation. Existing checkpoint inputs must stay immutable:
 // retain the original validation profiles when resuming an older run.
 const priorLockPath=join(out,'optimizer-lock.json');
 const priorLock=existsSync(priorLockPath)?readJSON(priorLockPath):null;
 const validationIds=options.validationProfiles??priorLock?.configuration?.validationProfiles??[fixedProfile];
 const validationProfiles=[...new Map(validationIds.map(p=>{
  const resolved=getAgentProfile(p);return [resolved.hash,resolved];
 })).values()];
 const config={schema:'uba-optimizer-v1',base,goals,seed,algorithm,profile:fixedProfile,parties,settings,protectedCards,validate,validationProfiles,source:sourceFingerprint()};
 // Allow resumption after Git/Node changes; keep all fixed trial inputs and
 // the original checkpoint checksum/identity.
 const locked=lockConfiguration(join(out,'optimizer-lock.json'),config,{ignoreSource:true}),statePath=join(out,'optimizer-state.json');
 // The original scientific search lock remains unchanged. A separate
 // persisted policy amendment is opt-in for legacy checkpoints whose holdout
 // would otherwise run reference/weak agents as well as the selected PUCT.
 const validationOverridePath=join(out,'validation-policy-override.json');
 const bestAgentOnlyValidation=Boolean(options.bestAgentOnlyValidation||existsSync(validationOverridePath));
 if(bestAgentOnlyValidation){
  const alreadyStarted=existsSync(join(out,'confirmation','validation-lock.json'));
  if(alreadyStarted&&!existsSync(validationOverridePath))
   throw Error('Holdout already started under the original profile plan; cannot change its agent set in place');
  lockConfiguration(validationOverridePath,{
   schema:'uba-best-agent-validation-override-v1',
   optimizerLock:locked.hash,
   fromProfiles:validationProfiles.map(p=>({id:p.id,hash:p.hash})),
   effectiveProfiles:[{id:fixedProfile.id,hash:fixedProfile.hash}],
   purpose:'Single selected strongest-agent holdout; source search/checkpoint unchanged'
  });
 }
 const holdoutProfiles=bestAgentOnlyValidation?[fixedProfile]:validationProfiles;
 writeJSON(join(out,'baseline.json'),BASELINE_MANIFEST);
 const savedState=existsSync(statePath),state=savedState?readJSON(statePath):{schema:'uba-optimizer-state-v1',lock:locked.hash,generation:0,archive:[],current:null,complete:false};
 const stateChecksum=()=>{const {integrity,...snapshot}=state;return contentHash(snapshot);};
 if(savedState&&state.integrity!==stateChecksum())throw Error('Optimizer checkpoint checksum mismatch');
 if(state.lock!==locked.hash)throw Error('Optimizer checkpoint lock mismatch');
 // generation is zero-based; an active g1 refinement must finish before
 // reaching the next boundary at 2, not stop on entry at generation=1.
 if(stopAfterGeneration!==undefined&&state.current&&state.generation>=stopAfterGeneration)
  throw Error('Requested stop-after-generation '+stopAfterGeneration+' is already behind active generation g'+
   state.generation+'. Use --stop-after-current-generation or --stop-after-generation '+(state.generation+1));
 if(options.stopAfterCurrentGeneration&&!state.current)
  throw Error('No active generation to finish; inspect the saved checkpoint instead of starting a new generation');
 const stopBoundary=options.stopAfterCurrentGeneration?state.generation+1:stopAfterGeneration;
 // Also recreate results/STATUS.md when resuming an older checkpoint.
 writeResultsStatusForOutput(out,{force:true});
 const save=()=>{state.integrity=stateChecksum();writeJSON(statePath,state);writeResultsStatusForOutput(out,{force:true});};
 const stop=reason=>{state.stopReason=reason;save();return {...state,complete:false};};
 for(;state.generation<settings.generations;state.generation++){
  if(stopBoundary!==undefined&&state.generation>=stopBoundary)
   return stop('generation-boundary');
  if(!remaining())return stop('time-budget');
  const g=state.generation;
  if(!state.current){
   const generated=proposePopulation({base,space,seed,generation:g,population:settings.population,archive:state.archive,algorithm,mutationRate:settings.mutationRate,randomFraction:settings.randomFraction,protectedCards});
   state.current={population:g===0?[{candidate:base,genes:null,born:0},...generated]:generated,stage:'screen'};save();
   for(const entry of state.current.population)writeJSON(join(out,'candidates',entry.candidate.hash+'.json'),entry.candidate);
  }
  const batch=state.current;
  if(batch.stage==='screen'&&batch.population.length){
   const result=await runLaboratory({candidates:batch.population.map(e=>e.candidate),profiles:[fixedProfile],parties,runsPerParty:settings.screenRuns,seed,split:'screen',out:join(out,'screen','g'+g),workers,budgetMs:remaining(),maxTrials,goals});
   if(result.errors?.length)throw Error('Screening trial failed: '+JSON.stringify(result.errors));
   if(!result.complete)return stop(result.stopReason??'screen-incomplete');
   const evaluated=batch.population.map(e=>evaluateEntry(e,result.rows.filter(r=>r.candidateHash===e.candidate.hash),goals,parties));
   state.archive.push(...evaluated);batch.stage='refine';
   const viable=chooseRefinements(evaluated,Math.max(settings.finalists,Math.ceil(evaluated.length/2)));
   // Include one dominated, noisy arm when available to avoid irrevocable
   // rejection from tiny screening samples.
   const uncertain=evaluated.filter(e=>!viable.includes(e)).sort((a,b)=>b.fitness.score-a.fitness.score)[0];
   if(uncertain)viable.push(uncertain);
   batch.refine=viable.map(e=>e.candidate.hash);save();
  }else if(batch.stage==='screen'){batch.stage='refine';batch.refine=[];save();}
  if(batch.stage==='refine'&&batch.refine.length){
   const entries=state.archive.filter(e=>batch.refine.includes(e.candidate.hash));
   const result=await runLaboratory({candidates:entries.map(e=>e.candidate),profiles:[fixedProfile],parties,runsPerParty:settings.refineRuns,seed,split:'refine',out:join(out,'refine','g'+g),workers,budgetMs:remaining(),maxTrials,goals});
   if(result.errors?.length)throw Error('Refinement trial failed: '+JSON.stringify(result.errors));
   if(!result.complete)return stop(result.stopReason??'refine-incomplete');
   for(const entry of entries){
    const screenDir=join(out,'screen','g'+entry.born),manifest=readJSON(join(screenDir,'manifest.json')),
     screenRows=readTrialRecords(join(screenDir,'trials.ndjson'),manifest.plan.tasks).rows.filter(r=>r.candidateHash===entry.candidate.hash);
    const i=state.archive.indexOf(entry);state.archive[i]=evaluateEntry({...entry,refined:true},mergeRows(screenRows,result.rows.filter(r=>r.candidateHash===entry.candidate.hash)),goals,parties);
   }
  }
  state.current=null;
  const frontier=paretoFrontier(state.archive);
  writeJSON(join(out,'pareto.json'),frontier.map(({rows,...e})=>e));
  writeJSON(join(out,'ranked.json'),[...state.archive].sort((a,b)=>b.fitness.score-a.fitness.score).map(({rows,...e})=>e));
  saveComparison(out,state.archive,{title:'Ultimate Balance Act — '+algorithm,baselineHash:base.hash,complete:false,space});
  // Increment is persisted before entering the next generation so a crash
  // cannot replay a different proposal against already saved batches.
  state.generation=g+1;save();
  if(stopBoundary!==undefined&&state.generation>=stopBoundary)
   return stop('generation-boundary');
  state.generation=g;
 }
 const frontier=paretoFrontier(state.archive),finalists=chooseRefinements(frontier.filter(e=>e.candidate.hash!==base.hash),settings.finalists);
 state.finalists=finalists.map(e=>e.candidate);
 for(const [i,e] of finalists.entries()){
  writeJSON(join(out,'finalists','candidate-'+(i+1)+'.json'),e.candidate);
  writeJSON(join(out,'finalists','candidate-'+(i+1)+'-deck.json'),printableDeck(e.candidate));
  writeJSON(join(out,'finalists','candidate-'+(i+1)+'-diff.json'),e.diff);
  exportPrintProposal(e.candidate,join(out,'finalists','print-'+(i+1)));
 }
 if(validate&&finalists.length){
  if(!remaining())return stop('time-budget-before-confirmation');
  const {rows:holdoutRows,...confirmation}=await validateFinalists({candidates:state.finalists,goals,out:join(out,'confirmation'),workers,budgetMs:remaining(),seed,parties,runsPerParty:settings.holdoutRuns,
   tuningRows:state.archive.flatMap(e=>e.rows),maxTrials,profiles:holdoutProfiles});
  state.validation=confirmation;
  if(!state.validation.complete)return stop('confirmation-incomplete');
 }
 state.complete=true;state.stopReason=null;save();
 saveComparison(out,state.archive,{title:'Ultimate Balance Act — '+algorithm,baselineHash:base.hash,complete:true,validation:state.validation??null,space});
 return state;
}
