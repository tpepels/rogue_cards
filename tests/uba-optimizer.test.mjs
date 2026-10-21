import test from 'node:test';
import assert from 'node:assert/strict';
import {proposePopulation,chooseRefinements} from '../src/balance/optimizer.js';
import {DEFAULT_GOALS} from '../src/balance/goals.js';
import {createCandidate} from '../src/balance/candidate.js';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {optimizeBalance} from '../src/balance/optimizer.js';
import {lockConfiguration} from '../src/balance/artifacts.js';

test('automatic generation is deterministic, bounded, jointly varies dimensions and caches hashes',()=>{
 const opts={space:DEFAULT_GOALS.search.space,seed:31,generation:0,population:6};
 const a=proposePopulation(opts),b=proposePopulation(opts);
 assert.deepEqual(a,b);
 assert.equal(a.length,6);
 assert.equal(new Set(a.map(x=>x.candidate.hash)).size,6);
 assert.ok(a.some(x=>x.candidate.staging.cards?.length&&x.candidate.staging.itemHealing&&x.candidate.staging.roomDeck));
 const next=proposePopulation({...opts,generation:1,archive:a.map(x=>({...x,fitness:{eligible:true,score:1,objectives:[1]}}))});
 assert.ok(next.every(x=>!a.some(old=>old.candidate.hash===x.candidate.hash)));
});
test('adaptive allocation retains Pareto compromises and reserves samples for uncertainty',()=>{
 const entries=[
 {candidate:{hash:'a'},fitness:{eligible:true,score:0.8,objectives:[1,0]}},
 {candidate:{hash:'b'},fitness:{eligible:true,score:0.7,objectives:[0,1]}},
 {candidate:{hash:'c'},fitness:{eligible:true,score:0.1,objectives:[0,0]}}
 ];
 assert.deepEqual(chooseRefinements(entries,2).map(x=>x.candidate.hash),['a','b']);
});

test('a neutral allele cannot duplicate the separately evaluated baseline',()=>{
 const base=createCandidate(),space=[{key:'hp',kind:'card-stat',collection:'monsters',field:'hp',offset:true,values:[0,-1]}];
 const entries=proposePopulation({base,space,seed:1,population:4});
 assert.ok(entries.every(e=>e.candidate.hash!==base.hash));
 assert.equal(entries.length,1);
});

test('optimizer resumes its exact proposed population and finished trials after a zero allocation',async()=>{
 const out=mkdtempSync(join(tmpdir(),'uba-opt-resume-'));
 const options={out,profile:'random-v1',parties:[['warrior']],workers:1,validate:false,
  search:{population:2,generations:2,screenRuns:1,refineRuns:1,finalists:1,
   space:[{key:'hp',kind:'card-stat',collection:'monsters',field:'hp',offset:true,values:[0,-1,-2]}]}};
 try{
  const first=await optimizeBalance({...options,maxTrials:0});
  assert.equal(first.complete,false);
  const hashes=first.current.population.map(e=>e.candidate.hash);
  const resumed=await optimizeBalance(options);
  assert.equal(resumed.complete,true);
  assert.deepEqual(resumed.archive.slice(0,hashes.length).map(e=>e.candidate.hash),hashes);
  const again=await optimizeBalance({...options,workers:2});
  assert.deepEqual(again.archive,resumed.archive);
  await assert.rejects(optimizeBalance({...options,seed:7}),/Incompatible/);
 }finally{rmSync(out,{recursive:true,force:true});}
});


test('generation boundary pause preserves refined results, original lock, and a resumable next generation',async()=>{
 const out=mkdtempSync(join(tmpdir(),'uba-opt-boundary-'));
 const options={out,profile:'random-v1',parties:[['warrior']],workers:1,validate:false,
  search:{population:1,generations:2,screenRuns:1,refineRuns:1,finalists:1,
   space:[{key:'hp',kind:'card-stat',collection:'monsters',field:'hp',offset:true,values:[-1,-2]}]}};
 try{
  await assert.rejects(optimizeBalance({...options,stopAfterGeneration:3}),/Invalid stopAfterGeneration/);
  const paused=await optimizeBalance({...options,stopAfterGeneration:1});
  assert.equal(paused.complete,false);
  assert.equal(paused.generation,1);
  assert.equal(paused.current,null);
  assert.equal(paused.stopReason,'generation-boundary');
  assert.ok(paused.archive.some(e=>e.refined));
  const archive=JSON.parse(readFileSync(join(out,'optimizer-state.json'))).archive;
  const lock=readFileSync(join(out,'optimizer-lock.json'),'utf8');
  const alreadyPaused=await optimizeBalance({...options,stopAfterGeneration:1});
  assert.equal(alreadyPaused.generation,1);
  assert.deepEqual(alreadyPaused.archive,archive);
  assert.equal(readFileSync(join(out,'optimizer-lock.json'),'utf8'),lock);
  const resumed=await optimizeBalance(options);
  assert.equal(resumed.complete,true);
  assert.equal(resumed.generation,2);
  assert.deepEqual(resumed.archive.slice(0,archive.length),archive);
  assert.equal(readFileSync(join(out,'optimizer-lock.json'),'utf8'),lock);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('fresh optimizer uses its single selected agent for independent confirmation',async()=>{
 const out=mkdtempSync(join(tmpdir(),'uba-opt-single-agent-'));
 try{
  await optimizeBalance({out,profile:'puct-c070-v1',workers:1,maxTrials:0,
   parties:[['warrior']],search:{population:1,generations:1,
    space:[{key:'hp',kind:'card-stat',collection:'monsters',field:'hp',offset:true,values:[-1]}]}});
  const lock=JSON.parse(readFileSync(join(out,'optimizer-lock.json'),'utf8')).configuration;
  assert.equal(lock.profile.id,'puct-c070-v1');
  assert.deepEqual(lock.validationProfiles.map(p=>p.id),['puct-c070-v1']);
 }finally{rmSync(out,{recursive:true,force:true});}
});


test('legacy optimizer can resume with recorded selected-agent-only holdout without discarding trials',async()=>{
 const out=mkdtempSync(join(tmpdir(),'uba-opt-puct-override-'));
 const options={out,profile:'puct-c070-v1',workers:1,maxTrials:0,parties:[['warrior']],
  search:{population:1,generations:1,space:[{key:'hp',kind:'card-stat',
   collection:'monsters',field:'hp',offset:true,values:[-1]}]}};
 try{
  await optimizeBalance({...options,validationProfiles:['puct-c070-v1','reference-v1','weak-v1']});
  const oldLock=readFileSync(join(out,'optimizer-lock.json'),'utf8');
  const oldState=readFileSync(join(out,'optimizer-state.json'),'utf8');
  const resumed=await optimizeBalance({...options,bestAgentOnlyValidation:true});
  assert.equal(resumed.complete,false);
  assert.equal(readFileSync(join(out,'optimizer-lock.json'),'utf8'),oldLock);
  const amendment=JSON.parse(readFileSync(join(out,'validation-policy-override.json'),'utf8')).configuration;
  assert.deepEqual(amendment.effectiveProfiles.map(p=>p.id),['puct-c070-v1']);
  assert.deepEqual(amendment.fromProfiles.map(p=>p.id),['puct-c070-v1','reference-v1','weak-v1']);
  assert.equal(JSON.parse(oldState).archive.length,JSON.parse(readFileSync(join(out,'optimizer-state.json'),'utf8')).archive.length);
  await optimizeBalance(options); // The saved amendment remains in effect without repeating the CLI flag.
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('optimizer rejects modified selection checkpoints before using their archive',async()=>{
 const out=mkdtempSync(join(tmpdir(),'uba-opt-checksum-'));
 const options={out,profile:'random-v1',parties:[['warrior']],validate:false,maxTrials:0,
  search:{population:1,generations:1,space:[{key:'hp',kind:'card-stat',collection:'monsters',field:'hp',offset:true,values:[-1]}]}};
 try{
  await optimizeBalance(options);
  const path=join(out,'optimizer-state.json'),state=JSON.parse(readFileSync(path));state.generation=1;
  writeFileSync(path,JSON.stringify(state));
  await assert.rejects(optimizeBalance(options),/checkpoint checksum/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('optimizer can reuse a locked checkpoint after source/Node changes',t=>{
 const out=mkdtempSync(join(tmpdir(),'uba-opt-source-resume-'));
 t.after(()=>rmSync(out,{recursive:true,force:true}));
 const path=join(out,'optimizer-lock.json');
 const previous={schema:'uba-optimizer-v1',seed:12,profile:{id:'puct-c070-v1'},source:{revision:'old',node:'v22',hash:'old'}};
 const original=lockConfiguration(path,previous);
 const updated={...previous,source:{revision:'new',node:'v26',hash:'new'}};
 assert.deepEqual(lockConfiguration(path,updated,{ignoreSource:true}),original);
 assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),original);
 assert.throws(()=>lockConfiguration(path,{...updated,seed:13},{ignoreSource:true}),/incompatible/i);
 assert.throws(()=>lockConfiguration(path,updated),/incompatible/i);
});
