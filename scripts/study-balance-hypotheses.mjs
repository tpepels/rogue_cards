#!/usr/bin/env node
/**
 * Multi-hypothesis physical-card balance screening and held-out confirmation.
 * One canonical baseline per Hero/seed, never a separately retuned agent.
 * Experimental rooms and card stats run through exactly the real rules.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {readFileSync,existsSync,mkdirSync,writeFileSync,appendFileSync,renameSync}
 from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {HEROES} from "../src/tabletop-data.js";
import {compileStaging,canonicalStagingCatalogue}
 from "../src/staging/catalogue.js";
import {balanceHypotheses} from "../src/staging/balance-hypotheses.js";
import {nextEncounterHypotheses,independentWardenHypotheses}
 from "../src/staging/next-balance-hypotheses.js";
import {mechanicalPrototypes,mechanicalFamily}
 from "../src/staging/mechanical-prototypes.js";
import {monsterHpRatioHypotheses,monsterHpRatioFamily}
 from "../src/staging/monster-hp-ratio-hypotheses.js";
import {monsterStatFactorialHypotheses,statFactorialCell,
 chooseStatFactorialFinalists}
 from "../src/staging/monster-stat-factorial-hypotheses.js";
import {statFactorialAnalysis}
 from "../src/staging/monster-stat-factorial-analysis.js";
import {roomRatioHypotheses}
 from "../src/staging/room-ratio-hypotheses.js";
import {postCombatHealingHypotheses}
 from "../src/staging/combat-healing-hypotheses.js";
import {printedRecoveryHypotheses}
 from "../src/staging/printed-recovery-hypotheses.js";
import {recoveryOvernightHypotheses,RECOVERY_OVERNIGHT_REFERENCE_ID}
 from "../src/staging/recovery-overnight-hypotheses.js";
import {BALANCED_ROOMS} from "../src/room-balance.js";
import {deckComposition,stageSeed,compareStaging}
 from "./study-card-staging.mjs";
import {playFullSoloExpedition} from "./study-solo-expedition-balance.mjs";

const AGENT_PATH="experiments/agents/solo-balance-reference-v1.json";
const sha=x=>createHash("sha256").update(typeof x==="string"?x:
 JSON.stringify(x)).digest("hex");
const revision=()=>execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
const atomic=(path,data)=>{
 const tmp=path+".tmp";
 writeFileSync(tmp,JSON.stringify(data,null,2)+"\n");renameSync(tmp,path);
};
const avg=(rows,key)=>rows.length?
 rows.reduce((n,row)=>n+(row[key]??0),0)/rows.length:null;
const jobKey=x=>[x.phase,x.variant,x.hero,x.replicate].join("|");
const METRICS=["won","vaultReached","roomsCleared","ordinaryEncounters",
 "ordinaryFights","combatContextDamage","remainingHp","itemsUsed",
 "damage","hasAll36","vaultEntryHp","vaultEntryPlayable",
 "corridorVisits","ordinaryRoomVisits",
 "postCombatHealTriggers","postCombatHealRestored","postCombatHealWasted"];
export function balanceStudyArgs(argv){
 const opts={},allowed=new Set(["--out","--seed","--workers","--minutes",
  "--screen-repeats","--confirm-repeats","--finalists","--heroes",
  "--variant-limit","--agent","--smoke","--suite"]);
 const dryRun=argv.includes("--dry-run");
 argv=argv.filter(x=>x!=="--dry-run");
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!allowed.has(key)||value===undefined||Object.hasOwn(opts,key))
   throw Error("Invalid balance-study option "+key);
  opts[key]=value;
 }
 const num=(key,def,lo,hi)=>{
  const n=Number(opts[key]??def);
  if(!Number.isSafeInteger(n)||n<lo||n>hi)
   throw Error("Invalid "+key+" (expected integer "+lo+".."+hi+")");
  return n;
 };
 const choices=HEROES.map(x=>x.id);
 const heroes=(opts["--heroes"]??choices.join(",")).split(",");
 if(!heroes.length||heroes.some(h=>!choices.includes(h))||
  new Set(heroes).size!==heroes.length)
  throw Error("Invalid unique comma-separated --heroes");
 const smoke=opts["--smoke"]==="true";
 if(opts["--smoke"]!==undefined&&!["true","false"].includes(opts["--smoke"]))
  throw Error("--smoke requires true or false");
 const screenRepeats=num("--screen-repeats",smoke?1:4,1,500);
 const confirmRepeats=num("--confirm-repeats",smoke?1:6,1,500);
 const seed=num("--seed",20261215,1,0xffffffff);
 const suite=opts["--suite"]??"original";
 if(!["original","encounters","warden","mechanics","hp-ratios",
  "stat-factorial","room-ratios","combat-healing","printed-recovery",
   "recovery-overnight"].includes(suite))
  throw Error("--suite must be original, encounters, warden, mechanics, "+
   "hp-ratios, stat-factorial, room-ratios, combat-healing, printed-recovery or recovery-overnight");
 return {heroes,seed,suite,smoke,screenRepeats,confirmRepeats,dryRun,
  workers:num("--workers",8,1,32),minutes:num("--minutes",120,1,720),
  finalists:num("--finalists",smoke?1:suite==="room-ratios"?3:4,1,12),
  variantLimit:num("--variant-limit",smoke?2:99,1,99),
  out:resolve(opts["--out"]??"results/balance-assumptions-v1"),
  agentPath:resolve(opts["--agent"]??AGENT_PATH)};
}
function seedFor(config,phase,hero,replicate){
 const base=phase==="screen"?config.seed:(config.seed^0xa36f927b)>>>0;
 return stageSeed(base,HEROES.findIndex(h=>h.id===hero),replicate);
}
const lite=row=>Object.fromEntries(METRICS.map(k=>[k,row[k]??null]));
const healSummary=rows=>{
 const zero=()=>({attempts:0,offered:0,restored:0,wasted:0});
 const aggregate={total:zero(),bySource:{},byCategory:{},byStage:{}};
 const merge=(dest,src)=>{
  for(const key of ["attempts","offered","restored","wasted"])
   dest[key]+=src?.[key]??0;
 };
 const opportunityMaps={roomOptions:{},itemOpportunities:{}};
 const healingItemIds=["ex-bandages","ex-rations","odd-thorn-tonic"];
 const itemStats=Object.fromEntries(healingItemIds.map(id=>
  [id,{acquired:0,uses:0,optionEvents:0,offered:0,restored:0,wasted:0}]));
 for(const row of rows){
  const healing=row.finalMetrics?.healing??{};
  merge(aggregate.total,healing.total);
  for(const id of healingItemIds){
   const cell=itemStats[id];
   cell.acquired+=row.finalMetrics?.objectAcquisitions?.[id]??0;
   cell.uses+=row.finalMetrics?.itemUses?.[id]?.total??0;
   cell.optionEvents+=row.finalMetrics?.itemOpportunities?.[id]?.total??0;
   for(const metric of ["offered","restored","wasted"])
    cell[metric]+=healing.bySource?.["item:"+id]?.[metric]??0;
  }
  for(const group of ["bySource","byCategory","byStage"])
   for(const [id,cell] of Object.entries(healing[group]??{}))
    merge(aggregate[group][id]??=zero(),cell);
  for(const [field,metricKey] of [["roomOptions","roomOptionAvailable"],
   ["itemOpportunities","itemOpportunities"]]){
   for(const [id,cell] of Object.entries(row.finalMetrics?.[metricKey]??{})){
    if(typeof cell==="number")
     opportunityMaps[field][id]=(opportunityMaps[field][id]??0)+cell;
    else if(cell&&typeof cell==="object"){
     const dst=opportunityMaps[field][id]??={};
     for(const [kind,n] of Object.entries(cell))
      if(typeof n==="number")dst[kind]=(dst[kind]??0)+n;
    }
   }
  }
 }
 return {mean:Object.fromEntries(["attempts","offered","restored","wasted"]
  .map(key=>[key,rows.length?aggregate.total[key]/rows.length:null])),
  totals:aggregate,opportunities:opportunityMaps,itemStats};
};
const health=(rows)=>{
 const n=rows.length;
 const rooms=rows.reduce((sum,row)=>sum+row.roomsCleared,0);
 const encounters=rows.reduce((sum,row)=>sum+row.ordinaryEncounters,0);
 const battles=rows.reduce((sum,row)=>sum+row.ordinaryFights,0);
 const full=rows.filter(r=>r.hasAll36===1);
 const vault=rows.filter(r=>r.vaultReached===1);
 const warden=rows.filter(r=>(r.finalMetrics?.monsterVisits?.warden??0)>0);
 const mechanicTotals={};
 const mechanismSuccess={};
 for(const row of rows){
  for(const [kind,count] of Object.entries(row.finalMetrics?.mechanicChoices??{}))
   mechanicTotals[kind]=(mechanicTotals[kind]??0)+count;
  for(const [kind,count] of Object.entries(row.finalMetrics?.mechanicSuccesses??{}))
   mechanismSuccess[kind]=(mechanismSuccess[kind]??0)+count;
 }
 const fury=rows.filter(r=>(r.finalMetrics?.monsterVisits?.["warden-fury"]??0)>0);
 const wins=x=>x.filter(r=>r.won===1).length;
 return {n,mean:Object.fromEntries(METRICS.map(k=>[k,avg(rows,k)])),
   healing:healSummary(rows),
  encounterPerRoom:rooms?encounters/rooms:null,
  encountersPer36Equivalent:rooms?36*encounters/rooms:null,
  fightConversion:encounters?battles/encounters:null,
  winGivenVault:vault.length?wins(vault)/vault.length:null,
  mechanicTotals,mechanicSuccesses:mechanismSuccess,
  patrolEncounters:rows.reduce((n,r)=>n+(r.finalMetrics?.patrolEncounters??0),0),
  meanMechanicDecisions:n?Object.values(mechanicTotals).reduce((a,b)=>a+b,0)/n:0,
  wardenEngagement:{n:warden.length,winRate:warden.length?
   wins(warden)/warden.length:null,furyEntered:fury.length,
   deaths:warden.filter(r=>r.won!==1).length},
  endingCauses:Object.fromEntries([...new Set(rows.map(r=>r.wipeCause).
   filter(Boolean))].map(reason=>[reason,rows.filter(r=>r.wipeCause===reason).length])),
  complete36:{n:full.length,meanEncounters:avg(full,"ordinaryEncounters"),
   meanFights:avg(full,"ordinaryFights")},
  vaultEntry:{n:vault.length,meanHp:avg(vault.filter(x=>
   x.vaultEntryHp!==null),"vaultEntryHp"),
   playable:vault.filter(x=>x.vaultEntryPlayable===1).length},
  byHero:Object.fromEntries([...new Set(rows.map(x=>x.hero))].map(hero=>[
   hero,healthShallow(rows.filter(r=>r.hero===hero))]))};
};
const healthShallow=rows=>{
 const choices={},successes={};
 for(const row of rows){
  for(const [kind,n] of Object.entries(row.finalMetrics?.mechanicChoices??{}))
   choices[kind]=(choices[kind]??0)+n;
  for(const [kind,n] of Object.entries(row.finalMetrics?.mechanicSuccesses??{}))
   successes[kind]=(successes[kind]??0)+n;
 }
 return {n:rows.length,
  winRate:avg(rows,"won"),vaultReach:avg(rows,"vaultReached"),
  rooms:avg(rows,"roomsCleared"),encounters:avg(rows,"ordinaryEncounters"),
  fights:avg(rows,"ordinaryFights"),hp:avg(rows,"remainingHp"),
  healing:healSummary(rows).mean,
  patrolEncounters:rows.reduce((n,r)=>n+(r.finalMetrics?.patrolEncounters??0),0),
  mechanicChoices:choices,mechanicSuccesses:successes};
};
const evalScore=(baseline,cell,suite="original")=>{
 if(suite==="recovery-overnight"){
  if(!cell.n)return -Infinity;
  return -3*Math.abs((cell.mean.won??0)-.367)
   -2*Math.abs((cell.mean.vaultReached??0)-.609)
   -Math.abs((cell.winGivenVault??0)-.603)
   -.1*Math.abs((cell.encountersPer36Equivalent??0)-18)/18;
 }
 if(suite==="combat-healing"){
  if(!cell.n||!baseline.n)return -Infinity;
  const winGap=Math.abs((cell.mean.won??0)-.40);
  const vaultGap=Math.abs((cell.mean.vaultReached??0)-.50);
  const densityGap=Math.abs((cell.encountersPer36Equivalent??0)-18)/18;
  const wasted=cell.mean.postCombatHealWasted??0;
  // Penalize extra healing only mildly, to prefer the smallest dose
  // which meets the survival target without losing B's encounter density.
  return -3*winGap-.8*vaultGap-.2*densityGap-.003*wasted;
 }
 if(["hp-ratios","stat-factorial","room-ratios"].includes(suite)){
  if(!cell.n||!baseline.n)return -Infinity;
  // Screen for balance tradeoffs, never statistical proof:
  // wins near 40%, Vault near 50%, 55-70% fights/encounter
  // and 16-20 encounters per 36 Rooms. Holdout uses new seeds.
  const win=Math.abs((cell.mean.won??0)-0.40);
  const vault=Math.abs((cell.mean.vaultReached??0)-0.50);
  const density=Math.abs((cell.encountersPer36Equivalent??0)-18)/18;
  const conversion=cell.fightConversion??0;
  const conversionGap=conversion<.55?.55-conversion:
   conversion>.70?conversion-.70:0;
  const roomDrop=Math.max(0,(baseline.mean.roomsCleared??0)-
   (cell.mean.roomsCleared??0))/36;
  return -2*win-1.2*vault-0.7*density-0.5*conversionGap-roomDrop;
 }
 if(suite==="mechanics"){
  if(!cell.n||!baseline.n)return -Infinity;
  // Seek encounter density AND genuinely chosen alternative actions;
  // penalize attrition separately. Always confirm on fresh seeds.
  const density=cell.encounterPerRoom??0;
  const meaningful=Math.min(2,cell.meanMechanicDecisions)/2;
  const winDrop=Math.max(0,baseline.mean.won-cell.mean.won);
  const vaultDrop=Math.max(0,baseline.mean.vaultReached-cell.mean.vaultReached);
  const roomDrop=Math.max(0,baseline.mean.roomsCleared-cell.mean.roomsCleared)/36;
  return -2*Math.abs(density-0.5)+0.25*meaningful-
    1.75*winDrop-1.25*vaultDrop-roomDrop;
 }
 if(suite==="warden"){
  if(!cell.n||!baseline.n)return -Infinity;
  // Full expeditions: changing Warden-only stats should improve finish
  // probability while preserving travel, normal combat and exploration.
  // This is a screening tie-breaker, not a substitute for paired holdout.
  const preVault=Math.abs((cell.mean.vaultReached??0)-
   (baseline.mean.vaultReached??0))+
   Math.abs((cell.mean.roomsCleared??0)-
    (baseline.mean.roomsCleared??0))/36+
   Math.abs((cell.mean.ordinaryEncounters??0)-
    (baseline.mean.ordinaryEncounters??0))/20;
  return (cell.mean.won??0)*5+
   (cell.winGivenVault??0)*1-preVault;
 }

 // Screens a *card-design hypothesis*, not an AI policy.
 // Density target 16-20 / 36 Rooms. Attrition, wins and exploration
 // penalize any putative gains achieved by wiping parties early.
 const target=.5;
 if(!cell.n||!baseline.n)return -Infinity;
 const density=cell.encounterPerRoom??0;
 const score=-Math.abs(density-target)*2;
 const roomDrop=Math.max(0,baseline.mean.roomsCleared-cell.mean.roomsCleared)/36;
 const winDrop=Math.max(0,baseline.mean.won-cell.mean.won);
 const vaultDrop=Math.max(0,baseline.mean.vaultReached-cell.mean.vaultReached);
 const damageGrowth=Math.max(0,cell.mean.combatContextDamage-
  baseline.mean.combatContextDamage)/Math.max(1,baseline.mean.combatContextDamage);
 return score-2*roomDrop-1.4*winDrop-vaultDrop-0.25*damageGrowth;
};
export function phaseSummary(records,phase,manifest,selected){
 const rows=records.filter(x=>x.phase===phase);
 const base=rows.filter(x=>x.variant==="canonical");
 const baseline=health(base);
 const output=[];
 for(const spec of selected){
  const group=rows.filter(x=>x.variant===spec.id);
  const measurable=health(group);
  const map=new Map(base.map(r=>[r.hero+"|"+r.replicate,r]));
  const paired=group.filter(r=>map.has(r.hero+"|"+r.replicate));
  const report=compareStaging(
   [...paired.map(r=>({...map.get(r.hero+"|"+r.replicate),arm:"canonical"})),
    ...paired.map(r=>({...r,arm:"staging"}))],
   {revision:manifest.revision,stageId:spec.id,
    stageSha256:sha(spec),agentSha256:manifest.agentSha256,
    heroes:manifest.heroes,runsPerHero:phase==="screen"?
     manifest.screenRepeats:manifest.confirmRepeats,
    deckComposition:{canonical:manifest.canonicalDeck,
     staging:manifest.stagedDecks[spec.id]},
    experimentChanges:{cards:spec.cards??[],mechanics:spec.mechanics??{},
     roomEffects:spec.roomEffects??{},roomDeck:spec.roomDeck??{},
     monsterHealing:spec.monsterHealing??{},
     roomRestHealing:spec.roomRestHealing??{},
     itemHealing:spec.itemHealing??{}}});
  output.push({id:spec.id,description:spec.description,
   score:evalScore(baseline,measurable,manifest.suite),
   family:manifest.suite==="mechanics"?mechanicalFamily(spec.id):
    manifest.suite==="hp-ratios"?monsterHpRatioFamily(spec.id):
    manifest.suite==="stat-factorial"?statFactorialCell(spec.id).context:null,
   measured:measurable,
   paired:paired.length,pairedDeltas:report.pairedDelta,
   byHero:report.byHero,changedCards:report.changedCards,
   byCard:report.byCard,deckComposition:report.deckComposition});
 }
 output.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const required=manifest.heroes.length*(phase==="screen"?
  manifest.screenRepeats:manifest.confirmRepeats);
 return {phase,expectedPerVariant:required,completedCanonical:base.length,
  completedCandidates:Object.fromEntries(output.map(x=>[x.id,x.measured.n])),
  complete:base.length===required&&output.every(x=>x.measured.n===required),
  baseline,ranked:output};
}
const scorePreview=phase=>phase.ranked.map(x=>({id:x.id,score:x.score,
 runs:x.measured.n,encountersPer36:x.measured.encountersPer36Equivalent,
 wins:x.measured.mean.won,vault:x.measured.mean.vaultReached,
 rooms:x.measured.mean.roomsCleared}));
function markdown(result){
 const num=(n,nDigits=2)=>n==null?"—":n.toFixed(nDigits);
 const lines=["# Rogue Cards — staged design-hypothesis study","",
  "Code revision: `"+result.revision+"` · Frozen agent: `"+
  result.agentId+"`","",
  "Status: "+result.status+" · canonical printed cards unchanged.","",
  "Primary question: can physical card/deck changes produce "+
  "16–20 encounters in 36 Rooms without collapsing survival and choice?",""];
 for(const phase of [result.screen,result.confirm].filter(Boolean)){
  lines.push("## "+phase.phase+" ("+(phase.complete?"complete":"partial")+")","",
   result.suite==="warden"?
    "Warden-only: all regional Room and ordinary Monster cards are unchanged.":
    result.suite==="mechanics"?
    "32 structural rule prototypes; all interventions use the canonical state machine.":
    result.suite==="stat-factorial"?
    "Full factorial: 4 HP levels (original, 3/4, 2/3, 1/2) x "+
    "3 ATK levels (original, -1, -2) x 3 encounter contexts. "+
    "All changes are existing card stats and printed Room effects; "+
    "Warden unchanged.":
    result.suite==="recovery-overnight"?
    "Existing printed healing rewards, paid REST and Items tested alone "+
    "and together with Balanced B Rooms and unchanged Monster stats. "+
    "Plus-five remains non-printable diagnostic only.":
    result.suite==="combat-healing"?
    "Controlled post-combat healing on canonical Balanced B: 0 HP baseline "+
    "versus +1..+10 HP after a won regional fight. No grant for parley, "+
    "retreat, banishment or Warden. All printed rewards unchanged.":
    result.suite==="room-ratios"?
    "Room ratios: three staged decks, each with 16 "+
    "non-Corridor Room copies per depth, 1–3 Corridors per depth, "+
    "and eight shared support Rooms. Printed effects and all stats unchanged.":
    result.suite==="hp-ratios"?
    "Integer HP rounded up: 1/2, 2/3 and 3/4 of each ordinary Monster. "+
    "Each ratio tested with canonical/mild/strong existing Room encounters. "+
    "No new mechanics, Warden unchanged.":
    "Encounter suite: escape/toll/reward choices use existing physical mechanics.","",
   "Control runs: "+phase.completedCanonical+"/"+phase.expectedPerVariant,"",
   "| Hypothesis | runs | encounter/36 equiv. | fight fraction | corridors/run | wins | Vault | Rooms | 36-Room encounters |",
   "|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for(const r of phase.ranked)
   lines.push("| "+r.id+" | "+r.measured.n+" | "+
    num(r.measured.encountersPer36Equivalent)+" | "+
    num(r.measured.fightConversion,3)+" | "+
    num(r.measured.mean.corridorVisits)+" | "+
    num(r.measured.mean.won,3)+" | "+
    num(r.measured.mean.vaultReached,3)+" | "+
    num(r.measured.mean.roomsCleared)+" | "+
    num(r.measured.complete36.meanEncounters)+" (n="+
    r.measured.complete36.n+") |");
  if(result.suite==="recovery-overnight"){
   lines.push("","### Measured HP recovery (including wasted HP)","",
    "| Variant | Wins | Vault | Win given Vault | Healing events | HP offered | HP restored | HP wasted |",
    "|---|---:|---:|---:|---:|---:|---:|---:|");
   for(const row of [{id:"canonical",measured:phase.baseline},...phase.ranked])
    lines.push("| "+row.id+" | "+num(row.measured.mean.won,3)+" | "+
     num(row.measured.mean.vaultReached,3)+" | "+
     num(row.measured.winGivenVault,3)+" | "+
     num(row.measured.healing.mean.attempts)+" | "+
     num(row.measured.healing.mean.offered)+" | "+
     num(row.measured.healing.mean.restored)+" | "+
     num(row.measured.healing.mean.wasted)+" |");
   lines.push("","### Individual Item contribution per expedition","",
    "| Variant | Bandages restored | Rations restored | Thorn Tonic restored | Bandages used | Rations used | Tonic used |",
    "|---|---:|---:|---:|---:|---:|---:|");
   for(const row of [{id:"canonical",measured:phase.baseline},...phase.ranked]){
    const stats=row.measured.healing.itemStats,n=row.measured.n||1;
    const ids=["ex-bandages","ex-rations","odd-thorn-tonic"];
    lines.push("| "+row.id+" | "+
     ids.map(id=>num(stats[id].restored/n)).join(" | ")+" | "+
     ids.map(id=>num(stats[id].uses/n)).join(" | ")+" |");
   }
   lines.push("","Full HP source, stage, cap-waste and availability figures "+
    "appear in summary.json (healing.totals and healing.itemStats). "+
    "Item optionEvents count observations, not unique decisions.");
  }
  if(result.suite==="combat-healing"){
   lines.push("","### Effective healing per expedition","",
    "| Intervention | Wins | Vault | Encounters/36 | Fights | HP actually restored | HP wasted at cap | Triggers |",
    "|---|---:|---:|---:|---:|---:|---:|---:|");
   for(const row of [{id:"0 HP (canonical B)",measured:phase.baseline},
    ...phase.ranked])lines.push("| "+row.id+" | "+
     num(row.measured.mean.won,3)+" | "+
     num(row.measured.mean.vaultReached,3)+" | "+
     num(row.measured.encountersPer36Equivalent)+" | "+
     num(row.measured.mean.ordinaryFights)+" | "+
     num(row.measured.mean.postCombatHealRestored)+" | "+
     num(row.measured.mean.postCombatHealWasted)+" | "+
     num(row.measured.mean.postCombatHealTriggers)+" |");
  }
  if(result.suite==="mechanics"){
   lines.push("","### Mechanic choice and consequence audit","",
    "| Prototype | Family | Patrol encounters | Chosen alternative actions/run | Successes by action |",
    "|---|---|---:|---:|---|");
   for(const item of phase.ranked)
    lines.push("| "+item.id+" | "+item.family+" | "+
     item.measured.patrolEncounters+" | "+
     num(item.measured.meanMechanicDecisions)+" | "+
     Object.entries(item.measured.mechanicSuccesses).map(([k,v])=>
      k+"="+v).join("; ")+" |");
  }
  if(result.suite==="stat-factorial"){
   lines.push("","### HP × ATK factorial grid","",
    "Rows are ratio and ATK changes in each encounter context; "+
    "paired contrasts and interactions are available in summary.json.",
    "| Context | Monster HP | ATK | n | Wins | Vault | Fights | Combat damage |",
    "|---|---|---:|---:|---:|---:|---:|---:|");
   const factorial=phase.factorial;
   for(const [context,group] of Object.entries(factorial?.contexts??{}))
    for(const cell of group.grid)
     lines.push("| "+context+" | "+cell.hp+" | -"+cell.atk+" | "+
      cell.n+" | "+num(cell.won,3)+" | "+num(cell.vaultReached,3)+
      " | "+num(cell.ordinaryFights)+" | "+
      num(cell.combatContextDamage)+" |");
   lines.push("","### Matched HP × ATK interaction (difference in differences)","",
    "| Context | HP | ATK | matched n | win interaction | Vault interaction |",
    "|---|---|---:|---:|---:|---:|");
   for(const [context,group] of Object.entries(factorial?.contexts??{}))
    for(const entry of group.interactions)
     lines.push("| "+context+" | "+entry.hp+" | -"+entry.atk+
      " | "+entry.n+" | "+num(entry.differences.won,3)+" | "+
      num(entry.differences.vaultReached,3)+" |");
  }
  if(result.suite==="hp-ratios"){
   lines.push("","### HP trade-offs (including ordinary fight conversion)","",
    "| Variant | Context | Fight conversion | Average fights | Average incoming combat damage | Wins given Vault |",
    "|---|---|---:|---:|---:|---:|");
   for(const item of phase.ranked)
    lines.push("| "+item.id+" | "+item.family+" | "+
     num(item.measured.fightConversion,3)+" | "+
     num(item.measured.mean.ordinaryFights)+" | "+
     num(item.measured.mean.combatContextDamage)+" | "+
     num(item.measured.winGivenVault,3)+" |");
  }
  if(result.suite==="warden"){
   lines.push("","### Independent Warden comparison","",
    "| Variant | Wins given Vault | Wins given actual Warden fight | Fury entered |",
    "|---|---:|---:|---:|");
   lines.push("| canonical | "+num(phase.baseline.winGivenVault,3)+" | "+
    num(phase.baseline.wardenEngagement.winRate,3)+" | "+
    phase.baseline.wardenEngagement.furyEntered+" |");
   for(const r of phase.ranked)
    lines.push("| "+r.id+" | "+num(r.measured.winGivenVault,3)+
     " | "+num(r.measured.wardenEngagement.winRate,3)+
     " | "+r.measured.wardenEngagement.furyEntered+" |");
  }
  lines.push("","Canonical: "+num(phase.baseline.encountersPer36Equivalent)+
   " encounters/36 equivalent; "+num(phase.baseline.mean.won,3)+
   " wins; "+num(phase.baseline.mean.roomsCleared)+" Rooms.","");
 }
 lines.push("## Interpretation","",
 "- Screening scores combine proximity to encounter-density target with "+
 "survival/damage penalties; this is a design-ranking aid, not a proof of quality.",
 "- Encounters per 36 *equivalent* normalize by Rooms survived; they "+
 "are not observed 36-Room runs. Use the complete36 column separately.",
 "- A staged Room opcode is a tested hypothetical rules rewrite, not "+
 "current printable card text.",
 "- Room-ratio variants can reuse printed Rooms as hypothetical extra copies, "+
 "without changing any Room rules.",
 "- Seed matching does not guarantee identical dice after paths diverge.",
 "- Runs are model-player estimates, not actual human play duration or enjoyment.",
 "- Card exposures and per-Hero effects are in summary.json/trials.ndjson.",
 "- The +N post-combat healing doses are numerical experiments only; "+
 "we will design tangible Items and rewards after measuring the required dose.",
 "- Do not promote experimental changes into canonical until human playtesting.");
 return lines.join("\n")+"\n";
}
async function main(){
 const opts=balanceStudyArgs(process.argv.slice(2));
 const hypotheses=(opts.suite==="warden"?independentWardenHypotheses():
  opts.suite==="encounters"?nextEncounterHypotheses():
  opts.suite==="mechanics"?mechanicalPrototypes():
  opts.suite==="hp-ratios"?monsterHpRatioHypotheses():
  opts.suite==="stat-factorial"?monsterStatFactorialHypotheses():
  opts.suite==="room-ratios"?roomRatioHypotheses():
  opts.suite==="combat-healing"?postCombatHealingHypotheses():
  opts.suite==="printed-recovery"?printedRecoveryHypotheses():
  opts.suite==="recovery-overnight"?recoveryOvernightHypotheses():
  balanceHypotheses()).slice(0,opts.variantLimit);
 if(opts.finalists>hypotheses.length)
  throw Error("--finalists cannot exceed --variant-limit");
 const agentSource=readFileSync(opts.agentPath,"utf8"),agent=JSON.parse(agentSource);
 if(agent.schema!=="rogue-cards-solo-agent-profile-v1"||
  agent.status!=="frozen-for-staging-comparisons"||
  agent.policy?.arm!=="implicit"||
  agent.policy.mctsPragmaticVariant!=="tree-only"||
  agent.policy.equipmentMode!=="solo-pragmatic"||
  agent.policy.heuristicMode!=="solo-threat")
  throw Error("Study requires the frozen solo implicit/tree-only agent");
 const stagedDecks=Object.fromEntries(hypotheses.map(x=>[
  x.id,deckComposition(compileStaging(x))]));
 const manifest={schema:"rogue-cards-hypothesis-study-v1",
  ...(opts.suite==="original"?{}:{suite:opts.suite}),
  revision:revision(),agentId:agent.id,agentSha256:sha(agentSource),
  hypotheses:hypotheses.map(spec=>({id:spec.id,hash:sha(spec)})),
  canonicalDeck:deckComposition(["combat-healing","printed-recovery",
   "recovery-overnight"].includes(opts.suite)?
   {...canonicalStagingCatalogue(),rooms:BALANCED_ROOMS}:
   canonicalStagingCatalogue()),
  stagedDecks,heroes:opts.heroes,seed:opts.seed,
  screenRepeats:opts.screenRepeats,confirmRepeats:opts.confirmRepeats,
  finalists:opts.finalists,smoke:opts.smoke};
 if(opts.dryRun){
  console.log(JSON.stringify({schema:manifest.schema,revision:manifest.revision,
   agent:agent.id,suite:opts.suite,
   hypotheses:manifest.hypotheses.map(h=>h.id),
   heroes:opts.heroes,screenTrials:(hypotheses.length+1)*opts.heroes.length*
    opts.screenRepeats,confirmTrials:(opts.finalists+1)*
    opts.heroes.length*opts.confirmRepeats,
   physicallyCanonicalCardsChanged:false,
   ...(opts.suite==="room-ratios"?{deckRatios:stagedDecks}:{})},null,2));
  return;
 }
 mkdirSync(opts.out,{recursive:true});
 const manifestPath=join(opts.out,"manifest.json");
 if(existsSync(manifestPath)){
  const saved=JSON.parse(readFileSync(manifestPath,"utf8"));
  if(JSON.stringify(manifest)!==JSON.stringify(saved))
   throw Error("Incompatible study resume. Never mix changed rules, "+
    "different seeds or agent profiles in one results directory.");
 }else atomic(manifestPath,manifest);
 const trialsPath=join(opts.out,"trials.ndjson");
 const rows=existsSync(trialsPath)?readFileSync(trialsPath,"utf8")
  .split("\n").filter(Boolean).map(JSON.parse):[];
 const seen=new Set();
 for(const r of rows){
  if(seen.has(jobKey(r)))throw Error("Duplicate saved multi-hypothesis trial");
  seen.add(jobKey(r));
 }
 let phase="screen",active=0,stopped=false,pending=[],finalists=null;
 const makeJobs=(phase,selected,n)=>{
  const jobs=[];
  for(let repeat=0;repeat<n;repeat++)
   for(const hero of opts.heroes)
    for(const variant of ["canonical",...selected.map(s=>s.id)]){
     const job={phase,variant,hero,replicate:repeat,
      seed:seedFor(opts,phase,hero,repeat)};
     if(!seen.has(jobKey(job)))jobs.push(job);
    }
  return jobs;
 };
 const choose=()=>{
  const screen=phaseSummary(rows,"screen",manifest,hypotheses);
  // Rank ONLY on the complete screening split. Mechanic suite holds
  // out at least one concept from every tested family when slots allow.
  const chosen=[];
  if(opts.suite==="recovery-overnight"){
   // Pre-register a representative finalist in every physical intervention
   // family and reserve a slot for the non-printable reference.
   const selected=hypotheses.some(x=>x.id===RECOVERY_OVERNIGHT_REFERENCE_ID)?
    [RECOVERY_OVERNIGHT_REFERENCE_ID]:[];
   const families=["recovery-supply-","recovery-rest-",
    "recovery-defeat-","recovery-supply-defeat-",
    "recovery-hybrid-",
    "recovery-item-values-","recovery-item-quantity-",
    "recovery-item-value-rest-","recovery-item-value-defeat-",
    "recovery-item-value-hybrid-"];
   for(const prefix of families){
    const winner=screen.ranked.find(x=>x.id.startsWith(prefix));
    if(winner&&!selected.includes(winner.id))selected.push(winner.id);
   }
   for(const row of screen.ranked){
    if(selected.length>=opts.finalists)break;
    if(!selected.includes(row.id))selected.push(row.id);
   }
   return selected.slice(0,opts.finalists)
    .map(id=>hypotheses.find(x=>x.id===id));
  }
  if(opts.suite==="combat-healing"){
   // The quantity sought is the *smallest* healing dose reaching 40%.
   // Confirm its adjacent doses rather than selecting four possibly
   // disconnected arms because of noisy screening rank positions.
   const ordered=hypotheses.slice().sort((a,b)=>
    a.mechanics.postCombatHeal-b.mechanics.postCombatHeal);
   const crossing=ordered.findIndex(spec=>
    (screen.ranked.find(x=>x.id===spec.id)?.measured.mean.won??0)>=.40);
   const center=crossing>=0?crossing:ordered.length-1;
   const pick=[center-1,center,center+1,center+2,center-2,
    center+3,center-3,center+4];
   const ids=[...new Set(pick.filter(i=>i>=0&&i<ordered.length))];
   return ids.slice(0,opts.finalists).map(i=>ordered[i]);
  }
  if(opts.suite==="stat-factorial")
   return chooseStatFactorialFinalists(screen.ranked,opts.finalists,hypotheses)
    .map(r=>hypotheses.find(h=>h.id===r.id));
  if(opts.suite==="hp-ratios"){
   // Independently confirm ALL three isolated HP ratios first,
   // irrespective of the encounter-context screening rankings.
   for(const spec of hypotheses.filter(x=>
    monsterHpRatioFamily(x.id)==="canonical")){
    if(chosen.length>=opts.finalists)break;
    const row=screen.ranked.find(x=>x.id===spec.id);
    if(row)chosen.push(row);
   }
  }
  if(opts.suite==="mechanics"){
   const families=[...new Set(screen.ranked.map(x=>x.family))];
   for(const family of families){
    if(chosen.length>=opts.finalists)break;
    const head=screen.ranked.find(r=>r.family===family);
    if(head)chosen.push(head);
   }
  }
  for(const row of screen.ranked){
   if(chosen.length>=opts.finalists)break;
   if(!chosen.some(x=>x.id===row.id))chosen.push(row);
  }
  return chosen.map(r=>hypotheses.find(h=>h.id===r.id));
 };
 const completeScreen=phaseSummary(rows,"screen",manifest,hypotheses).complete;
 if(completeScreen){
  finalists=choose();
  phase="confirm";
  pending=makeJobs("confirm",finalists,opts.confirmRepeats);
 }else pending=makeJobs("screen",hypotheses,opts.screenRepeats);
 const deadline=Date.now()+opts.minutes*60000,workers=[];
 let heartbeat=null,timeout=null;
 const write=()=>{
  const screen=phaseSummary(rows,"screen",manifest,hypotheses);
  const confirm=finalists?phaseSummary(rows,"confirm",manifest,finalists):null;
  const status=confirm?.complete?"complete":
   screen.complete?"confirm-incomplete":"screen-incomplete";
  const result={schema:"rogue-cards-hypothesis-report-v1",
   suite:opts.suite,
   revision:manifest.revision,agentId:agent.id,status,
   selectedForConfirmation:finalists?.map(x=>x.id)??[],
   screeningScoreWarning:"Exploratory multi-arm ranking. Independent "+
    "confirmation uses disjoint seeds; repeated Hero starts are clustered "+
    "biologically by Hero, not independent cards.",
   totals:{rows:rows.length,screenRows:rows.filter(x=>x.phase==="screen").length,
    confirmRows:rows.filter(x=>x.phase==="confirm").length},
   screen,confirm};
  if(opts.suite==="stat-factorial"){
   screen.factorial=statFactorialAnalysis(rows.filter(x=>x.phase==="screen"));
   if(confirm)
    confirm.factorial=statFactorialAnalysis(rows.filter(x=>x.phase==="confirm"));
  }
  atomic(join(opts.out,"summary.json"),result);
  writeFileSync(join(opts.out,"comparison.md"),markdown(result));
  return result;
 };
 const stop=(message,error=false)=>{
  if(stopped)return;
  stopped=true;
  if(heartbeat)clearInterval(heartbeat);
  if(timeout)clearTimeout(timeout);
  const result=write();
  console.log("Hypothesis study "+message+"; "+result.totals.rows+
   " trials, status="+result.status+"; "+opts.out);
  if(error)process.exitCode=1;
  for(const w of workers)w.terminate();
 };
 const dispatch=w=>{
  if(stopped||w.busy||Date.now()>=deadline)return;
  const task=pending.shift();if(!task)return;
  w.busy=true;active++;w.postMessage(task);
 };
 const advance=()=>{
  if(phase==="screen"){
   if(!phaseSummary(rows,"screen",manifest,hypotheses).complete)
    return stop("incomplete screen",true);
   finalists=choose();phase="confirm";
   pending=makeJobs("confirm",finalists,opts.confirmRepeats);
   console.log("HOLDOUT: "+finalists.map(x=>x.id).join(", "));
   write();
   if(!pending.length)return stop("already confirmed");
   for(const w of workers)dispatch(w);
  }else stop("finished");
 };
 if(!pending.length){
  if(phase==="screen"){
   finalists=choose();phase="confirm";
   pending=makeJobs("confirm",finalists,opts.confirmRepeats);
  }
  if(!pending.length){write();console.log("Already complete");return;}
 }
 console.log("Rogue Cards suite="+opts.suite+": "+
  hypotheses.length+" staged hypotheses vs "+
  "canonical, "+opts.heroes.length+" Heroes, "+opts.workers+" workers, "+
  "up to "+opts.minutes+" min; starting "+phase+" with "+pending.length+
  " tasks. Canonical stays untouched.");
 heartbeat=setInterval(()=>{
  if(Date.now()>=deadline)return stop("wall-time limit");
  const result=write();
  console.log("Balance "+phase+": "+result.totals.rows+" trials; "+
   (active+pending.length)+" still queued/active");
 },60000);
 timeout=setTimeout(()=>stop("wall-time limit"),Math.max(0,deadline-Date.now()));
 process.on("SIGINT",()=>stop("SIGINT"));process.on("SIGTERM",()=>stop("SIGTERM"));
 for(let i=0;i<opts.workers;i++){
  const w=new Worker(new URL(import.meta.url),{
   workerData:{hypotheses,agent,smoke:opts.smoke,suite:opts.suite}
  });
  workers.push(w);w.busy=false;
  w.on("message",msg=>{
   if(stopped)return;
   if(msg.error){console.error("FATAL "+jobKey(msg.task)+": "+msg.error);
    return stop("worker failure",true);}
   active--;w.busy=false;
   const record={...msg.result,...msg.task};
   if(!seen.has(jobKey(record))){
    appendFileSync(trialsPath,JSON.stringify(record)+"\n");
    rows.push(record);seen.add(jobKey(record));
   }
   if(rows.length%25===0)write();
   dispatch(w);
   if(!pending.length&&active===0)advance();
  });
  w.on("error",e=>{console.error(e);if(!stopped)stop("worker crashed",true)});
  w.on("exit",code=>{if(!stopped&&code!==0)
   stop("worker exited "+code,true)});
 }
 for(const w of workers)dispatch(w);
 write();
}
if(!isMainThread){
 const pools=Object.fromEntries(workerData.hypotheses.map(spec=>[
  spec.id,compileStaging(spec)]));
 const policy=workerData.agent.policy,parameters=workerData.agent.parameters;
 parentPort.on("message",task=>{
  try{
   const options={
    hero:task.hero,seed:task.seed,arm:policy.arm,
    c:parameters.c,alpha:parameters.alpha,
    budget:workerData.smoke?4:parameters.budget,
    heuristicMode:policy.heuristicMode,
    equipmentMode:policy.equipmentMode,
    mctsPragmaticVariant:policy.mctsPragmaticVariant,
    softTreeBonus:parameters.softTreeBonus,
    softTreeFirstVisitProbability:parameters.softTreeFirstVisitProbability,
    softRolloutProbability:parameters.softRolloutProbability,
    implicitHpScale:parameters.implicitHpScale,
    implicitThreatScale:parameters.implicitThreatScale,
    maxSearchSteps:parameters.maxSearchSteps,
    recordTelemetry:false,
    cardPools:task.variant==="canonical"?null:pools[task.variant]
   };
   const {events,initialSnapshot,finalSnapshot,...result}=
    playFullSoloExpedition(options);
   if(workerData.suite==="recovery-overnight"){
    const ledger=result.finalMetrics?.healing;
    if(!ledger?.total)throw Error("Missing effective HP healing ledger");
    for(const key of ["attempts","offered","restored","wasted"]){
     const overall=ledger.total[key];
     if(!Number.isFinite(overall)||overall<0)
      throw Error("Invalid healing ledger total "+key);
     for(const group of ["bySource","byCategory","byStage"]){
      const sum=Object.values(ledger[group]??{})
       .reduce((n,entry)=>n+(entry[key]??0),0);
      if(sum!==overall)
       throw Error("Healing ledger mismatch "+group+"."+key+
        ": "+sum+" vs "+overall);
     }
    }
    if(ledger.total.offered!==ledger.total.restored+ledger.total.wasted)
     throw Error("Healing offered != restored + HP-cap waste");
    for(const [source,entry] of Object.entries(ledger.bySource))
     if(source.startsWith("unattributed:")&&entry.offered)
      throw Error("Unattributed healing is forbidden: "+source);
   }
   parentPort.postMessage({task,result});
  }catch(error){
   parentPort.postMessage({task,error:error.stack??String(error)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
