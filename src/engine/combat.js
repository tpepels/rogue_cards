/**
 * Headless Rogue Cards combat primitives.
 * These are the canonical printed attack, defence, Item and Monster effects.
 * This module must not import AI agents, rollouts, studies or browser UI.
 */
import {itemOptions} from "../item-access.js";

const itemIn=(s,h,id)=>h.inventory.find(o=>o.id===id);
const rollD20=(s,{adv=false,dis=false}={})=>{
 const a=s.die(20);return adv&&!dis?Math.max(a,s.die(20)):
  dis&&!adv?Math.min(a,s.die(20)):a;
};
export function blessBeforeD20(s,target){
 const priest=s.living().find(x=>x.card.id==="priest"&&!x.used.has("hero"));
 if(!priest)return {bonus:0,adv:false};
 priest.used.add("hero");
 if(s.heroMode(priest)==="steady"&&priest.hp>1){
  s.hurt(priest,1);return {bonus:2,adv:false};
 }
 const d=s.die();
 if(d<=2){s.hurt(priest,Math.ceil(s.die()/2));return {bonus:0,adv:false};}
 if(d<=4)return {bonus:2,adv:false};
 target.poison=false;return {bonus:0,adv:true};
}
function playerRoll(s,h,bonus,def,actorType="attack"){
 const attackAdv=h.nextAdv>0,attackDis=h.nextDis>0||h.poison;
 h.nextAdv=0;h.nextDis=0;
 let extraAtk=h.nextAtk||0;h.nextAtk=0;
 const blessing=blessBeforeD20(s,h);extraAtk+=blessing.bonus;
 let rogueAdv=false,rogueDis=false;
 if(h.card.id==="rogue"&&!h.used.has("hero")){
  h.used.add("hero");
  if(s.heroMode(h)==="steady"&&s.discardable()){
   s.discard();rogueAdv=true;
  }else{const d=s.die();
   if(d<=2)rogueDis=true;else rogueAdv=true;
   if(d>=5){
    const r=rollD20(s,{adv:true}),op=s.die(20);
    if(r===20||r!==1&&r+h.card.wit>op+def)s.draw();
   }
  }
 }
 const adv=attackAdv||rogueAdv||h.nextAdv>0||blessing.adv;
 const dis=attackDis||rogueDis;
 h.nextAdv=0;
 s.pendingD20=s.rerollIfKept(h,rollD20(s,{adv,dis}));
 s.noteOptions(itemOptions(s,h,"after-roll"));
 s.pendingD20Modifier=0;
 const ring=h.slots.ring;
 if(ring?.id==="ring-luck"&&!h.used.has(ring)){s.activate(h,ring);}
 const wand=itemIn(s,h,"wand-undo");
 if(wand&&!s.exhausted.has(wand)&&s.pendingD20!==20&&
  (s.pendingD20+bonus+extraAtk<10+def||s.strategy==="magic"))s.activate(h,wand);
 const natural=s.pendingD20;const modified=natural+s.pendingD20Modifier;
 const defense=rollD20(s,{adv:actorType==="monster"&&h.nextDefenseAdv});
 h.nextDefenseAdv=false;
 let hit=natural===20||natural!==1&&modified+bonus+extraAtk>defense+def;
 if(!hit){
  s.noteOptions(itemOptions(s,h,"failed-d20"));
  const crown=itemIn(s,h,"crown-relic");
  if(crown&&s.monster&&(s.monster.stage==="FINAL"||h.hp<h.card.hp*.3)){
   s.directItem(h,crown,"rescue-failed-roll",()=>{
     s.consume(h,crown);s.hurt(h,s.die());return true;});
    hit=true;return {hit,critical:true};
  }
 }
 return {hit,critical:natural===20};
}
export function playerAttack(s,h){
 s.setActor(h);const m=s.monster;if(!m||h.hp<=0)return;
 if(h.card.id==="wizard"&&!h.used.has("hero")&&
  (s.strategy==="magic"||s.monsterHP>=8)){
  h.used.add("hero");
  if(s.heroMode(h)==="steady"){s.monsterHP-=2;return;}
  const d=s.die();
  if(d<=2)s.hurt(h,Math.ceil(s.die()/2));else if(d<=4)s.monsterHP-=s.die()+2;
  else{s.monsterHP-=s.die()+s.die();s.monsterSkip++;}
  return;
 }
 const ring=h.slots.ring;
 s.noteOptions(itemOptions(s,h,"on-attack"));
 if(ring?.id==="ring-ashes"&&!h.used.has(ring))s.activate(h,ring);
 const stat=s.stats(h);
 if(h.slots.weapon){
  const bonus={sword:2,staff:1,"cursed-blade":4}[h.slots.weapon.id]||0;
  if(bonus)s.notePassive(h.slots.weapon,"attack",bonus);
 }
 if(h.slots.ring?.id==="ring-hunger")s.notePassive(h.slots.ring,"attack",2);
 const r=playerRoll(s,h,stat.atk+(h.recruitedGoblin?1:0),m.def);
 if(!r.hit||h.hp<=0)return;
 s.noteOptions(itemOptions(s,h,"on-hit"));
 let dmg=s.die()+(r.critical?s.die():0);
 dmg+=h.nextDamage+s.basicAttackBonus(h);h.nextDamage=0;
 if(h.slots.weapon?.id==="cursed-blade")s.hurt(h,1);
 if(h.card.id==="warrior"&&!h.used.has("hero")){
  h.used.add("hero");
  if(s.heroMode(h)==="steady"&&h.hp>1){s.hurt(h,1);dmg+=2;}
  else{const d=s.die();
   if(d<=2)s.hurt(h,2);else if(d<=4)dmg+=2;else dmg+=s.die();
  }
 }
 for(const card of [h.slots.weapon,h.slots.companion]){
  if(card&&["sword","dog"].includes(card.id)&&!h.used.has(card)){
   // Their printed roll adds damage to the current hit (not a future hit).
   const before=h.nextDamage; s.activate(h,card);
   dmg+=h.nextDamage-before;h.nextDamage=before;
  }
 }
 s.monsterHP-=dmg;
 if(s.monster?.id==="troll"&&s.anyEquippedTag("FIRE"))s.trollScorched=true;
}

// ELBERETH is an emergency combat action, not permanent protection.
export function engraveElbereth(s,h,{face=null,mode="ward"}={}){
 if(!s.monster||h.hp<=0||["sentinel","warden","warden-fury"].includes(s.monster.id)||
    s.elberethAttempts>=2)return {legal:false};
 s.setActor(h);
 const attempt=++s.elberethAttempts;
 const chalk=h.inventory.find(x=>x.id==="chalk"&&!h.used.has(x));
 if(chalk&&face===null)h.used.add(chalk);
 const roll=face??rollD20(s,{adv:!!chalk,dis:attempt===2});
 const success=roll===20||roll!==1&&roll+h.card.wit>=15;
 if(success){
  if(mode==="flee"&&s.discardable()){
   s.discard();s.monsterHP=0;s.banished=true;s.metrics.banishments++;
   return {legal:true,success:true,fled:true};
  }
  s.monsterSkip++;return {legal:true,success:true,fled:false};
 }
 // A failed engraving provokes an immediate response; do not resolve that
 // same turn's normal Monster response again. A second failure draws help.
 if(attempt===2&&s.room?.stage!=="FINAL")s.drawMonster();
 s.monsterAdv=true;
 monsterRespond(s,h);
 s.elberethSkipResponse=true;
 return {legal:true,success:false,fled:false};
}

export function executeItemOption(s,h,option){
 const {card,mode}=option;
 s.setActor(h);
 if(mode==="torch-skip"||mode==="lantern-skip"||mode==="lantern-recharge"){
  return s.directItem(h,card,mode,()=>{
   s.consume(h,card);
   if(mode==="lantern-recharge")s.recharge();
   else s.monsterSkip++;
   return true;
  });
 }
 if(mode==="overcharge"){
  return s.directItem(h,card,mode,()=>{
   s.metrics.overcharges++;s.hurt(h,s.die());
   // Overcharge has the printed highest result, even if this kills the Hero.
   // Its roll outcome must not be counted as a *second* activation.
   s.activate(h,card,{face:6,record:false,mode});
   if(h.inventory.includes(card))s.consume(h,card);
   return true;
  });
 }
 const used=s.activate(h,card,{mode});
 if(used&&card.id==="spore-jar")s.consume(h,card);
 return used;
}

function monsterAttack(s,h,{adv=false,dis=false,bonus=0,damageBonus=0,poison=false,drain=false}={}){
 if(h.hp<=0)return; s.setActor(h);
 let defenseAdv=h.nextDefenseAdv,hurtExtra=h.damageVulnerability;
 h.nextDefenseAdv=false;h.damageVulnerability=0;
 s.noteOptions(itemOptions(s,h,"before-defence"));
 const mirror=itemIn(s,h,"mirror");
 if(mirror&&!h.used.has(mirror)){
  // Printed trigger: before opposed defence. Reflection cancels the pending hit.
  s.pendingDamage=0;s.pendingReflect=false;s.activate(h,mirror);
  if(s.pendingReflect){s.pendingReflect=false;return;}
  defenseAdv=defenseAdv||h.nextDefenseAdv;hurtExtra+=h.damageVulnerability;
  h.nextDefenseAdv=false;h.damageVulnerability=0;
 }
 const atk=rollD20(s,{adv:adv||s.monsterAdv,dis:dis||s.monsterDis});
 if(h.slots.armour){
  const bonus={mail:2,shield:1,"cursed-mail":3}[h.slots.armour.id]||0;
  if(bonus)s.notePassive(h.slots.armour,"defence",bonus);
 }
 const blessing=blessBeforeD20(s,h);
 let def=s.rerollIfKept(h,rollD20(s,{adv:defenseAdv||blessing.adv}));
 s.noteOptions(itemOptions(s,h,"after-roll"));
 let defenceBonus=blessing.bonus;
 const lucky=h.slots.ring?.id==="ring-luck"?h.slots.ring:null;
 const undo=itemIn(s,h,"wand-undo");
 if(lucky&&!h.used.has(lucky)){
  s.pendingD20=def;s.pendingD20Modifier=0;s.activate(h,lucky);
  def=s.pendingD20+s.pendingD20Modifier;
 }
 if(undo&&!s.exhausted.has(undo)&&def<13){
  s.pendingD20=def;s.pendingD20Modifier=0;s.activate(h,undo);
  def=s.pendingD20+s.pendingD20Modifier;
 }
 s.monsterAdv=false;s.monsterDis=false;
 if(h.slots.armour?.id==="cursed-mail"&&def===1)s.hurt(h,2);
 const hit=atk===20||atk!==1&&atk+s.monster.atk+bonus>def+s.stats(h).def+defenceBonus+(h.nextDefenseBonus||0);
 if(!hit)return;
 s.noteOptions(itemOptions(s,h,"after-hit"));
 let damage=s.die()+(atk===20?s.die():0)+damageBonus+hurtExtra;
 s.pendingDamage=damage;
 if(h.slots.armour?.id==="shield"&&!h.used.has(h.slots.armour))
  s.activate(h,h.slots.armour);
 const knight=s.pendingDamage>0?s.living().find(x=>x.card.id==="knight"&&!x.used.has("hero")):null;
 if(knight){
  knight.used.add("hero");
  if(s.heroMode(knight)==="steady"&&knight.hp>1){
   s.hurt(knight,1);s.pendingDamage=Math.max(0,s.pendingDamage-3);
  }else{const d=s.die();
  if(d<=2){
   if(knight===h)s.pendingDamage=2;
   else{s.hurt(knight,2);s.pendingDamage=0;}
  } else if(d<=4)s.pendingDamage=Math.max(0,s.pendingDamage-s.die());
  else if(d===5)s.pendingDamage=0;
  else{s.pendingDamage=0;s.forcedBehavior=1;}
  }
 }
 const done=s.hurt(h,s.pendingDamage);
 if(poison&&done>0&&!h.immune)h.poison=true;
 if(drain&&done>0)s.discard(1);
}
export function monsterRespond(s,h){
 if(s.elberethSkipResponse){s.elberethSkipResponse=false;return;}
 if(!s.monster||s.monsterHP<=0)return;
 if(s.monsterSkip>0){s.monsterSkip--;return;}
 const m=s.monster;
 let face=s.forcedBehavior||s.die();s.forcedBehavior=0;
 if(s.rewrites.has(face))face=s.rewrites.get(face);
 if(m.id==="rat"&&s.anyEquippedTag("BEAST")&&face===6)face=1;
 if(m.id==="goblin"&&s.has("goblin-pet")&&face===6)face=1;
 if(m.id==="bat"&&s.anyEquippedTag("FIRE")&&face===6)face=1;
 if(m.id==="eye"&&s.heroes.some(x=>s.equipped(x,"ring-eye"))&&face===6)face=1;
 if(m.id==="mold"&&s.anyEquippedTag("FIRE")&&face===6)face=1;
 if(m.id==="wraith"&&s.anyEquippedTag("MAGIC")&&face===5)face=1;
 if(m.id==="rust"&&!s.anyEquippedTag("METAL")&&face===5)face=1;
 const a=h.hp>0?h:s.chooseActor();s.setActor(a);
 // Monk may transform the revealed monster result BEFORE the result happens.
 const monk=s.living().find(x=>x.card.id==="monk"&&!x.used.has("hero"));
 // A human can wait until a worthwhile response rather than spending
 // STILLNESS on the first harmless result. Preserve the gamble: 1-2 hurts.
 const dangerous=face>=3||m.id==="warden-fury";
 if(monk&&dangerous){
  monk.used.add("hero");
  if(s.heroMode(monk)==="steady"&&face>=5&&monk.hp>2){
   s.hurt(monk,2);face=4;
  }else{const d=s.die();
  if(d<=2)s.hurt(monk,2);
  else if(d<=4&&face>=5)face=4;
  else if(d===5){face=1;s.heal(monk,2);}
  else if(d===6){s.heal(monk,2);return;}
  }
 }
 const band=face<=2?0:face<=4?1:face===5?2:3;
 const hit=(o={})=>monsterAttack(s,a,o);
 s.metrics.cardCounts[m.id]=(s.metrics.cardCounts[m.id]||0)+1;
 switch(m.id){
 case "rat":if(band===1)hit();else if(band===2)a.nextDis++;else if(band===3)hit({bonus:2});break;
 case "goblin":if(band===1)hit();else if(band===2){if(!s.discard())s.hurt(a,2);}else if(band===3)hit({adv:true});break;
 case "crawler":if(band===0)a.nextDis++;else if(band===1)hit();else if(band===2)hit({poison:true});else hit({bonus:2});break;
 case "bat":if(band===1)hit();else if(band===2)a.nextDis++;else if(band===3)hit({adv:true});break;
 case "troll":if(band===1)hit();else if(band===2){
   if(!s.trollScorched)s.monsterHP=Math.min(m.hp,s.monsterHP+2);s.trollScorched=false;
  }else if(band===3)hit({damageBonus:2});break;
 case "wisp":if(band===0)a.nextDis++;else if(band===1)hit();
  else if(band===2)s.hurt(a,2);else hit({adv:true});break;
 case "eye":if(band===1)hit({bonus:2-m.atk});
  else if(band===2){
   const raven=s.living().find(x=>s.equipped(x,"raven")&&!x.used.has("raven-freeze"));
   if(raven)raven.used.add("raven-freeze");else a.nextDis++;
  }else if(band===3)hit({adv:true});break;
 case "mold":if(band===0)a.nextDis++;else if(band===1)s.apply("POISON",[],m);
  else if(band===2)hit();else hit({adv:true});break;
 case "wraith":if(band===0)a.nextDis++;else if(band===1)hit();
  else if(band===2)hit({drain:true});else hit({adv:true});break;
 case "rust":if(band===1)hit();else if(band===2){if(!s.discard(1,{tag:"METAL"}))s.hurt(a,3);}
  else if(band===3)hit({adv:true});break;
 case "cultist":if(band===0)s.monsterAdv=true;else if(band===1)hit({bonus:6-m.atk});
  else if(band===2)s.apply("POISON",[],m);else hit({adv:true});break;
 case "sentinel":if(band===0)a.nextDis++;else if(band===1)hit();
  else if(band===2)hit({damageBonus:2});else hit({adv:true});break;
 case "warden":if(band===1)s.living().forEach(x=>monsterAttack(s,x));else if(band===2)a.nextDis++;
  else if(band===3)hit({adv:true});break;
 case "warden-fury":if(band===0)s.living().forEach(x=>monsterAttack(s,x));else if(band===1)hit({drain:true});
  else if(band===2)s.living().forEach(x=>s.hurt(x,1));else hit({adv:true,damageBonus:2});break;
 default:throw Error("Unimplemented Monster behaviour "+m.id);
 }
 // Trigger poison-sensitive equipped Rings and Companions.
 if(a.poison&&a.hp>0){
  s.noteOptions(itemOptions(s,a,"on-poison"));
  for(const card of [a.slots.companion,a.slots.ring]){
   if(card&&["moth","ring-spores"].includes(card.id)&&!a.used.has(card))s.activate(a,card);
  }
 }
}

