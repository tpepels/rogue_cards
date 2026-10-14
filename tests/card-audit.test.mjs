import test from "node:test";
import assert from "node:assert/strict";
import {auditCards} from "../src/card-audit.js";
import {ROOMS,VAULT,OBJECTS,WARDEN_FURY} from "../src/tabletop-data.js";
const text=card=>card.v2.choices?.map(c=>c.effect).join(" ")||"";
test("Phase 5 card audit covers all physical card families without inventing mechanics",()=>{
 const a=auditCards();
 assert.equal(a.cards,139);assert.equal(a.heroes,8);assert.equal(a.rooms,64);
 assert.equal(a.monsters,12);assert.equal(a.objects,52);assert.equal(a.wardenPhases,2);
 assert.equal(a.d6Monsters,14);
 assert.deepEqual(a.malformedRolls,[]);
 assert.deepEqual(a.duplicateCardIDs,[]);
 assert.deepEqual(a.brokenReferences,[]);
 assert.equal(a.declaredLinks,a.metadataOnlyLinks+a.printedLinkEvidence);
 assert.ok(a.declaredLinks>100);
 assert.ok(a.printedLinkEvidence>50);
 // A metadata link alone NEVER makes a mechanic executable. The audit makes
 // that explicit instead of treating 144 pointers as 144 real interactions.
 assert.ok(a.metadataOnlyLinks>0);
 console.log("PHASE5 PRINTED INTERACTION AUDIT:",JSON.stringify({
  uniqueCards:a.cards,d6Cards:a.d6Cards,monsterTables:a.d6Monsters,
  declaredLinks:a.declaredLinks,printedEvidence:a.printedLinkEvidence,
  metadataOnly:a.metadataOnlyLinks,unlinkedObjects:a.isolatedObjects.length
 }));
});
test("Phase 5 corrected actual ambiguous card text rather than changing general rules",()=>{
 const garden=ROOMS.find(r=>r.id==="m-fungus");
 const altar=ROOMS.find(r=>r.id==="m-altar");
 const well=ROOMS.find(r=>r.id==="u-fountain");
 const singing=ROOMS.find(r=>r.id==="m-treasure");
 assert.match(text(garden),/discard to set 1–2.*WIT.*DIS/);
 assert.match(text(altar),/1 other Item.*equipped CURSED Item/);
 assert.match(text(well),/REROLL.*new result/);
 assert.match(text(singing),/roll again and choose either/);
 assert.match(WARDEN_FURY.v2.weakness,/skips its next response/);
 assert.match(VAULT.v2.choices.find(c=>c.label==="SEAL").effect,/Discard 3 MAGIC Items/);
});
