#!/usr/bin/env node
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTrialPlan,runLaboratory,ALL_PARTIES} from '../src/balance/runner.js';
import {atomicWriteJSON} from '../src/balance/io.js';

const HELP=`Usage: node scripts/balance-run.mjs --candidates FILE[,FILE...]|DIRECTORY --out DIRECTORY [options]
  --factorial FILE        Generate candidates from a JSON {space:[dimensions]} design
  --workers N             Concurrent canonical trial workers (default 1)
  --runs N                Runs per party (alias --runs-per-party; default 1)
  --parties all|solo|duo|warrior,wizard,warrior+knight
  --profiles ID[,ID...]    Fixed version IDs or profile JSON files (default reference-v1)
  --seed N                Master uint32 seed (default 20261020)
  --split NAME            screen, refine, holdout, agent-screen, agent-confirm
  --budget-ms N           Cooperative wall-time cap; resume pending trials later
  --cpu-budget-ms N       Cooperative process CPU cap
  --max-trials N          Maximum new trials this invocation
  --max-game-steps N      Nonterminal guard (errors remain pending)
  --goals FILE            Versioned balance goals JSON
  --record-events         Include canonical event traces
  --dry-run               Validate candidates and print the exact plan; no writes
  --help                  Show this help
Candidate files may contain a manifest/spec, a JSON list, or {"candidates":[...]}.
Resume requires exactly the same scientific inputs and working-tree source bytes.
`;

function parse(args){
  const values={},candidatePaths=[];
  const flags=new Set(['--help','--dry-run','--record-events']);
  const names=new Set(['--candidate','--candidates','--factorial','--out','--workers','--runs','--runs-per-party','--parties','--profiles','--seed','--split','--budget-ms','--cpu-budget-ms','--max-trials','--max-game-steps','--goals']);
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(flags.has(key)){values[key]=true;continue;}
    if(!key.startsWith('-')){candidatePaths.push(key);continue;}
    if(!names.has(key))throw Error('Unknown option '+key);
    const value=args[++i];if(value===undefined||value.startsWith('--'))throw Error('Missing value for '+key);
    if(key==='--candidates'||key==='--candidate')candidatePaths.push(...value.split(',').filter(Boolean));
    else {if(Object.hasOwn(values,key))throw Error('Duplicate option '+key);values[key]=value;}
  }
  if(values['--runs']!==undefined&&values['--runs-per-party']!==undefined)throw Error('Use only one runs option');
  return {values,candidatePaths};
}
function candidateFiles(paths){
  return paths.flatMap(path=>{
    const absolute=resolve(path);
    return statSync(absolute).isDirectory()?readdirSync(absolute).filter(n=>n.endsWith('.json')).sort().map(n=>join(absolute,n)):[absolute];
  });
}
function readJSON(path){return JSON.parse(readFileSync(resolve(path),'utf8'));}
export async function main(args=process.argv.slice(2)){
  const {values:v,candidatePaths}=parse(args);
  if(v['--help']){process.stdout.write(HELP);return;}
  if(!candidatePaths.length&&!v['--factorial'])throw Error('Provide candidate JSON files or a directory with --candidates, or --factorial FILE');
  if(candidatePaths.length&&v['--factorial'])throw Error('--factorial and --candidates are mutually exclusive');
  if(!v['--dry-run']&&!v['--out'])throw Error('--out is required for a resumable run');
  const [{createCandidate},{compileCandidate,printableDiff,physicalChangeCount},{getAgentProfile},{loadGoals}]=await Promise.all([
    import('../src/balance/candidate.js'),import('../src/balance/compiler.js'),import('../src/balance/profiles.js'),import('../src/balance/goals.js')
  ]);
  const design=v['--factorial']?readJSON(v['--factorial']):null;
  let candidates;
  if(design){
    const {factorialCandidates}=await import('../src/balance/mutations.js');
    candidates=factorialCandidates({space:design.space,...(design.base?{base:createCandidate(design.base)}:{})});
  }else candidates=candidateFiles(candidatePaths).flatMap(path=>{
      const data=readJSON(path);return Array.isArray(data)?data:data.candidates??[data];
    }).map(spec=>createCandidate(spec));
  for(const c of candidates)compileCandidate(c);
  const profiles=(v['--profiles']??'reference-v1').split(',').flatMap(input=>{
    if(input.endsWith('.json')){const value=readJSON(input);return (Array.isArray(value)?value:[value]).map(getAgentProfile);}
    return [getAgentProfile(input)];
  });
  const partyArg=v['--parties']??'all';
  const parties=partyArg==='all'?ALL_PARTIES:partyArg==='solo'?ALL_PARTIES.filter(p=>p.length===1):partyArg==='duo'?ALL_PARTIES.filter(p=>p.length===2):partyArg.split(',').map(p=>p.split('+'));
  const options={candidates,profiles,parties,goals:loadGoals(v['--goals']),recordEvents:!!v['--record-events'],design};
  const numeric={'--workers':'workers','--runs':'runsPerParty','--runs-per-party':'runsPerParty','--seed':'seed','--budget-ms':'budgetMs','--cpu-budget-ms':'cpuBudgetMs','--max-trials':'maxTrials','--max-game-steps':'maxGameSteps'};
  for(const [key,name] of Object.entries(numeric))if(v[key]!==undefined){if(!v[key].trim())throw Error('Invalid '+key);options[name]=Number(v[key]);}
  if(v['--split'])options.split=v['--split'];
  if(v['--dry-run']){const plan=await buildTrialPlan(options);process.stdout.write(JSON.stringify(plan,null,2)+'\n');return plan;}
  options.out=v['--out'];
  const result=await runLaboratory(options);
  const {summarizeTrials,evaluateFitness}=await import('../src/balance/fitness.js');
  const {saveComparison,factorialContrasts}=await import('../src/balance/report.js');
  const entries=candidates.map(c=>{
    const rows=result.rows.filter(r=>r.candidateHash===c.hash),summary=summarizeTrials(rows,{confidence:options.goals.validation.confidence});
    const diff=printableDiff(c);
    return {candidate:c,rows,summary,diff,fitness:evaluateFitness(summary,options.goals,{physicalChanges:physicalChangeCount(c),expectedParties:parties})};
  });
  saveComparison(resolve(options.out),entries,{baselineHash:createCandidate().hash,complete:result.complete,title:design?'Ultimate Balance Act — designed factorial experiment':'Ultimate Balance Act — candidate laboratory',manifestId:result.manifest.id});
  if(design)atomicWriteJSON(join(resolve(options.out),'factorial.json'),{
    ...factorialContrasts({candidates,rows:result.rows,space:design.space}),
    byMetric:Object.fromEntries(['won','vaultReached','roomsCleared','ordinaryEncounters','ordinaryFights','damage','healingRestored','healingWasted'].map(metric=>
      [metric,factorialContrasts({candidates,rows:result.rows,space:design.space,metric})]))
  });
  process.stdout.write(JSON.stringify({manifestId:result.manifest.id,planned:result.manifest.plan.tasks.length,completed:result.rows.length,pending:result.pending,complete:result.complete,stopReason:result.stopReason,errors:result.errors,comparison:join(resolve(options.out),'comparison.json')},null,2)+'\n');
  if(result.errors.length)process.exitCode=1;
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.stack??error.message);process.exitCode=1;});
