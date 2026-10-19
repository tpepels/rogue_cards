/**
 * A full physical-card factorial: HP x ATK x encounter frequency.
 *
 * HP = canonical, 3/4, 2/3, 1/2 (rounded UP, min 1).
 * ATK = canonical, -1, -2 (floored at zero).
 * Frequency = canonical, existing mild/strong printed Room effects.
 *
 * The unchanged (HP=1, ATK=0, frequency=canonical) cell is supplied by
 * the study runner's single paired canonical control, not duplicated here.
 * No new global rule, Hero, Warden, DEF, reward or Monster behavior edits.
 */
import {canonicalStagingCatalogue,compileStaging} from "./catalogue.js";
import {balanceHypotheses} from "./balance-hypotheses.js";
import {scaledMonsterHp} from "./monster-hp-ratio-hypotheses.js";

const original=canonicalStagingCatalogue();
export const FACTORIAL_HP=Object.freeze([
 Object.freeze({id:"full",numerator:1,denominator:1}),
 Object.freeze({id:"three-quarters",numerator:3,denominator:4}),
 Object.freeze({id:"two-thirds",numerator:2,denominator:3}),
 Object.freeze({id:"half",numerator:1,denominator:2})
]);
export const FACTORIAL_ATK=Object.freeze([0,1,2]);
export const FACTORIAL_ENCOUNTERS=Object.freeze(["canonical","mild","strong"]);

export const statFactorialId=(hp,atk,context)=>
 "monster-stats-hp-"+hp+"-atk-minus-"+atk+"-"+context;

export function statFactorialCell(id){
 if(id==="canonical")return {hp:"full",atk:0,context:"canonical"};
 for(const hp of FACTORIAL_HP)
  for(const atk of FACTORIAL_ATK)
   for(const context of FACTORIAL_ENCOUNTERS)
    if(id===statFactorialId(hp.id,atk,context))
     return {hp:hp.id,atk,context};
 throw Error("Unknown stat-factorial variant "+id);
}
export function monsterStatFactorialHypotheses(){
 const existing=balanceHypotheses();
 const mild=existing.find(x=>x.id==="encounter-mild")?.roomEffects;
 const strong=existing.find(x=>x.id==="encounter-strong")?.roomEffects;
 if(!mild||!strong)throw Error("Missing existing encounter Room interventions");
 const hypotheses=[];
 for(const context of FACTORIAL_ENCOUNTERS)
  for(const hp of FACTORIAL_HP)
   for(const atk of FACTORIAL_ATK){
    if(context==="canonical"&&hp.id==="full"&&atk===0)
     continue; // exactly one shared baseline, not a copied arm.
    const cards=original.monsters.map(monster=>{
     const set={};
     if(hp.id!=="full")
      set.hp=scaledMonsterHp(monster.hp,hp.numerator,hp.denominator);
     if(atk) set.atk=Math.max(0,monster.atk-atk);
     return Object.keys(set).length?{
      collection:"monsters",id:monster.id,set
     }:null;
    }).filter(Boolean);
    const spec={
     schema:"rogue-cards-staging-v1",
     id:statFactorialId(hp.id,atk,context),
     description:"Monster HP="+hp.numerator+"/"+hp.denominator+
      " (ceil; min 1), Monster ATK -"+atk+" (min 0), "+
      "encounters="+context+"; Warden/DEF/behavior/Items unchanged.",
     ...(cards.length?{cards}:{}),
     ...(context==="canonical"?{}:{roomEffects:context==="mild"?mild:strong})
    };
    compileStaging(spec);
    hypotheses.push(Object.freeze(spec));
   }
 return Object.freeze(hypotheses);
}

/**
 * Confirmation protects the five isolated parameter effects, then
 * allocates one true two-factor interaction within EACH encounter context.
 * Screening rank fills any remaining places. Selection uses NO holdout rows.
 */
export function chooseStatFactorialFinalists(ranked,max,available){
 const names=new Set(available.map(s=>s.id));
 const selected=[];
 const add=id=>{
  const row=ranked.find(r=>r.id===id);
  if(row&&names.has(id)&&!selected.some(s=>s.id===id)&&selected.length<max)
   selected.push(row);
 };
 for(const hp of FACTORIAL_HP.filter(x=>x.id!=="full"))
  add(statFactorialId(hp.id,0,"canonical"));
 for(const atk of FACTORIAL_ATK.filter(x=>x>0))
  add(statFactorialId("full",atk,"canonical"));
 for(const context of FACTORIAL_ENCOUNTERS){
  const match=ranked.find(r=>{
   const c=statFactorialCell(r.id);
   return c.context===context&&c.hp!=="full"&&c.atk>0;
  });
  if(match)add(match.id);
 }
 for(const row of ranked)add(row.id);
 return selected;
}
