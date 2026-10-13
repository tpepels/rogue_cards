import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {CATALOGUE} from "../src/tabletop-data.js";
import {emptyPlacements,normalizePlacements,placementCSS,PARTS} from "../src/card-layouts.js";

test("physical layout JSON matches checked-in generated CSS",async()=>{
 const data=normalizePlacements(JSON.parse(await readFile("data/card-placements.json","utf8")));
 const css=await readFile("styles/card-placements.css","utf8");
 assert.equal(placementCSS(data),css,"Run npm run layouts:build after importing the layout JSON.");
 const ids=new Set(CATALOGUE.map(c=>c.type+":"+c.id));
 for(const id of Object.keys(data.cards))assert.ok(ids.has(id),"Unknown card placement: "+id);
 assert.equal(CATALOGUE.length,139);
 assert.deepEqual(PARTS,["title","rules","results"]);
});
test("per-card CSS uses millimetres, independent title / rules / results overrides",()=>{
 const sample={
  version:1,units:"mm",
  cards:{"room:m-well":{
   title:{x:12.5,y:11,w:48},
   rules:{x:50,y:41,w:33,h:29},
   results:{x:3.5,y:78,w:42}
  }}
 };
 const css=placementCSS(sample);
 assert.match(css,/data-type="room"\]\[data-id="m-well"\] \.tt-title/);
 assert.match(css,/left:12.5mm/);
 assert.match(css,/width:33mm/);
 assert.match(css,/min-height:29mm/);
 assert.match(css,/height:auto/);
 assert.match(css,/tt-slip--results/);
 assert.doesNotMatch(css,/position:fixed|height:29mm/);
 assert.deepEqual(normalizePlacements(sample).cards["room:m-well"],sample.cards["room:m-well"]);
});
test("layout imports reject nonphysical sizes and CSS selector injection",()=>{
 for(const malformed of [
  {...emptyPlacements(),cards:{"room:m-well\"]{color:red}":{rules:{x:12}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{x:-2}}}},
  {...emptyPlacements(),cards:{"room:m-well":{title:{w:0}}}},
  {...emptyPlacements(),cards:{"room:m-well":{results:{x:NaN}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{position:"fixed"}}}},
  {version:2,units:"px",cards:{}}
 ])assert.throws(()=>normalizePlacements(malformed));
});
