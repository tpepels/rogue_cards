import {Worker} from 'node:worker_threads';
import {existsSync,mkdirSync,readFileSync,openSync,closeSync,unlinkSync,writeFileSync,fsyncSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {HEROES} from '../heroes.js';
import {writeResultsStatusForOutput} from './results-status.js';
import {canonicalJSON,hashValue,sourceFingerprint,persistSourceSnapshot,atomicWriteJSON,appendTrialRecord,readTrialRecords} from './io.js';

export const ALL_PARTIES=Object.freeze([
  ...HEROES.map(h=>Object.freeze([h.id])),
  ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>Object.freeze([h.id,other.id])))
]);
const SPLITS=['screen','refine','holdout','agent-confirm','agent-screen'];
const SEED_DOMAIN=2**29;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const clone=v=>JSON.parse(canonicalJSON(v));
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function integer(value,name,min,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('Invalid '+name);return value;}
function cap(value,name){if(value!==undefined&&(!Number.isFinite(value)||value<0))throw Error('Invalid '+name);return value;}
function acquireLock(path){
  try{
    const fd=openSync(path,'wx');writeFileSync(fd,JSON.stringify({pid:process.pid})+'\n');fsyncSync(fd);return fd;
  }catch(error){
    if(error.code!=='EEXIST')throw error;
    let owner;try{owner=JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('Laboratory output is locked (unreadable owner): '+path);}
    if(!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw Error('Laboratory output is locked (invalid owner): '+path);
    try{process.kill(owner.pid,0);}catch(probe){
      if(probe.code==='ESRCH'){unlinkSync(path);return acquireLock(path);}
    }
    throw Error('Laboratory output is locked: '+path);
  }
}

export async function buildTrialPlan(options={}){
  const {candidates,seed=20261020,split='screen',runsPerParty=1,recordEvents=false,maxGameSteps=20000,goals=null}=options;
  integer(seed,'seed',0,0xffffffff);integer(runsPerParty,'runsPerParty',1,Math.floor(SEED_DOMAIN/36));integer(maxGameSteps,'maxGameSteps',1);
  if(!SPLITS.includes(split))throw Error('Unknown split '+split);
  if(typeof recordEvents!=='boolean')throw Error('Invalid recordEvents');
  if(!Array.isArray(candidates)||!candidates.length)throw Error('Candidates must be a nonempty list');
  let profiles=options.profiles;
  if(profiles===undefined)profiles=['reference-v1'];
  if(!Array.isArray(profiles)||!profiles.length)throw Error('Profiles must be a nonempty list');
  // Hash the exact normalized policy the trial executes, including defaults.
  // Object inputs must pass the same validation as versioned profile IDs.
  const {getAgentProfile}=await import('./profiles.js');
  profiles=profiles.map(p=>getAgentProfile(p));
  const cs=candidates.map(c=>{
    if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Invalid candidate manifest');
    const manifest=clone(c),contentHash=hashValue(manifest);
    return {id:manifest.id??manifest.hash??contentHash,hash:manifest.hash??contentHash,contentHash,manifest};
  });
  const ps=profiles.map(p=>{
    if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid profile');
    const profile=clone(p),contentHash=hashValue(profile),hash=profile.hash??contentHash;return {id:profile.id??hash,hash,contentHash,profile};
  });
  for(const [label,list,key] of [['candidate',cs,'hash'],['profile',ps,'hash'],['candidate',cs,'id'],['profile',ps,'id']]){
    if(new Set(list.map(x=>x[key])).size!==list.length)throw Error('Duplicate '+label+' '+key);
  }
  const parties=(options.parties??ALL_PARTIES).map(p=>{
    if(typeof p==='string')p=p.split('+');
    if(!Array.isArray(p)||p.length<1||p.length>2||new Set(p).size!==p.length||p.some(h=>!HEROES.some(x=>x.id===h)))throw Error('Invalid party');
    return [...p].sort((a,b)=>HEROES.findIndex(h=>h.id===a)-HEROES.findIndex(h=>h.id===b));
  });
  if(!parties.length)throw Error('Empty parties');
  if(new Set(parties.map(p=>p.join('+'))).size!==parties.length)throw Error('Duplicate party');
  const offset=Number.parseInt(hashValue({seed}).slice(0,12),16)%SEED_DOMAIN;
  const tasks=[];
  // Candidate/profile-independent pairing. Mapping within a split is injective
  // over the allowed repeat/party domain, and split residues are disjoint.
  for(let repeat=0;repeat<runsPerParty;repeat++)for(const heroes of parties){
    const party=heroes.join('+'),partyIndex=ALL_PARTIES.findIndex(p=>p.join('+')===party);
    const trialSeed=((offset+(repeat*36+partyIndex)*65537)%SEED_DOMAIN)*8+SPLITS.indexOf(split)+1;
    for(const c of cs)for(const p of ps){
      const identity={candidateHash:c.hash,candidateContentHash:c.contentHash,profileHash:p.hash,profileContentHash:p.contentHash,party,repeat,seed:trialSeed,split,recordEvents,maxGameSteps};
      const id=hashValue(identity);
      tasks.push({id,trialId:id,candidateId:c.id,candidateHash:c.hash,candidateContentHash:c.contentHash,profile:p.id,profileId:p.id,profileHash:p.hash,profileContentHash:p.contentHash,heroes,party,repeat,seed:trialSeed,split});
    }
  }
  const config={schema:'uba-laboratory-config-v1',seed,split,runsPerParty,parties,candidates:cs,profiles:ps,recordEvents,maxGameSteps,goals:clone(goals),design:clone(options.design??null)};
  return freeze({schema:'uba-trial-plan-v1',hash:hashValue({config,tasks}),config,tasks});
}

export async function runLaboratory(options={}){
  const workers=integer(options.workers??1,'workers',1,256),maxTrials=options.maxTrials===undefined?Infinity:integer(options.maxTrials,'maxTrials',0);
  const budgetMs=cap(options.budgetMs,'budgetMs')??Infinity,cpuBudgetMs=cap(options.cpuBudgetMs,'cpuBudgetMs')??Infinity;
  const plan=await buildTrialPlan(options),source=sourceFingerprint();
  const identity={schema:'uba-laboratory-manifest-v1',plan,source};
  let manifest={...identity,id:hashValue(identity)};
  const out=options.out===undefined?null:resolve(options.out);
  let lock,lockPath;
  if(out){
    mkdirSync(out,{recursive:true});lockPath=join(out,'.laboratory.lock');
    lock=acquireLock(lockPath);
  }
  try{
    let rows=[],recoveredTail=false,changedSource=false;
    if(out){
      const manifestPath=join(out,'manifest.json');
      if(existsSync(manifestPath)){
        let prior;try{prior=JSON.parse(readFileSync(manifestPath,'utf8'));}catch(error){throw Error('Corrupt manifest',{cause:error});}
        if(prior.schema!==manifest.schema||
          prior.id!==hashValue({schema:prior.schema,plan:prior.plan,source:prior.source})||
          canonicalJSON(prior.plan)!==canonicalJSON(plan))
          throw Error('Incompatible checkpoint trial plan');
        // Retain the existing manifest ID for finished trial records.
        changedSource=canonicalJSON(prior.source)!==canonicalJSON(source);
        manifest=prior;
      }else{
        if(existsSync(join(out,'trials.ndjson'))&&readFileSync(join(out,'trials.ndjson')).length)throw Error('Trial records without a manifest');
        atomicWriteJSON(manifestPath,manifest);
      }
      if(changedSource){
        // Archive the resumed version without overwriting original source bytes.
        persistSourceSnapshot(join(out,'resume-sources',hashValue(source)),source);
        process.stderr.write('UBA: resumed under a new source version; completed trial records retained. Mixed-version results need review.\n');
      }else persistSourceSnapshot(out,source);
      ({rows,recoveredTail}=readTrialRecords(join(out,'trials.ndjson'),plan.tasks));
    }
    const begun=performance.now(),usageStart=process.cpuUsage();
    const publishProgress=()=>{
      const cpu=process.cpuUsage(usageStart),progress={schema:'uba-progress-v1',manifestId:manifest.id,planned:plan.tasks.length,completed:rows.length,pending:plan.tasks.length-rows.length,
        workers,elapsedMs:performance.now()-begun,cpuMs:(cpu.user+cpu.system)/1000,residentBytes:process.memoryUsage().rss};
      if(out){atomicWriteJSON(join(out,'progress.json'),progress);writeResultsStatusForOutput(out);}
      options.onProgress?.(progress);
    };
    publishProgress();
    const done=new Set(rows.map(r=>r.id)),pendingTasks=plan.tasks.filter(t=>!done.has(t.id));
    const errors=[];
    let stopReason=null;
    if(pendingTasks.length){
      if(maxTrials===0)stopReason='max-trials';
      else if(options.signal?.aborted)stopReason='interrupt';
      else if(budgetMs===0)stopReason='time-budget';
      else if(cpuBudgetMs===0)stopReason='cpu-budget';
      else{
        const heartbeat=setInterval(publishProgress,30000);
        let result;
        try{result=await executeTasks({plan,source,pendingTasks,workers,maxTrials,budgetMs,cpuBudgetMs,signal:options.signal,onRow(row){
          if(out)appendTrialRecord(join(out,'trials.ndjson'),row);rows.push(row);publishProgress();
        }});}finally{clearInterval(heartbeat);}
        errors.push(...result.errors);stopReason=result.stopReason;
      }
    }
    const byId=new Map(rows.map(r=>[r.id,r]));rows=plan.tasks.filter(t=>byId.has(t.id)).map(t=>byId.get(t.id));
    const complete=rows.length===plan.tasks.length;
    publishProgress();
    const summary={schema:'uba-laboratory-summary-v1',manifestId:manifest.id,planned:plan.tasks.length,completed:rows.length,pending:plan.tasks.length-rows.length,complete,stopReason,errors};
    if(out){atomicWriteJSON(join(out,'summary.json'),summary);writeResultsStatusForOutput(out,{force:true});}
    return {manifest,rows,complete,pending:summary.pending,errors,stopReason,recoveredTail,summary};
  }finally{if(lock!==undefined){closeSync(lock);unlinkSync(lockPath);}}
}

async function executeTasks({plan,source,pendingTasks,workers,maxTrials,budgetMs,cpuBudgetMs,signal,onRow}){
  const queue=pendingTasks.slice(0,maxTrials),pool=[],errors=[],start=performance.now(),cpuStart=process.cpuUsage();
  let cursor=0,stopping=false,finished=false,stopReason=null;
  const interruptBuffer=new SharedArrayBuffer(4),interrupt=new Int32Array(interruptBuffer);
  const remaining=new Set(queue.map(t=>t.id));
  return await new Promise(resolveRun=>{
    let timer;
    const cleanup=()=>{clearInterval(timer);signal?.removeEventListener('abort',abort);process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);};
    const finish=async()=>{
      if(finished)return;finished=true;
      cleanup();await Promise.all(pool.map(w=>w.terminate().catch(error=>{errors.push({message:'Worker termination failed: '+error.message});})));
      resolveRun({errors,stopReason:stopReason??(queue.length<pendingTasks.length?'max-trials':null)});
    };
    const settle=()=>{if(pool.every(w=>!w.busy)&&(stopping||cursor>=queue.length))void finish();};
    // A single synchronous MCTS decision may outlast the entire run budget.
    // Terminate active workers rather than waiting for a decision boundary;
    // only rows already delivered to onRow have completed their trial.
    const stop=reason=>{if(!stopping){stopping=true;stopReason=reason;Atomics.store(interrupt,0,1);}void finish();};
    const abort=()=>stop('interrupt');
    const assign=w=>{
      w.busy=false;w.task=null;
      if(stopping||cursor>=queue.length){settle();return;}
      const task=queue[cursor++];w.busy=true;w.task=task;
      const candidate=plan.config.candidates.find(c=>c.hash===task.candidateHash).manifest;
      const profile=plan.config.profiles.find(p=>p.hash===task.profileHash).profile;
      w.postMessage({task,candidate,profile,recordEvents:plan.config.recordEvents,maxGameSteps:plan.config.maxGameSteps});
    };
    signal?.addEventListener('abort',abort,{once:true});process.on('SIGINT',abort);process.on('SIGTERM',abort);
    for(let i=0;i<Math.min(workers,queue.length);i++){
      const execArgv=process.execArgv.filter((arg,i,args)=>arg!=='--input-type'&&!arg.startsWith('--input-type=')&&args[i-1]!=='--input-type');
      // Let Node inherit/filter its own internal test-runner flags. Override
      // only eval callers whose --input-type is invalid for a file worker.
      const launchOptions={workerData:{interruptBuffer,sourceHash:source.hash},...(execArgv.length!==process.execArgv.length?{execArgv}:{})};
      const w=new Worker(new URL('./worker.js',import.meta.url),launchOptions);w.busy=false;pool.push(w);
      w.on('message',message=>{
        if(finished)return;
        const task=w.task;
        if(!task||message.id!==task.id){errors.push({message:'Worker returned unexpected trial'});w.busy=false;stop('worker-error');return;}
        if(message.error){
          errors.push({id:task.id,...message.error});w.busy=false;stop('trial-error');return;
        }
        if(message.interrupted){w.busy=false;stop(stopReason??'interrupt');return;}
        try{
          const result=message.result;
          if(!result||!['win','death','escape'].includes(result.ending)||![0,1,false,true].includes(result.won)||Boolean(result.won)!==(result.ending==='win'))throw Error('Trial did not return a terminal result');
          for(const key of ['seed','candidateHash','candidateId','profileHash','profileId','party','heroes'])if(own(result,key)&&canonicalJSON(result[key])!==canonicalJSON(task[key]))throw Error('Trial metadata mismatch: '+key);
          if(!remaining.delete(task.id))throw Error('Duplicate worker trial');
          onRow({...result,...task});
        }catch(error){errors.push({id:task.id,message:error.message});w.busy=false;stop('trial-error');return;}
        assign(w);
      });
      w.on('error',error=>{if(finished)return;errors.push({id:w.task?.id??null,message:error.message});w.busy=false;stop('worker-error');settle();});
      w.on('exit',code=>{if(!finished&&w.busy){errors.push({id:w.task?.id??null,message:'Worker exited '+code});w.busy=false;stop('worker-error');settle();}});
    }
    timer=setInterval(()=>{
      if(performance.now()-start>=budgetMs)stop('time-budget');
      const cpu=process.cpuUsage(cpuStart);
      if((cpu.user+cpu.system)/1000>=cpuBudgetMs)stop('cpu-budget');
    },10);
    for(const w of pool)assign(w);
  });
}
