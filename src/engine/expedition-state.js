/**
 * Headless, reusable mutable Rogue Cards rules state.
 * No experiment agents, balance studies, Node APIs, browser APIs, or UI.
 * All mutable game state belongs to the expedition, not global variables.
 */
import {HEROES,ROOMS,MONSTERS,OBJECTS,VAULT,WARDEN,WARDEN_FURY} from "../tabletop-data.js";
import {randomSource} from "./random.js";
import {physicalCopies} from "./physical-cards.js";
import {d6Band} from "./dice-bands.js";
import {applyCardRoll,NON_ROLL_EFFECTS} from "../effect-model.js";
import {ROOM_EFFECTS} from "../room-effect-model.js";
import {resolveRoomChoice,protectHero,roomEntry,monsterEntry} from "../room-memory-engine.js";
import {itemOptions} from "../item-access.js";

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
 const index=d6Band(card,face);
 if(index<0)throw Error("Unprinted result "+card.id+" "+face);
 return index;
};
const stageNames=["UPPER","MIDDLE","DEEP"];
const copyDeck=(rng,source)=>rng.shuffle(
 source===OBJECTS?physicalCopies(source):
 source.flatMap(c=>Array.from({length:c.copies||1},()=>c)));
const scoreItem=(o,strategy)=>{
 const k=o.v2.kind;
 const power={EQUIPMENT:15,RING:13,COMPANION:12,WAND:11,RELIC:9,SCROLL:6,POTION:4,TOOL:4}[k]||1;
 return power+(can(o,"MAGIC")&&strategy==="seal"?14:0)+(can(o,"CURSED")?-7:0)+(o.id==="crown-relic"&&strategy==="seal"?20:0);
};
export const strategies=Object.freeze(["survival","treasure","magic","seal","negotiation"]);
export const roomPolicies=Object.freeze(["scripted","contextual","uniform","second-when-legal"]);

export class ExpeditionState {
 constructor({seed=1,heroes=["warrior"],strategy="survival",roomPolicy="scripted",extraObjectId=null}={}){
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
    nextAdv:0,nextDis:0,nextAtk:0,nextDamage:0,
    nextWitDis:0,nextHitBlock:0,nextDarknessDis:0,ignoreDarknessOnce:false,
    keptUsedPotions:[],
    nextDefenseAdv:false,nextDefenseBonus:0,
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
   this.trapdoorHistory=[];this.pendingTrapLanding=null;this.secretFinds=0;this.skipNextMonster=false;
   this.rerollHistory=[];this.heroAbilityModes={};this.returnChoices={};this.elberethAttempts=0;
   this.elberethSkipResponse=false;this.endingKind=null;this.endingEpilogue=[];
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
  this.potionIdentities=new Map();this.pendingRetainedPotion=null;
  this.elberethAdv=false;
  this.exhausted=new Set();this.consumed=new Set();this.cleansed=new Set();this.pendingReflect=false;
  this.discardPile=[];this.ratFavor=false;
  this.usedCrown=false;this.temporaryCompanions=[];
  this.metrics={cleared:0,battles:0,kills:0,rounds:0,damage:0,drawn:0,spent:0,
   objectDraws:{},itemOpportunities:{},itemUses:{},itemResults:{},
   roomRollBands:{},objectRollBands:{},
   itemPassiveEffects:{},
   activated:0,magicActions:0,potionsUsed:0,scouted:0,negotiations:0,negotiationsWon:0,
   corpses:0,banishments:0,recharged:0,overcharges:0,
   elberethAttempts:0,elberethSuccesses:0,elberethFailures:0,elberethFlees:0,
   sealAvailable:false,
   sealAttempt:false,sealWin:false,won:false,roundLimit:false,unresolved:0,
   operationCounts:{},cardCounts:{},roomChoices:{},roomOptionAvailable:{},
   monsterVisits:{},monsterBehaviorBands:{},objectAcquisitions:{},objectActivations:{},
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
 // Push-your-luck rerolls cost 1, then 2, then 3 HP. The new result stands.
 pushLuck(face,{sides=6,accept=null,max=3,onOne=false}={}){
  for(let count=1;count<=max;count++){
   const h=this.chooseActor();
   const take=this._decisionHook&&!accept?
    this._decisionHook({phase:"reroll",heroIndex:this.heroes.indexOf(h),
     cost:count,face,sides,roomId:this.room?.id}).kind==="reroll":
    accept?accept(face,count,h):
    ["treasure","magic"].includes(this.strategy)&&
    face<=(sides===20?8:2)&&h.hp>count+4;
   if(!take||h.hp<=count)break;
   this.hurt(h,count);if(!this.alive())break;
   face=this.die(sides);
   this.rerollHistory.push({room:this.room?.id||null,cost:count,face});
   if(onOne&&face===1&&this.room?.stage!=="FINAL")this.drawMonster();
  }
  return face;
 }
 fallThrough(destination,{damage=0,monster=false,treasure=0}={}){
  const order=["UPPER","MIDDLE","DEEP","FINAL"];
  const from=order.indexOf(this.room?.stage),to=order.indexOf(destination);
  if(from<0||to<=from)throw Error("Trapdoor must descend to a deeper stage");
  for(let i=from;i<to;i++)if(order[i]!=="FINAL")this.stageProgress[order[i]]=3;
  this.pendingTrapLanding={stage:destination,damage,monster};
  this.trapdoorHistory.push({from:this.room.stage,to:destination,damage,monster,treasure});
  if(treasure)this.draw(treasure);
 }
 // One bonus Room from an earlier depth; returns to current depth.
 cursedDetour(){
  const old=this.room,pile=this.rooms.MIDDLE;
  if(!pile?.length){this.draw();return;}
  const lost=pile.shift();this.secretFinds++;this.room=lost;
  try{if(lost.v2.roll)this.roomRoll();}
  finally{this.room=old;}
 }
 die(n=6){return this.rng.die(n);}
 amount(x){return dice(this.rng,x);}
 living(){return this.heroes.filter(h=>h.hp>0);}
 alive(){return this.living().length>0;}
 /** Resolve an actual player choice in the current printed effect.
  * Old full-expedition policies retain their explicit legacy default.
  * In a decision session the same effect execution pauses and the
  * action is selected from the one canonical legal-action surface.
  */
 chooseEffect(context,modes,legacyMode){
  if(!Array.isArray(modes)||!modes.length||
     new Set(modes).size!==modes.length||
     !modes.includes(legacyMode))throw Error("Invalid effect alternatives "+context);
  if(modes.length===1)return modes[0];
  if(!this._decisionHook)return legacyMode;
  this._pendingEffectChoices={context,modes:[...modes]};
  const action=this._decisionHook({phase:"effect-choice",context});
  if(!modes.includes(action.mode))
   throw Error("Illegal printed effect choice "+context);
  delete this._pendingEffectChoices;
  return action.mode;
 }
 /** Printed Item payments choose an actual physical card, not the
  * lowest-valued card chosen by a hidden strategy heuristic.
  */
 chooseSpentItem(options){
  if(!this._decisionHook||options.length<2)return options[0];
  this._pendingSpendOptions=options.map(({hero,item})=>({
   heroIndex:this.heroes.indexOf(hero),
   index:hero.inventory.indexOf(item),cardId:item.id
  }));
  const action=this._decisionHook({phase:"spend-item"});
  const selected=options.find(({hero,item})=>
   this.heroes.indexOf(hero)===action.heroIndex&&
   hero.inventory.indexOf(item)===action.index&&item.id===action.cardId);
  if(!selected)throw Error("Invalid selected physical Item payment");
  delete this._pendingSpendOptions;
  return selected;
 }
 chooseActor(){const a=this.living().sort((a,b)=>a.hp/a.card.hp-b.hp/b.card.hp);
  return a[0]||this.heroes[0];}
 chooseRecipient(context){
  const alive=this.heroes.map((h,i)=>({h,i})).filter(x=>x.h.hp>0);
  if(!alive.length)return this.heroes[0];
  if(alive.length===1||!this._decisionHook)return this.chooseActor();
  const legacy=String(this.heroes.indexOf(this.chooseActor()));
  const selected=this.chooseEffect("select-hero:"+context,
   alive.map(x=>String(x.i)),legacy);
  return this.heroes[Number(selected)];
 }
 setActor(h){this.actor=h;return h;}
 heroMode(h){return this.heroAbilityModes[h.card.id]||
  (this.strategy==="survival"||this.strategy==="seal"?"steady":"risk");}
 rerollIfKept(h,value){
  const i=h.kept.indexOf("reroll");
  if(i>=0&&value<=10){
   const decision=this._decisionHook?.({phase:"saved-reroll",
    heroIndex:this.heroes.indexOf(h),face:value});
   if(decision?.kind==="keep")return value;
   h.kept.splice(i,1);return this.die(20);
  }
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
  if(!old||old===card){h.slots[slot]=card;return;}
  const legacy=scoreItem(card,this.strategy)>scoreItem(old,this.strategy)?
   "equip-new":"keep-old";
  if(this.chooseEffect("equipment:"+slot+":"+old.id+":"+card.id,
    ["keep-old","equip-new"],legacy)==="equip-new")
   h.slots[slot]=card;
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
     (!Object.values(h.slots).includes(o)||!this.cursed(o)))
    .map(o=>({hero:h,item:o})))
    .sort((a,b)=>scoreItem(a.item,this.strategy)-scoreItem(b.item,this.strategy));
   if(!options.length)return last;
   const sel=preferred&&!this._decisionHook?
    options.find(x=>x.item.id===preferred)||options[0]:
    this.chooseSpentItem(options);
   this.remove(sel.hero,sel.item);this.discardPile.push(sel.item);this.metrics.spent++;last=sel.item;
  }
  this.lastSpent=last;return last;
 }
 salvage(){
  const item=this.discardPile.pop();
  if(!item){this.draw();return null;}
  this.consumed.delete(item);this.add(this.chooseRecipient("salvage"),item);
  return item;
 }
 hurt(h,amt){const n=protectHero(this,h,Math.max(0,amt));const before=h.hp;h.hp=clamp(h.hp-n,0,h.card.hp);
  this.metrics.damage+=before-h.hp;
  if(before>0&&h.hp===0&&!this.alive()&&!this.metrics.wipeCause){
   this.metrics.wipeCause=this.monster?.id||this.room?.id||"unknown-effect";
   this.metrics.wipeStage=this.room?.stage||"unknown";
  }
  return before-h.hp;}
 heal(h,amt){h.hp=clamp(h.hp+Math.max(0,amt),0,h.card.hp);}
 healParty(amt){const h=this.chooseRecipient("heal");if(h.hp>0)this.heal(h,amt);}
 draw(n=1){for(let i=0;i<n;i++){
   if(!this.deck.length)return;
   if(this.forfeitNextItem){this.forfeitNextItem=false;this.deck.unshift(this.deck.pop());continue;}
  const h=this.chooseRecipient("receive-item");const item=this.deck.pop();
   this.noteDeckRemoval(item);this.add(h,item);this.metrics.drawn++;
  this.metrics.objectDraws[item.id]=(this.metrics.objectDraws[item.id]||0)+1;
 }}
 peek(n=1,swap=false){
  if(!this.room||this.room.stage==="FINAL")return;
  const deck=this.rooms[this.room.stage];if(!deck)return;
  this.metrics.scouted++;this.actor.scouting++;
  if(swap&&n>1&&deck.length>=2){
   const danger=r=>(r.v2.roll?.outcomes||[]).some(o=>/draw an? .* monster/i.test(o.effect));
   const legacy=danger(deck[0])&&!danger(deck[1])?"swap":"keep";
   const mode=this.chooseEffect("revealed-room-order:"+this.room.id,
    ["keep","swap"],legacy);
   if(mode==="swap")[deck[0],deck[1]]=[deck[1],deck[0]];
  }
  // Scouted card identities are public knowledge to a fair-information
  // player, not merely a metric. Preserve their next-to-play order.
  this.peekedRoomIds[this.room.stage]=deck.slice(0,n).map(r=>r.id);
 }
 discardable(n=1,tag=null){return this.heroes.reduce((total,h)=>
   total+h.inventory.filter(c=>(!tag||can(c,tag))&&
    !(this.cursed(c)&&Object.values(h.slots).includes(c))).length,0)>=n;}
 exhaustedWand(){for(const h of this.heroes)for(const o of h.inventory)
  if(o.v2.kind==="WAND"&&this.exhausted.has(o))return o;return null;}
 recharge(){
  const options=this.heroes.flatMap((h,heroIndex)=>h.inventory
   .map((card,index)=>({card,heroIndex,index}))
   .filter(x=>x.card.v2.kind==="WAND"&&this.exhausted.has(x.card)));
  if(!options.length)return false;
  const modes=options.map(x=>String(x.heroIndex)+":"+x.index);
  const chosen=this.chooseEffect("recharge-wand",modes,modes[0]);
  const wand=options.find(x=>String(x.heroIndex)+":"+x.index===chosen).card;
  this.exhausted.delete(wand);this.metrics.recharged++;return true;
 }
 consume(h,card){if(!this.remove(h,card))throw Error("Missing owned card "+card.id);
  h.keptUsedPotions=h.keptUsedPotions.filter(x=>x.card!==card);
  this.metrics.spent++;}
 /** A retained *used physical Potion* is a distinct, once-only resource.
  * Its discard is a real choice at the correct printed trigger, not
  * an automatic consequence of revealing the next Monster.
  */
 useRetainedPotion(kind,context){
  const candidates=this.heroes.flatMap((hero,heroIndex)=>
   (hero.keptUsedPotions||[]).filter(x=>x.kind===kind)
    .map(x=>({hero,heroIndex,card:x.card,
      index:hero.inventory.indexOf(x.card)}))
    .filter(x=>x.hero.hp>0&&x.index>=0));
  if(!candidates.length)return false;
  const modes=["save",...candidates.map(x=>
   "use:"+x.heroIndex+":"+x.index)];
  const choice=this.chooseEffect("used-potion:"+kind+":"+context,
   modes,"use:"+candidates[0].heroIndex+":"+candidates[0].index);
  if(choice==="save")return false;
  const x=candidates.find(x=>choice==="use:"+x.heroIndex+":"+x.index);
  if(!x)throw Error("Invalid physical used Potion action");
  this.consume(x.hero,x.card);return true;
 }
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
 beginRoom(room,{deferEntry=false}={}){
   if(this._entryDeferred)throw Error("Previous Room entry still awaiting decisions");
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
   // Trapdoors can reach the Vault before nine ordinary Rooms.
   // Entering FINAL is the authoritative arrival metric, not cleared===9.
   if(room.stage==="FINAL")this.metrics.vaultEntered=true;
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
   // The phase controller pauses HERE, before any retained Room executes
   // its delayed printed trigger. All legacy expedition calls use the same
   // full-effect path immediately (deferEntry defaults to false).
   this._entryDeferred=!!deferEntry;
   this._entryCompleted=false;
   if(!deferEntry)this.completeRoomEntry();
  }
  completeRoomEntry(){
   if(!this.room)throw Error("Room entry requires a revealed Room");
   if(this._entryCompleted)throw Error("Room entry already resolved");
   this._entryDeferred=false;
   this._entryCompleted=true;
   roomEntry(this);
   if(this.pendingTrapLanding?.stage===this.room.stage){
    const landing=this.pendingTrapLanding;this.pendingTrapLanding=null;
    if(landing.damage)this.hurt(this.chooseActor(),landing.damage);
    if(this.alive()&&landing.monster&&this.room.stage!=="FINAL")this.drawMonster();
   }
  }
  endRoom(){
  this.heroes.forEach(h=>{
   h.poison=false;h.immune=false;h.used.clear();
   h.nextHitBlock=0;h.ignoreDarknessOnce=false;
   if(h.defDuration>0&&--h.defDuration===0)h.nextDefenseBonus=0;
  });
  this.elberethAdv=false;
  this.monster=null;this.monsterHP=0;
 }
 nextMonster(region=this.room?.stage){
  if(!region||region==="FINAL")return null;
  const pile=this.monsters[region];
  if(!pile.length)this.monsters[region]=copyDeck(this.rng,MONSTERS.filter(c=>c.stage===region));
  return this.monsters[region].pop();
 }
 drawMonster(){
   if(this.skipNextMonster&&this.room?.id==="u-nest"){
    this.skipNextMonster=false;return;
   }
   const m=this.nextMonster();if(!m)return;
   // The Knight's first DEEP Monster choice happens AFTER seeing that
   // encounter, but BEFORE its printed escape/save trigger resolves.
   if(this._decisionHook&&m.stage==="DEEP"&&this.keptRooms.some(x=>
      x.card.id==="u-hollow-knight"&&x.choice===0)){
    const choice=this._decisionHook({
     phase:"retained",roomId:"u-hollow-knight",monsterId:m.id});
    this.returnChoices["u-hollow-knight"]=choice.mode;
   }
   if(monsterEntry(this,m))return;
  if(!this.monster){
   this.monster=m;this.monsterHP=m.hp;this.banished=false;
   this.elberethAttempts=0;this.elberethSkipResponse=false;
   if(m.stage!=="FINAL"&&this.useRetainedPotion("laughter",m.id))
    this.forcedBehavior=1;
  }else this.monsterQueue.push(m);
  this.metrics.monsterVisits[m.id]=(this.metrics.monsterVisits[m.id]||0)+1;
 }
 activate(h,card,{face=null,consume=true,mode="printed",record=true}={}){
  if(!h.inventory.includes(card))throw Error("Object not owned "+card.id);
  if(!card.v2.roll)throw Error("Non-dice card "+card.id+" needs its printed direct trigger");
  // Keys and door magic cannot force a d6 result on a Room without a printed table.
  // Reject before using, exhausting, or consuming the Object.
  if(!this.room?.v2.roll&&["scroll-unlock","wand-door"].includes(card.id))return false;
  if(card.v2.kind==="WAND"&&this.exhausted.has(card))return false;
  if(card.v2.kind==="POTION"&&h.keptUsedPotions.some(x=>x.card===card))
   return false;
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
  const objectBand=d6Band(card,face);
  const objectKey=card.id+":"+objectBand;
  this.metrics.objectRollBands[objectKey]=(this.metrics.objectRollBands[objectKey]||0)+1;
  this.pendingRetainedPotion=null;
  applyCardRoll({apply:(kind,args,c)=>this.apply(kind,args,c)},card,face);
  const keepPotion=this.pendingRetainedPotion===card;
  this.pendingRetainedPotion=null;
  if(consume&&["SCROLL","POTION"].includes(card.v2.kind)&&
     h.inventory.includes(card)&&!keepPotion)
   this.consume(h,card);
  if(h.card.id==="witch"&&!h.used.has("witch-ability")&&
   ["SCROLL","POTION"].includes(card.v2.kind))this.witchReaction(h);
  if(h.hp>0&&h.slots.ring?.id==="ring-hunger"&&card.id!=="ring-hunger"&&
   can(card,"MAGIC")&&!h.used.has(h.slots.ring)){
   this.noteOptions(itemOptions(this,h,"after-magic"));
   const choice=this._decisionHook?.({phase:"after-magic",
    heroIndex:this.heroes.indexOf(h),cardId:h.slots.ring.id});
   if(!choice||choice.kind==="item-trigger")
    this.activate(h,h.slots.ring,{mode:"magic-reaction"});
  }
  if(record)this.noteItemResult(h,card,mode,before);
  return true;
 }
 thiefReward(){const thief=this.living().find(x=>x.card.id==="thief"&&!x.used.has("hero"));
  if(!thief)return;
  const decision=this._decisionHook?.({phase:"hero-trigger",
   heroIndex:this.heroes.indexOf(thief),context:"after-discovery"});
  if(decision?.kind==="skip")return;
  const mode=decision?.mode||this.heroMode(thief);
  thief.used.add("hero");
  if(mode==="steady"){this.draw();this.discard();return;}
  const d=this.die();
  if(d<=2)this.hurt(thief,2);
  else if(d<=4){this.draw();this.discard();}
  else{this.draw(2);this.discard();}
 }
 witchReaction(h){
  const decision=this._decisionHook?.({phase:"hero-trigger",
   heroIndex:this.heroes.indexOf(h),context:"after-scroll-or-potion"});
  if(decision?.kind==="skip")return;
  const mode=decision?.mode||this.heroMode(h);
  h.used.add("witch-ability");
  if(mode==="steady"){
   if(h.poison)h.poison=false;else this.heal(h,1);
   return;
  }
  const d=this.die();
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
  case "SALVAGE":this.salvage();return;
  case "ORACLE_PROPHECY":{
   const prediction=this.chooseEffect("broken-oracle-guess",
    ["TREASURE","CORRIDOR","OTHER"],"OTHER");
   const stage=this.room?.stage;
   const next=this.rooms[stage]?.[0];
   if(!next)return;
   // Reveal the next card AFTER guessing; the drawn identity never enters
   // the legal guess observation. Leave the Room in its existing order.
   this.peek(1);
   const actual=next.v2.kind==="TREASURE"?"TREASURE":
    next.v2.kind==="CORRIDOR"?"CORRIDOR":"OTHER";
   if(prediction===actual){
    this.peek(2);this.witBonus+=2;
   }else{
    this.hurt(this.actor||this.chooseActor(),2);
    (this.actor||this.chooseActor()).nextWitDis++;
   }
   return;
  }
  case "PASSAGE_PRY":this.hurt(h,this.has("key")?1:2);if(this.alive())this.draw();return;
  case "KEEP_ROOM":this.keptRooms.push({card:this.room});return;
  case "DOUBLE_BID":this.roomRoll();if(this.alive())this.roomRoll();return;
  case "LAMP_EAT":if(this.discardable(1,"FIRE"))this.discard(1,{tag:"FIRE"});
    else this.hurt(h,2);h.nextDis++;return;
  case "CRYPT_WHISPER":this.hurt(h,2);
    if(this.alive())this.roomCheck("CHECK_WIT",0,"NONE","HURT1");return;
  case "DISCARD":this.discard(n());return;
  case "COST":if(!this.discardable(n()))throw Error("Unaffordable Room choice");
   this.lastCostCards=[];for(let i=0;i<n();i++)this.lastCostCards.push(this.discard());return;
  case "PAY_ITEM_OR_HP":if(this.discardable(Number(v))){this.discard(Number(v));}
   else this.hurt(h,Number(args[1]));return;
  case "TRADE":if(this.discardable(Number(v))){this.discard(Number(v));this.draw(Number(args[1]));}return;
  case "PEEK":this.peek(n());return;
  case "PEEK_SWAP":this.peek(n(),true);return;
  case "NEXT_ADV":h.nextAdv++;return;
  case "NEXT_DIS":{
   h.nextDis++;
   if(["d-shadow","u-lamp"].includes(card?.id))h.nextDarknessDis++;
   return;
  }
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
  case "CHOOSE_BEHAVIOR":
   if(this.monster){
    const choices=["1","2","3","4","5","6"];
    this.forcedBehavior=Number(this.chooseEffect("choose-monster-behavior",
     choices,"1"));
   }else this.peek(1);
   return;
  case "D20_MOD":this.pendingD20Modifier+=Number(v);return;
  case "D20_REROLL":
   this.pendingD20=v==="HIGH"?Math.max(this.pendingD20,this.die(20)):this.die(20);
   if(["wand-undo","ring-luck"].includes(card?.id))
    this.pendingD20=this.pushLuck(this.pendingD20,{sides:20,max:2});
   return;
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
  case "SUPPLY_BARTER":{
   const modes=[
    ...(this.exhaustedWand()&&this.discardable(1,"MAGIC")?["recharge"]:[]),
    ...(this.discardable()?["trade"]:[])
   ];
   if(!modes.length)return;
   const mode=this.chooseEffect("supply-barter",modes,
    modes.includes("recharge")&&this.strategy==="magic"?"recharge":
    modes.includes("trade")?"trade":modes[0]);
   if(mode==="recharge"){this.discard(1,{tag:"MAGIC"});this.recharge();}
   else{this.discard();this.draw(2);}
   return;
  }
  case "CLEANSE":{
   const candidates=this.heroes.flatMap((hero,heroIndex)=>hero.inventory
    .map((item,index)=>({item,heroIndex,index}))
    .filter(x=>this.cursed(x.item)));
   if(candidates.length){
    const modes=candidates.map(x=>String(x.heroIndex)+":"+x.index);
    const mode=this.chooseEffect("cleanse-curse",modes,modes[0]);
    const chosen=candidates.find(x=>String(x.heroIndex)+":"+x.index===mode);
    this.cleansed.add(chosen.item);
   }
   return;
  }
  case "CLEANSE_COST":{
   const candidates=this.heroes.flatMap((hero,heroIndex)=>hero.inventory
    .map((item,index)=>({item,hero,heroIndex,index}))
    .filter(x=>this.cursed(x.item)));
   if(candidates.length){
    const modes=candidates.map(x=>String(x.heroIndex)+":"+x.index);
    const mode=this.chooseEffect("sacrifice-curse",modes,modes[0]);
    const chosen=candidates.find(x=>String(x.heroIndex)+":"+x.index===mode);
    this.cleansed.add(chosen.item);this.consume(chosen.hero,chosen.item);
   }
   return;
  }
  case "ALCHEMY_HEAL_OR_TWO":this.heal(h,can(this.lastSpent,"ALCHEMY")?this.die():2);return;
  case "MAGIC_HEAL":if(this.lastCostCards.some(x=>can(x,"MAGIC")))this.heal(h,n());return;
  case "CURSED_EXTRA_DRAW":if(this.anyEquippedTag("CURSED"))this.draw();return;
  case "NEXT_WIT":this.witBonus+=n();return;
  case "NEXT_WIT_DIS":h.nextWitDis++;return;
  case "NEXT_HIT_BLOCK":h.nextHitBlock+=n();return;
  case "IGNORE_DARKNESS":h.ignoreDarknessOnce=true;return;
  case "SKIP_OR_PEEK":if(this.monster)this.monsterSkip++;else this.peek(1);return;
  case "SKIP_IF_MONSTER":if(this.monster)this.monsterSkip+=n();return;
  case "ELBERETH_ADV":this.elberethAdv=true;return;
  case "FIZZY_FOAM":
   if(this.monster)this.monsterSkip++;
   else{
    h.keptUsedPotions.push({card,kind:"foam"});
    this.pendingRetainedPotion=card;
   }
   return;
  case "MIDNIGHT_INK":
   h.keptUsedPotions.push({card,kind:"ink"});
   this.pendingRetainedPotion=card;return;
  case "BOTTLED_LAUGHTER":
   h.keptUsedPotions.push({card,kind:"laughter"});
   this.pendingRetainedPotion=card;return;
  case "MORPH_OR_SKIP":
   if(this.monster?.stage==="FINAL")this.monsterSkip++;
   else if(this.monster){
    this.monster=null;this.monsterHP=0;this.banished=true;
    this.pendingReward=0;this.pendingFightHeal=null;
    this.metrics.banishments++;this.draw();
   }
   return;
  case "BANISH_CURSED_OR_SKIP":
   if(this.monster?.stage==="FINAL")this.monsterSkip++;
   else if(this.monster&&
    (this.monster.v2?.tags?.some(t=>["CURSED","MAGIC"].includes(t)))){
    this.monster=null;this.monsterHP=0;this.banished=true;
    this.pendingReward=0;this.pendingFightHeal=null;
    this.metrics.banishments++;
   }else this.monsterSkip+=2;
   return;
  case "PUSH_UNSEEN_ROOM":{
   const pile=this.rooms[this.room?.stage];
   if(pile?.length){
    const known=new Set(this.peekedRoomIds[this.room.stage]||[]);
    const index=pile.findIndex(x=>!known.has(x.id));
    if(index>=0)pile.push(...pile.splice(index,1));
   }
   return;
  }
  case "ROOM_OR_PEEK":{
   const mode=this.chooseEffect("wand-door-outcome",
    ["printed-5-6","reveal-order"],"printed-5-6");
   if(mode==="printed-5-6")this.roomRoll(5);
   else this.peek(2,true);
   return;
  }
  case "SAVE_TRAP":this.trapGuard=true;return;
  case "SAVE_ATTACK_ADV":h.nextAdv++;return;
  case "SAVE_D20_REROLL":h.kept.push("reroll");return;
  case "SAVE_DEF":h.nextDefenseBonus+=n();h.defDuration=2;
   if(this.room?.id==="d-crown")this.keptRooms.push({card:this.room});
   return;
  case "TRAPDOOR":this.fallThrough(v,{
    damage:args[1]?this.amount(args[1]):0,
    monster:args[2]==="MONSTER",
    treasure:args[2]?.startsWith("DRAW")?Number(args[2].slice(4)):0
   });return;
  case "CURSED_DETOUR":this.cursedDetour();return;
  case "ROLL_ROOM":this.roomRoll();return;
  case "ROLL_ROOM_RISK":this.roomRoll({risk:"2"});return;
  case "ROLL_ROOM_RISK_D6":this.roomRoll({risk:"d6"});return;
  case "ROLL_ROOM_COST_REROLL":this.roomRoll({risk:"item"});return;
  case "CHECK_ATK":case "CHECK_WIT":this.roomCheck(kind,Number(v),args[1],args[2]);return;
  case "PUPPET_BRIBE":{
   let granted=false;
   if(this.anyEquippedTag("CURSED")){
    this.hurt(h,this.die());this.roomRoll(6);granted=true;}
   else if(this.discardable()){this.discard();this.peek();granted=true;}
   if(granted&&this.alive())this.keptRooms.push({card:this.room});
   return;
  }
  case "BOOKCASE_FIRE_OR_SCROLL":{
   const fire=this.has("torch")||this.anyEquippedTag("FIRE");
   const scrolls=this.heroes.flatMap((hero,heroIndex)=>hero.inventory
    .map((item,index)=>({hero,item,heroIndex,index}))
    .filter(x=>x.item.v2.kind==="SCROLL"));
   const modes=[...(fire?["fire"]:[]),
    ...scrolls.map(x=>"scroll:"+x.heroIndex+":"+x.index)];
   if(!modes.length)return;
   const mode=this.chooseEffect("bookcase-payment",modes,modes[0]);
   if(mode==="fire")this.draw();
   else{
    const chosen=scrolls.find(x=>mode==="scroll:"+x.heroIndex+":"+x.index);
    this.consume(chosen.hero,chosen.item);this.peek(2);
   }
   return;
  }
  case "FUNGUS_BURN":{
   const modes=[...(this.has("torch")?["torch"]:[]),
    ...(this.discardable(1,"FIRE")?["discard-fire"]:[])];
   if(!modes.length)return;
   const mode=this.chooseEffect("fungus-fire-source",modes,modes[0]);
   if(mode==="discard-fire")this.discard(1,{tag:"FIRE"});
   this.heal(h,this.die());return;
  }
  case "CHOIR_SILENCE":{
   const song=this.keptRooms.find(x=>x.card.id==="m-treasure");
   const modes=[...(song?["song"]:[]),
    ...(this.has("torch")?["torch"]:[]),
    ...(this.discardable(1,"FIRE")?["discard-fire"]:[])];
   if(!modes.length)return;
   const mode=this.chooseEffect("choir-silence-source",modes,modes[0]);
   if(mode==="song"){
    this.keptRooms.splice(this.keptRooms.indexOf(song),1);
    this.roomRoll(6);return;
   }
   if(mode==="discard-fire")this.discard(1,{tag:"FIRE"});
   this.draw(2);return;
  }
  case "SEAL":return;
  case "WARDEN_FIGHT":return;
  default:throw Error("Unsupported printed effect "+kind+" on "+(card?.id||this.room?.id));
  }
 }
 roomCheck(kind,dc,success,fail){
  const h=this.chooseRecipient("opposed-room-check:"+kind);this.actor=h;
  let wit=kind==="CHECK_WIT";
  const stat=wit?h.card.wit+this.witBonus:this.stats(h).atk;
  let dis=h.poison||h.nextDis>0||
   (wit&&(h.nextWitDis>0||h.slots.armour?.id==="mail"));
  if(wit&&h.slots.armour?.id==="mail")this.notePassive(h.slots.armour,"wit",1);
  let adv=h.nextAdv>0,blessBonus=0;
  h.nextDis=0;h.nextAdv=0;
  if(wit)h.nextWitDis=0;
  const priest=this.living().find(x=>x.card.id==="priest"&&!x.used.has("hero"));
  if(priest){
   const decision=this._decisionHook?.({phase:"hero-trigger",
    heroIndex:this.heroes.indexOf(priest),context:"before-room-d20"});
   const mode=decision?.mode||this.heroMode(priest);
   if(decision?.kind!=="skip"){
   priest.used.add("hero");
   if(mode==="steady"&&priest.hp>1){
    this.hurt(priest,1);blessBonus=2;
   }else{const d=this.die();
    if(d<=2)this.hurt(priest,Math.ceil(this.die()/2));
    else if(d<=4)blessBonus=2;
    else{adv=true;h.poison=false;}
   }
   }
  }
  const roll=()=>this.die(20),a=roll();
  let d=this.rerollIfKept(h,adv&&!dis?Math.max(a,roll()):dis&&!adv?Math.min(a,roll()):a);
  this.noteOptions(itemOptions(this,h,"after-roll"));
  const ring=h.slots.ring;
  if(ring?.id==="ring-luck"&&!h.used.has(ring)&&
     (!this._decisionHook||this._decisionHook({phase:"after-roll",
      heroIndex:this.heroes.indexOf(h),cardId:ring.id}).kind==="item-trigger")){
   this.pendingD20=d;this.pendingD20Modifier=0;this.activate(h,ring);
   d=this.pendingD20+this.pendingD20Modifier;
  }
  const wand=h.inventory.find(x=>x.id==="wand-undo"&&!this.exhausted.has(x));
  if(wand&&(this._decisionHook||d+stat+blessBonus<dc+11)&&
     (!this._decisionHook||this._decisionHook({phase:"after-roll",
      heroIndex:this.heroes.indexOf(h),cardId:wand.id}).kind==="item-trigger")){
   this.pendingD20=d;this.pendingD20Modifier=0;this.activate(h,wand);
   d=this.pendingD20+this.pendingD20Modifier;
  }
  const monsterRoll=roll();
  let ok=d===20||(d!==1&&d+stat+blessBonus>monsterRoll+dc);
  if(!ok){
   const crown=h.inventory.find(x=>x.id==="crown-relic");
   if(crown&&(!this._decisionHook||
      this._decisionHook({phase:"failed-d20",
       heroIndex:this.heroes.indexOf(h),cardId:crown.id}).kind==="item-trigger")){
    this.directItem(h,crown,"rescue-failed-roll",()=>{
     this.consume(h,crown);this.hurt(h,this.die());return true;
    });
    ok=true;
   }
  }
  this.witBonus=0;
  const code=ok?success:fail;
  if(code==="NONE")return;
  if(code==="HURT1"){this.hurt(h,1);return;}
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
   if(mode==="m-maps"&&this.discardable()&&pile.length&&
    this.chooseEffect("cartographer-extra-map",["save","trade"],"trade")==="trade"){
    this.discard();offered.push(pile.shift());
   }
   const rank=r=>(r.v2.kind==="TREASURE"?(this.strategy==="treasure"?7:3):0)+
    (r.v2.kind==="SHRINE"&&this.chooseActor().hp<this.chooseActor().card.hp-2?4:0)-
    (r.v2.kind==="LAIR"?4:0)-(r.v2.kind==="HAZARD"?2:0);
   let candidates=offered;
   if(mode==="m-red-detour"){
    const treasure=offered.filter(x=>x.v2.kind==="TREASURE");if(treasure.length)candidates=treasure;
   }
   let chosen=[...candidates].sort((a,b)=>rank(b)-rank(a))[0];
   if(this._decisionHook&&candidates.length>1){
    // All these Rooms have been revealed by the printed corridor effect.
    // Expose the actual possible next Rooms, not a scripted risk ranking.
    this._offeredRoomChoices=[...candidates];
    const decision=this._decisionHook({
     phase:"corridor",roomId:this.room.id,
     offeredIds:candidates.map(r=>r.id)});
    chosen=candidates.find(r=>r.id===decision.roomId);
    delete this._offeredRoomChoices;
    if(!chosen)throw Error("Illegal chosen corridor Room");
   }
   const other=offered.filter(x=>x!==chosen);
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
  // Lantern Shrine says discard BEFORE a later Room d6. The decision
  // must be taken before even a hypothetical die face is observed.
  const lamp=this.keptRooms.findIndex(x=>x.card.id==="u-lantern-shrine");
  const lampChoice=lamp>=0&&this._decisionHook?
   this.chooseEffect("lantern-shrine-before-roll",
    ["save","use"],"use")==="use":null;
  let face=typeof forced==="number"?forced:this.die();
   if(this.room.id==="vault"&&this.vaultModifiers.omen!=="normal"){
    const second=this.die();face=this.vaultModifiers.omen==="high"?Math.max(face,second):Math.min(face,second);
   }
   if(lamp>=0&&(lampChoice??face<=4)){
    face=Math.min(6,face+2);this.keptRooms.splice(lamp,1);
   }
  const risk=forced&&typeof forced==="object"?forced.risk:null;
  const firstSpent=this.lastSpent;
  if(risk&&["u-fountain","d-last-chest"].includes(this.room.id)){
    face=this.pushLuck(face,{onOne:true});
   }else if(risk){
   const canPay=risk==="item"?this.discardable():this.actor.hp>0;
   const willing=canPay&&this.strategy!=="survival"&&
    this.actor.hp>this.actor.card.hp*.4;
   if(canPay&&this.chooseEffect("room-push-luck:"+this.room.id,
    ["keep","push"],willing?"push":"keep")==="push"){
    if(risk==="item"){if(this.discardable()){this.discard();face=Math.max(face,this.die());}}
    else {this.hurt(this.actor,risk==="d6"?this.die():2);face=Math.max(face,this.die());}
   }
  }
  if(this.has("rope")&&["u-fall","m-bridge","d-bridge"].includes(this.room.id)&&
    this.chooseEffect("rope-room:"+this.room.id,["save","use"],"use")==="use"){
   const h=this.own("rope"),card=byId(h.inventory,"rope");
   this.directItem(h,card,"room-override",()=>{face=6;return true;});
  }
  if(this.has("dog")&&["u-nest","m-beetle"].includes(this.room.id))face=6;
  if(this.room.id==="u-nest"&&this.ratFavor){face=6;this.ratFavor=false;}
  if(this.room.id==="m-beetle"&&this.discardable(1,"METAL")&&
   this.chooseEffect("beetle-metal",["save","pay"],
    this.strategy==="treasure"?"pay":"save")==="pay"){
   this.discard(1,{tag:"METAL"});face=6;
  }
  if(this.has("raven")&&this.room.id==="d-oracle")face=6;
  if(this.has("key")&&["u-gate","u-mimic","m-vault","d-mouth","d-last-chest"].includes(this.room.id)
    &&this.chooseEffect("rusty-key:"+this.room.id,["save","spend"],
    this.strategy!=="seal"?"spend":"save")==="spend"){
   const h=this.own("key");
   this.directItem(h,byId(h.inventory,"key"),"room-option",()=>{
    this.consume(h,byId(h.inventory,"key"));return true;
   });face=6;
  }
  // A Lamp-Eater consumes exposed FIRE; carrying light never guarantees treasure.
  // Opened Crypt no longer treats fire as automatic treasure.

  // FIRE removes Lightless Hall combat disadvantage; it does not guarantee treasure.
  if(this.anyEquippedTag("ICE")&&this.room.id==="d-shadow")face=4;
  if(this.heroes.some(h=>this.equipped(h,"ring-eye"))&&this.room.id==="d-oracle")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-spores"))&&this.room.id==="m-fungus")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-ashes"))&&this.room.id==="u-lamp")face=6;
  if(this.heroes.some(h=>this.equipped(h,"ring-hunger"))&&this.room.id==="d-crown")face=5;
  if(this.room.id==="m-statue"&&can(this.lastSpent,"MAGIC"))face=6;
  if(this.room.id==="d-mirror"&&this.discardable(1,"MAGIC")&&
   this.chooseEffect("mirror-magic",["save","pay"],
    this.strategy==="treasure"?"pay":"save")==="pay"){
   this.discard(1,{tag:"MAGIC"});face=6;
  }
  /* At a ghost auction, even MAGIC cannot guarantee a winning bid. */
  if(this.room.id==="m-well"&&can(firstSpent,"CURSED"))face=6;
  const scrollSub={
   "m-fungus":"scroll-flame","d-choir":"scroll-flame","m-flood":"scroll-frost",
   "m-beetle":"scroll-lightning","u-gate":"scroll-unlock","m-vault":"scroll-unlock",
   "u-mimic":"scroll-unlock","d-last-chest":"scroll-unlock"
  };
  if(scrollSub[this.room.id]&&this.has(scrollSub[this.room.id])&&
   this.chooseEffect("scroll-room:"+this.room.id,["save","read"],
    this.strategy==="magic"?"read":"save")==="read"){
   const h=this.own(scrollSub[this.room.id]),card=byId(h.inventory,scrollSub[this.room.id]);
   this.consume(h,card);face=6;
  }
  const owner=this.heroes.find(h=>h.hp>0&&h.slots.ring?.id==="ring-echo"&&
   !h.used.has(h.slots.ring));
  this.pendingRoomFace=face;
  if(owner){
   this.noteOptions(itemOptions(this,owner,"room-roll"));
   const action=this._decisionHook?.({
    phase:"room-roll",heroIndex:this.heroes.indexOf(owner),
    cardId:owner.slots.ring.id,face,roomId:this.room.id});
   if(!action||action.kind==="item-trigger"){
    this.activate(owner,owner.slots.ring,{mode:"room-reroll"});
    face=this.pendingRoomFace;
   }
  }
  this.pendingRoomFace=null;
  // Spend saved links only when their linked encounters occur.
  if(this.room.id==="d-bridge"&&face<=2){
   const wax=this.keptRooms.find(x=>x.card.id==="m-wax-bridge");
   if(wax){
    const decision=this._decisionHook?.({phase:"retained",
     roomId:"m-wax-bridge",context:"trap",face});
    if((decision?.mode||this.returnChoices?.["m-wax-bridge"])!=="save"){
     this.keptRooms.splice(this.keptRooms.indexOf(wax),1);face=6;
    }
   }
  }
  if(this.room.id==="d-mouth"){
   const judge=this.keptRooms.find(x=>x.card.id==="u-puppet");
   if(judge){
    const decision=this._decisionHook?.({phase:"retained",
     roomId:"u-puppet",context:"talking-door",face});
    if((decision?.mode||this.returnChoices?.["u-puppet"])!=="save"){
     this.keptRooms.splice(this.keptRooms.indexOf(judge),1);face=6;
    }
   }
  }
  const band=ranges(this.room,face),ops=ROOM_EFFECTS[this.room.id].outcomes[band];
  const roomKey=this.room.id+":"+band;
  this.metrics.roomRollBands[roomKey]=(this.metrics.roomRollBands[roomKey]||0)+1;
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
