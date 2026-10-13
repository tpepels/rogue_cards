/**
 * Phase 5 executable state for printed d6 effects.
 * All mutable game state belongs to the expedition. No stateful globals.
 */
import {HEROES,ROOMS,MONSTERS,OBJECTS,VAULT,WARDEN,WARDEN_FURY} from "./tabletop-data.js";
import {randomSource,verifyPrintedData} from "./playtest.js";
import {applyCardRoll,NON_ROLL_EFFECTS} from "./effect-model.js";
import {ROOM_EFFECTS} from "./room-effect-model.js";
import {resolveRoomChoice,protectHero,roomEntry,monsterEntry} from "./room-memory-engine.js";
import {itemOptions} from "./item-access.js";

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
 return power+(can(o,"MAGIC")&&strategy==="seal"?14:0)+(can(o,"CURSED")?-7:0)+(o.id==="crown-relic"&&strategy==="seal"?20:0);
};
export const strategies=Object.freeze(["survival","treasure","magic","seal","negotiation"]);
export const roomPolicies=Object.freeze(["scripted","contextual","uniform","second-when-legal"]);

export class ExpeditionState {
 constructor({seed=1,heroes=["warrior"],strategy="survival",roomPolicy="scripted",extraObjectId=null}={}){
  verifyPrintedData();
  if(!strategies.includes(strategy))throw Error("Unknown full-expedition strategy "+strategy);
  if(!roomPolicies.includes(roomPolicy))throw Error("Unknown Room decision policy "+roomPolicy);
  if(!Array.isArray(heroes)||heroes.length<1||heroes.length>2)throw RangeError("Choose 1–2 Heroes");
  this.rng=randomSource(seed);this.strategy=strategy;this.roomPolicy=roomPolicy;
  if(extraObjectId!==null&&!byId(OBJECTS,extraObjectId))
   throw Error("Unknown extra Object "+extraObjectId);
  this.extraObjectGranted=false;
  this.objectsEverOwned=new Set();this.vaultState=null;this.heroes=heroes.map(id=>{
   const card=byId(HEROES,id);if(!card)throw Error("Unknown Hero "+id);
   return {card,hp:card.hp,inventory:[],slots:{},used:new Set(),poison:false,immune:false,
    nextAdv:0,nextDis:0,nextAtk:0,nextDamage:0,nextDefenseAdv:false,nextDefenseBonus:0,
    damageVulnerability:0,scouting:0,kept:[],nextDefenseBonus:0,defDuration:0,alive:true};
  });
  this.deck=copyDeck(this.rng,OBJECTS);
  // Physical draws from the hidden Item pile, NOT acquisitions/transfers
  // (e.g. reclaiming an Item from the Bottomless Well).
  this.deckRemovedCounts={};
  this.rooms=Object.fromEntries(stageNames.map(s=>[s,this.rng.shuffle(ROOMS.filter(x=>x.stage===s))]));
  this.monsters=Object.fromEntries(stageNames.map(s=>[s,copyDeck(this.rng,MONSTERS.filter(x=>x.stage===s))]));
  this.seenRooms=new Set();
  // Publicly revealed corridor alternatives permanently removed from the
  // physical Room deck (not merely Rooms that were actually entered).
  this.discardedRoomIds=new Set();
   this.keptRooms=[];this.enteredDeep=false;this.skipRoom=false;this.forfeitNextItem=false;
   this.savedPath=null;this.savedPathGrace=0;this.whisperRoom=null;this.nextLadder=false;
   this.stageProgress={UPPER:0,MIDDLE:0,DEEP:0};
   this.fateChoices=[];this.fateDeepEntered=false;this.endingMemory=null;
   this.vaultModifiers={sealCostDelta:0,wardenDamage:0,wardenFirstAdv:false,heroFirstAdv:false,omen:"normal"};
  // Publicly revealed future Rooms from printed scout/peek effects.
  this.peekedRoomIds=Object.fromEntries(stageNames.map(stage=>[stage,[]]));
  this.monsterQueue=[];this.monster=null;this.monsterHP=0;this.monsterSkip=0;
  this.monsterAdv=false;this.monsterDis=false;this.forcedBehavior=0;this.rewrites=new Map();
  this.damageElement=null;this.actor=this.heroes[0];this.room=null;
  this.pendingRoomFace=null;this.pendingDamage=0;this.pendingDefenseAdv=false;
  this.pendingD20=0;this.pendingD20Modifier=0;this.pendingD20Dis=false;
  this.lastSpent=null;this.lastCostCards=[];this.lastDamage=0;this.lastCause=null;this.pendingReward=0;
  this.pendingFightHeal=null;this.banished=false;this.poisonRoom=false;this.trapGuard=false;
  this.extraMonsterAdv=false;this.heroFirstAdv=false;this.witBonus=0;
  this.potionIdentities=new Map();this.exhausted=new Set();this.consumed=new Set();this.cleansed=new Set();this.pendingReflect=false;
  this.usedCrown=false;this.temporaryCompanions=[];
  this.metrics={cleared:0,battles:0,kills:0,rounds:0,damage:0,drawn:0,spent:0,
   objectDraws:{},itemOpportunities:{},itemUses:{},itemResults:{},
   itemPassiveEffects:{},
   activated:0,magicActions:0,potionsUsed:0,scouted:0,negotiations:0,negotiationsWon:0,
   corpses:0,banishments:0,recharged:0,overcharges:0,sealAvailable:false,
   sealAttempt:false,sealWin:false,won:false,roundLimit:false,unresolved:0,
   operationCounts:{},cardCounts:{},roomChoices:{},roomOptionAvailable:{},
   monsterVisits:{},objectAcquisitions:{},objectActivations:{},
   objectRoomExposures:{},objectEquippedRoomExposures:{},
   wipeCause:null,wipeStage:null};
  for(const h of this.heroes){
   const index=this.deck.findIndex(c=>c.id===h.card.v2.starter);
   if(index<0)throw Error("Missing starter "+h.card.v2.starter);
   const starter=this.deck.splice(index,1)[0];
   this.noteDeckRemoval(starter);this.add(h,starter);
   const random=this.deck.pop();this.noteDeckRemoval(random);
   this.add(h,random);this.metrics.objectDraws[random.id]=(this.metrics.objectDraws[random.id]||0)+1;
  }
  // Experimental *extra resource* intervention: move an existing deck copy
  // into the first Hero's inventory without generating a duplicate.
  if(extraObjectId!==null){
   const index=this.deck.findIndex(o=>o.id===extraObjectId);
   if(index>=0){
    const extra=this.deck.splice(index,1)[0];
    this.noteDeckRemoval(extra);this.add(this.heroes[0],extra);
    this.extraObjectGranted=true;
   }
  }
 }
 die(n=6){return this.rng.die(n);}
 amount(x){return dice(this.rng,x);}
 living(){return this.heroes.filter(h=>h.hp>0);}
 alive(){return this.living().length>0;}
 chooseActor(){const a=this.living().sort((a,b)=>a.hp/a.card.hp-b.hp/b.card.hp);
  return a[0]||this.heroes[0];}
 setActor(h){this.actor=h;return h;}
 rerollIfKept(h,value){
  const i=h.kept.indexOf("reroll");
  if(i>=0&&value<=10){h.kept.splice(i,1);return this.die(20);}
  return value;
 }
 own(id){return this.heroes.find(h=>h.inventory.some(o=>o.id===id))||null;}
 has(id){return !!this.own(id);}
 cursed(card){return !!card&&can(card,"CURSED")&&!this.cleansed.has(card);}
 equipped(h,id){return Object.values(h.slots).some(o=>o?.id===id);}
 equippedTag(h,tag){return Object.values(h.slots).some(o=>tag==="CURSED"?this.cursed(o):can(o,tag));}
 itemOfTag(tag){return this.heroes.find(h=>h.inventory.some(o=>can(o,tag)))||null;}
 anyEquippedTag(tag){return this.heroes.some(h=>this.equippedTag(h,tag));}
 partyCount(tag){return this.heroes.reduce((n,h)=>n+h.inventory.filter(o=>can(o,tag)).length,0);}
 noteDeckRemoval(card){
  if(card)this.deckRemovedCounts[card.id]=(this.deckRemovedCounts[card.id]||0)+1;
 }
 add(h,card){if(!card)return;h.inventory.push(card);this.equip(h,card);
  this.objectsEverOwned.add(card.id);
  this.metrics.objectAcquisitions[card.id]=(this.metrics.objectAcquisitions[card.id]||0)+1;
 }
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
 hurt(h,amt){const n=protectHero(this,h,Math.max(0,amt));const before=h.hp;h.hp=clamp(h.hp-n,0,h.card.hp);
  this.metrics.damage+=before-h.hp;
  if(before>0&&h.hp===0&&!this.alive()&&!this.metrics.wipeCause){
   this.metrics.wipeCause=this.monster?.id||this.room?.id||"unknown-effect";
   this.metrics.wipeStage=this.room?.stage||"unknown";
  }
  return before-h.hp;}
 heal(h,amt){h.hp=clamp(h.hp+Math.max(0,amt),0,h.card.hp);}
 healParty(amt){const h=this.chooseActor();if(h.hp>0)this.heal(h,amt);}
 draw(n=1){for(let i=0;i<n;i++){
   if(!this.deck.length)return;
   if(this.forfeitNextItem){this.forfeitNextItem=false;this.deck.unshift(this.deck.pop());continue;}
  const h=this.chooseActor();const item=this.deck.pop();
   this.noteDeckRemoval(item);this.add(h,item);this.metrics.drawn++;
  this.metrics.objectDraws[item.id]=(this.metrics.objectDraws[item.id]||0)+1;
 }}
 peek(n=1,swap=false){
  if(!this.room||this.room.stage==="FINAL")return;
  const deck=this.rooms[this.room.stage];if(!deck)return;
  this.metrics.scouted++;this.actor.scouting++;
  if(swap&&n>1&&deck.length>=2){
   const danger=r=>(r.v2.roll?.outcomes||[]).some(o=>/draw an? .* monster/i.test(o.effect));
   if(danger(deck[0])&&!danger(deck[1]))[deck[0],deck[1]]=[deck[1],deck[0]];
  }
  // Scouted card identities are public knowledge to a fair-information
  // player, not merely a metric. Preserve their next-to-play order.
  this.peekedRoomIds[this.room.stage]=deck.slice(0,n).map(r=>r.id);
 }
 discardable(n=1,tag=null){return this.heroes.reduce((total,h)=>
   total+h.inventory.filter(c=>(!tag||can(c,tag))&&!(can(c,"CURSED")&&this.equipped(h,c.id))).length,0)>=n;}
 exhaustedWand(){for(const h of this.heroes)for(const o of h.inventory)
  if(o.v2.kind==="WAND"&&this.exhausted.has(o))return o;return null;}
 recharge(){const wand=this.exhaustedWand();if(!wand)return false;
  this.exhausted.delete(wand);this.metrics.recharged++;return true;}
 consume(h,card){if(!this.remove(h,card))throw Error("Missing owned card "+card.id);
  this.metrics.spent++;}
 // Passive equipment is beneficial without a roll/activation. Count actual
 // combat/WIT applications here, not merely possession or planner forecasts.
 notePassive(card,kind,amount=0){
  if(!card)return;
  const p=this.metrics.itemPassiveEffects[card.id]??={
   triggers:0,attackBonus:0,defenceBonus:0,witPenalties:0};
  p.triggers++;
  if(kind==="attack")p.attackBonus+=amount;
  else if(kind==="defence")p.defenceBonus+=amount;
  else if(kind==="wit")p.witPenalties+=amount;
 }
 // A legal opportunity is a trigger actually available at the current timing,
 // not merely ownership. Record phase/mode separately to avoid calling a
 // reactive ability an unchosen combat action.
 noteOptions(options){
  for(const {card,mode,phase} of options){
   const key=card.id,cell=this.metrics.itemOpportunities[key]??={
    total:0,byPhase:{},byMode:{}};
   cell.total++;cell.byPhase[phase]=(cell.byPhase[phase]||0)+1;
   cell.byMode[mode]=(cell.byMode[mode]||0)+1;
  }
 }
 itemSnapshot(h){
  return {hp:h.hp,monsterHP:this.monsterHP,drawn:this.metrics.drawn,
   spent:this.metrics.spent,skip:this.monsterSkip,poison:h.poison,
   exhausted:this.exhausted.size,scouted:this.metrics.scouted};
 }
 noteItemResult(h,card,mode,before){
  const id=card.id;
  const cell=this.metrics.itemUses[id]??={total:0,byMode:{}};
  cell.total++;cell.byMode[mode]=(cell.byMode[mode]||0)+1;
  const after=this.itemSnapshot(h);
  const r=this.metrics.itemResults[id]??={
   uses:0,damage:0,healing:0,selfDamage:0,draws:0,
   resourcesSpent:0,responsesSkipped:0,poisonCured:0,recharges:0,scouts:0};
  r.uses++;
  r.damage+=Math.max(0,before.monsterHP-after.monsterHP);
  r.healing+=Math.max(0,after.hp-before.hp);
  r.selfDamage+=Math.max(0,before.hp-after.hp);
  r.draws+=Math.max(0,after.drawn-before.drawn);
  r.resourcesSpent+=Math.max(0,after.spent-before.spent);
  r.responsesSkipped+=Math.max(0,after.skip-before.skip);
  r.poisonCured+=Number(before.poison&&!after.poison);
  r.recharges+=Math.max(0,before.exhausted-after.exhausted);
  r.scouts+=Math.max(0,after.scouted-before.scouted);
 }
 // Covers direct printed actions as well as die rolls, with exactly one
 // result record for the action. Costs are still settled by actual dispatch.
 directItem(h,card,mode,perform){
  const before=this.itemSnapshot(h);
  const result=perform();
  if(result!==false)this.noteItemResult(h,card,mode,before);
  return result;
 }
 beginRoom(room){
   if(this.savedPath){if(this.savedPathGrace>0)this.savedPathGrace--;
    else if(room.stage===this.savedPath.stage){
     // The saved corridor exit is an option against the newly drawn Room.
     const score=r=>(r.v2.kind==="TREASURE"?(this.strategy==="treasure"?6:2):0)+
      (r.v2.kind==="SHRINE"&&this.chooseActor().hp<this.chooseActor().card.hp-3?4:0)-
      (r.v2.kind==="LAIR"?3:0)-(r.v2.kind==="HAZARD"?2:0);
     const alternative=this.savedPath;this.savedPath=null;
     if(score(alternative)>score(room)){this.rooms[room.stage].push(room);room=alternative;}
     else this.rooms[room.stage].push(alternative);
    }}
   this.room=room;this.skipRoom=false;
  this.seenRooms.add(room.id);
  // The current Room has left the pile; any earlier peek of it is spent.
  if(this.peekedRoomIds[room.stage]?.[0]===room.id)
   this.peekedRoomIds[room.stage].shift();
  // Exposure means present at entry; it is NOT proof of a legal activation.
  for(const h of this.living()){
   for(const o of h.inventory)
    this.metrics.objectRoomExposures[o.id]=(this.metrics.objectRoomExposures[o.id]||0)+1;
   for(const o of Object.values(h.slots))
    if(o)this.metrics.objectEquippedRoomExposures[o.id]=(this.metrics.objectEquippedRoomExposures[o.id]||0)+1;
  }this.poisonRoom=false;this.monsterQueue=[];this.pendingReward=0;this.lastCostCards=[];
  this.pendingFightHeal=null;this.extraMonsterAdv=false;
  this.monsterAdv=false;this.monsterDis=false;this.forcedBehavior=0;this.rewrites.clear();
  this.heroes.forEach(h=>{
   h.used.clear();h.immune=false;h.poison=false;
   // NEXT effects stay on the card/hero until consumed, even across Rooms.
   h.damageVulnerability=0;
   });
   roomEntry(this);
  }
  endRoom(){
  this.heroes.forEach(h=>{
   h.poison=false;h.immune=false;h.used.clear();
   if(h.defDuration>0&&--h.defDuration===0)h.nextDefenseBonus=0;
  });
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
   if(monsterEntry(this,m))return;
  if(!this.monster){this.monster=m;this.monsterHP=m.hp;this.banished=false;}
  else this.monsterQueue.push(m);
  this.metrics.monsterVisits[m.id]=(this.metrics.monsterVisits[m.id]||0)+1;
 }
 activate(h,card,{face=null,consume=true,mode="printed",record=true}={}){
  if(!h.inventory.includes(card))throw Error("Object not owned "+card.id);
  if(!card.v2.roll)throw Error("Non-dice card "+card.id+" needs its printed direct trigger");
  // Keys and door magic cannot force a d6 result on a Room without a printed table.
  // Reject before using, exhausting, or consuming the Object.
  if(!this.room?.v2.roll&&["scroll-unlock","wand-door"].includes(card.id))return false;
  if(card.v2.kind==="WAND"&&this.exhausted.has(card))return false;
  if(/ONCE PER ROOM/i.test(card.v2.trigger)&&h.used.has(card))return false;
  const before=this.itemSnapshot(h);
  this.actor=h;this.metrics.activated++;
  this.metrics.cardCounts[card.id]=(this.metrics.cardCounts[card.id]||0)+1;
  this.metrics.objectActivations[card.id]=(this.metrics.objectActivations[card.id]||0)+1;
  if(["SCROLL","WAND","POTION"].includes(card.v2.kind))this.metrics.magicActions+=Number(can(card,"MAGIC"));
  if(card.v2.kind==="POTION"){
   this.metrics.potionsUsed++;
   if(!this.potionIdentities.has(card.id))this.potionIdentities.set(card.id,face??this.die());
   face=this.potionIdentities.get(card.id);
  }
  if(card.v2.kind==="WAND")this.exhausted.add(card);
  if(/ONCE PER ROOM/i.test(card.v2.trigger))h.used.add(card);
  if(face==null)face=this.die();
  if(card.id==="ring-echo"&&face<=2&&this.anyEquippedTag("CURSED")){
   this.hurt(h,this.die());face=6;
  }
  this.lastDamage=0;this.damageElement=null;
  applyCardRoll({apply:(kind,args,c)=>this.apply(kind,args,c)},card,face);
  if(consume&&["SCROLL","POTION"].includes(card.v2.kind)&&h.inventory.includes(card))
   this.consume(h,card);
  if(h.card.id==="witch"&&!h.used.has("witch-ability")&&
   ["SCROLL","POTION"].includes(card.v2.kind))this.witchReaction(h);
  if(h.hp>0&&h.slots.ring?.id==="ring-hunger"&&card.id!=="ring-hunger"&&
   can(card,"MAGIC")&&!h.used.has(h.slots.ring)){
   this.noteOptions(itemOptions(this,h,"after-magic"));
   this.activate(h,h.slots.ring,{mode:"magic-reaction"});
  }
  if(record)this.noteItemResult(h,card,mode,before);
  return true;
 }
 thiefReward(){const thief=this.living().find(x=>x.card.id==="thief"&&!x.used.has("hero"));
  if(!thief)return;thief.used.add("hero");const d=this.die();
  if(d<=2)this.hurt(thief,2);
  else if(d<=4){this.draw();this.discard();}
  else{this.draw(2);this.discard();}
 }
 witchReaction(h){
  h.used.add("witch-ability");const d=this.die();
  if(d<=2)this.apply("POISON",[],null);
  else if(d<=4)this.apply("CURE",[],null);
  else this.forcedBehavior=1;
 }
 basicAttackBonus(h){return h.slots.weapon?.id==="staff"?1:0;}
 stats(h){
  const w=h.slots.weapon,a=h.slots.armour,r=h.slots.ring;
  return {atk:h.card.atk+({sword:2,staff:1,"cursed-blade":4}[w?.id]||0)+(r?.id==="ring-hunger"?2:0),
    def:h.card.def+({mail:2,shield:1,"cursed-mail":3}[a?.id]||0)};
 }
 apply(kind,args,card){
  this.metrics.operationCounts[kind]=(this.metrics.operationCounts[kind]||0)+1;
  const h=this.actor||this.chooseActor(),v=args[0],n=()=>this.amount(v||0);
  switch(kind){
  case "NONE":case "KEEP_ROOM_ROLL":return;
   case "ROOM_SPECIAL":case "ROOM_FATE":resolveRoomChoice(this,Number(v));return;
  case "HURT":this.hurt(h,n());return;
  case "HEAL":this.heal(h,n());return;
  case "HEAL_ALL":for(const a of this.heroes)this.heal(a,n());return;
  case "POISON":if(!h.immune){
    const moth=h.slots.companion?.id==="moth";
    if(moth&&this.room?.id==="m-fungus"&&!h.used.has("moth-garden")){
      h.used.add("moth-garden");return;
    }
    h.poison=true;
   }return;
  case "CURE":h.poison=false;return;
  case "POISON_IMMUNE":h.immune=true;return;
  case "DRAW":this.draw(n());if(card?.type==="room")this.thiefReward();return;
  case "DISCARD":this.discard(n());return;
  case "COST":if(!this.discardable(n()))throw Error("Unaffordable Room choice");
   this.lastCostCards=[];for(let i=0;i<n();i++)this.lastCostCards.push(this.discard());return;
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
  case "SUPPLY_BARTER":if(this.exhaustedWand()&&this.strategy==="magic"&&this.discardable(1,"MAGIC")){
    this.discard(1,{tag:"MAGIC"});this.recharge();}
    else if(this.discardable()){this.discard();this.draw(2);}return;
  case "CLEANSE":{const owner=this.heroes.find(x=>x.inventory.some(y=>this.cursed(y)));
    if(owner){const target=owner.inventory.find(y=>this.cursed(y));this.cleansed.add(target);}return;}
  case "CLEANSE_COST":{const owner=this.heroes.find(x=>x.inventory.some(y=>this.cursed(y)));
    if(owner){const target=owner.inventory.find(y=>this.cursed(y));this.cleansed.add(target);
      this.consume(owner,target);}return;}
  case "ALCHEMY_HEAL_OR_TWO":this.heal(h,can(this.lastSpent,"ALCHEMY")?this.die():2);return;
  case "MAGIC_HEAL":if(this.lastCostCards.some(x=>can(x,"MAGIC")))this.heal(h,n());return;
  case "CURSED_EXTRA_DRAW":if(this.anyEquippedTag("CURSED"))this.draw();return;
  case "NEXT_WIT":this.witBonus+=n();return;
  case "SAVE_TRAP":this.trapGuard=true;return;
  case "SAVE_ATTACK_ADV":h.nextAdv++;return;
  case "SAVE_D20_REROLL":h.kept.push("reroll");return;
  case "SAVE_DEF":h.nextDefenseBonus+=n();h.defDuration=2;return;
  case "ROLL_ROOM":this.roomRoll();return;
  case "ROLL_ROOM_RISK":this.roomRoll({risk:"2"});return;
  case "ROLL_ROOM_RISK_D6":this.roomRoll({risk:"d6"});return;
  case "ROLL_ROOM_COST_REROLL":this.roomRoll({risk:"item"});return;
  case "CHECK_ATK":case "CHECK_WIT":this.roomCheck(kind,Number(v),args[1],args[2]);return;
  case "PUPPET_BRIBE":if(this.anyEquippedTag("CURSED")){
    this.hurt(h,this.die());this.roomRoll(6);}
    else if(this.discardable()){this.discard();this.peek();}return;
  case "BOOKCASE_FIRE_OR_SCROLL":if(this.has("torch")||this.anyEquippedTag("FIRE"))this.draw();
    else{const owner=this.heroes.find(x=>x.inventory.some(y=>y.v2.kind==="SCROLL"));
      if(owner){const item=owner.inventory.find(y=>y.v2.kind==="SCROLL");
       this.consume(owner,item);this.peek(2);}}return;
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
  let dis=h.poison||h.nextDis>0||(wit&&h.slots.armour?.id==="mail");
  if(wit&&h.slots.armour?.id==="mail")this.notePassive(h.slots.armour,"wit",1);
  let adv=h.nextAdv>0,blessBonus=0;
  h.nextDis=0;h.nextAdv=0;
  const priest=this.living().find(x=>x.card.id==="priest"&&!x.used.has("hero"));
  if(priest){priest.used.add("hero");const d=this.die();
   if(d<=2)this.hurt(priest,Math.ceil(this.die()/2));
   else if(d<=4)blessBonus=2;
   else{adv=true;h.poison=false;}
  }
  const roll=()=>this.die(20),a=roll();
  let d=this.rerollIfKept(h,adv&&!dis?Math.max(a,roll()):dis&&!adv?Math.min(a,roll()):a);
  this.noteOptions(itemOptions(this,h,"after-roll"));
  const ring=h.slots.ring;
  if(ring?.id==="ring-luck"&&!h.used.has(ring)){
   this.pendingD20=d;this.pendingD20Modifier=0;this.activate(h,ring);
   d=this.pendingD20+this.pendingD20Modifier;
  }
  const wand=h.inventory.find(x=>x.id==="wand-undo"&&!this.exhausted.has(x));
  if(wand&&d+stat+blessBonus<dc+11){
   this.pendingD20=d;this.pendingD20Modifier=0;this.activate(h,wand);
   d=this.pendingD20+this.pendingD20Modifier;
  }
  const monsterRoll=roll();
  const ok=d===20||(d!==1&&d+stat+blessBonus>monsterRoll+dc);
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
 forkRooms(mode){
   const pile=this.rooms[this.room.stage],count=mode==="u-echoes"?3:2;
   const offered=pile.splice(0,Math.min(count,pile.length));if(!offered.length)return;
   if(mode==="u-echoes"&&offered.length===3){
    const discarded=offered.splice(this.die(3)-1,1)[0];
    this.discardedRoomIds.add(discarded.id);
   }
   if(mode==="m-maps"&&this.discardable()&&pile.length){this.discard();offered.push(pile.shift());}
   const rank=r=>(r.v2.kind==="TREASURE"?(this.strategy==="treasure"?7:3):0)+
    (r.v2.kind==="SHRINE"&&this.chooseActor().hp<this.chooseActor().card.hp-2?4:0)-
    (r.v2.kind==="LAIR"?4:0)-(r.v2.kind==="HAZARD"?2:0);
   let candidates=offered;
   if(mode==="m-red-detour"){
    const treasure=offered.filter(x=>x.v2.kind==="TREASURE");if(treasure.length)candidates=treasure;
   }
   const chosen=[...candidates].sort((a,b)=>rank(b)-rank(a))[0],other=offered.filter(x=>x!==chosen);
   if(mode==="u-mossy")pile.unshift(...other);
   else if(mode==="u-candle"){this.savedPath=other[0]||null;this.savedPathGrace=1;}
   else if(mode==="d-whisper-junction")this.whisperRoom=other[0]||null;
   else if(mode==="u-echoes")pile.push(...other);
   else if(mode==="d-gilded"&&other.some(x=>x.v2.kind==="TREASURE"))this.draw();
   if(mode==="m-ladder")this.nextLadder=true;
   // Non-returning alternatives are now publicly known NOT to be in the
   // hidden pile. The chosen next Room is revealed and remains public.
   const returned=["u-mossy","u-candle","d-whisper-junction","u-echoes"]
    .includes(mode);
   if(!returned)for(const card of other)this.discardedRoomIds.add(card.id);
   const shown=new Set(offered.map(card=>card.id));
   const remainder=(this.peekedRoomIds[this.room.stage]||[])
    .filter(id=>!shown.has(id)&&!this.discardedRoomIds.has(id));
   this.peekedRoomIds[this.room.stage]=[
    chosen.id,...(mode==="u-mossy"?other.map(card=>card.id):[]),
    ...remainder
   ];
   pile.unshift(chosen);
  }
  resolveKeptRoll(card){
   const band=ranges(card,this.die());
   for(const op of card.v2.special.rollOps[band]){const [kind,...args]=op.split(":");this.apply(kind,args,card);}
  }
  roomRoll(forced=null){
  if(!this.room)throw Error("Room roll without Room");
  // Persistent choice Rooms intentionally have no d6 results. An incidental
  // item effect or engine probe must not roll dice or change their choices.
  if(!this.room.v2.roll)return false;
  let face=typeof forced==="number"?forced:this.die();
   if(this.room.id==="vault"&&this.vaultModifiers.omen!=="normal"){
    const second=this.die();face=this.vaultModifiers.omen==="high"?Math.max(face,second):Math.min(face,second);
   }
   const lamp=this.keptRooms.findIndex(x=>x.card.id==="u-lantern-shrine");
   if(lamp>=0&&face<=4){face=Math.min(6,face+2);this.keptRooms.splice(lamp,1);}
  const risk=forced&&typeof forced==="object"?forced.risk:null;
  const firstSpent=this.lastSpent;
  if(risk){
   const willing=this.strategy!=="survival"&&this.actor.hp>this.actor.card.hp*.4;
   if(willing){
    if(risk==="item"){if(this.discardable()){this.discard();face=Math.max(face,this.die());}}
    else {this.hurt(this.actor,risk==="d6"?this.die():2);face=Math.max(face,this.die());}
   }
  }
  if(this.has("rope")&&["u-fall","m-flood","m-bridge","d-bridge"].includes(this.room.id)){
   const h=this.own("rope"),card=byId(h.inventory,"rope");
   this.directItem(h,card,"room-override",()=>{face=6;return true;});
  }
  if(this.has("dog")&&["u-nest","m-beetle"].includes(this.room.id))face=6;
  if(this.room.id==="m-beetle"&&this.strategy==="treasure"&&this.discardable(1,"METAL")){
   this.discard(1,{tag:"METAL"});face=6;
  }
  if(this.has("raven")&&this.room.id==="d-oracle")face=6;
  if(this.has("key")&&["u-gate","u-mimic","m-vault","d-mouth","d-last-chest"].includes(this.room.id)
    &&this.strategy!=="seal"){const h=this.own("key");this.directItem(h,byId(h.inventory,"key"),"room-option",()=>{
     this.consume(h,byId(h.inventory,"key"));return true;});face=6;}
  if((this.has("torch")||this.has("lantern-heart")||this.anyEquippedTag("FIRE"))&&
    this.room.id==="u-lamp")face=6;
  if((this.has("torch")||this.partyCount("FIRE")>0)&&this.room.id==="m-crypt")face=6;
  if(this.anyEquippedTag("FIRE")&&this.room.id==="d-shadow")face=6;
  if(this.anyEquippedTag("ICE")&&this.room.id==="d-shadow")face=4;
  if(this.heroes.some(h=>this.equipped(h,"ring-eye"))&&this.room.id==="d-oracle")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-spores"))&&this.room.id==="m-fungus")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-ashes"))&&this.room.id==="u-lamp")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-hunger"))&&this.room.id==="d-crown")face=5;
  if(this.room.id==="m-statue"&&can(this.lastSpent,"MAGIC"))face=6;
  if(this.room.id==="d-mirror"&&this.strategy==="treasure"&&this.discardable(1,"MAGIC")){
   this.discard(1,{tag:"MAGIC"});face=6;
  }
  if(this.room.id==="m-auction"&&can(this.lastSpent,"MAGIC"))face=6;
  if(this.room.id==="m-well"&&can(firstSpent,"CURSED"))face=6;
  const scrollSub={
   "m-fungus":"scroll-flame","d-choir":"scroll-flame","m-flood":"scroll-frost",
   "m-beetle":"scroll-lightning","u-gate":"scroll-unlock","m-vault":"scroll-unlock",
   "u-mimic":"scroll-unlock","d-last-chest":"scroll-unlock"
  };
  if(this.strategy==="magic"&&scrollSub[this.room.id]&&this.has(scrollSub[this.room.id])){
   const h=this.own(scrollSub[this.room.id]),card=byId(h.inventory,scrollSub[this.room.id]);
   this.consume(h,card);face=6;
  }
  const owner=this.heroes.find(h=>h.hp>0&&h.slots.ring?.id==="ring-echo"&&
   !h.used.has(h.slots.ring));
  this.pendingRoomFace=face;
  if(owner){
   this.noteOptions(itemOptions(this,owner,"room-roll"));
   this.activate(owner,owner.slots.ring,{mode:"room-reroll"});
   face=this.pendingRoomFace;
  }
  this.pendingRoomFace=null;
  const band=ranges(this.room,face),ops=ROOM_EFFECTS[this.room.id].outcomes[band];
  // A kept Reliquary can ignore one printed trap, then must be discarded.
  const traps={"u-gate":[0],"u-fall":[0,1],"u-mimic":[0],"m-vault":[0],
   "m-bridge":[0],"d-bridge":[0,1],"d-last-chest":[0],"d-shadow":[0]};
  if(this.trapGuard&&traps[this.room.id]?.includes(band)){
   this.trapGuard=false;return;
  }
  this.metrics.cardCounts[this.room.id]=(this.metrics.cardCounts[this.room.id]||0)+1;
  for(const op of ops){const [name,...args]=op.split(":");this.apply(name,args,this.room);}
 }
}
export function validateStateEffects(){
 const s=new ExpeditionState({seed:8123,heroes:["warrior","wizard"]});
 return {deckSize:s.deck.length,heroes:s.heroes.length,roomPiles:Object.values(s.rooms).map(a=>a.length)};
}
