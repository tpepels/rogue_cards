import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {AGENT_PROFILES,getAgentProfile} from '../src/balance/profiles.js';
import {balanceEquipmentMode,balanceImplicitHeuristicMode} from '../src/balance/trial.js';
import {buildTrialPlan} from '../src/balance/runner.js';
import {createCandidate} from '../src/balance/candidate.js';

test('PUCT c0.70 is a separate immutable profile, with frozen study search controls',()=>{
 const p=getAgentProfile('puct-c070-v1');
 assert.equal(p.id,'puct-c070-v1');
 assert.equal(p.budget,32);
 assert.equal(p.exploration,0.2);
 assert.equal(p.implicitWeight,0.5);
 assert.equal(p.implicitHeuristicMode,'solo-threat');
 assert.equal(p.equipmentMode,'solo-pragmatic');
 assert.equal(p.mctsPragmaticVariant,'tree-only');
 assert.equal(p.softTreeBonus,0.15);
 assert.equal(p.softTreeFirstVisitProbability,0.75);
 assert.equal(p.softRolloutProbability,0.75);
 assert.equal(p.implicitHpScale,1);
 assert.equal(p.implicitThreatScale,1);
 assert.equal(p.maxSearchSteps,5000);
 assert.equal(p.searchProfile,'classic');
 assert.equal(p.treeMode,'frontier');
 assert.equal(p.knowledge,'fair');
 assert.equal(p.nodePriors,true);
 assert.equal(p.progressiveWidening,false);
 assert.equal(p.puctC,0.7);
 assert.equal(getAgentProfile({...p}),p);
 assert.throws(()=>getAgentProfile({...p,puctC:0.35,hash:undefined}),/retune/);
 assert.throws(()=>getAgentProfile({...p,budget:16,hash:undefined}),/retune/);
 assert.equal(getAgentProfile('reference-v1').nodePriors,false);
 assert.equal(getAgentProfile('reference-v1').budget,8);
 assert.equal(getAgentProfile('priors-v1').puctC,0.35);
 assert.equal(AGENT_PROFILES['weak-v1'].budget,2);
});

test('solo retains pragmatic simulation and duo gets existing legal party equipment mode',()=>{
 const p=getAgentProfile('puct-c070-v1');
 assert.equal(balanceEquipmentMode(p,['warrior']),'solo-pragmatic');
 assert.equal(balanceEquipmentMode(p,['warrior','knight']),'party-efficient');
 assert.equal(balanceEquipmentMode(getAgentProfile('reference-v1'),['warrior','knight']),'party-efficient');
 assert.equal(balanceImplicitHeuristicMode(p,['warrior']),'solo-threat');
 assert.equal(balanceImplicitHeuristicMode(p,['warrior','knight']),'legacy');
});

test('UBA trial manifests retain the pinned PUCT identity separately from old agents',async()=>{
 const plan=await buildTrialPlan({candidates:[createCandidate()],
  profiles:['reference-v1','puct-c070-v1'],parties:[['warrior'],['warrior','knight']],
  runsPerParty:1,seed:20261020});
 assert.equal(plan.tasks.length,4);
 const p=plan.config.profiles.find(x=>x.id==='puct-c070-v1');
 assert.equal(p.hash,getAgentProfile('puct-c070-v1').hash);
 assert.equal(p.profile.puctC,0.7);
 assert.equal(p.profile.progressiveWidening,false);
 for(const party of ['warrior','warrior+knight']){
  const rows=plan.tasks.filter(x=>x.party===party);
  assert.equal(rows.length,2);
  assert.equal(rows[0].seed,rows[1].seed);
  assert.notEqual(rows[0].profileHash,rows[1].profileHash);
 }
});

test('UBA optimizer CLI selects PUCT and includes it in holdout, without changing goals',()=>{
 const r=spawnSync(process.execPath,['scripts/balance-optimize.mjs','--dry-run',
  '--parties','solo','--population','1','--generations','1'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const options=JSON.parse(r.stdout);
 assert.equal(options.profile.id,'puct-c070-v1');
 assert.equal(options.goals.id,'balanced-recovery-targets-v1');
});

test('real solo and duo PUCT trials terminate with canonical UBA telemetry', {timeout:600000},async()=>{
 const {playBalanceTrial}=await import('../src/balance/trial.js');
 const fragile=createCandidate({staging:{cards:['warrior','knight'].map(id=>({
  collection:'heroes',id,set:{hp:1,atk:1,def:0,wit:1}
 }))}});
 for(const heroes of [['warrior'],['warrior','knight']]){
  const result=playBalanceTrial({candidate:fragile,heroes,seed:20261021,
   profile:'puct-c070-v1',maxGameSteps:3000});
  assert.ok(['win','death','escape'].includes(result.ending));
  assert.equal(result.profileId,'puct-c070-v1');
  assert.equal(result.profileHash,getAgentProfile('puct-c070-v1').hash);
  assert.ok(result.decisions>0);
  assert.ok(Number.isFinite(result.searchMs));
  assert.equal(result.heroes.length,heroes.length);
 }
});
