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
 const best=bestWit(s);if(!best)return false;
 const eligible=s.heroes.map((hero,i)=>({hero,i})).filter(x=>x.hero.hp>0);
 const selected=s.chooseEffect("parley-negotiator:"+m.id,
  eligible.map(x=>String(x.i)),String(s.heroes.indexOf(best)));
 const h=s.heroes[Number(selected)];
 s.setActor(h);
 const cost=(n,tag=null)=>s.discardable(n,tag);
 const pay=(n,tag=null)=>{if(!cost(n,tag))return false;s.discard(n,{tag});return true};
 let success=false;
 if(m.v2?.parleyMode){
  if(m.v2.parleyMode==="ITEM")success=pay(m.v2.parleyCost);
  else{
   const wit=s.takeWitModifiers(h);
   const heroDie=rollD20(s,{dis:!!h.poison||wit.dis});
   const other=s.die(20);
   success=heroDie===20||heroDie!==1&&
    heroDie+h.card.wit+wit.bonus>other+m.v2.parleyCost;
  }
 }else switch(m.id){
 case "rat":success=pay(1);break;
 case "goblin":success=pay(2);if(success){
  const owner=s.chooseRecipient("goblin-recruit");
  if(!owner.slots.companion&&s.chooseEffect("goblin-ally",
   ["decline","recruit"],"recruit")==="recruit"){
   owner.recruitedGoblin=true;s.temporaryCompanions.push("goblin");
  }
 }break;
 case "crawler":case "mold":{
  const potions=s.heroes.flatMap((hero,heroIndex)=>hero.inventory
   .map((item,index)=>({hero,heroIndex,item,index}))
   .filter(x=>x.item.v2.kind==="POTION"));
  if(potions.length){
   const modes=potions.map(x=>String(x.heroIndex)+":"+x.index);
   const pick=s.chooseEffect("parley-potion:"+m.id,modes,modes[0]);
   const chosen=potions.find(x=>String(x.heroIndex)+":"+x.index===pick);
   s.consume(chosen.hero,chosen.item);success=true;
  }
  break;
 }
 case "bat":case "wisp":{
  const difficulty=m.id==="bat"?3:5;
  const boon=blessBeforeD20(s,h);
  let rogueAdv=false,rogueDis=false,rogueReward=false;
  if(h.card.id==="rogue"&&!h.used.has("hero")&&
   s.chooseEffect("rogue-parley-ability",
    ["save","risk"],"risk")==="risk"){
   h.used.add("hero");const trick=s.die();
   rogueDis=trick<=2;rogueAdv=trick>=3;rogueReward=trick>=5;
  }
  const wit=s.takeWitModifiers(h);
  const r=s.rerollIfKept(h,rollD20(s,{
   adv:boon.adv||rogueAdv,
   dis:h.poison||h.slots.armour?.id==="mail"||rogueDis||wit.dis
  }));
  const opp=s.die(20);
  success=r===20||(r!==1&&
   r+h.card.wit+boon.bonus+wit.bonus>opp+difficulty);
  if(success&&rogueReward)s.draw();
  if(success&&m.id==="wisp"){
   // A successful ESCAPE delays this same physical encounter: it returns
   // at the next Corridor, or just before the Vault. No bonus peek.
   s.followingWisp=m;
  }
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
