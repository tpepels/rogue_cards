#!/usr/bin/env node
import {resolve} from 'node:path';
import {compareAgents,agentPowerPlan} from '../src/balance/agent-comparison.js';
import {parseArguments,positiveNumber} from '../src/balance/cli.js';
const a=parseArguments(process.argv.slice(2),['--out','--workers','--seed','--screen-runs','--confirmation-runs','--budget-hours','--max-trials','--help','--dry-run'],['--help','--dry-run']);
if(a['--help'])console.log('node scripts/balance-compare-agents.mjs --workers 8 --budget-hours 12 --out results/uba-agent-comparison\nDefault sample size follows a conservative predeclared power bound. --dry-run prints the plan. Fixed canonical cards; separate screening and confirmation. No default changes.');
else console.log(JSON.stringify(await compareAgents({out:resolve(a['--out']??'results/uba-agent-comparison'),workers:positiveNumber(a['--workers'],8,'workers',{integer:true}),seed:positiveNumber(a['--seed'],20261020,'seed',{integer:true}),
 screenRuns:positiveNumber(a['--screen-runs'],16,'screen-runs',{integer:true}),confirmationRuns:positiveNumber(a['--confirmation-runs'],agentPowerPlan().runsPerParty,'confirmation-runs',{integer:true}),budgetMs:positiveNumber(a['--budget-hours'],12,'budget-hours')*3600000,dryRun:!!a['--dry-run'],
 maxTrials:a['--max-trials']===undefined?undefined:positiveNumber(a['--max-trials'],null,'max-trials',{integer:true,zero:true})}),null,2));
