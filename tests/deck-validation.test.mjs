import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {CATALOGUE,PRINT_DECK,HEROES,ROOMS,OBJECTS,MONSTERS}
 from "../src/tabletop-data.js";

test("whole physical deck validates printed faces, executors, art mappings and A4",()=>{
 const dir=mkdtempSync(join(tmpdir(),"rogue-card-deck-check-"));
 try{
  const dest=join(dir,"deck-report.json");
  const p=spawnSync(process.execPath,
   ["scripts/validate-deck.mjs","--out",dest],
   {encoding:"utf8",maxBuffer:4*1024*1024});
  assert.equal(p.status,0,p.stderr+"\n"+p.stdout.slice(0,10000));
  const json=JSON.parse(readFileSync(dest,"utf8"));
  assert.deepEqual(json,JSON.parse(p.stdout));
  assert.equal(json.mechanicsAndPrintValid,true);
  assert.deepEqual(json.errors,[]);
  assert.equal(json.counts.uniqueCards,CATALOGUE.length);
  assert.equal(json.counts.physicalCards,PRINT_DECK.length);
  assert.equal(json.counts.rooms,ROOMS.length);
  assert.equal(json.counts.heroes,HEROES.length);
  assert.equal(json.counts.objects,OBJECTS.length);
  assert.equal(json.counts.regionalMonsters,MONSTERS.length);
  assert.equal(json.handlers.objects.objects,OBJECTS.length);
  assert.equal(json.handlers.rooms.rooms,ROOMS.length+16);
  assert.equal(json.fateRooms,10);
  assert.equal(json.art.mapped,CATALOGUE.length);
  assert.deepEqual(json.art.missingFiles,[]);
  assert.deepEqual(json.art.missingAssignments,[]);
  assert.equal(json.print.pages,
   Math.ceil(PRINT_DECK.length/json.print.cardsPerSheet));
  assert.equal(typeof json.uniqueArtworkComplete,"boolean");
 }finally{rmSync(dir,{recursive:true,force:true})}
});
