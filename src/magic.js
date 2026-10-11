import { MAGIC, MAGIC_TYPES, MAGIC_PRINT_COPIES, magicAppearance } from "./magic-data.js";

export const MAGIC_PROPERTIES = Object.freeze({
  corridor:["stone"],flood:["water"],altar:["holy","stone"],fountain:["water"],
  shop:["wood"],crypt:["dark","stone"],nest:["wood","poison"],
  locked:["metal","stone"],stairs:["stone"],trap:["metal","stone"],
  entrance:["light","stone"],vault:["holy","stone"],
  rat:["wood"],goblin:["wood"],eye:["dark"],rust:["metal","acid"],
  wraith:["dark","cold"],troll:["stone"],sentinel:["metal","holy"]
});
export const propertiesOf = id=>MAGIC_PROPERTIES[id]||[];
export const magicStock=()=>Object.entries(MAGIC_PRINT_COPIES).flatMap(([key,count])=>{
  const [kind,id]=key.split(":");
  return Array.from({length:count},()=>({kind,id,charges:kind==="wand"?3:undefined,blessing:"uncursed"}));
});
export function setupMagic(state,shuffle) {
  state.magicAssignments={};state.magicKnown={};
  for(const kind of MAGIC_TYPES){
    state.magicAssignments[kind]={};state.magicKnown[kind]={};
    const identities=shuffle(state,MAGIC[kind].effects.map(x=>x.id));
    MAGIC[kind].appearances.forEach(([id],i)=>state.magicAssignments[kind][id]=identities[i]);
  }
  state.equipped.ring=null;
  state.status.ward=0;
}
export const magicName = thing=>magicAppearance(thing.kind,thing.id)?.title||thing.id;
export const resolvedIdentity=(state,kind,id)=>{
 const effectId=state.magicKnown?.[kind]?.[id];
 return MAGIC[kind]?.effects.find(x=>x.id===effectId)||null;
};
export function actionList(state,monster) {
  const actions=[];
  state.inventory.forEach((thing,index)=>{
    if(thing.kind==="scroll")actions.push({id:"read",index,label:"Read "+magicName(thing)});
    if(thing.kind==="wand"&&thing.charges>0)actions.push({id:"zap",index,label:"Zap "+magicName(thing)+" ("+thing.charges+" charges)"});
    if(thing.kind==="ring")actions.push({id:"wear",index,label:"Wear "+magicName(thing)});
  });
  return actions;
}
export function magicModifier(state,slot) {
 const ring=state.equipped?.ring;
 if(!ring || slot!=="defense")return 0;
 const effect=resolvedIdentity(state,"ring",ring.id);
 if(effect?.id!=="shield")return 0;
 return ring.blessing==="blessed"?2:ring.blessing==="cursed"?-1:1;
}
export function ignoresDark(state) {
 return state.equipped?.ring && resolvedIdentity(state,"ring",state.equipped.ring.id)?.id==="lantern";
}
export function ignoresHunger(state) {
 return state.equipped?.ring && resolvedIdentity(state,"ring",state.equipped.ring.id)?.id==="forager" && state.equipped.ring.blessing!=="cursed";
}
export function resistsPoison(state) {
 return state.equipped?.ring && resolvedIdentity(state,"ring",state.equipped.ring.id)?.id==="resist" && state.equipped.ring.blessing!=="cursed";
}
export function magicAction(state,id,index,context) {
 const thing=state.inventory[index];
 if(!thing || !MAGIC[thing.kind])throw Error("Not a magical object");
 const kind=thing.kind;
 const effectId=state.magicAssignments[kind][thing.id];
 const effect=MAGIC[kind].effects.find(x=>x.id===effectId);
 state.magicKnown[kind][thing.id]=effectId;
 const mon=context.monster();
 const room=context.room();
 context.log(magicName(thing)+" identified: "+effect.name+".");
 if(id==="wear"){
   const old=state.equipped.ring;
   if(old) state.inventory.push(old);
   state.inventory.splice(index,1);
   state.equipped.ring=thing;
   context.log("Worn "+effect.name+" ("+thing.blessing+").");
   return;
 }
 if(id==="zap"){
   thing.charges--;
   if(effectId==="spark"&&mon)context.hurt(mon,3+(propertiesOf(room.id).includes("water")?2:0),"ELECTRICITY");
   if(effectId==="frost"&&mon){context.hurt(mon,2,"COLD");mon.frozen=1;}
   if(effectId==="corrode"&&mon)context.hurt(mon,2+(propertiesOf(mon.id).includes("metal")?2:0),"ACID");
   if(effectId==="burrow"){
     if(room.id==="locked"||propertiesOf(room.id).includes("stone")){
       state.status.passage=1;context.log("DIGGING makes the next locked passage free.");
     }else context.log("No diggable obstruction.");
   }
   if(!mon && ["spark","frost","corrode"].includes(effectId))context.log("The magic dissipates: no target.");
   if(thing.charges===0){state.inventory.splice(index,1);context.log("The wand crumbles after its final charge.");}
   return;
 }
 state.inventory.splice(index,1);
 if(effectId==="flame"&&mon)context.hurt(mon,propertiesOf(room.id).includes("water")?1:4,"FIRE");
 if(effectId==="ward"){state.status.ward=2;context.log("HOLY ward protects against two monster attacks.");}
 if(effectId==="mapping"){
   const neighbours=context.neighbours();
   const unexplored=neighbours.find(node=>!state.rooms[node]);
   if(unexplored){
     const top=state.decks.rooms.draw.at(-1);
     context.log("LIGHT reveals: next room card is "+(context.roomTitle(top)||"unknown")+".");
   } else context.log("No unexplored connected chamber.");
 }
 if(effectId==="banish"&&mon){
   if(mon.id==="sentinel")context.log("The Warden resists TELEPORT.");
   else {mon.hp=0;context.log("TELEPORT banishes "+mon.title+".");}
 }
 if(!mon&&["flame","banish"].includes(effectId))context.log("No target; the scroll is consumed.");
}
