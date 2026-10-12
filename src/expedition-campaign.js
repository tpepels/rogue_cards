/** Full-effect, policy-driven physical expedition runner.
 * Results measure these explicit play policies, NOT "optimal" human players.
 * All d6 Item/Room operations go through the checked card transcriptions.
 */
import {HEROES,VAULT,WARDEN,WARDEN_FURY} from "./tabletop-data.js";
import {ExpeditionState,strategies,roomPolicies} from "./expedition-runtime.js";
import {ROOM_EFFECTS} from "./room-effect-model.js";
import {verifyObjectCoverage} from "./effect-model.js";
const hasTag=(x,tag)=>!!x?.v2?.tags?.includes(tag);
const isAlive=s=>s.alive();
const bestWit=s=>[...s.living()].sort((a,b)=>b.card.wit-a.card.wit)[0];
const rollD20=(s,{adv=false,dis=false}={})=>{
 const a=s.die(20);return adv&&!dis?Math.max(a,s.die(20)):
  dis&&!adv?Math.min(a,s.die(20)):a;
};
const chooseRoom=s=>{
 const room=s.room,choices=ROOM_EFFECTS[room.id].choices,actor=s.chooseActor();
 if(room.stage==="FINAL")return 0;
 const cost=(ops)=>ops.reduce((n,op)=>n+(/^(?:COST|DISCARD):(\d+)$/.exec(op)?.[1]*1||0),0);
 const affordable=ops=>s.discardable(cost(ops))&&(
  !ops.includes("CLEANSE_COST")||s.partyCount("CURSED")>0);
 const choiceOK=i=>affordable(choices[i])&&(
   !choices[i].some(op=>op==="FUNGUS_BURN"||op==="CHOIR_SILENCE"||op==="BOOKCASE_FIRE_OR_SCROLL")||
    s.has("torch")||s.has("lantern-heart")||s.partyCount("FIRE")>0||s.partyCount("MAGIC")>0);
 const ok0=choiceOK(0),ok1=choiceOK(1);
 for(const i of [0,1])if(i===0?ok0:ok1){
  const key=room.id+":"+i;
  s.metrics.roomOptionAvailable[key]=(s.metrics.roomOptionAvailable[key]||0)+1;
 }
 if(s.forceRoomChoice?.id===room.id){
  s.choiceComparison={
   seen:true,bothLegal:ok0&&ok1,
   hp:s.heroes.map(h=>h.hp),
   inventory:s.heroes.map(h=>h.inventory.map(o=>o.id).sort()),
   pendingMonster:s.monster?.id||null
  };
  if(ok0&&ok1)return s.forceRoomChoice.choice;
 }
 if(!ok0&&!ok1)return null;
 if(s.roomPolicy==="second-when-legal")return ok1?1:0;
 if(s.roomPolicy==="uniform")return ok0&&ok1?s.die(2)-1:ok1?1:0;
 const hpFrac=actor.hp/actor.card.hp;
 if(s.roomPolicy==="contextual"){
  const score=ops=>{
   const text=ops.join(" "),items=s.living().reduce((n,h)=>n+h.inventory.length,0);
   const price=ops.reduce((n,op)=>n+Number(/^(?:COST|DISCARD):(\d+)$/.exec(op)?.[1]||0),0);
   let val=-price*(s.strategy==="seal"?4:2);
   if(/HEAL|CURE/.test(text))val+=hpFrac<.7?8:1;
   if(/DRAW|TRADE|FIGHT_REWARD/.test(text))val+=items<4?7:3;
   if(/RECHARGE/.test(text))val+=s.exhaustedWand()?8:-2;
   if(/CLEANSE/.test(text))val+=s.anyEquippedTag("CURSED")?7:-3;
   if(/BANISH|BRIBE|SILENCE/.test(text))val+=hpFrac<.75?5:2;
   if(/CHECK_WIT/.test(text))val+=Math.max(...s.living().map(h=>h.card.wit))>=3?4:0;
   if(/ROLL_ROOM_RISK|ROLL_ROOM_COST_REROLL/.test(text))val+=hpFrac<.6?-8:1;
   if(/FIGHT/.test(text))val+=hpFrac<.6?-6:0;
   return val;
  };
  return !ok0?1:!ok1?0:score(choices[1])>score(choices[0])?1:0;
 }
 const b=choices[1].join(" ");
 let desired=0;
 if(s.strategy==="survival"&&hpFrac<.65&&/HEAL/.test(b))desired=1;
 if(s.strategy==="magic"&&s.exhaustedWand()&&(/RECHARGE/.test(b)||room.v2.kind==="SHRINE"))desired=1;
 if(s.strategy==="seal"&&/COST:2/.test(b))desired=0;
 if(s.strategy==="treasure"&&/DRAW:2|DRAW:3|FIGHT_REWARD:[23]/.test(b)&&hpFrac>.55)desired=1;
 if(s.strategy==="negotiation"&&(/BANISH|BRIBE|SILENCE|CHECK_WIT|FUNGUS_BURN/.test(b)))desired=1;
 if(["u-nest","m-crypt","d-gate"].includes(room.id)&&s.strategy!=="treasure")desired=0;
 if(!choiceOK(desired))desired=1-desired;
 if(!choiceOK(desired))return null;
 return desired;
};
function rollItem(s,h,card,{face=null}={}){
 s.setActor(h);return s.activate(h,card,{face});
}
function itemIn(s,h,id){return h.inventory.find(o=>o.id===id);}
function itemWith(s,h,kind){return h.inventory.find(o=>o.v2.kind===kind);}
function setupPrepared(s){
 const h=s.chooseActor();s.setActor(h);
 // ONCE PER ROOM scout activations, not new universal actions.
 for(const x of s.heroes){
  if(x.hp<=0)continue;
  for(const id of ["raven","ring-eye","skull","chalk"]){
   const o=itemIn(s,x,id);if(o&&!x.used.has(o)&&
    (o.v2.kind!=="RING"||x.slots.ring===o)&&
    (s.strategy==="treasure"||s.strategy==="seal"))
    rollItem(s,x,o);
  }
  const gp=itemIn(s,x,"goblin-pet"),br=itemIn(s,x,"ring-bargain");
  if(s.room.v2.kind==="ENCOUNTER"){
   if(gp&&x.slots.companion===gp)rollItem(s,x,gp);
   const coin=itemIn(s,x,"coin");
   if(coin&&s.strategy!=="seal"){rollItem(s,x,coin);if(x.inventory.includes(coin))s.consume(x,coin);}
   if(br&&x.slots.ring===br)rollItem(s,x,br);
   const wm=itemIn(s,x,"wand-market");
   if(wm&&!s.exhausted.has(wm)&&s.strategy!=="seal")rollItem(s,x,wm);
  }
  if(s.room.v2.kind==="SHRINE"&&s.anyEquippedTag("CURSED")){
   const needle=itemIn(s,x,"needle");
   if(needle&&s.strategy==="survival"){s.consume(x,needle);s.apply("CLEANSE",[],null);}
  }
  const sight=itemIn(s,x,"scroll-reveal");
  if(sight&&(s.strategy==="treasure"||s.strategy==="seal")&&s.room.stage!=="FINAL")
   rollItem(s,x,sight);
  if(x.poison){
   for(const id of ["moth","ring-spores","needle"]){
    const o=itemIn(s,x,id);if(o&&(!["ring-spores"].includes(id)||x.slots.ring===o))
     {rollItem(s,x,o);if(!x.poison)break;}
   }
  }
  if(x.hp<=x.card.hp-4){
   const needle=itemIn(s,x,"needle");
   if(needle&&!x.used.has(needle))rollItem(s,x,needle);
   for(const kind of ["POTION"]){
    const potion=itemWith(s,x,kind);
    if(potion&&x.hp<=x.card.hp*.65)rollItem(s,x,potion);
   }
  }
 }
 s.setActor(h);
}
function finishRoom(s){
 for(const h of s.heroes){
  if(h.hp<=0)continue;
  // Outside combat the player may use a Potion. No once-per-room Potion limit.
  while(h.hp<=h.card.hp*.5&&h.inventory.some(o=>o.v2.kind==="POTION")){
   const p=h.inventory.find(o=>o.v2.kind==="POTION");const before=h.inventory.length;
   rollItem(s,h,p);
   if(h.inventory.length>=before||!s.alive())break;
  }
 }
 s.endRoom();
}
function actRoom(s){
 const room=s.room;
 const entry=room.v2.prompt.match(/Draw an? (UPPER|MIDDLE|DEEP) Monster/);
 if(entry)s.drawMonster();
 setupPrepared(s);
 const n=chooseRoom(s);
 if(n===null)return;
 s.metrics.roomChoices[room.id+":"+n]=(s.metrics.roomChoices[room.id+":"+n]||0)+1;
 const ops=ROOM_EFFECTS[room.id].choices[n];
 s.setActor(s.chooseActor());
 // The Staff or the printed Shrine option replaces the single Room choice:
 // it cannot grant both Room rewards and a Wand recharge.
 if(room.v2.kind==="SHRINE"&&s.exhaustedWand()&&s.strategy==="magic"){
  if(s.has("staff")||!ops.some(op=>op==="RECHARGE")){s.recharge();return;}
 }
 // A reusable crowbar, one-use Scroll, or exhausted-on-use Wand can
 // replace the printed lock roll, never add an extra Room result.
 const locked=["u-gate","u-mimic","m-vault","d-last-chest"];
 if(n===0&&locked.includes(room.id)&&["treasure","magic"].includes(s.strategy)){
  for(const id of ["scroll-unlock","wand-door","crowbar"]){
   const owner=s.own(id),card=owner&&itemIn(s,owner,id);
   if(card&&!(card.v2.kind==="WAND"&&s.exhausted.has(card))){
    s.activate(owner,card);return;
   }
  }
 }
 if(room.id==="m-fungus"&&n===0&&s.has("spore-jar")&&s.strategy==="survival"){
  const owner=s.own("spore-jar"),card=itemIn(s,owner,"spore-jar");
  s.consume(owner,card);s.heal(owner,s.die());return;
 }
 for(const op of ops){
  const [kind,...args]=op.split(":");s.apply(kind,args,room);
 }
}
// Deliberately require the printed parley cost/roll, and never grant a corpse.
function attemptParley(s,m){
 if(!["negotiation","survival","seal"].includes(s.strategy)||m.stage==="FINAL")return false;
 const h=bestWit(s);if(!h)return false;
 s.setActor(h);
 const cost=(n,tag=null)=>s.discardable(n,tag);
 const pay=(n,tag=null)=>{if(!cost(n,tag))return false;s.discard(n,{tag});return true;};
 let success=false;
 switch(m.id){
 case "rat":success=pay(1);break;
 case "goblin":success=pay(2);if(success){
  const owner=s.chooseActor();if(!owner.slots.companion){owner.recruitedGoblin=true;s.temporaryCompanions.push("goblin");}
 }break;
 case "crawler":{const potion=s.heroes.find(x=>x.inventory.some(o=>o.v2.kind==="POTION"));
  if(potion){s.consume(potion,potion.inventory.find(o=>o.v2.kind==="POTION"));success=true;}break;}
 case "bat":case "wisp":{
  const difficulty=m.id==="bat"?3:5;
  const boon=blessBeforeD20(s,h);
  let rogueAdv=false,rogueDis=false,rogueReward=false;
  if(h.card.id==="rogue"&&!h.used.has("hero")){
   h.used.add("hero");const trick=s.die();
   rogueDis=trick<=2;rogueAdv=trick>=3;rogueReward=trick>=5;
  }
  const r=s.rerollIfKept(h,rollD20(s,{adv:boon.adv||rogueAdv,dis:h.poison||h.slots.armour?.id==="mail"||rogueDis}));
  const opp=s.die(20);
  success=r===20||(r!==1&&r+h.card.wit+boon.bonus>opp+difficulty);
  if(success&&rogueReward)s.draw();
  if(success&&m.id==="wisp")s.peek(1);
  break;
 }
 case "troll":success=pay(2);break;
 case "eye":success=pay(1);break;
 case "mold":{const potion=s.heroes.find(x=>x.inventory.some(o=>o.v2.kind==="POTION"));
  if(potion){s.consume(potion,potion.inventory.find(o=>o.v2.kind==="POTION"));success=true;}break;}
 case "wraith":success=s.anyEquippedTag("CURSED");
  if(success)s.hurt(h,s.die());break;
 case "rust":success=pay(1,"METAL");if(success)s.draw();break;
 case "cultist":success=s.anyEquippedTag("CURSED");
  if(success){s.hurt(h,s.die());s.draw();}break;
 case "sentinel":success=pay(2,"METAL");break;
 default:throw Error("Monster missing parley "+m.id);
 }
 s.metrics.negotiations++;
 if(success){s.metrics.negotiationsWon++;s.metrics.banishments++;
  s.monster=null;s.monsterHP=0;return true;}
 return false;
}
function eatCorpse(s,m){
 if(m.id==="sentinel"||!s.alive())return;
 const h=s.chooseActor();if(!h)return;
 const hungry=h.hp<h.card.hp*.60||h.poison;
 if(!hungry||s.strategy==="seal"&&h.hp>h.card.hp*.35)return;
 s.setActor(h);s.metrics.corpses++;
 const roll=s.die();
 if(roll<=2){
  if(["rat","crawler","mold","eye","rust","troll"].includes(m.id))s.apply("POISON",[],m);
  else s.apply("HURT",[["goblin","wraith","wisp","cultist"].includes(m.id)?"d6":"2"],m);
 }else if(roll<=4){
  if(["crawler","mold"].includes(m.id)&&m.id==="crawler")s.heal(h,2);
  else s.heal(h,m.id==="troll"||m.id==="mold"?s.die():2);
 }else{
  if(["rat","troll"].includes(m.id))s.heal(h,s.die());
  else if(["crawler","mold"].includes(m.id))h.poison=false;
  else if(["goblin","wraith","cultist"].includes(m.id))s.draw(1);
  else if(["eye","bat"].includes(m.id))s.peek(1);
  else if(m.id==="wisp")h.nextAdv++;
  else if(m.id==="rust")h.nextDefenseAdv=true;
 }
}
// Responsible for pre-attack Hero and gear triggers.
function blessBeforeD20(s,target){
 const priest=s.living().find(x=>x.card.id==="priest"&&!x.used.has("hero"));
 if(!priest)return {bonus:0,adv:false};
 priest.used.add("hero");const d=s.die();
 if(d<=2){s.hurt(priest,s.die());return {bonus:0,adv:false};}
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
  h.used.add("hero");const d=s.die();
  if(d<=2)rogueDis=true;else rogueAdv=true;
  if(d>=5){
   const r=rollD20(s,{adv:true}),op=s.die(20);
   if(r===20||r!==1&&r+h.card.wit>op+def)s.draw();
  }
 }
 const adv=attackAdv||rogueAdv||h.nextAdv>0||blessing.adv;
 const dis=attackDis||rogueDis;
 h.nextAdv=0;
 s.pendingD20=s.rerollIfKept(h,rollD20(s,{adv,dis}));
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
  const crown=itemIn(s,h,"crown-relic");
  if(crown&&s.monster&&(s.monster.stage==="FINAL"||h.hp<h.card.hp*.3)){
   s.consume(h,crown);s.hurt(h,s.die());hit=true;return {hit,critical:true};
  }
 }
 return {hit,critical:natural===20};
}
function playerAttack(s,h){
 s.setActor(h);const m=s.monster;if(!m||h.hp<=0)return;
 if(h.card.id==="wizard"&&!h.used.has("hero")&&
  (s.strategy==="magic"||s.monsterHP>=8)){
  h.used.add("hero");const d=s.die();
  if(d<=2)s.hurt(h,s.die());else if(d<=4)s.monsterHP-=s.die()+2;
  else{s.monsterHP-=s.die()+s.die();s.monsterSkip++;}
  return;
 }
 const ring=h.slots.ring;
 if(ring?.id==="ring-ashes"&&!h.used.has(ring))s.activate(h,ring);
 const stat=s.stats(h),r=playerRoll(s,h,stat.atk+(h.recruitedGoblin?1:0),m.def);
 if(!r.hit||h.hp<=0)return;
 let dmg=s.die()+(r.critical?s.die():0);
 dmg+=h.nextDamage;h.nextDamage=0;
 if(h.slots.weapon?.id==="cursed-blade")s.hurt(h,1);
 if(h.card.id==="warrior"&&!h.used.has("hero")){
  h.used.add("hero");const d=s.die();
  if(d<=2)s.hurt(h,2);else if(d<=4)dmg+=2;else dmg+=s.die();
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
function useItemsInCombat(s,h){
 if(!s.monster||h.hp<=0)return false;
 s.setActor(h);
 if(h.hp<h.card.hp*.4){
  const p=h.inventory.find(o=>o.v2.kind==="POTION");
  if(p)return s.activate(h,p);
  for(const id of ["needle","moth"]){
   const x=itemIn(s,h,id);
   if(x&&!h.used.has(x)){s.activate(h,x);return true;}
  }
 }
 if(s.strategy==="survival"&&s.monsterHP<8)return false;
 const monsterThreat=s.monster.hp>=10||s.monster.stage==="FINAL";
 if(s.strategy==="magic"&&["u-lamp","d-shadow","m-crypt"].includes(s.room?.id)){
  const torch=itemIn(s,h,"torch");
  if(torch&&s.monsterSkip===0){
   s.consume(h,torch);s.monsterSkip++;return true;
  }
 }
 if(s.strategy==="magic"&&s.exhaustedWand()){
  const lantern=itemIn(s,h,"lantern-heart");
  if(lantern){s.consume(h,lantern);s.recharge();return true;}
 }
 if(!monsterThreat&&s.strategy!=="magic")return false;
 const names=s.strategy==="seal"?
  ["wand-sparks","wand-frost","wand-turn","wand-morph","spore-jar"]:
  ["scroll-last","scroll-lightning","scroll-flame","wand-sparks","wand-frost",
   "scroll-banish","wand-turn","scroll-frost","wand-morph","scroll-mischief","spore-jar"];
 for(const id of names){
  const card=itemIn(s,h,id);
  if(!card)continue;
  if(card.v2.kind==="WAND"&&s.exhausted.has(card))continue;
  if(card.id==="spore-jar"){s.activate(h,card);s.consume(h,card);return true;}
  s.activate(h,card);return true;
 }
 // A Wand can be deliberately sacrificed for its highest band.
 if(s.monster.stage==="FINAL"&&h.hp>6&&s.strategy==="magic"){
  const wand=h.inventory.find(o=>o.v2.kind==="WAND"&&!s.exhausted.has(o));
  if(wand){s.metrics.overcharges++;s.hurt(h,s.die());
   s.activate(h,wand,{face:6});s.consume(h,wand);return true;}
 }
 return false;
}
function monsterAttack(s,h,{adv=false,dis=false,bonus=0,damageBonus=0,poison=false,drain=false}={}){
 if(h.hp<=0)return; s.setActor(h);
 let defenseAdv=h.nextDefenseAdv,hurtExtra=h.damageVulnerability;
 h.nextDefenseAdv=false;h.damageVulnerability=0;
 const mirror=itemIn(s,h,"mirror");
 if(mirror&&!h.used.has(mirror)){
  // Printed trigger: before opposed defence. Reflection cancels the pending hit.
  s.pendingDamage=0;s.pendingReflect=false;s.activate(h,mirror);
  if(s.pendingReflect){s.pendingReflect=false;return;}
  defenseAdv=defenseAdv||h.nextDefenseAdv;hurtExtra+=h.damageVulnerability;
  h.nextDefenseAdv=false;h.damageVulnerability=0;
 }
 const atk=rollD20(s,{adv:adv||s.monsterAdv,dis:dis||s.monsterDis});
 const blessing=blessBeforeD20(s,h);
 let def=s.rerollIfKept(h,rollD20(s,{adv:defenseAdv||blessing.adv}));
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
 let damage=s.die()+(atk===20?s.die():0)+damageBonus+hurtExtra;
 s.pendingDamage=damage;
 if(h.slots.armour?.id==="shield"&&!h.used.has(h.slots.armour))
  s.activate(h,h.slots.armour);
 const knight=s.living().find(x=>x.card.id==="knight"&&!x.used.has("hero"));
 if(knight){
  knight.used.add("hero");const d=s.die();
  if(d<=2){
   if(knight===h)s.pendingDamage=2;
   else{s.hurt(knight,2);s.pendingDamage=0;}
  } else if(d<=4)s.pendingDamage=Math.max(0,s.pendingDamage-s.die());
  else{s.pendingDamage=0;s.forcedBehavior=1;}
 }
 const done=s.hurt(h,s.pendingDamage);
 if(poison&&done>0&&!h.immune)h.poison=true;
 if(drain&&done>0)s.discard(1);
}
export function monsterRespond(s,h){
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
 if(monk){
  monk.used.add("hero");const d=s.die();
  if(d<=2)s.hurt(monk,2);
  else if(d<=4&&face>=5)face=4;
  else if(d>=5){face=1;s.heal(monk,2);}
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
  for(const card of [a.slots.companion,a.slots.ring]){
   if(card&&["moth","ring-spores"].includes(card.id)&&!a.used.has(card))s.activate(a,card);
  }
 }
}
function fight(s,{warden=false}={}){
 if(!s.monster||!s.alive())return false;
 s.metrics.battles++;s.trollScorched=false;
 const m=s.monster,threshold=warden&&m.id==="warden"?10:0;
 let turns=0;
 while(s.alive()&&s.monsterHP>threshold&&turns<300){
  turns++;
  for(const hero of s.heroes){
   if(hero.hp<=0||s.monsterHP<=threshold)continue;
   if(!useItemsInCombat(s,hero))playerAttack(s,hero);
   if(s.monsterHP<=threshold)break;
   monsterRespond(s,hero);
   if(!s.alive())break;
  }
 }
 s.metrics.rounds+=turns;
 if(turns>=300)s.metrics.roundLimit=true;
 const completed=s.monsterHP<=threshold;
 if(completed&&threshold===0){
  if(!s.banished)s.metrics.kills++;
  if(!s.banished&&!warden)eatCorpse(s,m);
  if(s.pendingReward&&s.alive())s.draw(s.pendingReward);
  if(s.pendingFightHeal&&s.alive())s.healParty(s.amount(s.pendingFightHeal));
  s.pendingReward=0;s.pendingFightHeal=null;
 }
 s.monster=null;
 return completed&&s.alive();
}
function finishMonsters(s){
 while(s.alive()&&(s.monster||s.monsterQueue.length)){
  if(!s.monster){
   const m=s.monsterQueue.shift();s.monster=m;s.monsterHP=m.hp;s.banished=false;
  }
  if(attemptParley(s,s.monster))continue;
  if(!fight(s))return false;
 }
 return s.alive();
}
export function seal(s){
 const cost=s.heroes.length===2?6:3;
 const magic=s.partyCount("MAGIC");s.metrics.sealAvailable=s.discardable(cost,"MAGIC");
 if(!s.metrics.sealAvailable)return false;
 s.metrics.sealAttempt=true;
 s.discard(cost,{tag:"MAGIC"});
 const h=bestWit(s);if(!h)return false;
 const boon=blessBeforeD20(s,h);
 let atk=s.rerollIfKept(h,rollD20(s,{adv:boon.adv,dis:h.poison||h.slots.armour?.id==="mail"}));
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
  // Crown of Rehearsals can rescue even a failed final magical test.
  const owner=s.heroes.find(x=>x.inventory.some(o=>o.id==="crown-relic"));
  if(owner){s.setActor(owner);const crown=itemIn(s,owner,"crown-relic");
   s.consume(owner,crown);s.hurt(owner,s.die());good=true;}
 }
 s.metrics.sealWin=good;return good;
}
export const vaultChoices=Object.freeze(["policy","fight","seal-if-available"]);
export function simulateFullExpedition({seed=1,heroes=["warrior"],strategy="survival",
 roomPolicy="scripted",vaultChoice="policy",extraObjectId=null,forceRoomChoice=null}={}){
 if(!vaultChoices.includes(vaultChoice))throw Error("Unknown Vault decision "+vaultChoice);
 if(forceRoomChoice!==null&&
  (!forceRoomChoice||typeof forceRoomChoice.id!=="string"||
   ![0,1].includes(forceRoomChoice.choice)))
  throw Error("Invalid forced Room choice");
 const s=new ExpeditionState({seed,heroes,strategy,roomPolicy,extraObjectId});
 s.forceRoomChoice=forceRoomChoice;
 s.choiceComparison=null;
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  while(s.rooms[stage].length){
   const room=s.rooms[stage].shift();s.beginRoom(room);
   actRoom(s);
   if(!s.alive()||!finishMonsters(s))return report(s);
   finishRoom(s);s.metrics.cleared++;
   if(s.metrics.roundLimit)return report(s);
  }
 }
 if(!s.alive())return report(s);
 s.beginRoom(VAULT);s.roomRoll();
 s.metrics.sealAvailable=s.discardable(s.heroes.length===2?6:3,"MAGIC");
 // Captured *before* the branch: same seed + policy must yield the same state
 // regardless of whether the Vault decision is fight or seal-if-available.
 s.vaultState={
  hp:s.heroes.map(h=>h.hp),maxHP:s.heroes.map(h=>h.card.hp),
  inventory:s.heroes.map(h=>h.inventory.map(o=>o.id).sort()),
  equipped:s.heroes.map(h=>Object.fromEntries(
   Object.entries(h.slots).map(([slot,item])=>[slot,item.id]))),
  magicHeld:s.partyCount("MAGIC"),
  sealAffordable:s.metrics.sealAvailable,
  potions:s.heroes.reduce((n,h)=>n+h.inventory.filter(o=>o.v2.kind==="POTION").length,0),
  scrolls:s.heroes.reduce((n,h)=>n+h.inventory.filter(o=>o.v2.kind==="SCROLL").length,0),
  wands:s.heroes.reduce((n,h)=>n+h.inventory.filter(o=>o.v2.kind==="WAND").length,0),
  exhaustedWands:s.exhausted.size
 };
 if(!s.alive())return report(s);
 const preferSeal=vaultChoice==="seal-if-available"||(vaultChoice==="policy"&&
  (strategy==="seal"||(strategy==="survival"&&
   s.partyCount("MAGIC")>=3&&s.heroes.every(h=>h.hp<h.card.hp*.55))));
 if(preferSeal&&seal(s)){s.metrics.won=true;return report(s);}
 if(s.metrics.sealAttempt)s.monsterAdv=true;
 s.monster=WARDEN;s.monsterHP=WARDEN.hp;
 s.metrics.monsterVisits.warden=(s.metrics.monsterVisits.warden||0)+1;
 if(!fight(s,{warden:true}))return report(s);
 s.monster=WARDEN_FURY;s.monsterHP=Math.max(0,Math.min(WARDEN_FURY.hp,s.monsterHP));
 s.metrics.monsterVisits["warden-fury"]=(s.metrics.monsterVisits["warden-fury"]||0)+1;
 if(!fight(s,{warden:true}))return report(s);
 s.metrics.won=true;return report(s);
}
function report(s){
 const {operationCounts,cardCounts,roomChoices,roomOptionAvailable,
  monsterVisits,objectAcquisitions,objectActivations,objectRoomExposures,
  objectEquippedRoomExposures,...m}=s.metrics;
 return {...m,remainingHP:s.heroes.map(h=>h.hp),magicHeld:s.partyCount("MAGIC"),
  failureStage:s.metrics.won?null:s.metrics.roundLimit?"ROUND_LIMIT":
   s.metrics.wipeStage||s.room?.stage||"unknown",
  failureCause:s.metrics.won?null:s.metrics.roundLimit?"ROUND_LIMIT":
   s.metrics.wipeCause||"unknown",
  vaultState:s.vaultState,
  extraObjectGranted:s.extraObjectGranted,
  choiceComparison:s.choiceComparison,
  objectsEverOwned:[...s.objectsEverOwned].sort(),
  operationCounts,cardCounts,roomChoices,roomOptionAvailable,monsterVisits,
  objectAcquisitions,objectActivations,objectRoomExposures,objectEquippedRoomExposures,
  identifiedPotions:s.potionIdentities.size,
  exhaustedWands:s.exhausted.size};
}
export function simulateFullBatch({runs=1000,seed=1,heroes=["warrior"],strategy="survival",
 roomPolicy="scripted",vaultChoice="policy"}={}){
 if(!Number.isSafeInteger(runs)||runs<1||runs>100000)throw RangeError("Bad number of runs");
 if(!roomPolicies.includes(roomPolicy))throw Error("Unknown Room policy "+roomPolicy);
 if(!vaultChoices.includes(vaultChoice))throw Error("Unknown Vault choice "+vaultChoice);
 const sum={wins:0,vault:0,deep:0,damage:0,drawn:0,spent:0,rounds:0,battles:0,
  negotiations:0,corpses:0,activated:0,potions:0,scouts:0,magic:0,
  unidentified:0,unresolved:0,stalls:0,sealAvailable:0,sealAttempts:0,sealWins:0,cardCounts:{},roomChoices:{},
  monsterVisits:{},operationCounts:{},roomOptionAvailable:{},
  objectAcquisitions:{},objectActivations:{},objectRoomExposures:{},
  objectEquippedRoomExposures:{},objectSeenRuns:{},objectSeenWins:{},
  failureCauses:{},failureStages:{},vaultHp:0,vaultMaxHp:0,vaultMagic:0};
 for(let i=0;i<runs;i++){
  const r=simulateFullExpedition({seed:(seed+i*0x9e3779b1)>>>0,heroes,strategy,roomPolicy,vaultChoice});
  sum.wins+=Number(r.won);sum.vault+=Number(r.cleared===9);
  sum.deep+=Number(r.cleared>=6);sum.damage+=r.damage;sum.drawn+=r.drawn;
  sum.spent+=r.spent;sum.rounds+=r.rounds;sum.battles+=r.battles;
  sum.negotiations+=r.negotiations;sum.corpses+=r.corpses;sum.activated+=r.activated;
  sum.potions+=r.potionsUsed;sum.scouts+=r.scouted;sum.magic+=r.magicActions;
  sum.unidentified+=r.identifiedPotions;sum.unresolved+=r.unresolved;
  sum.stalls+=Number(r.roundLimit);sum.sealAvailable+=Number(r.sealAvailable);
  sum.sealAttempts+=Number(r.sealAttempt);sum.sealWins+=Number(r.sealWin);
  if(r.vaultState){sum.vaultHp+=r.vaultState.hp.reduce((a,b)=>a+b,0);
   sum.vaultMaxHp+=r.vaultState.maxHP.reduce((a,b)=>a+b,0);
   sum.vaultMagic+=r.vaultState.magicHeld;}
  if(!r.won){
   sum.failureCauses[r.failureCause]=(sum.failureCauses[r.failureCause]||0)+1;
   sum.failureStages[r.failureStage]=(sum.failureStages[r.failureStage]||0)+1;
  }
  for(const id of r.objectsEverOwned){
   sum.objectSeenRuns[id]=(sum.objectSeenRuns[id]||0)+1;
   if(r.won)sum.objectSeenWins[id]=(sum.objectSeenWins[id]||0)+1;
  }
  for(const key of ["cardCounts","roomChoices","roomOptionAvailable","monsterVisits","operationCounts",
   "objectAcquisitions","objectActivations","objectRoomExposures","objectEquippedRoomExposures"])
   for(const [name,n] of Object.entries(r[key]))sum[key][name]=(sum[key][name]||0)+n;
 }
 const mean=x=>sum[x]/runs;
 return {model:"phase5-explicit-card-policy-v1",strategy,heroes,roomPolicy,vaultChoice,runs,
  winCount:sum.wins,vaultCount:sum.vault,deepCount:sum.deep,
  winRate:mean("wins"),vaultRate:mean("vault"),deepRate:mean("deep"),
  meanDamage:mean("damage"),meanDrawn:mean("drawn"),meanSpent:mean("spent"),
  meanCombatRounds:mean("rounds"),meanBattles:mean("battles"),
  meanNegotiations:mean("negotiations"),meanCorpses:mean("corpses"),
  meanActivated:mean("activated"),meanPotions:mean("potions"),
  meanScouting:mean("scouts"),meanMagic:mean("magic"),
  sealAvailabilityAtVault:sum.sealAvailable/Math.max(1,sum.vault),
  sealAttempts:sum.sealAttempts,sealWins:sum.sealWins,
  wardenWins:sum.wins-sum.sealWins,
  sealAttemptRateAtVault:sum.sealAttempts/Math.max(1,sum.vault),
  sealSuccessRatePerAttempt:sum.sealWins/Math.max(1,sum.sealAttempts),
  sealWinRateAtVault:sum.sealWins/Math.max(1,sum.vault),
  unresolvedEffects:sum.unresolved,stalledExpeditions:sum.stalls,
  meanVaultPartyHP:sum.vaultHp/Math.max(1,sum.vault),
  meanVaultPartyMaxHP:sum.vaultMaxHp/Math.max(1,sum.vault),
  meanVaultMagicHeld:sum.vaultMagic/Math.max(1,sum.vault),
  failureCauses:sum.failureCauses,failureStages:sum.failureStages,
  objectSeenRuns:sum.objectSeenRuns,objectSeenWins:sum.objectSeenWins,
  objectAcquisitions:sum.objectAcquisitions,objectActivations:sum.objectActivations,
  objectRoomExposures:sum.objectRoomExposures,
  objectEquippedRoomExposures:sum.objectEquippedRoomExposures,
  cardActivations:sum.cardCounts,roomChoices:sum.roomChoices,
  roomOptionAvailable:sum.roomOptionAvailable,
  monsterVisits:sum.monsterVisits,operations:sum.operationCounts};
}
