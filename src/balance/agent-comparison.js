import {join} from 'node:path';
import {createCandidate} from './candidate.js';
import {getAgentProfile} from './profiles.js';
import {runLaboratory,ALL_PARTIES} from './runner.js';
import {pairedComparison,normalQuantile} from './statistics.js';
import {lockConfiguration,writeJSON} from './artifacts.js';

/** Conservative power bound for independent paired differences in [-1,1].
 * Predeclare a minimum useful lift and a larger effect the study can detect.
 * Hoeffding avoids guessing the unknown discordance rate between agents. */
export function agentPowerPlan({minimumImprovement=0.02,alternativeImprovement=0.1,power=0.8,confidence=0.95,familyComparisons=6}={}){
 if(!(minimumImprovement>=0&&alternativeImprovement>minimumImprovement&&alternativeImprovement<=1&&power>0&&power<1&&confidence>0&&confidence<1))throw Error('Invalid agent power assumptions');
 const gap=alternativeImprovement-minimumImprovement,
  pairs=Math.ceil(2*(Math.sqrt(Math.log(familyComparisons/(1-confidence)))+Math.sqrt(Math.log(1/(1-power))))**2/gap**2),
  runsPerParty=Math.max(128,Math.ceil(pairs/8));
 return {minimumImprovement,alternativeImprovement,power,confidence,familyComparisons,runsPerParty,soloPairs:runsPerParty*8,duoPairs:runsPerParty*28,
  confirmationTrials:runsPerParty*36*4,method:'Conservative Hoeffding bound for independent paired differences in [-1,1], simultaneous over three comparisons and both sizes.'};
}
export function assessAgents(rows,{profiles=['reference-v1','widening-v1','priors-v1','combined-v1'],minRunsPerParty=agentPowerPlan().runsPerParty,minimumImprovement=0.02,confidence=0.95}={}){
 if(rows.some(r=>r.split!=='agent-confirm'))throw Error('Agent assessment requires independent agent-confirm confirmation trials');
 const id=r=>r.profileId??(typeof r.profile==='string'?r.profile:r.profile?.id),reference=profiles[0],family=(profiles.length-1)*2,
  adjusted=1-(1-confidence)/Math.max(1,family),comparisons=[];
 for(const profile of profiles.slice(1)){
  const bySize={};let superior=true;
  for(const [size,length] of [['solo',1],['duo',2]]){
   const select=p=>rows.filter(r=>id(r)===p&&r.heroes.length===length).map(r=>({...r,profileHash:'fixed-game-agent-comparison',profile:'fixed-game-agent-comparison'}));
   const baseline=select(reference),candidate=select(profile),paired=pairedComparison(baseline,candidate,'won',{confidence:adjusted,samples:4000}),parties=ALL_PARTIES.filter(p=>p.length===length);
   const covered=parties.every(p=>candidate.filter(r=>r.party===p.join('+')).length>=minRunsPerParty&&baseline.filter(r=>r.party===p.join('+')).length>=minRunsPerParty);
   const enough=covered&&paired.pairs===candidate.length&&candidate.length>0;
   const superiorityLowerBound=paired.pairs?paired.difference-Math.sqrt(2*Math.log(Math.max(1,family)/(1-confidence))/paired.pairs):null;
   const confirmed=enough&&superiorityLowerBound>minimumImprovement;
   superior&&=Boolean(confirmed);
   bySize[size]={...paired,enough,confirmed,superiorityLowerBound,approxConservativeDetectableDifference:paired.pairs?normalQuantile((1+adjusted)/2)*Math.sqrt(0.5/paired.pairs):null};
  }
  comparisons.push({profile,bySize,status:superior?'superior':'uncertain'});
 }
 return {schema:'uba-agent-comparison-v1',reference,confidence:adjusted,family,minRunsPerParty,minimumImprovement,comparisons,
  recommendation:comparisons.filter(c=>c.status==='superior').map(c=>c.profile),
  defaultsChanged:false,interpretation:'Fixed canonical cards throughout. Superiority requires fresh confirmation in both solo and duo; no automatic profile promotion.'};
}
export async function compareAgents({out,workers=8,seed=20261020,screenRuns=16,confirmationRuns=agentPowerPlan().runsPerParty,budgetMs=12*3600000,maxTrials,dryRun=false}={}){
 const candidate=createCandidate(),profiles=['reference-v1','widening-v1','priors-v1','combined-v1'].map(getAgentProfile),started=Date.now();
 const powerPlan=agentPowerPlan();
 if(dryRun)return {candidate,profiles,screenRuns,confirmationRuns,powerPlan,screenTrials:screenRuns*36*4,confirmationTrials:confirmationRuns*36*4};
 lockConfiguration(join(out,'agent-comparison-lock.json'),{candidate,profiles,seed,screenRuns,confirmationRuns,powerPlan});
 const screen=await runLaboratory({candidates:[candidate],profiles,workers,seed,split:'screen',runsPerParty:screenRuns,out:join(out,'screen'),budgetMs,maxTrials});
 if(screen.errors.length)throw Error('Agent screening failed');
 if(!screen.complete)return {complete:false,stage:'screen',summary:screen.summary};
 const confirmation=await runLaboratory({candidates:[candidate],profiles,workers,seed,split:'agent-confirm',runsPerParty:confirmationRuns,out:join(out,'confirmation'),budgetMs:Math.max(0,budgetMs-(Date.now()-started)),maxTrials});
 if(confirmation.errors.length)throw Error('Agent confirmation failed');
 const tuningSeeds=new Set(screen.rows.map(r=>r.seed));
 if(confirmation.rows.some(r=>tuningSeeds.has(r.seed)))throw Error('Agent comparison confirmation overlaps screening');
 const assessment=assessAgents(confirmation.rows);
 const report={complete:confirmation.complete,assessment,powerPlan};
 writeJSON(join(out,'agent-comparison.json'),report);return report;
}
