import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidate} from '../src/balance/candidate.js';
import {compileCandidate,printableDiff,physicalChangeCount} from '../src/balance/compiler.js';
import {applyCardProposal,restrictCompensationSpace} from '../src/balance/card-impact.js';
import {DEFAULT_GOALS} from '../src/balance/goals.js';
import {exportPrintProposal} from '../src/balance/print.js';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('a new physical consumable compiles with printable deterministic healing and is protected during compensation',()=>{
 const {candidate,protectedCards}=applyCardProposal(createCandidate(),{schema:'uba-card-proposal-v1',action:'add',card:{type:'item',template:'consumable-v1',id:'uba-tonic',title:'Rescue Tonic',copies:2,ops:['HEAL:4']}});
 assert.ok(compileCandidate(candidate).items.some(i=>i.id==='uba-tonic'));
 assert.ok(printableDiff(candidate).changes.some(c=>c.id==='uba-tonic'&&c.kind==='added'));
 assert.deepEqual(protectedCards,['items:uba-tonic']);
});
test('removing copies is physical and cannot remove indispensable starting Items',()=>{
 const base=createCandidate(),p=compileCandidate(base),item=p.items.find(c=>c.id==='ex-rations');
 const {candidate}=applyCardProposal(base,{schema:'uba-card-proposal-v1',action:'remove',collection:'items',id:item.id,copies:1});
 const remaining=compileCandidate(candidate).items.find(c=>c.id===item.id)?.copies??0;
 assert.equal(remaining,item.copies-1);
 const starter=p.heroes[0].v2.starter;
 assert.throws(()=>applyCardProposal(base,{schema:'uba-card-proposal-v1',action:'remove',collection:'items',id:starter,copies:100}),/copies|starter|Missing|Invalid/);
});
test('designer restrictions remove protected cards from global stat operators',()=>{
 const space=restrictCompensationSpace(DEFAULT_GOALS.search.space,['monsters:rat']);
 const hp=space.find(d=>d.key==='monster-hp');
 assert.ok(hp.ids.length>0);assert.ok(!hp.ids.includes('rat'));
 assert.throws(()=>applyCardProposal(createCandidate(),{schema:'uba-card-proposal-v1',action:'add',card:{type:'item',template:'arbitrary-js',id:'unsafe-card',title:'Unsafe',copies:1,ops:['eval:code']}}),/Unsupported/);
});

test('REST-cost proposals merge with an already staged printed REST cost',()=>{
 const base=createCandidate({staging:{roomRestCost:{'ex-u-coal-store':2}}});
 const {candidate}=applyCardProposal(base,{schema:'uba-card-proposal-v1',action:'modify',collection:'rooms',id:'ex-u-coal-store',restCost:1});
 assert.equal(candidate.staging.roomRestCost['ex-u-coal-store'],1);
});

test('physical complexity counts extra copies consistently with search and confirmation',()=>{
 const base=createCandidate(),n=compileCandidate(base).items.find(c=>c.id==='ex-rations').copies;
 const c=createCandidate({staging:{cards:[{collection:'items',id:'ex-rations',set:{copies:n+7}}]}});
 assert.equal(physicalChangeCount(c),7);
});

test('print exports use the canonical renderer with exact proposed physical quantities',()=>{
 const out=mkdtempSync(join(tmpdir(),'uba-print-'));
 try{
  const c=createCandidate({staging:{cards:[{collection:'monsters',id:'rat',set:{copies:5,hp:8}}]}});
  const result=exportPrintProposal(c,out),html=readFileSync(result.html,'utf8');
  assert.equal((html.match(/data-id="rat"/g)??[]).length,5);
  assert.match(html,/Experimental proposal/);assert.match(html,/tt-sheet/);
  assert.equal(JSON.parse(readFileSync(join(out,'deck.json'))).filter(c=>c.id==='rat').length,5);
 }finally{rmSync(out,{recursive:true,force:true});}
});
