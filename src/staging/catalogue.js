/**
 * Explicit, isolated staging catalogues for balance experiments.
 * No mutation of canonical definitions and no Node/filesystem dependency.
 * Card definitions are frozen, while the engine owns every game's piles.
 */
import {HEROES,ROOMS,MONSTERS,OBJECTS,VAULT,WARDEN,WARDEN_FURY} from "../tabletop-data.js";
import {PRINT_ONLY_ROOMS,PRINT_ONLY_ITEMS} from "../print-expansion.js";
import {EXTRA_MONSTERS} from "../monster-expansion.js";
import {ODD_ITEMS} from "../item-expansion.js";
import {ROOM_EFFECTS,ROOM_OPERATIONS} from "../room-effect-model.js";

const STAGES=["UPPER","MIDDLE","DEEP"];
const canonical={
 heroes:HEROES,rooms:[...ROOMS,...PRINT_ONLY_ROOMS],
 monsters:[...MONSTERS,...EXTRA_MONSTERS],
 items:[...OBJECTS,...PRINT_ONLY_ITEMS,...ODD_ITEMS],
 vault:VAULT,warden:WARDEN,wardenFury:WARDEN_FURY
};
const names=new Set(["heroes","rooms","monsters","items",
 "vault","warden","wardenFury"]);
const roomCount=Object.fromEntries(STAGES.map(stage=>[stage,12]));
const allowed={
 heroes:new Set(["hp","atk","def","wit"]),
 monsters:new Set(["hp","atk","def","copies"]),
 items:new Set(["copies"]),
 rooms:new Set([]),
 vault:new Set([]),
 warden:new Set(["hp","atk","def"]),
 wardenFury:new Set(["hp","atk","def"])
};
const assertObj=(x,where)=>{
 if(!x||typeof x!=="object"||Array.isArray(x))
  throw Error(where+" must be an object");
};
const deepFreeze=x=>{
 if(x&&typeof x==="object"&&!Object.isFrozen(x)){
  for(const v of Object.values(x))deepFreeze(v);
  Object.freeze(x);
 }
 return x;
};
const identity=(card,fields)=>deepFreeze({
 ...card,...fields,
 _stagedCard:true,
 v2:card.v2?structuredClone(card.v2):undefined
});
export function compileStaging(spec){
 assertObj(spec,"Staging specification");
 if(spec.schema!=="rogue-cards-staging-v1")
  throw Error("Unknown staging schema");
 if(typeof spec.id!=="string"||!/^[a-z][a-z0-9-]{1,63}$/.test(spec.id))
  throw Error("Staging id must be stable kebab-case");
 const keys=new Set(["schema","id","description","cards","roomDeck","roomEffects"]);
 for(const key of Object.keys(spec))
  if(!keys.has(key))throw Error("Unrecognized staging field "+key);
 const collections=Object.fromEntries(Object.entries(canonical)
  .map(([k,v])=>[k,Array.isArray(v)?v.slice():v]));
 const modifications=new Set();
 for(const edit of spec.cards??[]){
  assertObj(edit,"Card edit");
  if(!names.has(edit.collection))throw Error("Unknown collection "+edit.collection);
  const group=collections[edit.collection];
  const scalar=!Array.isArray(group);
  const original=scalar?group:group.find(c=>c.id===edit.id);
  if(!original||original.id!==edit.id)
   throw Error("Unknown canonical card "+edit.collection+":"+edit.id);
  const key=edit.collection+":"+edit.id;
  if(modifications.has(key))throw Error("Repeated card edit "+key);
  modifications.add(key);
  assertObj(edit.set,"Card edit set");
  if(!Object.keys(edit.set).length)throw Error("Empty edit for "+key);
  for(const [field,value] of Object.entries(edit.set)){
   if(!allowed[edit.collection].has(field))
    throw Error("Unsafe or unsupported printed card field "+key+"."+field);
   if(!Number.isSafeInteger(value)||value<0||value>100||
      ((field==="copies"||field==="hp")&&value<1))
    throw Error("Invalid staged numeric value "+key+"."+field);
  }
  const updated=identity(original,edit.set);
  if(scalar)collections[edit.collection]=updated;
  else collections[edit.collection][group.findIndex(c=>c.id===edit.id)]=updated;
 }
 const roomDeck={};
 assertObj(spec.roomDeck??{},"roomDeck");
 for(const [stage,setting] of Object.entries(spec.roomDeck??{})){
  if(!STAGES.includes(stage))throw Error("Unknown Room stage "+stage);
  assertObj(setting,"roomDeck."+stage);
  const keys=Object.keys(setting);
  if(keys.some(k=>k!=="exclude"))throw Error("Room deck supports exclude only");
  if(!Array.isArray(setting.exclude)||new Set(setting.exclude).size!==setting.exclude.length)
   throw Error("Room exclusion must contain unique card ids");
  const available=collections.rooms.filter(r=>r.stage===stage);
  const pool=new Set(available.map(r=>r.id));
  if(setting.exclude.some(id=>!pool.has(id)))
   throw Error("Unknown/wrong-stage excluded Room");
  roomDeck[stage]=[...setting.exclude];
 }
 collections.rooms=collections.rooms.filter(r=>
  !(roomDeck[r.stage]??[]).includes(r.id));
 for(const stage of STAGES)
  if(collections.rooms.filter(c=>c.stage===stage).length<roomCount[stage])
   throw Error(stage+" has fewer than 12 Rooms after exclusion");
 const effects={};
 assertObj(spec.roomEffects??{},"roomEffects");
 for(const [id,definition] of Object.entries(spec.roomEffects??{})){
  const card=collections.rooms.find(c=>c.id===id);
  if(!card)throw Error("Staged Room effects require a present regional Room "+id);
  assertObj(definition,"Room effect "+id);
  if(Object.keys(definition).some(k=>!["choices","outcomes"].includes(k)))
   throw Error("Unknown Room effect field "+id);
  const prior=ROOM_EFFECTS[id];
  if(!prior)throw Error("No canonical executable Room operations "+id);
  const choices=definition.choices??prior.choices,
   outcomes=definition.outcomes??prior.outcomes;
  if(!Array.isArray(choices)||choices.length!==card.v2.choices.length||
    !Array.isArray(outcomes)||outcomes.length!==(card.v2.roll?.outcomes.length??0))
   throw Error("Room choice/outcome count cannot change "+id);
  for(const ops of [...choices,...outcomes]){
   if(!Array.isArray(ops))throw Error("Room operations must be arrays "+id);
   for(const raw of ops)
    if(typeof raw!=="string"||!ROOM_OPERATIONS.has(raw.split(":")[0]))
     throw Error("Unknown staged Room opcode "+id+":"+raw);
  }
  effects[id]=deepFreeze({choices:structuredClone(choices),
   outcomes:structuredClone(outcomes)});
 }
 // Every staged card deck is a read-only full set, shared by real and
 // hypothetical states. The canonical global arrays are never modified.
 const cardPools={...collections,roomEffects:deepFreeze(effects),
  stageRoomExclusions:deepFreeze(roomDeck),
  _stagingCatalogue:true,stagingId:spec.id};
 for(const key of ["heroes","rooms","monsters","items"])
  Object.freeze(cardPools[key]);
 return deepFreeze(cardPools);
}
export function canonicalStagingCatalogue(){
 return canonical;
}
