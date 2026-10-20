import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_GOALS} from '../src/balance/goals.js';
import {assessValidation,assertIndependentHoldout} from '../src/balance/validation.js';

test('validation rejects tuning trials and seed reuse instead of certifying training results',()=>{
 assert.throws(()=>assertIndependentHoldout([{seed:4,split:'screen'}],[]),/holdout/);
 assert.throws(()=>assertIndependentHoldout([{seed:4,split:'holdout'}],[{seed:4}]),/reused/);
 assert.equal(assertIndependentHoldout([{seed:5,split:'holdout'}],[{seed:4}]),true);
});
test('a few lucky outcomes cannot establish validation and missing Hero/pair coverage is explicit',()=>{
 const rows=[{party:'warrior',heroes:['warrior'],seed:5,split:'holdout',profile:'reference-v1',won:1,vaultReached:1,
  roomsCleared:36,ordinaryEncounters:18,ordinaryFights:11,healingRestored:6,healingWasted:1,ending:'win'}];
 const a=assessValidation({rows,baselineRows:rows,goals:DEFAULT_GOALS,profiles:['reference-v1','weak-v1']});
 assert.equal(a.status,'uncertain');
 assert.ok(a.reasons.some(s=>s.includes('coverage')));
 assert.ok(a.reasons.some(s=>s.includes('sample')));
 assert.equal(a.profiles.length,2);
});
test('observed hard hidden-healing violation rejects the candidate regardless of wins',()=>{
 const rows=[{party:'warrior',heroes:['warrior'],seed:5,split:'holdout',profile:'reference-v1',won:1,vaultReached:1,
  roomsCleared:36,ordinaryEncounters:18,ordinaryFights:11,healingRestored:6,healingWasted:1,ending:'win',postCombatHealTriggers:1}];
 const a=assessValidation({rows,baselineRows:rows,goals:DEFAULT_GOALS,profiles:['reference-v1']});
 assert.equal(a.status,'rejected');
});

test('empty or reduced policy sets cannot bypass the required robustness profiles',()=>{
 for(const profiles of [[],['reference-v1'],['reference-v1','reference-v1']]){
  const a=assessValidation({rows:[],goals:DEFAULT_GOALS,profiles});
  assert.equal(a.status,'uncertain');
  assert.ok(a.reasons.some(s=>s.includes('profile')));
 }
});
