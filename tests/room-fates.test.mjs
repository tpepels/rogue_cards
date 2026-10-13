import test from "node:test";
import assert from "node:assert/strict";
import {ROOMS,OBJECTS,VAULT} from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {sealCost} from "../src/expedition-campaign.js";
import {verifyRoomCoverage} from "../src/room-effect-model.js";
const room=id=>{const c=ROOMS.find(r=>r.id===id);assert.ok(c,id);return c;};
const expedition=(seed=211)=>new ExpeditionState({seed,heroes:["warrior"]});
const choose=(s,id,n)=>{const card=room(id);s.beginRoom(card);s.apply("ROOM_FATE",[String(n)],card);};
const vault=s=>s.beginRoom(VAULT);
test("ten ordinary Rooms encode distinct retained choices, without extra d6 tables",()=>{
 assert.equal(ROOMS.filter(r=>r.v2.fate).length,10);
 assert.equal(verifyRoomCoverage().rooms,65);
 for(const c of ROOMS.filter(r=>r.v2.fate)){
  assert.equal(c.v2.choices.length,2);
  assert.equal(c.v2.roll,null);
  assert.ok(c.v2.choices.every(x=>x.effect.includes("Keep this Room")||x.effect.includes("Keep it")));
 }
});
test("a planted Item returns in Deep without pretending it was redrawn",()=>{
 const s=expedition();const h=s.heroes[0],before=h.inventory.length;
 const acquisitions={...s.metrics.objectAcquisitions};
 choose(s,"u-bone-seed",0);
 assert.equal(h.inventory.length,before-1);
 assert.ok(s.keptRooms.some(x=>x.card.id==="u-bone-seed"&&x.item));
 s.beginRoom(room("d-shadow"));
 assert.equal(h.inventory.length,before+2);
 assert.equal(s.keptRooms.filter(x=>x.card.id==="u-bone-seed").length,0);
 // Only the two new drawn Items count as deck acquisitions.
 const deltas=Object.entries(s.metrics.objectAcquisitions).reduce((n,[k,v])=>n+v-(acquisitions[k]||0),0);
 assert.equal(deltas,2);
});
test("cartographer's promise comes due when Deep is first entered",()=>{
 const s=expedition();choose(s,"u-cartographer",0);
 const scans=s.metrics.scouted;
 s.beginRoom(room("d-shadow"));
 assert.equal(s.metrics.scouted,scans+1);
 assert.equal(s.keptRooms.filter(x=>x.card.id==="u-cartographer").length,0);
});
test("a spared Deep Monster does not consume another delayed Monster effect",()=>{
 const s=expedition();choose(s,"u-hollow-knight",0);choose(s,"m-choir-nails",0);
 s.returnChoices["u-hollow-knight"]="escape";
 s.beginRoom(room("d-shadow"));s.drawMonster();
 assert.equal(s.monster,null);
 assert.ok(s.keptRooms.some(x=>x.card.id==="m-choir-nails"));
 s.drawMonster();
 assert.ok(s.monster);
 assert.equal(s.monsterDis,true);
 assert.equal(s.keptRooms.filter(x=>x.card.id==="m-choir-nails").length,0);
});
test("inscribing or blotting changes the actual solo SEAL Item cost",()=>{
 const good=expedition();choose(good,"u-scribe-dust",0);vault(good);
 assert.equal(sealCost(good),2);
 const bad=expedition();choose(bad,"u-scribe-dust",1);vault(bad);
 assert.equal(sealCost(bad),4);
});
test("the Ferryman holds an actual Item until the Vault",()=>{
 const s=expedition();const h=s.heroes[0],count=h.inventory.length;
 choose(s,"m-ferryman-oath",0);
 assert.equal(h.inventory.length,count-1);
 vault(s);
 assert.equal(h.inventory.length,count);
 assert.equal(s.keptRooms.length,0);
});
test("the hourglass and drowned banner modify the final encounter",()=>{
 const s=expedition();choose(s,"m-hourglass",0);choose(s,"m-drowned-banner",0);
 vault(s);
 assert.equal(s.vaultModifiers.omen,"high");
 assert.equal(s.vaultModifiers.wardenDamage,3);
 const other=expedition();choose(other,"m-hourglass",1);choose(other,"m-drowned-banner",1);
 vault(other);
 assert.equal(other.vaultModifiers.omen,"low");
 assert.equal(other.vaultModifiers.wardenFirstAdv,true);
});
test("the Sleeping Crown changes what kind of ending is affordable",()=>{
 const wears=expedition();choose(wears,"d-sleeping-crown",0);vault(wears);
 assert.equal(sealCost(wears),4);assert.equal(wears.vaultModifiers.heroFirstAdv,true);
 const breaks=expedition();
 const magic=OBJECTS.find(x=>x.v2.tags?.includes("MAGIC"));
 assert.ok(magic);breaks.add(breaks.heroes[0],magic);
 choose(breaks,"d-sleeping-crown",1);vault(breaks);
 assert.equal(sealCost(breaks),2);
});
test("freeing versus silencing the witness yields different lasting endings",()=>{
 const frees=expedition();choose(frees,"d-last-witness",0);vault(frees);
 assert.match(frees.endingMemory,/witness escapes/);
 const silences=expedition();choose(silences,"d-last-witness",1);vault(silences);
 assert.match(silences.endingMemory,/remains lost/);
 assert.deepEqual(frees.fateChoices.map(x=>x.choice),["FREE"]);
 assert.deepEqual(silences.fateChoices.map(x=>x.choice),["SILENCE"]);
});
