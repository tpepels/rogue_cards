/** Canonical Vault transitions. Player-controlled and policy-driven
 * expeditions call the same Warden setup/ending operations.
 */
import {WARDEN,WARDEN_FURY} from "../tabletop-data.js";
export function beginWarden(s){
 s.monster=WARDEN;s.monsterHP=Math.max(11,WARDEN.hp-s.vaultModifiers.wardenDamage);
 if(s.vaultModifiers.wardenFirstAdv)s.monsterAdv=true;
 if(s.vaultModifiers.heroFirstAdv)s.heroFirstAdv=true;
 if(s.vaultModifiers.wardenOpeningSkip)s.monsterSkip++;
 s.metrics.monsterVisits.warden=(s.metrics.monsterVisits.warden||0)+1;
}
export function wardenOptions(s){
 const v=s.vaultModifiers;
 const choices=["fight"];
 if(v.smuggleAvailable&&s.discardable(2)&&s.discardable(1,"MAGIC"))
  choices.push("smuggle");
 if(v.bargainAvailable&&s.discardable(2))choices.push("bargain");
 if(v.unthroneAvailable&&s.discardable(1,"MAGIC"))
  choices.push("unthrone");
 if(v.smuggleAvailable&&s.discardable())choices.push("escape");
 return choices;
}
export function applyWardenChoice(s,kind){
 if(!wardenOptions(s).includes(kind))
  throw Error("Not an affordable post-Warden action: "+kind);
 if(kind==="smuggle"||kind==="escape"){
  const i=s.keptRooms.findIndex(x=>x.card.id==="d-gilded");
  if(i>=0)s.keptRooms.splice(i,1);
  if(kind==="smuggle"){
   s.discard(1,{tag:"MAGIC"});s.discard();
   s.metrics.won=true;s.endingKind="smuggled_amulet";
  }else{
   s.discard();s.endingKind="escaped_empty_handed";s.metrics.escaped=true;
  }
  s.monster=null;return {complete:true,won:!!s.metrics.won};
 }
 if(kind==="bargain"||kind==="unthrone"){
  const candidates=s.heroes.map((h,i)=>({h,i})).filter(x=>x.h.hp>0);
  const best=[...candidates].sort((a,b)=>b.h.card.wit-a.h.card.wit)[0];
  const choice=s.chooseEffect("warden-negotiator:"+kind,
   candidates.map(x=>String(x.i)),String(best.i));
  const h=s.heroes[Number(choice)];
  const amount=kind==="bargain"?2:1;
  s.discard(amount,{tag:kind==="unthrone"?"MAGIC":null});
  const a=s.die(20),b=s.die(20);
  if(a===20||a!==1&&a+h.card.wit>b+6){
   s.metrics.won=true;
   s.endingKind=kind==="bargain"?"bargained_amulet":"unthroned_warden";
   s.monster=null;return {complete:true,won:true};
  }
  s.monsterAdv=true;
 }
 // Exact Warden Fury carry-over HP - not an invented fresh fight.
 s.monster=WARDEN_FURY;
 s.monsterHP=Math.max(0,Math.min(WARDEN_FURY.hp,s.monsterHP));
 s.metrics.monsterVisits["warden-fury"]=
  (s.metrics.monsterVisits["warden-fury"]||0)+1;
 if(s.monsterHP===0){
  s.monster=null;s.metrics.won=true;s.endingKind="amulet_taken";
  return {complete:true,won:true};
 }
 return {complete:false,won:false};
}
