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
 "damage","hasAll36","vaultEntryHp","vaultEntryPlayable"];
export function balanceStudyArgs(argv){
 const opts={},allowed=new Set(["--out","--seed","--workers","--minutes",
  "--screen-repeats","--confirm-repeats","--finalists","--heroes",
  "--variant-limit","--agent","--smoke"]);
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
 return {heroes,seed,smoke,screenRepeats,confirmRepeats,dryRun,
  workers:num("--workers",8,1,32),minutes:num("--minutes",120,1,720),
  finalists:num("--finalists",smoke?1:4,1,12),
  variantLimit:num("--variant-limit",smoke?2:99,1,99),
  out:resolve(opts["--out"]??"results/balance-assumptions-v1"),
  agentPath:resolve(opts["--agent"]??AGENT_PATH)};
}
function seedFor(config,phase,hero,replicate){
 const base=phase==="screen"?config.seed:(config.seed^0xa36f927b)>>>0;
 return stageSeed(base,HEROES.findIndex(h=>h.id===hero),replicate);
}
const lite=row=>Object.fromEntries(METRICS.map(k=>[k,row[k]??null]));
const health=(rows)=>{
 const n=rows.length;
 const rooms=rows.reduce((sum,row)=>sum+row.roomsCleared,0);
 const encounters=rows.reduce((sum,row)=>sum+row.ordinaryEncounters,0);
 const battles=rows.reduce((sum,row)=>sum+row.ordinaryFights,0);
 const full=rows.filter(r=>r.hasAll36===1);
 const vault=rows.filter(r=>r.vaultReached===1);
 return {n,mean:Object.fromEntries(METRICS.map(k=>[k,avg(rows,k)])),
  encounterPerRoom:rooms?encounters/rooms:null,
  encountersPer36Equivalent:rooms?36*encounters/rooms:null,
  fightConversion:encounters?battles/encounters:null,
  complete36:{n:full.length,meanEncounters:avg(full,"ordinaryEncounters"),
   meanFights:avg(full,"ordinaryFights")},
  vaultEntry:{n:vault.length,meanHp:avg(vault.filter(x=>
   x.vaultEntryHp!==null),"vaultEntryHp"),
   playable:vault.filter(x=>x.vaultEntryPlayable===1).length},
  byHero:Object.fromEntries([...new Set(rows.map(x=>x.hero))].map(hero=>[
   hero,healthShallow(rows.filter(r=>r.hero===hero))]))};
};
const healthShallow=rows=>({n:rows.length,
 winRate:avg(rows,"won"),vaultReach:avg(rows,"vaultReached"),
 rooms:avg(rows,"roomsCleared"),encounters:avg(rows,"ordinaryEncounters"),
 fights:avg(rows,"ordinaryFights"),hp:avg(rows,"remainingHp")});
const evalScore=(baseline,cell)=>{
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
    experimentChanges:{cards:spec.cards??[],
     roomEffects:spec.roomEffects??{},roomDeck:spec.roomDeck??{}}});
  output.push({id:spec.id,description:spec.description,
   score:evalScore(baseline,measurable),measured:measurable,
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
   "Control runs: "+phase.completedCanonical+"/"+phase.expectedPerVariant,"",
   "| Hypothesis | runs | encounter/36 equiv. | wins | Vault | Rooms | 36-Room encounters |",
   "|---|---:|---:|---:|---:|---:|---:|");
  for(const r of phase.ranked)
   lines.push("| "+r.id+" | "+r.measured.n+" | "+
    num(r.measured.encountersPer36Equivalent)+" | "+
    num(r.measured.mean.won,3)+" | "+
    num(r.measured.mean.vaultReached,3)+" | "+
    num(r.measured.mean.roomsCleared)+" | "+
    num(r.measured.complete36.meanEncounters)+" (n="+
    r.measured.complete36.n+") |");
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
 "- Seed matching does not guarantee identical dice after paths diverge.",
 "- Runs are model-player estimates, not actual human play duration or enjoyment.",
 "- Card exposures and per-Hero effects are in summary.json/trials.ndjson.",
 "- Do not promote any changes into canonical until human playtesting.");
 return lines.join("\n")+"\n";
}
async function main(){
 const opts=balanceStudyArgs(process.argv.slice(2));
 const hypotheses=balanceHypotheses().slice(0,opts.variantLimit);
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
  revision:revision(),agentId:agent.id,agentSha256:sha(agentSource),
  hypotheses:hypotheses.map(spec=>({id:spec.id,hash:sha(spec)})),
  canonicalDeck:deckComposition(canonicalStagingCatalogue()),
  stagedDecks,heroes:opts.heroes,seed:opts.seed,
  screenRepeats:opts.screenRepeats,confirmRepeats:opts.confirmRepeats,
  finalists:opts.finalists,smoke:opts.smoke};
 if(opts.dryRun){
  console.log(JSON.stringify({schema:manifest.schema,revision:manifest.revision,
   agent:agent.id,hypotheses:manifest.hypotheses.map(h=>h.id),
   heroes:opts.heroes,screenTrials:(hypotheses.length+1)*opts.heroes.length*
    opts.screenRepeats,confirmTrials:(opts.finalists+1)*
    opts.heroes.length*opts.confirmRepeats,
   physicallyCanonicalCardsChanged:false},null,2));
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
  // Ranking is based on the entire fixed screening set only.
  return screen.ranked.slice(0,opts.finalists).map(r=>
   hypotheses.find(h=>h.id===r.id));
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
   revision:manifest.revision,agentId:agent.id,status,
   selectedForConfirmation:finalists?.map(x=>x.id)??[],
   screeningScoreWarning:"Exploratory multi-arm ranking. Independent "+
    "confirmation uses disjoint seeds; repeated Hero starts are clustered "+
    "biologically by Hero, not independent cards.",
   totals:{rows:rows.length,screenRows:rows.filter(x=>x.phase==="screen").length,
    confirmRows:rows.filter(x=>x.phase==="confirm").length},
   screen,confirm};
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
 console.log("Rogue Cards: "+hypotheses.length+" staged hypotheses vs "+
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
   workerData:{hypotheses,agent,smoke:opts.smoke}
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
   parentPort.postMessage({task,result});
  }catch(error){
   parentPort.postMessage({task,error:error.stack??String(error)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
