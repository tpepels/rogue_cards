#!/usr/bin/env node
import {resolve} from 'node:path';
import {analyzeCardImpact} from '../src/balance/card-impact.js';
import {loadGoals} from '../src/balance/goals.js';
import {parseArguments,positiveNumber,loadJSON,loadCandidate,loadProfile,selectParties} from '../src/balance/cli.js';
const a=parseArguments(process.argv.slice(2),['--card','--base','--goals','--out','--workers','--seed','--budget-hours','--profile','--parties','--runs','--restrictions','--population','--generations','--screen-runs','--refine-runs','--holdout-runs','--max-trials','--no-validate','--help'],['--no-validate','--help']);
if(a['--help'])console.log('node scripts/balance-card-impact.mjs --card experiments/uba-new-tonic.json --base balanced-recovery-v1 --workers 8 --out results/uba-card-impact\nOptional --restrictions JSON {protectedCards:["monsters:rat"],space:[...]}');
else{
 if(!a['--card'])throw Error('Provide --card proposal JSON');
 const goals=loadGoals(a['--goals']),restrictions=a['--restrictions']?loadJSON(a['--restrictions']):{},search={};
 for(const [flag,key] of [['population','population'],['generations','generations'],['screen-runs','screenRuns'],['refine-runs','refineRuns'],['holdout-runs','holdoutRuns']])if(a['--'+flag])search[key]=positiveNumber(a['--'+flag],null,flag,{integer:true});
 const result=await analyzeCardImpact({proposal:loadJSON(a['--card']),base:loadCandidate(a['--base']),goals,out:resolve(a['--out']??'results/uba-card-impact'),
  workers:positiveNumber(a['--workers'],8,'workers',{integer:true}),seed:positiveNumber(a['--seed'],20261020,'seed',{integer:true}),budgetMs:positiveNumber(a['--budget-hours'],12,'budget-hours')*3600000,
  runsPerParty:positiveNumber(a['--runs'],1,'runs',{integer:true}),profile:loadProfile(a['--profile']),parties:selectParties(a['--parties']),
  protectedCards:restrictions.protectedCards??[],space:restrictions.space??goals.search.space,search,validate:!a['--no-validate'],
  maxTrials:a['--max-trials']===undefined?undefined:positiveNumber(a['--max-trials'],null,'max-trials',{integer:true,zero:true})});
 console.log(JSON.stringify({complete:result.complete,patches:result.patches?.length??0,conclusion:result.conclusion??'Partial impact trial plan.'},null,2));
}
