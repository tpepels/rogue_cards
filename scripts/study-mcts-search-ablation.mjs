#!/usr/bin/env node
/**
 * Four-arm A/B/C/D study of opt-in node priors and progressive widening.
 * Same printed game, frozen reference profile, Heroes, search budgets and
 * initial seeds. Exploration uses fair hidden-information sampling.
 *
 * This is an exploratory pilot, not a new balance player nor proof of strength.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {mkdirSync,readFileSync,existsSync,writeFileSync,appendFileSync,renameSync}
 from "node:fs";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {MCTS_SEARCH_ARMS} from "../src/mcts-search-controls.js";
import {SOLO_HEROES,playFullSoloExpedition}
 from "./study-solo-expedition-balance.mjs";

const mix=x=>{
 x=(x+0x9e3779b9)>>>0;
 x=Math.imul(x^(x>>>16),0x85ebca6b);
 x=Math.imul(x^(x>>>13),0xc2b2ae35);
 return (x^(x>>>16))>>>0||1;
};
const write=(path,content)=>{
 const tmp=path+".tmp";writeFileSync(tmp,JSON.stringify(content,null,2)+"\n");
 renameSync(tmp,path);
};
const rate=(rows,field)=>rows.length?
 rows.reduce((n,r)=>n+Number(Boolean(r[field])),0)/rows.length:null;
const average=(rows,field)=>rows.length?
 rows.reduce((n,r)=>n+Number(r[field]??0),0)/rows.length:null;
function parse(argv){
 const opts={};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(k==="--dry-run"){opts[k]="true";continue;}
  if(!["--out","--budgets","--runs-per-hero","--workers","--minutes",
    "--seed","--puct-c"].includes(k)||opts[k]!==undefined||!argv[i+1])
   throw Error("Unknown, duplicate or missing option "+k);
  opts[k]=argv[++i];
 }
 const number=(key,def,low,high)=>{
  const x=Number(opts[key]??def);
  if(!Number.isSafeInteger(x)||x<low||x>high)
   throw Error("Bad "+key+" (expected "+low+".."+high+")");
  return x;
 };
 const budgets=(opts["--budgets"]??"16,32,64").split(",").map(Number);
 if(!budgets.length||budgets.some(n=>!Number.isSafeInteger(n)||
   n<2||n>256)||new Set(budgets).size!==budgets.length)
  throw Error("Bad comma-separated --budgets");
 const puctC=Number(opts["--puct-c"]??"0.35");
 if(!Number.isFinite(puctC)||puctC<0||puctC>5)
  throw Error("Bad --puct-c (expected 0..5)");
 return {budgets,puctC,
  repeats:number("--runs-per-hero",1,1,500),
  workers:number("--workers",8,1,32),
  minutes:number("--minutes",600,1,10080),
  seed:number("--seed",20261019,1,0xffffffff),
  out:resolve(opts["--out"]??"results/mcts-search-ablation-v1"),
  dryRun:opts["--dry-run"]==="true"};
}
const key=x=>[x.budget,x.hero,x.replicate,x.arm].join("|");
const summary=(rows,expected)=>{
 const groups=[];
 for(const budget of expected.budgets)
  for(const arm of MCTS_SEARCH_ARMS){
   const group=rows.filter(r=>r.budget===budget&&r.arm===arm.id);
   const reached=group.filter(r=>r.vaultReached);
   groups.push({budget,arm:arm.id,n:group.length,
    wins:group.filter(r=>r.won).length,
    winRate:rate(group,"won"),vaultRate:rate(group,"vaultReached"),
    winGivenVault:rate(reached,"won"),
    encountersPer36:group.length?
     group.reduce((n,r)=>n+r.ordinaryEncounters,0)/
      Math.max(1,group.reduce((n,r)=>n+r.roomsCleared,0))*36:null,
    meanSearchSeconds:group.length?average(group,"searchMs")/1000:null,
    meanPuctSelections:group.length?
     average(group,"puctSelections"):null,
    meanInformativePriorSelections:group.length?
     average(group,"informativePriorSelections"):null,
    meanWidenedSelections:group.length?
     average(group,"widenedSelections"):null,
    meanElapsedSeconds:group.length?average(group,"elapsedMs")/1000:null,
    byHero:Object.fromEntries(SOLO_HEROES.map(hero=>{
     const h=group.filter(r=>r.hero===hero);
     return [hero,{n:h.length,wins:h.filter(r=>r.won).length,
      winsRate:rate(h,"won"),vaultRate:rate(h,"vaultReached")}];
    }))}
   );
  }
 const paired=[];
 for(const budget of expected.budgets){
  const base=new Map(rows.filter(r=>r.budget===budget&&r.arm==="baseline")
   .map(r=>[[r.hero,r.replicate].join("|"),r]));
  for(const arm of MCTS_SEARCH_ARMS.slice(1)){
   const matching=rows.filter(r=>r.budget===budget&&r.arm===arm.id)
    .map(r=>({a:base.get([r.hero,r.replicate].join("|")),b:r}))
    .filter(x=>x.a);
   paired.push({budget,arm:arm.id,n:matching.length,
    improved:matching.filter(x=>x.b.won&&!x.a.won).length,
    worsened:matching.filter(x=>!x.b.won&&x.a.won).length,
    tied:matching.filter(x=>x.a.won===x.b.won).length,
    meanSearchRatio:matching.length?
     matching.reduce((s,x)=>s+(x.b.searchMs/Math.max(1,x.a.searchMs)),0)/
      matching.length:null});
  }
 }
 return {schema:"rogue-cards-mcts-search-ablation-summary-v1",
  status:rows.length===expected.trials?"complete":"incomplete",
  finished:rows.length,total:expected.trials,groups,paired,
  note:"Exploratory frozen-agent comparisons. Few runs cannot identify a winning policy; human play cannot be inferred."};
}
async function main(){
 const opts=parse(process.argv.slice(2));
 const agent=JSON.parse(readFileSync("experiments/agents/solo-balance-reference-v1.json","utf8"));
 if(agent.id!=="solo-balance-reference-v1"||
    agent.policy.mctsPragmaticVariant!=="tree-only"||
    agent.parameters.budget!==32)throw Error("Unexpected frozen reference agent");
 const sha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const expected={schema:"rogue-cards-mcts-search-ablation-manifest-v1",
  revision:sha,agentId:agent.id,agentParameters:agent.parameters,
  budgets:opts.budgets,repeats:opts.repeats,seed:opts.seed,
  puctC:opts.puctC,heroes:SOLO_HEROES,
  arms:MCTS_SEARCH_ARMS.map(a=>a.id),
  trials:opts.budgets.length*opts.repeats*SOLO_HEROES.length*MCTS_SEARCH_ARMS.length};
 if(opts.dryRun){console.log(JSON.stringify(expected,null,2));return;}
 mkdirSync(opts.out,{recursive:true});
 const mf=join(opts.out,"manifest.json"),nd=join(opts.out,"trials.ndjson"),
  sf=join(opts.out,"summary.json");
 if(existsSync(mf)){
  if(JSON.stringify(JSON.parse(readFileSync(mf,"utf8")))!==JSON.stringify(expected))
   throw Error("Incompatible resume: revision, seeds or settings changed");
 }else write(mf,expected);
 const rows=existsSync(nd)?readFileSync(nd,"utf8").trim().split("\n")
  .filter(Boolean).map(JSON.parse):[];
 const seen=new Set(rows.map(key));
 if(seen.size!==rows.length)throw Error("Duplicate saved trial");
 const pending=[];
 for(const budget of opts.budgets)
  for(let replicate=0;replicate<opts.repeats;replicate++)
   for(let i=0;i<SOLO_HEROES.length;i++){
    const hero=SOLO_HEROES[i],seed=mix(opts.seed^
     Math.imul(i+1,0x85ebca6b)^Math.imul(replicate+1,0xc2b2ae35));
    for(const arm of MCTS_SEARCH_ARMS){
     const job={budget,hero,replicate,arm:arm.id,seed};
     if(!seen.has(key(job)))pending.push(job);
    }
   }
 write(sf,summary(rows,expected));
 if(!pending.length){console.log("Already complete");return;}
 console.log("A/B/C/D MCTS: "+pending.length+" pending trials; "+
  opts.workers+" workers, revision "+sha.slice(0,8));
 if(!isMainThread)throw Error("Main expected");
 const workers=[],deadline=Date.now()+opts.minutes*60000;
 let active=0,failed=false,stopped=false,done=0;
 const persist=()=>write(sf,summary(rows,expected));
 const finish=(reason,error=false)=>{
  if(stopped)return;
  stopped=true;failed=error;
  clearInterval(ticker);
  persist();console.log("MCTS ablation "+reason+": "+rows.length+
   "/"+expected.trials+" saved");
  console.log("PILOT RESULTS "+JSON.stringify(summary(rows,expected).groups.map(g=>({
   arm:g.arm,budget:g.budget,n:g.n,winRate:g.winRate,
   vaultRate:g.vaultRate,winGivenVault:g.winGivenVault,
   meanSearchSeconds:g.meanSearchSeconds,
   informativePriors:g.meanInformativePriorSelections,
   widenedSelections:g.meanWidenedSelections
  }))));
  for(const w of workers)w.terminate();
  if(failed)process.exitCode=1;
 };
 const dispatch=w=>{
  if(stopped)return;
  if(Date.now()>=deadline)return finish("time limit");
  const job=pending.shift();
  if(!job){if(active===0)finish("complete");return;}
  w.busy=true;active++;
  w.postMessage(job);
 };
 const ticker=setInterval(()=>{
  if(stopped){clearInterval(ticker);return;}
  if(Date.now()>=deadline)return finish("time limit");
  persist();console.log("MCTS ablation "+rows.length+"/"+expected.trials);
 },60000);
 for(let i=0;i<opts.workers;i++){
  const w=new Worker(new URL(import.meta.url),{
   workerData:{agent,puctC:opts.puctC}
  });
  workers.push(w);
  w.on("message",msg=>{
   if(stopped)return;
   active--;w.busy=false;
   if(msg.error)return finish("worker failed: "+msg.error,true);
   const r=msg.result;
   if(seen.has(key(r)))return finish("duplicate trial",true);
   seen.add(key(r));rows.push(r);done++;
   appendFileSync(nd,JSON.stringify(r)+"\n");
   dispatch(w);if(!pending.length&&active===0)finish("complete");
  });
  w.on("error",e=>finish("worker error: "+e.stack,true));
  w.on("exit",code=>{
   if(!stopped&&code!==0)finish("worker exited "+code,true);
  });
 }
 workers.forEach(dispatch);
}
if(!isMainThread){
 parentPort.on("message",job=>{
  try{
   const p=workerData.agent.parameters;
   const profile=MCTS_SEARCH_ARMS.find(a=>a.id===job.arm);
   if(!profile)throw Error("Bad MCTS arm "+job.arm);
   const r=playFullSoloExpedition({
    hero:job.hero,seed:job.seed,arm:"implicit",budget:job.budget,
    c:p.c,alpha:p.alpha,heuristicMode:"solo-threat",
    equipmentMode:"solo-pragmatic",mctsPragmaticVariant:"tree-only",
    softTreeBonus:p.softTreeBonus,
    softTreeFirstVisitProbability:p.softTreeFirstVisitProbability,
    softRolloutProbability:p.softRolloutProbability,
    implicitHpScale:p.implicitHpScale,
    implicitThreatScale:p.implicitThreatScale,
    maxSearchSteps:p.maxSearchSteps,
    nodePriors:profile.nodePriors,
    progressiveWidening:profile.progressiveWidening,
    puctC:workerData.puctC
   });
   parentPort.postMessage({result:{
    budget:job.budget,hero:job.hero,replicate:job.replicate,
    arm:job.arm,seed:job.seed,
    won:r.won,vaultReached:r.vaultReached,
    ordinaryEncounters:r.ordinaryEncounters,
    roomsCleared:r.roomsCleared,
    searches:r.searches,searchMs:r.searchMs,elapsedMs:r.elapsedMs,
    ending:r.ending,itemsUsed:r.itemsUsed,
    puctSelections:r.searchControls?.puctSelections??0,
    informativePriorSelections:
     r.searchControls?.informativePriorSelections??0,
    widenedSelections:r.searchControls?.widenedSelections??0,
    wideningActionsFiltered:
     r.searchControls?.wideningActionsFiltered??0
   }});
  }catch(e){parentPort.postMessage({error:e.stack||String(e)});}
 });
}else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.includes("--calibrate")){
  const {runPwPuctCalibration}=await import("./mcts-search-calibration.mjs");
  await runPwPuctCalibration(args.filter(arg=>arg!=="--calibrate"));
 }else await main(); // Archived A/B/C/D command and resume format unchanged.
}
