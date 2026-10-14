/** Canonical, exhaustive card/handler/printing audit. JSON report to stdout.
 * npm run validate:deck -- --out deck-validation.json
 * Separate npm test covers stateful interactions and full-game rules.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {CATALOGUE,PRINT_DECK,HEROES,ROOMS,VAULT,OBJECTS,MONSTERS,WARDEN_CARDS}
 from "../src/tabletop-data.js";
import {CARD_ART,cardMarkup,printSheets,CARDS_PER_SHEET}
 from "../src/tabletop-view.js";
import {verifyPrintedData} from "../src/playtest.js";
import {verifyObjectCoverage,bandFor} from "../src/effect-model.js";
import {verifyRoomCoverage,ROOM_EFFECTS} from "../src/room-effect-model.js";
import {auditCards} from "../src/card-audit.js";

const ROOT=fileURLToPath(new URL("../",import.meta.url));
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==="--out"&&args[1]))
 throw Error("Usage: npm run validate:deck -- [--out path]");
const errors=[],warnings=[];
const check=(ok,msg)=>{if(!ok)errors.push(msg)};
const key=c=>c.type+":"+c.id;
const count=(arr,p)=>arr.filter(p).length;
const types=Object.fromEntries(["hero","room","monster","item","potion"]
 .map(type=>[type,count(CATALOGUE,c=>c.type===type)]));
check(HEROES.length===8,"Expected eight Heroes");
check(ROOMS.length===64,"Expected 64 regional Rooms; review additions before revising the deck contract");
check(MONSTERS.length===12,"Expected 12 regional Monsters");
check(WARDEN_CARDS.length===2,"Expected two Warden phases");
check(OBJECTS.length===52,"Expected 52 Objects (Items and Potions)");
check(CATALOGUE.length===139,"Expected 139 unique cards");
check(new Set(CATALOGUE.map(key)).size===CATALOGUE.length,
 "Duplicate card type/id");
check(new Set(CATALOGUE.map(c=>c.id)).size===CATALOGUE.length,
 "Duplicate card identifier");
check(PRINT_DECK.length===CATALOGUE.reduce((a,c)=>a+c.copies,0),
 "Physical copy counts do not match printDeck");
for(const c of CATALOGUE){
 const id=key(c);
 check(!!(c.id&&c.title&&c.type&&c.art&&c.v2),id+" missing required printed metadata");
 check(Number.isInteger(c.copies)&&c.copies>=1,id+" has invalid copies");
 // Monsters print a four-band behavior table instead of a single `rule`
 // field. Absence of `rule` is canonical for all 14 Monster cards.
 if(c.type!=="monster")
  check(!!String(c.rule||"").trim(),id+" has no instruction");
 if(c.type==="hero"||c.type==="monster"){
  for(const k of ["hp","atk","def"])
   check(Number.isInteger(c[k])&&c[k]>0,id+" invalid "+k);
  if(c.type==="hero")
   check(Number.isInteger(c.wit)&&c.wit>0,id+" invalid WIT");
  else check(Array.isArray(c.behavior)&&c.behavior.length===4,
   id+" needs all four Monster behaviors");
 }
 if(c.type==="room"){
  check(c.v2.choices?.length===2,id+" requires two choices");
  check(!!c.stage,id+" missing stage");
  if(!c.v2.roll)check(c.v2.fate===true||c.id==="d-gilded",
   id+" has no d6 table without fate or no-roll corridor exemption");
 }
 if(c.v2?.roll)for(let face=1;face<=6;face++){
  try{
   const entry=c.v2.roll.outcomes[bandFor(c,face)];
   check(!!entry?.effect,id+" missing printed outcome at "+face);
  }catch(e){errors.push(id+" / d6 "+face+": "+e.message)}
 }
 try{
  const html=cardMarkup(c);
  check(html.includes('data-id="'+c.id+'"'),id+" missing printed data-id");
  check(html.includes("tt-collage"),id+" has no collage illustration");
 }catch(e){errors.push(id+" cannot print: "+e.message)}
}
let objectCoverage=null,roomCoverage=null,editorial=null;
try{objectCoverage=verifyObjectCoverage()}catch(e){errors.push("Object handler audit: "+e.message)}
try{roomCoverage=verifyRoomCoverage()}catch(e){errors.push("Room handler audit: "+e.message)}
try{editorial=auditCards()}catch(e){errors.push("Editorial audit: "+e.message)}
try{verifyPrintedData()}catch(e){errors.push("Canonical card checksum: "+e.message)}
if(editorial){
 for(const id of editorial.malformedRolls)errors.push("Malformed d6: "+id);
 for(const id of editorial.duplicateCardIDs)errors.push("Duplicate card: "+id);
 for(const o of editorial.brokenReferences)
  errors.push("Broken card reference: "+o.object+" => "+o.room);
}
const fateRooms=ROOMS.filter(c=>c.v2.fate);
check(fateRooms.length===10,"Expected ten fate Rooms");
for(const c of fateRooms){
 const handler=ROOM_EFFECTS[c.id];
 check(handler?.choices?.length===2&&handler?.outcomes.length===0,
  c.id+" needs two printed fate choices without invented dice");
 check(handler?.choices?.every((ops,i)=>
  ops.length===1&&ops[0]==="ROOM_FATE:"+i),
  c.id+" printed fate choices not dispatched");
}
const art={mapped:0,missingAssignments:[],missingFiles:[],
 borrowed:[],shared:[],owned:0,uniqueFiles:0};
const owner=new Map();
const slug=name=>name.normalize("NFKD").toLowerCase()
 .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_")
 .replace(/^_+|_+$/g,"");
for(const c of CATALOGUE){
 const id=key(c),file=CARD_ART[id];
 if(!file){art.missingAssignments.push(id);continue}
 art.mapped++;
 if(!existsSync(join(ROOT,"assets","illustrations",file)))
  art.missingFiles.push(id+" => "+file);
 if(!owner.has(file))owner.set(file,[]);
 owner.get(file).push(id);
 if(!new RegExp("^\\d+_"+slug(c.title)+"\\.png$").test(file))
  art.borrowed.push({card:id,filename:file});
 else art.owned++;
}
for(const [file,keys] of owner)
 if(keys.length>1)art.shared.push({filename:file,cards:keys});
art.uniqueFiles=owner.size;
for(const id of Object.keys(CARD_ART))
 if(!CATALOGUE.some(c=>key(c)===id))
  errors.push("Art map points to nonexistent card "+id);
check(!art.missingAssignments.length,
 "Unmapped card art: "+art.missingAssignments.join(", "));
check(!art.missingFiles.length,
 "Missing mapped PNGs: "+art.missingFiles.join(", "));
if(art.borrowed.length)
 warnings.push(art.borrowed.length+" cards still use borrowed/provisional illustrations");
if(art.shared.length)
 warnings.push(art.shared.length+" PNGs are shared between different cards");
let pages=0;
try{
 const html=printSheets(PRINT_DECK);
 pages=(html.match(/class="tt-sheet"/g)||[]).length;
 check(pages===Math.ceil(PRINT_DECK.length/CARDS_PER_SHEET),
  "Physical A4 sheet count does not match");
 check((html.match(/class="tt-card /g)||[]).length===PRINT_DECK.length,
  "Physical card render count differs");
}catch(e){errors.push("Print sheet rendering: "+e.message)}
let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 cwd:ROOT,encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}catch{}
const result={
 schema:"rogue-cards-deck-validation-v1",commit,
 counts:{uniqueCards:CATALOGUE.length,physicalCards:PRINT_DECK.length,
  heroes:HEROES.length,rooms:ROOMS.length,regionalMonsters:MONSTERS.length,
  wardenPhases:WARDEN_CARDS.length,objects:OBJECTS.length,types},
 roomStages:Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(stage=>
  [stage,count(ROOMS,c=>c.stage===stage)])),
 roomKinds:Object.fromEntries([...new Set(ROOMS.map(c=>c.v2.kind))]
  .sort().map(kind=>[kind,count(ROOMS,c=>c.v2.kind===kind)])),
 rollCards:count(CATALOGUE,c=>!!c.v2?.roll),fateRooms:fateRooms.length,
 handlers:{objects:objectCoverage,rooms:roomCoverage},
 editorial:{declaredLinks:editorial?.declaredLinks??null,
  printedLinkEvidence:editorial?.printedLinkEvidence??null,
  metadataOnlyLinks:editorial?.metadataOnlyLinks??null},
 print:{cardsPerSheet:CARDS_PER_SHEET,pages},art,
 mechanicsAndPrintValid:errors.length===0,
 uniqueArtworkComplete:!art.borrowed.length&&!art.shared.length&&
  !art.missingAssignments.length&&!art.missingFiles.length,
 errors,warnings,
 limitations:[
  "Checks every canonical card, each printed d6 face, handler coverage and printable markup.",
  "Stateful Object/Monster/Room combinations and full expeditions require npm test and verify:game.",
  "Visual card overflow requires Playwright, not a source-only audit.",
  "Borrowed but existing illustrations are reported separately from missing PNGs.",
  "Simulation win rates are policy-dependent and do not prove game balance."
 ]
};
const json=JSON.stringify(result,null,2)+"\n";
if(args.length){
 const dest=resolve(args[1]);mkdirSync(dirname(dest),{recursive:true});
 writeFileSync(dest,json);
}
process.stdout.write(json);
if(errors.length)process.exitCode=1;
