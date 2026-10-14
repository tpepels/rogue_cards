import test from "node:test";
import assert from "node:assert/strict";
import {observedPrintedDataHashes,REVIEWED_CARD_HASHES,verifyPrintedData}
 from "../src/playtest.js";

// The historic Phase 5 approximation is intentionally not certified for
// the redesigned physical cards. Never 'fix' the baseline by copying new
// hashes: review its modeled effects first.
test("obsolete reduced simulator refuses changed printed card data",()=>{
 const observed=observedPrintedDataHashes();
 const drift=Object.keys(observed).filter(k=>observed[k]!==REVIEWED_CARD_HASHES[k]);
 assert.ok(drift.length>0,"The legacy baseline unexpectedly matches; review coverage");
 assert.throws(()=>verifyPrintedData(),/review Phase 5 simulation coverage/);
});
