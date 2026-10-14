import test from "node:test";
import assert from "node:assert/strict";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {prepareRolloutDecks,sampleRolloutDecks}
 from "../src/rollout-state.js";

const source=()=>new ExpeditionState({seed:881,heroes:["wizard"]});
const findPair=s=>{
 const counts=new Map();
 for(const card of s.deck)counts.set(card.id,(counts.get(card.id)||0)+1);
 const id=[...counts].find(([,n])=>n>=2)?.[0];
 assert.ok(id,"Expected at least one Item type with two physical copies");
 return s.deck.filter(c=>c.id===id).slice(0,2);
};
test("two physical copies never share exhaustion, once-per-room usage or equipment identity",()=>{
 const s=source(),h=s.heroes[0];
 const copies=findPair(s);
 assert.equal(copies.length,2,"Two physical copies must remain");
 const [a,b]=copies;
 assert.notStrictEqual(a,b,"Printed definition shared; physical cards distinct");
 assert.equal(a.id,b.id);
 assert.equal(new Set([a._physicalCopy,b._physicalCopy]).size,2);
 for(const card of copies){
  const index=s.deck.indexOf(card);
  assert.ok(index>=0);s.deck.splice(index,1);
  s.noteDeckRemoval(card);s.add(h,card);
 }
 assert.ok(h.inventory.includes(a)&&h.inventory.includes(b));
 s.exhausted.add(a);h.used.add(a);
 assert.ok(!s.exhausted.has(b),"Second copy cannot inherit exhaustion");
 assert.ok(!h.used.has(b),"Second copy cannot inherit ONCE PER ROOM use");
 assert.ok(h.inventory.includes(a)&&h.inventory.includes(b));
});
test("actual-state forks preserve each physical copy and inventory/slot aliases",()=>{
 const s=source(),h=s.heroes[0],copies=findPair(s);
 for(const c of copies){s.deck.splice(s.deck.indexOf(c),1);s.noteDeckRemoval(c);s.add(h,c)}
 h.slots.weapon=copies[1];s.exhausted.add(copies[0]);
 const fork=forkGameState(s),f=fork.heroes[0];
 assert.notStrictEqual(f,h);
 assert.strictEqual(f.slots.weapon,copies[1]);
 assert.ok(f.inventory.includes(f.slots.weapon));
 assert.ok(f.exhausted===undefined);
 assert.ok(fork.exhausted.has(copies[0]));
 assert.ok(!fork.exhausted.has(copies[1]));
 fork.exhausted.add(copies[1]);
 assert.equal(s.exhausted.has(copies[1]),false);
});
test("fair-information sampled Items use independent physical copies and conserved multiplicities",()=>{
 const s=source(),original=s.deck.map(x=>x.id);
 const blueprint=prepareRolloutDecks(s,"fair");
 const result=sampleRolloutDecks(s,{knowledge:"fair",deckSeed:1234,blueprint});
 assert.equal(result.deck.length,original.length);
 const pair=findPair({deck:result.deck});
 assert.equal(pair.length,2);
 assert.notStrictEqual(pair[0],pair[1]);
 assert.ok(result.deck.every(x=>x._physicalCard===true));
 assert.equal(new Set(result.deck).size,result.deck.length);
 assert.deepEqual(s.deck.map(x=>x.id),original,"Actual hidden deck unchanged");
});
