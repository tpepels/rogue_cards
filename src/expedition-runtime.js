/**
 * Phase 5 executable state for printed d6 effects.
 * All mutable game state belongs to the expedition. No stateful globals.
 */
import {HEROES,ROOMS,MONSTERS,OBJECTS,VAULT,WARDEN,WARDEN_FURY} from "./tabletop-data.js";
import {randomSource} from "./playtest.js";
import {applyCardRoll,NON_ROLL_EFFECTS} from "./effect-model.js";
import {ROOM_EFFECTS} from "./room-effect-model.js";

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const byId=(array,id)=>array.find(x=>x.id===id);
const can=(o,tag)=>!!o?.v2?.tags?.includes(tag);
const dice=(rng,expression)=>{
 const m=/^(?:(\d+))?d6(?:\+(\d+))?$/.exec(String(expression));
 if(m){let n=Number(m[2]||0);for(let i=0;i<Number(m[1]||1);i++)n+=rng.die(6);return n;}
 const n=Number(expression);if(!Number.isFinite(n))throw Error("Bad printed dice "+expression);
 return n;
};
const ranges=(card,face)=>{
 const index=card.v2.roll.outcomes.findIndex(o=>{
  const [a,b=a]=o.range.split("–").map(Number);return face>=a&&face<=b;
 });if(index<0)throw Error("Unprinted result "+card.id+" "+face);return index;
};
const stageNames=["UPPER","MIDDLE","DEEP"];
const copyDeck=(rng,source)=>rng.shuffle(source.flatMap(c=>Array.from({length:c.copies},()=>c)));
const scoreItem=(o,strategy)=>{
 const k=o.v2.kind;
 const power={EQUIPMENT:15,RING:13,COMPANION:12,WAND:11,RELIC:9,SCROLL:6,POTION:4,TOOL:4}[k]||1;
 return power+(can(o,"MAGIC")&&strategy==="seal"?14:0)+(can(o,"CURSED")?-7:0);
};
export const strategies=Object.freeze(["survival","treasure","magic","seal","negotiation"]);

export class ExpeditionState {
 constructor({seed=1,heroes=["warrior"],strategy="survival"}={}){
  if(!strategies.includes(strategy))throw Error("Unknown full-expedition strategy "+strategy);
  if(!Array.isArray(heroes)||heroes.length<1||heroes.length>2)throw RangeError("Choose 1–2 Heroes");
  this.rng=randomSource(seed);this.strategy=strategy;this.heroes=heroes.map(id=>{
   const card=byId(HEROES,id);if(!card)throw Error("Unknown Hero "+id);
   return {card,hp:card.hp,inventory:[],slots:{},used:new Set(),poison:false,immune:false,
    nextAdv:0,nextDis:0,nextAtk:0,nextDamage:0,nextDefenseAdv:false,nextDefenseBonus:0,
    damageVulnerability:0,scouting:0,kept:[],alive:true};
  });
  this.deck=copyDeck(this.rng,OBJECTS);
  this.rooms=Object.fromEntries(stageNames.map(s=>[s,this.rng.shuffle(ROOMS.filter(x=>x.stage===s)).slice(0,3)]));
  this.monsters=Object.fromEntries(stageNames.map(s=>[s,copyDeck(this.rng,MONSTERS.filter(x=>x.stage===s))]));
  this.monsterQueue=[];this.monster=null;this.monsterHP=0;this.monsterSkip=0;
  this.monsterAdv=false;this.monsterDis=false;this.forcedBehavior=0;this.rewrites=new Map();
  this.damageElement=null;this.actor=this.heroes[0];this.room=null;
  this.pendingRoomFace=null;this.pendingDamage=0;this.pendingDefenseAdv=false;
  this.pendingD20=0;this.pendingD20Modifier=0;this.pendingD20Dis=false;
  this.lastSpent=null;this.lastDamage=0;this.lastCause=null;this.pendingReward=0;
  this.pendingFightHeal=null;this.banished=false;this.poisonRoom=false;this.trapGuard=false;
  this.extraMonsterAdv=false;this.heroFirstAdv=false;this.witBonus=0;
  this.potionIdentities=new Map();this.exhausted=new Set();this.consumed=new Set();this.cleansed=new Set();this.pendingReflect=false;
  this.usedCrown=false;this.temporaryCompanions=[];
  this.metrics={cleared:0,battles:0,kills:0,rounds:0,damage:0,drawn:0,spent:0,
   activated:0,magicActions:0,potionsUsed:0,scouted:0,negotiations:0,negotiationsWon:0,
   corpses:0,banishments:0,recharged:0,overcharges:0,sealAvailable:false,
   sealAttempt:false,sealWin:false,won:false,roundLimit:false,unresolved:0,
   operationCounts:{},cardCounts:{},roomChoices:{},monsterVisits:{}};
  for(const h of this.heroes){
   const index=this.deck.findIndex(c=>c.id===h.card.v2.starter);
   if(index<0)throw Error("Missing starter "+h.card.v2.starter);
   this.add(h,this.deck.splice(index,1)[0]);this.add(h,this.deck.pop());
  }
 }
 die(n=6){return this.rng.die(n);}
 amount(x){return dice(this.rng,x);}
 living(){return this.heroes.filter(h=>h.hp>0);}
 alive(){return this.living().length>0;}
 chooseActor(){const a=this.living().sort((a,b)=>a.hp/a.card.hp-b.hp/b.card.hp);
  return a[0]||this.heroes[0];}
 setActor(h){this.actor=h;return h;}
 own(id){return this.heroes.find(h=>h.inventory.some(o=>o.id===id))||null;}
 has(id){return !!this.own(id);}
 cursed(card){return !!card&&can(card,"CURSED")&&!this.cleansed.has(card);}
 equipped(h,id){return Object.values(h.slots).some(o=>o?.id===id);}
 equippedTag(h,tag){return Object.values(h.slots).some(o=>tag==="CURSED"?this.cursed(o):can(o,tag));}
 itemOfTag(tag){return this.heroes.find(h=>h.inventory.some(o=>can(o,tag)))||null;}
 anyEquippedTag(tag){return this.heroes.some(h=>this.equippedTag(h,tag));}
 partyCount(tag){return this.heroes.reduce((n,h)=>n+h.inventory.filter(o=>can(o,tag)).length,0);}
 add(h,card){if(!card)return;h.inventory.push(card);this.equip(h,card);}
 equip(h,card){
  let slot=null;
  if(can(card,"WEAPON"))slot="weapon";
  else if(can(card,"ARMOUR"))slot="armour";
  else if(card.v2.kind==="RING")slot="ring";
  else if(card.v2.kind==="COMPANION")slot="companion";
  if(!slot)return;
  const old=h.slots[slot];if(old&&this.cursed(old))return;
  if(!old||scoreItem(card,this.strategy)>scoreItem(old,this.strategy))h.slots[slot]=card;
 }
 remove(h,card){
  const pos=h.inventory.indexOf(card);if(pos<0)return false;
  h.inventory.splice(pos,1);
  for(const [key,v] of Object.entries(h.slots))if(v===card)delete h.slots[key];
  this.exhausted.delete(card);this.consumed.add(card);
  for(const c of h.inventory)this.equip(h,c);
  return true;
 }
 discard(n=1,{tag=null,exclude=null,preferred=null}={}){
  let last=null;
  for(let i=0;i<n;i++){
   const options=this.heroes.flatMap(h=>h.inventory
    .filter(o=>(!tag||can(o,tag))&&o!==exclude&&
     (!this.equipped(h,o.id)||!this.cursed(o)))
    .map(o=>({hero:h,item:o})))
    .sort((a,b)=>scoreItem(a.item,this.strategy)-scoreItem(b.item,this.strategy));
   if(!options.length)return last;
   const sel=preferred?options.find(x=>x.item.id===preferred)||options[0]:options[0];
   this.remove(sel.hero,sel.item);this.metrics.spent++;last=sel.item;
  }
  this.lastSpent=last;return last;
 }
 hurt(h,amt){const n=Math.max(0,amt);const before=h.hp;h.hp=clamp(h.hp-n,0,h.card.hp);
  this.metrics.damage+=before-h.hp;return before-h.hp;}
 heal(h,amt){h.hp=clamp(h.hp+Math.max(0,amt),0,h.card.hp);}
 healParty(amt){const h=this.chooseActor();if(h.hp>0)this.heal(h,amt);}
 draw(n=1){for(let i=0;i<n;i++){
  if(!this.deck.length)return;
  const h=this.chooseActor();const item=this.deck.pop();this.add(h,item);this.metrics.drawn++;
 }}
 peek(n=1,swap=false){
  if(!this.room||this.room.stage==="FINAL")return;
  const deck=this.rooms[this.room.stage];if(!deck)return;
  this.metrics.scouted++;this.actor.scouting++;
  if(swap&&n>1&&deck.length>=2){
   const danger=r=>r.v2.roll.outcomes.some(o=>/draw an? .* monster/i.test(o.effect));
   if(danger(deck[0])&&!danger(deck[1]))[deck[0],deck[1]]=[deck[1],deck[0]];
  }
 }
 discardable(n=1,tag=null){return this.heroes.reduce((total,h)=>
   total+h.inventory.filter(c=>(!tag||can(c,tag))&&!(can(c,"CURSED")&&this.equipped(h,c.id))).length,0)>=n;}
 exhaustedWand(){for(const h of this.heroes)for(const o of h.inventory)
  if(o.v2.kind==="WAND"&&this.exhausted.has(o))return o;return null;}
 recharge(){const wand=this.exhaustedWand();if(!wand)return false;
  this.exhausted.delete(wand);this.metrics.recharged++;return true;}
 consume(h,card){if(!this.remove(h,card))throw Error("Missing owned card "+card.id);
  this.metrics.spent++;}
 beginRoom(room){
  this.room=room;this.poisonRoom=false;this.monsterQueue=[];this.pendingReward=0;
  this.pendingFightHeal=null;this.trapGuard=false;this.extraMonsterAdv=false;
  this.monsterAdv=false;this.monsterDis=false;this.forcedBehavior=0;this.rewrites.clear();
  this.heroes.forEach(h=>{
   h.used.clear();h.immune=false;h.poison=false;h.nextAdv=0;h.nextDis=0;
   h.nextAtk=0;h.nextDamage=0;h.damageVulnerability=0;
   h.nextDefenseAdv=false;
  });
 }
 endRoom(){
  this.heroes.forEach(h=>{h.poison=false;h.immune=false;h.used.clear();});
  this.monster=null;this.monsterHP=0;
 }
 nextMonster(region=this.room?.stage){
  if(!region||region==="FINAL")return null;
  const pile=this.monsters[region];
  if(!pile.length)this.monsters[region]=copyDeck(this.rng,MONSTERS.filter(c=>c.stage===region));
  return this.monsters[region].pop();
 }
 drawMonster(){
  const m=this.nextMonster();if(!m)return;
  if(!this.monster){this.monster=m;this.monsterHP=m.hp;this.banished=false;}
  else this.monsterQueue.push(m);
  this.metrics.monsterVisits[m.id]=(this.metrics.monsterVisits[m.id]||0)+1;
 }
 activate(h,card,{face=null,consume=true}={}){
  if(!h.inventory.includes(card))throw Error("Object not owned "+card.id);
  if(!card.v2.roll)throw Error("Non-dice card "+card.id+" needs its printed direct trigger");
  if(card.v2.kind==="WAND"&&this.exhausted.has(card))return false;
  if(/ONCE PER ROOM/i.test(card.v2.trigger)&&h.used.has(card))return false;
  this.actor=h;this.metrics.activated++;
  this.metrics.cardCounts[card.id]=(this.metrics.cardCounts[card.id]||0)+1;
  if(["SCROLL","WAND","POTION"].includes(card.v2.kind))this.metrics.magicActions+=Number(can(card,"MAGIC"));
  if(card.v2.kind==="POTION"){
   this.metrics.potionsUsed++;
   if(!this.potionIdentities.has(card.id))this.potionIdentities.set(card.id,face??this.die());
   face=this.potionIdentities.get(card.id);
  }
  if(card.v2.kind==="WAND")this.exhausted.add(card);
  if(/ONCE PER ROOM/i.test(card.v2.trigger))h.used.add(card);
  if(face==null)face=this.die();
  this.lastDamage=0;this.damageElement=null;
  applyCardRoll({apply:(kind,args,c)=>this.apply(kind,args,c)},card,face);
  if(consume&&["SCROLL","POTION"].includes(card.v2.kind)&&h.inventory.includes(card))
   this.consume(h,card);
  if(h.card.id==="witch"&&!h.used.has("witch-ability")&&
   ["SCROLL","POTION"].includes(card.v2.kind))this.witchReaction(h);
  if(h.slots.ring?.id==="ring-hunger"&&card.id!=="ring-hunger"&&can(card,"MAGIC")&&!h.used.has(h.slots.ring)){
   this.activate(h,h.slots.ring);
  }
  return true;
 }
 witchReaction(h){
  h.used.add("witch-ability");const d=this.die();
  if(d<=2)this.apply("POISON",[],null);
  else if(d<=4)this.apply("CURE",[],null);
  else this.forcedBehavior=1;
 }
 stats(h){
  const w=h.slots.weapon,a=h.slots.armour,r=h.slots.ring;
  return {atk:h.card.atk+({sword:2,staff:1,"cursed-blade":3}[w?.id]||0)+(r?.id==="ring-hunger"?2:0),
    def:h.card.def+({mail:2,shield:1,"cursed-mail":3}[a?.id]||0)};
 }
 apply(kind,args,card){
  this.metrics.operationCounts[kind]=(this.metrics.operationCounts[kind]||0)+1;
  const h=this.actor||this.chooseActor(),v=args[0],n=()=>this.amount(v||0);
  switch(kind){
  case "NONE":case "KEEP_ROOM_ROLL":return;
  case "HURT":this.hurt(h,n());return;
  case "HEAL":this.heal(h,n());return;
  case "HEAL_ALL":for(const a of this.heroes)this.heal(a,n());return;
  case "POISON":if(!h.immune)h.poison=true;return;
  case "CURE":h.poison=false;return;
  case "POISON_IMMUNE":h.immune=true;return;
  case "DRAW":this.draw(n());return;
  case "DISCARD":this.discard(n());return;
  case "COST":if(!this.discardable(n()))throw Error("Unaffordable Room choice");this.discard(n());return;
  case "TRADE":if(this.discardable(Number(v))){this.discard(Number(v));this.draw(Number(args[1]));}return;
  case "PEEK":this.peek(n());return;
  case "PEEK_SWAP":this.peek(n(),true);return;
  case "NEXT_ADV":h.nextAdv++;return;
  case "NEXT_DIS":h.nextDis++;return;
  case "NEXT_ATK":h.nextAtk+=n();return;
  case "NEXT_DAMAGE":h.nextDamage+=n();return;
  case "DEF_ADV":h.nextDefenseAdv=true;return;
  case "VULNERABLE":h.damageVulnerability+=n();return;
  case "BLOCK":this.pendingDamage=v==="ALL"?0:Math.max(0,this.pendingDamage-n());return;
  case "REFLECT":this.pendingReflect=true;this.pendingDamage=0;if(this.monster)this.monsterHP-=n();return;
  case "MONSTER_DIS":this.monsterDis=true;return;
  case "MONSTER_ADV":this.monsterAdv=true;return;
  case "SKIP":this.monsterSkip+=n();return;
  case "FORCE_BEHAVIOR":this.forcedBehavior=n();return;
  case "REWRITE_BEHAVIOR":this.rewrites.set(Number(v),Number(args[1]));return;
  case "SWORD_FIRE":if(this.anyEquippedTag("FIRE"))this.rewrites.set(6,1);return;
  case "MONSTER_DRAW":this.drawMonster();return;
  case "MONSTER_DRAW_OR_FORCE":if(this.monster)this.forcedBehavior=n();else this.drawMonster();return;
  case "ELEMENT":this.damageElement=v;if(this.monster){
    if(this.monster.id==="sentinel"&&v==="LIGHTNING"&&this.lastDamage>0)this.monsterHP-=this.die();
    if(this.monster.id==="warden-fury"&&["FIRE","LIGHTNING"].includes(v)&&this.lastDamage>0)this.monsterSkip++;
    if(this.monster.id==="troll"&&v==="FIRE"&&this.lastDamage>0)this.trollScorched=true;
    if(this.monster.id==="mold"&&v==="FIRE")this.rewrites.set(6,1);
    if(this.monster.id==="mold"&&v==="ICE")this.rewrites.set(5,1);
    if(this.monster.id==="wisp"&&v==="ICE")this.rewrites.set(6,1);
   }return;
  case "DAMAGE":this.lastDamage=n();if(this.monster)this.monsterHP-=this.lastDamage;return;
  case "BANISH_OR_SKIP":if(this.monster?.stage==="FINAL")this.monsterSkip+=n();
   else{this.banished=true;this.monsterHP=0;this.metrics.banishments++;}return;
  case "CHOOSE_BEHAVIOR":if(this.monster)this.forcedBehavior=1;else this.peek(1);return;
  case "D20_MOD":this.pendingD20Modifier+=Number(v);return;
  case "D20_REROLL":this.pendingD20=v==="HIGH"?Math.max(this.pendingD20,this.die(20)):this.die(20);return;
  case "ROOM_OUTCOME":this.roomRoll(Number(v));return;
  case "REROLL_ROOM":if(this.pendingRoomFace!=null){const d=this.die();
    this.pendingRoomFace=v==="BEST"?Math.max(d,this.pendingRoomFace):d;}return;
  case "GOBLIN_EXTRA":if(this.equipped(h,"goblin-pet"))this.draw();return;
  case "BREAK_WAND":if(card&&h.inventory.includes(card))this.consume(h,card);return;
  case "FIGHT_REWARD":this.pendingReward+=n();return;
  case "FIGHT_HEAL":this.pendingFightHeal=v;return;
  case "FIGHT":return;
  case "BANISH":if(this.monster){this.monster=null;this.monsterHP=0;this.banished=true;this.metrics.banishments++;}return;
  case "RECHARGE":this.recharge();return;
  case "CURSED_RECHARGE":if(can(this.lastSpent,"CURSED"))this.recharge();return;
  case "CLEANSE":{const owner=this.heroes.find(x=>x.inventory.some(y=>this.cursed(y)));
    if(owner){const target=owner.inventory.find(y=>this.cursed(y));this.cleansed.add(target);}return;}
  case "CLEANSE_COST":{const owner=this.heroes.find(x=>x.inventory.some(y=>this.cursed(y)));
    if(owner){const target=owner.inventory.find(y=>this.cursed(y));this.cleansed.add(target);
      this.consume(owner,target);}return;}
  case "ALCHEMY_HEAL_OR_TWO":this.heal(h,can(this.lastSpent,"ALCHEMY")?this.die():2);return;
  case "MAGIC_HEAL":if(can(this.lastSpent,"MAGIC"))this.heal(h,n());return;
  case "CURSED_EXTRA_DRAW":if(this.anyEquippedTag("CURSED"))this.draw();return;
  case "NEXT_WIT":this.witBonus+=n();return;
  case "SAVE_TRAP":this.trapGuard=true;return;
  case "SAVE_ATTACK_ADV":h.nextAdv++;return;
  case "SAVE_D20_REROLL":h.kept.push("reroll");return;
  case "SAVE_DEF":h.nextDefenseBonus+=n();return;
  case "ROLL_ROOM":this.roomRoll();return;
  case "ROLL_ROOM_RISK":this.roomRoll({risk:"2"});return;
  case "ROLL_ROOM_RISK_D6":this.roomRoll({risk:"d6"});return;
  case "ROLL_ROOM_COST_REROLL":this.roomRoll({risk:"item"});return;
  case "CHECK_ATK":case "CHECK_WIT":this.roomCheck(kind,Number(v),args[1],args[2]);return;
  case "PUPPET_BRIBE":if(this.anyEquippedTag("CURSED")){
    this.hurt(h,this.die());this.roomRoll(6);}
    else if(this.discardable()){this.discard();this.peek();}return;
  case "BOOKCASE_FIRE_OR_SCROLL":if(this.has("torch")||this.anyEquippedTag("FIRE"))this.draw();
    else if(this.discardable(1,"MAGIC")){this.discard(1,{tag:"MAGIC"});this.peek(2);}return;
  case "FUNGUS_BURN":if(this.has("torch"))this.heal(h,this.die());
    else if(this.discardable(1,"FIRE")){this.discard(1,{tag:"FIRE"});this.heal(h,this.die());}return;
  case "CHOIR_SILENCE":if(this.has("torch"))this.draw(2);
    else if(this.discardable(1,"FIRE")){this.discard(1,{tag:"FIRE"});this.draw(2);}return;
  case "SEAL":return;
  case "WARDEN_FIGHT":return;
  default:throw Error("Unsupported printed effect "+kind+" on "+(card?.id||this.room?.id));
  }
 }
 roomCheck(kind,dc,success,fail){
  const h=this.chooseActor();this.actor=h;
  let wit=kind==="CHECK_WIT";
  const stat=wit?h.card.wit+this.witBonus:this.stats(h).atk;
  const dis=wit&&h.slots.armour?.id==="mail";
  const roll=()=>this.die(20),a=roll(),d=dis?Math.min(a,roll()):a;
  const monsterRoll=roll();
  const ok=d===20||(d!==1&&d+stat>monsterRoll+dc);
  this.witBonus=0;
  const code=ok?success:fail;
  if(code==="DRAW1_RECHARGE"){this.draw();this.recharge();}
  else if(code==="DRAW1")this.draw();
  else if(code==="DRAW2")this.draw(2);
  else if(code==="HEAL2")this.heal(h,2);
  else if(code==="HURT2")this.hurt(h,2);
  else if(code==="HURTd6")this.hurt(h,this.die());
  else throw Error("Unknown check consequence "+code);
 }
 roomRoll(forced=null){
  if(!this.room)throw Error("Room roll without Room");
  let face=typeof forced==="number"?forced:this.die();
  const risk=forced&&typeof forced==="object"?forced.risk:null;
  if(risk){
   const willing=this.strategy!=="survival"&&this.actor.hp>this.actor.card.hp*.4;
   if(willing){
    if(risk==="item"){if(this.discardable()){this.discard();face=Math.max(face,this.die());}}
    else {this.hurt(this.actor,risk==="d6"?this.die():2);face=Math.max(face,this.die());}
   }
  }
  if(this.has("rope")&&["u-fall","m-flood","m-bridge","d-bridge"].includes(this.room.id))face=6;
  if(this.has("dog")&&["u-nest","m-beetle"].includes(this.room.id))face=6;
  if(this.has("raven")&&this.room.id==="d-oracle")face=6;
  if(this.has("key")&&["u-gate","u-mimic","m-vault","d-mouth","d-last-chest"].includes(this.room.id)
    &&this.strategy!=="seal"){const h=this.own("key");this.consume(h,byId(h.inventory,"key"));face=6;}
  if((this.has("torch")||this.has("lantern-heart")||this.anyEquippedTag("FIRE"))&&
    ["u-lamp","m-crypt","d-shadow"].includes(this.room.id))face=6;
  if(this.anyEquippedTag("ICE")&&this.room.id==="d-shadow")face=4;
  if(this.heroes.some(h=>this.equipped(h,"ring-eye"))&&this.room.id==="d-oracle")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-spores"))&&this.room.id==="m-fungus")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-ashes"))&&this.room.id==="u-lamp")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-hunger"))&&this.room.id==="d-crown")face=5;
  if(this.room.id==="m-statue"&&can(this.lastSpent,"MAGIC"))face=6;
  if(this.room.id==="m-auction"&&can(this.lastSpent,"MAGIC"))face=6;
  if(this.room.id==="m-well"&&can(this.lastSpent,"CURSED"))face=6;
  const scrollSub={
   "m-fungus":"scroll-flame","d-choir":"scroll-flame","m-flood":"scroll-frost",
   "m-beetle":"scroll-lightning","u-gate":"scroll-unlock"
  };
  if(this.strategy==="magic"&&scrollSub[this.room.id]&&this.has(scrollSub[this.room.id])){
   const h=this.own(scrollSub[this.room.id]),card=byId(h.inventory,scrollSub[this.room.id]);
   this.consume(h,card);face=6;
  }
  const owner=this.heroes.find(h=>h.slots.ring?.id==="ring-echo"&&!h.used.has("ring-echo"));
  this.pendingRoomFace=face;
  if(owner){this.activate(owner,owner.slots.ring);face=this.pendingRoomFace;}
  this.pendingRoomFace=null;
  const band=ranges(this.room,face),ops=ROOM_EFFECTS[this.room.id].outcomes[band];
  this.metrics.cardCounts[this.room.id]=(this.metrics.cardCounts[this.room.id]||0)+1;
  for(const op of ops){const [name,...args]=op.split(":");this.apply(name,args,this.room);}
 }
}
export function validateStateEffects(){
 const s=new ExpeditionState({seed:8123,heroes:["warrior","wizard"]});
 return {deckSize:s.deck.length,heroes:s.heroes.length,roomPiles:Object.values(s.rooms).map(a=>a.length)};
}
