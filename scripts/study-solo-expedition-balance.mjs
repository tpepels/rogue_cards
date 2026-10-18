#!/usr/bin/env node
/**
 * FULL 36-Room canonical SOlO expedition balance study.
 * Paired independent game seeds across the two primary MCTS policies:
 *   UCT, UCT+implicit. Sampled expectimax is a separate opt-in arm.
 * Every decision is committed through the canonical decision session.
 *
 * The optional --from-study must be a FINISHED solo combat research
 * summary. It only supplies heuristic-mode and expectimax settings;
 * the full-expedition seed is disjoint and no training data is reused.
 *
 * No automatic nerfs/buffs, fabricated cards, scripted combat or
 * nonterminal-as-loss conversions. Source commit is pinned on resume.
 */
import {Worker,isMainThread,parentPort} from "node:worker_threads";
import {cpus} from "node:os";
import {gzipSync,gunzipSync} from "node:zlib";
import {createDecisionRecorder,experimentSnapshot} from "../src/experiment-telemetry.js";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync,readFileSync,writeFileSync,
 appendFileSync,renameSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {HEROES} from "../src/tabletop-data.js";
import {ALL_MONSTERS,ALL_ROOMS} from "../src/decks.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction,
 forcesEquipmentProgress} from "../src/session-policy.js";

export const SOLO_HEROES=HEROES.map(h=>h.id);
const REGIONAL_MONSTERS=new Set(ALL_MONSTERS.map(m=>m.id));
const ROOM_BY_ID=new Map(ALL_ROOMS.map(room=>[room.id,room]));
const regionalCount=obj=>Object.entries(obj||{}).reduce((n,[id,v])=>
 n+(REGIONAL_MONSTERS.has(id)?v:0),0);
export const BALANCE_TARGETS=Object.freeze({
 soloWinRate:0.40,vaultReachRate:0.50,
 monsterEncountersRange:[16,20],combatConversionRange:[0.55,0.70],
 hpLossPerCombatRange:[0.10,0.20]
});
const ARM_NAMES=["uct","implicit","hybrid"];
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const mean=(arr,fn)=>arr.length?
 arr.reduce((n,x)=>n+fn(x),0)/arr.length:null;
const wilson=(wins,n)=>{
 if(!n)return null;
 const z=1.95996398454,z2=z*z,p=wins/n;
 const den=1+z2/n,mid=(p+z2/(2*n))/den;
 const delta=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/den;
 return [Math.max(0,mid-delta),Math.min(1,mid+delta)];
};
const git=()=>execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
const signature=x=>createHash("sha256")
 .update(JSON.stringify(x)).digest("hex");
const atomic=(path,value)=>{
 const tmp=path+".tmp";
 writeFileSync(tmp,JSON.stringify(value,null,2)+"\n");
 renameSync(tmp,path);
};
const key=r=>r.hero+"|"+r.replicate+"|"+r.arm;
/**
 * Explicitly opt-in to reusing complete recorded trials after THIS
 * observation-only invariant fix. Never accept a changed algorithm,
 * rule card, saved trial plan or unverified trace.
 */
const COMPATIBLE_OBSERVATION_PATHS=new Set([
 "scripts/study-solo-expedition-balance.mjs",
 "scripts/report-solo-balance-details.mjs",
 "tests/solo-expedition-balance.test.mjs",
 "tests/experiment-telemetry.test.mjs",
 "src/experiment-telemetry.js",
 "package.json","README.md","docs/research-workflows.md",
 ".github/workflows/combat-diagnostics.yml",
 ".github/workflows/solo-balance-telemetry.yml"
]);
/**
 * Compare only the EXECUTABLE decision loop, not textual mentions of its
 * declaration inside helpers, tests or diagnostic strings. The previous
 * indexOf matched its own source-code string and falsely rejected a fully
 * compatible recording migration.
 */
export function canonicalSoloDecisionLoop(source){
 if(typeof source!=="string")throw Error("Invalid balance runner source");
 const declarations=[...source.matchAll(
  /^export function playFullSoloExpedition\(\{/gm
 )];
 if(declarations.length!==1)
  throw Error("Expected exactly one actual canonical solo function declaration");
 const begin=declarations[0].index;
 const end=source.indexOf("\n const m=session.state.metrics;",begin);
 if(end<=begin||source.indexOf("\n }",begin)<0)
  throw Error("Cannot establish canonical solo decision loop boundaries");
 const body=source.slice(begin,end);
 if(!body.includes('selectSessionPolicyAction(session,policy,{')||
    !body.includes('submitDecision(session,action,{'))
  throw Error("Canonical solo action selection/commit was not located");
 return body;
}
export function assertBalanceObservationMigration(saved,current,changedPaths){
 if(saved?.schema!=="solo-full-expedition-balance-v1"||
  saved.signature!==signature(saved.design))
  throw Error("Original balance manifest/signature is invalid");
 if(current?.signature!==signature(current.design))
  throw Error("New balance manifest/signature is invalid");
 if(saved.design?.trace!=="full"||current.design?.trace!=="full")
  throw Error("Compatibility migration requires full decision traces");
 const next={...saved.design,revision:current.design.revision};
 if(signature(next)!==current.signature)
  throw Error("Cannot migrate: study parameters or algorithms changed");
 if(!Array.isArray(changedPaths)||!changedPaths.length||
  !changedPaths.includes("scripts/study-solo-expedition-balance.mjs")||
  changedPaths.some(p=>!COMPATIBLE_OBSERVATION_PATHS.has(p)))
  throw Error("Cannot migrate: gameplay, search, or unknown source files changed: "+
   changedPaths.filter(p=>!COMPATIBLE_OBSERVATION_PATHS.has(p)).join(", "));
 return true;
}
function verifyRecordedTraces(records,out){
 const seen=new Set();
 for(const row of records){
  if(seen.has(key(row)))throw Error("Duplicate previous trial "+key(row));
  seen.add(key(row));
  if(!row.traceFile||!row.traceSHA256||
   row.traceEvents!==row.steps||!row.traceFile.startsWith("traces/"))
   throw Error("Missing full recorded telemetry for "+key(row));
  const path=resolve(out,row.traceFile);
  if(!path.startsWith(resolve(out)+"/")||!existsSync(path))
   throw Error("Missing/unsafe recorded trace for "+key(row));
  const bytes=readFileSync(path);
  if(createHash("sha256").update(bytes).digest("hex")!==row.traceSHA256)
   throw Error("Trace checksum mismatch for "+key(row));
  const events=gunzipSync(bytes).toString("utf8").split("\n").filter(Boolean);
  if(events.length!==row.steps)
   throw Error("Trace length mismatch for "+key(row));
  const last=JSON.parse(events.at(-1));
  if(last.after?.heroes?.[0]?.hp!==row.remainingHp)
   throw Error("Recorded last HP mismatch for "+key(row));
 }
 return seen;
}

export function persistSoloDecisionTrace(result,tag,outputDir){
 const events=result.events;
 if(!events||events.length!==result.steps)
  throw Error("Incomplete canonical event trace for "+tag.arm);
 const first=events[0],last=events.at(-1);
 if(first.step!==1||last.step!==result.steps||
  last.after?.heroes?.[0]?.hp!==result.finalHero.hp||
  last.after?.stageProgress?.UPPER!==result.stageProgress.UPPER)
  throw Error("Canonical event trace does not match expedition outcome");
 const dir=join(outputDir,"traces");
 mkdirSync(dir,{recursive:true});
 const name=tag.hero+"-"+tag.replicate+"-"+tag.arm+".jsonl.gz";
 const relative=join("traces",name),path=join(dir,name);
 const compressed=gzipSync(Buffer.from(
  events.map(x=>JSON.stringify(x)).join("\n")+"\n"),{level:5});
 const digest=createHash("sha256").update(compressed).digest("hex");
 writeFileSync(path+".tmp",compressed);
 renameSync(path+".tmp",path);
 delete result.events;
 result.traceFile=relative;
 result.traceSHA256=digest;
 result.traceBytes=compressed.length;
 result.traceEvents=events.length;
 return result;
}

function classifyEnding(s){
 if(s.metrics.won)return "win";
 if(s.metrics.escaped)return "escape";
 if(!s.alive())return "death";
 throw Error("Unexplained terminal state");
}
function addCounts(target,source){
 for(const [name,value] of Object.entries(source||{}))
  if(typeof value==="number"&&Number.isFinite(value))
   target[name]=(target[name]||0)+value;
}
function captureCounts(s){
 const m=s.metrics;
 return {
  monsterVisits:{...m.monsterVisits},
  monsterFights:{...m.monsterFightStartsById},
  monsterKills:{...m.monsterKillsById},
  monsterParley:{...m.monsterParleyAttemptsById},
  monsterParleyWins:{...m.monsterParleyWinsById},
  objectAcquisitions:{...m.objectAcquisitions},
  objectActivations:{...m.objectActivations},
  roomChoices:{...m.roomChoices},
  damageContext:{...m.damageContextById}
 };
}
export function playFullSoloExpedition({
 hero="warrior",seed=20261101,arm="uct",
 c=0.35,alpha=0.4,heuristicMode="solo-threat",
 samples=2,tacticalMax=2,budget=8,recordTelemetry=false,
 equipmentMode="solo-pragmatic",mctsPragmaticVariant="both",
 softTreeBonus=0.15,softTreeFirstVisitProbability=0.75,
 softRolloutProbability=0.75,implicitHpScale=1,implicitThreatScale=1,
 cardPools=null,maxGameSteps=20000,maxSearchSteps=5000
}={}){
 if(!SOLO_HEROES.includes(hero)||!ARM_NAMES.includes(arm))
  throw Error("Only canonical solo Hero and known agent arm are accepted");
 const session=createDecisionSession({
  seed,heroes:[hero],gameMode:"everything-goes",cardPools
 });
 const policy=createSessionPolicy();
 // The canonical transaction engine may replace state.metrics on every
 // committed action. Never hold a metrics reference across the run.
 let decisions=0,searches=0,searchMs=0,combatDecisionCount=0;
 let combatSearchMs=0,vaultSeen=false;
 let vaultEntryHp=null,vaultEntryPlayable=0;
 const pragmaticSimulation={treeShortcuts:0,rolloutShortcuts:0,
  suppressedEquipmentCandidates:0,treeSoftOffered:0,treeSoftChosen:0,
  rolloutSoftOffered:0,rolloutSoftChosen:0,rules:{}};
 const selectedActions={},phaseDecisions={};
 const maxHp=session.state.heroes[0].card.hp;
 const recorder=recordTelemetry?createDecisionRecorder({
  includeLegal:true,includeSearch:true
 }):null;
 const initialSnapshot=recorder?experimentSnapshot(session):null;
 const start=performance.now();
 while(session.phase!=="terminal"){
  if(decisions++>=maxGameSteps)
   throw Error("NONTERMINAL solo expedition after "+maxGameSteps+" decisions");
  const legal=sessionActions(session);
  if(!legal.length)
   throw Error("No canonical action at "+session.phase+" seed "+seed);
  const phase=session.pendingNested?
   "reaction:"+session.pendingNested.trigger?.phase:session.phase;
  if(phase==="vault"||phase==="post-warden"||
   session.state.room?.stage==="FINAL"){
   if(!vaultSeen){
    vaultEntryHp=Math.max(0,session.state.heroes[0].hp);
    vaultEntryPlayable=Number(session.state.heroes[0].hp>0&&
     session.phase!=="terminal");
   }
   vaultSeen=true;
  }
  phaseDecisions[phase]=(phaseDecisions[phase]||0)+1;
  let forced=legal.length===1||
   forcesEquipmentProgress(session,policy,legal);
  const shortcutsBefore=policy.shortcutCount;
  const upgradesBefore=policy.equippedUpgradeCount;
  let shortcutReason=null;
  const started=performance.now();
  let searchDiagnostics=null;
  const action=selectSessionPolicyAction(session,policy,{
   budget,seed:mix(seed^Math.imul(decisions,0xc2b2ae35))||1,
   maxSearchSteps,knowledge:"fair",legalActions:legal,
   searchProfile:"classic",treeMode:"frontier",exploration:c,
   rolloutCombatMode:arm==="hybrid"?"sampled-expectimax":"random",
   rolloutCombatSamples:samples,
   rolloutCombatMaxDecisions:tacticalMax,
   implicitWeight:arm==="uct"?0:alpha,
   implicitHeuristicMode:arm==="uct"?"legacy":heuristicMode,
   equipmentMode,mctsPragmaticVariant,
   softTreeBonus,softTreeFirstVisitProbability,softRolloutProbability,
   implicitHpScale,implicitThreatScale,
   onPolicyDecision:event=>{shortcutReason=event.rule;},
   onSearchResult:result=>{
    if(recorder)searchDiagnostics=result;
    const p=result.pragmaticSimulation;
    if(!p)return;
    for(const key of ["treeShortcuts","rolloutShortcuts",
     "suppressedEquipmentCandidates","treeSoftOffered","treeSoftChosen",
     "rolloutSoftOffered","rolloutSoftChosen"])
     pragmaticSimulation[key]+=p[key]??0;
    for(const [rule,count] of Object.entries(p.rules??{}))
     pragmaticSimulation.rules[rule]=(pragmaticSimulation.rules[rule]??0)+count;
   }
  });
  const spent=performance.now()-started;
  if(policy.equippedUpgradeCount>upgradesBefore||
    policy.shortcutCount>shortcutsBefore)forced=true;
  if(!forced){searches++;searchMs+=spent;}
  if(["combat","combat-hero","parley"].includes(phase)){
   combatDecisionCount++;
   if(!forced)combatSearchMs+=spent;
  }
  if(!legal.includes(action)&&!legal.some(x=>
   JSON.stringify(x)===JSON.stringify(action)))
   throw Error("Selected action not in canonical legal list "+phase);
  selectedActions[action.kind]=(selectedActions[action.kind]||0)+1;
  if(recorder)recorder.handler({
   moment:"before",step:decisions,phase,actions:legal,
   chosen:action,session,searchMs:spent,
   diagnostic:searchDiagnostics,policyRule:shortcutReason
  });
  let committedDice=[];
  const transitionStarted=performance.now();
  submitDecision(session,action,{
   observeResult:false,recordHistory:false,
   ...(recorder?{onCommittedDice:dice=>{committedDice=dice;}}:{})
  });
  if(recorder)recorder.handler({
   moment:"after",step:decisions,phase,actions:legal,
   chosen:action,session,dice:committedDice,
   transitionMs:performance.now()-transitionStarted
  });
 }
 const m=session.state.metrics;
 if(m.roundLimit||m.unresolved)throw Error("Unresolved canonical expedition");
 const ending=classifyEnding(session.state);
 const hp=Math.max(0,session.state.heroes[0].hp);
 const ordinaryEncounters=regionalCount(m.monsterVisits);
 const ordinaryFights=regionalCount(m.monsterFightStartsById);
 const combatContextDamage=regionalCount(m.damageContextById);
 const vaultReached=Boolean(m.vaultEntered||vaultSeen);
 const byStage=Object.fromEntries(["UPPER","MIDDLE","DEEP"].map(stage=>{
  const visited=[...session.state.seenRooms].map(id=>ROOM_BY_ID.get(id)).
   filter(room=>room?.stage===stage);
  return [stage,{
   normal:visited.filter(room=>room.v2.kind!=="CORRIDOR").length,
   corridors:visited.filter(room=>room.v2.kind==="CORRIDOR").length
  }];
 }));
 // Seen Rooms are NOT necessarily completed Rooms: retained/entered
 // rooms and final unresolved Rooms can appear in seenRooms. Only the
 // canonical completed-Room counter supports the 36-Room denominator.
 const hasAll36=m.cleared>=3*session.state.roomGoal;
 // The returning Will-o'-Wisp is registered as another Monster
 // APPEARANCE by completePrintedRoomChoice() without a fresh Monster
 // draw/encounterStarts increment. Those counters have distinct
 // meanings and must NOT be compared by an >= invariant.
 // Trace-driven analysis validates both against canonical metric deltas.

 return {
  schema:"solo-full-canonical-expedition-v1",
  hero,seed,arm,won:Number(ending==="win"),ending,
  vaultReached:Number(vaultReached),vaultEntryHp,vaultEntryPlayable,
  steps:decisions,
  searches,searchMs,combatSearchMs,combatDecisions:combatDecisionCount,
  elapsedMs:performance.now()-start,
  maxHp,remainingHp:hp,hpLost:maxHp-hp,
  roomsCleared:m.cleared,stageProgress:{...session.state.stageProgress},
  byStage,hasAll36:Number(hasAll36),
  ordinaryEncounters,ordinaryFights,combatContextDamage,
  // Fresh Monster draws accepted as encounters; differs from returning
  // appearances such as a Will-o'-Wisp pursuing the Hero.
  encounterStarts:m.encounterStarts,combatStarts:m.combatStarts,
  fightsPerEncounter:ordinaryEncounters?
   ordinaryFights/ordinaryEncounters:null,
  damage:m.damage,kills:m.kills,drawn:m.drawn,spent:m.spent,
  elberethAttempts:m.elberethAttempts,elberethSuccesses:m.elberethSuccesses,
  elberethFlees:m.elberethFlees,negotiations:m.negotiations,
  negotiationsWon:m.negotiationsWon,
  itemsUsed:Object.values(m.itemUses||{})
   .reduce((n,x)=>n+(x.total||0),0),
  wipeCause:m.wipeCause??null,wipeStage:m.wipeStage??null,
  endingKind:session.state.endingKind??null,
  selectedActions,phaseDecisions,coverage:captureCounts(session.state),
  finalMetrics:JSON.parse(JSON.stringify(m)),
  finalInventory:session.state.heroes[0].inventory.map(card=>({
   id:card.id,physicalCopy:card._physicalCopy??null
  })),
  finalHero:{
   hp:session.state.heroes[0].hp,poison:!!session.state.heroes[0].poison,
   maxHp,status:Object.fromEntries(Object.entries(session.state.heroes[0])
    .filter(([,v])=>v===null||["string","number","boolean"].includes(typeof v)))
  },
  initialSnapshot,
  finalSnapshot:recorder?experimentSnapshot(session):null,
  events:recorder?recorder.finish():null,
  equipmentBreaks:policy.cycleBreaks,
  equippedUpgradeCount:policy.equippedUpgradeCount,
  equipmentChoicesSuppressed:policy.equipmentChoicesSuppressed,
  policyShortcutCount:policy.shortcutCount,
  policyShortcutReasons:{...policy.shortcutCounts},
  equipmentMode,mctsPragmaticVariant,pragmaticSimulation,
  stagingId:cardPools?.stagingId??null,
  seenRoomIds:[...session.state.seenRooms]
 };
}
export function parseSoloBalanceArgs(argv){
 const dryRun=argv.includes("--dry-run");
 const resumeCompatible=argv.includes("--resume-compatible-metrics-fix");
 if(argv.filter(x=>x==="--dry-run").length>1||
  argv.filter(x=>x==="--resume-compatible-metrics-fix").length>1)
  throw Error("Duplicate solo balance flag");
 argv=argv.filter(x=>!["--dry-run",
  "--resume-compatible-metrics-fix"].includes(x));
 const opts={},allowed=new Set(["--hours","--workers","--runs-per-hero",
  "--seed","--budget","--c","--alpha","--heuristic","--samples",
  "--tactical-max","--from-study","--out","--arms",
  "--max-game-steps","--max-search-steps","--trace",
  "--equipment-policy","--mcts-pragmatic"]);
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!allowed.has(k)||v===undefined||Object.hasOwn(opts,k))
   throw Error("Unknown/duplicate/missing solo balance option "+k);
  opts[k]=v;
 }
 const int=(k,def,min,max)=>{
  const n=Number(opts[k]??def);
  if(!Number.isSafeInteger(n)||n<min||n>max)
   throw Error(k+" must be an integer in ["+min+","+max+"]");
  return n;
 };
 const c=Number(opts["--c"]??0.35),alpha=Number(opts["--alpha"]??0.4);
 if(!Number.isFinite(c)||c<0||c>10||
  !Number.isFinite(alpha)||alpha<0||alpha>1)
  throw Error("Invalid C/alpha");
 const heuristic=opts["--heuristic"]??(
  opts["--from-study"]?"auto":"solo-threat");
 if(!["auto","legacy","solo-hp","solo-threat"].includes(heuristic))
  throw Error("Unknown solo heuristic");
 if(heuristic==="auto"&&!opts["--from-study"])
  throw Error("--heuristic auto requires --from-study");
 const armNames=(opts["--arms"]??"uct,implicit").split(",");
 if(armNames.length<2||new Set(armNames).size!==armNames.length||
  armNames.some(a=>!ARM_NAMES.includes(a))||!armNames.includes("uct")||
  !armNames.includes("implicit"))
  throw Error("--arms must include uct,implicit and optionally hybrid, no repeats");
 const equipmentMode=opts["--equipment-policy"]??"solo-pragmatic";
 if(!["legacy","solo-efficient","solo-pragmatic"].includes(equipmentMode))
  throw Error("--equipment-policy must be legacy, solo-efficient or solo-pragmatic");
 const mctsPragmaticVariant=opts["--mcts-pragmatic"]??"both";
 if(!["external-only","tree-only","rollout-only","both"].includes(
  mctsPragmaticVariant))throw Error("--mcts-pragmatic invalid variant");
 const trace=opts["--trace"]??"full";
 if(!["full","off"].includes(trace))
  throw Error("--trace must be full or off");
 const seed=int("--seed",20261101,1,0xffffffff);
 return {
  dryRun,resumeCompatible,hours:int("--hours",12,1,72),workers:int("--workers",8,1,32),
  runsPerHero:int("--runs-per-hero",80,1,2000),
  seed,budget:int("--budget",8,1,256),c,alpha,heuristic,
  arms:armNames,trace,equipmentMode,mctsPragmaticVariant,
  samples:int("--samples",2,1,6),
  tacticalMax:int("--tactical-max",2,1,64),
  maxGameSteps:int("--max-game-steps",20000,1,100000),
  maxSearchSteps:int("--max-search-steps",5000,1,100000),
  sourceStudy:opts["--from-study"]?resolve(opts["--from-study"]):null,
  out:resolve(opts["--out"]??"results/solo-balance-"+seed)
 };
}
export function chooseHeuristicFromCompletedStudy(path,armPrefix="hybrid"){
 if(!["implicit","hybrid"].includes(armPrefix))
  throw Error("Unsupported solo research comparison "+armPrefix);
 const study=JSON.parse(readFileSync(path,"utf8"));
 if(study.schema!=="solo-mcts-overnight-v1")
  throw Error("Unknown solo overnight tuning study");
 // A time-boxed eight-hour run can end with unfinished optional trials.
 // Require genuinely paired, sufficiently exposed published results,
 // rather than demanding completion of its impossible-to-exhaust grid.
 if(study.completedTrials<300)
  throw Error("Too few finished solo tuning trials for auto selection");
 const rows=study.results.filter(r=>r.mode==="cpu-calibrated"&&
  r.arm.startsWith(armPrefix+"-")&&
  ["legacy","solo-hp","solo-threat"].includes(
   r.arm.slice(armPrefix.length+1)));
 if(rows.length!==3||rows.some(r=>!Number.isFinite(r.meanFitness)||
  r.count<32||r.scenarioTypes<16))
  throw Error("Source study has insufficient solo hybrid data");
 // Keep the sample counts comparable (a partial run might contain only
 // one unfinished task on some arms). Larger imbalances are rejected.
 const counts=rows.map(r=>r.count);
 if(Math.max(...counts)-Math.min(...counts)>2)
  throw Error("Source solo heuristic arms are not equally exposed");
 const ranked=[...rows].sort((a,b)=>b.meanFitness-a.meanFitness||
  b.meanClear-a.meanClear||a.meanSearchMs-b.meanSearchMs);
 return {heuristic:ranked[0].arm.slice(armPrefix.length+1),
  source:ranked.map(r=>({arm:r.arm,
   meanFitness:r.meanFitness,meanClear:r.meanClear,
   count:r.count,searchMs:r.meanSearchMs})),
  selectedFrom:path};
}
function summarizeCell(items){
 const n=items.length,wins=items.reduce((x,r)=>x+r.won,0);
 const vaultCount=items.reduce((x,r)=>x+r.vaultReached,0);
 const monsters={},fights={},kills={},parleys={},itemsAcquired={},itemsUsed={};
 const causes={},stages={};
 for(const row of items){
  addCounts(monsters,row.coverage.monsterVisits);
  addCounts(fights,row.coverage.monsterFights);
  addCounts(kills,row.coverage.monsterKills);
  addCounts(parleys,row.coverage.monsterParley);
  addCounts(itemsAcquired,row.coverage.objectAcquisitions);
  addCounts(itemsUsed,row.coverage.objectActivations);
  if(row.wipeCause)causes[String(row.wipeCause)]=(causes[String(row.wipeCause)]||0)+1;
  if(row.wipeStage)stages[String(row.wipeStage)]=(stages[String(row.wipeStage)]||0)+1;
 }
 const encounterCount=items.reduce((x,r)=>x+r.ordinaryEncounters,0);
 const combatCount=items.reduce((x,r)=>x+r.ordinaryFights,0);
 const complete36=items.filter(r=>r.hasAll36===1);
 const eligibleCombat=items.filter(r=>r.ordinaryFights>0);
 const fightDamage=eligibleCombat.reduce((n,r)=>
  n+r.combatContextDamage,0);
 const combatMaxHpDenominator=eligibleCombat.reduce((n,r)=>
  n+r.ordinaryFights*r.maxHp,0);
 return {n,wins,winRate:n?wins/n:null,winWilson95:wilson(wins,n),
  vaultRate:mean(items,r=>r.vaultReached),
  vaultWilson95:wilson(vaultCount,n),
  roomsCleared:mean(items,r=>r.roomsCleared),
  ordinaryEncounters:mean(items,r=>r.ordinaryEncounters),
  freshEncounterStarts:mean(items,r=>r.encounterStarts),
  ordinaryFights:mean(items,r=>r.ordinaryFights),
  combatConversion:encounterCount?combatCount/encounterCount:null,
  full36Runs:complete36.length,
  ordinaryEncountersAmongFull36:mean(complete36,r=>r.ordinaryEncounters),
  combatContextHPFraction:combatMaxHpDenominator?
   fightDamage/combatMaxHpDenominator:null,
  // Preserve ALL-source damage separately, never conflate it with
  // the combat-context HP target.
  meanDamageAllSources:mean(items,r=>r.damage),
  meanSteps:mean(items,r=>r.steps),
  meanSearchSeconds:mean(items,r=>r.searchMs/1000),
  meanWallSeconds:mean(items,r=>r.elapsedMs/1000),
  itemUses:mean(items,r=>r.itemsUsed),
  policyShortcuts:mean(items,r=>r.policyShortcutCount??0),
  negotiations:mean(items,r=>r.negotiations),
  elbereth:mean(items,r=>r.elberethAttempts),
  monsterVisits:monsters,monsterFights:fights,monsterKills:kills,
  monsterParleys:parleys,itemAcquisitions:itemsAcquired,
  itemActivations:itemsUsed,deathCauses:causes,deathStages:stages
 };
}
export function soloBalanceSummary(records,design){
 const arms=design?.arms??ARM_NAMES;
 const cells=Object.fromEntries(arms.map(arm=>[
  arm,{
   overall:summarizeCell(records.filter(r=>r.arm===arm)),
   byHero:Object.fromEntries(SOLO_HEROES.map(hero=>[
    hero,summarizeCell(records.filter(r=>r.arm===arm&&r.hero===hero))
   ]))
  }
 ]));
 const paired=[];
 const reference=new Map(records.filter(r=>r.arm==="uct")
  .map(r=>[r.hero+"|"+r.replicate,r]));
 for(const arm of arms.filter(a=>a!=="uct")){
  const matches=records.filter(r=>r.arm===arm).flatMap(r=>{
   const b=reference.get(r.hero+"|"+r.replicate);
   return b?[{hero:r.hero,win:r.won-b.won,
    vault:r.vaultReached-b.vaultReached,
    rooms:r.roomsCleared-b.roomsCleared,
    timeMs:r.searchMs-b.searchMs}]:[];
  });
  const n=matches.length,improved=matches.filter(r=>r.win>0).length,
   worsened=matches.filter(r=>r.win<0).length,
   diff=n?(improved-worsened)/n:null,
   discordance=n?(improved+worsened)/n:0,
   se=n?Math.sqrt(Math.max(0,(discordance-diff*diff)/n)):null;
  paired.push({
   arm,reference:"uct",pairedHeroSeeds:n,
   meanWinDifference:diff,
   improved,worsened,unchanged:n-improved-worsened,
   paired95:n?[Math.max(-1,diff-1.96*se),
    Math.min(1,diff+1.96*se)]:null,
   meanVaultDifference:mean(matches,r=>r.vault),
   meanRoomsDifference:mean(matches,r=>r.rooms),
   meanAdditionalSearchMs:mean(matches,r=>r.timeMs),
   byHero:Object.fromEntries(SOLO_HEROES.map(h=>{
    const group=matches.filter(r=>r.hero===h);
    return [h,{n:group.length,meanWinDifference:mean(group,r=>r.win)}];
   }))
  });
 }
 return {
  schema:"solo-full-expedition-balance-v1",design,targets:BALANCE_TARGETS,
  completed:records.length,
  independentSeedHeroPairs:new Set(records.map(x=>x.hero+"|"+x.replicate)).size,
  rowsByArm:cells,paired,
  evidenceGate:{
   minIndependentRunsPerHeroPerArm:80,
   sufficient:Object.values(cells).every(x=>
    Object.values(x.byHero).every(h=>h.n>=80)),
   status:Object.values(cells).every(x=>
    Object.values(x.byHero).every(h=>h.n>=80))?
    "DESCRIPTIVE_REVIEW_READY":"INSUFFICIENT_HERO_REPLICATION"
  },
  caveats:[
   "Full canonical Everything Goes expeditions from ordinary shuffled physical decks, exactly one Hero each.",
   "Only real terminal wins, escapes and deaths are counted; unsupported/nonterminal outcomes fail the run, not recorded as losses.",
   "Every selected AI arm starts each paired Hero-seed with the same initial RNG/deck, but subsequent dice sequences may diverge after different decisions.",
   "Fixed outer MCTS visits across arms do NOT imply equal CPU time; compare meanSearchSeconds and wall seconds.",
   "Causal card balance requires controlled counterfactual changes; monster/card usage is descriptive exposure, not standalone evidence of imbalance.",
   "Ordinary Monster appearances (monsterVisits) can include returning Will-o'-Wisps, while encounterStarts counts new encounter draws. Do not compare them with a >= invariant.",
   "Ordinary encounter/fight rates use ONLY regional Monsters. Warden phases are excluded.",
   "The 16–20 encounter target is assessed ONLY in runs that canonically COMPLETED 36 normal Rooms (metrics.cleared), not just saw them; if full36Runs=0 the target remains unmeasured.",
   "Combat-context damage is measured by the engine's Monster-ID damage counters (not general damage). Fractions are weighted by fights × starting maximum Hero HP.",
   "Only complete matched rows are used for paired agent comparisons; partial research outputs are not convergence evidence.",
   "Source nightly root-decision experiment does not prove full-game success; this evaluation measures it independently."
  ]
 };
}
async function main(){
 const c=parseSoloBalanceArgs(process.argv.slice(2));
 if(c.dryRun){
  const selection=c.heuristic==="auto"?
   chooseHeuristicFromCompletedStudy(c.sourceStudy,
   c.arms.includes("hybrid")?"hybrid":"implicit"):{
    heuristic:c.heuristic
   };
  console.log(JSON.stringify({
   experiment:"solo-full-expedition-balance",
   gameMode:"everything-goes",heroes:SOLO_HEROES,
   policies:c.arms,heuristic:selection.heuristic,
   independentlySeededHeroStarts:c.runsPerHero*SOLO_HEROES.length,
   totalPlannedExpeditions:c.runsPerHero*SOLO_HEROES.length*c.arms.length,
   workers:c.workers,hours:c.hours,budget:c.budget,
   c:c.c,alpha:c.alpha,samples:c.samples,
   tacticalMax:c.tacticalMax,trace:c.trace,equipmentMode:c.equipmentMode,
   mctsPragmaticVariant:c.mctsPragmaticVariant,sourceStudy:c.sourceStudy,
   output:c.out
  },null,2));
  return;
 }
 mkdirSync(c.out,{recursive:true});
 const manifestPath=join(c.out,"manifest.json"),
  recordPath=join(c.out,"trials.ndjson"),
  reportPath=join(c.out,"summary.json");
 const revision=git();
 const selected=c.heuristic==="auto"?
  chooseHeuristicFromCompletedStudy(c.sourceStudy,
   c.arms.includes("hybrid")?"hybrid":"implicit"):{
   heuristic:c.heuristic,selectedFrom:null,source:null
  };
 const studyHash=c.sourceStudy?
  createHash("sha256").update(readFileSync(c.sourceStudy)).digest("hex"):null;
 const design={
  revision,seed:c.seed,runsPerHero:c.runsPerHero,budget:c.budget,
  maxGameSteps:c.maxGameSteps,maxSearchSteps:c.maxSearchSteps,
  c:c.c,alpha:c.alpha,
  heuristicMode:selected.heuristic,
  samples:c.samples,tacticalMax:c.tacticalMax,
  trace:c.trace,equipmentMode:c.equipmentMode,
  mctsPragmaticVariant:c.mctsPragmaticVariant,traceSchema:"solo-full-expedition-decision-trace-v1",
  sourceStudy:c.sourceStudy,sourceStudyHash:studyHash,
  sourceRanking:selected.source,gameMode:"everything-goes",
  heroes:SOLO_HEROES,arms:c.arms
 };
 const manifest={schema:"solo-full-expedition-balance-v1",design,
  signature:signature(design)};
 const records=existsSync(recordPath)?readFileSync(recordPath,"utf8")
  .split("\n").filter(Boolean).map(JSON.parse):[];
 if(existsSync(manifestPath)){
  const saved=JSON.parse(readFileSync(manifestPath,"utf8"));
  if(saved.signature!==manifest.signature){
   if(!c.resumeCompatible)
    throw Error("Code revision or design changed. To reuse FULLY "+
     "traced episodes after the fixed Wisp invariant only, pass "+
     "--resume-compatible-metrics-fix; otherwise use a new --out.");
   execFileSync("git",["merge-base","--is-ancestor",
    saved.design.revision,revision],{stdio:"ignore"});
   if(execFileSync("git",["status","--porcelain",
    "--untracked-files=no"],{encoding:"utf8"}).trim())
    throw Error("Cannot adopt prior trials with uncommitted tracked changes");
   const changed=execFileSync("git",["diff","--name-only",
    saved.design.revision,revision],{encoding:"utf8"}).trim()
    .split("\n").filter(Boolean);
   assertBalanceObservationMigration(saved,manifest,changed);
   // Checking only filenames would permit another agent to modify
   // gameplay inside the balance runner. Verify the full canonical
   // game loop byte-for-byte across both revisions as well.
   const previousRunner=execFileSync("git",["show",
    saved.design.revision+":scripts/study-solo-expedition-balance.mjs"],
    {encoding:"utf8"});
   const currentRunner=readFileSync(fileURLToPath(import.meta.url),"utf8");
   if(canonicalSoloDecisionLoop(previousRunner)!==
     canonicalSoloDecisionLoop(currentRunner))
    throw Error("Cannot adopt old trials: canonical policy/game loop changed");
   if(!records.length)throw Error("No completed trials to recover");
   verifyRecordedTraces(records,c.out);
   const backup=manifestPath+".before-wisp-invariant-fix.json";
   if(existsSync(backup))
    throw Error("Migration backup already exists; review manually: "+backup);
   writeFileSync(backup,JSON.stringify(saved,null,2)+"\n",{flag:"wx"});
   const migration={
    fromRevision:saved.design.revision,toRevision:revision,
    completedTrialsReused:records.length,changedFiles:changed,
    source:"explicit Wisp encounter-count invariant correction",
    time:new Date().toISOString()
   };
   atomic(manifestPath,{...manifest,
    originalRevision:saved.originalRevision??saved.design.revision,
    migrations:[...(saved.migrations||[]),migration]});
   console.log("Verified and adopted "+records.length+
    " fully traced prior expeditions; original manifest saved at "+backup);
  }
 }else atomic(manifestPath,manifest);
 const seen=c.trace==="full"?verifyRecordedTraces(records,c.out):
  new Set(records.map(key));
 if(seen.size!==records.length)
  throw Error("Duplicate saved solo experiment rows");
 const pending=[];
 for(let replicate=0;replicate<c.runsPerHero;replicate++)
  for(const hero of SOLO_HEROES)
   for(const arm of c.arms){
    const tag={hero,replicate,arm};
    if(seen.has(key(tag)))continue;
    const gameSeed=mix(c.seed^Math.imul(replicate+1,0x85ebca6b)^
     Math.imul(SOLO_HEROES.indexOf(hero)+1,0xc2b2ae35))||1;
    pending.push({tag,args:{
     hero,seed:gameSeed,arm,budget:c.budget,c:c.c,alpha:c.alpha,
     heuristicMode:selected.heuristic,
     samples:c.samples,tacticalMax:c.tacticalMax,
     maxGameSteps:c.maxGameSteps,maxSearchSteps:c.maxSearchSteps,
     equipmentMode:c.equipmentMode,mctsPragmaticVariant:c.mctsPragmaticVariant,
     recordTelemetry:c.trace==="full",traceOutputDir:c.out
    }});
   }
 const workers=[];let active=0,stopped=false;
 const start=Date.now(),deadline=start+c.hours*3600000;
 const persist=()=>{
  const s=soloBalanceSummary(records,design);
  s.remaining=pending.length+active;
  s.elapsedHours=(Date.now()-start)/3600000;
  s.updatedAt=new Date().toISOString();
  s.complete=s.remaining===0;
  atomic(reportPath,s);
  return s;
 };
 const stop=(reason,failed=false)=>{
  if(stopped)return;
  stopped=true;clearInterval(timer);clearTimeout(endTimer);
  const s=persist();
  console.log("Solo balance "+reason+": "+
   s.completed+"/"+(c.runsPerHero*SOLO_HEROES.length*c.arms.length)+
   " completed trials, "+s.remaining+" outstanding; "+reportPath);
  if(failed)process.exitCode=1;
  for(const worker of workers)worker.terminate();
 };
 const assign=w=>{
  if(stopped||w.busy||Date.now()>=deadline)return;
  const task=pending.shift();
  if(!task)return;
  w.busy=true;w.task=task;active++;
  w.postMessage({type:"play",task});
 };
 const timer=setInterval(()=>{
  const s=persist();
  console.log("Balance progress "+s.completed+" completed; "+
   s.remaining+" remaining, hours="+s.elapsedHours.toFixed(2));
  if(Date.now()>=deadline)stop("deadline");
 },60000);
 const endTimer=setTimeout(()=>stop("deadline"),
  Math.max(0,deadline-Date.now()));
 process.on("SIGINT",()=>stop("SIGINT"));
 process.on("SIGTERM",()=>stop("SIGTERM"));
 console.log("Starting SOLO Everything Goes balance: "+c.workers+
  " workers / "+cpus().length+" visible CPUs, 8 Heroes, "+
  c.runsPerHero+" independent seeds/Hero, "+c.arms.length+" policies, "+
  c.hours+"h wall limit; heuristic "+selected.heuristic+
  "; remaining jobs "+pending.length);
 for(let i=0;i<Math.min(c.workers,pending.length);i++){
  const w=new Worker(new URL(import.meta.url));
  w.busy=false;workers.push(w);
  w.on("message",message=>{
   if(stopped)return;
   if(message.type==="error"){
    console.error("FATAL complete expedition "+key(message.tag)+
     ": "+message.error);
    stop("worker error",true);return;
   }
   active--;w.busy=false;
   const row={...message.result,...message.tag,revision};
   const k=key(row);
   if(!seen.has(k)){
    appendFileSync(recordPath,JSON.stringify(row)+"\n");
    records.push(row);seen.add(k);
   }
   if(records.length%6===0)persist();
   assign(w);
   if(!active&&!pending.length)stop("complete");
  });
  w.on("error",err=>{if(!stopped){console.error(err.stack);
   stop("worker crashed",true);}});
  w.on("exit",code=>{if(!stopped&&code!==0)
   stop("worker exited "+code,true);});
 }
 for(const w of workers)assign(w);
 if(!workers.length)stop("already complete");
}
if(!isMainThread){
 parentPort.on("message",message=>{
  if(message.type!=="play")return;
  try{
   const result=playFullSoloExpedition(message.task.args);
   if(message.task.args.recordTelemetry)
    persistSoloDecisionTrace(result,message.task.tag,
     message.task.args.traceOutputDir);
   else delete result.events;
   parentPort.postMessage({type:"done",tag:message.task.tag,result});
  }catch(error){
   parentPort.postMessage({type:"error",tag:message.task.tag,
    error:error.stack??String(error)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
