/**
 * Deterministic baseline tabletop playtest — never a replacement for printed rules.
 *
 * Models: regional room draw order; first/affordable room decisions and their common
 * outcomes; item supply; equipped WEAPON/ARMOUR/RING; opposed d20 combat with
 * automatic 1/20; all 12 monster behaviour patterns; two Warden phases and SEAL.
 *
 * Deliberate limitations (reported, never hidden): no room look-ahead optimisation,
 * no corpse eating, no cross-card triggered abilities except basic equipment, no
 * potion identification, no recharging, and no Scroll/Wand action policy. Thus this
 * is a CONSERVATIVE, BASIC-ATTACK policy, not the whole card game's win probability.
 * Unknown room effects are counted in skippedEffects for the audit.
 */
import {HEROES, ROOMS, MONSTERS, OBJECTS, WARDEN, WARDEN_FURY, VAULT} from "./tabletop-data.js";

export const MODEL_VERSION = "phase5-basic-attack-v1";
export const MONSTER_IDS = Object.freeze([
 "rat","goblin","crawler","bat","troll","wisp","eye","mold",
 "wraith","rust","cultist","sentinel","warden","warden-fury"
]);

export function randomSource(seed=1) {
 let state=(seed>>>0)||0x9e3779b9;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 const die=sides=>1+Math.floor(random()*sides);
 return {die,choose:a=>a[Math.floor(random()*a.length)],shuffle:arr=>{
   const out=[...arr];for(let i=out.length-1;i>0;i--){const j=die(i+1)-1;[out[i],out[j]]=[out[j],out[i]];}return out;
 }};
}
const clamp=(x,low,hi)=>Math.min(hi,Math.max(low,x));
const inBand=(range,value)=>{const [low,high=low]=range.split("–").map(Number);return low<=value&&value<=high;};
export const outcome=(rows,die)=>{
 const entry=rows.find(x=>inBand(x.range,die));
 if(!entry)throw new Error("Unprinted d6 face "+die);
 return entry;
};
export function d20Attack(rng,atk,def,{adv=false,dis=false}={}){
 const one=rng.die(20),attack=adv&&!dis?Math.max(one,rng.die(20)):dis&&!adv?Math.min(one,rng.die(20)):one;
 const defense=rng.die(20);
 return {attack,defense,critical:attack===20,hit:attack!==1&&(attack===20||attack+atk>defense+def)};
}
export function opposedWit(rng,wit,dc){
 const a=rng.die(20),b=rng.die(20);
 return a!==1&&(a===20||a+wit>b+dc);
}
const hasTag=(card,tag)=>card.v2?.tags?.includes(tag);
const weaponValue=o=>({sword:2,staff:1,"cursed-blade":3}[o.id]||0);
const armourValue=o=>({mail:2,shield:1,"cursed-mail":3}[o.id]||0);
export const effectiveStats=hero=>{
 const carried=hero.items;
 const weapon=carried.filter(o=>hasTag(o,"WEAPON")&&!hasTag(o,"CURSED")).sort((a,b)=>weaponValue(b)-weaponValue(a))[0];
 const armour=carried.filter(o=>hasTag(o,"ARMOUR")&&!hasTag(o,"CURSED")).sort((a,b)=>armourValue(b)-armourValue(a))[0];
 const ring=carried.find(o=>o.id==="ring-hunger");
 return {atk:hero.card.atk+(weapon?weaponValue(weapon):0)+(ring?2:0),
  def:hero.card.def+(armour?armourValue(armour):0),weapon,armour};
};
const healthy=heroes=>heroes.filter(h=>h.hp>0);
const partyAlive=heroes=>healthy(heroes).length>0;
const hurt=(hero,damage,state)=>{
 const actual=Math.max(0,damage);hero.hp=clamp(hero.hp-actual,0,hero.card.hp);
 state.damageTaken+=Math.min(actual,hero.hp+actual);
};
const heal=(hero,amount)=>{hero.hp=clamp(hero.hp+Math.max(0,amount),0,hero.card.hp);};
const pickHero=(heroes,mode="weak")=>{
 const living=healthy(heroes);if(!living.length)return null;
 return [...living].sort((a,b)=>mode==="strong"?b.hp-a.hp:a.hp-b.hp)[0];
};
const restoreParty=(heroes,amount)=>{const h=pickHero(heroes,"weak");if(h)heal(h,amount);};
function takeCard(state){
 if(!state.deck.length)return null;
 const c=state.deck.pop();state.itemsDrawn++;pickHero(state.heroes,"weak")?.items.push(c);return c;
}
function spendItem(state,{magic=false}={}){
 const hero=[...state.heroes].sort((a,b)=>b.items.length-a.items.length)
   .find(h=>h.items.some(o=>!magic||hasTag(o,"MAGIC")));
 if(!hero)return null;
 const index=hero.items.findIndex(o=>!magic||hasTag(o,"MAGIC"));
 state.itemsSpent++;
 return hero.items.splice(index,1)[0];
}
function magicCount(heroes){return heroes.reduce((n,h)=>n+h.items.filter(o=>hasTag(o,"MAGIC")).length,0);}
function deckForRegion(stage,rng,source){
 return rng.shuffle(source.filter(c=>c.stage===stage).flatMap(c=>Array.from({length:c.copies},()=>c)));
}
function newState(heroCards,rng){
 const deck=rng.shuffle(OBJECTS.flatMap(c=>Array.from({length:c.copies},()=>c)));
 const heroes=heroCards.map(card=>({card,hp:card.hp,poisoned:false,items:[],abilityUsed:false,attackDis:false}));
 for(const hero of heroes){
  const index=deck.findIndex(o=>o.id===hero.card.v2.starter);
  if(index<0)throw new Error("Missing starting card: "+hero.card.id);
  hero.items.push(...deck.splice(index,1));hero.items.push(deck.pop());
 }
 return {rng,heroes,deck,monsters:Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(s=>[s,deckForRegion(s,rng,MONSTERS)])),
  cleared:0,battles:0,kills:0,damageTaken:0,itemsDrawn:heroes.length,itemsSpent:0,
  skippedEffects:0,sealAvailable:false,sealAttempt:false,sealWin:false,roundLimit:false,
  won:false,rounds:0,monsterResponses:0,region:"UPPER",activeMonster:null,monsterHP:0,monsterSkip:0,monsterAdv:false,heroAdv:false};
}
function drawMonster(state,stage){
 const pile=state.monsters[stage];if(!pile)return;
 // If a region's finite monster pile runs out, recycle its printed copies.
 if(!pile.length)pile.push(...deckForRegion(stage,state.rng,MONSTERS));
 if(state.activeMonster){state.skippedEffects++;return;} // A second simultaneous Monster is outside this basic policy.
 state.activeMonster=pile.pop();state.monsterHP=state.activeMonster.hp;
}
function applyRoomOutcome(state,text,stage){
 const hero=pickHero(state.heroes);
 if(!hero)return;
 const s=text.toLowerCase();
 const m=s.match(/(?:draw|find|salvage|returns?|awards?|give you|gain|take|find a bundle\. draw)\s+(\d+)\s+items?/i);
 const one=/(?:draw|find|award|take|give you|gain)\s+(?:an?|one)\s+item/i.test(s);
 let count=m?Number(m[1]):one?1:0;
 if(/draw 3 items; discard 1|draw 3 items, discard 1|draw 3 items; keep 1/i.test(s))count--;
 for(let i=0;i<count;i++)takeCard(state);
 const lose=text.match(/(?:lose|suffer|take|shock yourself for)\s+(2d6|d6(?:\+\d+)?|\d+)\s*(?:hp|damage)?/i);
 if(lose)hurt(hero,rollAmount(lose[1],state.rng),state);
 const healMatch=text.match(/heal\s+(2d6|d6(?:\+\d+)?|\d+)\s*(?:hp)?/i);
 if(healMatch)restoreParty(state.heroes,rollAmount(healMatch[1],state.rng));
 if(/become poisoned|\bpoisoned\b/i.test(s)&&!/remove poisoned|ignore poisoned/.test(s))hero.poisoned=true;
 if(/remove poisoned/.test(s))hero.poisoned=false;
 if(/discard\s+(?:one|1)\s+item|discard\s+1\s+of them/.test(s))spendItem(state);
 if(/draw an? (?:upper|middle|deep) monster|summons? a (?:middle|deep|upper) monster/.test(s)){
  drawMonster(state,stage);
 }
 if(/discard (?:the )?monster|it flees|it leaves/.test(s))state.activeMonster=null;
 // These effects exist but their utility needs strategy and retained card state.
 if(/peek|swap|keep this room|next wit|next trap|next d20|first attack has dis|adv on its first attack|after victory/.test(s))state.skippedEffects++;
}
function rollAmount(expression,rng){
 const m=/^(?:(\d+))?d6(?:\+(\d+))?$/.exec(expression);
 if(m)return Array.from({length:Number(m[1]||1)},()=>rng.die(6)).reduce((a,b)=>a+b,Number(m[2]||0));
 return Number(expression);
}
function roomTurn(state,room){
 const rng=state.rng,hero=pickHero(state.heroes);
 if(!hero)return;
 state.region=room.stage;
 for(const h of state.heroes){h.abilityUsed=false;h.poisoned=false;h.attackDis=false;}
 // Explicit entry triggers. They are NOT choices and are resolved first.
 const entry=room.v2.prompt.match(/Draw an? (UPPER|MIDDLE|DEEP) Monster/i);
 if(entry)drawMonster(state,entry[1]);
 const options=room.v2.choices,first=options[0],second=options[1];
 // Baseline policy: try the first printed option. Pay its mandatory cost;
 // if impossible, take the second, or skip an unaffordable second option.
 let choice=first;
 if(/Discard (?:1|one) Item/i.test(first.effect)&&!state.heroes.some(h=>h.items.length))choice=second;
 if(/Discard (?:2|two) Items/i.test(choice.effect)&&state.heroes.reduce((n,h)=>n+h.items.length,0)<2)choice=null;
 if(!choice){state.skippedEffects++;return;}
 const effect=choice.effect;
 if(/Discard (?:1|one) Item/i.test(effect))spendItem(state);
 if(/Discard (?:2|two) Items/i.test(effect)){spendItem(state);spendItem(state);}
 const lose=effect.match(/Lose (2d6|d6|\d+) HP/i);if(lose)hurt(hero,rollAmount(lose[1],rng),state);
 const healMatch=effect.match(/heal (d6|\d+) HP/i);if(healMatch)restoreParty(state.heroes,rollAmount(healMatch[1],rng));
 // Resolve a Room d6 only when its chosen action specifies it.
 if(/\bRoll d6\b/i.test(effect)){
  const n=rng.die(6);
  applyRoomOutcome(state,outcome(room.v2.roll.outcomes,n).effect,room.stage);
 }
 if(/Draw a (?:UPPER|MIDDLE|DEEP) Monster/i.test(effect))drawMonster(state,room.stage);
 if(/peek|recharge|after victory|opposed d20|choose (?:5–6|6)|reroll/i.test(effect))state.skippedEffects++;
}
function monsterAction(state,hero,monster,kind,{adv=false,atkBonus=0,damageBonus=0}={}){
 const rng=state.rng;const stats=effectiveStats(hero);
 const attack=d20Attack(rng,monster.atk+atkBonus,stats.def,{adv:adv||state.monsterAdv,dis:false});
 state.monsterAdv=false;
 if(!attack.hit)return;
 let damage=rng.die(6)+(attack.critical?rng.die(6):0)+damageBonus;
 if(stats.armour?.id==="shield"&&!hero.shieldUsed){
  hero.shieldUsed=true;
  const roll=rng.die(6);if(roll>=5)damage=0;else if(roll>=3)damage=Math.max(0,damage-2);
 }
 if(hero.card.id==="knight"&&!hero.abilityUsed){
  hero.abilityUsed=true;const roll=rng.die(6);
  if(roll<=2)damage=2;else if(roll<=4)damage=Math.max(0,damage-rng.die(6));else damage=0;
 }
 hurt(hero,damage,state);
 if(kind==="poison"&&damage>0)hero.poisoned=true;
 if(kind==="drain"&&damage>0)spendItem(state);
}
function respond(state,active){
 const m=state.activeMonster;if(!m)return;
 if(state.monsterSkip>0){state.monsterSkip--;return;}
 const rng=state.rng,roll=rng.die(6),band=roll<=2?0:roll<=4?1:roll===5?2:3;
 state.monsterResponses++;
 const h=active.hp>0?active:pickHero(state.heroes);if(!h)return;
 const atk=(options={})=>monsterAction(state,h,m,undefined,options);
 switch(m.id){
 case "rat":if(band===1)atk();else if(band===2)h.attackDis=true;else if(band===3)atk({atkBonus:2});break;
 case "goblin":if(band===1)atk();else if(band===2)spendItem(state)||hurt(h,2,state);else if(band===3)atk({adv:true});break;
 case "crawler":if(band===0)h.attackDis=true;else if(band===1)atk();else if(band===2)monsterAction(state,h,m,"poison");else atk({atkBonus:2});break;
 case "bat":if(band===1)atk();else if(band===2)h.attackDis=true;else if(band===3)atk({adv:true});break;
 case "troll":if(band===1)atk();else if(band===2)state.monsterHP=Math.min(m.hp,state.monsterHP+2);else if(band===3)atk({damageBonus:2});break;
 case "wisp":if(band===0)h.attackDis=true;else if(band===1)atk();else if(band===2)hurt(h,2,state);else atk({adv:true});break;
 case "eye":if(band===1)atk({atkBonus:2-m.atk});else if(band===2)h.attackDis=true;else if(band===3)atk({adv:true});break;
 case "mold":if(band===0)h.attackDis=true;else if(band===1)h.poisoned=true;else if(band===2)atk();else atk({adv:true});break;
 case "wraith":if(band===0)h.attackDis=true;else if(band===1)atk();else if(band===2)monsterAction(state,h,m,"drain");else atk({adv:true});break;
 case "rust":if(band===1)atk();else if(band===2)spendItem(state)||hurt(h,3,state);else if(band===3)atk({adv:true});break;
 case "cultist":if(band===0)state.monsterAdv=true;else if(band===1)atk({atkBonus:6-m.atk});else if(band===2)h.poisoned=true;else atk({adv:true});break;
 case "sentinel":if(band===0)h.attackDis=true;else if(band===1)atk();else if(band===2)atk({damageBonus:2});else atk({adv:true});break;
 case "warden":if(band===1)atk();else if(band===2)h.attackDis=true;else if(band===3)atk({adv:true});break;
 case "warden-fury":if(band===0)atk();else if(band===1)monsterAction(state,h,m,"drain");else if(band===2)healthy(state.heroes).forEach(x=>hurt(x,2,state));else atk({adv:true,damageBonus:2});break;
 default:throw new Error("Unmodeled Monster "+m.id);
 }
 if(h.card.id==="monk"&&!h.abilityUsed&&h.hp>0){
  h.abilityUsed=true;const d=rng.die(6);if(d>=5)heal(h,2);else if(d<=2)hurt(h,2,state);
 }
}
function heroTurn(state,hero){
 const rng=state.rng,m=state.activeMonster,stats=effectiveStats(hero);
 if(!m||hero.hp<=0)return;
 if(hero.card.id==="wizard"&&!hero.abilityUsed){
  hero.abilityUsed=true;const d=rng.die(6);
  if(d<=2)hurt(hero,rng.die(6),state);
  else if(d<=4)state.monsterHP-=rng.die(6)+2;
  else {state.monsterHP-=rng.die(6)+rng.die(6);state.monsterSkip++;}
  return;
 }
 let adv=false,dis=hero.attackDis||hero.poisoned;
 hero.attackDis=false;
 if(hero.card.id==="rogue"&&!hero.abilityUsed){
  hero.abilityUsed=true;const d=rng.die(6);if(d<=2)dis=true;else if(d>=3)adv=true;
 }
 if(hero.card.id==="priest"&&!hero.abilityUsed){
  hero.abilityUsed=true;const d=rng.die(6);
  if(d<=2)hurt(hero,rng.die(6),state);else if(d>=5){adv=true;hero.poisoned=false;}else stats.atk+=2;
 }
 const result=d20Attack(rng,stats.atk,m.def,{adv,dis});
 if(!result.hit)return;
 let damage=rng.die(6)+(result.critical?rng.die(6):0);
 if(stats.weapon?.id==="cursed-blade")hurt(hero,1,state);
 if(hero.card.id==="warrior"&&!hero.abilityUsed){
  hero.abilityUsed=true;const d=rng.die(6);if(d<=2)hurt(hero,2,state);else if(d<=4)damage+=2;else damage+=rng.die(6);
 }
 if(stats.weapon?.id==="sword"&&!hero.weaponUsed){
  hero.weaponUsed=true;const d=rng.die(6);if(d<=2)hurt(hero,1,state);else if(d<=4)damage+=2;else damage+=rng.die(6);
 }
 state.monsterHP-=damage;
}
function fight(state,monster,{startingHP=monster.hp,transitionAt=0}={}){
 state.activeMonster=monster;state.monsterHP=startingHP;state.monsterSkip=0;state.monsterAdv=false;
 state.battles++;
 state.heroes.forEach(h=>{h.weaponUsed=false;h.shieldUsed=false;});
 let rounds=0;
 while(partyAlive(state.heroes)&&state.monsterHP>transitionAt&&rounds++<120){
  for(const hero of state.heroes){
   if(hero.hp<=0||state.monsterHP<=transitionAt)continue;
   heroTurn(state,hero);if(state.monsterHP<=transitionAt)break;
   respond(state,hero);if(!partyAlive(state.heroes))break;
  }
 }
 state.rounds+=rounds;
 if(rounds>=120)state.roundLimit=true;
 if(state.monsterHP<=0)state.kills++;
 const thresholdReached=state.monsterHP<=transitionAt;
 state.activeMonster=null;
 return thresholdReached;
}
function seal(state){
 state.sealAvailable=magicCount(state.heroes)>=3;
 if(!state.sealAvailable)return false;
 state.sealAttempt=true;for(let i=0;i<3;i++)spendItem(state,{magic:true});
 const highest=[...healthy(state.heroes)].sort((a,b)=>b.card.wit-a.card.wit)[0];
 state.sealWin=opposedWit(state.rng,highest.card.wit,6);
 return state.sealWin;
}
export function simulateExpedition({seed=1,heroes=["warrior"],bossChoice="seal"}={}){
 if(!Array.isArray(heroes)||heroes.length<1||heroes.length>2)throw new RangeError("1 or 2 Heroes required");
 const cards=heroes.map(id=>{const c=HEROES.find(h=>h.id===id);if(!c)throw new Error("Unknown Hero "+id);return c;});
 const rng=randomSource(seed),state=newState(cards,rng);
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  const rooms=rng.shuffle(ROOMS.filter(r=>r.stage===stage)).slice(0,3);
  for(const room of rooms){
   roomTurn(state,room);
   if(!partyAlive(state.heroes))return summary(state);
   if(state.activeMonster){
    const card=state.activeMonster;
    if(!fight(state,card))return summary(state);
   }
   state.cleared++;
  }
 }
 const omen=rng.die(6);
 if(omen<=2)state.monsterAdv=true;
 if(bossChoice==="seal"&&seal(state)){state.won=true;return summary(state);}
 if(!partyAlive(state.heroes))return summary(state);
 if(!fight(state,WARDEN,{transitionAt:12}))return summary(state);
 // The Warden's health is conserved across phases. Start Phase II at exactly
 // 12 HP or fewer, never restore an extra health bar.
 if(!fight(state,WARDEN_FURY,{startingHP:clamp(state.monsterHP,0,12)}))return summary(state);
 state.won=true;
 return summary(state);
}
function summary(s){
 return {won:s.won,cleared:s.cleared,battles:s.battles,kills:s.kills,damageTaken:s.damageTaken,
  itemsDrawn:s.itemsDrawn,itemsSpent:s.itemsSpent,magicHeld:magicCount(s.heroes),
  sealAvailable:s.sealAvailable,sealAttempt:s.sealAttempt,sealWin:s.sealWin,roundLimit:s.roundLimit,
  skippedEffects:s.skippedEffects,turns:s.rounds,
  remainingHP:s.heroes.map(h=>h.hp)};
}
export function simulateBatch({runs=1000,seed=1,heroes=["warrior"],bossChoice="seal"}={}){
 if(!Number.isInteger(runs)||runs<1||runs>200000)throw new RangeError("Invalid run count");
 const totals={wins:0,deepReached:0,vaultReached:0,battles:0,damageTaken:0,itemsDrawn:0,
  sealAvailable:0,sealAttempt:0,sealWin:0,roundLimits:0,skippedEffects:0,rounds:0};
 for(let i=0;i<runs;i++){
  const r=simulateExpedition({seed:(seed+i*0x9e3779b1)>>>0,heroes,bossChoice});
  totals.wins+=Number(r.won);totals.deepReached+=Number(r.cleared>=6);
  totals.vaultReached+=Number(r.cleared===9);
  totals.battles+=r.battles;totals.damageTaken+=r.damageTaken;
  totals.itemsDrawn+=r.itemsDrawn;totals.sealAvailable+=Number(r.sealAvailable);
  totals.sealAttempt+=Number(r.sealAttempt);totals.sealWin+=Number(r.sealWin);
  totals.roundLimits+=Number(r.roundLimit);totals.skippedEffects+=r.skippedEffects;totals.rounds+=r.turns;
 }
 return {model:MODEL_VERSION,runs,heroes:[...heroes],bossChoice,
  winRate:totals.wins/runs,deepRate:totals.deepReached/runs,vaultRate:totals.vaultReached/runs,
  sealAvailabilityRate:totals.sealAvailable/Math.max(1,totals.vaultReached),
  sealSuccessRate:totals.sealWin/Math.max(1,totals.sealAttempt),
  meanBattles:totals.battles/runs,meanDamage:totals.damageTaken/runs,
  meanItemsDrawn:totals.itemsDrawn/runs,meanRounds:totals.rounds/runs,
  meanUnmodeledEffects:totals.skippedEffects/runs,roundLimits:totals.roundLimits};
}
