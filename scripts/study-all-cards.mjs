#!/usr/bin/env node
/**
 * Resume-safe all-printed-card canonical expedition experiment.
 * NO legacy simulation, injected cards, implicit forced outcome or HP proxy.
 * Jobs are interleaved across card IDs so early reports cover the full roster.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,readdirSync}
 from "node:fs";
import {resolve,join,dirname} from "node:path";
import {execFileSync} from "node:child_process";
import {ALL_CARD_ROSTER,getCard,cardKey,evaluateCardTrial,cardSummary,
 sharedControlKey,evaluateSharedControl,sharedControlForCard}
 from "../src/all-card-study.js";
import {loadNativeMcts} from "../src/native-mcts-node.js";
const uint=(raw,name,min,max)=>{
 const n=Number(raw);
 if(!/^(0|[1-9][0-9]*)$/.test(String(raw))||
    !Number.isSafeInteger(n)||n<min||n>max)
  throw Error("Invalid "+name+" (expected integer "+min+".."+max+")");
 return n;
};
function parse(argv){
 const named=new Set(["--runs-per-card","--seed","--workers","--hours",
  "--budget","--max-search-steps","--max-game-steps","--min-paired",
  "--job-minutes","--out","--audit","--focus","--only",
  "--batch-size"]);
 const args={},flags=new Set();
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(k==="--resume"||k==="--dry-run"||k==="--native-hash"){
   if(flags.has(k))throw Error("Duplicate flag "+k);
   flags.add(k);continue;
  }
  if(!named.has(k)||args[k]!==undefined||!argv[i+1]||
     argv[i+1].startsWith("--"))throw Error("Invalid argument "+k);
  args[k]=argv[++i];
 }
 const focus=args["--focus"]||"all";
 const possible=new Set(["all","room","item","monster","hero","fixed"]);
 if(!possible.has(focus))throw Error("Unsupported --focus "+focus);
 const only=(args["--only"]||"").split(",").filter(Boolean);
 if(new Set(only).size!==only.length)throw Error("Duplicate --only card");
 if(only.some(key=>{
  const [kind,id,extra]=key.split(":");
  return extra!==undefined||!getCard(kind,id);
 }))throw Error("--only uses canonical kind:id card identifiers");
 const cards=ALL_CARD_ROSTER.filter(card=>
  (focus==="all"||focus===card.kind)&&
  (!only.length||only.includes(cardKey(card))));
 if(!cards.length)throw Error("No printed cards selected");
 if(only.length&&cards.length!==only.length)
  throw Error("--only contains a card outside --focus");
 return {
  runsPerCard:uint(args["--runs-per-card"]??80,"runs-per-card",1,100000),
  seed:uint(args["--seed"]??20261016,"seed",1,0xffffffff),
  workers:uint(args["--workers"]??Math.min(7,availableParallelism()),"workers",1,16),
  hours:uint(args["--hours"]??24,"hours",1,168),
  jobMinutes:uint(args["--job-minutes"]??30,"job-minutes",1,240),
  batchSize:uint(args["--batch-size"]??24,"batch-size",1,64),
  budget:uint(args["--budget"]??2,"budget",1,100000),
  maxSearchSteps:uint(args["--max-search-steps"]??4000,"max-search-steps",1,100000),
  maxGameSteps:uint(args["--max-game-steps"]??7000,"max-game-steps",1,100000),
  minPaired:uint(args["--min-paired"]??60,"min-paired",2,100000),
  out:resolve(args["--out"]||"results/all-card-canonical-study"),
  audit:args["--audit"]?resolve(args["--audit"]):null,
  focus,only,cards,nativeHash:flags.has("--native-hash"),
  resume:flags.has("--resume"),dryRun:flags.has("--dry-run")
 };
}
const revision=()=>{
 try{return execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();}
 catch{return null;}
};
const save=(file,payload)=>{
 mkdirSync(dirname(file),{recursive:true});
 const tmp=file+".tmp-"+process.pid;
 writeFileSync(tmp,JSON.stringify(payload,null,2)+"\n");
 renameSync(tmp,file);
};
const checkpointName=(card,index)=>
 card.kind+"-"+card.id+"--"+String(index).padStart(6,"0")+".json";
// Baselines are resumable just like treated trials. The full revision and
// policy are pinned by manifest.json; each record verifies its seed/party.
const referenceFile=(out,key)=>{
 if(!/^\d{6}:[a-z0-9-]+(?:,[a-z0-9-]+)?$/.test(key))
  throw Error("Invalid shared reference key "+key);
 return join(out,"references",key.replace(":","--").replace(",","_")+".json");
};
const pct=n=>(n*100).toFixed(2)+"%";
function report(c,rev,records,failures=[]){
 const result=cardSummary([...records.values()],c.minPaired);
 const complete=records.size===c.cards.length*c.runsPerCard&&
  failures.length===0;
 const totalPairs=result.reduce((n,g)=>n+g.compared,0);
 const summary={
  schema:"canonical-all-printed-cards-study-v1",
  commit:rev,executionMode:c.nativeHash?
   "selective-deferred-native-hash":"selective-deferred",
  knowledge:"fair",
  complete,selectedCards:c.cards.length,
  sharedReferenceExpeditions:true,
  searchOptimizations:"parity-verified-cold-edges-v1",
  entirePrintedRoster:ALL_CARD_ROSTER.length,
  plannedJobs:c.cards.length*c.runsPerCard,
  completedJobs:records.size,pairedJobs:totalPairs,
  failures,design:{
   runsPerCard:c.runsPerCard,seed:c.seed,budget:c.budget,
   maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
   minPaired:c.minPaired,focus:c.focus,only:c.only,
   nativeHash:c.nativeHash,batchSize:c.batchSize
  },
  estimands:{
   room:"Effect of moving an existing stage Room to first draw versus natural randomized ordering",
   item:"Effect of putting an existing Item at the next draw versus natural randomized ordering",
   monster:"Effect of putting an existing stage Monster at the next encounter versus natural randomized ordering",
   hero:"Hero replacement versus a rotating other printed Hero, preserving party size and other partner",
   fixed:"Vault and two printed Warden phases: observational coverage only; NO causal counterfactual"
  },
  notes:[
   "Every outcome is a completed canonical expedition with MCTS actions, never a simplified rules simulator.",
   "Identical reference expeditions are reused only across matching seed, Hero party, canonical rules and MCTS policy.",
   "Each card's trial indices have independent source seeds; references reused across cards create cross-card correlation, which Holm allows.",
   "Matched seeds share initial randomness, not necessarily identical later consumption after different events.",
   "Unvisited stages and unused Items dilute intent-to-schedule effects; exposure counts are reported.",
   "The relative-to-natural-draw effect is NOT the overall value of a card or its individual text effects.",
   "Fixed boss cards are observational outcomes reused from the exact same canonical control as other cards; they cannot be causally compared without a printed alternative.",
   "All-card rows do not imply all effects were observed or statistically resolved.",
   "Familywise Holm adjustment covers all paired printed-card contrasts in this report.",
   "Finite MCTS search budget affects decisions; it is not a solved or optimal strategy.",
   "Do not pool different revisions, card ordering policies, budgets, or source seeds."
  ],
  cards:result
 };
 save(join(c.out,"summary.json"),summary);
 const lines=[
  "# Canonical all-printed-card experiment","",
  "Git revision: "+rev,
  "Execution: selective-deferred"+(c.nativeHash?" + native state hash":"")+
   " canonical MCTS; fair hidden information",
  "Source jobs: "+records.size+"/"+summary.plannedJobs,
  "Paired terminal source jobs: "+totalPairs,
  "Printed card IDs in the full roster: "+ALL_CARD_ROSTER.length,
  "Selected IDs: "+c.cards.length,
  "Failures: "+failures.length,
  "Status: "+(complete?"complete":"partial / resume to complete"),"",
  "| Card | Kind | Paired | Treated exposure | Δ win probability | Holm p | Status |",
  "|---|---|---:|---:|---:|---:|---|"
 ];
 for(const g of result){
  const safe=g.title.replaceAll("|","/");
  lines.push("| "+safe+" ("+g.id+") | "+g.kind+" | "+g.compared+
   " | "+g.treatmentExposures+
   " | "+(g.difference===null?"n/a":pct(g.difference))+
   " | "+(g.pHolm===null?"n/a":g.pHolm.toPrecision(3))+
   " | "+g.status+" |");
 }
 lines.push("","## Interpretation",...summary.notes.map(note=>"- "+note),
  "","All printed cards appear here, including never-exposed and fixed cards.",
  "Use summary.json for exact win/loss counts and uncertainty intervals.");
 writeFileSync(join(c.out,"summary.md"),lines.join("\n")+"\n");
 return summary;
}
function preflight(c,rev){
 if(!c.audit||!existsSync(c.audit))
  throw Error("A same-revision passing canonical audit is required (--audit FILE)");
 const audit=JSON.parse(readFileSync(c.audit,"utf8"));
 if(audit.commit!==rev||audit.pass!==true||
   audit.completeFaceCoverage!==true||
   audit.allWalksEnded!==true||audit.runs<36)
  throw Error("Canonical audit must PASS for this exact Git revision, 36+ expeditions");
 console.error("Preflight: production session regression suite");
 execFileSync("npm",["run","test:session"],{
  stdio:"inherit",timeout:240000
 });
 console.error("Preflight: printed card validation");
 execFileSync("npm",["run","validate:deck"],{
  stdio:"inherit",timeout:120000
 });
}
if(!isMainThread){
 if(workerData.config.nativeHash)loadNativeMcts({required:true});
 parentPort.on("message",m=>{
  let current=null;
  try{
   if(m.type==="reference"){
    const card=getCard(m.card.kind,m.card.cardId);
    if(!card)throw Error("Unknown reference card");
    const baseline=evaluateSharedControl(card,m.index,workerData.config);
    parentPort.postMessage({type:"reference-done",baseline});
    return;
   }
   if(m.type!=="batch")throw Error("Unknown work type "+m.type);
   for(const entry of m.cards){
    current=entry;
    const card=getCard(entry.kind,entry.cardId);
    if(!card)throw Error("Unknown printed card "+entry.kind+":"+entry.cardId);
    const result=evaluateCardTrial(card,m.index,workerData.config,
     m.baseline);
    parentPort.postMessage({type:"result",result});
   }
   parentPort.postMessage({type:"batch-done",index:m.index});
  }catch(error){
   parentPort.postMessage({type:"failed",job:{...m,current},
    message:error.stack||String(error)});
  }
 });
}else if(process.argv[1]&&import.meta.url.endsWith(process.argv[1])){
 const c=parse(process.argv.slice(2)),rev=revision();
 if(!rev)throw Error("Git revision is required");
 if(c.nativeHash)loadNativeMcts({required:true});
 if(c.resume&&c.dryRun)throw Error("Use --resume OR --dry-run");
 const design={schema:4,revision:rev,seed:c.seed,
  runsPerCard:c.runsPerCard,budget:c.budget,
  maxSearchSteps:c.maxSearchSteps,maxGameSteps:c.maxGameSteps,
  minPaired:c.minPaired,selected:c.cards.map(cardKey),
  mode:"selective-deferred",knowledge:"fair",
  nativeHash:c.nativeHash,batchSize:c.batchSize,
  commonReferenceSeeds:true,
  searchOptimizations:"parity-verified-cold-edges-v1"};
 console.error(JSON.stringify({study:design,out:c.out,
  note:"Shared identical full-game MCTS controls; complete canonical treatments"},null,2));
 if(!c.dryRun){
  preflight(c,rev);
  if(!c.resume&&existsSync(c.out))
   throw Error("Output directory already exists; use --resume if settings match");
  if(c.resume&&!existsSync(c.out))
   throw Error("Output directory is missing");
  if(!c.resume){
   mkdirSync(join(c.out,"checkpoints"),{recursive:true});
   mkdirSync(join(c.out,"references"),{recursive:true});
   save(join(c.out,"manifest.json"),design);
  }else{
   const old=JSON.parse(readFileSync(join(c.out,"manifest.json"),"utf8"));
   if(JSON.stringify(old)!==JSON.stringify(design))
    throw Error("Cannot resume across versions, modes, seeds or changed designs");
  }
  const complete=new Map(),errors=[],selected=new Set(design.selected);
  for(const name of readdirSync(join(c.out,"checkpoints"))){
   if(!/^(room|item|hero|monster|fixed)-[a-z0-9-]+--\d{6}\.json$/.test(name))
    throw Error("Unexpected checkpoint file "+name);
   const row=JSON.parse(readFileSync(join(c.out,"checkpoints",name),"utf8"));
   if(!selected.has(row.card)||row.index<0||
     row.index>=c.runsPerCard||
     checkpointName(getCard(...row.card.split(":")),row.index)!==name)
    throw Error("Invalid checkpoint "+name);
   const key=row.card+"#"+row.index;
   if(complete.has(key))throw Error("Duplicate checkpoint "+key);
   complete.set(key,row);
  }

  // Build one reference task per unique (trial index, party), independently
  // of the number of card chunks. Save completed references on disk so
  // interrupted studies do not redo costly full-game MCTS controls.
  const cachedReferences=new Map();
  const missingReferences=new Map();
  const referenceJobs=[];
  const readyBatches=[];
  let remainingCards=0,remainingBatches=0,cachedReferenceGroups=0;
  const controlConfig={
   seed:c.seed,budget:c.budget,maxSearchSteps:c.maxSearchSteps,
   maxGameSteps:c.maxGameSteps,nativeHash:c.nativeHash
  };
  for(let i=0;i<c.runsPerCard;i++){
   const groups=new Map();
   for(const card of c.cards){
    if(complete.has(cardKey(card)+"#"+i))continue;
    const key=sharedControlKey(card,i,c);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({kind:card.kind,cardId:card.id});
    remainingCards++;
   }
   for(const [key,cards] of groups){
    const chunks=[];
    for(let j=0;j<cards.length;j+=c.batchSize){
     chunks.push({type:"batch",reference:key,index:i,
      cards:cards.slice(j,j+c.batchSize)});
     remainingBatches++;
    }
    let baseline=cachedReferences.get(key);
    if(!baseline&&existsSync(referenceFile(c.out,key))){
     baseline=JSON.parse(readFileSync(referenceFile(c.out,key),"utf8"));
     cachedReferences.set(key,baseline);
     cachedReferenceGroups++;
    }
    if(baseline){
     // Validate all cached controls against a real printed card before
     // giving the worker any data. A mismatched manifest fails closed.
     const first=getCard(cards[0].kind,cards[0].cardId);
     sharedControlForCard(baseline,first,i,controlConfig);
     for(const batch of chunks)readyBatches.push({...batch,baseline});
    }else{
     if(missingReferences.has(key))
      throw Error("Duplicate shared reference group "+key);
     missingReferences.set(key,chunks);
     referenceJobs.push({type:"reference",reference:key,index:i,
      card:cards[0]});
    }
   }
  }
  report(c,rev,complete);
  console.error(JSON.stringify({
   remainingCardJobs:remainingCards,
   referenceGroupsToCompute:referenceJobs.length,
   referenceGroupsReused:cachedReferenceGroups,
   treatmentBatches:remainingBatches,
   fullExpeditionsUpperBound:remainingCards+referenceJobs.length,
   note:"Structural work count only; all saved results are canonical"
  }));
  const workers=Array.from({
   length:Math.min(c.workers,referenceJobs.length+remainingBatches)
  },()=>new Worker(new URL(import.meta.url),{
   workerData:{config:controlConfig}
  }));
  const assigned=new Map();
  let referenceCursor=0,batchCursor=0,closed=false;
  const deadline=Date.now()+c.hours*3600000;
  const saveTimer=setInterval(()=>{
   const stats=report(c,rev,complete,errors);
   console.error("All-card checkpoints: "+stats.completedJobs+"/"+
    stats.plannedJobs+"; paired="+stats.pairedJobs+
    "; pending references="+missingReferences.size);
  },60000);
  let watchdog=null;
  try{
   await new Promise((done,reject)=>{
    const fail=error=>{
     if(closed)return;
     closed=true;reject(error);
    };
    // Feed all seven cores with independent treatments as soon as the
    // corresponding control is ready. Avoid binding many treatments to
    // one worker and leaving the others waiting on a long card.
    const schedule=()=>{
     if(closed)return;
     const timedOut=Date.now()>=deadline;
     if(!timedOut)for(const worker of workers){
      if(assigned.has(worker))continue;
      let job=null;
      if(batchCursor<readyBatches.length)
       job=readyBatches[batchCursor++];
      else if(referenceCursor<referenceJobs.length)
       job=referenceJobs[referenceCursor++];
      if(job){
       assigned.set(worker,{job,started:Date.now(),progress:0});
       worker.postMessage(job);
      }
     }
     if(assigned.size===0&&(timedOut||
      (batchCursor===readyBatches.length&&
       referenceCursor===referenceJobs.length&&
       missingReferences.size===0)))done();
    };
    watchdog=setInterval(()=>{
     if(closed)return;
     for(const entry of assigned.values()){
      if(Date.now()-entry.started<=c.jobMinutes*60000)continue;
      fail(Error("Canonical all-card job timed out: "+
       entry.job.type+" "+entry.job.reference+
       " index "+entry.job.index+" card "+entry.progress));
      return;
     }
     schedule();
    },10000);
    for(const worker of workers){
     worker.on("message",message=>{
      if(closed)return;
      const entry=assigned.get(worker);
      if(!entry){
       fail(Error("Unsolicited canonical worker reply"));return;
      }
      if(message.type==="failed"){
       errors.push(message);
       fail(Error("Canonical all-card job failed: "+
        JSON.stringify(message)));return;
      }
      if(message.type==="reference-done"){
       if(entry.job.type!=="reference"||
        message.baseline?.key!==entry.job.reference){
        fail(Error("Mismatched canonical reference checkpoint"));return;
       }
       try{
        const card=getCard(entry.job.card.kind,entry.job.card.cardId);
        sharedControlForCard(message.baseline,card,
         entry.job.index,controlConfig);
        save(referenceFile(c.out,entry.job.reference),message.baseline);
       }catch(error){fail(error);return;}
       const waiting=missingReferences.get(entry.job.reference);
       if(!waiting){
        fail(Error("No batches waiting for reference"));return;
       }
       cachedReferences.set(entry.job.reference,message.baseline);
       missingReferences.delete(entry.job.reference);
       for(const batch of waiting)readyBatches.push({
        ...batch,baseline:message.baseline
       });
       assigned.delete(worker);
       schedule();
       return;
      }
      if(message.type==="result"){
       if(entry.job.type!=="batch"){
        fail(Error("Treatment result for reference job"));return;
       }
       const expected=entry.job.cards[entry.progress];
       const result=message.result;
       if(!expected||!result||
        result.card!==expected.kind+":"+expected.cardId||
        result.index!==entry.job.index){
        fail(Error("Mismatched canonical card checkpoint"));return;
       }
       try{
        save(join(c.out,"checkpoints",checkpointName(
         getCard(expected.kind,expected.cardId),result.index)),result);
       }catch(error){fail(error);return;}
       complete.set(result.card+"#"+result.index,result);
       entry.progress++;
       entry.started=Date.now();
       return;
      }
      if(message.type!=="batch-done"||
       entry.job.type!=="batch"||
       message.index!==entry.job.index||
       entry.progress!==entry.job.cards.length){
       fail(Error("Unexpected or incomplete canonical worker batch"));return;
      }
      assigned.delete(worker);
      schedule();
     });
     worker.on("error",fail);
     worker.on("exit",code=>{
      if(code!==0)fail(Error("Canonical worker exited with "+code));
     });
    }
    schedule();
   });
  }finally{
   closed=true;
   clearInterval(saveTimer);
   if(watchdog!==null)clearInterval(watchdog);
   await Promise.all(workers.map(w=>w.terminate()));
   const summary=report(c,rev,complete,errors);
   console.log(JSON.stringify({
    out:c.out,complete:summary.complete,
    finished:summary.completedJobs,planned:summary.plannedJobs,
    failures:errors.length
   },null,2));
  }
 }
}
