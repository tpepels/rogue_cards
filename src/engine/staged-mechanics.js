/**
 * Opt-in physical-rule prototypes. These operate on the exact canonical
 * ExpeditionState; no second rules engine, no AI-specific outcomes.
 */
import {settleMonsterVictory} from "./combat-outcomes.js";
const choice=(s,key)=>{
 const m=s.metrics.mechanicChoices;
 m[key]=(m[key]??0)+1;
};
const success=(s,key)=>{
 const m=s.metrics.mechanicSuccesses;
 m[key]=(m[key]??0)+1;
};
const chooseHero=s=>[...s.living()].sort((a,b)=>b.card.wit-a.card.wit)[0];
function dismiss(s,key){
 const monster=s.monster;
 if(!monster||monster.stage==="FINAL")throw Error("Cannot dismiss this Monster");
 s.banished=true;s.monsterHP=0;
 // Surrender/flight must not incorrectly grant printed FIGHT rewards.
 s.pendingReward=0;s.pendingFightHeal=null;
 settleMonsterVictory(s,monster);
 s.metrics.banishments++;
 success(s,key);
}
function opposedWit(s){
 const h=chooseHero(s);
 if(!h)return false;
 s.setActor(h);
 const mods=s.takeWitModifiers(h);
 const die=s.rollHeroD20(h,{dis:!!h.poison||mods.dis});
 const other=s.die(20);
 return die===20||die!==1&&die+h.card.wit+mods.bonus>other+4;
}
/** Extra alternatives are selectable BEFORE choosing to fight. */
export function resolveStagedNegotiation(s,kind){
 const mode=s.cardPools?.mechanics?.negotiation??"canonical";
 if(!s.monster||s.monster.stage==="FINAL"||
   !["wit","item","both"].includes(mode))
  throw Error("No opt-in negotiation available");
 if(kind==="negotiate"&&!["wit","both"].includes(mode)||
    kind==="bribe"&&!["item","both"].includes(mode))
  throw Error("Negotiation action disabled");
 choice(s,"parley:"+kind);
 let won=false;
 if(kind==="bribe"){
  if(!s.discardable())throw Error("Bribe needs one Item");
  s.discard();won=true;
 }else if(kind==="negotiate")won=opposedWit(s);
 else throw Error("Unknown staged negotiation action");
 s.metrics.negotiations++;
 s.metrics.monsterParleyAttemptsById[s.monster.id]=
  (s.metrics.monsterParleyAttemptsById[s.monster.id]??0)+1;
 if(won){
  s.metrics.negotiationsWon++;
  s.metrics.monsterParleyWinsById[s.monster.id]=
   (s.metrics.monsterParleyWinsById[s.monster.id]??0)+1;
  dismiss(s,"parley:"+kind);
 }else s.monsterAdv=true;
 return won;
}
/** In combat a Hero may try to escape at a real cost / opposed check. */
export function resolveStagedRetreat(s,kind){
 if(!s.monster||s.monster.stage==="FINAL")throw Error("No regional retreat");
 const mode=s.cardPools?.mechanics?.retreat??"none";
 if(kind==="retreat-item"&&mode!=="item"||
    kind==="retreat-wit"&&mode!=="wit")throw Error("Retreat action disabled");
 choice(s,kind);
 let won=false;
 if(kind==="retreat-item"){
  if(!s.discardable())throw Error("Retreat needs a carried Item");
  s.discard();won=true;
 }else if(kind==="retreat-wit")won=opposedWit(s);
 if(won)dismiss(s,kind);
 else s.monsterAdv=true;
 return won;
}
export function moraleAvailable(s){
 const morale=s.cardPools?.mechanics?.morale??"none";
 if(morale==="none"||!s.monster||s.monster.stage==="FINAL"||
   s._moraleOffered||s.monsterHP<=0)return false;
 return s.monsterHP*4<=s.monster.hp*(morale==="half"?2:1);
}
export function resolveStagedMorale(s,kind){
 if(!s.monster||!s._moraleOffered)throw Error("No surrender offered");
 choice(s,"surrender:"+kind);
 if(kind==="spare"){
  dismiss(s,"surrender:spare");
  return true;
 }
 if(kind!=="press")throw Error("Unknown surrender response");
 return false;
}
/** The Warden is still fought in the canonical two-phase AC+HP system. */
export function resolveStagedWardenTactic(s,kind,heroIndex){
 if(!s.monster||s.monster.stage!=="FINAL")throw Error("Warden not present");
 const mode=s.cardPools?.mechanics?.wardenTactic??"none";
 const expected={brace:"warden-brace",interrupt:"warden-interrupt",
  breach:"warden-breach"}[mode];
 if(kind!==expected)throw Error("Wrong staged Warden tactic");
 const hero=s.heroes[heroIndex];
 if(!hero||hero.hp<=0)throw Error("No living Warden tactician");
 s.setActor(hero);
 choice(s,kind);
 if(kind==="warden-brace"){
  s.monsterDis=true;success(s,kind);
 }else if(kind==="warden-interrupt"){
  if(!s.discardable())throw Error("Interrupt costs an Item");
  s.discard();s.monsterSkip++;
  success(s,kind);
 }else{
  const mods=s.takeWitModifiers(hero);
  const die=s.rollHeroD20(hero,{dis:!!hero.poison||mods.dis});
  if(die===20||die!==1&&die+hero.card.wit+mods.bonus>=15){
   s.monsterHP=Math.max(0,s.monsterHP-3);
   success(s,kind);
  }else s.monsterAdv=true;
 }
}
export function drawStagedPatrol(s){
 const rules=s.cardPools?.mechanics??{};
 if(!rules.patrolEvery||s.room?.stage==="FINAL"||!s.alive())return;
 const index=s.stageProgress[s.room.stage]+1;
 if(index%rules.patrolEvery!==0||s.monster||s.monsterQueue.length)return;
 const before=s.metrics.encounterStarts;
 s.drawMonster();
 if(s.metrics.encounterStarts===before)return;
 s.metrics.patrolEncounters++;
 const mode=rules.patrolOpening??"normal";
 if(mode==="skip")s.monsterSkip++;
 else if(mode==="dis")s.monsterDis=true;
}
