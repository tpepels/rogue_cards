import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {CATALOGUE} from "../src/tabletop-data.js";
import {emptyPlacements,normalizePlacements,placementCSS,PARTS,DEFAULT_LAYERS} from "../src/card-layouts.js";

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
   title:{x:12.5,y:11,w:48,rotation:-8.25,zIndex:18},
   rules:{x:50,y:41,w:33,h:29,rotation:12,zIndex:40},
   results:{x:3.5,y:78,w:42,rotation:-3,zIndex:25}
  }}
 };
 const css=placementCSS(sample);
 assert.match(css,/data-type="room"\]\[data-id="m-well"\] \.tt-title/);
 assert.match(css,/left:12.5mm/);
 assert.match(css,/width:33mm/);
 assert.match(css,/min-height:29mm/);
 assert.match(css,/height:auto/);
 assert.match(css,/tt-slip--results/);
 assert.match(css,/transform:rotate\(-8.25deg\)/);
 assert.match(css,/transform:rotate\(12deg\)/);
 assert.match(css,/z-index:40/);
 assert.match(css,/z-index:18/);
 assert.match(css,/\.tt-collage\{z-index:auto;isolation:auto\}/);
 assert.match(css,/\.tt-collage > \.tt-content\{z-index:auto;isolation:auto\}/);
 assert.deepEqual(DEFAULT_LAYERS,{title:30,rules:20,results:21});
 assert.doesNotMatch(css,/position:fixed|[;\n]height:29mm/);
 assert.deepEqual(normalizePlacements(sample).cards["room:m-well"],sample.cards["room:m-well"]);
});
test("layout imports reject nonphysical sizes and CSS selector injection",()=>{
 for(const malformed of [
  {...emptyPlacements(),cards:{"room:m-well\"]{color:red}":{rules:{x:12}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{x:-2}}}},
  {...emptyPlacements(),cards:{"room:m-well":{title:{w:0}}}},
  {...emptyPlacements(),cards:{"room:m-well":{results:{x:NaN}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{position:"fixed"}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{rotation:181}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{rotation:-181}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{zIndex:0}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{zIndex:100}}}},
  {...emptyPlacements(),cards:{"room:m-well":{rules:{zIndex:1.5}}}},
  {version:2,units:"px",cards:{}}
 ])assert.throws(()=>normalizePlacements(malformed));
});

test("rotation-only edits do not disturb ordinary stacking or imported legacy files",()=>{
 const old={version:1,units:"mm",cards:{
  "hero:warrior":{title:{x:13,y:6,w:50}},
  "room:m-well":{rules:{rotation:0}}
 }};
 const css=placementCSS(old);
 assert.match(css,/transform:rotate\(0deg\)/);
 assert.doesNotMatch(css,/\.tt-collage\{z-index:auto/);
 assert.equal(normalizePlacements(old).cards["hero:warrior"].title.x,13);
 const cssWithZ=placementCSS({version:1,units:"mm",cards:{
  "hero:warrior":{rules:{zIndex:35}}
 }});
 assert.match(cssWithZ,/\.tt-title\{z-index:30\}/);
 assert.match(cssWithZ,/\.tt-slip--lead\{z-index:20\}/);
 assert.match(cssWithZ,/\.tt-slip--results\{z-index:21\}/);
 assert.match(cssWithZ,/\.tt-slip--lead\{\n z-index:35;\n\}/);
});

test("older angle and z drafts import as one canonical rotation/layer format",()=>{
 const legacy={version:1,units:"mm",cards:{
  "room:m-well":{rules:{x:40,angle:-12.5,z:45}}
 }};
 const result=normalizePlacements(legacy);
 assert.deepEqual(result.cards["room:m-well"].rules,
  {x:40,rotation:-12.5,zIndex:45});
 const css=placementCSS(result);
 assert.match(css,/transform:rotate\(-12.5deg\)/);
 assert.match(css,/z-index:45/);
 assert.doesNotMatch(JSON.stringify(result),/"angle"|"z":/);
});
