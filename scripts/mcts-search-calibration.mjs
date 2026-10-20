#!/usr/bin/env node
/**
 * Targeted independent PW/PUCT calibration for the existing solo study.
 * One command: screening (multiple k/alpha/orders/C) followed by held-out
 * confirmation of baseline, calibrated PW, calibrated PUCT and calibrated
 * combined. Uses the exact frozen solo agent and printable canonical game.
 * Does not import UBA's optimizer or alter canonical MCTS defaults.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {readFileSync,existsSync,mkdirSync,appendFileSync,writeFileSync,renameSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {performance} from "node:perf_hooks";
import {SOLO_HEROES,playFullSoloExpedition} from "./study-solo-expedition-balance.mjs";
import {wilsonInterval,pairedComparison} from "../src/balance/statistics.js";

const mix=x=>{
 x=(x+0x9e3779b9)>>>0;
 x=Math.imul(x^(x>>>16),0x85ebca6b);
 x=Math.imul(x^(x>>>13),0xc2b2ae35);
 return (x^(x>>>16))>>>0||1;
};
const atomic=(path,v)=>{
 const tmp=path+".tmp";
 writeFileSync(tmp,JSON.stringify(v,null,2)+"\n");
 renameSync(tmp,path);
};
const pnum=v=>String(v).replace(".","p");
const baseline=()=>({id:"baseline",nodePriors:false,progressiveWidening:false,
 puctC:0.35,pwK:2,pwAlpha:0.55,pwOrder:null,pwRootFull:false});
const prior=c=>({id:"priors-c"+pnum(c),nodePriors:true,progressiveWidening:false,
 puctC:c,pwK:2,pwAlpha:0.55,pwOrder:null,pwRootFull:false});
const pw=(setting,{c=null,combined=false}={})=>({
 id:(combined?"combined-c"+pnum(c):"pw")+"-k"+setting.k+"-a"+
  pnum(setting.alpha)+"-"+setting.order,
 nodePriors:combined,progressiveWidening:true,puctC:c??0.35,
 pwK:setting.k,pwAlpha:setting.alpha,pwOrder:setting.order,pwRootFull:true
});
const PW_GRID=Object.freeze([
 {k:2,alpha:0.35,order:"random"},
 {k:2,alpha:0.55,order:"random"},
 {k:2,alpha:0.55,order:"soft-first"},
 {k:2,alpha:0.55,order:"public-prior"},
 {k:3,alpha:0.55,order:"public-prior"},
 {k:3,alpha:0.75,order:"public-prior"}
]);
const C_GRID=[0.15,0.35,0.70];

export function screeningArms(){
 return [baseline(),...C_GRID.map(prior),
  ...PW_GRID.map(s=>pw(s)),
  ...C_GRID.flatMap(c=>PW_GRID.map(s=>pw(s,{c,combined:true})))];
}
export function parseCalibration(argv){
 const opts={};
 const allowed=new Set(["--workers","--minutes","--out","--seed",
  "--screen-repeats","--confirm-repeats","--screen-budget","--confirm-budgets"]);
 for(let i=0;i<argv.length;i++){
  const key=argv[i];
  if(key==="--dry-run"){if(opts[key])throw Error("Repeated --dry-run");opts[key]=true;continue;}
  if(!allowed.has(key)||opts[key]!==undefined||argv[i+1]===undefined||
   argv[i+1].startsWith("--"))throw Error("Unknown, duplicate or incomplete "+key);
  opts[key]=argv[++i];
 }
 const number=(key,fallback,min,max)=>{
  const value=Number(opts[key]??fallback);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw Error("Invalid "+key);
  return value;
 };
 const budgets=(opts["--confirm-budgets"]??"32,64").split(",").map(Number);
 if(!budgets.length||budgets.some(n=>!Number.isSafeInteger(n)||n<2||n>256)||
  new Set(budgets).size!==budgets.length)throw Error("Invalid --confirm-budgets");
 return {workers:number("--workers",8,1,32),minutes:number("--minutes",720,1,10080),
  seed:number("--seed",20261020,1,0xffffffff),
  screenRepeats:number("--screen-repeats",2,1,100),
  confirmRepeats:number("--confirm-repeats",12,1,500),
  screenBudget:number("--screen-budget",16,2,256),
  confirmBudgets:budgets,
  out:resolve(opts["--out"]??"results/mcts-pw-puct-calibration"),
  dryRun:!!opts["--dry-run"]};
}
const key=x=>[x.stage,x.budget,x.hero,x.repeat,x.arm].join("|");
const avg=(rows,k)=>rows.length?rows.reduce((n,r)=>n+(r[k]??0),0)/rows.length:null;
const rate=rows=>rows.length?rows.filter(r=>r.won).length/rows.length:null;
const ci=(rows,confidence=0.95)=>rows.length?
 wilsonInterval(rows.filter(r=>r.won).length,rows.length,confidence):null;
function jobs({stage,arms,budgets,repeats,seed}){
 const tasks=[];
 for(const budget of budgets)for(let repeat=0;repeat<repeats;repeat++)
  for(let i=0;i<SOLO_HEROES.length;i++){
   const hero=SOLO_HEROES[i],trialSeed=mix(seed^
    (stage==="screen"?0x51514343:0x9292dede)^
    Math.imul(i+1,0x85ebca6b)^Math.imul(repeat+1,0xc2b2ae35));
   for(const arm of arms)tasks.push({stage,budget,repeat,hero,
    seed:trialSeed,arm:arm.id});
  }
 return tasks;
}
function summarize(rows,arms,budget){
 return arms.map(arm=>{
  const r=rows.filter(x=>x.arm===arm.id&&x.budget===budget);
  return {arm:arm.id,n:r.length,wins:r.filter(x=>x.won).length,
   winRate:rate(r),winWilson95:ci(r),vaultRate:r.length?
    r.reduce((n,x)=>n+Number(x.vaultReached),0)/r.length:null,
   meanSearchSeconds:avg(r,"searchMs")===null?null:avg(r,"searchMs")/1000,
   meanWidenedSelections:avg(r,"widenedSelections"),
   meanPuctSelections:avg(r,"puctSelections"),
   meanRootActionCoverage:r.reduce((n,x)=>n+(x.rootActionsTotal||0),0)?
    r.reduce((n,x)=>n+x.rootActionsTried,0)/
    r.reduce((n,x)=>n+x.rootActionsTotal,0):null,
   heroes:Object.fromEntries(SOLO_HEROES.map(hero=>{
    const subset=r.filter(x=>x.hero===hero);
    return [hero,{n:subset.length,wins:subset.filter(x=>x.won).length}];
   }))};
 });
}
function screenScore(row,baseTime){
 // Predeclared SCREENING heuristic only. Confirmation compares raw win rates.
 // Penalize doubling search time by 3pp equivalent; Vault is a weak tiebreaker.
 return 0.8*row.winRate+0.2*row.vaultRate-
  0.03*Math.max(0,Math.log2(row.meanSearchSeconds/Math.max(0.01,baseTime)));
}
export function selectCalibration(screenRows,arms,screenBudget){
 const stats=summarize(screenRows,arms,screenBudget);
 if(stats.some(x=>x.n!==screenRows.filter(r=>r.arm===arms[0].id).length||
  !x.n))throw Error("Cannot tune from incomplete screening cells");
 const base=stats.find(x=>x.arm==="baseline");
 const pick=prefix=>[...stats].filter(x=>x.arm.startsWith(prefix))
  .sort((a,b)=>screenScore(b,base.meanSearchSeconds)-
   screenScore(a,base.meanSearchSeconds)||a.arm.localeCompare(b.arm))[0];
 const winning=[baseline(),arms.find(a=>a.id===pick("priors-").arm),
  arms.find(a=>a.id===pick("pw-").arm),
  arms.find(a=>a.id===pick("combined-").arm)];
 if(winning.some(x=>!x))throw Error("Missing calibration winner");
 return {schema:"mcts-pw-puct-selection-v1",
  rule:"80% screening win + 20% Vault, minus 3pp per search-time doubling; held-out results NOT used for tuning",
  screenBudget,selected:winning,screening:summarize(screenRows,arms,screenBudget)};
}
function paired(rows,base,comparison,budget,confidence){
 const matching=rows.filter(x=>x.arm===base.id&&x.budget===budget);
 const treated=rows.filter(x=>x.arm===comparison.id&&x.budget===budget);
 const normalize=rs=>rs.map(r=>({...r,party:r.hero,profileHash:"same-fixed-agent",
  heroes:[r.hero]}));
 const stats=pairedComparison(normalize(matching),normalize(treated),"won",
  {confidence,samples:2500});
 const old=new Map(matching.map(x=>[[x.hero,x.repeat].join("|"),x]));
 const same=treated.map(x=>({a:old.get([x.hero,x.repeat].join("|")),b:x})).filter(x=>x.a);
 return {...stats,improved:same.filter(x=>x.b.won&&!x.a.won).length,
  worsened:same.filter(x=>!x.b.won&&x.a.won).length,
  tied:same.filter(x=>!!x.b.won===!!x.a.won).length,
  meanSearchTimeRatio:same.length?
   same.reduce((n,x)=>n+x.b.searchMs/Math.max(1,x.a.searchMs),0)/same.length:null};
}
function confirmationReport(rows,selection,budgets,repeats){
 const arms=selection.selected,confidence=1-0.05/(budgets.length*4);
 const byBudget=budgets.map(budget=>{
  const groups=summarize(rows,arms,budget);
  const comparisons=[["baseline","priors"],["baseline","pw"],
   ["baseline","combined"],["priors","combined"]].map(([a,b])=>{
    const l=arms.find(x=>x.id===a||x.id.startsWith(a+"-"));
    const r=arms.find(x=>x.id===b||x.id.startsWith(b+"-"));
    return {from:l.id,to:r.id,...paired(rows,l,r,budget,confidence)};
   });
  return {budget,groups,comparisons};
 });
 return {schema:"mcts-pw-puct-calibration-confirmation-v1",
  expectedPerArm:repeats*SOLO_HEROES.length,
  simultaneousConfidence:confidence,byBudget,
  interpretation:"Calibrated on separate screening seeds. Confirmation is solo-only; "+
   "results are conditional on the frozen solo agent and may not transfer to duo or human play."};
}
function markdown(selection,confirmation,complete,screenDone){
 const pct=x=>x===null?"n/a":(x*100).toFixed(1)+"%";
 const sec=x=>x===null?"n/a":x.toFixed(1)+" s";
 const lines=["# PW / PUCT calibrated ablation","",
  "Status: **"+(complete?"complete":screenDone?"confirmation PARTIAL":"screening PARTIAL")+"**","",
  "## Selected on SCREENING seeds (not confirmation)","",
  "| Arm | Parameters |","|---|---|"];
 if(selection)for(const a of selection.selected)
  lines.push("| "+a.id+" | C="+a.puctC+", k="+a.pwK+
   ", alpha="+a.pwAlpha+", order="+(a.pwOrder??"legacy")+
   ", rootFull="+a.pwRootFull+" |");
 if(confirmation)for(const block of confirmation.byBudget){
  lines.push("","## Held-out search budget "+block.budget,"",
   "| Arm | Trials | Wins | Wilson 95% | Vault | Search/run | Root coverage |",
   "|---|---:|---:|---|---:|---:|---:|");
  for(const g of block.groups)lines.push("| "+g.arm+" | "+g.n+" | "+
   pct(g.winRate)+" | "+(g.winWilson95?g.winWilson95.map(pct).join("–"):"n/a")+
   " | "+pct(g.vaultRate)+" | "+sec(g.meanSearchSeconds)+" | "+
   pct(g.meanRootActionCoverage)+" |");
  lines.push("","Paired comparisons with simultaneous "+
   pct(confirmation.simultaneousConfidence)+" bootstrap intervals:","",
   "| Difference | Matched | Extra won | Extra lost | Lift | CI | Mean search time ratio |",
   "|---|---:|---:|---:|---:|---|---:|");
  for(const c of block.comparisons)lines.push("| "+c.to+" vs "+c.from+
   " | "+c.pairs+" | "+c.improved+" | "+c.worsened+
   " | "+(c.difference===null?"n/a":(100*c.difference).toFixed(1)+" pp")+
   " | "+(c.interval?c.interval.map(x=>(100*x).toFixed(1)+" pp").join(" to "):"n/a")+
   " | "+(c.meanSearchTimeRatio===null?"n/a":c.meanSearchTimeRatio.toFixed(2)+"x")+" |");
 }
 lines.push("","## Decision rule","",
  "PUCT is preferable to baseline only if its held-out lift remains positive "+
   "with acceptable CPU cost. Progressive widening adds value only if the "+
   "combined variant beats PUCT alone at comparable CPU time or if a separate "+
   "fair equal-time comparison demonstrates an advantage. "+
   "Otherwise prefer the simpler PUCT-only variant.",
  "Screening winner selection introduces selection bias; only held-out rows "+
   "are confirmatory. A small number of completed rows cannot prove an algorithm superior.",
  "Do not change canonical settings automatically. Separate duo validation "+
   "is required before using this profile as a general UBA balance agent.","");
 return lines.join("\n");
}
async function stage({name,arms,budgets,repeats,options,agent,deadline}){
 const dir=join(options.out,name);mkdirSync(dir,{recursive:true});
 const mf=join(dir,"manifest.json"),nd=join(dir,"trials.ndjson");
 const tasks=jobs({stage:name,arms,budgets,repeats,seed:options.seed});
 const manifest={schema:"mcts-pw-puct-calibration-stage-v1",
  revision:options.revision,agent,seed:options.seed,name,arms,budgets,repeats,tasks};
 if(existsSync(mf)){
  if(JSON.stringify(JSON.parse(readFileSync(mf,"utf8")))!==JSON.stringify(manifest))
   throw Error("Incompatible "+name+" checkpoint; source/settings changed");
 }else atomic(mf,manifest);
 const rows=existsSync(nd)?readFileSync(nd,"utf8").trim().split("\n")
  .filter(Boolean).map(JSON.parse):[];
 const taskKeys=new Set(tasks.map(key)),seen=new Set();
 for(const r of rows){
  if(!taskKeys.has(key(r))||seen.has(key(r)))throw Error("Unexpected or duplicate checkpoint record");
  seen.add(key(r));
 }
 const pending=tasks.filter(t=>!seen.has(key(t)));
 const persist=()=>atomic(join(dir,"summary.json"),{
  schema:"mcts-pw-puct-stage-status-v1",planned:tasks.length,completed:rows.length,
  complete:rows.length===tasks.length,byBudget:Object.fromEntries(
   budgets.map(b=>[b,summarize(rows,arms,b)]))});
 persist();
 if(!pending.length)return {rows,complete:true,planned:tasks.length};
 if(Date.now()>=deadline)return {rows,complete:false,planned:tasks.length};
 console.log(name+" calibration: "+rows.length+"/"+tasks.length+" complete; "+
  options.workers+" workers");
 return await new Promise(resolveStage=>{
  const pool=[],queue=[...pending];
  let active=0,done=false;
  const finish=(reason,error=null)=>{
   if(done)return;
   done=true;clearInterval(tick);persist();
   for(const w of pool)void w.terminate();
   console.log(name+": "+rows.length+"/"+tasks.length+" ("+reason+")");
   if(error)throwLater(error);
   else resolveStage({rows,complete:rows.length===tasks.length,
    planned:tasks.length,reason});
  };
  const throwLater=error=>resolveStage({rows,complete:false,
   planned:tasks.length,error:String(error)});
  const dispatch=w=>{
   if(done)return;
   if(Date.now()>=deadline){finish("time limit");return;}
   const task=queue.shift();
   if(!task){if(!active)finish("complete");return;}
   active++;w.postMessage({...task,params:arms.find(x=>x.id===task.arm)});
  };
  const tick=setInterval(()=>{persist();if(Date.now()>=deadline)finish("time limit");},30000);
  for(let i=0;i<Math.min(options.workers,pending.length);i++){
   const w=new Worker(new URL(import.meta.url),{workerData:{agent}});
   pool.push(w);
   w.on("message",msg=>{
    if(done)return;
    active--;
    if(msg.error){finish("failed",msg.error);return;}
    const r=msg.result;
    if(seen.has(key(r))||!taskKeys.has(key(r))){
     finish("invalid result",new Error("Duplicate or unplanned worker result"));return;
    }
    seen.add(key(r));rows.push(r);appendFileSync(nd,JSON.stringify(r)+"\n");
    if(rows.length%8===0)persist();
    dispatch(w);
    if(!queue.length&&!active)finish("complete");
   });
   w.on("error",e=>finish("worker error",e));
   w.on("exit",code=>{if(!done&&code!==0)finish("worker exit",new Error("Exit "+code));});
  }
  pool.forEach(dispatch);
 });
}
export async function runPwPuctCalibration(argv=process.argv.slice(2)){
 const o=parseCalibration(argv),agent=JSON.parse(readFileSync(
  "experiments/agents/solo-balance-reference-v1.json","utf8"));
 if(agent.id!=="solo-balance-reference-v1"||
  agent.policy.mctsPragmaticVariant!=="tree-only"||
  agent.parameters.budget!==32)throw Error("Frozen reference solo agent changed");
 const revision=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const screenArms=screeningArms(),screenPlanned=screenArms.length*
  SOLO_HEROES.length*o.screenRepeats,
  confirmPlanned=4*SOLO_HEROES.length*o.confirmRepeats*o.confirmBudgets.length;
 const plan={revision,screenBudget:o.screenBudget,confirmBudgets:o.confirmBudgets,
  screenRepeats:o.screenRepeats,confirmRepeats:o.confirmRepeats,
  heroes:SOLO_HEROES,screenArms,screenPlanned,confirmPlanned,
  note:"Calibration selects PW and PUCT settings on disjoint screening seeds; "+
   "fresh confirmation uses only the four selected arms."};
 if(o.dryRun){console.log(JSON.stringify(plan,null,2));return plan;}
 mkdirSync(o.out,{recursive:true});
 const globalManifest={schema:"mcts-pw-puct-two-stage-v1",...plan,
  seed:o.seed,agentId:agent.id,agentParameters:agent.parameters};
 const manifestPath=join(o.out,"manifest.json");
 if(existsSync(manifestPath)){
  if(JSON.stringify(JSON.parse(readFileSync(manifestPath,"utf8")))!==
   JSON.stringify(globalManifest))throw Error("Incompatible main calibration manifest");
 }else atomic(manifestPath,globalManifest);
 const deadline=Date.now()+o.minutes*60000;
 const screen=await stage({name:"screen",arms:screenArms,budgets:[o.screenBudget],
  repeats:o.screenRepeats,options:{...o,revision},agent,deadline});
 if(screen.error)throw Error(screen.error);
 if(!screen.complete){
  atomic(join(o.out,"summary.json"),{complete:false,phase:"screen",
   finished:screen.rows.length,total:screenPlanned+confirmPlanned});
  writeFileSync(join(o.out,"comparison.md"),markdown(null,null,false,false));
  return {complete:false,stage:"screen"};
 }
 const selected=selectCalibration(screen.rows,screenArms,o.screenBudget);
 const selectionPath=join(o.out,"selection.json");
 if(existsSync(selectionPath)){
  if(JSON.stringify(JSON.parse(readFileSync(selectionPath,"utf8")))!==
   JSON.stringify(selected))throw Error("Calibration winner has changed on resume");
 }else atomic(selectionPath,selected);
 const a=new Set(jobs({stage:"screen",arms:screenArms,budgets:[o.screenBudget],
  repeats:o.screenRepeats,seed:o.seed}).map(t=>t.hero+":"+t.seed));
 const b=new Set(jobs({stage:"confirm",arms:selected.selected,
  budgets:o.confirmBudgets,repeats:o.confirmRepeats,seed:o.seed}).map(t=>t.hero+":"+t.seed));
 if([...b].some(id=>a.has(id)))throw Error("Screen and confirmation seed collision");
 const confirmed=await stage({name:"confirm",arms:selected.selected,
  budgets:o.confirmBudgets,repeats:o.confirmRepeats,
  options:{...o,revision},agent,deadline});
 if(confirmed.error)throw Error(confirmed.error);
 const report=confirmationReport(confirmed.rows,selected.selected?selected:null,
  o.confirmBudgets,o.confirmRepeats);
 const done=confirmed.complete;
 atomic(join(o.out,"summary.json"),{
  schema:"mcts-pw-puct-calibration-summary-v1",complete:done,
  finished:screen.rows.length+confirmed.rows.length,
  planned:screenPlanned+confirmPlanned,
  screenComplete:true,confirmationComplete:done,selection:selected,
  confirmation:report,canonicalDefaultsChanged:false});
 writeFileSync(join(o.out,"comparison.md"),markdown(selected,report,done,true));
 console.log("Calibrated PW/PUCT "+(done?"COMPLETE":"PARTIAL")+": "+
  confirmed.rows.length+"/"+confirmPlanned+
  " confirmation expeditions. See "+join(o.out,"comparison.md"));
 return {complete:done,selection:selected,report};
}
if(!isMainThread){
 parentPort.on("message",job=>{
  try{
   const p=workerData.agent.parameters,a=job.params,st=performance.now();
   const r=playFullSoloExpedition({hero:job.hero,seed:job.seed,
    arm:"implicit",budget:job.budget,c:p.c,alpha:p.alpha,
    heuristicMode:"solo-threat",equipmentMode:"solo-pragmatic",
    mctsPragmaticVariant:"tree-only",
    softTreeBonus:p.softTreeBonus,
    softTreeFirstVisitProbability:p.softTreeFirstVisitProbability,
    softRolloutProbability:p.softRolloutProbability,
    implicitHpScale:p.implicitHpScale,implicitThreatScale:p.implicitThreatScale,
    maxSearchSteps:p.maxSearchSteps,
    nodePriors:a.nodePriors,progressiveWidening:a.progressiveWidening,
    puctC:a.puctC,pwK:a.pwK,pwAlpha:a.pwAlpha,
    pwOrder:a.pwOrder,pwRootFull:a.pwRootFull});
   parentPort.postMessage({result:{stage:job.stage,budget:job.budget,
    hero:job.hero,repeat:job.repeat,arm:job.arm,seed:job.seed,
    won:r.won,vaultReached:r.vaultReached,ending:r.ending,
    ordinaryEncounters:r.ordinaryEncounters,roomsCleared:r.roomsCleared,
    searchMs:r.searchMs,elapsedMs:performance.now()-st,
    puctSelections:r.searchControls?.puctSelections??0,
    widenedSelections:r.searchControls?.widenedSelections??0,
    rootActionsTried:r.searchControls?.rootActionsTried??0,
    rootActionsTotal:r.searchControls?.rootActionsTotal??0}});
  }catch(e){parentPort.postMessage({error:e.stack??String(e)});}
 });
}
