import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidate} from '../src/balance/candidate.js';
import {compileCandidate} from '../src/balance/compiler.js';
import {validateSearchSpace,candidateFromGenes,randomGenes,mutateGenes,recombineGenes,factorialCandidates} from '../src/balance/mutations.js';
import {randomSource} from '../src/balance/statistics.js';

const space=[
 {key:'encounters',kind:'room-transfer',stage:'UPPER',from:'u-shrine',to:'u-nest',values:[0,1]},
 {key:'monster',kind:'card-stat',collection:'monsters',field:'hp',offset:true,values:[-1,0]},
 {key:'healing',kind:'item-healing',id:'ex-bandages',values:[2,4]}
];
test('factorial crosses physical Rooms, Monster statistics and recovery with eight valid immutable configurations',()=>{
 const candidates=factorialCandidates({space});
 assert.equal(candidates.length,8);
 assert.equal(new Set(candidates.map(c=>c.hash)).size,8);
 const p=compileCandidate(candidates.at(-1));
 assert.equal(p.items.find(i=>i.id==='ex-bandages').v2.healingAmount,4);
 assert.equal(p.rooms.length,54);
 assert.ok(Object.isFrozen(candidates[0]));
});
test('seeded mutation and recombination stay inside allowed bounds and preserve their parents',()=>{
 const a=randomGenes(space,randomSource(12)),b=randomGenes(space,randomSource(98));
 assert.deepEqual(a,randomGenes(space,randomSource(12)));
 const before=structuredClone(a),child=mutateGenes(a,space,randomSource(3),1);
 assert.deepEqual(a,before);
 assert.notDeepEqual(child,a);
 const crossed=recombineGenes(a,b,space,randomSource(7));
 for(const d of space){assert.ok([a[d.key],b[d.key]].includes(crossed[d.key]));assert.ok(child[d.key]>=0&&child[d.key]<d.values.length);}
});
test('search rejects agent parameters, unsafe rules, duplicate genes and protected edits before simulating',()=>{
 assert.throws(()=>validateSearchSpace([{key:'mcts',kind:'agent',values:[1]}]),/Unsupported/);
 assert.throws(()=>validateSearchSpace([...space,space[0]]),/Duplicate/);
 assert.throws(()=>validateSearchSpace([space[1]],{protectedCards:['monsters:rat']}),/protected/);
 assert.throws(()=>candidateFromGenes({space,genes:{encounters:9,monster:0,healing:0}}),/gene/);
 const base=createCandidate();
 assert.equal(base.base,'balanced-recovery-v1');
});
