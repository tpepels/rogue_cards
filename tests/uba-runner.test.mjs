import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {getAgentProfile} from '../src/balance/profiles.js';

const runner = () => import('../src/balance/runner.js');
const candidate = Object.freeze({schema:'uba-candidate-v1',id:'control',base:'balanced-recovery-v1',hash:'test-plan-only'});
const profile = getAgentProfile({...getAgentProfile('weak-v1'),id:'plan-test-v1',budget:1,hash:undefined});
const options = {candidates:[candidate],profiles:[profile],seed:123,runsPerParty:2};
const temp = t => { const out=mkdtempSync(join(tmpdir(),'uba-runner-'));t.after(()=>rmSync(out,{recursive:true,force:true}));return out; };
const isolatedRunner=async t=>{
  const root=temp(t);mkdirSync(join(root,'src','balance'),{recursive:true});
  writeFileSync(join(root,'package.json'),'{"type":"module"}');
  cpSync(new URL('../src/',import.meta.url),join(root,'src'),{recursive:true});
  return {root,...await import(join(root,'src','balance','runner.js'))};
};

test('plans all 36 physical parties and pairs seeds across candidates and profiles', async()=>{
  const {buildTrialPlan,ALL_PARTIES}=await runner();
  assert.equal(ALL_PARTIES.filter(p=>p.length===1).length,8);
  assert.equal(ALL_PARTIES.filter(p=>p.length===2).length,28);
  const plan=await buildTrialPlan({...options,candidates:[candidate,{...candidate,id:'other',hash:'other'}],profiles:[profile,getAgentProfile({...profile,id:'other-profile-v1',hash:undefined})]});
  assert.equal(plan.tasks.length,288);
  assert.equal(new Set(plan.tasks.map(t=>t.id)).size,288);
  const paired=plan.tasks.filter(t=>t.party==='warrior'&&t.repeat===0);
  assert.equal(paired.length,4);
  assert.equal(new Set(paired.map(t=>t.seed)).size,1);
  assert.equal(new Set(plan.tasks.filter(t=>t.candidateId==='control'&&t.profileId==='plan-test-v1').map(t=>t.seed)).size,72);
});

test('split seed domains are disjoint and repeat seeds survive larger or reordered plans',async()=>{
  const {buildTrialPlan}=await runner();
  const all=[];
  for(const split of ['screen','refine','holdout','agent-confirm','agent-screen']){
    const p=await buildTrialPlan({...options,split});all.push(...p.tasks.map(t=>t.seed));
    const small=await buildTrialPlan({...options,split,runsPerParty:1,parties:[['knight','warrior'],['wizard']]});
    for(const task of small.tasks)assert.deepEqual(task,p.tasks.find(t=>t.id===task.id));
  }
  assert.equal(new Set(all).size,360);
  await assert.rejects(buildTrialPlan({...options,parties:[['warrior'],['warrior']]}),/duplicate/i);
  await assert.rejects(buildTrialPlan({...options,split:'made-up'}),/split/i);
});

test('zero-cap checkpoints reject scientific config changes while allowing scheduling changes',async t=>{
  const {runLaboratory}=await runner(),out=temp(t);
  const first=await runLaboratory({...options,out,maxTrials:0});
  assert.equal(first.complete,false);assert.equal(first.rows.length,0);assert.equal(first.pending,72);
  const second=await runLaboratory({...options,out,maxTrials:0,workers:2,budgetMs:0});
  assert.equal(first.manifest.id,second.manifest.id);
  for(const change of [{seed:124},{runsPerParty:3},{profiles:[getAgentProfile({...profile,budget:2,hash:undefined})]},{candidates:[{...candidate,staging:{}}]},{recordEvents:true}]){
    await assert.rejects(runLaboratory({...options,out,maxTrials:0,...change}),/incompatible|provenance/i);
  }
  const summary=JSON.parse(readFileSync(join(out,'summary.json'),'utf8'));
  assert.equal(summary.completed,0);assert.equal(summary.planned,72);
});

test('checkpoints retain exact dirty runtime source bytes and reject a corrupted snapshot',async t=>{
 const {runLaboratory}=await runner(),out=temp(t),opts={...options,out,maxTrials:0};
 await runLaboratory(opts);
 const snapshot=join(out,'source-snapshot','src','balance','runner.js');
 assert.equal(readFileSync(snapshot,'utf8'),readFileSync(new URL('../src/balance/runner.js',import.meta.url),'utf8'));
 writeFileSync(snapshot,'corrupted source');
 await assert.rejects(runLaboratory(opts),/snapshot checksum/);
});

test('checkpoint loader rejects corrupt, duplicate and unplanned records; recovers only a partial tail',async t=>{
  const {runLaboratory}=await runner(),out=temp(t),opts={...options,out,maxTrials:0,parties:[['warrior']]};
  const result=await runLaboratory(opts),task=result.manifest.plan.tasks[0];
  const {canonicalJSON}=await import('../src/balance/io.js');
  const row={...task,won:0,ending:'death'};
  const record={schema:'uba-trial-record-v1',row,checksum:createHash('sha256').update(canonicalJSON(row)).digest('hex')};
  const path=join(out,'trials.ndjson');
  writeFileSync(path,JSON.stringify(record)+'\n'+JSON.stringify(record)+'\n');
  await assert.rejects(runLaboratory(opts),/duplicate/i);
  writeFileSync(path,JSON.stringify({...record,checksum:'bad'})+'\n');
  await assert.rejects(runLaboratory(opts),/checksum/i);
  const fake={...row,id:'invented'};
  writeFileSync(path,JSON.stringify({...record,row:fake,checksum:createHash('sha256').update(canonicalJSON(fake)).digest('hex')})+'\n');
  await assert.rejects(runLaboratory(opts),/unplanned/i);
  writeFileSync(path,JSON.stringify(record)+'\n{"row":');
  const recovered=await runLaboratory(opts);
  assert.equal(recovered.rows.length,1);assert.equal(recovered.recoveredTail,true);
  assert.equal(readFileSync(path,'utf8'),JSON.stringify(record)+'\n');
  appendFileSync(path,'broken\n');await assert.rejects(runLaboratory(opts),/corrupt/i);
});

test('a crashed output owner can resume, but a live owner cannot share its checkpoint',async t=>{
  const {runLaboratory}=await runner(),out=temp(t),opts={...options,out,maxTrials:0};
  writeFileSync(join(out,'.laboratory.lock'),JSON.stringify({pid:2147483647}));
  assert.equal((await runLaboratory(opts)).rows.length,0);
  writeFileSync(join(out,'.laboratory.lock'),JSON.stringify({pid:process.pid}));
  await assert.rejects(runLaboratory(opts),/locked/i);
});

test('resume rejects changed dirty runtime source even when git HEAD is unchanged',async t=>{
  const {runLaboratory,root}=await isolatedRunner(t),out=temp(t),opts={...options,out,maxTrials:0};
  await runLaboratory(opts);
  const source=join(root,'src','balance','changed-source.js');
  try{
    writeFileSync(source,'// temporary runtime source fingerprint test\n');
    await assert.rejects(runLaboratory(opts),/provenance/i);
  }finally{rmSync(source,{force:true});}
  assert.equal((await runLaboratory(opts)).rows.length,0);
});

test('real terminal trials agree across workers and resume without resampling',async t=>{
  const {runLaboratory}=await runner();
  const {createCandidate}=await import('../src/balance/candidate.js');
  const {AGENT_PROFILES,getAgentProfile}=await import('../src/balance/profiles.js');
  const spec={...AGENT_PROFILES['weak-v1'],id:'runner-smoke-v1',budget:1};delete spec.hash;
  // Real printable low-HP candidates keep the integration exercise cheap while
  // retaining canonical decisions, search, dice and terminal resolution.
  const fragile=createCandidate({staging:{cards:['warrior','wizard'].map(id=>({collection:'heroes',id,set:{hp:1,atk:1,def:0,wit:1}}))}});
  const opts={candidates:[fragile],profiles:[getAgentProfile(spec)],parties:[['warrior'],['wizard']],seed:987,runsPerParty:1};
  const out=temp(t),first=await runLaboratory({...opts,out,maxTrials:1});
  assert.equal(first.rows.length,1,JSON.stringify(first.errors));assert.equal(first.pending,1);assert.equal(first.complete,false);
  const resumed=await runLaboratory({...opts,out,workers:2});
  assert.equal(resumed.rows.length,2);assert.equal(resumed.complete,true);
  assert.deepEqual(resumed.rows[0],first.rows[0]);
  const parallel=await runLaboratory({...opts,workers:2});
  const reproducible=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>!/(?:elapsed|wall|searchMs|runtime|duration|cpu)/i.test(k))));
  assert.equal(parallel.complete,true);assert.equal(parallel.errors.length,0);
  assert.deepEqual(reproducible(resumed.rows),reproducible(parallel.rows));
  assert.ok(first.rows[0].decisions>0);
});

test('wall/CPU caps and interrupts leave pending work, and nonterminal errors never become losses',async t=>{
  const {runLaboratory}=await runner(),{createCandidate}=await import('../src/balance/candidate.js');
  const opts={candidates:[createCandidate()],profiles:['weak-v1'],parties:[['warrior']],out:temp(t)};
  for(const cap of [{budgetMs:0},{cpuBudgetMs:0},{signal:AbortSignal.abort()}]){
    const result=await runLaboratory({...opts,...cap});
    assert.equal(result.rows.length,0);assert.equal(result.pending,1);assert.equal(result.errors.length,0);assert.equal(result.complete,false);
  }
  const result=await runLaboratory({...opts,out:temp(t),maxGameSteps:1,workers:2});
  assert.equal(result.rows.length,0);assert.equal(result.pending,1);
  assert.equal(result.stopReason,'trial-error');assert.match(result.errors[0].message,/NONTERMINAL/);
});

test('CLI consumes arbitrary candidate directories and validates a dry-run without writing output',async t=>{
  const dir=temp(t),out=join(dir,'output');
  writeFileSync(join(dir,'candidate.json'),JSON.stringify([{id:'first'}]));
  const processResult=spawnSync(process.execPath,['scripts/balance-run.mjs','--candidates',dir,'--parties','knight+warrior','--profiles','weak-v1','--runs','2','--split','agent-screen','--out',out,'--dry-run'],{encoding:'utf8',maxBuffer:2**20});
  assert.equal(processResult.status,0,processResult.stderr);
  const plan=JSON.parse(processResult.stdout);
  assert.equal(plan.tasks.length,2);assert.equal(plan.tasks[0].party,'warrior+knight');assert.equal(plan.tasks[0].profile,'weak-v1');
  assert.equal(plan.config.split,'agent-screen');
  assert.throws(()=>readFileSync(join(out,'manifest.json')),/ENOENT/);
  const invalid=spawnSync(process.execPath,['scripts/balance-run.mjs','--wat'],{encoding:'utf8'});
  assert.equal(invalid.status,1);assert.match(invalid.stderr,/Unknown option/);
});

test('CLI factorial designs share the generic laboratory and save full comparisons',async t=>{
  const dir=temp(t),design=join(dir,'design.json'),out=join(dir,'out');
  writeFileSync(design,JSON.stringify({space:[{key:'hero-hp',kind:'card-stat',collection:'heroes',id:'warrior',field:'hp',values:[18,19]}]}));
  const result=spawnSync(process.execPath,['scripts/balance-run.mjs','--factorial',design,'--parties','warrior','--profiles','weak-v1','--max-trials','0','--out',out],{encoding:'utf8',maxBuffer:2**20});
  assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.plan.config.candidates.length,2);
  const comparison=JSON.parse(readFileSync(join(out,'comparison.json'),'utf8'));
  assert.equal(comparison.entries.length,2);assert.equal(comparison.complete,false);
  assert.match(readFileSync(join(out,'comparison.md'),'utf8'),/PARTIAL/);
  assert.equal(JSON.parse(readFileSync(join(out,'factorial.json'),'utf8')).effects.length,1);
});

test('workers also execute from an ESM eval caller without inheriting input-only flags',()=>{
  const source=`import {runLaboratory} from './src/balance/runner.js';
    import {createCandidate} from './src/balance/candidate.js';
    const result=await runLaboratory({candidates:[createCandidate()],profiles:['weak-v1'],parties:[['warrior']],maxGameSteps:1});
    console.log(JSON.stringify(result.errors));`;
  const result=spawnSync(process.execPath,['--input-type=module','--eval',source],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.match(JSON.parse(result.stdout)[0].message,/NONTERMINAL/);
});

test('runtime source changes after planning leave trials pending with provenance errors',async t=>{
  const {runLaboratory,root}=await isolatedRunner(t),{createCandidate}=await import('../src/balance/candidate.js');
  const {getAgentProfile}=await import('../src/balance/profiles.js');
  const source=join(root,'src','balance','changed-source.js');
  try{
    let changed=false;
    const run=runLaboratory({candidates:[createCandidate()],profiles:[getAgentProfile('weak-v1')],parties:[['warrior']],maxGameSteps:1,
      onProgress(){if(!changed){changed=true;writeFileSync(source,'// changed after source capture\n');}}});
    const result=await run;
    assert.equal(result.rows.length,0);assert.equal(result.pending,1);assert.match(result.errors[0].message,/provenance/i);
  }finally{rmSync(source,{force:true});}
});

test('real object profiles are normalized and validated before their plan identity is hashed',async t=>{
  const {buildTrialPlan,runLaboratory,root}=await isolatedRunner(t);
  const {getAgentProfile}=await import(join(root,'src/balance/profiles.js'));
  const {createCandidate}=await import(join(root,'src/balance/candidate.js'));
  const spec={...getAgentProfile('weak-v1'),id:'normalization-v1',budget:1};delete spec.hash;
  const normalized=getAgentProfile(spec),omittedKind={...normalized};delete omittedKind.policyKind;
  const opts={candidates:[createCandidate({staging:{cards:[{collection:'heroes',id:'warrior',set:{hp:1,atk:1,def:0,wit:1}}]}})],parties:[['warrior']],seed:1};
  const expected=await buildTrialPlan({...opts,profiles:[normalized]});
  for(const input of [omittedKind,Object.fromEntries(Object.entries(omittedKind).filter(([key])=>key!=='hash'))]){
    const plan=await buildTrialPlan({...opts,profiles:[input]});
    assert.deepEqual(plan,expected);
  }
  for(const invalid of [{...spec,budget:0},{...spec,policyKind:'unknown'},{...spec,hash:'incorrect'}]){
    await assert.rejects(buildTrialPlan({...opts,profiles:[invalid]}),/profile|hash/i);
  }
  delete omittedKind.hash;
  const result=await runLaboratory({...opts,profiles:[omittedKind]});
  assert.equal(result.complete,true,JSON.stringify(result.errors));
  assert.equal(result.rows[0].profileHash,normalized.hash);
});

test('wall and signal caps terminate active high-budget searches promptly and resume the same plan',async t=>{
  const {root}=await isolatedRunner(t);
  const source=`import {runLaboratory} from ${JSON.stringify(join(root,'src/balance/runner.js'))};
    import {createCandidate} from ${JSON.stringify(join(root,'src/balance/candidate.js'))};
    import {getAgentProfile} from ${JSON.stringify(join(root,'src/balance/profiles.js'))};
    const spec={...getAgentProfile('reference-v1'),id:'high-budget-v1',budget:100000};delete spec.hash;
    const config={candidates:[createCandidate()],profiles:[getAgentProfile('random-v1'),getAgentProfile(spec)],parties:[['warrior']]};
    for(const kind of ['wall','signal','cpu']){
      let timeout,abortTimer;
      const controller=new AbortController();
      const opts={...config,out:${JSON.stringify(join(root,'checkpoint'))}+'-'+kind};
      const saved=await runLaboratory({...opts,maxTrials:1});
      if(saved.rows.length!==1||saved.pending!==1||saved.errors.length)throw Error('Failed to checkpoint the real control trial');
      if(kind==='signal')abortTimer=setTimeout(()=>controller.abort(),200);
      try{
        const result=await Promise.race([
          runLaboratory({...opts,...(kind==='wall'?{budgetMs:200}:kind==='cpu'?{cpuBudgetMs:100}:{signal:controller.signal})}),
          new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error(kind+' cap exceeded 2500ms')),2500);})
        ]);
        if(result.rows.length!==1||JSON.stringify(result.rows)!==JSON.stringify(saved.rows)||result.pending!==1||result.errors.length||result.complete)throw Error('Interrupted task was recorded or checkpointed rows changed: '+JSON.stringify(result.errors));
        if(result.stopReason!==(kind==='wall'?'time-budget':kind==='cpu'?'cpu-budget':'interrupt'))throw Error('Unexpected stop reason '+result.stopReason);
        const resumed=await runLaboratory({...opts,maxTrials:0});
        if(resumed.manifest.id!==result.manifest.id||resumed.pending!==1||JSON.stringify(resumed.rows)!==JSON.stringify(saved.rows))throw Error('Resume changed scientific inputs or saved rows');
      }finally{clearTimeout(timeout);clearTimeout(abortTimer);}
    }
    console.log('capped and resumable');`;
  const result=spawnSync(process.execPath,['--input-type=module','--eval',source+'\n'],{encoding:'utf8',timeout:9000,killSignal:'SIGKILL'});
  assert.equal(result.status,0,result.stderr||result.error?.message);
  assert.match(result.stdout,/capped and resumable/);
});
