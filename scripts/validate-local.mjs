/**
 * Research-grade LOCAL batch validation for Rogue Cards.
 *
 * Does not modify cards or rules. No CI or network access required.
 * Smoke:    node scripts/validate-local.mjs --preset smoke
 * Standard: node scripts/validate-local.mjs --preset standard
 * Deep:     node scripts/validate-local.mjs --preset deep
 * Options: --seeds 11,22,33 --runs 1000 --workers 8 --out results/my-study
 *          --strategies magic,treasure --policies scripted,cautious,bold
 *          --seat-runs 50 --skip-tests --dry-run
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {existsSync,mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {HEROES,OBJECTS} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {makeValidationReport,makeValidationFiles} from "./validation-report.mjs";

export const RESEARCH_POLICIES=Object.freeze({
 scripted:{researchPolicy:"none"},
 cautious:{researchPolicy:"planner",plannerRisk:"cautious"},
 balanced:{researchPolicy:"planner",plannerRisk:"balanced"},
 bold:{researchPolicy:"planner",plannerRisk:"bold"},
 adaptive:{researchPolicy:"adaptive"},
 "room-only":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["room"]},
 "combat-only":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["combat"]},
 "parley-only":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["parley"]},
 "seal-only":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["seal"]},
 "no-room":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["combat","parley","seal"]},
 "no-combat":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["room","parley","seal"]},
 "no-parley":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["room","combat","seal"]},
 "no-seal":{researchPolicy:"planner",plannerRisk:"cautious",plannerFeatures:["room","combat","parley"]},
 "free-items":{researchPolicy:"planner",plannerRisk:"cautious",itemTrial:"free"},
 "forced-items":{researchPolicy:"planner",plannerRisk:"cautious",itemTrial:"force"}
});
const HERO_IDS=HEROES.map(h=>h.id);
export const PARTIES=Object.freeze([
 ...HERO_IDS.map(id=>[id]),
 ...HERO_IDS.flatMap((id,i)=>HERO_IDS.slice(i+1).map(other=>[id,other]))
]);
const PROFILES=Object.freeze({
 smoke:{runs:10,seedCount:2,strategies:["magic","treasure"],policies:["scripted","cautious"],seatRuns:4},
 standard:{runs:250,seedCount:6,strategies:["magic","treasure"],policies:["scripted","cautious","balanced","bold"],seatRuns:40},
 deep:{runs:500,seedCount:10,strategies:["survival","treasure","magic","seal","negotiation"],
  policies:Object.keys(RESEARCH_POLICIES),seatRuns:80}
});
export const stableSeed=(batchSeed,strategyIndex,partyIndex,iteration)=>(
 Math.imul((batchSeed^(Math.imul(strategyIndex+1,0x9e3779b1)))>>>0,0x85ebca6b)+
 Math.imul(partyIndex+1,0xc2b2ae35)+Math.imul(iteration,0x27d4eb2f)
)>>>0;
const add=(to,from)=>{for(const [key,n] of Object.entries(from||{}))
 to[key]=(to[key]||0)+n;};
const bump=(obj,key,value=1)=>{obj[key]=(obj[key]||0)+value;};
const newMeasure=()=>({
 n:0,wins:0,seatSubsetN:0,seatSubsetWins:0,cleared:0,deep:0,battles:0,damage:0,rounds:0,drawn:0,spent:0,
 activated:0,potionsUsed:0,scouted:0,negotiations:0,negotiationsWon:0,
 corpses:0,banishments:0,sealAvailable:0,sealAttempt:0,sealWin:0,
 hpRemaining:0,hpFraction:0,missingHp:0,
 roundLimits:0,unresolved:0,outOfBounds:0,
 failureStages:{},failureCauses:{},roomChoices:{},monsterVisits:{},
 operationCounts:{},plannerDecisions:{},item:{}
});
const newItem=()=>({
 draws:0,acquisitions:0,opportunities:0,uses:0,passive:0,
 byPhase:{},byMode:{},useModes:{},
 damage:0,healing:0,selfDamage:0,responsesSkipped:0,cures:0,resourcesSpent:0,
 recharges:0,scouts:0
});
function addResult(row,result,party){
 row.n++;row.wins+=Number(result.won);row.cleared+=Number(result.cleared===9);
 row.deep+=Number(result.cleared>=6);row.battles+=result.battles;
 for(const field of ["damage","rounds","drawn","spent","activated",
  "potionsUsed","scouted","negotiations","negotiationsWon","corpses",
  "banishments","unresolved"])
  row[field]+=result[field]||0;
 row.sealAvailable+=Number(result.sealAvailable);
 row.sealAttempt+=Number(result.sealAttempt);row.sealWin+=Number(result.sealWin);
 row.roundLimits+=Number(result.roundLimit);
 const hpCap=party.map(id=>HEROES.find(h=>h.id===id).hp);
 const hp=result.remainingHP||[];
 if(hp.length!==hpCap.length||hp.some((v,i)=>!Number.isFinite(v)||v<0||v>hpCap[i]))
  row.outOfBounds++;
 row.hpRemaining+=hp.reduce((a,b)=>a+b,0);
 row.hpFraction+=hp.reduce((a,b,i)=>a+b/hpCap[i],0)/hpCap.length;
 row.missingHp+=hpCap.reduce((a,b,i)=>a+b-hp[i],0);
 if(!result.won){
  bump(row.failureStages,result.failureStage||"unknown");
  bump(row.failureCauses,result.failureCause||"unknown");
 }
 for(const key of ["roomChoices","monsterVisits","operationCounts"])
  add(row[key],result[key]);
 add(row.plannerDecisions,result.plannerDecisions);
 const ids=new Set([
  ...Object.keys(result.objectDraws||{}),
  ...Object.keys(result.objectAcquisitions||{}),
  ...Object.keys(result.itemOpportunities||{}),
  ...Object.keys(result.itemUses||{}),
  ...Object.keys(result.itemResults||{}),
  ...Object.keys(result.itemPassiveEffects||{})
 ]);
 for(const id of ids){
  const cell=row.item[id]??=newItem();
  cell.draws+=result.objectDraws?.[id]||0;
  cell.acquisitions+=result.objectAcquisitions?.[id]||0;
  const op=result.itemOpportunities?.[id];
  cell.opportunities+=op?.total||0;
  add(cell.byPhase,op?.byPhase);add(cell.byMode,op?.byMode);
  const uses=result.itemUses?.[id];cell.uses+=uses?.total||0;
  add(cell.useModes,uses?.byMode);
  cell.passive+=result.itemPassiveEffects?.[id]?.triggers||0;
  const eff=result.itemResults?.[id];
  if(eff){
   cell.damage+=eff.damage||0;
   cell.healing+=eff.healing||0;
   cell.selfDamage+=eff.selfDamage||0;
   cell.responsesSkipped+=eff.responsesSkipped||0;
   cell.cures+=eff.poisonCured||0;
   cell.resourcesSpent+=eff.resourcesSpent||0;
   cell.recharges+=eff.recharges||0;
   cell.scouts+=eff.scouts||0;
  }
 }
}
async function workerMain(){
 for(const task of workerData.tasks){
  const row=newMeasure(),party=task.reversed?[...task.party].reverse():task.party;
  const outcomes=Buffer.alloc(Math.ceil(task.runs/8));
  for(let i=0;i<task.runs;i++){
   const seed=stableSeed(task.seed,task.strategyIndex,task.partyIndex,i);
   const result=simulateFullExpedition({seed,heroes:party,strategy:task.strategy,
    ...RESEARCH_POLICIES[task.policy]});
   addResult(row,result,party);
   if(result.won)outcomes[i>>>3]|=1<<(i&7);
   if(i<task.seatRuns){
    row.seatSubsetN++;
    row.seatSubsetWins+=Number(result.won);
   }
  }
  parentPort.postMessage({type:"result",row:{winBits:outcomes.toString("base64"),
   batchSeed:task.seed,
   strategy:task.strategy,policy:task.policy,party:task.party.join("+"),
   orientation:task.reversed?"reversed":"canonical",...row}});
 }
 parentPort.postMessage({type:"done"});
}
function usage(){
 return "Usage: npm run validate:local -- [--preset smoke|standard|deep] "+
  "[--runs N] [--seeds N,N,... | --seed-count N --seed-base UINT32] "+
  "[--workers 1..16] [--out PATH] [--strategies LIST] [--policies LIST] "+
  "[--seat-runs N] [--skip-tests] [--progress] [--dry-run]";
}
function argvOptions(args){
 const known=["--preset","--runs","--seeds","--seed-count","--seed-base",
  "--workers","--out","--strategies","--policies","--seat-runs"];
 const switches=["--skip-tests","--progress","--dry-run"];
 const opts={},flags=new Set();
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(switches.includes(arg)){if(flags.has(arg))throw Error("Repeated "+arg);
   flags.add(arg);continue;}
  if(!known.includes(arg)||!args[i+1]||args[i+1].startsWith("--")||arg in opts)
   throw Error(usage());
  opts[arg]=args[++i];
 }
 const preset=opts["--preset"]||"smoke";
 if(!PROFILES[preset])throw Error("Unknown preset "+preset);
 const defaults=PROFILES[preset];
 const positive=(raw,name,min,max)=>{
  const n=Number(raw);
  if(!/^\d+$/.test(String(raw))||!Number.isSafeInteger(n)||n<min||n>max)
   throw Error("Invalid "+name+" (allowed "+min+".."+max+")");
  return n;
 };
 const runs=positive(opts["--runs"]??defaults.runs,"runs",1,20000);
 const seatRuns=positive(opts["--seat-runs"]??defaults.seatRuns,"seat-runs",0,20000);
 const seedBase=positive(opts["--seed-base"]??93471523,"seed-base",0,0xffffffff);
 const count=positive(opts["--seed-count"]??defaults.seedCount,"seed-count",1,100);
 if(opts["--seeds"]&&(opts["--seed-count"]||opts["--seed-base"]))
  throw Error("Specify --seeds OR --seed-base/--seed-count");
 let seeds=opts["--seeds"]?
  opts["--seeds"].split(",").map(s=>positive(s,"seeds",0,0xffffffff)):
  Array.from({length:count},(_,i)=>
   (seedBase+Math.imul(i+1,0x9e3779b1))>>>0);
 if(new Set(seeds).size!==seeds.length)throw Error("Duplicate batch seeds");
 const selections=(key,allowed,fallback)=>{
  const values=opts[key]?opts[key].split(","):fallback;
  if(!values.length||new Set(values).size!==values.length||
   values.some(s=>!allowed.includes(s)))
   throw Error("Invalid "+key+"; allowed: "+allowed.join(","));
  return values;
 };
 const strategies=selections("--strategies",
  ["survival","treasure","magic","seal","negotiation"],defaults.strategies);
 const policies=selections("--policies",Object.keys(RESEARCH_POLICIES),defaults.policies);
 const workers=positive(opts["--workers"]??Math.min(4,Math.max(1,availableParallelism()-1)),
  "workers",1,16);
 const out=resolve(opts["--out"]||"results/validation-"+preset);
 const total=seeds.length*strategies.length*policies.length*
  PARTIES.length*runs;
 const seatN=seeds.length*strategies.length*policies.length*28*
  Math.min(seatRuns,runs);
 if(total+seatN>50000000)throw Error("Refusing more than 50 million simulations in one run");
 return {preset,runs,seatRuns:Math.min(seatRuns,runs),seeds,strategies,
  policies,workers,out,skipTests:flags.has("--skip-tests"),
  progress:flags.has("--progress"),dryRun:flags.has("--dry-run"),
  plannedExpeditions:total+seatN,primaryExpeditions:total,
  reversedSeatExpeditions:seatN};
}
function gitSha(){
 try{return execFileSync("git",["rev-parse","HEAD"],{
  encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}
 catch{return null;}
}
async function main(){
 let options;
 try{options=argvOptions(process.argv.slice(2))}
 catch(e){process.stderr.write(e.message+"\n"+usage()+"\n");process.exitCode=2;return;}
 const plan={...options,commit:gitSha(),node:process.version,heroCount:HEROES.length,
  itemCount:OBJECTS.length,partyCount:PARTIES.length};
 process.stderr.write("LOCAL VALIDATION: "+JSON.stringify(plan,null,2)+"\n");
 if(options.dryRun)return;
 if(existsSync(options.out))
  throw Error("Output directory already exists; choose another --out: "+options.out);
 mkdirSync(options.out,{recursive:true});
 writeFileSync(resolve(options.out,"manifest.json"),JSON.stringify(plan,null,2)+"\n");
 if(!options.skipTests){
  process.stderr.write("Running npm test and saving full test output...\n");
  const test=spawnSync("npm",["test"],{encoding:"utf8",maxBuffer:64*1024*1024});
  writeFileSync(resolve(options.out,"tests.log"),
   (test.stdout||"")+"\n"+(test.stderr||""));
  if(test.error||test.status!==0){
   process.stderr.write("Unit/contract tests failed. See "+
    resolve(options.out,"tests.log")+"\n");
   process.exitCode=1;return;
  }
 }
 const tasks=[];
 for(const [bi,seed] of options.seeds.entries())
 for(const [si,strategy] of options.strategies.entries())
 for(const [pi,party] of PARTIES.entries())
 for(const policy of options.policies){
  tasks.push({seed,bi,strategy,strategyIndex:si,party,partyIndex:pi,
   policy,runs:options.runs,seatRuns:options.seatRuns,reversed:false});
  if(party.length===2&&options.seatRuns>0)
   tasks.push({seed,bi,strategy,strategyIndex:si,party,partyIndex:pi,
    policy,runs:options.seatRuns,seatRuns:options.seatRuns,reversed:true});
 }
 const buckets=Array.from({length:Math.min(tasks.length,options.workers)},()=>[]);
 for(let i=0;i<tasks.length;i++)buckets[i%buckets.length].push(tasks[i]);
 const rows=[];let completed=0;
 await Promise.all(buckets.map(bucket=>new Promise((done,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{tasks:bucket}});
  worker.on("message",msg=>{
   if(msg.type==="result"){
    rows.push(msg.row);completed++;
    if(options.progress&&(completed%Math.max(1,Math.floor(tasks.length/50))===0||
      completed===tasks.length))
     process.stderr.write("Completed "+completed+"/"+tasks.length+" cohorts\n");
   }
  });
  worker.on("error",reject);
  worker.on("exit",code=>code===0?done():reject(Error("Worker exited "+code)));
 })));
 rows.sort((a,b)=>options.seeds.indexOf(a.batchSeed)-options.seeds.indexOf(b.batchSeed)||
  options.strategies.indexOf(a.strategy)-options.strategies.indexOf(b.strategy)||
  options.policies.indexOf(a.policy)-options.policies.indexOf(b.policy)||
  a.party.localeCompare(b.party)||a.orientation.localeCompare(b.orientation));
 const result=makeValidationReport(plan,rows);
 for(const [file,data] of Object.entries(makeValidationFiles(result,rows))){
  writeFileSync(resolve(options.out,file),data);
 }
 process.stderr.write("Finished "+result.totalExpeditions+" expeditions; "+
  result.validation.errors.length+" hard validation failures, "+
  result.validation.warnings.length+" analysis warnings.\n");
 process.stderr.write("Read "+resolve(options.out,"summary.md")+"\n");
 if(result.validation.errors.length)process.exitCode=1;
}
if(isMainThread)await main();else await workerMain();
