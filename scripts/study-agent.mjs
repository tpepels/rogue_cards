/**
 * LOCAL optimizer: fit separate fair/oracle heuristic parameters on train
 * seeds; select on validation seeds; compare with cautious baseline on
 * independent held-out seeds. No external services.
 */
import {Worker,isMainThread,workerData,parentPort} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {AGENT_WEIGHTS,OPTIMIZATION_RANGES,
 validateAgentConfig} from "../src/research-agent.js";

const parties=[...HEROES.map(x=>[x.id]),...HEROES.flatMap((x,i)=>
 HEROES.slice(i+1).map(y=>[x.id,y.id]))];
const presets={
 smoke:{trainRuns:2,validationRuns:3,testRuns:5,candidates:3,rounds:1,
  finalists:2,budget:2,trainSeeds:[10111,10211],
  validationSeeds:[20111,20211],testSeeds:[30111,30211]},
 standard:{trainRuns:25,validationRuns:75,testRuns:250,candidates:16,rounds:2,
  finalists:4,budget:8,trainSeeds:[41011,42011,43011,44011],
  validationSeeds:[51011,52011,53011,54011],
  testSeeds:[61011,62011,63011,64011,65011,66011]},
 deep:{trainRuns:100,validationRuns:200,testRuns:1000,candidates:40,rounds:3,
  finalists:6,budget:24,trainSeeds:[110003,120003,130003,140003,150003],
  validationSeeds:[210003,220003,230003,240003,250003],
  testSeeds:[310003,320003,330003,340003,350003,360003]}
};
const mix=x=>{let v=(x+0x9e3779b9)>>>0;
 v=Math.imul(v^(v>>>16),0x85ebca6b);
 v=Math.imul(v^(v>>>13),0xc2b2ae35);return (v^(v>>>16))>>>0};
export const expeditionSeed=(batch,party,strategy,index)=>mix((batch^
 Math.imul(party+1,0x9e3779b1)^Math.imul(strategy+1,0x85ebca6b)^
 Math.imul(index+1,0xc2b2ae35))>>>0);
const seedRandom=seed=>{let state=seed>>>0;return()=>{
 state=mix(state);return state/4294967296}};
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const flags=new Set(["--dry-run"]);
function parse(args){
 const raw={},opt=new Set(),known=new Set(["--preset","--train-seeds",
  "--validation-seeds","--test-seeds","--train-runs","--validation-runs",
  "--test-runs","--candidates","--rounds","--finalists","--budget",
  "--workers","--strategies","--out","--planning",
  "--rollout-rooms","--combat-actions","--combat-room-depth"]);
 for(let i=0;i<args.length;i++){
  if(flags.has(args[i])){opt.add(args[i]);continue}
  if(!known.has(args[i])||!args[i+1]||args[i+1].startsWith("--")||
   raw[args[i]]!==undefined)throw Error("Invalid agent study arguments: "+args[i]);
  raw[args[i]]=args[++i];
 }
 const preset=raw["--preset"]||"smoke",base=presets[preset];
 if(!base)throw Error("Unknown preset "+preset);
 const uint=(x,name,max)=>{if(!/^\d+$/.test(String(x))||
  !Number.isSafeInteger(Number(x))||Number(x)>max)throw Error("Invalid "+name);
  return Number(x)};
 const seeds=(name,fallback)=>raw[name]?raw[name].split(",").map(
  x=>uint(x,name,0xffffffff)):fallback;
 const trainSeeds=seeds("--train-seeds",base.trainSeeds);
 const validationSeeds=seeds("--validation-seeds",base.validationSeeds);
 const testSeeds=seeds("--test-seeds",base.testSeeds);
 if(!trainSeeds.length||!validationSeeds.length||!testSeeds.length||
  new Set([...trainSeeds,...validationSeeds,...testSeeds]).size!==
  trainSeeds.length+validationSeeds.length+testSeeds.length)
  throw Error("Training, validation and held-out seed lists must be disjoint");
 const number=(n,fallback,min,max)=>{const value=uint(raw[n]??fallback,n,max);
  if(value<min)throw Error("Too few "+n);return value};
 const trainRuns=number("--train-runs",base.trainRuns,1,500);
 const validationRuns=number("--validation-runs",base.validationRuns,1,1000);
 const testRuns=number("--test-runs",base.testRuns,1,5000);
 const candidates=number("--candidates",base.candidates,2,256);
 const rounds=number("--rounds",base.rounds,1,6);
 const finalists=number("--finalists",base.finalists,1,16);
 const budget=number("--budget",base.budget,0,128);
 const planning=raw["--planning"]||"heuristic";
 if(!["heuristic","rollout"].includes(planning))
  throw Error("Unknown planning mode "+planning);
 const rolloutRooms=number("--rollout-rooms",2,1,3);
 const combatActions=number("--combat-actions",14,4,32);
 const combatRoomDepth=number("--combat-room-depth",0,0,2);
 const workers=number("--workers",Math.min(6,Math.max(1,availableParallelism()-1)),1,16);
 const strategies=(raw["--strategies"]||"magic,treasure").split(",");
 if(new Set(strategies).size!==strategies.length||strategies.some(x=>
  !["survival","treasure","magic","seal","negotiation"].includes(x)))
  throw Error("Unknown/duplicate strategy");
 const steps=parties.length*strategies.length;
 const plannedExpeditions=steps*(2*candidates*rounds*trainRuns*trainSeeds.length+
  2*Math.min(finalists,candidates)*validationRuns*validationSeeds.length+
  4*testRuns*testSeeds.length);
 if(plannedExpeditions>50000000)throw Error("Too many expeditions in one run");
 return {preset,trainRuns,validationRuns,testRuns,candidates,rounds,
  finalists,budget,planning,rolloutRooms,combatActions,combatRoomDepth,
  workers,strategies,trainSeeds,validationSeeds,
  testSeeds,plannedExpeditions,lookaheadSeed:0x4a6f792d,
  out:resolve(raw["--out"]||"results/agent-"+preset),
  dryRun:opt.has("--dry-run")};
}
export function candidateWeights(rand,around=null,scale=1){
 const weights={};
 for(const [name,[lo,hi]] of Object.entries(OPTIMIZATION_RANGES)){
  const u=rand();
  weights[name]=around?
   clamp(around[name]+(u+rand()+rand()-1.5)*(hi-lo)*.35*scale,lo,hi):
   lo>0?Math.exp(Math.log(lo)+(Math.log(hi)-Math.log(lo))*u):lo+(hi-lo)*u;
 }
 return weights;
}
const choiceScore=x=>.85*x.wins/x.n+.15*x.otherWins/Math.max(1,x.otherN);
const readBit=(buffer,i)=>Number(!!(buffer[i>>>3]&(1<<(i&7))));
function execute(job){
 const options=job.arm==="current"?
  {researchPolicy:"planner",plannerRisk:"cautious"}:
  {researchPolicy:"agent",agentConfig:validateAgentConfig({
   knowledge:job.arm==="oracle-fixed"?"oracle":job.arm,
   weights:job.weights,budget:job.budget,planning:job.planning,
   rolloutRooms:job.rolloutRooms,combatActions:job.combatActions,
   combatRoomDepth:job.combatRoomDepth,
   samplingSeed:job.lookaheadSeed})};
 const rows=[],totals={n:0,wins:0,otherN:0,otherWins:0,
  unresolved:0,stalls:0};
 for(const batchSeed of job.seeds)
 for(const [si,strategy] of job.strategies.entries())
 for(const [pi,party] of parties.entries()){
  const row={batchSeed,strategy,party:party.join("+"),
   n:job.runs,wins:0,unresolved:0,stalls:0};
  const bits=Buffer.alloc(Math.ceil(job.runs/8));
  if(job.full)row.items={},row.decisions={};
  for(let i=0;i<job.runs;i++){
   const r=simulateFullExpedition({seed:expeditionSeed(batchSeed,pi,si,i),
    heroes:party,strategy,...options});
   const won=Number(r.won);
   row.wins+=won;
   row.unresolved+=r.unresolved;
   row.stalls+=Number(r.roundLimit);
   if(won)bits[i>>>3]|=1<<(i&7);
   if(party.length===1&&party[0]!=="knight"){
    totals.otherN++;totals.otherWins+=won;
   }
   if(job.full){
    for(const [id,x] of Object.entries(r.itemOpportunities||{})){
     const cell=row.items[id]??={opportunities:0,uses:0,passive:0};
     cell.opportunities+=x.total;
    }
    for(const [id,x] of Object.entries(r.itemUses||{})){
     const cell=row.items[id]??={opportunities:0,uses:0,passive:0};
     cell.uses+=x.total;
    }
    for(const [id,x] of Object.entries(r.itemPassiveEffects||{})){
     const cell=row.items[id]??={opportunities:0,uses:0,passive:0};
     cell.passive+=x.triggers;
    }
    for(const [key,x] of Object.entries(r.plannerDecisions||{}))
     row.decisions[key]=(row.decisions[key]||0)+x;
   }
  }
  row.winBits=bits.toString("base64");
  totals.n+=row.n;totals.wins+=row.wins;
  totals.unresolved+=row.unresolved;totals.stalls+=row.stalls;
  rows.push(row);
 }
 return {id:job.id,arm:job.arm,stage:job.stage,rows,
  ...totals,winRate:totals.wins/totals.n,score:choiceScore(totals)};
}
if(!isMainThread){
 try{parentPort.postMessage({ok:true,result:execute(workerData)})}
 catch(e){parentPort.postMessage({ok:false,error:e.stack||String(e)})}
}
async function parallel(jobs,workers){
 let i=0,complete=0;const results=Array(jobs.length);
 await Promise.all(Array.from({length:Math.min(workers,jobs.length)},async()=>{
  while(i<jobs.length){
   const index=i++,job=jobs[index];
   results[index]=await new Promise((done,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:job});
    let got=false;
    worker.on("message",msg=>{got=true;msg.ok?done(msg.result):reject(Error(msg.error))});
    worker.on("error",reject);
    worker.on("exit",code=>{if(!got)reject(Error("Worker quit: "+code))});
   });
   process.stderr.write(job.stage+" "+(++complete)+"/"+jobs.length+
    " "+job.arm+" "+job.id+"\n");
  }
 }));
 if(results.some(x=>x.unresolved||x.stalls))
  throw Error("Stalled expeditions or unresolved printed effects");
 return results;
}
const withJob=(stage,arm,id,weights,seeds,runs,c,full=false)=>({
 stage,arm,id,weights,seeds,runs,strategies:c.strategies,budget:c.budget,
 planning:c.planning,rolloutRooms:c.rolloutRooms,
 combatActions:c.combatActions,combatRoomDepth:c.combatRoomDepth,
 lookaheadSeed:c.lookaheadSeed,full});
export function paired(a,b){
 const source=new Map(a.rows.map(r=>[r.batchSeed+"|"+r.strategy+"|"+r.party,r]));
 let n=0,gained=0,lost=0;
 for(const x of b.rows){
  const y=source.get(x.batchSeed+"|"+x.strategy+"|"+x.party);
  if(!y||x.n!==y.n)throw Error("Nonmatching heldout cohorts");
  const bs=Buffer.from(y.winBits,"base64"),xs=Buffer.from(x.winBits,"base64");
  for(let i=0;i<x.n;i++){
   const delta=readBit(xs,i)-readBit(bs,i);
   n++;gained+=Number(delta>0);lost+=Number(delta<0);
  }
 }
 const delta=(gained-lost)/n,q=(gained+lost)/n;
 const se=Math.sqrt(Math.max(0,(q-delta*delta)/n));
 return {n,delta,ci95:[delta-1.96*se,delta+1.96*se],gained,lost};
}
function perParty(result){
 const map={};
 for(const row of result.rows){
  const cell=map[row.party]??={n:0,wins:0};
  cell.n+=row.n;cell.wins+=row.wins;
 }
 return Object.fromEntries(Object.entries(map).map(([id,x])=>
  [id,{...x,winRate:x.wins/x.n}]));
}
function report(result){
 const pct=x=>(100*x).toFixed(2)+"%";
 const pp=x=>(100*x).toFixed(2)+" pp";
 const out=["# Optimized fair-information agent versus deck Oracle","",
  "Git revision: "+result.commit,
 "Decision evaluator: "+result.config.planning+
 " | chance samples/action: "+result.config.budget,
  "All training, validation and held-out seed batches are disjoint.",
  "Future dice are never visible, and chance samples use an independent RNG.",
  "",
  "## Held-out results (parameters frozen BEFORE these runs)","",
  "| Agent | Win rate | Expeditions |",
  "|---|---:|---:|"];
 for(const arm of ["current","fair","oracle-fixed","oracle"]){
  const x=result.holdout[arm];
  out.push("| "+arm+" | "+pct(x.winRate)+" | "+x.n+" |");
 }
 out.push("","## Matched-seed results","",
  "| Contrast | Difference | Approx. 95% paired interval | Improved / harmed |",
  "|---|---:|---|---:|");
 for(const [name,x] of Object.entries(result.paired)){
  out.push("| "+name+" | "+pp(x.delta)+" | "+x.ci95.map(pp).join(" to ")+
   " | "+x.gained+" / "+x.lost+" |");
 }
 out.push("","## Fitted heuristic parameters","",
  "~~~json",JSON.stringify(result.selected,null,2),"~~~","",
  "## Heroes and two-Hero combinations","",
  "| Party | Current | Tuned fair | Oracle same weights | Tuned Oracle |",
  "|---|---:|---:|---:|---:|");
 for(const id of Object.keys(result.partyRates.current))
  out.push("| "+id+" | "+["current","fair","oracle-fixed","oracle"].map(a=>
   pct(result.partyRates[a][id].winRate)).join(" | ")+" |");
 out.push("","## Interpretation","",
  "- Fair agent has ordinary information; Oracle knows the remaining ordered Item, Room and Monster decks.",
  "- The agents share actual printed actions and effects. Neither observes future dice or PRNG state.",
  "- Planning budget applies to bounded chance-sampled Room lookahead, not full cloned-expedition rollouts or exact optimal play.",
  "- Oracle-fixed reuses the fair agent's frozen weights and planning budget. Oracle-fixed minus fair therefore isolates deck visibility, conditional on this approximate policy.",
  "- Tuned Oracle versus Oracle-fixed estimates the additional effect of re-optimizing weights. It is not a proven optimal strategy.",
  "- The Knight is intentionally the stronger beginner Hero. His win rate is not constrained to equal the others.",
  "- More simulations reduce sampling noise, NOT heuristic-model error or human-play discrepancy.",
  "- Intervals are per-run paired normal approximations, unadjusted for multiplicity.","");
 return out.join("\n")+"\n";
}
const gitCommit=()=>{try{return execFileSync("git",["rev-parse","HEAD"],
 {encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}catch{return null}};
async function main(){
 let c;try{c=parse(process.argv.slice(2))}
 catch(e){process.stderr.write(e.message+"\n");process.exitCode=2;return}
 process.stderr.write("AGENT STUDY "+JSON.stringify(c,null,2)+"\n");
 if(c.dryRun)return;
 if(existsSync(c.out))throw Error("Output exists: "+c.out);
 mkdirSync(c.out,{recursive:true});
 const commit=gitCommit();
 writeFileSync(resolve(c.out,"manifest.json"),JSON.stringify({...c,commit,node:process.version},null,2)+"\n");
 const random=seedRandom(0x51b4d015),history=[],selected={};
 for(const arm of ["fair","oracle"]){
  let elite=[],all=[];
  for(let round=0;round<c.rounds;round++){
   const candidates=Array.from({length:c.candidates},(_,i)=>({
    id:arm+"-"+round+"-"+i,
    weights:round===0&&i===0?{...AGENT_WEIGHTS}:
     round>0&&i<elite.length?{...elite[i].weights}:
     candidateWeights(random,round>0&&elite.length?
      elite[i%elite.length].weights:null,1/(1+.7*round))}));
   const runs=await parallel(candidates.map(x=>withJob(
    "train",arm,x.id,x.weights,c.trainSeeds,c.trainRuns,c)),c.workers);
   const scored=candidates.map((x,i)=>({...x,trainScore:runs[i].score,
    trainWinRate:runs[i].winRate,round}));
   history.push(...scored.map(x=>({...x,arm,stage:"train"})));
   all.push(...scored);
   elite=[...scored].sort((a,b)=>b.trainScore-a.trainScore)
    .slice(0,Math.min(c.finalists,scored.length));
  }
  const finalists=[...all].sort((a,b)=>b.trainScore-a.trainScore)
   .slice(0,c.finalists);
  const validations=await parallel(finalists.map(x=>withJob(
   "validate",arm,x.id,x.weights,c.validationSeeds,c.validationRuns,c)),
   c.workers);
  const ranked=finalists.map((x,i)=>({...x,
   validationScore:validations[i].score,validationRate:validations[i].winRate}))
   .sort((a,b)=>b.validationScore-a.validationScore);
  history.push(...ranked.map(x=>({...x,arm,stage:"validate"})));
  selected[arm]={id:ranked[0].id,weights:ranked[0].weights,
   trainScore:ranked[0].trainScore,validationScore:ranked[0].validationScore};
 }
 // Frozen weights; NO candidate search or threshold tuning on held-out seeds.
 const final=await parallel([
  withJob("heldout","current","A",null,c.testSeeds,c.testRuns,c,true),
  withJob("heldout","fair","B",selected.fair.weights,c.testSeeds,c.testRuns,c,true),
  withJob("heldout","oracle-fixed","D",selected.fair.weights,c.testSeeds,c.testRuns,c,true),
  withJob("heldout","oracle","C",selected.oracle.weights,c.testSeeds,c.testRuns,c,true)
 ],c.workers);
 const holdout=Object.fromEntries(final.map(r=>[r.arm,r]));
 const pairedResults={
  "B fair minus A current":paired(final[0],final[1]),
  "D oracle fixed weights minus B fair (knowledge only)":paired(final[1],final[2]),
  "C tuned oracle minus D fixed oracle (tuning only)":paired(final[2],final[3]),
  "C tuned oracle minus B fair (knowledge plus tuning)":paired(final[1],final[3]),
  "C tuned oracle minus A current":paired(final[0],final[3])
 };
 const partyRates=Object.fromEntries(final.map(r=>[r.arm,perParty(r)]));
 const result={schema:"rogue-cards-agent-study-v1",commit,config:c,
  selected,holdout,paired:pairedResults,partyRates};
 writeFileSync(resolve(c.out,"candidates.json"),JSON.stringify(history,null,2)+"\n");
 writeFileSync(resolve(c.out,"holdout.json"),JSON.stringify(result,null,2)+"\n");
 writeFileSync(resolve(c.out,"summary.md"),report(result));
 writeFileSync(resolve(c.out,"validation.json"),JSON.stringify({
  trainValidationHoldoutDisjoint:true,simulatedStalls:0,
  unresolvedEffects:0,oracleFutureDiceVisible:false,
  note:"Synthetic rollout chance samples are independent from the expedition dice."},null,2)+"\n");
 process.stderr.write("Complete: "+resolve(c.out,"summary.md")+"\n");
}
if(isMainThread&&process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url))await main();
