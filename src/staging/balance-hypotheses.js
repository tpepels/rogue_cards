/**
 * Pre-registered design hypotheses, isolated from printed canonical cards.
 * Every variant changes a physical rule-system assumption, not MCTS tuning.
 */
import {ROOM_EFFECTS} from "../room-effect-model.js";
import {canonicalStagingCatalogue,compileStaging} from "./catalogue.js";

const original=canonicalStagingCatalogue();
const copy=x=>structuredClone(x);
const newSpec=(id,description,changes={})=>({
 schema:"rogue-cards-staging-v1",id,description,...changes
});
const card=(collection,id,set)=>({collection,id,set});
const stages=["UPPER","MIDDLE","DEEP"];
const stageRoom=id=>original.rooms.find(r=>r.id===id);
const setupRoomEffects=patches=>{
 const map={};
 for(const [id,fn] of patches){
  if(map[id])throw Error("Duplicate encounter Room "+id);
  const prev=ROOM_EFFECTS[id];
  if(!prev)throw Error("Unknown experimental Room "+id);
  const next=copy(prev);fn(next);map[id]=next;
 }
 return map;
};
const safeBand=ops=>ops.length>0&&
 ops.every(op=>!["MONSTER_DRAW","TRAPDOOR","FIGHT","BANISH",
  "ROOM_SPECIAL","ROOM_FATE","FORCE_BEHAVIOR"].includes(op.split(":")[0])) &&
 ops.some(op=>["DRAW","PEEK","HEAL","NONE","CURE","NEXT_ADV","NEXT_DIS"]
  .includes(op.split(":")[0]));
const encounterCandidates=()=>{
 const out=Object.fromEntries(stages.map(s=>[s,[]]));
 for(const room of original.rooms){
  if(!out[room.stage]||room.v2.special||room.v2.fate||
   !room.v2.roll)continue;
  const fx=ROOM_EFFECTS[room.id];
  if(!fx||!fx.choices.some(row=>row.some(op=>
   ["ROLL_ROOM","ROLL_ROOM_RISK","ROLL_ROOM_RISK_D6"].includes(op))))continue;
  const bands=fx.outcomes.map((row,i)=>safeBand(row)?i:null)
   .filter(i=>i!==null);
  if(bands.length<1)continue;
  out[room.stage].push({id:room.id,bands});
 }
 return out;
};
export function encounterRoomSelection(){
 return encounterCandidates();
}
function roomEncounterPatch(intensity){
 const selected=encounterCandidates();
 const patches=[];
 for(const stage of stages){
  const candidates=selected[stage];
  if(candidates.length<4)throw Error("Too few suitable Room encounter bands "+stage);
  // Mild: four Room types per region, one bonus-Monster d6 band.
  // High: all viable Room types, up to two d6 bands.
  const count=intensity==="mild"?4:candidates.length;
  for(const row of candidates.slice(0,count)){
   patches.push([row.id,fx=>{
    const n=intensity==="mild"?1:2;
    for(const band of row.bands.slice(0,n))
     fx.outcomes[band].push("MONSTER_DRAW");
   }]);
  }
 }
 return setupRoomEffects(patches);
}
function roomDeckSelection(){
 const exclude={};
 for(const stage of stages){
  const allowed=original.rooms.filter(r=>r.stage===stage&&
   !r.v2.special&&!r.v2.fate&&
   !ROOM_EFFECTS[r.id]?.choices?.some(row=>row.includes("MONSTER_DRAW"))&&
   !ROOM_EFFECTS[r.id]?.outcomes?.some(row=>row.includes("MONSTER_DRAW")));
  if(allowed.length<4)throw Error("Too few ordinary low-encounter Rooms in "+stage);
  exclude[stage]={exclude:allowed.slice(0,4).map(r=>r.id)};
 }
 return exclude;
}
const lessAtk=()=>original.monsters.map(m=>card("monsters",m.id,{
 atk:Math.max(0,m.atk-1)
}));
const lessHp=()=>original.monsters.map(m=>card("monsters",m.id,{
 hp:Math.max(1,m.hp-2)
}));
const recoveryEffects=()=>setupRoomEffects([
 ["ex-u-coal-store",fx=>{
  fx.choices[1]=["COST:1","HEAL:5"];
 }],
 ["ex-m-old-barracks",fx=>{
  fx.choices[1]=["COST:1","HEAL:6"];
 }],
 ["ex-d-watchpost",fx=>{
  fx.choices[1]=["HEAL:4"];
 }],
 ["u-shrine",fx=>{
  fx.choices[1].push("HEAL:2");
 }]
]);
const trapEffects=()=>setupRoomEffects([
 ["u-fall",fx=>{
  const i=fx.outcomes[0].findIndex(op=>op.startsWith("TRAPDOOR:"));
  if(i<0)throw Error("Expected Upper trapdoor");
  fx.outcomes[0][i]="TRAPDOOR:MIDDLE:2:MONSTER";
 }],
 ["d-bridge",fx=>{
  const i=fx.outcomes[0].findIndex(op=>op.startsWith("TRAPDOOR:"));
  if(i<0)throw Error("Expected Deep trapdoor");
  fx.outcomes[0][i]="TRAPDOOR:FINAL:d6";
 }]
]);
const extraHealingItems=()=>[
 card("items","ex-bandages",{copies:5}),
 card("items","ex-rations",{copies:5}),
 card("items","needle",{copies:3})
];
function combine(id,description,...specs){
 const cards=[],roomEffects={},roomDeck={};
 for(const spec of specs){
  cards.push(...(spec.cards??[]));
  for(const [name,value] of Object.entries(spec.roomEffects??{})){
   if(Object.hasOwn(roomEffects,name))throw Error("Room hypothesis overlap "+name);
   roomEffects[name]=value;
  }
  for(const [name,value] of Object.entries(spec.roomDeck??{})){
   if(Object.hasOwn(roomDeck,name))throw Error("Room deck hypothesis overlap "+name);
   roomDeck[name]=value;
  }
 }
 return newSpec(id,description,{cards,roomEffects,roomDeck});
}
export function balanceHypotheses(){
 const mild=newSpec("encounter-mild",
  "Append a Monster to one non-damaging roll band on four Rooms per stage.",
  {roomEffects:roomEncounterPatch("mild")});
 const strong=newSpec("encounter-strong",
  "Append Monsters to up to two nonhazardous roll bands on every eligible Room.",
  {roomEffects:roomEncounterPatch("strong")});
 const attacks=newSpec("monsters-atk-minus-1",
  "All ordinary Monsters deal less frequent hits through one point less ATK.",
  {cards:lessAtk()});
 const recovery=newSpec("recovery-room-plus",
  "Improve four existing Room recovery opportunities without new card types.",
  {roomEffects:recoveryEffects()});
 const result=[
  mild,strong,
  newSpec("encounter-deck-bias",
   "Exclude four low-encounter Room cards from each region to favor high-risk Rooms.",
   {roomDeck:roomDeckSelection()}),
  attacks,
  newSpec("monsters-hp-minus-2",
   "Ordinary Monsters have two fewer HP, retaining their printed ATK and DEF.",
   {cards:lessHp()}),
  recovery,
  newSpec("recovery-item-copies",
   "Increase available physical healing consumable copies.",
   {cards:extraHealingItems()}),
  newSpec("warden-hp-down",
   "Reduce both printed Warden phase HP values without altering special abilities.",
   {cards:[card("warden","warden",{hp:18}),
    card("wardenFury","warden-fury",{hp:8})]}),
  newSpec("trapdoor-fall-safer",
   "Reduce early and final trapdoor fall damage without removing trapdoors.",
   {roomEffects:trapEffects()}),
  newSpec("wisp-hp-8",
   "Independent one-card HP probe of Will-o'-Wisp.",
   {cards:[card("monsters","wisp",{hp:8})]}),
  combine("encounter-mild-atk-lower",
   "Test interaction between more encounters and safer combat.",
   mild,attacks),
  combine("encounter-strong-atk-lower",
   "Test whether high encounter density needs reduced Monster accuracy.",
   strong,attacks),
  combine("encounter-strong-recovery",
   "Test whether high encounter density needs more recovery.",
   strong,recovery),
  combine("encounter-strong-atk-recovery",
   "Three-factor combination to check whether encounter density, damage and recovery jointly work.",
   strong,attacks,recovery)
 ];
 for(const spec of result)compileStaging(spec);
 return Object.freeze(result);
}
