import test from "node:test";
import assert from "node:assert/strict";
import {pairedAgentStatistics} from "../scripts/study-mcts-agent-strength.mjs";

const row=(i,a,b,baselineEffort=2,candidateEffort=16)=>({
 i,baseline:{won:a,requestedRollouts:baselineEffort},
 candidate:{won:b,requestedRollouts:candidateEffort}
});
test("agent strength study treats one independent initial seed as one paired observation",()=>{
 const stats=pairedAgentStatistics([row(0,0,1),row(1,1,0),
  row(2,1,1),row(3,0,0)]);
 assert.equal(stats.independentPairs,4);
 assert.equal(stats.improvedSeeds,1);
 assert.equal(stats.worsenedSeeds,1);
 assert.equal(stats.tiedSeeds,2);
 assert.equal(stats.pairedDifference,0);
 assert.equal(stats.exactMcNemarP,1);
 assert.equal(stats.computationalEffortRatio,8);
 assert.equal(stats.verdict,"UNDERPOWERED");
});
test("matched statistical test only claims stronger policy with adequate independent evidence",()=>{
 const rows=Array.from({length:120},(_,i)=>row(i,
  i<70?0:1,i<70?1:1));
 const stats=pairedAgentStatistics(rows);
 assert.equal(stats.independentPairs,120);
 assert.equal(stats.improvedSeeds,70);
 assert.equal(stats.worsenedSeeds,0);
 assert.equal(stats.pairedDifference,70/120);
 assert.ok(stats.exactMcNemarP<0.05);
 assert.equal(stats.verdict,"EVIDENCE_CANDIDATE_BETTER");
});
test("strength comparison cannot infer superiority from more simulations or from unpaired losses",()=>{
 const stats=pairedAgentStatistics(Array.from({length:120},(_,i)=>
  row(i,1,0,3,27)));
 assert.equal(stats.verdict,"EVIDENCE_CANDIDATE_WORSE");
 assert.equal(stats.computationalEffortRatio,9);
 assert.throws(()=>pairedAgentStatistics([row(0,0,7)]),
  /Invalid paired terminal result/);
});
