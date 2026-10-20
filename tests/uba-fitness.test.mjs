import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateGoals} from '../src/balance/goals.js';
import {wilsonInterval,pairedComparison,stratifiedBootstrap,meanInterval,ratioInterval} from '../src/balance/statistics.js';
import {summarizeTrials,evaluateFitness,paretoFrontier} from '../src/balance/fitness.js';

const goals=()=>validateGoals(JSON.parse(readFileSync(new URL('../experiments/balance-goals.json',import.meta.url))));
const trial=(party,seed,won,extra={})=>({party,heroes:party.split('+'),seed,won,
 vaultReached:won,ordinaryEncounters:8,ordinaryFights:5,roomsCleared:18,
 healingRestored:4,healingWasted:2,damage:20,ending:won?'win':'death',...extra});

test('goals distinguish physical constraints, configurable duo targets and statistical acceptance',()=>{
 const g=goals();
 assert.deepEqual(g.objectives.soloVault.range,[0.5,0.7]);
 assert.equal(g.objectives.duoWin.target,0.55);
 assert.equal(g.constraints.postCombatHeal,0);
 assert.ok(g.validation.minTrialsPerParty>=32);
 assert.ok(Object.isFrozen(g.objectives));
 assert.throws(()=>validateGoals({...g,objectives:{...g.objectives,duoWin:{range:[0.8,0.2]}}}),/range/);
 assert.throws(()=>validateGoals({...g,validation:{...g.validation,minTrialsPerParty:0}}),/minTrials/);
});

test('zero observations remain unknown, and full 36-Room encounter counts stay separate',()=>{
 const s=summarizeTrials([trial('warrior',1,0),trial('warrior',2,1,{roomsCleared:36,ordinaryEncounters:17})]);
 assert.equal(s.solo.n,2);
 assert.equal(s.solo.conditionalWin,1);
 assert.equal(s.solo.encounters36,16.5);
 assert.equal(s.solo.complete36Encounters,17);
 assert.equal(s.duo.winRate,null);
 assert.deepEqual(s.solo.winCI,wilsonInterval(1,2));
 const none=summarizeTrials([]);
 assert.equal(none.solo.conditionalWin,null);
 assert.equal(evaluateFitness(none,goals()).eligible,false);
});

test('fitness penalizes missing Heroes and exposes a weak Hero instead of averaging it away',()=>{
 const s=summarizeTrials([trial('warrior',1,1),trial('rogue',1,0)]);
 const f=evaluateFitness(s,goals(),{physicalChanges:1});
 assert.equal(s.solo.minimumPartyWin,0);
 assert.ok(f.violations.some(x=>x.code==='coverage'));
 assert.ok(f.violations.some(x=>x.code==='hero-floor'));
 assert.equal(f.eligible,false);
});

test('Pareto selection retains distinct compromises and removes strictly inferior vectors',()=>{
 const a={id:'a',fitness:{eligible:true,objectives:[0.8,0.2]}},
 b={id:'b',fitness:{eligible:true,objectives:[0.2,0.8]}},
 c={id:'c',fitness:{eligible:true,objectives:[0.1,0.1]}};
 assert.deepEqual(paretoFrontier([a,b,c]).map(x=>x.id),['a','b']);
});

test('paired comparisons enforce matching Hero, profile and seed and preserve clustered uncertainty',()=>{
 const a=[trial('warrior',1,0),trial('rogue',1,1)],
 b=[trial('warrior',1,1),trial('rogue',1,1)];
 const c=pairedComparison(a,b,'won');
 assert.equal(c.pairs,2);assert.equal(c.difference,0.5);
 assert.equal(c.partyClusters,2);
 assert.equal(pairedComparison(a,[trial('warrior',9,1)],'won').pairs,0);
 assert.throws(()=>pairedComparison([...a,a[0]],b,'won'),/Duplicate/);
 assert.deepEqual(stratifiedBootstrap(a,'won',{seed:5,samples:100}),stratifiedBootstrap(a,'won',{seed:5,samples:100}));
});

test('different player profiles are reported separately and cannot form one optimization score',()=>{
 const rows=[trial('warrior',1,0,{profileHash:'reference'}),trial('warrior',1,1,{profileHash:'stronger'})];
 const s=summarizeTrials(rows),f=evaluateFitness(s,goals(),{expectedParties:['warrior']});
 assert.equal(s.byProfile.reference.solo.winRate,0);
 assert.equal(s.byProfile.stronger.solo.winRate,1);
 assert.ok(f.violations.some(v=>v.code==='mixed-agents'));
 assert.equal(f.eligible,false);
});

test('missing waste telemetry stays unknown and cannot satisfy a zero-waste objective',()=>{
 const row=trial('warrior',1,1);delete row.healingWasted;
 const s=summarizeTrials([row]),f=evaluateFitness(s,goals(),{expectedParties:['warrior']});
 assert.equal(s.solo.healingWasteFraction,null);
 assert.ok(f.missingMetrics.includes('healingWaste'));
 assert.equal(f.eligible,false);
});

test('objective vectors stay aligned when JSON keys are reordered',()=>{
 const g=goals(),reordered={...g,objectives:Object.fromEntries(Object.entries(g.objectives).reverse())},s=summarizeTrials([trial('warrior',1,1)]);
 assert.deepEqual(evaluateFitness(s,g),evaluateFitness(s,reordered));
});

test('paired bootstrap retains separate profile cells',()=>{
 const a=[trial('warrior',1,0,{profileHash:'a'}),trial('warrior',1,1,{profileHash:'b'})],
 b=[trial('warrior',1,1,{profileHash:'a'}),trial('warrior',1,0,{profileHash:'b'})];
 const c=pairedComparison(a,b,'won',{samples:100});
 assert.equal(c.difference,0);
 assert.ok(c.interval[0]<=0&&c.interval[1]>=0);
});

test('missing hard limits and malformed flags cannot disable goal constraints',()=>{
 const g=structuredClone(goals());delete g.constraints.maxPhysicalChanges;
 assert.throws(()=>validateGoals(g),/maxPhysicalChanges/);
 for(const [section,key]of[['constraints','requireAllPairs'],['constraints','requireAllHeroes'],['validation','requireTargetIntervals']]){
  const broken=structuredClone(goals());broken[section][key]='false';assert.throws(()=>validateGoals(broken),/boolean/);
 }
});

test('continuous and encounter-ratio uncertainty retain whole-expedition replication',()=>{
 const rows=[trial('warrior',1,0),trial('warrior',2,1,{ordinaryFights:3})];
 assert.equal(ratioInterval(rows,'ordinaryFights','ordinaryEncounters').estimate,0.5);
 assert.ok(ratioInterval(rows,'ordinaryFights','ordinaryEncounters').interval[0]<0.5);
 assert.deepEqual(meanInterval(rows,'ordinaryEncounters').interval,[8,8]);
 assert.equal(meanInterval([rows[0]],'ordinaryEncounters').interval,null);
 assert.equal(ratioInterval([trial('warrior',1,0,{ordinaryEncounters:0})],'ordinaryFights','ordinaryEncounters').interval,null);
 const summary=summarizeTrials(rows);
 assert.ok(summary.solo.fightConversionCI);
 assert.ok(summary.solo.encounters36CI);
});
