/**
 * Research-only bounded utility planner.
 * Evaluates public card text/typed effects, not hidden deck order or future dice.
 * No mutation, PRNG use, or simulation side effects. Utilities are estimates,
 * not game rules or proofs of optimal play.
 */
import {ROOM_EFFECTS} from "./room-effect-model.js";
import {ROLL_EFFECTS,bandFor} from "./effect-model.js";
import {MONSTERS,WARDEN,WARDEN_FURY} from "./tabletop-data.js";
import {itemOptions} from "./item-access.js";

export const PLANNER_RISKS=Object.freeze(["balanced","cautious","bold"]);
const PROFILE=Object.freeze({
 balanced:{damage:1.5,death:15,resource:2.6,draw:3.7,spell:3.5,parley:0},
 cautious:{damage:2.25,death:24,resource:3.1,draw:3.3,spell:5,parley:0.5},
 bold:{damage:0.95,death:9,resource:2,draw:4.8,spell:2.0,parley:-0.5}
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function plannerWeights(risk="balanced"){
 if(!PLANNER_RISKS.includes(risk))throw Error("Unknown planner risk "+risk);
 return PROFILE[risk];
}
export function estimatedDice(expr){
 if(typeof expr!=="string")return Number(expr)||0;
 const m=/^(?:(\d+))?d6(?:\+(\d+))?$/.exec(expr);
 return m?Number(m[1]||1)*3.5+Number(m[2]||0):Number(expr)||0;
}
const willHit=(die,bonus,targetDie,def)=>die===20||(die!==1&&die+bonus>targetDie+def);
const cache=new Map();
export function hitProbability(atk,def,{adv=false,dis=false}={}){
 const key=[atk,def,adv,dis].join(":");
 if(cache.has(key))return cache.get(key);
 let wins=0,total=0;
 const faces=(adv&&!dis)||(dis&&!adv)?20:1;
 for(let first=1;first<=20;first++)for(let second=1;second<=faces;second++)
  for(let defence=1;defence<=20;defence++){
   const attack=adv&&!dis?Math.max(first,second):
    dis&&!adv?Math.min(first,second):first;
   wins+=Number(willHit(attack,atk,defence,def));total++;
  }
 const probability=wins/total;cache.set(key,probability);return probability;
}
export function partySummary(s){
 const heroes=s.living(),max=heroes.reduce((n,h)=>n+h.card.hp,0);
 const hp=heroes.reduce((n,h)=>n+h.hp,0);
 const cards=s.heroes.flatMap(h=>h.inventory);
 const reserve=s.heroes.length===2?6:3;
 const magic=cards.filter(c=>c.v2.tags.includes("MAGIC")).length;
 return {heroes,hp,max,hpFraction:max?hp/max:0,missing:max-hp,
  maxWit:Math.max(0,...heroes.map(h=>h.card.wit)),
  cards:cards.length,magic,sealCost:reserve,
  magicReserve:Math.max(0,reserve-magic),
  resourceValue:2.1+Number(magic<=reserve)*1.1+Number(s.metrics.cleared>=6)*0.6,
  roomsLeft:Math.max(0,9-s.metrics.cleared)};
}
export function forecastCombat(s,m=s.monster){
 if(!m)return {heroDamage:0,monsterDamage:0,turns:0,expectedLoss:0,lethalRisk:0};
 const living=s.living(),count=living.length;
 if(!count)return {heroDamage:0,monsterDamage:0,turns:100,expectedLoss:100,lethalRisk:1};
 // Attack forecast follows the actual scripted Hero attack dispatcher,
 // including automatic Wizard/Warrior/weapon effects and the phase-I threshold.
 const heroDamage=living.reduce((n,h)=>n+expectedAttack(s,h,m).damage,0);
 const remaining=remainingMonsterHP(s,m);
 const turns=clamp(remaining/Math.max(0.5,heroDamage),0.3,18);
 const target=living.reduce((a,h)=>a+h.hp,0)/count;
 const atk=m.atk;
 const monsterAttackProb=living.reduce((v,h)=>v+
  hitProbability(atk,s.stats(h).def),0)/count;
 // Printed Monster behavior faces: 1-2 twice, 3-4 twice, 5 once, 6 once.
 const hitOdds=m.behavior?(m.behavior.reduce((v,text,i)=>v+
  (text.includes("ATTACK")?([2,2,1,1][i]||0):0),0)/6):0.6;
 const specialOdds=m.behavior?.some(x=>/POISON|lose 2 HP|discard/.test(x))?0.35:0.1;
 const expectedMonsterPerHeroTurn=monsterAttackProb*hitOdds*3.5+specialOdds;
 const expectedLoss=expectedMonsterPerHeroTurn*turns*count;
 const lethalRisk=clamp((expectedLoss/(Math.max(1,target*count)*1.15))**1.5,0,1);
 return {heroDamage,monsterDamage:expectedMonsterPerHeroTurn,
  turns,expectedLoss,lethalRisk};
}
const monsterRisk=(s,stage)=>{
 const candidates=MONSTERS.filter(m=>m.stage===stage);
 if(!candidates.length)return 0;
 return candidates.reduce((sum,m)=>{
  const f=forecastCombat(s,m);
  return sum+f.expectedLoss+f.lethalRisk*8;
 },0)/candidates.length;
};
function textScore(s,ops,weights,party,stage,{outcome=false}={}){
 let utility=0,spend=0,draw=0,healing=0,harm=0,extraFights=0,conditionalFightReward=0;
 for(const raw of ops){
  const [kind,...args]=raw.split(":"),amount=estimatedDice(args[0]);
  switch(kind){
   case "COST":case "DISCARD":spend+=amount;break;
   case "DRAW":draw+=amount;break;
   case "TRADE":spend+=amount;draw+=estimatedDice(args[1]);break;
   case "HEAL":healing+=amount;break;
   case "HEAL_ALL":healing+=amount*party.heroes.length;break;
   case "HURT":harm+=amount;break;
   case "POISON":utility-=party.hpFraction<.6?5:3;break;
   case "CURE":utility+=party.heroes.some(h=>h.poison)?4:0.3;break;
   case "PEEK":case "PEEK_SWAP":utility+=stage==="DEEP"?0.55:0.8;break;
   case "RECHARGE":utility+=s.exhaustedWand()?weights.spell+1:0;break;
   case "CURSED_RECHARGE":utility+=s.exhaustedWand()?2:0;break;
   case "FIGHT_REWARD":conditionalFightReward+=amount;break;
   case "FIGHT_HEAL":healing+=amount*(s.monster?0.75:0.55);break;
   case "MONSTER_DRAW":extraFights++;break;
   case "BANISH":case "FUNGUS_BURN":case "CHOIR_SILENCE":utility+=s.monster?6:3;break;
   case "NEXT_WIT":utility+=Math.min(4,amount);break;
   case "NEXT_ADV":case "DEF_ADV":utility+=1.7;break;
   case "MONSTER_ADV":utility-=2;break;
   case "NEXT_DIS":utility-=2.5;break;
   case "CHECK_WIT":case "CHECK_ATK": {
    const actor=s.chooseActor();
    const stat=kind==="CHECK_WIT"?actor.card.wit+(s.witBonus||0):s.stats(actor).atk;
    const chance=exactWitChance(stat,Number(args[0]));
    const scoreResult=code=>{
     if(code==="DRAW1_RECHARGE")return weights.draw+(s.exhaustedWand()?weights.spell:0);
     if(code==="DRAW1")return weights.draw;
     if(code==="DRAW2")return 2*weights.draw;
     if(code==="HEAL2")return Math.min(party.missing,2)*weights.damage;
     if(code==="HURT2")return -Math.min(party.hp,2)*weights.damage;
     if(code==="HURTd6")return -Math.min(party.hp,3.5)*weights.damage;
     throw Error("Unmodelled printed check consequence "+code);
    };
    utility+=chance*scoreResult(args[1])+(1-chance)*scoreResult(args[2]);
    break;
   }
   case "ALCHEMY_HEAL_OR_TWO":healing+=2.2;break;
   case "MAGIC_HEAL":healing+=1.2;break;
   case "SUPPLY_BARTER":utility+=party.cards>2?2:0;break;
   case "ROLL_ROOM_COST_REROLL":utility+=0.7;break;
   case "BOOKCASE_FIRE_OR_SCROLL":utility+=s.has("torch")||s.anyEquippedTag("FIRE")?weights.draw:
    party.cards&&s.heroes.some(h=>h.inventory.some(c=>c.v2.kind==="SCROLL"))?0.9:-2;break;
   case "FUNGUS_BURN":healing+=s.has("torch")||s.anyEquippedTag("FIRE")?3.5:0;break;
   case "CHOIR_SILENCE":draw+=s.has("torch")||s.anyEquippedTag("FIRE")?2:0;break;
   case "PUPPET_BRIBE":utility+=s.anyEquippedTag("CURSED")?
    weights.draw*1.2-3.5*weights.damage:party.cards>0?0.8:0;break;
   case "CLEANSE":utility+=s.anyEquippedTag("CURSED")?3:0;break;
   case "CLEANSE_COST":
    utility+=s.anyEquippedTag("CURSED")?1:0;
    spend+=s.anyEquippedTag("CURSED")?1:0;break;
   case "CURSED_EXTRA_DRAW":draw+=s.anyEquippedTag("CURSED")?1:0;break;
   case "SAVE_TRAP":utility+=1.5;break;
   case "SAVE_ATTACK_ADV":utility+=2;break;
   case "SAVE_D20_REROLL":utility+=2.2;break;
   case "SAVE_DEF":utility+=1.7;break;
   case "NONE":case "ROLL_ROOM":case "ROLL_ROOM_RISK":
   case "ROLL_ROOM_RISK_D6":case "ROLL_ROOM_COST_REROLL":
   case "KEEP_ROOM_ROLL":case "SEAL":case "WARDEN_FIGHT":break;
   case "FIGHT":break; // already present Monster, not a second encounter
  }
 }
 utility+=draw*weights.draw;
 utility-=spend*party.resourceValue*weights.resource/2.6;
 utility+=Math.min(party.missing,healing)*weights.damage;
 utility-=Math.min(party.hp,harm)*weights.damage;
 if(harm>=party.hp)utility-=weights.death;
 if(extraFights){
  const risk=monsterRisk(s,stage)*extraFights;
  utility-=risk*weights.damage+weights.death*clamp(risk/(party.hp+1),0,1);
 }
 if(conditionalFightReward)
  utility+=conditionalFightReward*weights.draw*(s.monster?0.75:0.55);
 return utility;
}
// Some printed Room/Item interactions fix the die result. Treating these
// as an ordinary uniform d6 would mis-rank the Room's two options.
export function fixedRoomFace(s,room){
 const id=room.id;
 if(s.has("rope")&&["u-fall","m-flood","m-bridge","d-bridge"].includes(id))return 6;
 if(s.has("dog")&&["u-nest","m-beetle"].includes(id))return 6;
 if(s.has("raven")&&id==="d-oracle")return 6;
 if(s.has("key")&&s.strategy!=="seal"&&
  ["u-gate","u-mimic","m-vault","d-mouth","d-last-chest"].includes(id))return 6;
 if((s.has("torch")||s.has("lantern-heart")||s.anyEquippedTag("FIRE"))&&
  ["u-lamp","m-crypt"].includes(id))return 6;
 if(s.anyEquippedTag("FIRE")&&id==="d-shadow")return 6;
 if(s.anyEquippedTag("ICE")&&id==="d-shadow")return 4;
 if(s.heroes.some(h=>s.equipped(h,"ring-eye"))&&id==="d-oracle")return 6;
 if(s.heroes.some(h=>s.equipped(h,"ring-spores"))&&id==="m-fungus")return 6;
 if(s.heroes.some(h=>s.equipped(h,"ring-hunger"))&&id==="d-crown")return 5;
 if(id==="m-statue"&&s.lastSpent?.v2?.tags?.includes("MAGIC"))return 6;
 if(id==="m-auction"&&s.lastSpent?.v2?.tags?.includes("MAGIC"))return 6;
 if(id==="m-well"&&s.lastSpent?.v2?.tags?.includes("CURSED"))return 6;
 return null;
}
export function planRoom(s,legal){
 const w=plannerWeights(s.plannerRisk),party=partySummary(s);
 const room=s.room,raw=ROOM_EFFECTS[room.id];
 const score=idx=>{
  const ops=raw.choices[idx];
  let initial=textScore(s,ops.filter(o=>!o.startsWith("ROLL_ROOM")),w,party,room.stage);
  const roll=ops.find(o=>o.startsWith("ROLL_ROOM"));
  if(!roll)return initial;
  const risk=roll==="ROLL_ROOM_RISK"?2:roll==="ROLL_ROOM_RISK_D6"?3.5:0;
  const eligibleRisk=s.strategy!=="survival"&&s.chooseActor().hp>s.chooseActor().card.hp*.4;
  const reroll=eligibleRisk&&(risk>0||
   roll==="ROLL_ROOM_COST_REROLL"&&s.discardable());
  if(reroll)initial-=risk*w.damage+
   Number(roll==="ROLL_ROOM_COST_REROLL")*party.resourceValue*weightsFactor(w);
  const fixed=fixedRoomFace(s,room);
  // Even when an Item fixes the final face, voluntary reroll costs are paid
  // before the override by the executable roomRoll dispatcher.
  if(fixed===6&&s.has("key")&&s.strategy!=="seal"&&
   ["u-gate","u-mimic","m-vault","d-mouth","d-last-chest"].includes(room.id))
   initial-=party.resourceValue*weightsFactor(w);
  let result=0;
  for(let face=1;face<=6;face++){
   if(fixed!==null&&face!==fixed)continue;
   const band=bandFor(room,face),out=raw.outcomes[band];
   const likelihood=fixed!==null?1:reroll?(2*face-1)/36:1/6;
   result+=textScore(s,out,w,party,room.stage,{outcome:true})*likelihood;
  }
  return initial+result;
 };
 const scores=[legal[0]?score(0):-Infinity,legal[1]?score(1):-Infinity];
 const choice=scores[1]>scores[0]?1:0;
 return {choice,scores,reason:"expected_room_value",margin:Math.abs(scores[0]-scores[1])};
}
const exactWitChance=(wit,difficulty)=>{
 let wins=0;
 for(let a=1;a<=20;a++)for(let d=1;d<=20;d++)
  wins+=Number(a===20||a!==1&&a+wit>d+difficulty);
 return wins/400;
};
export function planParley(s,m){
 const party=partySummary(s),w=plannerWeights(s.plannerRisk),battle=forecastCombat(s,m);
 const cost=party.resourceValue*weightsFactor(w);
 let chance=1,costValue=0,bonus=0,feasible=true;
 switch(m.id){
  case "rat":case "eye":costValue=cost;feasible=s.discardable(1);break;
  case "goblin":case "troll":costValue=cost*2;feasible=s.discardable(2);
   if(m.id==="goblin")bonus=2;break;
  case "bat":chance=exactWitChance(party.maxWit,3);break;
  case "wisp":chance=exactWitChance(party.maxWit,5);bonus=0.6;break;
  case "crawler":case "mold":
   feasible=s.heroes.some(h=>h.inventory.some(c=>c.v2.kind==="POTION"));
   costValue=cost*1.4;break;
  case "wraith":case "cultist":
   feasible=s.anyEquippedTag("CURSED");costValue=w.damage*3.5;
   if(m.id==="cultist")bonus=2;break;
  case "rust":
   feasible=s.discardable(1,"METAL");costValue=cost*1.3;bonus=2;break;
  case "sentinel":feasible=s.discardable(2,"METAL");costValue=cost*2.7;break;
  default:return {attempt:false,reason:"unknown_monster",value:-Infinity};
 }
 const fightPenalty=battle.expectedLoss*w.damage+battle.lethalRisk*w.death;
 const parleyValue=chance*(fightPenalty+bonus-costValue)-
  (1-chance)*(costValue+2);
 const attempt=feasible&&parleyValue>w.parley;
 return {attempt,reason:!feasible?"cannot_pay":"expected_parley_value",
  score:parleyValue,chance,combatRisk:fightPenalty,cost:costValue};
}
function weightsFactor(w){return w.resource/2.6;}
/** Only printed ACTION cards are candidates for spending a combat turn.
 * Reactive d20 Wands, lock-only magic, scouting and encounter-only trades
 * have other timings and may never be played as a generic combat action.
 */
export const COMBAT_ACTION_IDS=Object.freeze([
 "scroll-flame","scroll-frost","scroll-lightning","scroll-banish",
 "scroll-mischief","scroll-last","wand-sparks","wand-morph",
 "wand-turn","wand-frost","spore-jar"
]);
const COMBAT_ACTIONS=new Set(COMBAT_ACTION_IDS);
function effectScore(ops,party,monster){
 let damage=0,healing=0,skips=0,curse=0,draw=0,banish=0,resources=0;
 for(const raw of ops){
  const [kind,arg]=raw.split(":");
  const val=estimatedDice(arg);
  switch(kind){
   case "DAMAGE":damage+=val;break;
   case "NEXT_DAMAGE":damage+=val*.35;break;
   case "SKIP":skips+=val;break;
   case "MONSTER_DIS":skips+=.35;break;
   case "BANISH_OR_SKIP":
    if(monster.stage==="FINAL")skips+=val;else banish=1;
    break;
   case "HEAL":healing+=Math.min(party.missing,val);break;
   case "HURT":curse+=val;break;
   case "DRAW":draw+=val;break;
   case "DISCARD":resources+=val;break;
   case "TRADE":resources+=val;draw+=estimatedDice(raw.split(":")[2]);break;
   case "FORCE_BEHAVIOR":if(Number(arg)===6)skips-=.7;break;
   case "MONSTER_DRAW_OR_FORCE":skips-=.7;break;
   case "REWRITE_BEHAVIOR":skips+=.12;break;
   case "NEXT_ADV":damage+=.5;break;
   case "BREAK_WAND":resources+=1;break;
  }
 }
 return {damage,healing,skips,curse,draw,banish,resources};
}
function criticalProbability({adv=false,dis=false}={}){
 if(adv&&!dis)return 39/400;
 if(dis&&!adv)return 1/400;
 return 1/20;
}
export function remainingMonsterHP(s,m=s.monster){
 if(!m)return 0;
 const current=m===s.monster?s.monsterHP:m.hp;
 // Warden Phase I ends at 10 HP; all excess damage in that action is wasted.
 return Math.max(0,current-(m.id==="warden"?10:0));
}
export function expectedAttack(s,h,m=s.monster){
 if(!m)return {damage:0,killChance:0,hitChance:0,backfire:0,skipChance:0};
 const remaining=remainingMonsterHP(s,m);
 if(!remaining)return {damage:0,killChance:1,hitChance:1,backfire:0,skipChance:0};
 // The printed Wild Spark replaces Wizard's ordinary attack the first time,
 // not a bonus to a normal opposed roll.
 if(h.card.id==="wizard"&&!h.used.has("hero")&&
   (s.strategy==="magic"||(m===s.monster?s.monsterHP:m.hp)>=8)){
  let total=0,kill=0;
  for(let roll=1;roll<=6;roll++){
   const medium=roll+2;
   total+=Math.min(remaining,medium)/18;
   kill+=Number(medium>=remaining)/18;
   for(let other=1;other<=6;other++){
    const high=roll+other;
    total+=Math.min(remaining,high)/108;
    kill+=Number(high>=remaining)/108;
   }
  }
  return {damage:total,killChance:kill,hitChance:2/3,
   backfire:3.5/3,skipChance:1/3};
 }
 const modifiers={dis:h.poison||h.nextDis>0,adv:h.nextAdv>0};
 const hitChance=hitProbability(s.stats(h).atk+(h.recruitedGoblin?1:0)+(h.nextAtk||0),
  m.def,modifiers);
 const critChance=criticalProbability(modifiers);
 const ordinaryChance=Math.max(0,hitChance-critChance);
 // Automatic once-per-Room attack riders each resolve after the attack hits.
 const riders=[
  h.card.id==="warrior"&&!h.used.has("hero"),
  h.slots.weapon?.id==="sword"&&!h.used.has(h.slots.weapon),
  h.slots.companion?.id==="dog"&&!h.used.has(h.slots.companion),
  h.slots.ring?.id==="ring-ashes"&&!h.used.has(h.slots.ring)
 ].filter(Boolean).length;
 const riderDamage=riders*(2+3.5)/3;
 const bonus=(h.nextDamage||0)+s.basicAttackBonus(h)+riderDamage;
 let ordinary=0,lethalNormal=0,critical=0,lethalCritical=0;
 for(let die=1;die<=6;die++){
  const amount=bonus+die;
  ordinary+=Math.min(remaining,Math.max(0,amount))/6;
  lethalNormal+=Number(amount>=remaining)/6;
  for(let extra=1;extra<=6;extra++){
   const critAmount=amount+extra;
   critical+=Math.min(remaining,Math.max(0,critAmount))/36;
   lethalCritical+=Number(critAmount>=remaining)/36;
  }
 }
 const backfire=hitChance*(Number(h.slots.weapon?.id==="cursed-blade")+
  (h.card.id==="warrior"&&!h.used.has("hero")?2/3:0)+
  (h.slots.weapon?.id==="sword"&&!h.used.has(h.slots.weapon)?1/3:0))+
  (h.slots.ring?.id==="ring-ashes"&&!h.used.has(h.slots.ring)?2/3:0);
 return {damage:ordinaryChance*ordinary+critChance*critical,
  killChance:ordinaryChance*lethalNormal+critChance*lethalCritical,hitChance,
  backfire,skipChance:0};
}
/** Public-knowledge reservation value; never inspect hidden deck order.
 * Consumables are reserved for credible future opportunities, not an
 * arbitrary constant. Strategy, stage, current resources, and risk all matter.
 */
export function futureItemValue(s,h,card,mode="action",risk=s.plannerRisk){
 const w=plannerWeights(risk),party=partySummary(s);
 const rooms=party.roomsLeft;
 const current=s.monster?.stage==="FINAL";
 if(mode==="overcharge")return current?0.5:1.2;
 if(["torch-skip","lantern-skip","lantern-recharge"].includes(mode))
  return current?0.1:Math.min(2,rooms*.12);
 if(mode==="recover"||mode==="drink"){
  const missing=Math.max(0,h.card.hp-h.hp);
  return missing>h.card.hp*.4?0:0.4+rooms*.11;
 }
 if(card.v2.kind==="WAND"){
  // Future shrines can straighten sideways Wands, but their availability
  // is uncertain; their permanent ownership is not spent on normal use.
  return current?0:Math.min(1.7,.2+rooms*.14);
 }
 if(card.id==="spore-jar")return current?0.15:.15+rooms*.09;
 if(card.v2.kind!=="SCROLL")return 0;
 const duplicates=h.inventory.filter(c=>c.id===card.id).length;
 const otherMagic=party.magic-1;
 // A solo party needs three MAGIC cards; duo needs six. Approximate future
 // collection from publicly known Room count, not actual shuffled deck.
 const expectedAcquisitions=rooms*.45;
 const plausibleSeal=!current&&
  otherMagic+expectedAcquisitions>=party.sealCost-1.25;
 const sealPremium=plausibleSeal&&otherMagic<party.sealCost?
  (s.strategy==="magic"?1.15:.65)*Math.min(1.8,(rooms+1)/4):0;
 const laterFights=current?Number(s.monster?.id==="warden"):Math.min(4,rooms*.65+1);
 const futureOption=Math.min(2.7,laterFights*.33)*
  (card.id==="scroll-last"||card.id==="scroll-lightning"?1.1:.85);
 return (futureOption+sealPremium)*(duplicates>1?.55:1)*
  (w.damage/2.25)**.25;
}
/** Printed behavior is not merely immediate damage: rewriting face 6,
 * poisoning, and skipped responses can change multiple upcoming turns.
 * These are estimated tactical values, not additional rules.
 */
export function responseThreat(s,h,m=s.monster){
 if(!m)return 0;
 const w=plannerWeights(s.plannerRisk);
 const rate=hitProbability(m.atk,s.stats(h).def);
 const dangerousSix=["rat","goblin","bat","wisp","eye","mold","wraith",
  "rust","cultist","sentinel","warden","warden-fury"].includes(m.id);
 const multi=m.id==="warden-fury"||m.id==="warden";
 const direct=["wisp","mold"].includes(m.id)?0.35:0;
 const perResponse=rate*3.5*(multi?1.2:1)+direct+
  (["wraith","rust","goblin","cultist"].includes(m.id)?.5:0);
 const risk=h.hp<7?1.5:1;
 return {perResponse:perResponse*w.damage*risk,faceSix:dangerousSix?1:0.2};
}
function projectedEffect(s,h,option,remaining,threat,attack){
 const {card,mode}=option,party=partySummary(s),w=plannerWeights(s.plannerRisk);
 const response=threat.perResponse;
 if(mode==="torch-skip"||mode==="lantern-skip")return response;
 if(mode==="lantern-recharge")return s.exhaustedWand()?1.8:0;
 let faces=[1,2,3,4,5,6],excess=0;
 if(mode==="overcharge"){
  faces=[6];excess=3.5;
 }
 if(card.v2.kind==="POTION"&&s.potionIdentities.has(card.id))
  faces=[s.potionIdentities.get(card.id)];
 let score=0;
 for(const face of faces){
  const ops=ROLL_EFFECTS[card.id]?.[bandFor(card,face)]||[];
  const effect=effectScore(ops,party,s.monster);
  // Magic/elemental synergies printed on both Items and Monsters.
  if(ops.some(op=>op==="ELEMENT:LIGHTNING")&&s.monster.id==="sentinel"&&
    effect.damage>0)effect.damage+=3.5;
  if(ops.some(op=>/ELEMENT:(FIRE|LIGHTNING)/.test(op))&&
    s.monster.id==="warden-fury"&&effect.damage>0)effect.skips+=1;
  if(ops.some(op=>op==="REWRITE_BEHAVIOR:6:1")&&threat.faceSix)
   effect.skips+=Math.min(1.3,remaining/Math.max(2,attack.damage))*.32;
  if(ops.some(op=>op==="MONSTER_DIS"))
   effect.skips+=.17;
  if(ops.some(op=>op==="FORCE_BEHAVIOR:6"))
   effect.skips-=threat.faceSix*.45;
  const status=ops.some(op=>op==="POISON")&&!h.immune&&!h.poison?
   2.25*(s.room?.stage==="FINAL"?1.3:1):0;
  const delayed=ops.some(op=>op.startsWith("NEXT_ADV")||
    op.startsWith("NEXT_ATK"))?Math.min(1,remaining/4)*1.3:0;
  const cure=ops.some(op=>op==="CURE")&&h.poison?3:0;
  const heal=Math.min(h.card.hp-h.hp,effect.healing);
  const harm=Math.min(h.hp,effect.curse+excess);
  const killed=effect.banish>0||effect.damage>=remaining;
  const skip=Math.min(2,Math.max(0,effect.skips));
  // Avoid counting a skip after lethal damage; permit one future response
  // if the Monster survives and an additional skip is likely relevant.
  const turnsRemaining=Math.max(0,(remaining-effect.damage)/
   Math.max(1,attack.damage));
  const prevented=killed?1:Math.min(skip,Math.max(1,turnsRemaining));
  let value=Math.min(remaining,effect.damage)*w.damage+
   prevented*response+heal*w.damage+effect.draw*w.draw+
   delayed+Number(cure)*w.damage-
   (harm+status)*w.damage-
   effect.resources*party.resourceValue*weightsFactor(w);
  if(harm>=h.hp)value-=w.death;
  score+=value/faces.length;
 }
 return score;
}
export function legalCombatActions(s,h){
 return itemOptions(s,h,"combat").filter(o=>o.mode==="action").map(o=>o.card);
}
export function planCombat(s,h,{trial="normal"}={}){
 if(!["normal","free","force"].includes(trial))throw Error("Unknown Item trial "+trial);
 const w=plannerWeights(s.plannerRisk),m=s.monster;
 if(!m)return {action:"attack",score:0,options:0,legal:[]};
 const remaining=Math.max(1,remainingMonsterHP(s,m));
 const attack=expectedAttack(s,h,m),threat=responseThreat(s,h,m);
 const attackScore=attack.damage*w.damage+
  (attack.killChance+(1-attack.killChance)*attack.skipChance)*threat.perResponse-
  attack.backfire*w.damage;
 const eligible=itemOptions(s,h,"combat");
 let winner=null;
 for(const option of eligible){
  const immediate=projectedEffect(s,h,option,remaining,threat,attack);
  const reserved=trial==="free"?0:futureItemValue(s,h,option.card,option.mode);
  const utility=immediate-reserved;
  if(!winner||utility>winner.score)
   winner={action:"item",card:option.card,mode:option.mode,
    score:utility,immediate,reserved};
 }
 if(winner&&(trial==="force"||winner.score>attackScore+0.1))
  return {...winner,attackScore,options:eligible.length,legal:eligible};
 return {action:"attack",score:attackScore,attackScore,
  options:eligible.length,legal:eligible};
}
export function planSeal(s){
 const w=plannerWeights(s.plannerRisk),party=partySummary(s);
 const affordable=s.discardable(party.sealCost,"MAGIC");
 if(!affordable)return {attempt:false,reason:"unaffordable",sealChance:0};
 const crownOwner=s.heroes.find(h=>h.hp>0&&
  h.inventory.some(c=>c.id==="crown-relic"));
 const defender=6, wit=party.maxWit+(s.witBonus||0);
 let wins=0;
 for(let d=1;d<=20;d++)for(let a=1;a<=20;a++)
  wins+=Number(a===20||a!==1&&a+wit>d+defender);
 const crownSurvival=crownOwner?clamp((crownOwner.hp-1)/6,0,1):0;
 const sealChance=wins/400+(1-wins/400)*crownSurvival;
 const stage=[WARDEN,WARDEN_FURY];
 const battleDanger=stage.reduce((a,m)=>{
  const f=forecastCombat(s,m);return a+f.expectedLoss;
 },0);
 const fightChance=clamp(Math.exp(-battleDanger/Math.max(1,party.hp)*
  (w.damage/1.5)),0.04,0.92);
 const costPenalty=party.sealCost*party.resourceValue*.012;
 // Losing the Seal test grants the Warden ADV: missed attempts are costly.
 const failedRisk=(1-sealChance)*0.06;
 const attempt=sealChance-failedRisk-costPenalty>fightChance;
 return {attempt,reason:"seal_vs_fight",sealChance,fightChance,
  margin:sealChance-failedRisk-costPenalty-fightChance};
}
