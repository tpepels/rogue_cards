import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAgents,agentPowerPlan} from '../src/balance/agent-comparison.js';

test('agent comparison predeclares enough independent trials for its detectable improvement',()=>{
 const plan=agentPowerPlan({minimumImprovement:0.02,alternativeImprovement:0.1,power:0.8});
 assert.ok(plan.runsPerParty>=128);
 assert.ok(plan.soloPairs>=8*128);
 assert.equal(plan.familyComparisons,6);
 assert.ok(plan.minimumImprovement<plan.alternativeImprovement);
});
test('screening and undersampled agents cannot be promoted from lucky outcomes',()=>{
 assert.throws(()=>assessAgents([{split:'screen'}]),/confirmation/);
 const report=assessAgents([]);
 assert.deepEqual(report.recommendation,[]);
 assert.equal(report.defaultsChanged,false);
 assert.ok(report.comparisons.every(c=>c.status==='uncertain'));
});
