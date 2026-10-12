import test from "node:test";
import assert from "node:assert/strict";
import {VAULT,WARDEN_FURY,OBJECTS} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {monsterRespond,seal} from "../src/expedition-campaign.js";

const magic=OBJECTS.find(o=>o.id==="scroll-flame");
test("the canonical Warden Unbound attacks at ATK 6 and Ruin deals exactly 1 HP to each Hero",()=>{
 assert.equal(WARDEN_FURY.atk,6);
 assert.match(WARDEN_FURY.behavior[2],/all Heroes lose 1 HP/);
 const s=new ExpeditionState({seed:777,heroes:["warrior","priest"]});
 s.beginRoom(VAULT);s.monster=WARDEN_FURY;s.monsterHP=WARDEN_FURY.hp;
 const before=s.heroes.map(h=>h.hp);
 s.die=()=>5; // Warden 5 is the 'Ruin' band, no attack dice required.
 monsterRespond(s,s.heroes[0]);
 assert.deepEqual(s.heroes.map(h=>h.hp),before.map(h=>h-1));
 assert.equal(s.metrics.damage,2);
});

test("two-Hero seal costs six magic cards, solo seal still costs three",()=>{
 assert.match(VAULT.v2.choices[1].effect,/3 MAGIC Items \(6 with two Heroes\)/);
 assert.ok(magic.v2.tags.includes("MAGIC"));
 const pair=new ExpeditionState({seed:811,heroes:["priest","wizard"]});
 pair.beginRoom(VAULT);
 // Remove naturally drawn MAGIC Items so the test exercises the exact threshold.
 for(const h of pair.heroes)for(const o of [...h.inventory])
  if(o.v2.tags.includes("MAGIC"))pair.remove(h,o);
 for(let i=0;i<5;i++)pair.add(pair.heroes[0],magic);
 assert.equal(pair.partyCount("MAGIC"),5);
 assert.equal(seal(pair),false);
 assert.equal(pair.metrics.sealAttempt,false);
 pair.add(pair.heroes[0],magic);
 assert.equal(pair.partyCount("MAGIC"),6);
 seal(pair);
 assert.equal(pair.metrics.sealAttempt,true);
 assert.equal(pair.metrics.spent,6);

 const solo=new ExpeditionState({seed:812,heroes:["priest"]});
 solo.beginRoom(VAULT);
 for(const o of [...solo.heroes[0].inventory])
  if(o.v2.tags.includes("MAGIC"))solo.remove(solo.heroes[0],o);
 for(let i=0;i<3;i++)solo.add(solo.heroes[0],magic);
 assert.equal(solo.partyCount("MAGIC"),3);
 seal(solo);
 assert.equal(solo.metrics.sealAttempt,true);
 assert.equal(solo.metrics.spent,3);
});
