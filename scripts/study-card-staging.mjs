#!/usr/bin/env node
/**
 * Canonical versus staged physical card A/B research.
 * Same fixed player, Hero and initial game seed for both arms.
 * Staged definitions are private to each expedition, not global patches.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {readFileSync,existsSync,mkdirSync,writeFileSync,appendFileSync,renameSync}
 from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {cpus} from "node:os";
import {gzipSync} from "node:zlib";
import {HEROES} from "../src/tabletop-data.js";
import {compileStaging,canonicalStagingCatalogue}
 from "../src/staging/catalogue.js";
import {playFullSoloExpedition} from "./study-solo-expedition-balance.mjs";

const agentDefault="experiments/agents/solo-balance-reference-v1.json";
const hash=thing=>createHash("sha256").update(
 typeof thing==="string"?thing:JSON.stringify(thing)).digest("hex");
const atomic=(path,data)=>{
 const tmp=path+".tmp";
 writeFileSync(tmp,JSON.stringify(data,null,2)+"\n");
 renameSync(tmp,path);
};
const git=()=>execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
const mix=n=>{
 n=(n+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
export function parseStagingArgs(argv){
 const opts={},allowed=new Set(["--stage","--agent","--out","--seed",
  "--runs-per-hero","--workers","--minutes","--trace"]);
 const dryRun=argv.includes("--dry-run");
 argv=argv.filter(v=>v!=="--dry-run");
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],val=argv[i+1];
  if(!allowed.has(key)||!val||Object.hasOwn(opts,key))
   throw Error("Unknown/missing/duplicate staging argument "+key);
  opts[key]=val;
 }
 if(!opts["--stage"])throw Error("Specify --stage experiment-file.json");
 const integer=(key,def,min,max)=>{
  const value=Number(opts[key]??def);
  if(!Number.isSafeInteger(value)||value<min||value>max)
   throw Error(key+" out of bounds");
  return value;
 };
 return {stagePath:resolve(opts["--stage"]),
  agentPath:resolve(opts["--agent"]??agentDefault),
  out:resolve(opts["--out"]??"results/card-staging-v1"),
  seed:integer("--seed",20261121,1,0xffffffff),
  runsPerHero:integer("--runs-per-hero",20,1,2000),
  workers:integer("--workers",8,1,32),
  minutes:integer("--minutes",120,1,720),
  trace:opts["--trace"]??"off",dryRun};
}
export function stageSeed(seed,heroIndex,replicate){
 return mix(seed^Math.imul(heroIndex+1,0x9e3779b9)^
  Math.imul(replicate+1,0xc2b2ae35))||1;
}
const key=x=>x.hero+"|"+x.replicate+"|"+x.arm;
const average=(rows,field)=>rows.length?
 rows.reduce((n,x)=>n+(x[field]??0),0)/rows.length:null;
const metrics=["won","vaultReached","roomsCleared","ordinaryEncounters",
 "ordinaryFights","combatContextDamage","remainingHp","itemsUsed",
 "searchMs","elapsedMs"];
export function deckComposition(catalogue){
 const tally=cards=>Object.fromEntries(cards.map(c=>[c.id,c.copies??1]));
 return {
  rooms:Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(stage=>
   [stage,tally(catalogue.rooms.filter(c=>c.stage===stage))])),
  monsters:Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(stage=>
   [stage,tally(catalogue.monsters.filter(c=>c.stage===stage))])),
  items:tally(catalogue.items),
  heroes:tally(catalogue.heroes),
  finalCards:{vault:catalogue.vault.hp??null,
   warden:catalogue.warden.hp,wardenFury:catalogue.wardenFury.hp}
 };
}
const cardMaps=["monsterVisits","monsterFightStartsById","monsterKillsById",
 "monsterParleyAttemptsById","damageContextById","objectAcquisitions",
 "objectActivations","roomChoices","roomRollBands","itemUses"];
function summarizeCells(rows){
 const cells={};
 for(const arm of ["canonical","staging"]){
  const group=rows.filter(r=>r.arm===arm);
  const heroRows={};
  for(const hero of HEROES.map(c=>c.id))
   heroRows[hero]=summarize(group.filter(r=>r.hero===hero));
  cells[arm]={...summarize(group),byHero:heroRows};
 }
 return cells;
}
function summarize(group){
 const result={n:group.length};
 for(const field of metrics)
  result[field]={sum:group.reduce((n,r)=>n+(r[field]??0),0),
   mean:average(group,field)};
 return result;
}
function aggregateCards(rows){
 const maps=Object.fromEntries(cardMaps.map(k=>[k,{}]));
 const roomsSeen={};
 for(const row of rows){
  for(const id of row.seenRoomIds||[])
   roomsSeen[id]=(roomsSeen[id]||0)+1;
  for(const category of cardMaps){
   const data=row.finalMetrics?.[category]??{};
   for(const [id,value] of Object.entries(data)){
    const number=typeof value==="number"?value:
     typeof value==="object"&&value!==null?value.total??0:0;
    maps[category][id]=(maps[category][id]||0)+number;
   }
  }
 }
 return {roomSeen:roomsSeen,...maps};
}
const fromPair=(a,b)=>Object.fromEntries(metrics.map(field=>
 [field,(b[field]??0)-(a[field]??0)]));
const interval=(paired,field,seed)=>{
 // Matched Hero-seed bootstrap, not independent-arm Wald intervals.
 let x=seed>>>0;
 const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
 if(paired.length<2)return null;
 const values=paired.map(p=>p[field]);
 const results=[];
 for(let j=0;j<1200;j++){
  let sum=0;
  for(let k=0;k<values.length;k++)
   sum+=values[Math.floor(random()*values.length)];
  results.push(sum/values.length);
 }
 results.sort((a,b)=>a-b);
 return [results[Math.floor(results.length*.025)],
  results[Math.floor(results.length*.975)]];
};
export function compareStaging(rows,manifest){
 const byKey=new Map();
 for(const row of rows){
  if(byKey.has(key(row)))throw Error("Duplicate staging trial "+key(row));
  byKey.set(key(row),row);
 }
 const pairs=[];
 for(const row of rows.filter(r=>r.arm==="canonical")){
  const opposite=byKey.get(key({...row,arm:"staging"}));
  if(!opposite)continue;
  if(opposite.seed!==row.seed)throw Error("Unpaired staging dice seed");
  pairs.push({hero:row.hero,replicate:row.replicate,
   ...fromPair(row,opposite)});
 }
 const comparison={};
 for(const field of metrics)
  comparison[field]={paired:pairs.length,
   difference:average(pairs,field),bootstrap95:interval(pairs,field,
    20261121+metrics.indexOf(field))};
 const byHero={};
 for(const hero of manifest.heroes){
  const h=pairs.filter(r=>r.hero===hero);
  byHero[hero]=Object.fromEntries(metrics.map(field=>[field,{
   paired:h.length,difference:average(h,field),
   bootstrap95:interval(h,field,20261121+metrics.indexOf(field))}]));
 }
 const complete=pairs.length===manifest.heroes.length*manifest.runsPerHero&&
  rows.length===pairs.length*2;
 const out={schema:"rogue-cards-staging-comparison-v1",
  stage:manifest.stageId,canonicalRevision:manifest.revision,
  stageSha256:manifest.stageSha256,agentSha256:manifest.agentSha256,
  deckComposition:manifest.deckComposition,
  experimentChanges:manifest.experimentChanges,
  complete,finishedRows:rows.length,pairedExpeditions:pairs.length,
  expectedPairs:manifest.heroes.length*manifest.runsPerHero,
  cells:summarizeCells(rows),pairedDelta:comparison,
  byHero,byCard:{
   canonical:aggregateCards(rows.filter(r=>r.arm==="canonical")),
   staging:aggregateCards(rows.filter(r=>r.arm==="staging"))
  },
  caveats:[
   "Same starting seed and policy for paired arms; their later dice streams may diverge if the staged cards change action paths or deck lengths.",
   "Card-use/exposure numbers are descriptive totals, NOT causal individual-card effects when more than one card changes.",
   "Rooms seen include revealed Rooms and do not imply the Room was completed.",
   "Monster appearances include revisits; not all are independent encounters.",
   "Unexposed cards cannot be declared balanced. Compare modified-card exposure before interpreting effects.",
   "This AI is a stable model test player, NOT evidence of human win probability.",
   "There is no automatic canonical promotion or card printing."
  ]};
 return out;
}
function reportMarkdown(report){
 const format=(n,precision=2)=>n===null||n===undefined?"—":n.toFixed(precision);
 const header=["# Card staging — "+report.stage,"",
 "Code: `"+report.canonicalRevision+"` · matched pairs: "+
 report.pairedExpeditions+"/"+report.expectedPairs,"",
 "| Outcome | Canonical mean | Staging mean | Paired difference | 95% bootstrap |",
 "|---|---:|---:|---:|---|"];
 for(const f of metrics){
  const a=report.cells.canonical[f].mean,b=report.cells.staging[f].mean,
   delta=report.pairedDelta[f];
  header.push("| "+f+" | "+format(a)+" | "+format(b)+
   " | "+format(delta.difference)+" | "+
   (delta.bootstrap95?"["+delta.bootstrap95.map(x=>format(x)).join(", ")+"]":"insufficient pairs")+" |");
 }
 header.push("","## Starting deck composition","",
  "| Deck | Canonical copies | Staging copies |",
  "|---|---:|---:|");
 for(const kind of ["rooms","monsters"]){
  for(const stage of ["UPPER","MIDDLE","DEEP"]){
   const sum=map=>Object.values(map).reduce((n,v)=>n+v,0);
   const baseline=report.deckComposition.canonical[kind][stage],
    variant=report.deckComposition.staging[kind][stage];
   header.push("| "+kind+" "+stage+" | "+sum(baseline)+
    " | "+sum(variant)+" |");
  }
 }
 const sum=map=>Object.values(map).reduce((n,v)=>n+v,0);
 header.push("| Items | "+sum(report.deckComposition.canonical.items)+
  " | "+sum(report.deckComposition.staging.items)+" |");
 header.push("","## Per Hero","",
 "| Hero | Pairs | Δ wins | Δ vault | Δ rooms | Δ ordinary Monsters |",
 "|---|---:|---:|---:|---:|---:|");
 for(const [hero,v] of Object.entries(report.byHero))
  header.push("| "+hero+" | "+v.won.paired+" | "+
   format(v.won.difference)+" | "+format(v.vaultReached.difference)+
   " | "+format(v.roomsCleared.difference)+" | "+
   format(v.ordinaryEncounters.difference)+" |");
 header.push("","## Card exposure (canonical → staging)","");
 for(const mapName of ["roomSeen",...cardMaps]){
  const a=report.byCard.canonical[mapName],b=report.byCard.staging[mapName];
  const ids=[...new Set([...Object.keys(a),...Object.keys(b)])];
  const changed=ids.map(id=>({id,canonical:a[id]||0,staging:b[id]||0}))
   .filter(row=>row.canonical!==row.staging)
   .sort((x,y)=>Math.abs(y.staging-y.canonical)-
    Math.abs(x.staging-x.canonical)).slice(0,30);
  header.push("### "+mapName,"",
   "| Card | Canonical total | Staging total |",
   "|---|---:|---:|");
  for(const item of changed)
   header.push("| "+item.id+" | "+item.canonical+" | "+item.staging+" |");
  if(!changed.length)header.push("| no observed difference | — | — |");
  header.push("");
 }
 header.push("## Interpretation limits","",...report.caveats.map(x=>"- "+x));
 return header.join("\n")+"\n";
}
async function main(){
 const opts=parseStagingArgs(process.argv.slice(2));
 if(!["off","full"].includes(opts.trace))
  throw Error("--trace must be off or full");
 const stageSource=readFileSync(opts.stagePath,"utf8");
 const agentSource=readFileSync(opts.agentPath,"utf8");
 const spec=JSON.parse(stageSource),agent=JSON.parse(agentSource);
 const cardPools=compileStaging(spec); // validate before workers start
 if(agent.schema!=="rogue-cards-solo-agent-profile-v1"||
  agent.status!=="frozen-for-staging-comparisons")
  throw Error("Staging requires a frozen, versioned test-agent profile");
 const heroes=HEROES.map(h=>h.id);
 const manifest={schema:"rogue-cards-staging-run-v1",
  revision:git(),stageId:spec.id,stageSha256:hash(stageSource),
  agentSha256:hash(agentSource),seed:opts.seed,
  runsPerHero:opts.runsPerHero,heroes,trace:opts.trace,
  deckComposition:{canonical:deckComposition(canonicalStagingCatalogue()),
   staging:deckComposition(cardPools)},
  experimentChanges:{cards:spec.cards??[],
   roomDeck:spec.roomDeck??{},roomEffects:spec.roomEffects??{}}};
 if(opts.dryRun){
  console.log(JSON.stringify({...manifest,
   pairs:heroes.length*opts.runsPerHero,
   plannedTrials:heroes.length*opts.runsPerHero*2,
   workers:opts.workers,canonicalImmutable:true},null,2));return;
 }
 mkdirSync(opts.out,{recursive:true});
 const file=join(opts.out,"manifest.json"),trials=join(opts.out,"trials.ndjson"),
  summary=join(opts.out,"summary.json"),markdown=join(opts.out,"comparison.md");
 if(existsSync(file)){
  const saved=JSON.parse(readFileSync(file,"utf8"));
  if(JSON.stringify(saved)!==JSON.stringify(manifest))
   throw Error("Incompatible staging resume. Use a new --out directory.");
 }else atomic(file,manifest);
 const rows=existsSync(trials)?readFileSync(trials,"utf8")
  .split("\n").filter(Boolean).map(JSON.parse):[];
 const seen=new Set();
 for(const row of rows){
  if(seen.has(key(row)))throw Error("Duplicate saved card A/B trial");
  seen.add(key(row));
 }
 const pending=[];
 // Interleave pairs so partial results can still form valid comparisons.
 for(let rep=0;rep<opts.runsPerHero;rep++)
  for(let h=0;h<heroes.length;h++)
   for(const arm of ["canonical","staging"]){
    const job={hero:heroes[h],replicate:rep,arm,
     seed:stageSeed(opts.seed,h,rep)};
    if(!seen.has(key(job)))pending.push(job);
   }
 let active=0,stopped=false;const workers=[];
 const deadline=Date.now()+opts.minutes*60000;
 const write=()=>{
  const result=compareStaging(rows,manifest);
  atomic(summary,result);
  writeFileSync(markdown,reportMarkdown(result));
  return result;
 };
 const stop=(why,failed=false)=>{
  if(stopped)return;
  stopped=true;clearInterval(heartbeat);clearTimeout(timeout);
  const result=write();
  console.log("Staging "+why+": "+rows.length+"/"+(heroes.length*opts.runsPerHero*2)+
   " trials, "+result.pairedExpeditions+" paired; "+summary);
  if(failed)process.exitCode=1;
  for(const w of workers)w.terminate();
 };
 const dispatch=w=>{
  if(stopped||w.busy||Date.now()>=deadline)return;
  const job=pending.shift();if(!job)return;
  w.busy=true;active++;w.postMessage(job);
 };
 const heartbeat=setInterval(()=>{
  if(Date.now()>=deadline){stop("wall limit");return;}
  const result=write();
  console.log("Staging "+result.pairedExpeditions+" paired, "+
   (pending.length+active)+" tasks remaining");
 },60000);
 const timeout=setTimeout(()=>stop("wall limit"),
  Math.max(0,deadline-Date.now()));
 process.on("SIGINT",()=>stop("interrupted"));
 process.on("SIGTERM",()=>stop("terminated"));
 console.log("Staging: "+opts.workers+" workers/"+cpus().length+
  " CPUs, "+pending.length+" remaining tasks, variant "+spec.id);
 for(let i=0;i<opts.workers;i++){
  const w=new Worker(new URL(import.meta.url),{workerData:{
   spec,agent,recordTelemetry:opts.trace==="full",
   traceDir:join(opts.out,"traces")
  }});
  workers.push(w);w.busy=false;
  w.on("message",msg=>{
   if(stopped)return;
   if(msg.error){console.error("FATAL "+key(msg.job)+" "+msg.error);
    stop("worker error",true);return;}
   active--;w.busy=false;
   const row={...msg.result,...msg.job};
   if(!seen.has(key(row))){
    appendFileSync(trials,JSON.stringify(row)+"\n");
    rows.push(row);seen.add(key(row));
   }
   if(rows.length%16===0)write();
   dispatch(w);
   if(!pending.length&&!active)stop("complete");
  });
  w.on("error",error=>{console.error(error);
   if(!stopped)stop("worker crashed",true);});
  w.on("exit",code=>{if(!stopped&&code!==0)
   stop("worker exited "+code,true);});
 }
 for(const w of workers)dispatch(w);
 if(!pending.length&&!active)stop("already complete");
 write();
}
if(!isMainThread){
 const cardPools=compileStaging(workerData.spec);
 const policy=workerData.agent.policy,parameters=workerData.agent.parameters;
 parentPort.on("message",job=>{
  try{
   const p=playFullSoloExpedition({
    hero:job.hero,seed:job.seed,arm:policy.arm,
    budget:parameters.budget,c:parameters.c,alpha:parameters.alpha,
    heuristicMode:policy.heuristicMode,
    equipmentMode:policy.equipmentMode,
    mctsPragmaticVariant:policy.mctsPragmaticVariant,
    softTreeBonus:parameters.softTreeBonus,
    softTreeFirstVisitProbability:parameters.softTreeFirstVisitProbability,
    softRolloutProbability:parameters.softRolloutProbability,
    implicitHpScale:parameters.implicitHpScale,
    implicitThreatScale:parameters.implicitThreatScale,
    maxSearchSteps:parameters.maxSearchSteps,
    recordTelemetry:workerData.recordTelemetry,
    cardPools:job.arm==="staging"?cardPools:null
   });
   // Keep card-level diagnostics, not a giant decision history by default.
   const {events,initialSnapshot,finalSnapshot,...result}=p;
   if(workerData.recordTelemetry){
    mkdirSync(workerData.traceDir,{recursive:true});
    const name=job.arm+"-"+job.hero+"-"+job.replicate+".json.gz";
    writeFileSync(join(workerData.traceDir,name),gzipSync(JSON.stringify({
     schema:"rogue-cards-staging-trace-v1",...job,
     stagingId:result.stagingId,events,initialSnapshot,finalSnapshot
    })));
    result.traceFile="traces/"+name;
   }
   parentPort.postMessage({job,result});
  }catch(error){
   parentPort.postMessage({job,error:error.stack??String(error)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
