#!/usr/bin/env node
import {resolve} from 'node:path';
import {loadGoals} from '../src/balance/goals.js';
import {optimizeBalance} from '../src/balance/optimizer.js';
import {validateSearchSpace} from '../src/balance/mutations.js';
import {parseArguments,positiveNumber,loadCandidate,loadProfile,selectParties,loadJSON} from '../src/balance/cli.js';

const a=parseArguments(process.argv.slice(2),['--goals','--base','--workers','--budget-hours','--out','--seed','--population','--generations','--screen-runs','--refine-runs','--holdout-runs','--finalists','--profile','--parties','--algorithm','--space','--max-trials','--no-validate','--best-agent-only-validation','--dry-run','--help'],['--no-validate','--best-agent-only-validation','--dry-run','--help']);
if(a['--help']){
 console.log('node scripts/balance-optimize.mjs --goals experiments/balance-goals.json --base balanced-recovery-v1 --workers 8 --budget-hours 12 --out results/ultimate-balance\nOptional: --algorithm random|evolutionary --profile puct-c070-v1 (default) | reference-v1 --population N --generations N --screen-runs N --refine-runs N --holdout-runs N --finalists N --space file.json --no-validate --best-agent-only-validation --dry-run');
}else{
 const goals=loadGoals(a['--goals']),base=loadCandidate(a['--base']),search={};
 for(const [flag,key] of [['population','population'],['generations','generations'],['screen-runs','screenRuns'],['refine-runs','refineRuns'],['holdout-runs','holdoutRuns'],['finalists','finalists']])if(a['--'+flag]!==undefined)search[key]=positiveNumber(a['--'+flag],null,flag,{integer:true});
 if(a['--space']){const data=loadJSON(a['--space']);search.space=data.space??data;}
 validateSearchSpace(search.space??goals.search.space,{base});
 const options={goals,base,search,out:resolve(a['--out']??'results/ultimate-balance'),workers:positiveNumber(a['--workers'],8,'workers',{integer:true}),
  seed:positiveNumber(a['--seed'],20261020,'seed',{integer:true}),budgetMs:positiveNumber(a['--budget-hours'],12,'budget-hours')*3600000,
  profile:loadProfile(a['--profile']??'puct-c070-v1'),parties:selectParties(a['--parties']),algorithm:a['--algorithm']??'evolutionary',validate:!a['--no-validate'],bestAgentOnlyValidation:!!a['--best-agent-only-validation']};
 if(a['--max-trials']!==undefined)options.maxTrials=positiveNumber(a['--max-trials'],null,'max-trials',{integer:true,zero:true});
 if(a['--dry-run'])console.log(JSON.stringify(options,null,2));
 else{
  const result=await optimizeBalance(options);
  console.log(JSON.stringify({complete:result.complete,generations:result.generation,evaluated:result.archive.length,finalists:result.finalists?.map(c=>c.hash),stopReason:result.stopReason,out:options.out},null,2));
 }
}
