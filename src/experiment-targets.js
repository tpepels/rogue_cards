/**
 * Pre-registered target scorer for Everything Goes.
 *
 * This is intentionally independent of the engine, search policy and files:
 * it cannot adjust the agreed threshold in response to the result.
 * Missing measurements are visible, not silently converted into zero.
 */
const ratio=(a,b)=>b>0?a/b:null;
const average=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function wilson(k,n){
 if(n<=0)return null;
 const z=1.95996398454,p=k/n,z2=z*z,den=1+z2/n;
 const centre=(p+z2/(2*n))/den;
 const half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/den;
 return [Math.max(0,centre-half),Math.min(1,centre+half)];
}
function meanCI(values){
 if(!values.length)return null;
 const mean=average(values),n=values.length;
 if(n===1)return {estimate:mean,ci95:null};
 const variance=values.reduce((n,x)=>n+(x-mean)**2,0)/(values.length-1);
 const e=1.95996398454*Math.sqrt(variance/n);
 return {estimate:mean,ci95:[mean-e,mean+e]};
}
function bootstrap(values,measure,{strata=false,replications=600}={}){
 if(!values.length)return null;
 const groups=strata?Object.values(Object.groupBy(values,x=>x.heroes[0])):[values];
 let state=0x12345678;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const estimate=measure(values),samples=[];
 for(let trial=0;trial<replications;trial++){
  const selected=groups.flatMap(g=>Array.from({length:g.length},()=>g[next()%g.length]));
  const value=measure(selected);
  if(Number.isFinite(value))samples.push(value);
 }
 if(!samples.length)return {estimate,ci95:null};
 samples.sort((a,b)=>a-b);
 return {estimate,ci95:[
  samples[Math.floor(.025*(samples.length-1))],
  samples[Math.ceil(.975*(samples.length-1))]
 ]};
}
const total=(rows,key)=>rows.reduce((sum,r)=>sum+Number(r[key]||0),0);
function evaluateMetric(spec,organic,physical){
 const solo=organic.filter(r=>r.heroes.length===1),
  duo=organic.filter(r=>r.heroes.length===2);
 const wins=rows=>rows.filter(r=>r.won).length;
 const proportions=rows=>({estimate:ratio(wins(rows),rows.length),
  ci95:wilson(wins(rows),rows.length),sampleSize:rows.length});
 switch(spec.id){
 case "solo_win_rate":return proportions(solo);
 case "duo_win_rate":return proportions(duo);
 case "vault_reach_rate":{
  const found=organic.filter(r=>r.vaultReached).length;
  return {estimate:ratio(found,organic.length),ci95:wilson(found,organic.length),
   sampleSize:organic.length,events:found};
 }
 case "ordinary_encounters_per_full_36":{
  const full=organic.filter(r=>["UPPER","MIDDLE","DEEP"].every(
   stage=>r.byStage?.[stage]?.normal>=12));
  return {...(meanCI(full.map(r=>r.ordinaryEncounters))||
   {estimate:null,ci95:null}),sampleSize:full.length,events:full.length,
   denominator:"Only runs visiting all 36 ordinary regional Rooms"};
 }
 case "encounter_to_fight_rate":{
  const fights=total(organic,"ordinaryFightStarts"),
   encountered=total(organic,"ordinaryEncounters");
  return {estimate:ratio(fights,encountered),
   ci95:wilson(fights,encountered),sampleSize:organic.length,
   events:encountered,numerator:fights,denominator:encountered,
   invalid:fights>encountered?"Fights exceed ordinary Monster encounters":null};
 }
 case "combat_hp_loss_fraction":{
  const eligible=organic.filter(r=>r.ordinaryFightStarts>0&&r.partyMaxHp>0);
  const ratios=eligible.map(r=>r.combatContextDamage/
   (r.ordinaryFightStarts*r.partyMaxHp));
  return {...(meanCI(ratios)||{estimate:null,ci95:null}),
   sampleSize:eligible.length,events:total(eligible,"ordinaryFightStarts"),
   totalCombatDamage:total(eligible,"combatContextDamage"),
   excludedRuns:organic.length-eligible.length};
 }
 case "new_items_per_12_rooms":{
  const rooms=total(organic,"normalRoomEntries");
  return {estimate:ratio(12*total(organic,"itemAcquisitionsDuringPlay"),rooms),
   ci95:bootstrap(organic,rows=>ratio(
    12*total(rows,"itemAcquisitionsDuringPlay"),
    total(rows,"normalRoomEntries")))?.ci95??null,
   sampleSize:organic.length,events:rooms,status:"UNSET"};
 }
 case "odd_effects_per_normal_room":{
  const rooms=total(organic,"normalRoomEntries");
  const estimate=bootstrap(organic,rows=>ratio(
   total(rows,"oddItemActivations"),total(rows,"normalRoomEntries")));
  return {estimate:estimate?.estimate??null,ci95:estimate?.ci95??null,
   sampleSize:organic.length,events:rooms,
   numerator:total(organic,"oddItemActivations"),denominator:rooms};
 }
 case "solo_hero_win_spread":{
  const groups=Object.groupBy(solo,r=>r.heroes[0]);
  const rates=Object.fromEntries(Object.entries(groups).map(([h,rows])=>
   [h,ratio(wins(rows),rows.length)]));
  const spread=rows=>{
   const g=Object.groupBy(rows,r=>r.heroes[0]);
   const values=Object.values(g).map(xs=>ratio(wins(xs),xs.length));
   return values.length>=2?Math.max(...values)-Math.min(...values):null;
  };
  const sample=bootstrap(solo,spread,{strata:true});
  return {estimate:sample?.estimate??null,ci95:sample?.ci95??null,
   sampleSize:solo.length,perHero:Object.fromEntries(
    Object.entries(groups).map(([h,rs])=>[h,rs.length])),heroWinRates:rates};
 }
 case "room_option_usefulness":
  return {estimate:null,ci95:null,sampleSize:0,status:"FOCUSED_TEST_REQUIRED",
   note:"No choice share target: execute each printed branch in a deterministic contract test."};
 default:throw Error("Target evaluator missing required metric "+spec.id);
 }
}
function score(spec,result,complete){
 let status=result.status||null,reason=null;
 if(!status&&result.invalid){status="INVALID_DATA";reason=result.invalid;}
 const minGames=spec.minGames??0,minEvents=spec.minEvents??0;
 if(!status&&((result.sampleSize??0)<minGames||
  (result.events??0)<minEvents)){
  status="INSUFFICIENT_EXPOSURE";
  reason="Sample or event denominator below preregistered evidence gate";
 }
 if(!status&&spec.minGamesPerHero&&
  (Object.values(result.perHero||{}).length!==8||
   Object.values(result.perHero).some(n=>n<spec.minGamesPerHero))){
  status="INSUFFICIENT_EXPOSURE";reason="At least 80 organic runs required for each of 8 solo Heroes";
 }
 if(!status&&(result.estimate===null||!result.ci95)){
  status="INSUFFICIENT_EXPOSURE";
  reason="No usable confidence interval";
 }
 if(!status){
  const [lo,hi]=spec.acceptable,[hardLo,hardHi]=spec.action;
  if(result.ci95[1]<hardLo||result.ci95[0]>hardHi)status="INTERVENE";
  else if(result.estimate<lo||result.estimate>hi)status="REVIEW";
  else if(result.ci95[0]>=lo&&result.ci95[1]<=hi)status="ON_TARGET";
  else status="UNCERTAIN";
 }
 return {...spec,observation:result,status,reason,
  preliminary:!complete,
  decision:!complete&&["INTERVENE","ON_TARGET","REVIEW","UNCERTAIN"].includes(status)?
   "PRELIMINARY_"+status:status};
}
export function evaluateBalanceTargets(targets,allRuns,{complete=false,physicalSessions=[]}={}){
 if(targets.schema!=="everything-goes-targets-v1")throw Error("Unknown target schema");
 const organic=allRuns.filter(r=>r.group==="survey");
 const assessments=targets.metrics.map(spec=>
  score(spec,evaluateMetric(spec,organic,physicalSessions),complete));
 const physical=targets.physicalTime.map(spec=>{
  const sessions=physicalSessions.filter(x=>x.party===
   (spec.id.startsWith("solo")?"solo":"duo"));
  const stats=meanCI(sessions.map(s=>s.minutes));
  return {id:spec.id,ideal:spec.ideal,acceptable:spec.acceptable,
   minTimedSessions:spec.minTimedSessions,
   sampleSize:sessions.length,estimate:stats?.estimate??null,
   ci95:stats?.ci95??null,status:sessions.length>=spec.minTimedSessions?
    "REVIEW_PHYSICAL_EVIDENCE":"NOT_MEASURED_IN_SIMULATION"};
 });
 const items=targets.itemAudit;
 const report={
  schema:"everything-goes-target-evaluation-v1",targetVersion:targets.version,
  complete,organicGames:organic.length,expectedSurveyGames:targets.assessment.primary,
  metrics:assessments,physical,unselectedQuestion7:true,
  warnings:assessments.filter(x=>!["ON_TARGET","UNSET"].includes(x.status))
   .map(x=>({id:x.id,status:x.decision,reason:x.reason})),
  conclusionsAllowed:complete,
  itemEvidenceThresholds:{
   legalOpportunities:items.minActualLegalOpportunitiesForUseJudgment,
   acquisitions:items.minAcquisitionsForUsageJudgment,
   passiveExposureRooms:items.minEquippedRoomExposuresForPassiveJudgment,
   minimumMatchedPairs:items.minMatchedPairsPerOddItem
  }
 };
 return report;
}
