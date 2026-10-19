/**
 * Factorial contrasts calculated ONLY on matching Hero + seed replicate.
 * A full 2x2 contrast isolates HP x ATK interaction within one encounter
 * context; cross-context contrasts reveal whether density changes it.
 */
import {FACTORIAL_HP,FACTORIAL_ATK,FACTORIAL_ENCOUNTERS,
 statFactorialId} from "./monster-stat-factorial-hypotheses.js";

const METRICS=["won","vaultReached","roomsCleared","ordinaryEncounters",
 "ordinaryFights","combatContextDamage"];
const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:null;
const key=row=>row.hero+"|"+row.replicate;
const cellId=(hp,atk,context)=>
 context==="canonical"&&hp==="full"&&atk===0?"canonical":
 statFactorialId(hp,atk,context);
const flatMetrics=x=>Object.fromEntries(METRICS.map(m=>[m,mean(x.map(r=>r[m]??0))]));
const joinContrast=(rows,ids,contrast)=>{
 const maps=ids.map(id=>new Map((rows.filter(r=>r.variant===id))
  .map(row=>[key(row),row])));
 const joined=[];
 for(const [k,base] of maps[0]){
  const values=[base];
  for(const m of maps.slice(1)){
   const match=m.get(k);
   if(!match)break;
   values.push(match);
  }
  if(values.length===ids.length)joined.push(values);
 }
 const differences=Object.fromEntries(METRICS.map(metric=>[metric,
  mean(joined.map(arms=>contrast(arms.map(r=>r[metric]??0))))]));
 return {n:joined.length,differences};
};
/**
 * Main effects at the OTHER factor's canonical level and differences
 * in differences, each stratified by encounter context.
 * The results are descriptive while screening is incomplete.
 */
export function statFactorialAnalysis(rows){
 const phases=rows.filter(r=>r.variant==="canonical"||
  r.variant?.startsWith("monster-stats-hp-"));
 const contexts={};
 for(const context of FACTORIAL_ENCOUNTERS){
  const grid=[];
  for(const hp of FACTORIAL_HP)
   for(const atk of FACTORIAL_ATK){
    const id=cellId(hp.id,atk,context);
    const cell=phases.filter(x=>x.variant===id);
    grid.push({id,hp:hp.id,atk,context,n:cell.length,
     ...flatMetrics(cell)});
   }
  const canonical=cellId("full",0,context);
  const hpMain=FACTORIAL_HP.filter(x=>x.id!=="full").map(hp=>{
   const changed=cellId(hp.id,0,context);
   return {hp:hp.id,...joinContrast(phases,[canonical,changed],
    ([a,b])=>b-a)};
  });
  const atkMain=FACTORIAL_ATK.filter(x=>x>0).map(atk=>{
   const changed=cellId("full",atk,context);
   return {atk,...joinContrast(phases,[canonical,changed],
    ([a,b])=>b-a)};
  });
  const interactions=[];
  for(const hp of FACTORIAL_HP.filter(x=>x.id!=="full"))
   for(const atk of FACTORIAL_ATK.filter(x=>x>0)){
    const hpOnly=cellId(hp.id,0,context);
    const atkOnly=cellId("full",atk,context);
    const combo=cellId(hp.id,atk,context);
    const paired=joinContrast(phases,[canonical,hpOnly,atkOnly,combo],
     ([base,h,a,both])=>both-h-a+base);
    interactions.push({hp:hp.id,atk,...paired});
   }
  contexts[context]={grid,hpMain,atkMain,interactions};
 }
 return {description:"Matched Hero/replicate factorial differences. "+
  "Interaction = (HP+ATK - HP-only) - (ATK-only - context baseline). "+
  "Screening contrasts are exploratory and require held-out confirmation.",
  contexts};
}
