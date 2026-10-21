/** Read-only view of completed UBA trials while a laboratory is still writing.
 * Never use readTrialRecords here: its recovery path may truncate a live file.
 * All statistics are descriptive. Selection fitness/holdout remain checkpointed.
 */
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {hashValue} from './io.js';
import {wilsonInterval} from './statistics.js';

const sum=(rows,key)=>rows.reduce((n,r)=>n+(Number.isFinite(r[key])?r[key]:0),0);
const ratio=(a,b)=>b>0?a/b:null;
const number=(rows,key)=>rows.length&&rows.every(r=>Number.isFinite(r[key]));
export function readLiveTrialRows(dir){
 const manifestPath=join(dir,'manifest.json'),trialsPath=join(dir,'trials.ndjson');
 if(!existsSync(manifestPath))return {rows:[],planned:null,profiles:[],warning:'No laboratory manifest yet'};
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 if(manifest.schema!=='uba-laboratory-manifest-v1'||!Array.isArray(manifest.plan?.tasks))
  return {rows:[],planned:null,profiles:[],warning:'Unrecognized laboratory manifest'};
 const tasks=new Map(manifest.plan.tasks.map(task=>[task.id,task]));
 if(!existsSync(trialsPath))return {rows:[],planned:tasks.size,profiles:[],warning:null};
 // A concurrent writer may leave a final partial line in the snapshot.
 const contents=readFileSync(trialsPath,'utf8'),end=contents.lastIndexOf('\n');
 const lines=end<0?[]:contents.slice(0,end).split('\n');
 const rows=[],seen=new Set();
 for(const [index,line] of lines.entries()){
  if(!line)continue;
  let record;
  try{record=JSON.parse(line);}catch{return {rows:[],planned:tasks.size,profiles:[],warning:'Unreadable complete trial record at line '+(index+1)};}
  const row=record?.row,task=tasks.get(row?.id);
  if(record.schema!=='uba-trial-record-v1'||!row||!task||
    record.checksum!==hashValue(row)||seen.has(row.id)||
    row.candidateHash!==task.candidateHash||row.profileHash!==task.profileHash||
    row.party!==task.party||row.seed!==task.seed||row.split!==task.split||
    !['win','death','escape'].includes(row.ending)||Boolean(row.won)!==(row.ending==='win'))
   return {rows:[],planned:tasks.size,profiles:[],warning:'Invalid or mismatched trial record at line '+(index+1)};
  seen.add(row.id);rows.push(row);
 }
 return {rows,planned:tasks.size,profiles:[...new Set(rows.map(row=>row.profileId??row.profile).filter(Boolean))],
  warning:end===contents.length-1?null:'An unfinished trailing trial write was ignored'};
}
export function summarizeLiveRows(rows){
 const byParty=[...new Set(rows.map(r=>r.party))].sort().map(party=>{
  const rs=rows.filter(r=>r.party===party),n=rs.length,wins=sum(rs,'won'),vault=sum(rs,'vaultReached');
  return {party,n,wins,winRate:ratio(wins,n),winCI:wilsonInterval(wins,n),vaultRate:ratio(vault,n)};
 });
 const n=rows.length,wins=sum(rows,'won'),vault=sum(rows,'vaultReached'),encounters=number(rows,'ordinaryEncounters')?sum(rows,'ordinaryEncounters'):null,
  fights=number(rows,'ordinaryFights')?sum(rows,'ordinaryFights'):null;
 const roomRows=rows.filter(r=>Number.isFinite(r.roomsCleared)&&r.roomsCleared>0&&Number.isFinite(r.ordinaryEncounters));
 return {n,wins,winRate:ratio(wins,n),winCI:wilsonInterval(wins,n),vaultRate:ratio(vault,n),
  conditionalWin:ratio(sum(rows.filter(r=>r.vaultReached),'won'),vault),
  encounters36:ratio(roomRows.reduce((x,r)=>x+r.ordinaryEncounters*36/r.roomsCleared,0),roomRows.length),
  fightConversion:encounters===null||fights===null?null:ratio(fights,encounters),
  damagePerRun:number(rows,'damage')?ratio(sum(rows,'damage'),n):null,
  healingRestoredPerRun:number(rows,'healingRestored')?ratio(sum(rows,'healingRestored'),n):null,
  healingWastedPerRun:number(rows,'healingWasted')?ratio(sum(rows,'healingWasted'),n):null,
  byParty};
}
export const mergeDistinctTrials=(oldRows,newRows)=>[...new Map([...oldRows,...newRows].map(r=>[[r.candidateHash,r.profileHash,r.party,r.seed].join('|'),r])).values()];
