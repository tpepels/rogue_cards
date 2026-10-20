#!/usr/bin/env node
import {existsSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {loadGoals} from '../src/balance/goals.js';
import {createCandidate} from '../src/balance/candidate.js';
import {validateFinalists} from '../src/balance/validation.js';
import {parseArguments,positiveNumber,loadCandidate,loadProfile,loadJSON,selectParties} from '../src/balance/cli.js';

const a=parseArguments(process.argv.slice(2),['--candidate','--candidates','--goals','--out','--runs','--workers','--seed','--budget-hours','--profiles','--parties','--tuning','--human-feedback','--max-trials','--help'],['--help']);
if(a['--help'])console.log('node scripts/balance-validate.mjs --candidate finalist.json --out results/uba-validation [--tuning optimizer-state.json] [--profiles reference-v1,weak-v1] [--runs 32]');
else{
 if(Boolean(a['--candidate'])===Boolean(a['--candidates']))throw Error('Provide --candidate or --candidates');
 const candidates=a['--candidate']?[loadCandidate(a['--candidate'])]:readdirSync(resolve(a['--candidates'])).filter(p=>/^candidate-\d+\.json$/.test(p)).sort().map(p=>loadCandidate(join(a['--candidates'],p)));
 if(!candidates.length)throw Error('No candidate manifests found');
 const goals=loadGoals(a['--goals']),out=resolve(a['--out']??'results/ultimate-balance-validation');
 const tuning=a['--tuning']?loadJSON(a['--tuning']):null,tuningRows=tuning?.archive?.flatMap(e=>e.rows)??tuning?.rows??[];
 const result=await validateFinalists({candidates,goals,out,tuningRows,profiles:a['--profiles']?.split(',').map(loadProfile)??goals.validation.profiles,
  parties:selectParties(a['--parties']),runsPerParty:positiveNumber(a['--runs'],goals.search.holdoutRuns,'runs',{integer:true}),workers:positiveNumber(a['--workers'],8,'workers',{integer:true}),
  seed:positiveNumber(a['--seed'],20261020,'seed',{integer:true}),budgetMs:positiveNumber(a['--budget-hours'],12,'budget-hours')*3600000,
  humanFeedback:a['--human-feedback']?loadJSON(a['--human-feedback']):null,maxTrials:a['--max-trials']===undefined?undefined:positiveNumber(a['--max-trials'],null,'max-trials',{integer:true,zero:true})});
 const text=['# UBA independent confirmation','',result.complete?'Plan complete.':'PARTIAL plan.','',...result.entries.flatMap(e=>['## '+e.candidate.id,'',e.assessment.status.toUpperCase(),'',...[...e.assessment.failures,...e.assessment.reasons].map(s=>'- '+s),''])].join('\n');
 writeFileSync(join(out,'validation.md'),text);
 console.log(JSON.stringify({complete:result.complete,out,candidates:result.entries.map(e=>({id:e.candidate.id,status:e.assessment.status,reasons:e.assessment.reasons.length,failures:e.assessment.failures}))},null,2));
}
