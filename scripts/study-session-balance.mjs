#!/usr/bin/env node
/**
 * LOCAL-ONLY state-matched balance study across independent real expeditions.
 *
 * Each source seed navigates ONE real canonical session, finds an eligible
 * printed decision, and evaluates both alternatives to genuine terminal
 * outcomes using identical chance seeds and MCTS for all later choices.
 * One paired observation per independent starting seed prevents treating
 * many rollouts in a single source state as independent card evidence.
 *
 * Unreached cards remain UNTESTED; no fabricated access or extra Items.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {existsSync,mkdirSync,readdirSync,readFileSync,renameSync,writeFileSync}
 from "node:fs";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {HEROES,ROOMS,OBJECTS,MONSTERS}
 from "../src/tabletop-data.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import {compareSessionActions} from "../src/session-counterfactual.js";
const parties=[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(g=>[h.id,g.id]))];
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const fingerprint=a=>JSON.stringify(Object.keys(a).sort().map(k=>[k,a[k]]));
const cardFocus=["room","item","hero","retained","vault","parley","monster","equipment","effect"];
const classify=(session,actions)=>{
 const phase=session.pendingNested?
  "reaction:"+session.pendingNested.trigger.phase:session.phase;
 const s=session.state;
 const variants=[];
 const push=(focus,key,i,j)=>{
  if(i<0||j<0||i===j)return;
  variants.push({focus,key,indices:[i,j],phase,
   before:actions[i],after:actions[j]});
 };
 const indexed=predicate=>actions.findIndex(predicate);
 if(phase==="room"){
  const first=indexed(a=>a.kind==="room-choice"&&a.index===0),
   second=indexed(a=>a.kind==="room-choice"&&a.index===1);
  push("room","room:"+s.room.id,first,second);
 }
 if(phase==="retained-entry"){
  const a=indexed(x=>x.kind==="return");
  for(let j=0;j<actions.length;j++)
   if(j!==a)push("retained","retained:"+s.returnRoomId,a,j);
 }
 if(phase==="parley")push("parley","parley:"+s.monster?.id,
  indexed(a=>a.kind==="fight"),indexed(a=>a.kind==="parley"));
 if(phase==="vault"||phase==="post-warden"){
  const first=indexed(a=>a.kind==="fight");
  actions.forEach((a,i)=>{
   if(i!==first)push("vault","vault:"+a.kind,first,i);
  });
 }
 if(phase==="corpse"){
  const first=indexed(a=>a.kind==="leave");
  actions.forEach((a,i)=>{
   if(i!==first)push("monster","remains:"+s.monster?.id+":"+a.kind,first,i);
  });
 }
 const cont=indexed(a=>a.kind==="continue"||a.kind==="skip"||
  a.kind==="keep"||a.kind==="pass"||a.kind==="attack");
 actions.forEach((a,i)=>{
  if(a.cardId&&["item-trigger","item","equip","unequip","transfer"].includes(a.kind)){
   const focus=["equip","unequip","transfer"].includes(a.kind)?"equipment":"item";
   push(focus,focus+":"+a.cardId+":"+(a.mode||a.kind),cont,i);
  }
  if(a.kind==="hero-mode"){
   const h=s.heroes[a.heroIndex];
   push("hero","hero:"+h?.card.id+":"+a.mode,cont,i);
  }
  if(a.kind==="effect-option"){
   const reference=indexed(x=>x.kind==="effect-option"&&x!==a);
   if(reference>=0&&i>reference)
    push("effect","effect:"+a.context+":"+a.mode,reference,i);
  }
 });
 return variants;
};
const params=()=>{const vals={},flags=new Set();
 const allowed=new Set(["--runs","--seed","--workers","--hours",
  "--out","--future-budget","--navigate-budget","--max-search-steps",
  "--max-game-steps","--min-eligible","--focus"]);
 for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(key==="--resume"||key==="--dry-run"){
   if(flags.has(key))throw Error("Duplicate "+key);
   flags.add(key);continue;
  }
  if(!allowed.has(key)||vals[key]!==undefined||
   !process.argv[i+1]||process.argv[i+1].startsWith("--"))
   throw Error("Malformed option "+key);
  vals[key]=process.argv[++i];
 }
 const number=(k,def,min,max)=>{
  const raw=vals[k]??String(def),n=Number(raw);
  if(!/^(0|[1-9]\d*)$/.test(raw)||!Number.isSafeInteger(n)||
   n<min||n>max)throw Error("Invalid "+k);return n;
 };
 const focus=vals["--focus"]||"all";
 if(focus!=="all"&&!cardFocus.includes(focus))
  throw Error("Unknown --focus "+focus);
 return {runs:number("--runs",7200,1,100000),
  seed:number("--seed",20261014,1,0xffffffff),
  workers:number("--workers",Math.min(7,availableParallelism()),1,16),
  hours:number("--hours",10,1,72),
  futureBudget:number("--future-budget",2,1,100000),
  navigateBudget:number("--navigate-budget",2,1,100000),
  maxSearchSteps:number("--max-search-steps",4000,1,100000),
  maxGameSteps:number("--max-game-steps",7000,1,100000),
  minEligible:number("--min-eligible",60,2,100000),
  focus,out:resolve(vals["--out"]||"results/session-balance-01"),
  resume:flags.has("--resume"),dryRun:flags.has("--dry-run")
 };
};
const git=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8"}).trim()}catch{return null}};
const atom=(path,data)=>{const temporary=path+".tmp-"+process.pid;
 writeFileSync(temporary,JSON.stringify(data,null,2)+"\n");
 renameSync(temporary,path);
};
function oneJob(i,c){
 const heroes=parties[i%parties.length];
 const gameSeed=mix(c.seed^Math.imul(i+1,0x85ebca6b))||1;
 const targetFocus=c.focus==="all"?cardFocus[i%cardFocus.length]:c.focus;
 const session=createDecisionSession({seed:gameSeed,heroes});
 let step=0,last=null;
 try{
  for(;step<c.maxGameSteps&&session.phase!=="terminal";step++){
   const actions=sessionActions(session);
   if(!actions.length)throw Error("No legal action at "+session.phase);
   const candidates=classify(session,actions)
    .filter(x=>x.focus===targetFocus);
   if(candidates.length){
    const selected=candidates[mix(gameSeed^step)%candidates.length];
    const paired=compareSessionActions(session,{
     trials:1,seed:mix(gameSeed^step^0x29ab),
     actionIndices:selected.indices,futureBudget:c.futureBudget,
     maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
     knowledge:"fair"
    });
    const [before,after]=paired.actions;
    return {i,heroes,gameSeed,step,focus:targetFocus,kind:"paired",
     key:selected.key,phase:selected.phase,choice0:selected.before,
     choice1:selected.after,win0:before.wins,win1:after.wins,
     decisions:before.totalDecisions+after.totalDecisions,
     sourceState:paired.sourceObservation.game};
   }
   const chosen=actions.length===1?actions[0]:
    searchDecision(session,{
     knowledge:"fair",budget:Math.max(actions.length,c.navigateBudget),
     maxSteps:c.maxSearchSteps,seed:mix(gameSeed^Math.imul(step+1,0xc2b2ae35))
    }).recommended;
   if(!chosen)throw Error("MCTS produced no navigation action");
   last={step,phase:session.pendingNested?
    "reaction:"+session.pendingNested.trigger.phase:session.phase,
    action:chosen,roomId:session.state.room?.id,
    monsterId:session.state.monster?.id};
   submitDecision(session,chosen);
  }
  if(session.phase!=="terminal")
   throw Error("Actual source expedition exceeded step limit");
  if(session.state.metrics.roundLimit||session.state.metrics.unresolved)
   throw Error("Actual source expedition unresolved");
  return {i,heroes,gameSeed,step,focus:targetFocus,kind:"unreached"};
 }catch(e){
  const error=Error("Seed "+gameSeed+" index "+i+
   " step "+step+" / "+targetFocus+": "+(e.stack||e));
  error.repro={i,gameSeed,heroes,step,focus:targetFocus,
   last,roomId:session.state.room?.id,monsterId:session.state.monster?.id,
   phase:session.pendingNested?
    "reaction:"+session.pendingNested.trigger.phase:session.phase,
   actions:sessionActions(session)};
  throw error;
 }
}
const logFactorials=[0];
function logFactorial(n){while(logFactorials.length<=n){
 const j=logFactorials.length;
 logFactorials.push(logFactorials[j-1]+Math.log(j));
 }return logFactorials[n];}
const mcnemar=(plus,minus)=>{const n=plus+minus;
 if(!n)return 1;
 const k=Math.min(plus,minus),terms=[];
 for(let j=0;j<=k;j++)terms.push(logFactorial(n)-
  logFactorial(j)-logFactorial(n-j)-n*Math.LN2);
 const max=Math.max(...terms);
 return Math.min(1,2*Math.exp(max)*
  terms.reduce((sum,x)=>sum+Math.exp(x-max),0));
};
const interval=(plus,minus,n)=>{
 if(n<2)return null;
 const d=(plus-minus)/n,variance=((plus+minus)-n*d*d)/(n-1);
 const h=1.959963984540054*Math.sqrt(Math.max(0,variance/n));
 return [Math.max(-1,d-h),Math.min(1,d+h)];
};
function summarize(c,completed,failed=[]){
 const rows=[...completed.values()].sort((a,b)=>a.i-b.i),groups=new Map();
 for(const r of rows){
  if(r.kind!=="paired")continue;
  const group=groups.get(r.key)||{
   key:r.key,focus:r.focus,eligible:0,winsFirst:0,winsSecond:0,
   secondOnlyWins:0,firstOnlyWins:0,ties:0,
   exampleSeed:r.gameSeed,sourceParties:{}
  };
  group.eligible++;group.winsFirst+=r.win0;group.winsSecond+=r.win1;
  group.secondOnlyWins+=Number(r.win1>r.win0);
  group.firstOnlyWins+=Number(r.win0>r.win1);
  group.ties+=Number(r.win0===r.win1);
  group.sourceParties[r.heroes.join("+")]=(group.sourceParties[r.heroes.join("+")]||0)+1;
  groups.set(r.key,group);
 }
 const contrasts=[...groups.values()].map(g=>({
  ...g,difference:(g.secondOnlyWins-g.firstOnlyWins)/g.eligible,
  paired95:interval(g.secondOnlyWins,g.firstOnlyWins,g.eligible),
  exactP:mcnemar(g.secondOnlyWins,g.firstOnlyWins),
  sufficientEligible:g.eligible>=c.minEligible
 })).sort((a,b)=>a.exactP-b.exactP||a.key.localeCompare(b.key));
 // Correct across every tested contrast, not merely significant ones.
 let floor=0;
 for(let rank=0;rank<contrasts.length;rank++){
  const row=contrasts[rank];
  floor=Math.max(floor,Math.min(1,row.exactP*(contrasts.length-rank)));
  row.holmP=floor;
  row.significant=row.sufficientEligible&&row.holmP<.05;
 }
 const testedRoomIds=new Set(contrasts.filter(x=>x.key.startsWith("room:"))
  .map(x=>x.key.slice(5)));
 const testedItemIds=new Set(contrasts.filter(x=>
  x.key.startsWith("item:")||x.key.startsWith("equipment:"))
  .map(x=>x.key.split(":")[1]));
 const missing={
  rooms:ROOMS.filter(r=>!testedRoomIds.has(r.id)).map(r=>r.id),
  items:OBJECTS.filter(r=>!testedItemIds.has(r.id)).map(r=>r.id),
  monsterBehaviorCausalContrastsNotImplemented:MONSTERS.map(m=>m.id)
 };
 const pairs=rows.filter(r=>r.kind==="paired").length;
 const analysis={
  schema:"rogue-cards-independent-state-matched-balance-v1",
  commit:git(),design:{
   runs:c.runs,seed:c.seed,focus:c.focus,knowledge:"fair",
   futureBudget:c.futureBudget,navigateBudget:c.navigateBudget,
   maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
   minEligible:c.minEligible
  },
  completedSourceSeeds:rows.length,
  pairedSourceSeeds:pairs,
  naturallyUnreached:rows.length-pairs,
  complete:rows.length===c.runs&&failed.length===0,
  errors:failed,contrasts,missing,
  statisticallyDefensibleForAllCards:false,
  limitations:[
   "Only observed legal contrasts are tested; passive Items and Monster behavior have no causal contrast here",
   "No manipulation or artificially early card access is used",
   "Each matched pair comes from a distinct independent initial seed",
   "Future decisions use finite-budget MCTS, not solved optimal play",
   "Conditional-on-reach state effects do not measure intrinsic whole-card strength",
   "Holm adjusts over all contrasts actually encountered in this report",
   "Underpowered/unreached contrasts are never labelled balanced",
   "Do not merge across differing Git revisions or search settings"
  ]
 };
 return analysis;
}
const saveReport=(c,done,failed=[])=>{
 const s=summarize(c,done,failed);
 atom(join(c.out,"summary.json"),s);
 const fmt=n=>(100*n).toFixed(2)+"%";
 writeFileSync(join(c.out,"summary.md"),[
  "# Local state-matched canonical MCTS balance audit","",
  "Git revision: "+s.commit,
  "Independent completed source seeds: "+s.completedSourceSeeds+"/"+c.runs,
  "Source states with paired comparison: "+s.pairedSourceSeeds,
  "Unreached target focus: "+s.naturallyUnreached,
  "Failures: "+s.errors.length,
  "Status: "+(s.complete?"complete":"partial / requires resume"),"",
  "| Contrast (second minus first) | Eligible | Difference | Approx. paired 95% | Holm p | Result |",
  "|---|---:|---:|---|---:|---|",
  ...s.contrasts.map(x=>"| "+x.key+" | "+x.eligible+" | "+
   fmt(x.difference)+" | "+(x.paired95?x.paired95.map(fmt).join(" to "):"n/a")+
   " | "+x.holmP.toPrecision(3)+" | "+
   (x.significant?"significant":x.sufficientEligible?"inconclusive":"insufficient")+
   " |"),
  "","## Uncovered printed cards",
  "Rooms: "+(s.missing.rooms.join(", ")||"none"),
  "Items: "+(s.missing.items.join(", ")||"none"),"",
  "## Limits",...s.limitations.map(x=>"- "+x),
  "","This report alone cannot certify all-card balance."
 ].join("\n")+"\n");
 return s;
};
if(!isMainThread){
 parentPort.on("message",msg=>{
  if(msg.type!=="job")return;
  try{parentPort.postMessage({type:"done",value:oneJob(msg.i,workerData.config)})}
  catch(e){parentPort.postMessage({type:"failed",index:msg.i,
   stack:e.stack||String(e),repro:e.repro||null})}
 });
}else{
 const c=params(),revision=git();
 if(!revision)throw Error("Git revision is required for reproducible studies");
 const design={schema:1,revision,
  ...Object.fromEntries(Object.entries(c).filter(([k])=>
   !["out","resume","dryRun","workers","hours"].includes(k)))};
 console.error(JSON.stringify({revision,plannedIndependentSources:c.runs,
  parties:parties.length,workers:c.workers,focus:c.focus,
  hourCap:c.hours,minimumEligible:c.minEligible,design},null,2));
 if(!c.dryRun){
  if(!c.resume&&existsSync(c.out))throw Error("Output exists: "+c.out);
  if(c.resume&&!existsSync(c.out))throw Error("Missing output: "+c.out);
  if(!c.resume){
   mkdirSync(join(c.out,"checkpoints"),{recursive:true});
   atom(join(c.out,"manifest.json"),design);
  }else{
   const original=JSON.parse(readFileSync(join(c.out,"manifest.json"),"utf8"));
   if(JSON.stringify(original)!==JSON.stringify(design))
    throw Error("Resuming across Git revisions or changed settings is forbidden");
  }
  const done=new Map(),failed=[];
  for(const f of readdirSync(join(c.out,"checkpoints"))){
   if(!/^\d{6}\.json$/.test(f))throw Error("Bad checkpoint "+f);
   const r=JSON.parse(readFileSync(join(c.out,"checkpoints",f),"utf8"));
   if(r.i>=c.runs||r.i<0||done.has(r.i))throw Error("Invalid checkpoint "+f);
   done.set(r.i,r);
  }
  const queue=Array.from({length:c.runs},(_,i)=>i)
   .filter(i=>!done.has(i));
  const workers=Array.from({length:Math.min(c.workers,queue.length)},()=>
   new Worker(new URL(import.meta.url),{workerData:{config:c}}));
  const assigned=new Map(),deadline=Date.now()+c.hours*3600000;
  let next=0,stopped=false;
  const timer=setInterval(()=>{
   const s=saveReport(c,done,failed);
   console.error("Completed "+s.completedSourceSeeds+"/"+c.runs+
    "; tested contrasts "+s.contrasts.length);
  },60000);
  try{
   await new Promise((complete,reject)=>{
    const dispatch=w=>{
     if(stopped||Date.now()>=deadline||next>=queue.length){
      if(assigned.size===0)complete();
      return;
     }
     const i=queue[next++];assigned.set(w,i);w.postMessage({type:"job",i});
    };
    if(!workers.length)complete();
    for(const w of workers){
     w.on("message",m=>{
      if(stopped)return;
      if(m.type==="failed"){
       const record={index:m.index,stack:m.stack,repro:m.repro};
       failed.push(record);
       atom(join(c.out,"failure-"+String(m.index).padStart(6,"0")+".json"),
        record);
       stopped=true;reject(Error("Canonical engine failure at seed index "+m.index+
        ": "+m.stack));return;
      }
      if(assigned.get(w)!==m.value.i){
       stopped=true;reject(Error("Worker assignment mismatch"));return;
      }
      atom(join(c.out,"checkpoints",
       String(m.value.i).padStart(6,"0")+".json"),m.value);
      done.set(m.value.i,m.value);
      assigned.delete(w);
      dispatch(w);
      if(!assigned.size&&(next>=queue.length||Date.now()>=deadline))
       complete();
     });
     w.on("error",e=>{if(!stopped){stopped=true;reject(e)}});
     w.on("exit",code=>{if(code&&!stopped){
      stopped=true;reject(Error("Worker exited "+code))}});
     dispatch(w);
    }
   });
  }finally{
   clearInterval(timer);
   await Promise.all(workers.map(w=>w.terminate()));
   const s=saveReport(c,done,failed);
   console.error("Saved "+s.completedSourceSeeds+"/"+c.runs+
    " independent seeds; errors "+s.errors.length);
  }
 }
}
