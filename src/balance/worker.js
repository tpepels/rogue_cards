import {parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {sourceFingerprint} from './io.js';

const interrupt=new Int32Array(workerData.interruptBuffer);
parentPort.on('message',async({task,candidate,profile,recordEvents,maxGameSteps})=>{
  if(Atomics.load(interrupt,0)){parentPort.postMessage({id:task.id,interrupted:true});return;}
  try{
    if(sourceFingerprint().hash!==workerData.sourceHash)throw Error('Source provenance changed before trial');
    // Lazy import keeps planning and checkpoint inspection independent of engine
    // initialization and makes missing/invalid trial modules explicit errors.
    const {playBalanceTrial}=await import('./trial.js');
    if(Atomics.load(interrupt,0)){parentPort.postMessage({id:task.id,interrupted:true});return;}
    const start=performance.now();
    const result=await playBalanceTrial({candidate,heroes:task.heroes,seed:task.seed,profile,recordEvents,maxGameSteps,
      shouldStop:()=>Boolean(Atomics.load(interrupt,0))});
    if(sourceFingerprint().hash!==workerData.sourceHash)throw Error('Source provenance changed during trial');
    parentPort.postMessage({id:task.id,result:{...result,trialWallMs:performance.now()-start}});
  }catch(error){
    if(Atomics.load(interrupt,0))parentPort.postMessage({id:task.id,interrupted:true});
    else parentPort.postMessage({id:task.id,error:{name:error.name,message:error.message,stack:error.stack}});
  }
});
