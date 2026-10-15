#!/usr/bin/env node
/**
 * Safely migrate completed canonical balance checkpoints between revisions.
 *
 * Replay every completed source under THIS revision, with the exact
 * original experiment settings and all real canonical MCTS decisions.
 * Only a bit-for-bit-equivalent JSON result is imported. No old checkpoints
 * are rewritten; original provenance is retained in a separate report.
 *
 * Verification is itself resumable. The destination is published only
 * AFTER ALL original completed checkpoints have been replayed successfully.
 *
 * node scripts/migrate-session-balance.mjs --from OLD --to NEW --audit FAST_AUDIT
 */
import {Worker} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {createHash} from "node:crypto";
import {
 existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,
 renameSync,copyFileSync
} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {isDeepStrictEqual} from "node:util";
import {pathToFileURL} from "node:url";

const sha=value=>createHash("sha256").update(value).digest("hex");
const read=path=>JSON.parse(readFileSync(path,"utf8"));
const atomic=(path,data)=>{
 const temp=path+".tmp-"+process.pid;
 writeFileSync(temp,JSON.stringify(data,null,2)+"\n");
 renameSync(temp,path);
};
const isRevision=s=>typeof s==="string"&&/^[0-9a-f]{40}$/.test(s);
const indexName=i=>String(i).padStart(6,"0")+".json";
const designFields=["runs","seed","futureBudget","navigateBudget",
 "maxSearchSteps","maxGameSteps","minEligible","jobMinutes",
 "focus","auditFile"];
const allowedFocus=new Set(["room","item","hero","retained","vault",
 "parley","monster","equipment","effect","all"]);

export function validateDesign(m){
 if(!m||m.schema!==1||!isRevision(m.revision))
  throw Error("Invalid source manifest/revision");
 if(Object.keys(m).join(",")!=="schema,revision,"+designFields.join(","))
  throw Error("Unexpected source study manifest fields or ordering");
 for(const field of designFields){
  if(field==="focus"){
   if(!allowedFocus.has(m.focus))throw Error("Invalid source focus");
  }else if(field==="auditFile"){
   if(typeof m.auditFile!=="string"||!m.auditFile)
    throw Error("Invalid source audit path");
  }else if(!Number.isSafeInteger(m[field])||m[field]<1)
   throw Error("Invalid source study setting "+field);
 }
 if(m.runs>100000||m.minEligible<2||m.seed>0xffffffff)
  throw Error("Invalid source study limits");
 return m;
}

/** Key ordering MUST match the runner's literal JSON.stringify(design). */
export function targetDesign(original,revision,auditFile){
 validateDesign(original);
 if(!isRevision(revision)||revision===original.revision)
  throw Error("Destination must use a distinct 40-digit Git revision");
 const target={...original,revision,auditFile};
 validateDesign(target);
 return target;
}
export function requireMatchingAudit(audit,revision){
 if(audit?.commit!==revision||audit?.pass!==true||
    audit?.completeFaceCoverage!==true||
    audit?.allWalksEnded!==true||audit?.runs<36)
  throw Error("Canonical audit must PASS for 36+ real expeditions on revision "+revision);
}
export function verifyCheckpoint(record,i,design){
 if(!record||typeof record!=="object"||record.i!==i||
    i<0||i>=design.runs||record.focus!==
    (design.focus==="all"?[
     "room","item","hero","retained","vault","parley","monster",
     "equipment","effect"][i%9]:design.focus)||
    !["unreached","paired"].includes(record.kind)||
    !Number.isSafeInteger(record.gameSeed)||record.gameSeed<0||
    !Array.isArray(record.heroes)||
    !Number.isSafeInteger(record.step)||record.step<0)
  throw Error("Invalid source checkpoint "+indexName(i));
 return record;
}
export function matchingResult(original,replayed){
 return isDeepStrictEqual(original,replayed);
}
function argumentsFromCLI(argv){
 const opts={},allowed=new Set(["--from","--to","--audit",
  "--workers","--job-minutes"]);
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!allowed.has(k)||opts[k]!==undefined||!v||v.startsWith("--"))
   throw Error("Invalid migration argument "+k);
  opts[k]=v;
 }
 if(!opts["--from"]||!opts["--to"]||!opts["--audit"])
  throw Error("Required: --from OLD --to NEW --audit FAST_AUDIT");
 const number=(key,defaultValue,max)=>{
  if(opts[key]===undefined)return defaultValue;
  if(!/^[1-9]\d*$/.test(opts[key]))throw Error("Invalid "+key);
  const n=Number(opts[key]);
  if(!Number.isSafeInteger(n)||n>max)throw Error("Invalid "+key);
  return n;
 };
 return {
  from:resolve(opts["--from"]),
  to:resolve(opts["--to"]),
  audit:resolve(opts["--audit"]),
  workers:number("--workers",Math.min(7,availableParallelism()),16),
  jobMinutes:number("--job-minutes",30,240)
 };
}
function filesIn(dir){
 if(!existsSync(dir))throw Error("Missing checkpoint folder: "+dir);
 const names=readdirSync(dir).sort();
 for(const name of names)
  if(!/^\d{6}\.json$/.test(name))
   throw Error("Unexpected checkpoint file "+name);
 return names;
}
function sourceEntries(sourceDir,design){
 return filesIn(sourceDir).map(name=>{
  const i=Number(name.slice(0,6)),path=join(sourceDir,name);
  const contents=readFileSync(path);
  verifyCheckpoint(JSON.parse(contents),i,design);
  return {i,name,sha256:sha(contents)};
 });
}
function validateSourceUnchanged(dir,expected,design){
 const seen=sourceEntries(dir,design);
 if(!isDeepStrictEqual(seen,expected))
  throw Error("Original checkpoints changed while migration was running. "+
   "Stop the old run and start with a new migration destination.");
}
function reviewPriorVerification(stage,entry,oldRevision,newRevision){
 const checkpoint=join(stage,"checkpoints",entry.name);
 const proof=join(stage,"verified",entry.name);
 if(!existsSync(checkpoint)||!existsSync(proof))return false;
 const p=read(proof);
 if(p.index!==entry.i||p.sourceSha256!==entry.sha256||
    p.sourceRevision!==oldRevision||p.targetRevision!==newRevision)
  throw Error("Inconsistent verification proof for "+entry.name);
 if(sha(readFileSync(checkpoint))!==p.importedSha256||
    p.importedSha256!==entry.sha256)
  throw Error("Corrupt verified checkpoint for "+entry.name);
 return true;
}
function explainMismatch(expected,actual){
 const keys=[...new Set([...Object.keys(expected),...Object.keys(actual)])];
 return keys.filter(k=>!isDeepStrictEqual(expected[k],actual[k]))
  .map(k=>({field:k,original:expected[k],optimized:actual[k]})).slice(0,8);
}
async function migrate(argv){
 const args=argumentsFromCLI(argv);
 if(args.from===args.to||args.to.startsWith(args.from+"/")||
    args.from.startsWith(args.to+"/"))
  throw Error("Source and destination folders must be separate and non-nested");
 if(existsSync(args.to))
  throw Error("Destination already exists: "+args.to+
   " (resume the verified study instead)");
 const stage=args.to+".migration-in-progress";
 if(args.from===stage||args.from.startsWith(stage+"/"))
  throw Error("Invalid migration staging path");
 const sourceManifest=validateDesign(read(join(args.from,"manifest.json")));
 const currentRevision=execFileSync("git",["rev-parse","HEAD"],{
  encoding:"utf8"
 }).trim();
 if(!isRevision(currentRevision)||currentRevision===sourceManifest.revision)
  throw Error("Run the migration from a DIFFERENT, pinned optimized worktree");
 if(!existsSync(args.audit))throw Error("Missing target audit: "+args.audit);
 requireMatchingAudit(read(args.audit),currentRevision);
 if(!existsSync(sourceManifest.auditFile))
  throw Error("Original canonical audit missing: "+sourceManifest.auditFile);
 requireMatchingAudit(read(sourceManifest.auditFile),sourceManifest.revision);
 const targetManifest=targetDesign(sourceManifest,currentRevision,args.audit);
 const checkpoints=join(args.from,"checkpoints");
 const entries=sourceEntries(checkpoints,sourceManifest);
 if(!entries.length)throw Error("No completed old checkpoints to migrate");
 const plan={
  schema:1,
  sourcePath:args.from,targetPath:args.to,
  sourceRevision:sourceManifest.revision,targetRevision:currentRevision,
  sourceManifestSha256:sha(readFileSync(join(args.from,"manifest.json"))),
  targetAuditSha256:sha(readFileSync(args.audit)),
  targetManifest,entries
 };
 const planPath=join(stage,"plan.json");
 if(existsSync(stage)){
  if(!existsSync(planPath)||!isDeepStrictEqual(read(planPath),plan))
   throw Error("Staged migration no longer matches sources/settings; "+
    "do not silently reuse its checkpoint proofs");
 }else{
  mkdirSync(join(stage,"checkpoints"),{recursive:true});
  mkdirSync(join(stage,"verified"),{recursive:true});
  atomic(planPath,plan);
 }
 validateSourceUnchanged(checkpoints,entries,sourceManifest);
 const remaining=entries.filter(entry=>!reviewPriorVerification(
  stage,entry,sourceManifest.revision,currentRevision));
 console.log("Migration: "+(entries.length-remaining.length)+
  " independently replay-verified; "+remaining.length+" remaining; "+
  "workers "+args.workers);
 const workerConfig={...sourceManifest};
 let finished=entries.length-remaining.length;
 if(remaining.length){
  const running=new Map(),pool=[];
  let next=0,stopped=false,interval=null;
  const cancel=async()=>{
   stopped=true;if(interval!==null)clearInterval(interval);
   await Promise.all(pool.map(w=>w.terminate()));
  };
  try{
   await new Promise((complete,reject)=>{
    const fail=error=>{
     if(stopped)return;
     stopped=true;reject(error);
    };
    const dispatch=worker=>{
     if(stopped)return;
     if(next>=remaining.length){
      if(!running.size)complete();
      return;
     }
     const entry=remaining[next++];
     running.set(worker,{entry,started:Date.now()});
     worker.postMessage({type:"job",i:entry.i});
    };
    interval=setInterval(()=>{
     if(stopped)return;
     for(const [worker,work] of running)
      if(Date.now()-work.started>args.jobMinutes*60000){
       fail(Error("Verification timed out on source "+work.entry.i+
        "; staging is resumable"));return;
      }
     console.log("Replay-verified "+finished+"/"+entries.length+" checkpoints");
    },10000);
    for(let i=0;i<Math.min(args.workers,remaining.length);i++){
     const worker=new Worker(new URL("./study-session-balance.mjs",import.meta.url),{
      workerData:{config:workerConfig}
     });
     pool.push(worker);
     worker.on("message",m=>{
      if(stopped)return;
      const work=running.get(worker);
      if(!work||m.type==="failed"){
       fail(Error("Optimized replay failed on "+(work?.entry.i??m.index)+
        ": "+(m.stack||"Unexpected worker result")));return;
      }
      if(m.type!=="done"||m.value?.i!==work.entry.i){
       fail(Error("Worker returned wrong checkpoint index"));return;
      }
      try{
       const entry=work.entry;
       const originalPath=join(checkpoints,entry.name);
       const bytes=readFileSync(originalPath);
       if(sha(bytes)!==entry.sha256)
        throw Error("Source changed during replay "+entry.name);
       const original=verifyCheckpoint(JSON.parse(bytes),entry.i,sourceManifest);
       if(!matchingResult(original,m.value)){
        atomic(join(stage,"failure-"+entry.name),{
         schema:1,sourceIndex:entry.i,
         sourceRevision:sourceManifest.revision,
         targetRevision:currentRevision,
         differences:explainMismatch(original,m.value)
        });
        throw Error("Canonical replay mismatch at index "+entry.i+
         ". See failure-"+entry.name+". DO NOT COMBINE DATA.");
       }
       const dest=join(stage,"checkpoints",entry.name);
       copyFileSync(originalPath,dest);
       atomic(join(stage,"verified",entry.name),{
        index:entry.i,
        sourceRevision:sourceManifest.revision,
        targetRevision:currentRevision,
        sourceSha256:entry.sha256,
        importedSha256:sha(readFileSync(dest)),
        verifiedBy:"complete optimized oneJob canonical re-execution"
       });
       finished++;
       running.delete(worker);
       dispatch(worker);
      }catch(e){fail(e)}
     });
     worker.on("error",fail);
     worker.on("exit",code=>{
      if(code!==0&&!stopped)fail(Error("Verifier exited "+code));
     });
     dispatch(worker);
    }
   });
  }finally{await cancel()}
 }
 validateSourceUnchanged(checkpoints,entries,sourceManifest);
 for(const entry of entries)
  if(!reviewPriorVerification(stage,entry,sourceManifest.revision,currentRevision))
   throw Error("Missing successful verification for "+entry.name);
 atomic(join(stage,"migration-provenance.json"),{
  schema:1,
  originalRevision:sourceManifest.revision,
  targetRevision:currentRevision,
  originalStudyPath:args.from,
  originalManifestSha256:plan.sourceManifestSha256,
  destinationStudyPath:args.to,
  originalCompletedSourceCount:entries.length,
  verifiedSourceCount:entries.length,
  sourceIndices:entries.map(e=>e.i),
  verification:"Every complete checkpoint was reproduced with the real "+
   "optimized study worker and deep-compared across all returned fields.",
  originalRecordsPreserved:true,
  limitations:[
   "No prior checkpoint was inferred to match from sampling alone.",
   "Partial/uncheckpointed source computations were not migrated.",
   "These checkpoints are conditionally valid only for the target "+
    "revision and unchanged study settings."
  ]
 });
 atomic(join(stage,"manifest.json"),targetManifest);
 if(existsSync(args.to))throw Error("Destination appeared before publish");
 mkdirSync(dirname(args.to),{recursive:true});
 renameSync(stage,args.to);
 console.log("SUCCESS: "+entries.length+" independently verified old "+
  "checkpoints published at "+args.to);
 console.log("Provenance: "+join(args.to,"migration-provenance.json"));
 console.log("Resume with the ORIGINAL study settings and --resume, "+
  "but the NEW canonical audit path "+args.audit);
}
const entryPoint=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href;
if(import.meta.url===entryPoint)
 migrate(process.argv.slice(2)).catch(e=>{
  console.error("Migration NOT published: "+(e.stack||e));
  process.exitCode=1;
 });
