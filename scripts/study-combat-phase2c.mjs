#!/usr/bin/env node
/**
 * Phase 2c: compare the same 48 wounded/equipped scenario states under
 * multiple INDEPENDENT combat dice seeds, keeping the printed state fixed.
 * All policy arms share each scenario x replicate seed. Search RNG is
 * separate from the committed chance stream.
 *
 * Never infer win percentages for a full 36-Room expedition from these
 * isolated encounter results.
 */
import {mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {scenarios,simulateScenario,identitySeed}
 from "./study-combat-phase2b.mjs";

const POLICIES=["attack_only","phase2c_safe","phase2c_elbereth","phase2c_parley"];
const sum=(rows,field)=>rows.reduce((v,r)=>v+(typeof field==="function"?field(r):r[field]),0);
const average=(rows,field)=>rows.length?sum(rows,field)/rows.length:0;
const group=(rows,keyFn)=>{
 const m=new Map();
 for(const row of rows){
  const k=keyFn(row);
  if(!m.has(k))m.set(k,[]);
  m.get(k).push(row);
 }
 return m;
};
const percentile=(sorted,p)=>{
 if(sorted.length===0)return null;
 return sorted[Math.max(0,Math.min(sorted.length-1,
  Math.floor(p*(sorted.length-1))))];
};
/**
 * Cluster bootstrap: resample WHOLE scenario IDs, keeping their
 * independent dice replicates paired. Avoid pretending 48xR rollouts are
 * independent observations of 48xR distinct scenario designs.
 */
function clusterCI(rows,seed,samples=400){
 const clusters=[...group(rows,r=>r.scenarioId).values()];
 if(clusters.length<2)return null;
 const diffs=[];
 for(let b=0;b<samples;b++){
  let weighted=0,n=0;
  for(let i=0;i<clusters.length;i++){
   const randomId=identitySeed(seed,"cluster|"+b+"|"+i);
   const cluster=clusters[randomId%clusters.length];
   weighted+=sum(cluster,"hpSavedVsAttack");
   n+=cluster.length;
  }
  diffs.push(weighted/n);
 }
 diffs.sort((a,b)=>a-b);
 return [percentile(diffs,0.025),percentile(diffs,0.975)];
}
const summary=(rows,seed)=>{
 const policies=[];
 for(const policy of POLICIES){
  const own=rows.filter(r=>r.policy===policy),n=own.length;
  const number=f=>sum(own,f);
  const avg=f=>average(own,f);
  const changed=own.filter(r=>r.deviations>0);
  policies.push({
   policy,n,cleared:number(r=>Number(r.safelyCleared)),
   heroDeaths:number("deaths"),
   meanHpLost:avg("hpLost"),meanHpSavedVsAttack:avg("hpSavedVsAttack"),
   hpSavedClusterCI95:clusterCI(own,seed),
   hpBetter:number(r=>Number(r.hpSavedVsAttack>0)),
   hpWorse:number(r=>Number(r.hpSavedVsAttack<0)),
   hpEqual:number(r=>Number(r.hpSavedVsAttack===0)),
   safetyGains:number(r=>Number(r.safetyDeltaVsAttack===1)),
   safetyLosses:number(r=>Number(r.safetyDeltaVsAttack===-1)),
   scenariosWithDifferentDecisions:new Set(changed.map(r=>r.scenarioId)).size,
   changedReplicates:changed.length,changedDecisionWindows:number("deviations"),
   changedHeroChoices:number("deviationsHero"),
   changedCombatChoices:number("deviationsCombat"),
   changedParleyChoices:number("deviationsParley"),
   itemActions:number("actionsItem"),elberethActions:number("actionsElbereth"),
   parleyActions:number("actionsParley"),heroSelections:number("heroSelections"),
   legalItemOpportunities:number(r=>r.opportunities.item),
   legalParleyOpportunities:number(r=>r.opportunities.parley),
   legalHeroSelectionOpportunities:number(r=>r.opportunities.heroSelection)
  });
 }
 return policies;
};
const subgroup=(rows,field)=>{
 const keys=[...new Set(rows.map(r=>r[field]))];
 return keys.map(key=>({
  [field]:key, policies:summary(rows.filter(r=>r[field]===key),identitySeed(20261017,key))
 }));
};
const quoteCsv=value=>{
 const str=String(value??"");
 return /[",\n]/.test(str)?'"'+str.replaceAll('"','""')+'"':str;
};
const csv=rows=>{
 const keys=Object.keys(rows[0]||{}).filter(k=>k!=="opportunities");
 return keys.join(",")+"\n"+rows.map(r=>keys.map(k=>quoteCsv(r[k])).join(",")).join("\n")+"\n";
};
export function runPhase2c({
 seed=20261017,repetitions=4,limit=48,samples=4,followupSamples=2,
 ids=null,out="results/combat-phase2c-"+seed,write=true
}={}){
 if(!Number.isSafeInteger(seed)||seed<1||
   !Number.isInteger(repetitions)||repetitions<1||repetitions>32||
   !Number.isInteger(samples)||samples<1||samples>16||
   !Number.isInteger(followupSamples)||followupSamples<1||followupSamples>8)
  throw Error("Invalid Phase 2c study settings");
 const fixtures=scenarios({seed,limit,...(ids?{ids}:{})});
 const rows=[];
 for(const fixture of fixtures){
  for(let repetition=0;repetition<repetitions;repetition++){
   const pair=POLICIES.map(policy=>simulateScenario(fixture,policy,{
    samples,followupSamples,seed,repetition
   }));
   if(new Set(pair.map(r=>r.diceSeed)).size!==1)
    throw Error("Unpaired combat random seeds: "+fixture.id);
   const basic=pair[0];
   for(const result of pair){
    result.hpSavedVsAttack=basic.hpLost-result.hpLost;
    result.safetyDeltaVsAttack=Number(result.safelyCleared)-
     Number(basic.safelyCleared);
    result.firstDecisionDifferentFromBasic=
     JSON.parse(result.firstDecision).chosen!==
     JSON.parse(result.firstDecision).baseline;
    rows.push(result);
   }
  }
  if(write)console.error("Completed "+fixture.id);
 }
 const report={
  schema:"combat-phase2c-v1",
  design:{seed,repetitions,samples,followupSamples,
   scenarioCount:fixtures.length,armCount:POLICIES.length,
   runs:rows.length,arms:POLICIES},
  comparisons:summary(rows,seed),
  byMonster:subgroup(rows,"monsterId"),
  byHeroProfile:subgroup(rows,"profileId"),
  limitations:[
   "These are 48 intentionally constructed but canonical encounters, not naturally encountered 36-Room game states",
   "Combat dice replicates are independent deterministic RNG seeds for each unique scenario",
   "Every policy arm has the same beginning physical cards and chance stream per scenario and replicate",
   "An action that changes dice consumption can produce different later dice even with identical initial RNG",
   "Cluster intervals represent resampling constructed scenarios, not formal expedition win-rate confidence intervals",
   "HP saved excludes the opportunity cost of future Rooms, although the tactical evaluator penalizes Item consumption",
   "Neither Elbereth nor Parley is recommended without a sufficient safety margin by the experimental policy"
  ]
 };
 if(write){
  const directory=resolve(out);
  if(existsSync(directory))throw Error("Output folder already exists: "+directory);
  mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,"summary.json"),JSON.stringify(report,null,2)+"\n");
  writeFileSync(join(directory,"fights.csv"),csv(rows));
  writeFileSync(join(directory,"scenarios.json"),JSON.stringify(
   fixtures.map(({session,...metadata})=>metadata),null,2)+"\n");
  for(const item of report.comparisons)
   console.log(item.policy+": safe="+item.cleared+"/"+item.n+
    " lostHP="+item.meanHpLost.toFixed(2)+
    " savedHP="+item.meanHpSavedVsAttack.toFixed(2)+
    " gained="+item.safetyGains+" lost="+item.safetyLosses+
    " changed="+item.changedReplicates+
    " HeroChoices="+item.changedHeroChoices+
    " Items="+item.itemActions+
    " Elbereth="+item.elberethActions+
    " Parley="+item.parleyActions);
  console.log("Wrote "+directory+" ("+rows.length+" paired outcomes)");
 }
 return {report,rows,fixtures};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2);
 const allowed=new Set(["--seed","--repetitions","--scenarios","--samples",
  "--followup","--monsters","--out"]);
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  const [name,value]=argv.slice(i,i+2);
  if(!allowed.has(name)||!value||Object.hasOwn(opts,name))
   throw Error("Invalid Phase 2c flag "+name);
  opts[name]=value;
 }
 const integer=(key,value,low,high)=>{
  const n=Number(opts[key]??value);
  if(!Number.isSafeInteger(n)||n<low||n>high)
   throw Error("Invalid "+key+" (allowed "+low+"-"+high+")");
  return n;
 };
 runPhase2c({
  seed:integer("--seed",20261017,1,0xffffffff),
  repetitions:integer("--repetitions",4,1,32),
  limit:integer("--scenarios",48,1,48),
  samples:integer("--samples",4,1,16),
  followupSamples:integer("--followup",2,1,8),
  ids:opts["--monsters"]?.split(",")??null,
  out:opts["--out"]??"results/combat-phase2c-"+(opts["--seed"]??20261017)
 });
}
