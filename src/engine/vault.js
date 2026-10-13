/**
 * Canonical SEAL attempt and its real printed costs and d20 rolls.
 * Whether/when to attempt SEAL is a UI or experimental policy decision.
 */
import {itemOptions} from "../item-access.js";
import {blessBeforeD20} from "./combat.js";
const bestWit=s=>[...s.living()].sort((a,b)=>b.card.wit-a.card.wit)[0];
const itemIn=(s,h,id)=>h.inventory.find(c=>c.id===id);
const rollD20=(s,{adv=false,dis=false}={})=>{
 const a=s.die(20);
 return adv&&!dis?Math.max(a,s.die(20)):
  dis&&!adv?Math.min(a,s.die(20)):a;
};
export const sealCost=s=>Math.max(1,(s.heroes.length===2?6:3)+(s.vaultModifiers?.sealCostDelta||0));
export function seal(s){
 const cost=sealCost(s);
 const magic=s.partyCount("MAGIC");s.metrics.sealAvailable=s.discardable(cost,"MAGIC");
 if(!s.metrics.sealAvailable)return false;
 s.metrics.sealAttempt=true;
 s.discard(cost,{tag:"MAGIC"});
 const h=bestWit(s);if(!h)return false;
 if(h.slots.armour?.id==="mail")s.notePassive(h.slots.armour,"wit",1);
 const boon=blessBeforeD20(s,h);
 let atk=s.rerollIfKept(h,rollD20(s,{adv:boon.adv,dis:h.poison||h.slots.armour?.id==="mail"}));
 s.noteOptions(itemOptions(s,h,"after-roll"));
 const ring=h.slots.ring?.id==="ring-luck"?h.slots.ring:null;
 if(ring&&!h.used.has(ring)){
  s.pendingD20=atk;s.pendingD20Modifier=0;s.activate(h,ring);
  atk=s.pendingD20+s.pendingD20Modifier;
 }
 const undo=itemIn(s,h,"wand-undo");
 if(undo&&!s.exhausted.has(undo)&&atk+h.card.wit+s.witBonus+boon.bonus<15){
  s.pendingD20=atk;s.pendingD20Modifier=0;s.activate(h,undo);
  atk=s.pendingD20+s.pendingD20Modifier;
 }
 const def=s.die(20);
 let good=atk===20||atk!==1&&atk+h.card.wit+s.witBonus+boon.bonus>def+6;
 if(!good){
  for(const hero of s.living())s.noteOptions(itemOptions(s,hero,"failed-d20"));
  // Crown of Rehearsals can rescue even a failed final magical test.
  const owner=s.heroes.find(x=>x.inventory.some(o=>o.id==="crown-relic"));
  if(owner){s.setActor(owner);const crown=itemIn(s,owner,"crown-relic");
   s.directItem(owner,crown,"rescue-failed-roll",()=>{
    s.consume(owner,crown);s.hurt(owner,s.die());return true;});
   good=true;}
 }
 s.metrics.sealWin=good;return good;
}
