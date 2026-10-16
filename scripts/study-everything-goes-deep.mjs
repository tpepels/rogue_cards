#!/usr/bin/env node
/**
 * Decision-ready Everything Goes experiment.
 *
 * SURVEY: every actual canonical MCTS decision + actual committed dice.
 * PAIRS: same (seed, Hero, MCTS budget), an additional physical copy of a
 * specific new Item versus one ordinary Ration as a resource-matched
 * comparator. Comparisons are of starting resources, NOT the intrinsic
 * causal value of the Item or a guarantee that it would be drawn naturally.
 *
 * All attempts have deterministic identifiers, raw gzipped decision tapes,
 * compact checkpoints, resume protection and a strict completion gate.
 *
 * node scripts/study-everything-goes-deep.mjs --runs 3600 --pairs-per-item 120 \
 *   --workers 6 --hours 72 --budget 2 --out results/everything-goes-deep
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync}
 from "node:fs";
import {join,resolve} from "node:path";
import {gzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {HEROES} from "../src/tabletop-data.js";
import {ALL_ROOMS,ALL_MONSTERS,ALL_OBJECTS} from "../src/decks.js";
import {ODD_ITEMS} from "../src/item-expansion.js";
import {playSessionWithMCTS} from "../src/session-agent.js";
import {createDecisionRecorder,experimentSnapshot} from "../src/experiment-telemetry.js";
const sha=x=>createHash("sha256").update(x).digest("hex");
const mix=n=>{
 n=(n+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const SOLO=HEROES.map(h=>[h.id]);
const DUO=HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(o=>[h.id,o.id]));
const PARTIES=[...SOLO,...DUO];
const num=(str,key,otherwise,min,max)=>{
 const value=str[key]??String(otherwise),n=Number(value);
 if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(n)||n<min||n>max)
  throw Error(key+" must be an integer from "+min+" to "+max);
 return n;
};
function parse(argv){
 const fields=new Set(["--runs","--pairs-per-item","--workers","--hours",
  "--budget","--seed","--out","--knowledge","--max-game-steps",
  "--max-search-steps","--items","--mode"]);
 const flags=new Set(["--resume","--dry-run"]),options={};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(flags.has(k)){if(options[k])throw Error("Duplicate "+k);options[k]=true;continue;}
  if(!fields.has(k)||options[k]!==undefined||!argv[i+1]||
     argv[i+1].startsWith("--"))throw Error("Unknown/missing CLI argument "+k);
  options[k]=argv[++i];
 }
 const mode=options["--mode"]??"all";
 if(!["survey","pairs","all"].includes(mode))throw Error("Invalid --mode");
 const items=options["--items"]?options["--items"].split(","):
  ODD_ITEMS.map(c=>c.id);
 if(!items.length||new Set(items).size!==items.length||
    items.some(id=>!ODD_ITEMS.some(c=>c.id===id)))
  throw Error("--items expects comma-separated odd-* Item IDs");
 const knowledge=options["--knowledge"]??"fair";
 if(!["fair","oracle"].includes(knowledge))throw Error("Invalid knowledge");
 const c={
  mode,items,
  runs:num(options,"--runs",3600,1,50000),
  pairsPerItem:num(options,"--pairs-per-item",120,1,10000),
  workers:num(options,"--workers",Math.min(6,availableParallelism()),1,16),
  hours:num(options,"--hours",72,1,720),
  budget:num(options,"--budget",2,1,100000),
  seed:num(options,"--seed",20261016,1,0xffffffff),
  maxGameSteps:num(options,"--max-game-steps",20000,1,100000),
  maxSearchSteps:num(options,"--max-search-steps",5000,1,100000),
  out:resolve(options["--out"]||"results/everything-goes-deep"),
  knowledge,resume:!!options["--resume"],dryRun:!!options["--dry-run"]
 };
 if(c.resume&&c.dryRun)throw Error("--resume and --dry-run cannot combine");
 c.design={schema:"everything-goes-deep-study-v1",mode,items,
  runs:c.runs,pairsPerItem:c.pairsPerItem,seed:c.seed,budget:c.budget,
  knowledge,maxGameSteps:c.maxGameSteps,maxSearchSteps:c.maxSearchSteps,
  partyRotation:PARTIES,comparisonItem:"ex-rations"};
 c.signature=sha(JSON.stringify(c.design));
 return c;
}
const git=args=>execFileSync("git",args,{encoding:"utf8"}).trim();
const atomic=(path,value)=>{
 const temporary=path+".tmp-"+process.pid;
 writeFileSync(temporary,JSON.stringify(value,null,2)+"\n");
 renameSync(temporary,path);
};
const csv=(path,rows)=>{
 if(!rows.length){writeFileSync(path,"\n");return;}
 const keys=[...new Set(rows.flatMap(Object.keys))];
 const value=v=>JSON.stringify(v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):v);
 writeFileSync(path,[keys.map(value).join(","),...rows.map(r=>
  keys.map(k=>value(r[k])).join(","))].join("\n")+"\n");
};
const inc=(obj,key,n=1)=>{obj[key]=(obj[key]||0)+n;};
const add=(obj,source)=>{
 for(const [k,v] of Object.entries(source||{}))
  if(typeof v==="number"&&Number.isFinite(v))inc(obj,k,v);
};
const mean=(a)=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
const ci=(xs)=>{
 if(!xs.length)return null;
 const m=mean(xs),n=xs.length;
 const variance=n>1?xs.reduce((sum,x)=>sum+(x-m)**2,0)/(n-1):0;
 const err=n>1?1.9599639845*Math.sqrt(variance/n):null;
 return {n,mean:m,ci95:err===null?null:[m-err,m+err],
  min:Math.min(...xs),max:Math.max(...xs)};
};
const wilson=(k,n)=>{
 if(!n)return null;
 const z=1.9599639845,p=k/n,v=z*z,den=1+v/n;
 const mid=(p+v/(2*n))/den;
 const half=z*Math.sqrt(p*(1-p)/n+v/(4*n*n))/den;
 return [Math.max(0,mid-half),Math.min(1,mid+half)];
};
function jobs(c){
 const out=[];let i=0;
 if(c.mode!=="pairs")for(let j=0;j<c.runs;j++)
  out.push({i:i++,group:"survey",sample:j,arm:"organic",
   heroes:PARTIES[j%PARTIES.length],
   seed:mix(c.seed^Math.imul(j+1,0x85ebca6b))||1,extraObjectId:null});
 if(c.mode!=="survey")for(const itemId of c.items)
  for(let j=0;j<c.pairsPerItem;j++){
   const seed=mix(c.seed^Math.imul(j+1,0xc2b2ae35)^
    Math.imul(ODD_ITEMS.findIndex(x=>x.id===itemId)+1,0x9e3779b1))||1;
   const heroes=SOLO[j%SOLO.length],base={group:"pair",itemId,
    sample:j,heroes,seed};
   out.push({...base,i:i++,arm:"control",extraObjectId:"ex-rations"});
   out.push({...base,i:i++,arm:"treatment",extraObjectId:itemId});
  }
 return out;
}
function sampleCounters(metrics){
 const watched=["cleared","battles","combatStarts","encounterStarts",
  "monsterDraws","kills","rounds","damage","drawn","spent","activated",
  "negotiations","negotiationsWon","corpses","banishments",
  "scouted","elberethAttempts","sealAttempt","sealWin","vaultEntered"];
 return Object.fromEntries(watched.map(k=>[k,metrics[k]??0]));
}
function work(job,c){
 const recorder=createDecisionRecorder();
 const started=performance.now();
 const result=playSessionWithMCTS({seed:job.seed,heroes:job.heroes,
  gameMode:"everything-goes",extraObjectId:job.extraObjectId,
  budget:c.budget,knowledge:c.knowledge,
  maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
  traceLimit:0,retainSearches:false,equipmentProgressCap:12,
  onDecision:recorder.handler});
 const events=recorder.finish(),m=result.metrics;
 if(!result.resolved||result.actions>events.length)
  throw Error("Canonical completed actions exceed observed decisions");
 // A nested reaction is a genuine player decision but may replay a
 // still-open parent transaction. It does not increment the engine's
 // completed-root actionCount until the whole parent finally commits.
 if(result.forcedDecisions+result.searchedDecisions!==events.length)
  throw Error("Missing or duplicated player decision (including reactions)");
 if(events.some((e,i)=>e.step!==i))
  throw Error("Nonsequential decision tape");
 if(!events.some(e=>e.dice.length))
  throw Error("Completed expedition has no committed die observations");
 for(const key of ["combatStarts","kills","damage","drawn",
  "negotiations","negotiationsWon","encounterStarts"]){
  const recorded=events.reduce((n,e)=>n+
   (e.metrics[key]?.delta||0),0);
  if(recorded!==m[key])
   throw Error("Event tape "+key+" does not reconcile with engine total: "+
    recorded+" vs "+m[key]);
 }
 const sums=keys=>Object.values(m[keys]||{}).reduce((n,v)=>n+v,0);
 if(sums("monsterKillsById")!==m.kills)
  throw Error("Per-Monster kills fail conservation check");
 if(sums("monsterParleyAttemptsById")!==m.negotiations)
  throw Error("Per-Monster Parley attempts fail conservation check");
 if(sums("monsterParleyWinsById")!==m.negotiationsWon)
  throw Error("Per-Monster Parley successes fail conservation check");
 if(m.encounterStarts>m.monsterDraws)
  throw Error("Impossible encounter to draw count");
 const index=String(job.i).padStart(6,"0");
 const raw={schema:"everything-goes-actual-event-tape-v1",job,
  gameMode:"everything-goes",policy:{name:"UCT canonical session",
   budget:c.budget,knowledge:c.knowledge},
  note:"Dice are committed actual rolls only; nested speculative replays excluded.",
  events,result,wallMs:performance.now()-started};
 const json=Buffer.from(JSON.stringify(raw)),compressed=gzipSync(json,{level:6});
 const tmp=join(c.out,"raw",index+".json.gz.tmp-"+process.pid);
 const file=join(c.out,"raw",index+".json.gz");
 writeFileSync(tmp,compressed);renameSync(tmp,file);
 const phases={};const selected={};const available={},offeredByCard={};
 const roomEntries={},monsterStarts={},diceKinds={},diceFaces={};
 let searchMs=0,transitionMs=0,rawDice=0,nested=0;
 for(const e of events){
  inc(phases,e.phase);inc(selected,e.chosen.kind);
  for(const legal of e.legal||[]){
   inc(available,legal.kind);
   if(legal.cardId)inc(offeredByCard,legal.cardId);
  }
  if(e.after.pendingReaction)nested++;
  if(e.after.room?.id!==e.before.room?.id&&e.after.room)
   inc(roomEntries,e.after.room.id);
  if(e.after.monster?.id!==e.before.monster?.id&&e.after.monster)
   inc(monsterStarts,e.after.monster.id);
  for(const roll of e.dice){
   rawDice++;inc(diceKinds,String(roll.sides));
   inc(diceFaces,String(roll.sides)+":"+roll.face);
  }
  searchMs+=e.searchMs||0;transitionMs+=e.transitionMs||0;
 }
 const last=events.at(-1)?.after;
 const roomById=new Map(ALL_ROOMS.map(c=>[c.id,c]));
 const byStage={};
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  const seen=(last?.seenRooms||[]).map(id=>roomById.get(id)).
   filter(c=>c&&c.stage===stage);
  byStage[stage]={normal:seen.filter(c=>c.v2.kind!=="CORRIDOR").length,
   corridors:seen.filter(c=>c.v2.kind==="CORRIDOR").length};
 }
 const bossCombats=events.reduce((n,e)=>n+
  (e.after.room?.stage==="FINAL"?e.metrics.combatStarts?.delta||0:0),0);
 const finalHp=(last?.heroes||[]).map(x=>x.hp);
 const summary={
  i:job.i,group:job.group,itemId:job.itemId??null,
  sample:job.sample,arm:job.arm,seed:job.seed,heroes:job.heroes,
  extraObjectId:job.extraObjectId,won:result.won,
  ending:result.ending,actions:result.actions,
  decisionEvents:events.length,nestedDecisions:nested,
  searchedDecisions:result.searchedDecisions,
  forcedDecisions:result.forcedDecisions,
  equipmentProgressBreaks:result.equipmentProgressBreaks,
  encounterStarts:m.encounterStarts,combatStarts:m.combatStarts,
  kills:m.kills,rooms:m.cleared,drawn:m.drawn,
  ordinaryCombats:Math.max(0,m.combatStarts-bossCombats),
  bossCombats,byStage,finalHp,totalFinalHp:finalHp.reduce((a,b)=>a+b,0),
  corridors:Object.values(byStage).reduce((n,v)=>n+v.corridors,0),
  wipeCause:m.wipeCause||null,wipeStage:m.wipeStage||null,
  hpLoss:m.damage,
  itemGranted:!!events[0]?.before.heroes[0].inventory
   .find(card=>card.id===job.extraObjectId),
  counters:sampleCounters(m),metrics:m,
  phases,selected,available,offeredByCard,roomEntries,monsterStarts,
  diceKinds,diceFaces,dice:rawDice,
  availableCardActions:result.availableCardActions,
  chosenCardActions:result.chosenCardActions,
  choiceCoverage:result.choiceCoverage,
  searchMs,transitionMs,wallMs:performance.now()-started,
  rawFile:"raw/"+index+".json.gz",
  rawBytes:compressed.length,rawSha256:sha(compressed)
 };
 return summary;
}
function coverage(rows){
 const fields=["roomChoices","roomOptionAvailable","roomRollBands","objectDraws",
  "objectAcquisitions","objectRoomExposures",
  "objectEquippedRoomExposures","itemOpportunities","itemUses",
  "itemResults","itemPassiveEffects","objectRollBands",
  "monsterVisits","monsterKillsById","monsterFightStartsById",
  "damageContextById","monsterParleyAttemptsById",
  "monsterParleyWinsById","monsterBehaviorBands","operationCounts",
  "cardCounts","objectActivations"];
 const aggregate=Object.fromEntries(fields.map(k=>[k,{}]));
 const visits={};const offers={};const chosen={};const stages={};
 const actionOfferedByCard={},actionChosenByCard={},
  phaseCounts={},legalActions={},diceKinds={},diceFaces={};
 for(const row of rows){
  for(const key of fields){
   const src=row.metrics[key]||{};
   for(const [card,value] of Object.entries(src)){
    if(typeof value==="number")inc(aggregate[key],card,value);
    else{
     const target=aggregate[key][card]??={};
     for(const [name,n] of Object.entries(value||{})){
      if(typeof n==="number")inc(target,name,n);
      else if(n&&typeof n==="object"){
       const nested=target[name]??={};add(nested,n);
      }
     }
    }
   }
  }
  add(visits,row.roomEntries);add(offers,row.offeredByCard);
  add(chosen,row.selected);add(actionOfferedByCard,row.availableCardActions);
  add(actionChosenByCard,row.chosenCardActions);
  add(phaseCounts,row.phases);add(legalActions,row.available);
  add(diceKinds,row.diceKinds);add(diceFaces,row.diceFaces);
  for(const [stage,value] of Object.entries(row.metrics.stageProgress||{}))
   inc(stages,stage,value);
 }
 const roomMissing=ALL_ROOMS.filter(x=>!visits[x.id]).map(x=>x.id);
 const monsterMissing=ALL_MONSTERS.filter(x=>!aggregate.monsterVisits[x.id]).map(x=>x.id);
 const itemMissing=ALL_OBJECTS.filter(x=>!aggregate.objectAcquisitions[x.id]).map(x=>x.id);
 const itemNeverUsed=ALL_OBJECTS.filter(x=>!aggregate.itemUses[x.id]&&
  !aggregate.objectActivations[x.id]).map(x=>x.id);
 return {aggregate,visits,offers,chosen,stages,
  actionOfferedByCard,actionChosenByCard,phaseCounts,legalActions,
  diceKinds,diceFaces,
  missing:{roomsNeverEntered:roomMissing,monsterTypesNotSeen:monsterMissing,
   itemsNeverAcquired:itemMissing,itemsNeverUsed:itemNeverUsed}};
}
function createReport(c,done,expected){
 const rows=[...done.values()].sort((a,b)=>a.i-b.i);
 const survey=rows.filter(x=>x.group==="survey");
 const pairs=rows.filter(x=>x.group==="pair");
 const metrics=["won","actions","rooms","encounterStarts","combatStarts",
  "kills","drawn","hpLoss","searchedDecisions","dice","nestedDecisions",
  "decisionEvents",
  "equipmentProgressBreaks","ordinaryCombats","bossCombats",
  "corridors","totalFinalHp"];
 const byParty={};
 for(const row of survey){
  const key=row.heroes.join("+"),item=byParty[key]??={runs:0,wins:0,
   rooms:[],combats:[],encounters:[],actions:[],deaths:0};
  item.runs++;item.wins+=Number(row.won);item.rooms.push(row.rooms);
  item.combats.push(row.combatStarts);item.encounters.push(row.encounterStarts);
  item.actions.push(row.actions);item.deaths+=Number(!row.won);
 }
 const parties=Object.fromEntries(Object.entries(byParty).map(([name,p])=>
  [name,{runs:p.runs,winRate:p.wins/p.runs,
   winWilson95:wilson(p.wins,p.runs),
   rooms:ci(p.rooms),combats:ci(p.combats),
   encounters:ci(p.encounters),actions:ci(p.actions)}]));
 const groups={};for(const row of pairs){
  const key=row.itemId+":"+row.sample;
  const pair=groups[key]??={};
  pair[row.arm]=row;
 }
 const byItem={},pairedCsv=[];
 for(const id of c.items){
  const matched=Object.values(groups).filter(g=>g.control&&
   g.treatment&&g.control.itemId===id&&g.treatment.itemId===id);
  const estimates={};for(const metric of metrics){
   const values=matched.map(g=>Number(g.treatment[metric])-
    Number(g.control[metric]));
   estimates[metric]=ci(values);
  }
  const compliant=matched.filter(g=>g.control.itemGranted&&
   g.treatment.itemGranted).length;
  const usedRuns=matched.filter(g=>(
   g.treatment.metrics.itemUses?.[id]?.total||0)>0).length;
  const totalUses=matched.reduce((n,g)=>n+
   (g.treatment.metrics.itemUses?.[id]?.total||0),0);
  const totalOpportunities=matched.reduce((n,g)=>n+
   (g.treatment.metrics.itemOpportunities?.[id]?.total||0),0);
  const directEffects={};
  for(const g of matched){
   const result=g.treatment.metrics.itemResults?.[id]||{};
   for(const [key,value] of Object.entries(result))
    if(typeof value==="number")inc(directEffects,key,value);
  }
  const modes={};
  for(const g of matched)
   add(modes,g.treatment.metrics.itemUses?.[id]?.byMode);
  byItem[id]={pairs:matched.length,plannedPairs:c.mode==="survey"?0:c.pairsPerItem,
   triggered:totalOpportunities,uses:totalUses,
   runsWithUse:usedRuns,usedRunFraction:matched.length?usedRuns/matched.length:null,
   observedDirectEffects:directEffects,usesByMode:modes,
   resourceMatched:"extra "+id+" versus extra ex-rations",
   grantCompliance:compliant,
   delta:estimates,
   verdict:matched.length<c.pairsPerItem?"INCOMPLETE":
    compliant!==matched.length?"INSPECT GRANT COMPLIANCE":
    estimates.won.ci95&&estimates.won.ci95[0]>0?"BETTER WIN RATE THAN RATIONS":
    estimates.won.ci95&&estimates.won.ci95[1]<0?"WORSE WIN RATE THAN RATIONS":
    "WIN-RATE EFFECT NOT RESOLVED (review actions, combat and HP too)"};
  for(const p of matched)pairedCsv.push({itemId:id,sample:p.control.sample,
   seed:p.control.seed,hero:p.control.heroes.join("+"),
   ...Object.fromEntries(metrics.map(k=>["delta_"+k,
    Number(p.treatment[k])-Number(p.control[k])]))});
 }
 const rawCover=coverage(c.mode==="pairs"?pairs:survey),total=rows.length;
 const scalarTotals={};
 for(const row of survey)
  for(const [k,v] of Object.entries(row.metrics))
   if(typeof v==="number"&&Number.isFinite(v))inc(scalarTotals,k,v);
 const endings={};
 for(const row of survey)inc(endings,row.ending||"unknown");
 const wipes={};const stages={};
 for(const row of survey){
  if(row.wipeCause)inc(wipes,row.wipeCause);
  for(const [stage,cell] of Object.entries(row.byStage||{})){
   const agg=stages[stage]??={normal:[],corridors:[]};
   agg.normal.push(cell.normal);agg.corridors.push(cell.corridors);
  }
 }
 const stageStats=Object.fromEntries(Object.entries(stages).map(
  ([stage,v])=>[stage,{normal:ci(v.normal),corridors:ci(v.corridors)}]));
 const uniqueSeeds=new Set(survey.map(r=>r.seed)).size;
 const complete=total===expected&&rows.every((r,i)=>r.i===i);
 const summary={
  schema:"everything-goes-decision-report-v1",complete,planned:expected,
  completed:total,design:c.design,
  survey:{planned:c.mode==="pairs"?0:c.runs,completed:survey.length,
   wins:survey.filter(r=>r.won).length,
   winRate:survey.length?survey.filter(r=>r.won).length/survey.length:null,
   winWilson95:wilson(survey.filter(r=>r.won).length,survey.length),
   sample: Object.fromEntries(metrics.map(k=>[k,ci(survey.map(r=>Number(r[k])))])),
   scalarTotals,endings,wipeCauses:wipes,stages:stageStats,
   uniqueSeeds,parties},
  matchedItems:byItem,
  coverage:rawCover,
  limitations:[
   "This reports canonical game-engine events and actions, not actual tabletop minutes.",
   "A player MCTS decision is a policy observation, NOT a random assignment to alternative choices.",
   "Item pairing changes which extra physical Item the first Hero starts with; it does not measure an Item's exact intrinsic power.",
   "Unseen card effects and underpowered subgroups must stay explicitly unknown.",
   "The policy is full-session UCT with a stated 12-consecutive-equipment-action progress cap; it is not proof of optimal human play.",
   "A single simulation seed pair can diverge after deck or Item intervention; seeds are matched, not forced identical post-intervention."
  ]
 };
 return {summary,rows,pairedCsv};
}
function save(c,done,expected){
 const {summary,rows,pairedCsv}=createReport(c,done,expected);
 atomic(join(c.out,"summary.json"),summary);
 atomic(join(c.out,"coverage.json"),summary.coverage);
 atomic(join(c.out,"validation.json"),{
  complete:summary.complete,completed:summary.completed,planned:expected,
  fixedGitRevision:true,canonicalMCTS:true,actualDiceOnly:true,
  allDecisionTapesPresent:rows.every(r=>existsSync(join(c.out,r.rawFile))),
  coverageDenominatorsProvided:true,
  unsupportedCausalInferenceAvoided:true,
  decisionReady:summary.complete&&rows.every(r=>existsSync(join(c.out,r.rawFile)))});
 csv(join(c.out,"runs.csv"),rows.map(r=>({
  index:r.i,group:r.group,itemId:r.itemId,sample:r.sample,arm:r.arm,
  seed:r.seed,heroes:r.heroes.join("+"),win:Number(r.won),
  ending:r.ending,actions:r.actions,decisions:r.decisionEvents,
  rooms:r.rooms,
  equipmentProgressBreaks:r.equipmentProgressBreaks,
  encounters:r.encounterStarts,combats:r.combatStarts,kills:r.kills,
  drawn:r.drawn,hpLoss:r.hpLoss,dice:r.dice,
  ordinaryCombats:r.ordinaryCombats,bossCombats:r.bossCombats,
  corridors:r.corridors,finalHp:r.totalFinalHp,
  wipeCause:r.wipeCause,wipeStage:r.wipeStage,
  upperRooms:r.byStage.UPPER.normal,middleRooms:r.byStage.MIDDLE.normal,
  deepRooms:r.byStage.DEEP.normal,
  searchMs:r.searchMs,transitionMs:r.transitionMs,
  rawFile:r.rawFile,rawSha256:r.rawSha256
 })));
 csv(join(c.out,"paired-item-effects.csv"),pairedCsv);
 const cardRows=[
  ...ALL_ROOMS.map(card=>({type:"room",id:card.id,stage:card.stage})),
  ...ALL_MONSTERS.map(card=>({type:"monster",id:card.id,stage:card.stage})),
  ...ALL_OBJECTS.map(card=>({type:"item",id:card.id,stage:""}))
 ].map(x=>({...x,entered:summary.coverage.visits[x.id]||0,
   encountered:summary.coverage.aggregate.monsterVisits[x.id]||0,
   acquired:summary.coverage.aggregate.objectAcquisitions[x.id]||0,
   drawn:summary.coverage.aggregate.objectDraws[x.id]||0,
   itemOpportunities:summary.coverage.aggregate.itemOpportunities[x.id]?.total||0,
   itemUses:summary.coverage.aggregate.itemUses[x.id]?.total||0,
   exposureRooms:summary.coverage.aggregate.objectRoomExposures[x.id]||0,
   monsterKills:summary.coverage.aggregate.monsterKillsById[x.id]||0,
   monsterFights:summary.coverage.aggregate.monsterFightStartsById[x.id]||0,
   hpDamageInContext:summary.coverage.aggregate.damageContextById[x.id]||0,
   parleyAttempts:summary.coverage.aggregate.monsterParleyAttemptsById[x.id]||0,
   parleyWins:summary.coverage.aggregate.monsterParleyWinsById[x.id]||0,
   option0Chosen:summary.coverage.aggregate.roomChoices[x.id+":0"]||0,
   option1Chosen:summary.coverage.aggregate.roomChoices[x.id+":1"]||0,
   option0Available:summary.coverage.aggregate.roomOptionAvailable[x.id+":0"]||0,
   option1Available:summary.coverage.aggregate.roomOptionAvailable[x.id+":1"]||0,
   itemPassive:summary.coverage.aggregate.itemPassiveEffects[x.id]?.triggers||0,
   legalActionOffers:summary.coverage.actionOfferedByCard[x.id+":item-trigger"]||0,
   legalActionsChosen:summary.coverage.actionChosenByCard[x.id+":item-trigger"]||0
 }));
 csv(join(c.out,"card-coverage.csv"),cardRows);
 const fmt=x=>x===null?"n/a":(x*100).toFixed(1)+"%";
 const lines=[
  "# Everything Goes - full event and paired Item study","",
  summary.complete?"COMPLETE: all planned seeds and arms present":
   "PARTIAL: DO NOT use as a final balance verdict; resume with --resume",
  "", "Planned runs: "+expected,
  "Completed full games: "+summary.completed,
  "Organic survey: "+summary.survey.completed+" games",
  "Organic win rate: "+fmt(summary.survey.winRate),
  "Organic 95% Wilson CI: "+JSON.stringify(summary.survey.winWilson95),
  "", "## Organic pacing and outcomes",
  ...Object.entries(summary.survey.sample).map(([key,v])=>
   "- "+key+": "+(v?Number(v.mean.toFixed(3)):"not measured")+
   (v?.ci95?" (95% CI "+v.ci95.map(n=>n.toFixed(3)).join(" .. ")+")":"")),
  "", "## Coverage gaps (never claim a balanced unseen design)",
  ...Object.entries(summary.coverage.missing).map(([key,ids])=>
   "- "+key+": "+ids.length+" of catalogue; "+
   (ids.slice(0,30).join(", ")||"none")),
  "", "## Matched Item resource tests",
  "Treatment gets one extra copy of the new Item; control gets one extra Dry Rations.",
  "A paired difference answers *relative extra starting resources*, not intrinsic card strength.",
  ...Object.entries(summary.matchedItems).map(([id,v])=>"- "+id+": "+
   v.pairs+"/"+v.plannedPairs+" matched pairs; triggered="+v.triggered+
   ", uses="+v.uses+", used in="+v.runsWithUse+" runs; "+
   "direct outcomes="+JSON.stringify(v.observedDirectEffects)+
   "; win-rate delta="+(v.delta.won?.mean??"n/a")+
   " (95% CI "+JSON.stringify(v.delta.won?.ci95)+"); "+v.verdict),
  "", "## Per-Monster performance (organic exposures; not causal)",
  ...ALL_MONSTERS.map(card=>{
   const visits=summary.coverage.aggregate.monsterVisits[card.id]||0;
   const kills=summary.coverage.aggregate.monsterKillsById[card.id]||0;
   const attempts=summary.coverage.aggregate.monsterParleyAttemptsById[card.id]||0;
   const wins=summary.coverage.aggregate.monsterParleyWinsById[card.id]||0;
   const fights=summary.coverage.aggregate.monsterFightStartsById[card.id]||0;
   const damage=summary.coverage.aggregate.damageContextById[card.id]||0;
   return "- "+card.title+" ["+card.stage+"]: encounters="+visits+
    ", fought="+fights+", defeated="+kills+
    ", parley="+wins+"/"+attempts+", HP lost in context="+damage;
  }),
  "", "## Every Item (acquired / triggered opportunities / used / exposure Rooms)",
  ...ALL_OBJECTS.map(card=>{
   const id=card.id,c=summary.coverage.aggregate;
   return "- "+card.title+": "+(c.objectAcquisitions[id]||0)+" / "+
    (c.itemOpportunities[id]?.total||0)+" / "+
    (c.itemUses[id]?.total||0)+" / "+
    (c.objectRoomExposures[id]||0);
  }),
  "", "## Every Room (entered / option 1 / option 2 / d6 bands)",
  ...ALL_ROOMS.map(card=>{
   const id=card.id,c=summary.coverage.aggregate;
   return "- "+card.title+" ["+card.stage+"]: entered="+
    (summary.coverage.visits[id]||0)+", choices="+
    (c.roomChoices[id+":0"]||0)+"/"+(c.roomChoices[id+":1"]||0)+
    ", d6="+[0,1,2].map(b=>c.roomRollBands[id+":"+b]||0).join("/");
  }),
  "", "## Actual decisions and random die faces",
  ...Object.entries(summary.coverage.phaseCounts).map(([key,n])=>
   "- phase "+key+": "+n+" decisions"),
  ...Object.entries(summary.coverage.legalActions).map(([key,n])=>
   "- option "+key+": "+n+" available"),
  ...Object.entries(summary.coverage.chosen).map(([key,n])=>
   "- chosen "+key+": "+n),
  ...Object.entries(summary.coverage.diceFaces).map(([key,n])=>
   "- actual die "+key+": "+n),
  "", "## Terminal causes and scalar engine counters",
  ...Object.entries(summary.survey.endings).map(([key,n])=>"- "+key+": "+n),
  ...Object.entries(summary.survey.scalarTotals).map(([key,n])=>"- "+key+": "+n),
  "", "## Raw reproducibility",
  "raw/NNNNNN.json.gz: complete legal-action menus, choices,",
  "per-decision before/after game states, recursive engine-metric changes,",
  "real committed dice and MCTS root search statistics.",
  "runs.csv, card-coverage.csv, paired-item-effects.csv: analysis-ready tables.",
  "manifest.json and checkpoints/: pinned revision and deterministic resume.",
  "", "## Limits",
  ...summary.limitations.map(x=>"- "+x)
 ];
 writeFileSync(join(c.out,"summary.md"),lines.join("\n")+"\n");
 return summary;
}
if(!isMainThread){
 parentPort.on("message",message=>{
  if(message.type!=="run")return;
  try{parentPort.postMessage({type:"done",
   result:work(message.job,workerData.config)})}
  catch(e){parentPort.postMessage({type:"failed",index:message.job.i,
   error:e.stack||String(e)})}
 });
}else{
 const c=parse(process.argv.slice(2)),planned=jobs(c);
 if(c.dryRun){
  console.log(JSON.stringify({design:c.design,signature:c.signature,
   plannedGames:planned.length,workers:c.workers,hours:c.hours,
   out:c.out,note:"No files or game runs created"},null,2));
 }else{
  const commit=git(["rev-parse","HEAD"]);
  if(!commit)throw Error("Git source revision is mandatory");
  const dirty=git(["status","--porcelain"]);
  if(dirty)throw Error("Study requires a clean checkout. Commit or stash "+
   "your edits (including illustration mapping changes) before running:\n"+dirty);
  if(c.resume){
   const manifest=JSON.parse(readFileSync(join(c.out,"manifest.json"),"utf8"));
   if(manifest.commit!==commit||manifest.signature!==c.signature)
    throw Error("Incompatible resume: source revision or design changed");
  }else{
   if(existsSync(c.out))throw Error("Output exists. Use --resume or a new --out.");
   for(const path of ["","raw","checkpoints"])
    mkdirSync(join(c.out,path),{recursive:true});
   atomic(join(c.out,"manifest.json"),{schema:1,commit,
    signature:c.signature,design:c.design,
    createdAt:new Date().toISOString(),node:process.version,
    platform:process.platform,arch:process.arch,
    plannedGames:planned.length});
  }
  const done=new Map();
  for(const name of readdirSync(join(c.out,"checkpoints"))){
   if(!/^[0-9]{6}\.json$/.test(name))throw Error("Unexpected checkpoint "+name);
   const data=JSON.parse(readFileSync(join(c.out,"checkpoints",name),"utf8"));
   const wanted=planned[data.result?.i];
   if(data.signature!==c.signature||!wanted||
      wanted.i!==data.result.i||wanted.seed!==data.result.seed||
      wanted.arm!==data.result.arm)throw Error("Invalid checkpoint "+name);
   const raw=join(c.out,data.result.rawFile);
   if(!existsSync(raw)||sha(readFileSync(raw))!==data.result.rawSha256)
    throw Error("Raw tape corrupted or absent: "+raw);
   done.set(data.result.i,data.result);
  }
  const queue=planned.filter(x=>!done.has(x.i));
  console.error("Everything Goes deep study "+done.size+"/"+planned.length+
   " completed, "+queue.length+" outstanding, "+c.workers+" workers");
  const workers=Array.from({length:Math.min(c.workers,queue.length)},()=>
   new Worker(new URL(import.meta.url),{workerData:{config:c}}));
  const active=new Map();let cursor=0,finished=false,failure=null;
  const deadline=Date.now()+c.hours*3600000;
  const pulse=setInterval(()=>{
   save(c,done,planned.length);
   console.error("Completed "+done.size+"/"+planned.length);
  },60000);
  try{
   await new Promise((ok,reject)=>{
    const assign=w=>{
     if(finished||failure)return;
     if(Date.now()>=deadline||cursor>=queue.length){
      if(active.size===0){finished=true;ok();}
      return;
     }
     const job=queue[cursor++];
     active.set(w,job.i);w.postMessage({type:"run",job});
    };
    if(!workers.length){finished=true;ok();}
    for(const w of workers){
     w.on("message",message=>{
      if(failure)return;
      if(message.type==="failed"){
       failure=Error("Job "+message.index+" failed:\n"+message.error);
       reject(failure);return;
      }
      const row=message.result;
      if(active.get(w)!==row.i){
       failure=Error("Unmatched worker result");reject(failure);return;
      }
      atomic(join(c.out,"checkpoints",
       String(row.i).padStart(6,"0")+".json"),{
        signature:c.signature,result:row});
      done.set(row.i,row);active.delete(w);
      if(done.size%10===0)console.error("Saved "+done.size+" full games");
      assign(w);
      if(!active.size&&(cursor>=queue.length||Date.now()>=deadline)){
       finished=true;ok();
      }
     });
     w.on("error",err=>{if(!failure){failure=err;reject(err);}});
     w.on("exit",code=>{if(code&&!finished&&!failure){
      failure=Error("Worker exited "+code);reject(failure);
     }});
     assign(w);
    }
   });
  }finally{
   clearInterval(pulse);
   await Promise.all(workers.map(w=>w.terminate()));
   const report=save(c,done,planned.length);
   console.error("Saved "+report.completed+"/"+planned.length+
    " full experiments to "+c.out);
  }
  if(done.size!==planned.length){
   console.error("Partial result: resume with exactly the same flags and --resume.");
   process.exitCode=2;
  }
 }
}
