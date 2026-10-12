/**
 * Research-only bounded utility planner.
 * Evaluates public card text/typed effects, not hidden deck order or future dice.
 * No mutation, PRNG use, or simulation side effects. Utilities are estimates,
 * not game rules or proofs of optimal play.
 */
import {ROOM_EFFECTS} from "./room-effect-model.js";
import {ROLL_EFFECTS,bandFor} from "./effect-model.js";
import {MONSTERS,WARDEN,WARDEN_FURY} from "./tabletop-data.js";

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
 const heroDamage=living.reduce((n,h)=>n+
  hitProbability(s.stats(h).atk+(h.recruitedGoblin?1:0),m.def,
   {dis:h.poison||h.nextDis>0,adv:h.nextAdv>0})*
  (3.5+(h.nextDamage||0)+s.basicAttackBonus(h)+(h.slots.weapon?.id==="sword"?0.8:0)),0);
 const remaining=m===s.monster?Math.max(0,s.monsterHP):m.hp;
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
   case "HEAL":case "HEAL_ALL":healing+=amount;break;
   case "HURT":harm+=amount;break;
   case "POISON":utility-=party.hpFraction<.6?5:3;break;
   case "CURE":utility+=party.heroes.some(h=>h.poison)?4:0.3;break;
   case "PEEK":case "PEEK_SWAP":utility+=stage==="DEEP"?0.55:0.8;break;
   case "RECHARGE":utility+=s.exhaustedWand()?weights.spell+1:0;break;
   case "CURSED_RECHARGE":utility+=s.exhaustedWand()?2:0;break;
   case "FIGHT_REWARD":conditionalFightReward+=amount;break;
   case "MONSTER_DRAW":extraFights++;break;
   case "BANISH":case "FUNGUS_BURN":case "CHOIR_SILENCE":utility+=s.monster?6:3;break;
   case "NEXT_WIT":utility+=Math.min(4,amount);break;
   case "NEXT_ADV":case "DEF_ADV":utility+=1.7;break;
   case "MONSTER_ADV":utility-=2;break;
   case "NEXT_DIS":utility-=2.5;break;
   case "CHECK_WIT":case "CHECK_ATK":utility+=0.5;break;
   case "ALCHEMY_HEAL_OR_TWO":healing+=2.2;break;
   case "MAGIC_HEAL":healing+=1.2;break;
   case "SUPPLY_BARTER":utility+=party.cards>2?2:0;break;
   case "ROLL_ROOM_COST_REROLL":utility+=0.7;break;
   case "BOOKCASE_FIRE_OR_SCROLL":utility+=party.magic>0?3:1;break;
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
export function planRoom(s,legal){
 const w=plannerWeights(s.plannerRisk),party=partySummary(s);
 const room=s.room,raw=ROOM_EFFECTS[room.id];
 const score=idx=>{
  const ops=raw.choices[idx],initial=textScore(s,ops.filter(o=>!o.startsWith("ROLL_ROOM")),w,party,room.stage);
  if(!ops.some(o=>/^ROLL_ROOM/.test(o)))return initial;
  let result=0;
  for(let face=1;face<=6;face++){
   const band=bandFor(room,face),out=raw.outcomes[band];
   result+=textScore(s,out,w,party,room.stage,{outcome:true})/6;
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
function effectScore(ops,party){
 let damage=0,healing=0,skips=0,curse=0,draw=0;
 for(const raw of ops){
  const [kind,arg]=raw.split(":");
  const val=estimatedDice(arg);
  if(kind==="DAMAGE")damage+=val;
  if(kind==="NEXT_DAMAGE")damage+=val*.75;
  if(kind==="SKIP")skips+=val;
  if(kind==="MONSTER_DIS")skips+=.4;
  if(kind==="BANISH_OR_SKIP")skips+=1.2;
  if(kind==="HEAL")healing+=Math.min(party.missing,val);
  if(kind==="HURT")curse+=val;
  if(kind==="DRAW")draw+=val;
  if(kind==="NEXT_ADV")damage+=1;
  if(kind==="FORCE_BEHAVIOR"||kind==="REWRITE_BEHAVIOR")skips+=.3;
 }
 return {damage,healing,skips,curse,draw};
}
export function planCombat(s,h){
 const w=plannerWeights(s.plannerRisk),party=partySummary(s),m=s.monster;
 if(!m)return {action:"attack",score:0,options:0};
 const damage=hitProbability(s.stats(h).atk,m.def,{dis:h.poison||h.nextDis>0})*(3.5+s.basicAttackBonus(h))+
  Math.max(0,h.nextDamage);
 const spellCost=w.spell*(1+(m.stage!=="FINAL"&&party.magic<=party.sealCost?0.55:0));
 const fore=forecastCombat(s,m);
 const incoming=fore.monsterDamage*w.damage;
 let winner=null,options=0;
 for(const card of h.inventory){
  if(!card.v2.roll||!["SCROLL","WAND"].includes(card.v2.kind))continue;
  if(card.v2.kind==="WAND"&&s.exhausted.has(card))continue;
  let sum=0;
  for(let face=1;face<=6;face++){
   const effect=effectScore(ROLL_EFFECTS[card.id][bandFor(card,face)],party);
   sum+=effect.damage*w.damage+
    effect.healing*w.damage+
    effect.skips*incoming+
    effect.draw*w.draw-
    effect.curse*w.damage;
  }
  const expected=sum/6;
  const opportunity=card.v2.kind==="SCROLL"?spellCost:Math.max(0.8,spellCost*.35);
  const utility=expected-opportunity;
  options++;
  if(!winner||utility>winner.score)winner={action:"item",card,score:utility};
 }
 const attackScore=damage*w.damage+(m.hp<=damage?incoming:0);
 if(winner&&winner.score>attackScore+0.6)return {...winner,attackScore,options};
 return {action:"attack",score:attackScore,options};
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
