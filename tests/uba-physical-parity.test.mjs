import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidate} from '../src/balance/candidate.js';
import {compileCandidate} from '../src/balance/compiler.js';
import {ExpeditionState} from '../src/engine/expedition-state.js';
import {sampleRolloutDecks,prepareRolloutDecks} from '../src/rollout-state.js';

test('fair sampling subtracts current Monster draw cycle after refill, including queued draws',()=>{
 const base=compileCandidate(createCandidate());
 const c=createCandidate({staging:{cards:base.monsters.filter(m=>m.stage==='UPPER').map(m=>({collection:'monsters',id:m.id,set:{copies:['rat','goblin'].includes(m.id)?1:0}}))}});
 const s=new ExpeditionState({seed:1,heroes:['warrior'],gameMode:'everything-goes',cardPools:compileCandidate(c)});
 for(let i=0;i<3;i++)s.nextMonster('UPPER');
 assert.equal(s.monsters.UPPER.length,1);
 for(const deckSeed of [1,2,3,4,5,6,7,8]){
  const sample=sampleRolloutDecks(s,{knowledge:'fair',deckSeed});
  assert.deepEqual(sample.monsters.UPPER.map(c=>c.id),s.monsters.UPPER.map(c=>c.id));
 }
 assert.equal(prepareRolloutDecks(s,'fair').monsters.UPPER.pool.length,1);
});

test('all duo starters are reserved before random starting Items consume their last physical copy',()=>{
 const c=createCandidate({staging:{cards:[{collection:'items',id:'shield',set:{copies:1}}]}});
 const s=new ExpeditionState({seed:2754103021,heroes:['warrior','knight'],gameMode:'everything-goes',cardPools:compileCandidate(c)});
 assert.ok(s.heroes[0].inventory.some(c=>c.id==='sword'));
 assert.ok(s.heroes[1].inventory.some(c=>c.id==='shield'));
 assert.ok(s.heroes.every(h=>h.inventory.length===2));
 const shields=[...s.deck,...s.heroes.flatMap(h=>h.inventory)].filter(c=>c.id==='shield');
 assert.equal(shields.length,1);
 assert.equal(prepareRolloutDecks(s,'fair').items.length,s.deck.length);
});
