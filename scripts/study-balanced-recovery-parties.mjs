#!/usr/bin/env node
/**
 * Current canonical Balanced Recovery v1: ALL eight solo Heroes and all
 * 28 unordered distinct two-Hero parties, on 36-Room Everything Goes.
 * No staged cards or implicit post-combat heal, no legacy 9-Room runner.
 *
 * Shared impartial policy for both party sizes: frontier implicit UCT,
 * legacy (party-aware) heuristic, fair hidden information, same budget and
 * no solo-only equipment shortcuts. State transitions are the actual
 * decision-session engine, not replayed results or synthetic wins.
 *
 * Safe to resume only at precisely the same git revision/configuration.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {performance} from "node:perf_hooks";
import {existsSync,mkdirSync,readFileSync,appendFileSync,writeFileSync,renameSync}
 from "node:fs";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {HEROES} from "../src/tabletop-data.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction,
 forcesEquipmentProgress} from "../src/session-policy.js";

export const BALANCED_PARTIES=Object.freeze([
 ...HEROES.map(h=>Object.freeze([h.id])),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>
  Object.freeze([h.id,other.id])))
]);
const mix=x=>{
 x=(x+0x9e3779b9)>>>0;
 x=Math.imul(x^(x>>>16),0x85ebca6b);
 x=Math.imul(x^(x>>>13),0xc2b2ae35);
 return (x^(x>>>16))>>>0||1;
};
const atomic=(path,thing)=>{
 const tmp=path+".tmp";writeFileSync(tmp,JSON.stringify(thing,null,2)+"\n");
 renameSync(tmp,path);
};
const mean=(a,f)=>a.length?a.reduce((s,x)=>s+f(x),0)/a.length:null;
const wilson=(won,n)=>{
 if(!n)return null;
 const p=won/n,z=1.96,d=1+z*z/n;
 return [(p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/d,
 (p+z*z/(2*n)+z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/d];
};
function parse(argv){
 const opts={};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==="--dry-run"){opts["--dry-run"]="yes";continue;}
  const k=argv[i];
  if(!["--runs-per-party","--budget","--seed","--workers","--minutes",
   "--out"].includes(k)||opts[k]!==undefined||!argv[i+1])
   throw Error("Unknown/duplicated/missing value for "+k);
  opts[k]=argv[++i];
 }
 const int=(k,d,min,max)=>{
  const v=Number(opts[k]??d);
  if(!Number.isSafeInteger(v)||v<min||v>max)
   throw Error("Invalid "+k+": expected "+min+".."+max);
  return v;
 };
 return {runs:int("--runs-per-party",6,1,500),
  budget:int("--budget",8,1,256),
  seed:int("--seed",20261021,1,0xffffffff),
  workers:int("--workers",8,1,32),
  minutes:int("--minutes",360,1,10080),
  out:resolve(opts["--out"]??"results/balanced-recovery-parties-v1"),
  dryRun:opts["--dry-run"]==="yes"};
}
function summarize(rows,manifest){
 const parties=BALANCED_PARTIES.map(p=>{
  const name=p.join("+"),r=rows.filter(x=>x.party===name),n=r.length,
   wins=r.reduce((sum,x)=>sum+x.won,0);
  const reached=r.filter(x=>x.vaultReached),vaultWins=reached.reduce((a,x)=>a+x.won,0);
  return {party:name,size:p.length,n,wins,winRate:n?wins/n:null,
   winWilson95:wilson(wins,n),vaultRate:mean(r,x=>x.vaultReached),
   winGivenVault:reached.length?vaultWins/reached.length:null,
   meanRoomsCleared:mean(r,x=>x.roomsCleared),
   meanEncounters:mean(r,x=>x.ordinaryEncounters),
   meanFights:mean(r,x=>x.ordinaryFights),
   meanDamage:mean(r,x=>x.damage),
   meanHealingRestored:mean(r,x=>x.healingRestored),
   meanHealingWasted:mean(r,x=>x.healingWasted),
   meanEndingHpFraction:mean(r,x=>x.endingHpFraction),
   meanVaultEntryHpFraction:mean(r.filter(x=>x.vaultEntryHpFraction!==null),
    x=>x.vaultEntryHpFraction),
   wipeStages:Object.fromEntries(["UPPER","MIDDLE","DEEP","FINAL"]
    .map(stage=>[stage,r.filter(x=>x.wipeStage===stage).length])),
   meanSearchSeconds:mean(r,x=>x.searchMs/1000),
   endings:Object.fromEntries(["win","death","escape"]
    .map(e=>[e,r.filter(x=>x.ending===e).length]))};
 });
 const singles=parties.filter(x=>x.size===1),duos=parties.filter(x=>x.size===2);
 const aggregate=groups=>{
  const rs=rows.filter(r=>groups.some(g=>g.party===r.party)),
   n=rs.length,wins=rs.reduce((a,r)=>a+r.won,0);
  return {n,wins,winRate:n?wins/n:null,winWilson95:wilson(wins,n),
   vaultRate:mean(rs,r=>r.vaultReached),
   meanHpAtVault:mean(rs.filter(r=>r.vaultEntryHpFraction!==null),
    r=>r.vaultEntryHpFraction),
   meanHealingRestored:mean(rs,r=>r.healingRestored),
   meanHealingWasted:mean(rs,r=>r.healingWasted)};
 };
 const soloByName=new Map(singles.map(x=>[x.party,x]));
 const relative=duos.map(d=>{
  const [a,b]=d.party.split("+"),la=soloByName.get(a),lb=soloByName.get(b);
  const best=Math.max(la?.winRate??0,lb?.winRate??0);
  const avg=((la?.winRate??0)+(lb?.winRate??0))/2;
  return {...d,bestSoloMemberWinRate:la?.n&&lb?.n?best:null,
   liftVsBestSolo:la?.n&&lb?.n&&d.n?d.winRate-best:null,
   liftVsMeanSolo:la?.n&&lb?.n&&d.n?d.winRate-avg:null};
 });
 const completed=rows.length===manifest.total;
 return {schema:"rogue-cards-balanced-recovery-parties-v1",
  revision:manifest.revision,complete:completed,finished:rows.length,
  planned:manifest.total,agent:manifest.agent,bySize:{solo:aggregate(singles),
   duo:aggregate(duos)},solos:singles,duos:relative,
  interpretation:"Preliminary until enough independent seeds finish for EACH party. "+
   "Solo and duo use the same party-aware legacy heuristic, no solo-only "+
   "shortcuts. Matching initial seeds do not guarantee paired random draws; "+
   "co-op lift vs strongest solo is descriptive, not a causal rule measurement."};
}
function report(sum){
 const pct=n=>n===null?"n/a":(n*100).toFixed(1)+"%";
 const fmt=n=>n===null?"n/a":Number(n).toFixed(1);
 const rows=["# Balanced Recovery v1: all Heroes and all 28 duo pairs","",
  "Commit: "+sum.revision+" | Expeditions: "+sum.finished+
   " / "+sum.planned+" | "+(sum.complete?"complete":"PARTIAL"),"",
  "**Same current 36-Room printed game, fair-information party-aware "+
   "frontier MCTS, no hidden post-combat healing.**","",
  "## Overall solo vs duo","",
  "| Party size | Expeditions | Win | Wilson 95% | Vault | HP healed/run | HP wasted/run |",
  "|---|---:|---:|---|---:|---:|---:|"];
 for(const [type,r] of Object.entries(sum.bySize))
  rows.push("| "+type+" | "+r.n+" | "+pct(r.winRate)+" | "+
   (r.winWilson95?r.winWilson95.map(pct).join("–"):"n/a")+" | "+
   pct(r.vaultRate)+" | "+fmt(r.meanHealingRestored)+" | "+
   fmt(r.meanHealingWasted)+" |");
 rows.push("","## Solo Heroes","",
  "| Hero | n | Wins | Vault | Healing HP | Damage |",
  "|---|---:|---:|---:|---:|---:|");
 for(const r of [...sum.solos].sort((a,b)=>(b.winRate??-1)-(a.winRate??-1)))
  rows.push("| "+r.party+" | "+r.n+" | "+pct(r.winRate)+" | "+
   pct(r.vaultRate)+" | "+fmt(r.meanHealingRestored)+" | "+
   fmt(r.meanDamage)+" |");
 rows.push("","## All 28 duo combinations","",
  "| Pair | n | Wins | Vault | Lift vs best solo member | Healing HP |",
  "|---|---:|---:|---:|---:|---:|");
 for(const r of [...sum.duos].sort((a,b)=>(b.winRate??-1)-(a.winRate??-1)))
  rows.push("| "+r.party+" | "+r.n+" | "+pct(r.winRate)+" | "+
   pct(r.vaultRate)+" | "+(r.liftVsBestSolo===null?"n/a":
    (r.liftVsBestSolo*100).toFixed(1)+" pp")+" | "+
   fmt(r.meanHealingRestored)+" |");
 rows.push("","## What to inspect BEFORE considering a duo nerf","",
  "1. Is mean duo win rate meaningfully above solo at adequate per-pair sample sizes?",
  "2. Is the improvement uniform, or concentrated in specific overpowered pairs?",
  "3. Does extra HP, extra Hero action economy, shared Items or recovery drive it?",
  "4. Check Vault entrance HP, death stage, and Warden conversion rather than "+
   "reducing Hero powers based only on win rates.",
  "5. Only change an existing PHYSICAL co-op rule or printed card after an A/B "+
   "study shows its effect. Do not alter solo balance to fix duo balance.",
  "",
  "Incomplete cells must not be ranked as confirmed differences. "+
   "Winning percentages are this explicit simulated agent, not actual players.","");
 return rows.join("\n");
}
export function playParty({heroes,seed,budget,maxGameSteps=20000}){
 if(!Array.isArray(heroes)||heroes.length<1||heroes.length>2||
   heroes.some(h=>!HEROES.some(x=>x.id===h))||
   new Set(heroes).size!==heroes.length)throw Error("Invalid party");
 const session=createDecisionSession({seed,heroes,gameMode:"everything-goes"});
 const policy=createSessionPolicy();
 const st=performance.now();
 let decisions=0,searches=0,searchMs=0,vaultEntryHpFraction=null;
 while(session.phase!=="terminal"){
  if(++decisions>maxGameSteps)throw Error("NONTERMINAL party "+
   heroes.join("+")+" / seed "+seed);
  const legal=sessionActions(session);
  if(!legal.length)throw Error("Missing legal action at "+session.phase);
  if(vaultEntryHpFraction===null&&
     (session.state.room?.stage==="FINAL"||
      session.phase==="vault"||session.phase==="post-warden")){
   const h=session.state.heroes;
   vaultEntryHpFraction=h.reduce((n,x)=>n+Math.max(0,x.hp),0)/
    Math.max(1,h.reduce((n,x)=>n+x.card.hp,0));
  }
  const forced=legal.length===1||forcesEquipmentProgress(session,policy,legal);
  const begin=performance.now();
  const action=selectSessionPolicyAction(session,policy,{
   budget,seed:mix(seed^Math.imul(decisions,0xc2b2ae35)),
   maxSearchSteps:5000,knowledge:"fair",legalActions:legal,
   searchProfile:"classic",treeMode:"frontier",
   exploration:0.2,implicitWeight:0.5,
   implicitHeuristicMode:"legacy",equipmentMode:"legacy",
   rolloutCombatMode:"random"
  });
  if(!forced){searches++;searchMs+=performance.now()-begin;}
  if(!legal.some(x=>JSON.stringify(x)===JSON.stringify(action)))
   throw Error("Non-canonical action at "+session.phase);
  submitDecision(session,action,{observeResult:false,recordHistory:false});
 }
 const state=session.state,m=state.metrics;
 if(m.roundLimit||m.unresolved)throw Error("NONTERMINAL/UNRESOLVED expedition");
 const ending=m.won?"win":m.escaped?"escape":!state.alive()?"death":null;
 if(!ending)throw Error("Unknown terminal state: "+heroes.join("+"));
 const hp=state.heroes.reduce((a,h)=>a+Math.max(0,h.hp),0);
 const cap=state.heroes.reduce((a,h)=>a+h.card.hp,0);
 const encounters=Object.values(m.monsterVisits??{})
  .reduce((a,n)=>a+n,0);
 const fights=Object.values(m.monsterFightStartsById??{})
  .reduce((a,n)=>a+n,0);
 const heal=m.healing?.total??{};
 return {party:heroes.join("+"),heroes,seed,budget,
  won:Number(ending==="win"),ending,
  vaultReached:Number(!!m.vaultEntered||vaultEntryHpFraction!==null),
  vaultEntryHpFraction,endingHpFraction:hp/Math.max(1,cap),
  roomsCleared:m.cleared,ordinaryEncounters:encounters,
  ordinaryFights:fights,damage:m.damage,damageByStage:m.damageByStage??null,
  healingRestored:heal.restored??0,healingWasted:heal.wasted??0,
  healingByCategory:Object.fromEntries(Object.entries(m.healing?.byCategory??{})
   .map(([k,v])=>[k,{restored:v.restored,wasted:v.wasted}])),
  wipeStage:m.wipeStage??null,wipeCause:m.wipeCause??null,
  attemptsSeal:Number(!!m.sealAttempt),sealWin:Number(!!m.sealWin),
  decisions,searches,searchMs,elapsedMs:performance.now()-st,
  finalHeroes:state.heroes.map(h=>({id:h.card.id,hp:h.hp,maxHp:h.card.hp})),
  postCombatHealTriggers:m.postCombatHealTriggers??0
 };
}
async function run(){
 const o=parse(process.argv.slice(2));
 const revision=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const manifest={schema:"balanced-recovery-parties-manifest-v1",revision,
  gameMode:"everything-goes",printedEdition:"Balanced Recovery v1",
  agent:{search:"frontier implicit UCT",budget:o.budget,c:0.2,alpha:0.5,
   knowledge:"fair",heuristicMode:"legacy",equipmentMode:"legacy",
   rolloutCombatMode:"random"},
  seed:o.seed,runsPerParty:o.runs,parties:BALANCED_PARTIES,
  total:o.runs*BALANCED_PARTIES.length};
 if(o.dryRun){console.log(JSON.stringify(manifest,null,2));return;}
 mkdirSync(o.out,{recursive:true});
 const mf=join(o.out,"manifest.json"),nd=join(o.out,"trials.ndjson"),
  summaryPath=join(o.out,"summary.json"),md=join(o.out,"comparison.md");
 if(existsSync(mf)){
  if(JSON.stringify(JSON.parse(readFileSync(mf,"utf8")))!==JSON.stringify(manifest))
   throw Error("Incompatible resume; same settings and git revision required");
 }else atomic(mf,manifest);
 const saved=existsSync(nd)?readFileSync(nd,"utf8").trim().split("\n")
  .filter(Boolean).map(JSON.parse):[];
 const key=x=>x.party+"|"+x.repeat;
 const seen=new Set(saved.map(key));
 if(seen.size!==saved.length)throw Error("Duplicate trial");
 const tasks=[];
 for(let i=0;i<o.runs;i++){
  const seed=mix(o.seed^Math.imul(i+1,0xc2b2ae35));
  for(const heroes of BALANCED_PARTIES){
   const party=heroes.join("+"),task={heroes,party,repeat:i,seed,budget:o.budget};
   if(!seen.has(key(task)))tasks.push(task);
  }
 }
 const persist=()=>{
  const result=summarize(saved,manifest);
  atomic(summaryPath,result);
  writeFileSync(md,report(result));
 };
 persist();
 if(!tasks.length){console.log("Already complete");return;}
 console.log("Balanced Recovery v1: "+tasks.length+" pending, "+
  o.workers+" workers, commit "+revision.slice(0,8));
 const workers=[],deadline=Date.now()+o.minutes*60000;
 let running=0,stopped=false,exited=0;
 const finish=(cause,failure=false)=>{
  if(stopped)return;
  stopped=true;clearInterval(heartbeat);
  persist();console.log("Balance "+cause+": "+saved.length+"/"+manifest.total);
  for(const w of workers)w.terminate();
  if(failure)process.exitCode=1;
 };
 const assign=w=>{
  if(stopped)return;
  if(Date.now()>=deadline)return finish("time cap");
  const task=tasks.shift();
  if(!task){if(!running)finish("complete");return;}
  running++;w.postMessage(task);
 };
 const heartbeat=setInterval(()=>{
  if(Date.now()>=deadline)return finish("time cap");
  persist();console.log("Balance: "+saved.length+"/"+manifest.total);
 },60000);
 for(let i=0;i<o.workers;i++){
  const w=new Worker(new URL(import.meta.url),{workerData:{budget:o.budget}});
  workers.push(w);
  w.on("message",msg=>{
   if(stopped)return;
   running--;
   if(msg.error)return finish("failed: "+msg.error,true);
   const x={...msg.result,repeat:msg.repeat};
   if(seen.has(key(x)))return finish("duplicate result",true);
   seen.add(key(x));saved.push(x);
   appendFileSync(nd,JSON.stringify(x)+"\n");
   if(saved.length%4===0)persist();
   assign(w);
   if(!tasks.length&&!running)finish("complete");
  });
  w.on("error",error=>finish("worker error: "+error.stack,true));
  w.on("exit",code=>{
   exited++;
   if(!stopped&&code!==0)finish("worker exited "+code,true);
  });
 }
 workers.forEach(assign);
}
if(!isMainThread){
 parentPort.on("message",t=>{
  try{parentPort.postMessage({repeat:t.repeat,
   result:playParty({heroes:t.heroes,seed:t.seed,budget:t.budget})});
  }catch(e){parentPort.postMessage({error:e.stack||String(e)})}
 });
}else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await run();
}
