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
   this.pactUsed=false;this.tuckedRoomItems=[];this.reverseNextRoomStage=null;
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
   // No player can react after a party wipe, and an unaffordable
   // reroll is not a player choice. Check BEFORE the decision hook.
   if(!this.alive())break;
   const h=this.chooseActor();
   if(h.hp<=count)break;
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
  if(this._trapDamageContext&&this._trapPrevention>0){
   damage=Math.max(0,damage-this._trapPrevention);
   this._trapPrevention=0;
  }
  // Knotted Rope and kept Wax Bridge are genuine optional once-only
  // payments AFTER the fall damage is known. Neither can dismiss a Monster.
  // Choosing to save them remains legal, and the search can spend multiple
  // different resources if more than 3 damage remains.
  for(let turn=0;damage>0&&turn<12;turn++){
   const ropes=this.heroes.flatMap((hero,heroIndex)=>hero.inventory
    .map((card,index)=>({hero,heroIndex,card,index}))
    .filter(x=>x.hero.hp>0&&x.card.id==="rope"&&
     !x.hero.used.has(x.card)));
   const wax=this.keptRooms.findIndex(x=>x.card.id==="m-wax-bridge");
   if(!ropes.length&&wax<0)break;
   const modes=["accept",...(wax>=0?["wax"]:[]),
    ...ropes.map(x=>"rope:"+x.heroIndex+":"+x.index)];
   const mode=this.chooseEffect("fall-damage-prevention",
    modes,wax>=0?"wax":modes[1]);
   if(mode==="accept")break;
   if(mode==="wax")this.keptRooms.splice(wax,1);
   else{
    const paid=ropes.find(x=>mode==="rope:"+x.heroIndex+":"+x.index);
    if(!paid)throw Error("Illegal physical Rope payment");
    this.directItem(paid.hero,paid.card,"prevent-falling",()=>{
     paid.hero.used.add(paid.card);return true;
    });
   }
   damage=Math.max(0,damage-3);
  }
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
   h.kept.splice(i,1);
   const bazaar=this.keptRooms.find(x=>x.card.id==="d-bazaar"&&
    x.mode==="d20-reroll");
   if(bazaar)this.keptRooms.splice(this.keptRooms.indexOf(bazaar),1);
   return this.die(20);
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
  // The player knows both faces before deciding to reorder them.
  this.peekedRoomIds[this.room.stage]=deck.slice(0,n).map(r=>r.id);
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
     // Both the saved corridor exit and fresh draw are visible choices.
     const score=r=>(r.v2.kind==="TREASURE"?(this.strategy==="treasure"?6:2):0)+
      (r.v2.kind==="SHRINE"&&this.chooseActor().hp<this.chooseActor().card.hp-3?4:0)-
      (r.v2.kind==="LAIR"?3:0)-(r.v2.kind==="HAZARD"?2:0);
     const alternative=this.savedPath;
     this._pendingRoomSwap={drawn:room.id,saved:alternative.id,stage:room.stage};
     const legacy=score(alternative)>score(room)?"saved":"drawn";
     const chosen=this.chooseEffect("saved-corridor-exit",
      ["drawn","saved"],legacy);
     delete this._pendingRoomSwap;
     this.savedPath=null;
     if(chosen==="saved"){
      this.rooms[room.stage].push(room);room=alternative;
     }else this.rooms[room.stage].push(alternative);
    }}
   this.room=room;this.skipRoom=false;
   if(this.publicBottomRoomIds?.[room.stage])
    this.publicBottomRoomIds[room.stage]=
     this.publicBottomRoomIds[room.stage].filter(id=>id!==room.id);
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
    if(landing.damage)
     this.hurt(this.chooseRecipient("trapdoor-falling-damage"),landing.damage);
    if(this.alive()&&landing.monster&&this.room.stage!=="FINAL")this.drawMonster();
   }
  }
  endRoom(){
  for(const entry of [...this.tuckedRoomItems]){
   if(entry.roomId!==this.room?.id)continue;
   this.tuckedRoomItems.splice(this.tuckedRoomItems.indexOf(entry),1);
   const h=this.chooseRecipient("return-mimic-tuck");
   this.consumed.delete(entry.item);
   this.add(h,entry.item);
  }
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
   this.monster=m;this.monsterHP=m.hp;
   if(this.pendingMonsterOpeningDamage){
    this.monsterHP=Math.max(0,this.monsterHP-this.pendingMonsterOpeningDamage);
    this.pendingMonsterOpeningDamage=0;
   }
   this.banished=false;
   this.monsterFirstAttackPending=true;
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
  // Printed reactive powers are not available after the activating Item
  // itself defeated the Hero (e.g. a backfiring Potion).
  if(h.hp>0&&h.card.id==="witch"&&!h.used.has("witch-ability")&&
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
  case "DISCARD_OR_HURT":{
   const cost=Number(v),canPay=this.discardable(cost);
   const mode=canPay?this.chooseEffect("optional-item-payment:"+this.room?.id,
    ["discard","lose-hp"],"discard"):"lose-hp";
   if(mode==="discard")this.discard(cost);
   else this.hurt(h,args[1]==="d6"?this.die():Number(args[1]));
   return;
  }
  case "MIMIC_TUCK":{
   if(!this.discardable())return;
   const item=this.discard();
   if(!item)return;
   const i=this.discardPile.lastIndexOf(item);
   if(i>=0)this.discardPile.splice(i,1);
   this.metrics.spent=Math.max(0,this.metrics.spent-1);
   this.tuckedRoomItems.push({roomId:this.room.id,item});
   return;
  }
  case "RELIQUARY_OFFER":{
   if(!this.discardable())throw Error("An Item is required for Reliquary OFFER");
   const item=this.discard();
   const i=this.discardPile.lastIndexOf(item);
   if(i>=0)this.discardPile.splice(i,1);
   this.keptRooms.push({card:this.room,item,mode:"trap-all"});
   return;
  }
  case "REVERSE_NEXT_ROOM":this.reverseNextRoomStage=this.room.stage;return;
  case "COST_CURSED":{
   const cost=Number(v);
   if(!this.discardable(cost,"CURSED"))throw Error("Missing CURSED Item");
   this.discard(cost,{tag:"CURSED"});return;
  }
  case "KEEP_CROWN":{
   this.keptRooms.push({card:this.room,mode:v});return;
  }
  case "FORK_REVEAL":
   this.forkRevealed(Number(v),{
    random:args[1]==="RANDOM",
    treasureOnly:args[1]==="TREASURE",
    returnOnTop:args[1]==="TOP"
   });return;
  case "FORK_ORDER":this.peek(Number(v),true);return;
  case "CURE_OR_HEAL":if(h.poison)h.poison=false;else this.heal(h,n());return;
  case "HUNGRY_SWALLOW":{
   if(!this.discardable())return;
   const swallowed=this.discard(1);
   if(!swallowed||!this.alive())return;
   const mode=this.chooseEffect("hungry-door-swallowed-item",
    ["abandon","recover"],"abandon");
   if(mode==="recover"){
    this.hurt(h,2);
    if(this.alive()){
     const found=this.discardPile.lastIndexOf(swallowed);
     if(found>=0)this.discardPile.splice(found,1);
     this.consumed.delete(swallowed);this.add(this.chooseRecipient(
      "recover-swallowed-item"),swallowed);
    }
   }
   return;
  }
  case "BELL_SAVE":{
   this.keptRooms.push({card:this.room,mode:v});
   return;
  }
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
   if(card?.id==="d-shadow"){
    const candle=this.keptRooms.find(x=>x.card.id==="u-candle");
    if(candle&&this.chooseEffect("candle-cancel-lightless-hall",
      ["save","use"],"use")==="use"){
     this.keptRooms.splice(this.keptRooms.indexOf(candle),1);
     return;
    }
   }
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
  case "REROLL_ROOM":
   if(this.pendingRoomFace!=null){
    const initial=this.pendingRoomFace,newFace=this.die();
    if(v==="BEST"){
     // Ring of Echoes 5-6 prints CHOOSE either die, not automatically
     // take the mathematical maximum. Both faces have now been revealed.
     this._pendingRoomReroll={first:initial,new:newFace,
      roomId:this.room?.id??null};
     const legacy=newFace>initial?"new":"first";
     const selected=this.chooseEffect("echoes-choose-room-die",
      ["first","new"],legacy);
     delete this._pendingRoomReroll;
     this.pendingRoomFace=selected==="new"?newFace:initial;
    }else this.pendingRoomFace=newFace;
   }
   return;
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
  case "SAVE_D20_REROLL":
   h.kept.push("reroll");
   this.keptRooms.push({card:this.room,mode:"d20-reroll"});
   return;
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
    ...(this.discardable(1,"FIRE")?["discard-fire"]:[])];
   if(!modes.length)throw Error("SILENCE requires FIRE or kept Treasure That Sings");
   const mode=this.chooseEffect("choir-silence-source",modes,modes[0]);
   if(mode==="song"){
    this.keptRooms.splice(this.keptRooms.indexOf(song),1);
    this.roomRoll(6);return;
   }
   this.discard(1,{tag:"FIRE"});
   this.monsterSkip++;
   return;
  }
  case "SEAL":return;
  case "WARDEN_FIGHT":return;
  default:throw Error("Unsupported printed effect "+kind+" on "+(card?.id||this.room?.id));
  }
 }
 /** Consume exactly the next *WIT* modifier, no matter whether the
  * opposed check came from a Room, Monster negotiation or Vault.
  * An ATK/DEF roll must not silently spend a pending WIT boon.
  */
 swapOpposedRoll(ours,theirs,context){
  const mirror=this.keptRooms.find(x=>x.card.id==="d-mirror");
  if(!mirror)return {ours,theirs};
  this._observedOpposedDice={ours,theirs,context};
  const choice=this.chooseEffect("mirror-exchange-opposed:"+context,
   ["save","swap"],"save");
  delete this._observedOpposedDice;
  if(choice==="swap"){
   this.keptRooms.splice(this.keptRooms.indexOf(mirror),1);
   return {ours:theirs,theirs:ours};
  }
  return {ours,theirs};
 }
 takeWitModifiers(h){
  const result={bonus:this.witBonus||0,dis:(h.nextWitDis||0)>0};
  this.witBonus=0;h.nextWitDis=0;return result;
 }
 roomCheck(kind,dc,success,fail){
  const h=this.chooseRecipient("opposed-room-check:"+kind);this.actor=h;
  let wit=kind==="CHECK_WIT";
  const witModifiers=wit?this.takeWitModifiers(h):{bonus:0,dis:false};
  const stat=wit?h.card.wit+witModifiers.bonus:this.stats(h).atk;
  let dis=h.poison||h.nextDis>0||
   (wit&&(witModifiers.dis||h.slots.armour?.id==="mail"));
  if(wit&&h.slots.armour?.id==="mail")this.notePassive(h.slots.armour,"wit",1);
  let adv=h.nextAdv>0,blessBonus=0;
  if(wit&&this.room?.id==="d-mouth"){
   const owner=this.heroes.find(x=>x.hp>0&&
    x.inventory.some(card=>card.id==="key"));
   if(owner&&this.chooseEffect("rusty-key-talking-door",
    ["save","discard-for-adv"],"save")==="discard-for-adv"){
    const key=byId(owner.inventory,"key");
    this.directItem(owner,key,"door-confess",()=>{
     this.consume(owner,key);return true;
    });
    adv=true;
   }
  }
  h.nextDis=0;h.nextAdv=0;
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
  // A risky Priest omen may have defeated the Hero making this check.
  // Do not request more dice or Item decisions from that Hero.
  if(h.hp<=0)return;
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
  if(h.hp<=0)return;
  const wand=h.inventory.find(x=>x.id==="wand-undo"&&!this.exhausted.has(x));
  if(wand&&(this._decisionHook||d+stat+blessBonus<dc+11)&&
     (!this._decisionHook||this._decisionHook({phase:"after-roll",
      heroIndex:this.heroes.indexOf(h),cardId:wand.id}).kind==="item-trigger")){
   this.pendingD20=d;this.pendingD20Modifier=0;this.activate(h,wand);
   d=this.pendingD20+this.pendingD20Modifier;
  }
  // Wand of Undoing can misfire for the final HP during a Room check.
  // Its dead owner has no legal Crown of Rehearsals trigger.
  if(h.hp<=0)return;
  let monsterRoll=roll();
  ({ours:d,theirs:monsterRoll}=this.swapOpposedRoll(d,monsterRoll,
   "room-check"));
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
  const code=ok?success:fail;
  if(code==="NONE")return;
  if(code==="HURT1"){this.hurt(h,1);return;}
  if(code==="DRAW1_RECHARGE"){this.draw();this.recharge();}
  else if(code==="DRAW1")this.draw();
  else if(code==="DRAW2")this.draw(2);
  else if(code==="HEAL2")this.heal(h,2);
  else if(code==="HURT2")this.hurt(h,2);
  else if(code==="HURT2_DEF_DIS"){this.hurt(h,2);h.nextDefenseDis=(h.nextDefenseDis||0)+1;}
  else if(code==="HURTd6")this.hurt(h,this.die());
  else throw Error("Unknown check consequence "+code);
 }
 /**
  * Rewrite-era corridor roll: the shown cards are genuinely revealed first.
  * RANDOM draws chance only; other modes pause at a real legal choice.
  * Unchosen revealed Rooms go to the bottom, not out of the game.
  */
 /** A printed TELEGRAPH reveals the Warden's first behavior before
  * the fight. A Bell may then take one NEW result; it cannot inspect an
  * otherwise hidden future roll.
  */
 telegraphWarden({mayReroll=false}={}){
  const first=this.die();
  this.forcedBehavior=first;
  this.telegraphedWardenBehavior=first;
  if(mayReroll){
   const mode=this.chooseEffect("last-bell-telegraph",
    ["keep","reroll"],"keep");
   if(mode==="reroll"){
    this.forcedBehavior=this.die();
    this.telegraphedWardenBehavior=this.forcedBehavior;
   }
  }
  return this.forcedBehavior;
 }
 forkRevealed(count,{random=false,treasureOnly=false,returnOnTop=false}={}){
  const stage=this.room.stage,pile=this.rooms[stage];
  const offered=pile.splice(0,Math.min(count,pile.length));
  if(!offered.length)return;
  const treasures=offered.filter(x=>x.v2.kind==="TREASURE");
  const candidates=treasureOnly&&treasures.length?treasures:offered;
  let chosen;
  if(random)chosen=candidates[this.die(candidates.length)-1];
  else if(this._decisionHook&&candidates.length>1){
   this._offeredRoomChoices=[...candidates];
   const decision=this._decisionHook({
    phase:"corridor",roomId:this.room.id,
    offeredIds:candidates.map(r=>r.id)});
   chosen=candidates.find(r=>r.id===decision.roomId);
   delete this._offeredRoomChoices;
   if(!chosen)throw Error("Illegal corridor Room selection");
  }else chosen=candidates[0];
  const other=offered.filter(x=>x!==chosen);
  if(returnOnTop)pile.unshift(chosen,...other);
  else{pile.push(...other);pile.unshift(chosen);}
  // Every shown card stays in its actual physical pile exactly once;
  // unrevealed cards remain in their original sampled order.
  this.peekedRoomIds[stage]=[chosen.id,...(returnOnTop?other.map(x=>x.id):[])];
  if(!returnOnTop){
   this.publicBottomRoomIds??=Object.fromEntries(
    stageNames.map(stage=>[stage,[]]));
   this.publicBottomRoomIds[stage].push(...other.map(x=>x.id));
  }
 }
 forkRooms(mode){
   const pile=this.rooms[this.room.stage],count=mode==="u-echoes"?3:2;
   const offered=pile.splice(0,Math.min(count,pile.length));if(!offered.length)return;
   if(mode==="u-echoes"&&offered.length===3){
    // The random third echo is returned face down and remains unknown.
    pile.push(offered.splice(this.die(3)-1,1)[0]);
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
   if(mode==="u-mossy"||mode==="u-candle")pile.unshift(...other);
   else if(mode==="d-whisper-junction")this.whisperRoom=other[0]||null;
   else if(mode==="d-gilded"){
    // Only GAMBLE actually discards the other Room.
    if(other.some(x=>x.v2.kind==="TREASURE"))this.draw();
    for(const card of other)this.discardedRoomIds.add(card.id);
   }else{
    // Printed corridors return the unchosen revealed route to the bottom.
    pile.push(...other);
    this.publicBottomRoomIds??=Object.fromEntries(
     stageNames.map(stage=>[stage,[]]));
    this.publicBottomRoomIds[this.room.stage].push(...other.map(card=>card.id));
   }
   if(mode==="m-ladder")this.nextLadder=true;
   const shown=new Set(offered.map(card=>card.id));
   const remainder=(this.peekedRoomIds[this.room.stage]||[])
    .filter(id=>!shown.has(id)&&!this.discardedRoomIds.has(id));
   this.peekedRoomIds[this.room.stage]=[
    chosen.id,...(["u-mossy","u-candle"].includes(mode)?
     other.map(card=>card.id):[]),...remainder
   ];
   pile.unshift(chosen);
  }
  resolveKeptRoll(card){
   const band=ranges(card,this.die());
   for(const op of card.v2.special.rollOps[band]){const [kind,...args]=op.split(":");this.apply(kind,args,card);}
  }
  roomRoll(forced=null){
  if(!this.room)throw Error("Room roll without Room");
  // A defeated party cannot resolve further Room rolls or revive from
  // downstream healing effects in the same printed action.
  if(!this.alive())return false;
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
  if(this.reverseNextRoomStage===this.room.stage&&this.room.id!=="d-mirror"){
   this.reverseNextRoomStage=null;
   face=7-face;
  }
   if(this.room.id==="vault"&&this.vaultModifiers.omen!=="normal"){
    const second=this.die();face=this.vaultModifiers.omen==="high"?Math.max(face,second):Math.min(face,second);
   }
   if(this.room.id==="vault"&&this.vaultModifiers.omenAdjust){
    const modes=[...(face>1?["down"]:[]),"keep",...(face<6?["up"]:[])];
    this._observedRoomRollFace=face;
    const mode=this.chooseEffect("witness-omen-adjust",modes,"keep");
    delete this._observedRoomRollFace;
    face+=mode==="up"?1:mode==="down"?-1:0;
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
  // A physical Rope can shift a hazard die by exactly one. No Room can
  // claim the 5-6 treasure band merely because Rope is carried.
  const ropeOwner=["u-fall","m-bridge","d-bridge"].includes(this.room.id)?
   this.heroes.find(h=>h.hp>0&&h.inventory.some(c=>c.id==="rope"&&!h.used.has(c))):null;
  if(ropeOwner){
   const options=["save",...(face>1?["down"]:[]),...(face<6?["up"]:[])];
   const direction=this.chooseEffect("rope-room-roll:"+this.room.id,
    options,face<6?"up":"down");
   if(direction==="up"||direction==="down"){
    const rope=ropeOwner.inventory.find(c=>c.id==="rope"&&!ropeOwner.used.has(c));
    this.directItem(ropeOwner,rope,"rope-room-shift",()=>{
     ropeOwner.used.add(rope);
     face=Math.max(1,Math.min(6,face+(direction==="up"?1:-1)));
     return true;
    });
   }
  }
  if(this.room.id==="u-nest"&&
     this.heroes.some(h=>h.hp>0&&this.equipped(h,"dog")))face=6;
  if(this.room.id==="u-nest"&&this.ratFavor){face=6;this.ratFavor=false;}
  if(this.room.id==="m-beetle"&&this.discardable(1,"METAL")&&
   this.chooseEffect("beetle-metal",["save","pay"],
    this.strategy==="treasure"?"pay":"save")==="pay"){
   this.discard(1,{tag:"METAL"});face=6;
  }
  // Rusty Key has two distinct printed lock effects. It cannot turn
  // every lock into a 5-6, and Talking Door is an opposed WIT check.
  const keyEligible=this.room.id==="m-vault"||
   ["u-gate","u-mimic","d-last-chest"].includes(this.room.id)&&face<=2;
  const keyOwner=this.heroes.find(h=>h.hp>0&&h.inventory.some(
   c=>c.id==="key"));
  if(keyEligible&&keyOwner&&this.chooseEffect(
   "rusty-key:"+this.room.id,["save","spend"],"spend")==="spend"){
   const key=byId(keyOwner.inventory,"key");
   this.directItem(keyOwner,key,"room-option",()=>{
    this.consume(keyOwner,key);return true;
   });
   face=this.room.id==="m-vault"?6:3;
  }
  // A Lamp-Eater consumes exposed FIRE; carrying light never guarantees treasure.
  // Opened Crypt no longer treats fire as automatic treasure.

  // FIRE removes Lightless Hall combat disadvantage; it does not guarantee treasure.
  if(this.anyEquippedTag("ICE")&&this.room.id==="d-shadow")face=4;
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
  const hourglass=this.keptRooms.find(x=>x.card.id==="m-hourglass"&&x.choice===1);
  if(hourglass){
   this._observedRoomRollFace=face;
   const reverse=this.chooseEffect("hourglass-reverse-room-die",
    ["save","reverse"],"save")==="reverse";
   delete this._observedRoomRollFace;
   if(reverse){
    this.keptRooms.splice(this.keptRooms.indexOf(hourglass),1);
    face=7-face;
   }
  }
  // Gallery of Cracked Maps allows one revealed trapdoor die shift. Its
  // kept map is consumed only if the player takes the adjustment.
  const map=this.keptRooms.find(x=>x.card.id==="m-maps");
  if(map&&["u-fall","m-ladder","d-bridge"].includes(this.room.id)){
   const directions=["save",...(face>1?["down"]:[]),...(face<6?["up"]:[])];
   this._observedRoomRollFace=face;
   const move=this.chooseEffect("maps-adjust-trapdoor:"+this.room.id,
    directions,"save");
   delete this._observedRoomRollFace;
   if(move!=="save"){
    this.keptRooms.splice(this.keptRooms.indexOf(map),1);
    face+=move==="up"?1:-1;
   }
  }
  // Spend saved links only when their linked encounters occur.
  if(this.room.id==="d-bridge"&&face<=2){
   const wax=this.keptRooms.find(x=>x.card.id==="m-wax-bridge");
   if(wax){
    const decision=this._decisionHook?.({phase:"retained",
     roomId:"m-wax-bridge",context:"trap",face});
    if((decision?.mode||this.returnChoices?.["m-wax-bridge"])!=="save"){
     // Wax Bridge substitutes the safe 3-4 result, never a 5-6 reward.
     this.keptRooms.splice(this.keptRooms.indexOf(wax),1);face=3;
    }
   }
  }
  if(this.room.id==="d-mouth"){
   const judge=this.keptRooms.find(x=>x.card.id==="u-puppet");
   if(judge&&!judge.spent){
    const decision=this._decisionHook?.({phase:"retained",
     roomId:"u-puppet",context:"talking-door",face});
    if((decision?.mode||this.returnChoices?.["u-puppet"])!=="save"){
     judge.spent=true;face=6;
    }
   }
  }
  const band=ranges(this.room,face),ops=ROOM_EFFECTS[this.room.id].outcomes[band];
  const roomKey=this.room.id+":"+band;
  this.metrics.roomRollBands[roomKey]=(this.metrics.roomRollBands[roomKey]||0)+1;
  // A kept Reliquary can ignore one printed trap, then must be discarded.
  const traps={"u-gate":[0],"u-fall":[0,1],"u-mimic":[0],"m-vault":[0],
   "m-bridge":[0],"d-bridge":[0,1],"d-last-chest":[0],"d-shadow":[0],
   "d-reliquary":[0]};
  const damagingTrap=traps[this.room.id]?.includes(band)&&
   ops.some(op=>op.startsWith("HURT:")||op.startsWith("TRAPDOOR:"));
  if(damagingTrap){
   const relic=this.keptRooms.find(x=>x.card.id==="d-reliquary");
   if(relic&&this.chooseEffect("reliquary-prevent-trap:"+this.room.id,
    ["save","use"],"use")==="use"){
    this.keptRooms.splice(this.keptRooms.indexOf(relic),1);
    if(relic.item)this.discardPile.push(relic.item);
    this._trapPrevention=relic.mode==="trap-all"?Infinity:3;
   }
   if(this.trapGuard){
    this.trapGuard=false;
    this._trapPrevention=Math.max(this._trapPrevention||0,3);
   }
  }
  this.metrics.cardCounts[this.room.id]=(this.metrics.cardCounts[this.room.id]||0)+1;
  this._trapDamageContext=!!damagingTrap;
  try{
   for(const op of ops){
    if(!this.alive())break;
    const [name,...args]=op.split(":");this.apply(name,args,this.room);
   }
  }finally{
   this._trapDamageContext=false;this._trapPrevention=0;
  }
 }
}
export function validateStateEffects(){
 const s=new ExpeditionState({seed:8123,heroes:["warrior","wizard"]});
 return {deckSize:s.deck.length,heroes:s.heroes.length,roomPiles:Object.values(s.rooms).map(a=>a.length)};
}
