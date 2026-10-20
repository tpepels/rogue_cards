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
import {ITEM_HEALING_DEFAULTS,validItemHealing}
 from "../item-healing.js";

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
/** Supported physical-rule hypotheses. Every setting is declarative and
 * executed by the SAME pausable expedition engine used by tree rollouts. */
export const MECHANIC_OPTIONS=Object.freeze({
 patrolEvery:[0,4,3,2],
 patrolOpening:["normal","skip","dis"],
 negotiation:["canonical","wit","item","both"],
 retreat:["none","item","wit"],
 morale:["none","half","quarter"],
 killReward:["canonical","draw","heal"],
 // Diagnostic-only healing after a won regional combat (not printable rules).
 postCombatHeal:[0,1,2,3,4,5,6,7,8,10],
 wardenTactic:["none","brace","interrupt","breach"]
});
const validateMechanics=source=>{
 assertObj(source,"mechanics");
 const out={};
 for(const [key,value] of Object.entries(source)){
  const allowed=MECHANIC_OPTIONS[key];
  if(!allowed||!allowed.includes(value))
   throw Error("Unknown or unsafe staged mechanic "+key+"="+value);
  out[key]=value;
 }
 return Object.freeze(out);
};

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
const identity=(card,fields,printedChanges={})=>deepFreeze({
 ...card,...fields,
 _stagedCard:true,
 v2:card.v2?{...structuredClone(card.v2),...structuredClone(printedChanges)}:undefined
});
export function compileStaging(spec){
 assertObj(spec,"Staging specification");
 if(spec.schema!=="rogue-cards-staging-v1")
  throw Error("Unknown staging schema");
 if(typeof spec.id!=="string"||!/^[a-z][a-z0-9-]{1,63}$/.test(spec.id))
  throw Error("Staging id must be stable kebab-case");
 const keys=new Set(["schema","id","description","cards","roomDeck","roomEffects",
  "mechanics","monsterHealing","roomRestHealing","itemHealing"]);
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
 // Changes ONLY printed healing quantities on existing physical Items.
 // Printable text and executable numeric value are generated together.
 assertObj(spec.itemHealing??{},"itemHealing");
 for(const [id,amount] of Object.entries(spec.itemHealing??{})){
  if(!validItemHealing(id,amount))
   throw Error("Unsupported printed Item healing "+id+":"+amount);
  const index=collections.items.findIndex(i=>i.id===id);
  if(index<0)throw Error("Unknown healing Item "+id);
  const prior=collections.items[index];
  const original=prior.v2?.trigger;
  const current=ITEM_HEALING_DEFAULTS[id];
  const pattern=new RegExp("\\bheal\\s+"+
   String(current).replaceAll("+","\\+")+"\\s+HP\\b","i");
  if(!pattern.test(original))
   throw Error("Printed healing text mismatch for "+id);
  const next=original.replace(pattern,"heal "+amount+" HP");
  collections.items[index]=identity(prior,{rule:next},{
   trigger:next,healingAmount:amount
  });
 }
 // Printed, monster-specific DEFEAT rewards; not a universal on-kill rule.
 // Only the already-supported HEAL operation is appended to existing rewards.
 assertObj(spec.monsterHealing??{},"monsterHealing");
 for(const [id,amount] of Object.entries(spec.monsterHealing??{})){
  if(![2,3,"d6"].includes(amount))
   throw Error("Unsupported printed Monster healing amount "+id+":"+amount);
  const i=collections.monsters.findIndex(m=>m.id===id);
  if(i<0)throw Error("Unknown regional Monster for healing "+id);
  const m=collections.monsters[i];
  if(!m.v2?.defeat||!Array.isArray(m.v2.defeatOps))
   throw Error("Missing original printed Monster DEFEAT "+id);
  collections.monsters[i]=identity(m,{},{
   defeat:m.v2.defeat+" Heal "+amount+" HP.",
   defeatOps:[...m.v2.defeatOps,"HEAL:"+amount]
  });
 }
 const roomDeck={};
 assertObj(spec.roomDeck??{},"roomDeck");
 for(const [stage,setting] of Object.entries(spec.roomDeck??{})){
  if(!STAGES.includes(stage))throw Error("Unknown Room stage "+stage);
  assertObj(setting,"roomDeck."+stage);
  const keys=Object.keys(setting);
  if(keys.some(k=>!["exclude","selection"].includes(k))||
    ("exclude" in setting&&"selection" in setting))
   throw Error("Room deck supports either exclude or selection");
  const available=collections.rooms.filter(r=>r.stage===stage);
  const pool=new Map(available.map(r=>[r.id,r]));
  if("selection" in setting){
   if(!Array.isArray(setting.selection)||
      setting.selection.length<12||setting.selection.length>96||
      setting.selection.some(id=>typeof id!=="string"||!pool.has(id)))
    throw Error("Room selection requires 12..96 valid same-stage Room ids");
   // Repeated printed ids mean independently drawn hypothetical reprints,
   // never new card rules. The Room engine resolves by the original id.
   const duplicates=new Map();
   for(const id of setting.selection)
    duplicates.set(id,(duplicates.get(id)??0)+1);
   if([...duplicates.values()].some(n=>n>12))
    throw Error("More than 12 reprints of one Room in staged selection");
   if(setting.selection.filter(id=>pool.get(id).v2.kind!=="CORRIDOR").length<12)
    throw Error("Room selection requires at least 12 non-Corridor Rooms");
   roomDeck[stage]={selection:[...setting.selection]};
  }else{
   if(!Array.isArray(setting.exclude)||
      new Set(setting.exclude).size!==setting.exclude.length||
      setting.exclude.some(id=>!pool.has(id)))
    throw Error("Room exclusion must contain unique same-stage Room ids");
   roomDeck[stage]={exclude:[...setting.exclude]};
  }
 }
 collections.rooms=STAGES.flatMap(stage=>{
  const selection=roomDeck[stage]?.selection;
  const available=collections.rooms.filter(r=>r.stage===stage);
  if(selection){
   const pool=new Map(available.map(r=>[r.id,r]));
   return selection.map(id=>pool.get(id));
  }
  const excluded=new Set(roomDeck[stage]?.exclude??[]);
  return available.filter(r=>!excluded.has(r.id));
 });
 for(const stage of STAGES)
  if(collections.rooms.filter(c=>c.stage===stage&&
    c.v2.kind!=="CORRIDOR").length<roomCount[stage])
   throw Error(stage+" has fewer than 12 non-Corridor Rooms");
 // Improve healing on EXISTING printed REST choices, retaining their Item cost.
 // Both the printed choice and executable opcode are generated together.
 const effects={};
 assertObj(spec.roomRestHealing??{},"roomRestHealing");
 const supportedRests=new Set(["ex-u-coal-store","ex-m-old-barracks",
  "ex-d-watchpost"]);
 for(const [id,amount] of Object.entries(spec.roomRestHealing??{})){
  if(!supportedRests.has(id)||!Number.isSafeInteger(amount)||
     amount<1||amount>10)
   throw Error("Unsupported printed Room REST healing "+id+":"+amount);
  const card=collections.rooms.find(c=>c.id===id);
  if(!card)throw Error("Missing Room REST in selected deck "+id);
  const oldText=card.v2.choices[1]?.effect;
  if(!/\bheal\s+\d+\s+HP\b/i.test(oldText))
   throw Error("No existing printed healing choice "+id);
  const model=ROOM_EFFECTS[id];
  if(!model?.choices[1]?.some(op=>/^HEAL:\d+$/.test(op)))
   throw Error("No existing executable healing choice "+id);
  const nextText=oldText.replace(/\b(heal)\s+\d+\s+HP\b/i,
   (_,verb)=>verb+" "+amount+" HP");
  const printedChoices=card.v2.choices.map((choice,i)=>
   i===1?{...choice,effect:nextText}:choice);
  // Same printed definition for each physical copy in this stage.
  const rewritten=identity(card,{},{choices:printedChoices});
  collections.rooms=collections.rooms.map(c=>c.id===id?rewritten:c);
  effects[id]=deepFreeze({
   choices:model.choices.map((ops,i)=>i===1?
    ops.map(op=>/^HEAL:\d+$/.test(op)?"HEAL:"+amount:op):[...ops]),
   outcomes:structuredClone(model.outcomes)
  });
 }
 assertObj(spec.roomEffects??{},"roomEffects");
 for(const [id,definition] of Object.entries(spec.roomEffects??{})){
  if(Object.hasOwn(effects,id))
   throw Error("Room effect conflicts with printed REST healing "+id);
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
 const cardPools={...collections,mechanics:validateMechanics(spec.mechanics??{}),
  roomEffects:deepFreeze(effects),
  stageRoomExclusions:deepFreeze(roomDeck),
  _stagingCatalogue:true,stagingId:spec.id};
 for(const key of ["heroes","rooms","monsters","items"])
  Object.freeze(cardPools[key]);
 // The outer catalogue freezes without recursively freezing unedited
 // canonical definitions that are shared as immutable source data.
 return Object.freeze(cardPools);
}
export function canonicalStagingCatalogue(){
 return canonical;
}
