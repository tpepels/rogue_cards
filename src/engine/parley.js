/** Printed Monster negotiations - single executor shared by the campaign
 * policy and the player-controlled, pausable decision session.
 *
 * Returns true only if the encounter was actually dismissed.
 * All Item costs, d20 checks and consequences are resolved here.
 */
import {blessBeforeD20} from "./combat.js";

const bestWit=s=>[...s.living()].sort((a,b)=>b.card.wit-a.card.wit)[0];
const rollD20=(s,{adv=false,dis=false}={})=>{
 const a=s.die(20);
 return adv&&!dis?Math.max(a,s.die(20)):
  dis&&!adv?Math.min(a,s.die(20)):a;
};
export function resolveParley(s){
 const m=s.monster;
 if(!m||m.stage==="FINAL")throw Error("No negotiable Monster");
 const h=bestWit(s);if(!h)return false;
 s.setActor(h);
 const cost=(n,tag=null)=>s.discardable(n,tag);
 const pay=(n,tag=null)=>{if(!cost(n,tag))return false;s.discard(n,{tag});return true};
 let success=false;
 switch(m.id){
 case "rat":success=pay(1);break;
 case "goblin":success=pay(2);if(success){
  const owner=s.chooseActor();if(!owner.slots.companion){
   owner.recruitedGoblin=true;s.temporaryCompanions.push("goblin");
  }
 }break;
 case "crawler":case "mold":{
  const potion=s.heroes.find(x=>x.inventory.some(o=>o.v2.kind==="POTION"));
  if(potion){s.consume(potion,potion.inventory.find(o=>o.v2.kind==="POTION"));success=true}
  break;
 }
 case "bat":case "wisp":{
  const difficulty=m.id==="bat"?3:5;
  const boon=blessBeforeD20(s,h);
  let rogueAdv=false,rogueDis=false,rogueReward=false;
  if(h.card.id==="rogue"&&!h.used.has("hero")){
   h.used.add("hero");const trick=s.die();
   rogueDis=trick<=2;rogueAdv=trick>=3;rogueReward=trick>=5;
  }
  const r=s.rerollIfKept(h,rollD20(s,{
   adv:boon.adv||rogueAdv,
   dis:h.poison||h.slots.armour?.id==="mail"||rogueDis
  }));
  const opp=s.die(20);
  success=r===20||(r!==1&&r+h.card.wit+boon.bonus>opp+difficulty);
  if(success&&rogueReward)s.draw();
  if(success&&m.id==="wisp")s.peek(1);
  break;
 }
 case "troll":success=pay(2);break;
 case "eye":success=pay(1);break;
 case "wraith":success=s.anyEquippedTag("CURSED");
  if(success)s.hurt(h,s.die());break;
 case "rust":success=pay(1,"METAL");if(success)s.draw();break;
 case "cultist":success=s.anyEquippedTag("CURSED");
  if(success){s.hurt(h,s.die());s.draw()}break;
 case "sentinel":success=pay(2,"METAL");break;
 default:throw Error("Monster missing parley "+m.id);
 }
 s.metrics.negotiations++;
 if(success){
  s.metrics.negotiationsWon++;s.metrics.banishments++;
  s.monster=null;s.monsterHP=0;
 }
 return success;
}
