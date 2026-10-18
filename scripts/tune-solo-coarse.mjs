#!/usr/bin/env node
/**
 * FINAL coarse numeric recalibration of the solo testing agent.
 * Training and validation split by entire Monster x Hero blocks.
 *
 * Canonical encounter continuations independently score the first MCTS
 * decision; search never sees validation dice. NOT a human win-rate study.
 * No card, printed rule, or production MCTS default is changed.
 *
 * Usage:
 *  node scripts/tune-solo-coarse.mjs --workers 8 --minutes 120 \
 *   --out results/solo-coarse-final-v1
 */
import {Worker,isMainThread,parentPort} from "node:worker_threads";
import {mkdirSync,existsSync,readFileSync,appendFileSync,writeFileSync,renameSync}
 from "node:fs";
import {execFileSync} from "node:child_process";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {soloScenarioIds} from "./solo-encounter-fixtures.mjs";
import {evaluateHybridJob} from "./tune-mcts-hybrid-core.mjs";

const tree="solo-pragmatic-tree",both="solo-pragmatic";
const baseline={name:"uct-classic",c:Math.SQRT2,alpha:0,
 heuristicMode:"legacy",rolloutCombatMode:"random",
 simulationPolicy:"default",budget:8};
const previous={name:"previous-implicit-tree",c:0.35,alpha:0.4,
 heuristicMode:"solo-threat",rolloutCombatMode:"random",
 simulationPolicy:tree,budget:8};
export function coarseCandidates(){
 const candidates=[baseline,previous];
 const add=(name,partial)=>{
  if(candidates.some(x=>x.name===name))throw Error("Duplicate coarse candidate");
  candidates.push({...previous,name,...partial});
 };
 // Main coarse C/alpha scan: the zero-alpha arms are genuine ordinary UCT.
 for(const c of [0.2,0.5,1.0])
  for(const alpha of [0,0.2,0.5])
   add("grid-c"+c+"-a"+alpha,{c,alpha});
 // Isolate alternative implicit state evaluations on matched roots.
 for(const mode of ["legacy","solo-hp"])
  for(const alpha of [0.2,0.5])
   for(const c of [0.2,0.8])
    add("heur-"+mode+"-a"+alpha+"-c"+c,
     {heuristicMode:mode,c,alpha});
 // Directly test numerical solo HP/threat heuristic terms as well.
 for(const hpScale of [0.7,1.3])
  add("implicit-hp-x"+hpScale,{implicitHpScale:hpScale});
 for(const threatScale of [0.6,1.4])
  add("implicit-threat-x"+threatScale,{implicitThreatScale:threatScale});
 // Search budget is a CPU cost, not merely an algorithm strength axis.
 for(const budget of [4,16,32])
  add("visits-"+budget,{budget});
 // Soft tree preference magnitude (both unvisited priors and UCT bonus).
 for(const bonus of [0,0.3])
  for(const first of [0.5,1])
   add("tree-b"+bonus+"-p"+first,
    {softTreeBonus:bonus,softTreeFirstVisitProbability:first});
 // Recheck whether rollout priors and short sampled tactical lookahead
 // offer an actual return on CPU cost, not just more MCTS complexity.
 for(const mode of ["solo-pragmatic-external",
   "solo-pragmatic-rollout",both])
  add("policy-"+mode,{simulationPolicy:mode});
 for(const alpha of [0,0.4])
  add("expectimax-a"+alpha,{
   alpha,rolloutCombatMode:"sampled-expectimax",
   samples:2,tacticalMax:2});
 for(const prior of [0.5,1])
  add("rollout-prior-"+prior,{
   simulationPolicy:both,softRolloutProbability:prior});
 return Object.freeze(candidates.map(x=>Object.freeze(x)));
}

/**
 * The follow-up targets budget 16/32/64, C/alpha and HP/threat weights.
 * Its final holdout consists of 16 Monster x Hero groups absent from the
 * entire original 24+24-group coarse experiment.
 */
export function refineCandidates(){
 const out=[];
 const base={c:0.35,alpha:0.4,heuristicMode:"solo-threat",
  rolloutCombatMode:"random",simulationPolicy:"solo-pragmatic-tree",
  budget:16};
 const add=(name,options={})=>out.push(Object.freeze({...base,...options,name}));
 for(const n of [8,16,32,64])add("baseline-"+n,{budget:n});
 add("classic-uct-16",{alpha:0,c:Math.SQRT2,
  heuristicMode:"legacy",simulationPolicy:"default"});
 for(const c of [0.15,0.35,0.65,1])
  for(const alpha of [0,0.2,0.4,0.6])
   if(!(c===0.35&&alpha===0.4))
    add("b16-c"+c+"-a"+alpha,{c,alpha});
 for(const c of [0.2,0.5])
  for(const alpha of [0.2,0.5])
   add("b32-c"+c+"-a"+alpha,{budget:32,c,alpha});
 for(const mode of ["solo-hp","legacy"])
  add("b16-heur-"+mode,{heuristicMode:mode});
 for(const scale of [0.7,1.3])
  add("b16-hp-x"+scale,{implicitHpScale:scale});
 for(const scale of [0.6,1.4])
  add("b16-threat-x"+scale,{implicitThreatScale:scale});
 for(const p of [0.5,1])
  add("b16-tree-prior-"+p,{softTreeFirstVisitProbability:p});
 add("b16-no-soft-tree-bonus",{softTreeBonus:0});
 if(new Set(out.map(x=>x.name)).size!==out.length)
  throw Error("Duplicate refinement candidate name");
 return Object.freeze(out);
}

const mean=(rows,key)=>rows.length?
 rows.reduce((sum,r)=>sum+r[key],0)/rows.length:null;
const taskKey=tag=>tag.phase+"|"+tag.candidate+"|"+
 tag.scenarioId+"|"+tag.replicate;
const rank=(records,phase,candidates)=>{
 const table=[];
 for(const candidate of candidates){
  const rows=records.filter(x=>x.phase===phase&&
   x.candidate===candidate.name);
  const fitness=mean(rows,"fitness"),clear=mean(rows,"clear"),
   hp=mean(rows,"hpFraction"),ms=mean(rows,"searchMs");
  table.push({name:candidate.name,n:rows.length,
   scenarioTypes:new Set(rows.map(x=>x.scenarioId)).size,
   meanFitness:fitness,meanClear:clear,meanHP:hp,
   meanSearchMs:ms,
   // Mild efficiency penalty; MCTS is a means, not the card game's goal.
   efficiencyScore:fitness===null?null:fitness-0.00005*ms});
 }
 return table.sort((a,b)=>(b.efficiencyScore??-Infinity)-
  (a.efficiencyScore??-Infinity)||a.name.localeCompare(b.name));
};
export const splitGroups=(seed,screenCount,holdoutCount,{allConditions=false}={})=>{
 const groups=[...new Set(soloScenarioIds().map(id=>
  id.replace(/-(fresh|injured|critical)$/,"")))];
 if(groups.length!==64)throw Error("Unexpected solo Hero x Monster grid");
 let state=seed>>>0;
 const draw=()=>{
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return (state>>>0)/4294967296;
 };
 // Deterministic block shuffle: no Monster/Hero group in both partitions.
 for(let i=groups.length-1;i>0;i--){
  const j=Math.floor(draw()*(i+1));
  [groups[i],groups[j]]=[groups[j],groups[i]];
 }
 const conditions=["fresh","injured","critical"];
 return {train:groups.slice(0,screenCount).flatMap((id,i)=>
  allConditions?conditions.map(x=>id+"-"+x):[
   id+"-"+conditions[i%3],id+"-"+conditions[(i+1)%3]
  ]),validate:groups.slice(screenCount,screenCount+holdoutCount)
  .flatMap(id=>conditions.map(x=>id+"-"+x))};
};
export function parseCoarseArgs(argv){
 const dryRun=argv.includes("--dry-run");
 argv=argv.filter(x=>x!=="--dry-run");
 const options={},allowed=new Set(["--workers","--minutes","--seed",
  "--out","--screen-groups","--holdout-groups",
  "--holdout-repetitions","--screen-repetitions",
  "--finalists","--candidate-limit","--profile"]);
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!allowed.has(k)||v===undefined||Object.hasOwn(options,k))
   throw Error("Invalid coarse tuner option "+k);
  options[k]=v;
 }
 const integer=(key,def,min,max)=>{
  const n=Number(options[key]??def);
  if(!Number.isSafeInteger(n)||n<min||n>max)
   throw Error(key+" must be integer "+min+".."+max);
  return n;
 };
 const profile=options["--profile"]??"standard";
 if(!["standard","refine"].includes(profile))
  throw Error("Unknown tuner profile");
 const screenGroups=integer("--screen-groups",profile==="refine"?48:24,1,63);
 const holdoutGroups=integer("--holdout-groups",profile==="refine"?16:24,1,63);
 if(profile==="refine"&&(screenGroups!==48||holdoutGroups!==16))
  throw Error("Refine must hold back 16 unstudied Monster/Hero groups");
 if(screenGroups+holdoutGroups>64)
  throw Error("Training and held-out Hero/Monster groups must be disjoint");
 return {dryRun,profile,workers:integer("--workers",8,1,32),
  minutes:integer("--minutes",120,1,720),
  seed:integer("--seed",20261113,1,0xffffffff),
  screenGroups,holdoutGroups,
  screenRepetitions:integer("--screen-repetitions",
   profile==="refine"?12:1,1,50),
  holdoutRepetitions:integer("--holdout-repetitions",
   profile==="refine"?16:2,1,50),
  finalists:integer("--finalists",profile==="refine"?6:4,1,12),
  candidateLimit:integer("--candidate-limit",100,2,100),
  out:resolve(options["--out"]??"results/solo-coarse-final-v1")};
}
const save=(p,o)=>{
 const tmp=p+".tmp";
 writeFileSync(tmp,JSON.stringify(o,null,2)+"\n");
 renameSync(tmp,p);
};
const sha=()=>execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
function pairedComparison(records,challenger,baselineName){
 const originals=new Map(records.filter(r=>r.phase==="validate"&&
  r.candidate===baselineName).map(r=>[r.scenarioId+"|"+r.replicate,r]));
 const pairs=records.filter(r=>r.phase==="validate"&&
  r.candidate===challenger).flatMap(r=>{
   const other=originals.get(r.scenarioId+"|"+r.replicate);
   return other?[{scenarioId:r.scenarioId,
    deltaFitness:r.fitness-other.fitness,
    deltaClear:r.clear-other.clear,deltaHP:r.hpFraction-other.hpFraction,
    deltaMs:r.searchMs-other.searchMs}]:[];
  });
 if(!pairs.length)return null;
 const grouped=new Map();
 for(const p of pairs){
  if(!grouped.has(p.scenarioId))grouped.set(p.scenarioId,[]);
  grouped.get(p.scenarioId).push(p);
 }
 const clusters=[...grouped.values()];
 let rng=2166136261;
 for(const ch of challenger+"|"+baselineName)
  rng=Math.imul(rng^ch.charCodeAt(0),16777619)>>>0;
 const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;
  return rng/4294967296;};
 const boots=[];
 if(clusters.length>=2)for(let n=0;n<1200;n++){
  let total=0,count=0;
  for(let j=0;j<clusters.length;j++)
   for(const item of clusters[Math.floor(random()*clusters.length)]){
    total+=item.deltaFitness;count++;
   }
  boots.push(total/count);
 }
 boots.sort((a,b)=>a-b);
 return {challenger,baseline:baselineName,n:pairs.length,
  independentScenarioTypes:clusters.length,
  deltaFitness:mean(pairs,"deltaFitness"),
  deltaClear:mean(pairs,"deltaClear"),deltaHP:mean(pairs,"deltaHP"),
  deltaSearchMs:mean(pairs,"deltaMs"),
  clusterBootstrap95:boots.length?
   [boots[Math.floor(.025*(boots.length-1))],
    boots[Math.floor(.975*(boots.length-1))]]:null};
}
export function coarseSummary(records,manifest,finalists=null){
 const candidates=manifest.candidates;
 const screen=rank(records,"screen",candidates);
 const validated=finalists?rank(records,"validate",
  candidates.filter(c=>finalists.includes(c.name))):[];
 const expectedScreen=manifest.screen.length*candidates.length;
 const expectedValidation=finalists?
  manifest.holdout.length*manifest.setup.holdoutRepetitions*finalists.length:0;
 const matchedPairs=finalists?finalists.filter(id=>
  id!==previous.name).map(id=>
   pairedComparison(records,id,previous.name)):[];
 const completeScreen=records.filter(r=>r.phase==="screen").length===
  expectedScreen;
 const completeValidation=Boolean(finalists)&&
  records.filter(r=>r.phase==="validate").length===expectedValidation;
 return {schema:"solo-mcts-coarse-final-v1",
  revision:manifest.revision,setup:manifest.setup,
  candidates,screenScenarioCount:manifest.screen.length,
  holdoutScenarioCount:manifest.holdout.length,
  expectedScreen,expectedValidation,
  completedScreen:records.filter(r=>r.phase==="screen").length,
  completedValidation:records.filter(r=>r.phase==="validate").length,
  completeScreen,completeValidation,
  finalists:finalists??[],screen,heldOut:validated,
  heldOutPairedComparisons:matchedPairs.filter(Boolean),
  recommendedForProduction:false,
  candidateToReview:completeValidation?validated[0]??null:null,
  warnings:[
   "Coarse screening is TRAINING: do not use its ranking as proof of general strength.",
   "Validation Monster x Hero groups and dice are independent of screening.",
   "Only root combat choices are scored by independent canonical encounter continuations, not entire 36-Room expeditions.",
   "Out-of-search objective is encounter survival, HP and Items, NOT 40% game win rate.",
   "Equal trial budgets do not mean equal CPU: efficiency score penalizes search milliseconds.",
   "Never tune printed cards to maximize agent fitness. Printed gameplay remains unchanged.",
   "Candidate is provisional even when validation completes; run a small matched full-expedition check before freezing it."
  ]};
}
async function main(){
 const opts=parseCoarseArgs(process.argv.slice(2));
 const candidates=coarseCandidates().slice(0,opts.candidateLimit);
 const split=splitGroups(opts.seed,opts.screenGroups,opts.holdoutGroups);
 if(opts.dryRun){
  console.log(JSON.stringify({schema:"solo-mcts-coarse-final-v1",
   candidates:candidates.length,firstCandidates:candidates.slice(0,4),
   screen:split.train.length,heldOut:split.validate.length,
   screeningJobs:candidates.length*split.train.length,
   estimateValidationJobs:(opts.finalists+2)*split.validate.length*
    opts.holdoutRepetitions,
   noCardsOrEngineDefaultsChanged:true},null,2));
  return;
 }
 mkdirSync(opts.out,{recursive:true});
 const manifestPath=join(opts.out,"manifest.json"),
  trialPath=join(opts.out,"trials.ndjson"),
  summaryPath=join(opts.out,"summary.json");
 const setup=Object.fromEntries(Object.entries(opts).filter(
  ([k])=>!["out","dryRun"].includes(k)));
 const expected={schema:"solo-mcts-coarse-final-v1",
  revision:sha(),setup,candidates,screen:split.train,
  holdout:split.validate};
 let manifest=expected;
 if(existsSync(manifestPath)){
  manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
  if(JSON.stringify(manifest)!==JSON.stringify(expected))
   throw Error("Experiment changed since last run: use a fresh --out. "+
    "Never combine old and new MCTS algorithms or candidate grids.");
 }else save(manifestPath,manifest);
 const saved=existsSync(trialPath)?readFileSync(trialPath,"utf8")
  .split("\n").filter(Boolean).map(JSON.parse):[];
 const seen=new Set();
 for(const row of saved){
  if(seen.has(taskKey(row)))throw Error("Duplicate saved tuning trial");
  seen.add(taskKey(row));
 }
 const records=[...saved],deadline=Date.now()+opts.minutes*60000;
 let finalists=null,phase="screen",jobs=[],active=0,stopped=false;
 let timer,ends,workerCount=0;
 const workers=[];
 const buildJobs=(kind,selected,ids,repetitions)=>{
  const result=[];
  for(const id of ids)
   for(let rep=0;rep<repetitions;rep++)
    for(const candidate of selected){
     const tag={phase:kind,candidate:candidate.name,
      scenarioId:id,replicate:rep};
     if(!seen.has(taskKey(tag)))
      result.push({tag,args:{
       candidate,scenarioId:id,replicate:rep,phase:kind,
       seed:opts.seed,budget:candidate.budget,
       samples:candidate.samples??1,tacticalMax:candidate.tacticalMax??1,
       independentTrials:2}});
    }
  return result;
 };
 const chooseFinalists=()=>{
  const screen=coarseSummary(records,manifest).screen;
  const names=[previous.name,baseline.name];
  for(const item of screen){
   if(names.length>=opts.finalists+2)break;
   if(!names.includes(item.name))names.push(item.name);
  }
  return names;
 };
 function report(){
  const r=coarseSummary(records,manifest,finalists);
  r.phase=phase;r.remaining=jobs.length+active;
  r.elapsedMinutes=opts.minutes-(deadline-Date.now())/60000;
  save(summaryPath,r);return r;
 }
 function stop(reason,failed=false){
  if(stopped)return;
  stopped=true;clearInterval(timer);clearTimeout(ends);
  const result=report();
  console.log("Coarse tuning "+reason+": screen "+
   result.completedScreen+"/"+result.expectedScreen+
   ", validation "+result.completedValidation+"/"+result.expectedValidation+
   ", results "+summaryPath);
  if(result.completeValidation)
   console.log("Held-out ranked (provisional): "+
    JSON.stringify(result.heldOut.slice(0,6)));
  if(failed)process.exitCode=1;
  for(const worker of workers)worker.terminate();
 }
 function assign(w){
  if(stopped||w.busy||Date.now()>=deadline)return;
  const task=jobs.shift();
  if(!task)return;
  w.busy=true;w.task=task;active++;w.postMessage(task);
 }
 function nextPhase(){
  if(phase==="screen"){
   const complete=coarseSummary(records,manifest).completeScreen;
   if(!complete)throw Error("Screening ended without complete paired grid");
   finalists=chooseFinalists();
   const named=candidates.filter(x=>finalists.includes(x.name));
   phase="validate";
   jobs=buildJobs(phase,named,manifest.holdout,
    opts.holdoutRepetitions);
   console.log("Held-out candidates: "+finalists.join(", "));
   report();
   if(!jobs.length){stop("already validated");return;}
   for(const w of workers)assign(w);
  }else stop("complete");
 }
 const savedScreen=coarseSummary(records,manifest).completeScreen;
 if(savedScreen){
  finalists=chooseFinalists();phase="validate";
  jobs=buildJobs(phase,candidates.filter(c=>finalists.includes(c.name)),
   manifest.holdout,opts.holdoutRepetitions);
 }else jobs=buildJobs(phase,candidates,manifest.screen,1);
 if(!jobs.length){if(phase==="screen")nextPhase();else stop("already complete");}
 if(stopped)return;
 console.log("Coarse solo MCTS tuning: "+candidates.length+" candidates, "+
  opts.workers+" workers, "+manifest.screen.length+" screen roots, "+
  manifest.holdout.length+" HELD-OUT roots, "+jobs.length+
  " queued, wall limit "+opts.minutes+"m. No production constants changed.");
 timer=setInterval(()=>{
  if(Date.now()>=deadline){stop("wall-time limit");return;}
  const result=report();
  console.log("Tuning "+phase+": "+result.completedScreen+
   " screen, "+result.completedValidation+" validation, "+
   result.remaining+" outstanding");
 },60000);
 ends=setTimeout(()=>stop("wall-time limit"),
  Math.max(0,deadline-Date.now()));
 process.on("SIGINT",()=>stop("SIGINT"));
 process.on("SIGTERM",()=>stop("SIGTERM"));
 for(let i=0;i<opts.workers;i++){
  const w=new Worker(new URL(import.meta.url));
  workers.push(w);workerCount++;
  w.busy=false;
  w.on("message",msg=>{
   if(stopped)return;
   if(msg.error){console.error("FATAL "+taskKey(msg.tag)+": "+msg.error);
    stop("worker exception",true);return;}
   active--;w.busy=false;
   const key=taskKey(msg.tag);
   if(!seen.has(key)){
    const row={...msg.row,...msg.tag};
    appendFileSync(trialPath,JSON.stringify(row)+"\n");
    records.push(row);seen.add(key);
   }
   if(records.length%25===0)report();
   assign(w);
   if(!jobs.length&&active===0)nextPhase();
  });
  w.on("error",err=>{console.error(err);
   if(!stopped)stop("worker crashed",true);});
  w.on("exit",code=>{if(!stopped&&code!==0)
   stop("worker exited "+code,true);});
 }
 for(const w of workers)assign(w);
 report();
}
if(!isMainThread){
 parentPort.on("message",job=>{
  try{
   const row=evaluateHybridJob(job.args);
   parentPort.postMessage({tag:job.tag,row});
  }catch(err){
   parentPort.postMessage({tag:job.tag,error:err.stack??String(err)});
  }
 });
}else if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 await main();
}
