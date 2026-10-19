/**
 * Physical Monster HP ratio experiment. No new rules or mechanics.
 * 3 ratios x 3 encounter contexts = nine staged hypotheses.
 * Warden, Heroes, ordinary Monster ATK/DEF/copies/behavior and rewards
 * are never edited. Integer HP is rounded UP and always at least 1.
 */
import {canonicalStagingCatalogue,compileStaging} from "./catalogue.js";
import {balanceHypotheses} from "./balance-hypotheses.js";

const original=canonicalStagingCatalogue();
export const HP_RATIOS=Object.freeze([
 Object.freeze({id:"half",numerator:1,denominator:2}),
 Object.freeze({id:"two-thirds",numerator:2,denominator:3}),
 Object.freeze({id:"three-quarters",numerator:3,denominator:4})
]);
export const scaledMonsterHp=(hp,numerator,denominator)=>
 Math.max(1,Math.ceil(hp*numerator/denominator));

export function monsterHpRatioHypotheses(){
 const existing=balanceHypotheses();
 const mild=existing.find(x=>x.id==="encounter-mild");
 const strong=existing.find(x=>x.id==="encounter-strong");
 if(!mild||!strong)throw Error("Missing stable printed encounter variants");
 const result=[];
 for(const ratio of HP_RATIOS){
  const cards=original.monsters.map(monster=>({
   collection:"monsters",id:monster.id,set:{
    hp:scaledMonsterHp(monster.hp,ratio.numerator,ratio.denominator)
   }
  }));
  for(const context of ["canonical","mild","strong"]){
   const suffix=context==="canonical"?"":"-"+context;
   const spec={
    schema:"rogue-cards-staging-v1",
    id:"monster-hp-"+ratio.id+suffix,
    description:"All ordinary Monsters have ceil(HP * "+
     ratio.numerator+"/"+ratio.denominator+
     "); encounter context="+context+
     "; no new mechanics, Warden/ATK/DEF untouched.",
    cards,
    ...(context==="canonical"?{}:{
     // Apply the original Room-die changes, not any patrol system.
     roomEffects:context==="mild"?mild.roomEffects:strong.roomEffects
    })
   };
   compileStaging(spec);
   result.push(Object.freeze(spec));
  }
 }
 return Object.freeze(result);
}
export function monsterHpRatioFamily(id){
 if(id.endsWith("-mild"))return "mild";
 if(id.endsWith("-strong"))return "strong";
 return "canonical";
}
