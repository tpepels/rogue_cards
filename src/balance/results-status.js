/**
 * Small human-readable index for ignored results/. Uses checkpoints and
 * progress metadata only; never scans trial records or source snapshots.
 */
import {existsSync,mkdirSync,readdirSync,readFileSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';
import {summarizeComparison,describeCandidateConfiguration} from './comparison-summary.js';

const STATUS='STATUS.md',tick=String.fromCharCode(96);
const code=value=>tick+String(value??'—')+tick;
const clean=value=>String(value??'—').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
const percent=value=>Number.isFinite(value)?(100*value).toFixed(1)+'%':'—';
const score=value=>Number.isFinite(value)?value.toFixed(3):'—';
const file=path=>{try{return statSync(path).isFile();}catch{return false;}};
const mtime=path=>{try{return statSync(path).mtime.toISOString();}catch{return null;}};
const read=path=>{
 if(!file(path))return {data:null,error:null};
 try{return {data:JSON.parse(readFileSync(path,'utf8')),error:null};}
 catch{return {data:null,error:'Unreadable JSON: '+path.split(sep).pop()};}
};
const link=(root,path)=>'['+path.split(sep).pop()+']('+relative(root,path).split(sep).map(encodeURIComponent).join('/')+')';
const links=(root,dir,choices)=>choices.filter(name=>file(join(dir,name))).slice(0,3).map(name=>link(root,join(dir,name))).join(' · ')||'—';
const progressLabel=p=>{
 if(!p)return 'No progress yet';
 const completed=Number.isFinite(p.completed)?p.completed:p.finished;
 const planned=Number.isFinite(p.planned)?p.planned:p.total;
 return Number.isFinite(completed)&&Number.isFinite(planned)?
  completed+' / '+planned+' ('+(planned?percent(completed/planned):'0%')+')':'No progress recorded';
};
const recognizedStatus=s=>s?.complete===true||s?.status==='complete'||s?.status==='completed';
const dateFrom=paths=>paths.map(mtime).filter(Boolean).sort().at(-1)??null;
const priority=status=>status==='Running'?0:/^(Paused|Partial|Pending)/.test(status)?1:status==='Complete'?2:3;
const readableFiles=dir=>{
 try{
  return readdirSync(dir,{withFileTypes:true})
   .filter(x=>x.isFile()&&/\.(?:md|json)$/i.test(x.name)&&
    !/^(?:optimizer-state|optimizer-lock|trials|candidate|manifest|progress|summary)\./.test(x.name))
   .map(x=>x.name).sort();
 }catch{return [];}
};
function liveLock(path){
 const {data}=read(path);
 if(!Number.isSafeInteger(data?.pid)||data.pid<1)return false;
 try{process.kill(data.pid,0);return true;}catch(error){return error.code==='EPERM';}
}
function inspect(root,name){
 const dir=join(root,name),checkpoint=join(dir,'optimizer-state.json'),{data:state,error:stateError}=read(checkpoint);
 if(state?.schema==='uba-optimizer-state-v1'){
  const {data:lock}=read(join(dir,'optimizer-lock.json'));
  const cfg=lock?.configuration;
  const archive=Array.isArray(state.archive)?state.archive:[];
  const best=archive.filter(x=>Number.isFinite(x.fitness?.score))
   .sort((a,b)=>b.fitness.score-a.fitness.score)[0];
  const stage=state.complete?'complete':state.current?.stage==='refine'?'refine':state.current?.stage==='screen'?'screen':
   state.finalists?.length?'holdout':'awaiting next stage';
  const runDir=stage==='screen'||stage==='refine'?join(dir,stage,'g'+state.generation):
   stage==='holdout'?join(dir,'confirmation','trials'):null;
  const {data:progress,error:progressError}=runDir?read(join(runDir,'progress.json')):{data:null,error:null};
  const active=runDir&&liveLock(join(runDir,'.laboratory.lock'));
  const status=state.complete?'Complete':active?'Running':state.stopReason?'Paused: '+state.stopReason:'Pending';
  const phase=stage+(runDir?' · '+progressLabel(progress):'');
  const top=best?clean(describeCandidateConfiguration(best,cfg?.settings?.space,{short:true}))+' · '+score(best.fitness.score)+' · '+code(best.candidate?.id??best.candidate?.hash?.slice(0,12)):'—';
  const report=links(root,dir,['comparison.md','ranked.json','optimizer-state.json']);
  const body=[
   '### '+clean(name),'',
   '**Status:** '+clean(status)+'  ',
   '**Generation:** '+state.generation+(Number.isFinite(cfg?.settings?.generations)?' / '+cfg.settings.generations:'')+'  ',
   '**Stage:** '+clean(phase)+'  ',
   '**Evaluated candidates:** '+archive.length+'  ',
   '**Agent:** '+clean(cfg?.profile?.id??'unknown')+'  ',
   '**Checkpoint modified:** '+(mtime(checkpoint)??'unknown')+'  ',
   '**Last observed activity:** '+(dateFrom([checkpoint,runDir?join(runDir,'progress.json'):checkpoint])??'unknown')+'',''
  ];
  if(best){
   const solo=best.summary?.solo,duo=best.summary?.duo;
   body.push('**Provisional leader:** '+code(best.candidate?.id??best.candidate?.hash)+' · fitness '+score(best.fitness.score)+
    ' · solo '+percent(solo?.winRate)+' (n='+clean(solo?.n??0)+')'+
    ' · duo '+percent(duo?.winRate)+' (n='+clean(duo?.n??0)+').','');
  }
  if(!state.complete)body.push('**Interpretation:** provisional; candidates may have unequal trial counts and independent holdout may be pending.','');
  if(state.validation)body.push('**Validation:** '+(state.validation.complete?'completed':'incomplete')+'.','');
  if(progressError)body.push('**Warning:** '+progressError+'.','');
  const comparative=summarizeComparison(dir,{archive,complete:state.complete,baselineHash:cfg?.base?.hash});
  if(comparative)body.push('#### Comparative results','',...comparative.lines,'');
  body.push('**Files:** '+report,'');
  return {name,status,phase,top,report,body,priority:priority(status)};
 }
 const {data:manifest,error:manifestError}=read(join(dir,'manifest.json'));
 const {data:progress,error:progressError}=read(join(dir,'progress.json'));
 const {data:summary,error:summaryError}=read(join(dir,'summary.json'));
 const lab=manifest?.schema==='uba-laboratory-manifest-v1'||progress?.schema==='uba-progress-v1'||summary?.schema==='uba-laboratory-summary-v1';
 const conventional=['summary.md','comparison.md','report.md','summary.json','report.json','results.json'];
 const otherFiles=readableFiles(dir);
 const available=conventional.filter(f=>file(join(dir,f)));
 const recognized=lab||Boolean(available.length)||Boolean(otherFiles.length);
 const completed=recognizedStatus(summary);
 const counters=summary&&progressLabel(summary)!=='No progress recorded'?summary:progress;
 let status,phase;
 if(lab){
  status=liveLock(join(dir,'.laboratory.lock'))?'Running':completed?'Complete':
   summary?.stopReason?'Paused: '+summary.stopReason:'Pending / interrupted';
  phase=progressLabel(progress??summary);
 }else if(completed){
  status='Complete';
  phase=progressLabel(counters);
 }else if(summary?.status==='incomplete'||summary?.complete===false){
  status='Partial (source report)';
  phase=progressLabel(counters);
 }else{
  status=recognized?'Report available (state unknown)':'No recognized report';
  phase='Completion not recorded';
 }
 // Unknown study formats keep a useful link to their own output, rather
 // than incorrectly claiming that they completed all planned experiments.
 const files=lab?['summary.json','progress.json','manifest.json']:
  [...new Set([...conventional,...otherFiles])];
 const report=links(root,dir,files);
 const changed=dateFrom([...files.map(f=>join(dir,f)),join(dir,'manifest.json')]);
 const body=['### '+clean(name),'','**Status:** '+clean(status)+'  ','**Progress:** '+clean(phase)+'  ',
  '**Last report:** '+(changed??'unknown')+'  ','**Files:** '+report,''];
 const errors=[stateError,manifestError,progressError,summaryError].filter(Boolean);
 if(errors.length)body.push('**Warnings:** '+errors.join('; ')+'.','');
 const comparative=summarizeComparison(dir);
 if(comparative)body.push('#### Comparative results','',...comparative.lines,'');
 return {name,status,phase,top:comparative?.headline??'—',report,body,priority:priority(status)};

}
export function renderResultsStatus(root){
 const directory=resolve(root),dirs=existsSync(directory)?readdirSync(directory,{withFileTypes:true})
  .filter(x=>x.isDirectory()&&!x.name.startsWith('.')).map(x=>x.name).sort():[];
 const found=dirs.map(name=>inspect(directory,name)).sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name));
 const lines=[
  '# Results status','',
  'Updated '+new Date().toISOString()+'. Auto-generated; do not edit.','',
  'This consolidates checkpoint progress and comparative statistics without reading raw trials. Historical report formats may have unknown completion status; screening and model-agent results are not independent validation.','',
  '| Experiment | Status | Phase / trials | Best candidate · fitness | Report |',
  '|---|---|---|---|---|',
  ...found.map(x=>'| '+clean(x.name)+' | '+clean(x.status)+' | '+clean(x.phase)+' | '+x.top+' | '+x.report+' |'),''
 ];
 if(!found.length)lines.push('No experiment directories yet. Run an experiment to populate this index.','');
 // Every experiment gets its comparison summary, including historical runs.
 // STATUS.md should be usable without opening individual comparison files.
 for(const entry of found)lines.push(...entry.body);
 lines.push('---','','Regenerate manually: '+code('npm run results:status')+
  '. Optimizer/laboratory runs under '+code('results/')+' refresh this index automatically.','');
 return lines.join('\n');
}
export function resultsRootForOutput(out,{cwd=process.cwd()}={}){
 if(!out)return null;
 const root=resolve(cwd,'results'),path=resolve(out),rel=relative(root,path);
 return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))?root:null;
}
export function writeResultsStatus(root,{force=false,minIntervalMs=30_000}={}){
 const dir=resolve(root),path=join(dir,STATUS);
 mkdirSync(dir,{recursive:true});
 if(!force&&file(path)){
  const age=Date.now()-statSync(path).mtimeMs;
  if(age>=0&&age<minIntervalMs)return path;
 }
 const tmp=join(dir,'.STATUS.'+process.pid+'.'+Math.random().toString(16).slice(2)+'.tmp');
 try{writeFileSync(tmp,renderResultsStatus(dir),'utf8');renameSync(tmp,path);}
 finally{if(file(tmp))unlinkSync(tmp);}
 return path;
}
export function writeResultsStatusForOutput(out,opts={}){
 const root=resultsRootForOutput(out);
 return root?writeResultsStatus(root,opts):null;
}
