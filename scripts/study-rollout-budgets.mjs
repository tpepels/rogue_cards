/**
 * Local, FIXED-PARAMETER, matched-seed stochastic-budget experiment.
 * Compare fair and oracle at the SAME weights and 0/8/32/128 rollouts.
 * No parameter tuning on these seeds. No CI/cloud dependency.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {existsSync,mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {validateAgentConfig,AGENT_WEIGHTS} from "../src/research-agent.js";
import {expeditionSeed,paired} from "./study-agent.mjs";
const PARTIES=[...HEROES.map(h=>[h.id]),...HEROES.flatMap((h,i)=>
 HEROES.slice(i+1).map(o=>[h.id,o.id]))];
const USE="npm run agent:budgets -- --runs 20 --seeds 71001,72001 "+
 "--budgets 0,8,32,128 --workers 8 --out results/rollouts-01";
function parse(args){
 const values={},flags=new Set(),allowed=new Set(["--runs","--seeds",
  "--budgets","--strategies","--workers","--out","--weights",
  "--rollout-rooms","--combat-actions","--combat-room-depth","--parties"]);
 for(let i=0;i<args.length;i++){
  if(args[i]==="--dry-run"){flags.add("dry");continue;}
  if(!allowed.has(args[i])||args[i] in values||!args[i+1]||
   args[i+1].startsWith("--"))throw Error("Bad args. "+USE);
  values[args[i]]=args[++i];
 }
 const integer=(raw,name,max)=>{if(!/^\d+$/.test(String(raw))||
  !Number.isSafeInteger(Number(raw))||Number(raw)>max)
  throw Error("Invalid "+name);return Number(raw)};
 const runs=integer(values["--runs"]??20,"runs",3000);
 if(!runs)throw Error("Runs must exceed zero");
 const seeds=(values["--seeds"]||"71001,72001,73001").split(",")
  .map(x=>integer(x,"seed",0xffffffff));
 if(!seeds.length||new Set(seeds).size!==seeds.length)
  throw Error("Seed batches must be unique");
 const budgets=(values["--budgets"]||"0,8,32,128").split(",")
  .map(x=>integer(x,"budget",128));
 if(!budgets.length||new Set(budgets).size!==budgets.length)
  throw Error("Budgets must be unique");
 const strategies=(values["--strategies"]||"magic,treasure").split(",");
 if(new Set(strategies).size!==strategies.length||
  strategies.some(x=>!["magic","treasure","survival","seal","negotiation"].includes(x)))
  throw Error("Unknown strategies");
 const groups=values["--parties"]||"all";
 if(!["all","solo","duo"].includes(groups))throw Error("Bad --parties");
 const partyList=PARTIES.filter(x=>groups==="all"||
  (groups==="solo"?x.length===1:x.length===2));
 const workers=integer(values["--workers"]??
  Math.min(6,Math.max(1,availableParallelism()-1)),"workers",16);
 if(!workers)throw Error("Need at least one worker");
 const rolloutRooms=integer(values["--rollout-rooms"]??2,"rolloutRooms",3);
 const combatActions=integer(values["--combat-actions"]??14,"combatActions",32);
 const combatRoomDepth=integer(values["--combat-room-depth"]??0,"combatRoomDepth",2);
 if(!rolloutRooms||combatActions<4)throw Error("Bad rollout horizon");
 const source=values["--weights"];
 let weights={...AGENT_WEIGHTS};
 if(source){
  const file=JSON.parse(readFileSync(resolve(source),"utf8"));
  weights=file.selected?.fair?.weights||file.weights||file;
 }
 validateAgentConfig({knowledge:"fair",weights,budget:0});
 const arms=["current",...budgets.flatMap(n=>["fair-"+n,"oracle-"+n])];
 const planned=partyList.length*strategies.length*seeds.length*runs*arms.length;
 if(planned>2000000)throw Error("Oversized study; split seeds into replications");
 return {runs,seeds,budgets,strategies,workers,partyList,
  arms,weights,rolloutRooms,combatActions,combatRoomDepth,
  out:resolve(values["--out"]||"results/rollout-budgets"),
  plannedExpeditions:planned,dryRun:flags.has("dry")};
}
function execute(job){
 const {config,arm,batchSeed}=job;
 const count=config.runs;
 const params=arm==="current"?{researchPolicy:"planner",plannerRisk:"cautious"}:
  {researchPolicy:"agent",agentConfig:validateAgentConfig({
   knowledge:arm.startsWith("oracle")?"oracle":"fair",
   weights:config.weights,budget:Number(arm.split("-")[1]),
   planning:"rollout",samplingSeed:0x4a6f792d,
   rolloutRooms:config.rolloutRooms,
   combatActions:config.combatActions,
   combatRoomDepth:config.combatRoomDepth})};
 const rows=[];
 for(const strategy of config.strategies){
  const strategyIndex=config.strategies.indexOf(strategy);
  for(const party of config.partyList){
   const partyIndex=PARTIES.findIndex(x=>x.join("+")===party.join("+"));
   const bits=Buffer.alloc(Math.ceil(count/8));
   const row={batchSeed,strategy,party:party.join("+"),n:count,wins:0,
    unresolved:0,stalls:0,rolloutRoomDecisions:0,rolloutCombatDecisions:0,
    winBits:null};
   for(let i=0;i<count;i++){
    const r=simulateFullExpedition({seed:expeditionSeed(
     batchSeed,partyIndex,strategyIndex,i),heroes:party,strategy,...params});
    const win=Number(r.won);
    row.wins+=win;if(win)bits[i>>>3]|=1<<(i&7);
    row.unresolved+=r.unresolved;
    row.stalls+=Number(r.roundLimit);
    row.rolloutRoomDecisions+=(r.plannerDecisions?.rolloutRoomDecisions||0);
    row.rolloutCombatDecisions+=(r.plannerDecisions?.rolloutCombatDecisions||0);
   }
   row.winBits=bits.toString("base64");
   rows.push(row);
  }
 }
 const n=rows.reduce((a,r)=>a+r.n,0),
  wins=rows.reduce((a,r)=>a+r.wins,0);
 return {arm,batchSeed,rows,n,wins,winRate:wins/n,
  unresolved:rows.reduce((a,r)=>a+r.unresolved,0),
  stalls:rows.reduce((a,r)=>a+r.stalls,0)};
}
if(!isMainThread){
 try{parentPort.postMessage({ok:true,result:execute(workerData)})}
 catch(e){parentPort.postMessage({ok:false,error:e.stack||String(e)})}
}
async function parallel(jobs,n){
 const results=Array(jobs.length);let next=0,done=0;
 await Promise.all(Array.from({length:Math.min(n,jobs.length)},async()=>{
  while(next<jobs.length){
   const i=next++,job=jobs[i];
   results[i]=await new Promise((yes,no)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:job});
    let got=false;
    worker.on("message",x=>{got=true;x.ok?yes(x.result):no(Error(x.error))});
    worker.on("error",no);
    worker.on("exit",code=>{if(!got)no(Error("No worker result, exit "+code))});
   });
   process.stderr.write("Completed "+(++done)+"/"+jobs.length+
    ": "+job.arm+" seed "+job.batchSeed+"\n");
  }
 }));
 return results;
}
const fmt=n=>(100*n).toFixed(2)+"%";
const pp=n=>(100*n).toFixed(2)+" pp";
const sha=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}
 catch{return null}};
function render(summary){
 const out=["# Rogue Cards - Exact-state stochastic rollout budgets","",
  "Git commit: "+summary.commit,
  "All four knowledge/budget combinations share frozen parameter weights.",
  "The simulator uses actual printed dice and effects, never predicted dice.",
  "Sampled hypothetical dice/decks are matched across candidate actions.","",
  "## Fixed-weight performance by budget","",
  "| Arm | Expeditions | Win rate | Difference from cautious | 95% paired CI |",
  "|---|---:|---:|---:|---|"];
 for(const arm of summary.arms){
  const a=summary.results[arm],contrast=summary.contrasts[arm];
  out.push("| "+arm+" | "+a.n+" | "+fmt(a.winRate)+
   " | "+(contrast?pp(contrast.delta):"baseline")+
   " | "+(contrast?contrast.ci95.map(pp).join(" to "):"-")+" |");
 }
 out.push("","## The value of information at identical parameters and budget","",
  "| Budget | Oracle minus fair | Approx. 95% paired CI |",
  "|---|---:|---|");
 for(const budget of summary.budgets){
  const c=summary.knowledgeContrasts[budget];
  out.push("| "+budget+" | "+pp(c.delta)+" | "+c.ci95.map(pp).join(" to ")+" |");
 }
 out.push("","## Research notes","",
  "- A zero-rollout agent uses the same weights with heuristic continuations only.",
  "- At nonzero budgets, actions are actually played in isolated cloned game states.",
  "- Room horizon and combat action limits are finite; terminal states are exact, incomplete states are scored with a disclosed utility heuristic.",
  "- Even Oracle is not a mathematically optimal upper bound. Bad choices can still result from imperfect continuation policy or finite samples.",
  "- Fair hidden piles are generated from publicly known acquisitions, played Rooms and scouted cards.",
  "- Real future dice and RNG state are never copied into rollouts.",
  "- Same initial evaluation seeds across arms do not imply identical subsequent dice when decisions differ.",
  "- This is held-out policy comparison at fixed weights, not parameter optimization or human win probabilities.",
  "- Confidence intervals are unadjusted for multiple budgets, Heroes and policies.",
  "- Knight remains the intentionally stronger beginner Hero.","");
 return out.join("\n")+"\n";
}
async function main(){
 let c;try{c=parse(process.argv.slice(2))}
 catch(e){process.stderr.write(e.message+"\n");process.exitCode=2;return;}
 process.stderr.write("ROLLOUT BUDGET STUDY "+JSON.stringify({
  ...c,partyList:c.partyList.length},null,2)+"\n");
 if(c.dryRun)return;
 if(existsSync(c.out))throw Error("Output already exists: "+c.out);
 mkdirSync(c.out,{recursive:true});
 const commit=sha();
 writeFileSync(resolve(c.out,"manifest.json"),
  JSON.stringify({...c,commit,node:process.version},null,2)+"\n");
 const jobs=c.arms.flatMap(arm=>c.seeds.map(batchSeed=>({
  arm,batchSeed,config:c
 })));
 const executed=await parallel(jobs,c.workers);
 if(executed.some(r=>r.unresolved||r.stalls))
  throw Error("Unresolved or stalled live expeditions detected");
 const results=Object.fromEntries(c.arms.map(arm=>{
  const runs=executed.filter(r=>r.arm===arm);
  return [arm,{n:runs.reduce((a,r)=>a+r.n,0),
   wins:runs.reduce((a,r)=>a+r.wins,0),
   winRate:runs.reduce((a,r)=>a+r.wins,0)/
    runs.reduce((a,r)=>a+r.n,0),
   rows:runs.flatMap(r=>r.rows)}];
 }));
 const contrasts=Object.fromEntries(c.arms.filter(a=>a!=="current").map(
  arm=>[arm,paired(results.current,results[arm])]));
 const knowledgeContrasts=Object.fromEntries(c.budgets.map(b=>[
  b,paired(results["fair-"+b],results["oracle-"+b])]));
 const summary={schema:"rogue-cards-rollout-budget-study-v1",commit,
  budgets:c.budgets,arms:c.arms,settings:{...c,partyList:c.partyList.map(
   p=>p.join("+"))},results,contrasts,knowledgeContrasts};
 writeFileSync(resolve(c.out,"summary.json"),JSON.stringify(summary,null,2)+"\n");
 writeFileSync(resolve(c.out,"summary.md"),render(summary));
 writeFileSync(resolve(c.out,"validation.json"),JSON.stringify({
  pass:true,unresolved:0,stalls:0,
  supportsIdenticalSeedPairing:true,usesRealGameActions:true},null,2)+"\n");
 process.stderr.write("Read "+resolve(c.out,"summary.md")+"\n");
}
if(isMainThread&&process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url))await main();
