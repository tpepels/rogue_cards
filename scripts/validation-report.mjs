/**
 * Aggregation, hard invariants and descriptive diagnostics for LOCAL studies.
 * Read-only reporting; game balance goals never fail correctness validation.
 */
import {HEROES,OBJECTS} from "../src/tabletop-data.js";
const CONFIG_FIELDS=new Set(["batchSeed","strategy","policy","party","orientation","winBits"]);
const percent=x=>(x*100).toFixed(1)+"%";
const pp=x=>(x*100).toFixed(2)+" pp";
const fixed=x=>Number(x).toFixed(2);
export function wilson(wins,n){
 if(!n)return [null,null];
 const z=1.9599639845,p=wins/n,z2=z*z;
 const denom=1+z2/n,mid=(p+z2/(2*n))/denom;
 const half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/denom;
 return [Math.max(0,mid-half),Math.min(1,mid+half)];
}
const unpack=(buffer,index)=>Number(!!(buffer[index>>>3]&(1<<(index&7))));
const empty=()=>({
 n:0,wins:0,seatSubsetN:0,seatSubsetWins:0,cleared:0,deep:0,battles:0,damage:0,
 rounds:0,drawn:0,spent:0,activated:0,potionsUsed:0,scouted:0,
 negotiations:0,negotiationsWon:0,corpses:0,banishments:0,
 sealAvailable:0,sealAttempt:0,sealWin:0,hpRemaining:0,hpFraction:0,
 missingHp:0,roundLimits:0,unresolved:0,outOfBounds:0,
 failureStages:{},failureCauses:{},roomChoices:{},monsterVisits:{},
 operationCounts:{},plannerDecisions:{},item:{}
});
function deepAdd(to,from){
 for(const [key,value] of Object.entries(from)){
  if(CONFIG_FIELDS.has(key))continue;
  if(typeof value==="number"){
   to[key]=(to[key]||0)+value;
  }else if(value&&typeof value==="object"&&!Array.isArray(value)){
   to[key]??={};
   deepAdd(to[key],value);
  }
 }
}
function combine(rows){
 const obj=empty();for(const row of rows)deepAdd(obj,row);return obj;
}
function rate(m){
 return {n:m.n,wins:m.wins,winRate:m.wins/Math.max(1,m.n),
  ci95:wilson(m.wins,m.n),
  vaultRate:m.cleared/Math.max(1,m.n),
  deepRate:m.deep/Math.max(1,m.n),
  sealAvailableRate:m.sealAvailable/Math.max(1,m.n),
  sealAttemptRate:m.sealAttempt/Math.max(1,m.n),
  sealSuccessAmongAttempts:m.sealWin/Math.max(1,m.sealAttempt),
  meanDamage:m.damage/Math.max(1,m.n),
  meanRounds:m.rounds/Math.max(1,m.n),
  meanHpFraction:m.hpFraction/Math.max(1,m.n),
  meanItemsActivated:m.activated/Math.max(1,m.n),
  meanDrawn:m.drawn/Math.max(1,m.n),
  meanSpent:m.spent/Math.max(1,m.n),
  meanNegotiations:m.negotiations/Math.max(1,m.n),
  failureStages:m.failureStages,failureCauses:m.failureCauses,
  plannerDecisions:m.plannerDecisions};
}
const by=(rows,key)=>Object.groupBy?Object.groupBy(rows,key):rows.reduce((o,row)=>{
 const name=key(row);(o[name]??=[]).push(row);return o;
},{});
const csvCell=value=>{
 const raw=String(value??"");
 return /[,"\r\n]/.test(raw)?'"'+raw.replaceAll('"','""')+'"':raw;
};
const csv=(columns,records)=>[columns.join(","),
 ...records.map(record=>columns.map(c=>csvCell(record[c])).join(","))].join("\n")+"\n";
const diff=(a,b)=>b.winRate-a.winRate;
const numberSort=(a,b)=>a-b;
const settings=key=>key.split("\u0001");
function makePairedContrasts(rows){
 const canonical=rows.filter(r=>r.orientation==="canonical");
 const index=new Map(canonical.map(r=>[[
  r.batchSeed,r.strategy,r.party,r.policy].join("\u0001"),r]));
 const res={};
 for(const alt of canonical){
  if(alt.policy==="scripted")continue;
  const scripted=index.get([alt.batchSeed,alt.strategy,alt.party,"scripted"].join("\u0001"));
  if(!scripted)continue;
  if(scripted.n!==alt.n)throw Error("Nonmatching cohort for paired estimate");
  const k=[alt.strategy,alt.party.includes("+")?"duo":"solo",alt.policy].join("\u0001");
  const cell=res[k]??={n:0,improved:0,harmed:0,baseWins:0,altWins:0};
  const baselineBits=Buffer.from(scripted.winBits,"base64");
  const variantBits=Buffer.from(alt.winBits,"base64");
  for(let i=0;i<alt.n;i++){
   const b=unpack(baselineBits,i),a=unpack(variantBits,i);
   cell.n++;cell.improved+=Number(a>b);cell.harmed+=Number(a<b);
  }
  cell.baseWins+=scripted.wins;cell.altWins+=alt.wins;
 }
 return Object.entries(res).map(([key,c])=>{
  const [strategy,size,policy]=settings(key);
  const effect=(c.improved-c.harmed)/c.n,discordance=(c.improved+c.harmed)/c.n;
  const stderr=Math.sqrt(Math.max(0,(discordance-effect*effect)/c.n));
  return {strategy,size,policy,n:c.n,baselineRate:c.baseWins/c.n,
   candidateRate:c.altWins/c.n,delta:effect,
   ci95:[effect-1.96*stderr,effect+1.96*stderr],
   improved:c.improved,harmed:c.harmed};
 }).sort((a,b)=>a.strategy.localeCompare(b.strategy)||
  a.size.localeCompare(b.size)||a.policy.localeCompare(b.policy));
}
function makeSeatChecks(rows){
 const canonical=new Map(rows.filter(r=>r.orientation==="canonical").map(r=>[
  [r.batchSeed,r.strategy,r.party,r.policy].join("\u0001"),r]));
 const pooled={};
 for(const r of rows.filter(r=>r.orientation==="reversed")){
  const c=canonical.get([r.batchSeed,r.strategy,r.party,r.policy].join("\u0001"));
  if(!c)throw Error("Missing canonical seat trial");
  const k=[r.strategy,r.policy,r.party].join("\u0001");
  const x=pooled[k]??={n:0,canonicalWins:0,reversedWins:0,improved:0,harmed:0};
  const canonicalBits=Buffer.from(c.winBits,"base64");
  const reversedBits=Buffer.from(r.winBits,"base64");
  for(let i=0;i<r.n;i++){
   const original=unpack(canonicalBits,i),reverse=unpack(reversedBits,i);
   x.n++;x.canonicalWins+=original;x.reversedWins+=reverse;
   x.improved+=Number(reverse>original);x.harmed+=Number(reverse<original);
  }
 }
 return Object.entries(pooled).map(([k,x])=>{
  const [strategy,policy,party]=settings(k);
  const delta=(x.improved-x.harmed)/x.n,q=(x.improved+x.harmed)/x.n;
  const se=Math.sqrt(Math.max(0,(q-delta*delta)/x.n));
  return {strategy,policy,party,n:x.n,canonicalWinRate:x.canonicalWins/x.n,
   reversedWinRate:x.reversedWins/x.n,delta,ci95:[
    delta-1.96*se,delta+1.96*se],improved:x.improved,harmed:x.harmed};
 }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
function summarizeSeeds(rows){
 const keys=by(rows,r=>[r.batchSeed,r.strategy,r.policy,
   r.party.includes("+")?"duo":"solo"].join("\u0001"));
 const records=Object.entries(keys).map(([key,rs])=>{
  const [seed,strategy,policy,size]=settings(key),m=rate(combine(rs));
  return {batchSeed:Number(seed),strategy,policy,size,...m};
 });
 const group=by(records,r=>[r.strategy,r.policy,r.size].join("\u0001"));
 const stability=Object.entries(group).map(([key,rs])=>{
  const [strategy,policy,size]=settings(key),vals=rs.map(r=>r.winRate);
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  const sd=Math.sqrt(vals.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,vals.length-1));
  return {strategy,policy,size,seedBatches:vals.length,
   min:Math.min(...vals),max:Math.max(...vals),mean:avg,sd};
 });
 return {records,stability};
}
function makeItems(rows){
 const collections=by(rows,r=>r.policy+"\u0001"+r.strategy);
 return Object.entries(collections).flatMap(([key,rr])=>{
  const [policy,strategy]=settings(key),m=combine(rr);
  return OBJECTS.map(o=>{
   const id=o.id,a=m.item[id]||{};
   return {policy,strategy,id,title:o.title,kind:o.v2.kind,
    copies:o.copies,draws:a.draws||0,acquisitions:a.acquisitions||0,
    opportunities:a.opportunities||0,uses:a.uses||0,
    passive:a.passive||0,combatOpportunities:a.byPhase?.combat||0,
    roomOpportunities:a.byPhase?.["room-choice"]||0,
    reactionOpportunities:Object.entries(a.byPhase||{}).filter(([phase])=>
     ["on-poison","after-magic","after-roll","after-hit","before-defence",
      "on-hit","on-attack","failed-d20","room-roll"].includes(phase)).
     reduce((n,[,amount])=>n+amount,0),
    actionUses:a.useModes?.action||0,
    damage:a.damage||0,healing:a.healing||0,
    selfDamage:a.selfDamage||0,skips:a.responsesSkipped||0,
    cures:a.cures||0,costs:a.resourcesSpent||0,
    recharges:a.recharges||0,scouts:a.scouts||0,
    opportunityModes:a.byMode||{},useModes:a.useModes||{}};
  });
 });
}
function makePartyResults(rows){
 const groups=by(rows,r=>[r.strategy,r.policy,r.party].join("\u0001"));
 return Object.entries(groups).map(([key,rr])=>{
  const [strategy,policy,party]=settings(key),m=combine(rr);
  return {strategy,policy,party,size:party.includes("+")?"duo":"solo",
   ...rate(m)};
 });
}
function validate(plan,rows,parties,items){
 const errors=[],warnings=[];
 const expected=plan.seeds.length*plan.strategies.length*plan.policies.length*
  plan.partyCount*(1+(plan.seatRuns>0?28/36:0));
 if(rows.length!==expected)errors.push("Cohort count mismatch: "+rows.length+" vs "+expected);
 const counted=rows.reduce((n,r)=>n+r.n,0);
 if(counted!==plan.plannedExpeditions)
  errors.push("Simulated count mismatch: "+counted+" vs "+plan.plannedExpeditions);
 const primary=rows.filter(r=>r.orientation==="canonical"),seen=new Set();
 for(const r of rows){
  const k=[r.batchSeed,r.strategy,r.party,r.policy,r.orientation].join(":");
  if(seen.has(k))errors.push("Duplicate cohort: "+k);
  seen.add(k);
  if(!Number.isInteger(r.n)||r.n<=0||r.wins<0||r.wins>r.n||
   r.cleared>r.n||r.deep>r.n||r.sealAttempt>r.n||r.sealWin>r.sealAttempt)
   errors.push("Invalid outcome counters: "+k);
  if(r.roundLimits||r.unresolved||r.outOfBounds)
   errors.push("Unresolved, stalled or HP out-of-bounds: "+k+" "+
    JSON.stringify({roundLimits:r.roundLimits,unresolved:r.unresolved,outOfBounds:r.outOfBounds}));
  if(Buffer.from(r.winBits,"base64").length!==Math.ceil(r.n/8))
   errors.push("Bad compressed win sequence: "+k);
  if(r.item)for(const [id,x] of Object.entries(r.item)){
   if(!OBJECTS.some(o=>o.id===id))errors.push("Unknown Object in observations: "+id);

  }
 }
 for(const p of parties){
  if(!Number.isFinite(p.winRate)||p.winRate<0||p.winRate>1)
   errors.push("Invalid Hero rate: "+p.party);
 }
 for(const x of items){
  if(x.draws>x.acquisitions)
   errors.push("More draws than acquisitions: "+x.policy+" / "+x.id);
  if(x.uses>x.opportunities&&x.opportunities>0&&x.uses-x.opportunities>10)
   warnings.push("Item use/opportunity instrumentation mismatch: "+
    x.policy+" / "+x.strategy+" / "+x.id+" "+
    x.uses+" uses vs "+x.opportunities+" opportunities (not card balance evidence)");
 }
 const missing=plan.policies.includes("cautious")?
  parties.filter(x=>x.policy==="cautious"&&x.size==="solo"):[];
 if(missing.length){
  const nonKnight=missing.filter(p=>p.party!=="knight");
  for(const strategy of plan.strategies){
   const subset=nonKnight.filter(p=>p.strategy===strategy);
   if(!subset.length)continue;
   const range=Math.max(...subset.map(p=>p.winRate))-
    Math.min(...subset.map(p=>p.winRate));
   if(range>0.1)warnings.push("Non-Knight solo spread above 10 pp ("+
    strategy+": "+pp(range)+"). Knight is intentionally excluded as beginner class.");
  }
 }
 const worstSeat=Math.max(0,...makeSeatChecks(rows).map(x=>Math.abs(x.delta)));
 if(worstSeat>0.15&&plan.seatRuns>=30)
  warnings.push("Some Hero order effects exceed 15 pp; see seat-order.csv. "+
   "Swapping seats also changes random item allocation.");
 if(plan.seeds.length<3)
  warnings.push("Fewer than three independent seed batches; run more to assess seed stability.");
 if(plan.runs<100)
  warnings.push("Fewer than 100 trials per cohort per seed; treat rates as noisy smoke tests.");
 if(!plan.policies.includes("scripted"))
  warnings.push("No scripted policy selected: paired baseline comparisons unavailable.");
 return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],
  primaryCohorts:primary.length,allCohorts:rows.length,
  totalExpeditions:counted};
}
export function makeValidationReport(plan,rows){
 const primary=rows.filter(x=>x.orientation==="canonical");
 const parties=makePartyResults(primary),itemRows=makeItems(primary);
 const seedStats=summarizeSeeds(primary);
 const policyContrasts=makePairedContrasts(rows);
 const seats=makeSeatChecks(rows);
 const validation=validate(plan,rows,parties,itemRows);
 const primaryTotal=primary.reduce((a,b)=>a+b.n,0);
 const partyGroups=by(parties,p=>p.policy+"\u0001"+p.strategy+"\u0001"+p.size);
 const partySummary=Object.entries(partyGroups).map(([key,rr])=>{
  const [policy,strategy,size]=settings(key);
  const m=combine(primary.filter(r=>r.policy===policy&&r.strategy===strategy&&
   (r.party.includes("+")?"duo":"solo")===size));
  return {policy,strategy,size,...rate(m)};
 });
 const ranking=parties.filter(p=>p.size==="solo")
  .map(x=>({...x,beginner:x.party==="knight"}));
 const easiestNonKnight={};
 for(const [key,p] of Object.entries(by(ranking.filter(x=>!x.beginner),
  x=>x.policy+"\u0001"+x.strategy))){
  const [policy,strategy]=settings(key);
  easiestNonKnight[policy+"|"+strategy]={
   spread:Math.max(...p.map(x=>x.winRate))-Math.min(...p.map(x=>x.winRate)),
   strongest:p.toSorted((a,b)=>b.winRate-a.winRate)[0].party,
   weakest:p.toSorted((a,b)=>a.winRate-b.winRate)[0].party,
   knightIntentionallyExempt:true};
 }
 const overall=by(primary,r=>r.policy+"\u0001"+r.strategy);
 const totals=Object.entries(overall).map(([key,rr])=>{
  const [policy,strategy]=settings(key);
  return {policy,strategy,...rate(combine(rr))};
 });
 return {schema:"rogue-cards-local-validation-v1",
  plan,totalExpeditions:validation.totalExpeditions,
  primaryExpeditions:primaryTotal,validation,
  totals,partySummary,parties,nonKnightSpread:easiestNonKnight,
  seedStats,policyContrasts,seatOrder:seats,items:itemRows};
}
export function makeValidationFiles(result,rows){
 const detailRows=rows.map(r=>({
  batchSeed:r.batchSeed,policy:r.policy,strategy:r.strategy,
  party:r.party,orientation:r.orientation,n:r.n,wins:r.wins,
  winRate:r.wins/r.n,vaultRate:r.cleared/r.n,deepRate:r.deep/r.n,
  meanDamage:r.damage/r.n,meanRounds:r.rounds/r.n,
  meanHpFraction:r.hpFraction/r.n,meanActivated:r.activated/r.n,
  meanDrawn:r.drawn/r.n,meanSpent:r.spent/r.n,
  sealAttempts:r.sealAttempt,sealWins:r.sealWin,
  unresolved:r.unresolved,stalls:r.roundLimits,outOfBounds:r.outOfBounds
 }));
 const itemCSV=result.items.map(({opportunityModes,useModes,...o})=>o);
 const md=renderSummary(result);
 return {
  "summary.json":JSON.stringify(result,null,2)+"\n",
  "summary.md":md,
  "cohorts.json":JSON.stringify(rows)+"\n",
  "cohorts.csv":csv(Object.keys(detailRows[0]),detailRows),
  "hero-parties.csv":csv(
   ["policy","strategy","party","size","n","wins","winRate","vaultRate",
    "deepRate","sealAttemptRate","sealSuccessAmongAttempts","meanDamage",
    "meanRounds","meanHpFraction","meanItemsActivated","meanDrawn","meanSpent"],
    result.parties),
  "seed-stability.csv":csv(
   ["batchSeed","policy","strategy","size","n","wins","winRate",
    "vaultRate","meanDamage","meanRounds"],result.seedStats.records),
  "policy-contrasts.csv":csv(
   ["strategy","size","policy","n","baselineRate","candidateRate",
    "delta","improved","harmed"],result.policyContrasts),
  "seat-order.csv":csv(
   ["strategy","policy","party","n","canonicalWinRate","reversedWinRate",
    "delta","improved","harmed"],result.seatOrder),
  "objects.csv":csv(Object.keys(itemCSV[0]),itemCSV),
  "validation.json":JSON.stringify(result.validation,null,2)+"\n"
 };
}
export function renderSummary(r){
 const out=[
 "# Rogue Cards - Local Multi-Seed Validation","",
 "Repository revision: "+(r.plan.commit||"unknown"),
 "Node: "+r.plan.node+" | Preset: "+r.plan.preset,
 "Batch seeds: "+r.plan.seeds.join(", "),
 "Strategies: "+r.plan.strategies.join(", "),
 "Policies: "+r.plan.policies.join(", "),
 "Trials per canonical cohort / seed: "+r.plan.runs,
 "Seat reversal trials / cohort / seed: "+r.plan.seatRuns,
 "Total simulated expeditions: "+r.totalExpeditions.toLocaleString("en-US"),
 "",
 "## Mechanical validation","",
 "Hard invariant errors: "+r.validation.errors.length+
 " | Analysis warnings: "+r.validation.warnings.length,
 "",
 ...(r.validation.errors.length?r.validation.errors.map(x=>"- ERROR: "+x):["No mechanical validation errors detected."]),
 ...(r.validation.warnings.length?r.validation.warnings.map(x=>"- WARNING: "+x):[]),
 "",
 "## Important design constraint","",
 "**Knight is intentionally the beginner-friendly strong class.**",
 "The Knight's advantage is reported, never treated as a requirement to nerf.",
 "The historical 10-point spread target is evaluated for **non-Knight** Heroes",
 "as a descriptive goal, not a test assertion or CI failure.",
 "",
 "## Win rates across seed batches","",
 "| Policy | Strategy | Party size | Expeditions | Win rate (Wilson 95% CI) | Vault reached | Mean remaining HP fraction |",
 "|---|---|---|---:|---:|---:|---:|"
 ];
 for(const x of r.partySummary)out.push(
  "| "+x.policy+" | "+x.strategy+" | "+x.size+" | "+x.n+
  " | "+percent(x.winRate)+" ("+x.ci95.map(percent).join(" to ")+")"+
  " | "+percent(x.vaultRate)+" | "+percent(x.meanHpFraction)+" |");
 out.push("","## Knight compared with the other solo Heroes","",
  "| Policy | Strategy | Knight win rate | Strongest non-Knight | Weakest non-Knight | Non-Knight spread |",
  "|---|---|---:|---|---|---:|");
 for(const policy of r.plan.policies)for(const strategy of r.plan.strategies){
  const k=r.parties.find(x=>x.policy===policy&&x.strategy===strategy&&x.party==="knight");
  const p=r.nonKnightSpread[policy+"|"+strategy];
  if(k&&p)out.push("| "+policy+" | "+strategy+" | "+percent(k.winRate)+" | "+
   p.strongest+" | "+p.weakest+" | "+pp(p.spread)+" |");
 }
 out.push("","## Independent batch seed variation","",
  "| Policy | Strategy | Party size | Batch means min–max | SD between seed batches |",
  "|---|---|---|---|---:|");
 for(const x of r.seedStats.stability)
  out.push("| "+x.policy+" | "+x.strategy+" | "+x.size+
   " | "+percent(x.min)+" – "+percent(x.max)+" | "+pp(x.sd)+" |");
 out.push("","## Matched-seed strategy improvements over scripted policy","",
  "Differences compare outcomes from the **same starting seed, party and strategy**.",
  "Later random-number draws can differ once play decisions diverge.",
  "The intervals capture simulation randomness, not model misspecification.",
  "",
  "| Policy | Strategy | Party size | Difference | Paired 95% CI | Wins gained / lost |",
  "|---|---|---|---:|---:|---:|");
 for(const x of r.policyContrasts)
  out.push("| "+x.policy+" | "+x.strategy+" | "+x.size+" | "+
   pp(x.delta)+" | "+x.ci95.map(pp).join(" to ")+" | "+
   x.improved+" / "+x.harmed+" |");
 out.push("","## Hero pair ordering effects","",
  "Reversing a Hero pair also changes who receives the first Item and acts first.",
  "These comparisons are informative diagnostics, not a pure causal intervention",
  "on turn order alone.","",
  "| Pair | Policy | Strategy | Original | Reversed | Delta | 95% paired CI |",
  "|---|---|---|---:|---:|---:|---:|");
 for(const x of r.seatOrder.slice(0,12))
  out.push("| "+x.party+" | "+x.policy+" | "+x.strategy+" | "+
   percent(x.canonicalWinRate)+" | "+percent(x.reversedWinRate)+" | "+
   pp(x.delta)+" | "+x.ci95.map(pp).join(" to ")+" |");
 out.push("","## Item accessibility and observed use","",
  "Every Object is tracked; direct activations, reactive uses, and passive",
  "equipment applications are **separate**. The 15 most common",
  "Item opportunity exposures are shown below. See objects.csv for all cards.",
  "",
  "| Policy | Strategy | Item | Drawn | Legal opportunities | Uses | Passive applications |",
  "|---|---|---|---:|---:|---:|---:|");
 for(const x of [...r.items].sort((a,b)=>b.opportunities-a.opportunities).slice(0,15))
  out.push("| "+x.policy+" | "+x.strategy+" | "+x.title+" | "+
   x.draws+" | "+x.opportunities+" | "+x.uses+" | "+x.passive+" |");
 out.push("","## Failure stages for the cautious planner","",
  "| Strategy | Party size | Failure stage | Failures |",
  "|---|---|---|---:|");
 for(const [key,group] of Object.entries(by(r.partySummary.filter(x=>x.policy==="cautious"),
  x=>x.strategy+"\u0001"+x.size))){
  const [strategy,size]=settings(key),rows=r.parties.filter(x=>
   x.strategy===strategy&&x.policy==="cautious"&&x.size===size);
  const merged={};
  for(const row of rows)for(const [stage,n] of Object.entries(row.failureStages))
   merged[stage]=(merged[stage]||0)+n;
  for(const [stage,n] of Object.entries(merged).sort((a,b)=>b[1]-a[1]))
   out.push("| "+strategy+" | "+size+" | "+stage+" | "+n+" |");
 }
 out.push("","## Reading these results","",
  "- Differences in wins across seed batches indicate sampling variability; they do not automatically imply a simulator bug.",
  "- Many paired comparisons, cards, Hero pairs and strategies are explored: confidence intervals are unadjusted for multiplicity.",
  "- Only 1–2 Hero parties are modeled. Two Heroes get more actions and their performance need not match solo balance.",
  "- The agent is scripted and not a human player; displayed win rates are not human win probabilities.",
  "- Simulated use of a Potion/Wand can differ from what a skilled human would choose.",
  "- Some reactive Item uses can lack a matching opportunity audit event; those are flagged in validation.",
  "- No Hero or Item statistics are changed by running this validator.",
  "",
  "## Result files","",
  "- summary.json: comprehensive aggregated metrics and uncertainty bounds",
  "- cohorts.json: each cohort and its packed per-seed win outcomes",
  "- cohorts.csv: each policy × party × strategy × batch seed",
  "- hero-parties.csv: every party / policy / strategy aggregate",
  "- objects.csv: complete per-card draw, trigger, use, passive and effect totals",
  "- seed-stability.csv: batch-to-batch stability checks",
  "- policy-contrasts.csv: matched-seed comparisons against scripted policy",
  "- seat-order.csv: reversal experiments by pair and policy",
  "- validation.json: hard failures and nonblocking warnings",
  "- tests.log: full contract/unit-test output unless --skip-tests was given",
  "");
 return out.join("\n")+"\n";
}
