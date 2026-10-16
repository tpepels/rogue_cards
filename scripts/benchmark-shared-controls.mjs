#!/usr/bin/env node
/**
 * Real canonical complete-expedition A/B benchmark. Both variants have
 * identical per-card samples, seeds, Hero parties, MCTS and printed rules;
 * only the duplicate reference full-game work is eliminated.
 */
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {ALL_CARD_ROSTER,evaluateCardTrial,evaluateSharedControl}
 from "../src/all-card-study.js";
import {loadNativeMcts} from "../src/native-mcts-node.js";
const args=process.argv.slice(2);
if(args.some(x=>!["--native-hash","--runs","--cards"].includes(x)&&
 !/^[0-9]+$/.test(x)))throw Error("Unknown benchmark option");
const named=(name,value)=>{
 const i=args.indexOf(name);return i===-1?value:Number(args[i+1]);
};
const runs=named("--runs",2),count=named("--cards",6);
if(!Number.isInteger(runs)||runs<1||runs>12||
 !Number.isInteger(count)||count<2||count>40)
 throw Error("--runs must be 1..12, --cards 2..40");
const native=args.includes("--native-hash");
if(native)loadNativeMcts({required:true});
const roster=ALL_CARD_ROSTER.filter(c=>c.kind==="room").slice(0,count);
const c={seed:20261016,budget:2,maxSearchSteps:4000,
 maxGameSteps:7000,nativeHash:native};
const comparable=result=>result.kind==="paired"?
 {kind:result.kind,seed:result.seed,index:result.index,
  control:{won:result.control.won,escaped:result.control.escaped,
   ending:result.control.ending,exposure:result.control.exposure,
   decisions:result.control.decisions,searches:result.control.searches,
   cycleBreaks:result.control.cycleBreaks},
  treatment:result.treatment}:
 result;
let totalBaseline=0,totalShared=0,checked=0;
for(let i=0;i<runs;i++){
 const referenceStart=performance.now();
 const ordinary=roster.map(card=>evaluateCardTrial(card,i,c));
 totalBaseline+=performance.now()-referenceStart;
 const sharedStart=performance.now();
 const baseline=evaluateSharedControl(roster[0],i,c);
 const reused=roster.map(card=>evaluateCardTrial(card,i,c,baseline));
 totalShared+=performance.now()-sharedStart;
 for(let j=0;j<roster.length;j++){
  assert.deepEqual(comparable(reused[j]),comparable(ordinary[j]),
   "Canonical parity failed for "+roster[j].id+" #"+i);
  checked++;
 }
 console.error("Verified canonical shared-control batch "+(i+1)+"/"+runs);
}
console.log(JSON.stringify({
 schema:"canonical-shared-baseline-benchmark-v1",
 fullGameCanonicalParity:true,independentIndices:runs,
 cardsPerIndex:roster.length,cardTrials:checked,
 ordinaryTotalMs:+totalBaseline.toFixed(2),
 sharedTotalMs:+totalShared.toFixed(2),
 throughputSpeedup:+(totalBaseline/totalShared).toFixed(3),
 nativeHash:native,
 note:"Benchmarked real terminal expeditions; runtime varies by card and seed"
},null,2));
