/** Summarize existing experiment comparisons without reading raw trial records. */
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
const MAX_FILE=12*1024*1024;
const readText=path=>{try{const s=statSync(path);return s.isFile()&&s.size<=MAX_FILE?readFileSync(path,'utf8'):null;}catch{return null;}};
const readJSON=path=>{const s=readText(path);try{return s===null?null:JSON.parse(s);}catch{return null;}};
const clean=v=>String(v??'—').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
const num=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'—';
const pct=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
const ci=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)?' ['+pct(v[0])+'–'+pct(v[1])+']':'';
const label=e=>e.candidate?.id??e.candidate?.hash?.slice(0,16)??'unknown';
const wins=s=>pct(s?.winRate)+ci(s?.winCI)+' (n='+clean(s?.n??'—')+')';

const value=v=>v===undefined?'(absent)':JSON.stringify(v);
const signed=v=>Number.isFinite(v)&&v>0?'+'+v:String(v);
function describeParameter(d,chosen){
 if(d.kind==='room-transfer')return d.stage+' '+d.from+' → '+d.to+': '+chosen+' physical Room'+(chosen===1?'':'s');
 if(d.kind==='card-stat'){
  const target=d.id??(d.ids?.join(', ')??'all '+d.collection);
  return target+' '+d.field+(d.offset?' '+signed(chosen)+' (offset)':' = '+value(chosen));
 }
 const effect={'item-healing':'item healing','monster-healing':'Monster healing','room-rest-healing':'Room rest healing','room-rest-cost':'Room rest cost'}[d.kind];
 return (effect??d.key)+' '+(d.id??'')+': '+value(chosen);
}
function parameterSettings(entry,space){
 if(entry?.genes===null)return ['Unchanged canonical baseline'];
 if(!entry?.genes||!Array.isArray(space)||!space.length)return [];
 return space.map(d=>{
  const i=entry.genes[d.key];
  return Number.isSafeInteger(i)&&i>=0&&i<d.values.length?
   d.key+' = '+value(d.values[i])+' ('+describeParameter(d,d.values[i])+')':
   d.key+' = unavailable';
 });
}
function leafChanges(before,after,path=''){
 if(JSON.stringify(before)===JSON.stringify(after))return [];
 const objects=(x)=>x!==null&&typeof x==='object';
 if(objects(before)&&objects(after)&&Array.isArray(before)===Array.isArray(after)){
  const keys=Array.isArray(before)?Array.from({length:Math.max(before.length,after.length)},(_,i)=>i):
   [...new Set([...Object.keys(before),...Object.keys(after)])].sort();
  return keys.flatMap(k=>leafChanges(before[k],after[k],path+(typeof k==='number'?'['+k+']':(path?'.':'')+k)));
 }
 return [path+': '+value(before)+' → '+value(after)];
}
function printedChanges(entry){
 if(!Array.isArray(entry?.diff?.changes))return null;
 if(!entry.diff.changes.length)return ['No changes to the printed deck'];
 return entry.diff.changes.map(change=>{
  const before=change.before,after=change.after;
  const card=after?.card??before?.card??{},name=card.title??change.id??'unknown card';
  const id=(change.type??'card')+':'+(change.id??'unknown');
  if(!before||!after){
   const previous=before?.copies??0,current=after?.copies??0;
   return name+' ['+id+']: copies '+previous+' → '+current+
    (after&&!before?' (new card; full definition in candidate manifest)':' (removed)');
  }
  const details=[];
  if(before.copies!==after.copies)details.push('copies '+before.copies+' → '+after.copies);
  for(const field of change.fields??[]){
   if(field.path==='copies')continue;
   details.push(...leafChanges(field.before,field.after,field.path));
  }
  return name+' ['+id+']: '+(details.join('; ')||'modified (no field diff available)');
 });
}
export function describeCandidateConfiguration(entry,space,{short=false}={}){
 const parameters=parameterSettings(entry,space);
 const changes=printedChanges(entry);
 if(short){
  if(entry?.genes===null)return 'canonical (unchanged)';
  const changed=Array.isArray(space)&&entry?.genes?space.filter(d=>{
   const i=entry.genes[d.key];
   const n=d.values?.[i];
   return Number.isSafeInteger(i)&&
    ((d.kind==='room-transfer'||d.offset)?n!==0:true);
  }).map(d=>describeParameter(d,d.values[entry.genes[d.key]])):[];
  if(changed.length)return changed.slice(0,3).join(', ')+(changed.length>3?' (+'+(changed.length-3)+' more)':'');
  if(changes?.length)return changes[0].slice(0,90)+(changes.length>1?' (+'+(changes.length-1)+' cards)':'');
  return 'configuration unavailable';
 }
 return {parameters,changes};
}

function uba(entries,{baselineHash,complete,origin,space}){
 const ranked=entries.filter(e=>e?.summary&&Number.isFinite(e.fitness?.score))
  .sort((a,b)=>b.fitness.score-a.fitness.score);
 if(!ranked.length)return null;
 const baseline=ranked.find(e=>e.candidate?.hash===baselineHash);
 const top=ranked;
 const lines=['**Source:** '+origin+'. '+(complete?'Optimizer completed.':'Provisional optimizer results.'),'',
  '| Candidate | Configuration | Solo wins (95% CI) | Duo wins (95% CI) | Solo Vault | Win given Vault | Encounters/36 | Fight conversion | Fitness | Constraint flags |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---|'];
 for(const e of top){
  const s=e.summary.solo||{},d=e.summary.duo||{},v=e.fitness.values||{};
  const flags=e.fitness.violations?.map(x=>x.code).filter(Boolean).join(', ')||'none recorded';
  lines.push('| '+clean(label(e))+(e===baseline?' (baseline)':'')+
   ' | '+clean(describeCandidateConfiguration(e,space,{short:true}))+' | '+wins(s)+' | '+wins(d)+' | '+pct(s.vaultRate)+' | '+pct(s.conditionalWin)+
   ' | '+num(v.encounters36)+' | '+pct(v.fightConversion)+
   ' | '+num(e.fitness.score,3)+' | '+clean(flags)+' |');
 }
 lines.push('','All '+ranked.length+' scored candidates are included above; configuration details and all Hero/pair strata follow.','');
 const best=ranked[0],s=best.summary.solo||{},d=best.summary.duo||{},v=best.fitness.values||{};
 lines.push('','**Top fitness:** '+clean(describeCandidateConfiguration(best,space,{short:true}))+
  ' ('+clean(label(best))+', fitness '+num(best.fitness.score,3)+')'+
  ' · solo '+pct(s.winRate)+' (n='+clean(s.n??0)+')'+
  ' · duo '+pct(d.winRate)+' (n='+clean(d.n??0)+')'+
  ' · encounters/36 '+num(v.encounters36)+' · fights '+pct(v.fightConversion)+'.');
 if(baseline&&baseline!==best){
  const b=baseline.summary;
  if([s.winRate,d.winRate,b.solo?.winRate,b.duo?.winRate].every(Number.isFinite)){
   const pp=x=>(x>=0?'+':'')+num(x*100,1)+' pp';
   lines.push('**Descriptive change vs baseline:** solo '+pp(s.winRate-b.solo.winRate)+
    ', duo '+pp(d.winRate-b.duo.winRate)+
    '. These rate differences are not paired causal estimates.');
  }
 }

 lines.push('','**Exact candidate configurations (all '+ranked.length+' evaluated candidates)**','',
  'Parameter values are the optimizer search settings; printed changes show the actual card properties, including before → after. Candidate IDs remain for reproducibility.','');
 for(const entry of ranked){
  const config=describeCandidateConfiguration(entry,space);
  lines.push('**'+clean(label(entry))+'** · fitness '+num(entry.fitness.score,3),'');
  if(config.parameters.length)lines.push('Parameters: '+config.parameters.map(x=>clean(x)).join('; ')+'.','');
  else lines.push('Parameters: not recorded in the available optimizer metadata.','');
  if(config.changes===null)lines.push('Printed changes: unavailable in the saved comparison.','');
  else for(const change of config.changes)lines.push('- '+change);
  lines.push('','**Individual Hero and duo outcomes from the committed checkpoint**','','| Hero or duo | n | Wins | Win (95% CI) | Vault |',
   '|---|---:|---:|---:|---:|');
  for(const party of [...(entry.summary?.solo?.byParty??[]),...(entry.summary?.duo?.byParty??[])])
   lines.push('| '+clean(party.party)+' | '+(party.n??'—')+' | '+(party.wins??'—')+
    ' | '+pct(party.winRate)+ci(party.winCI)+' | '+pct(party.vaultRate)+' |');
  lines.push('','**Committed metrics:** solo n '+clean(entry.summary?.solo?.n)+', duo n '+clean(entry.summary?.duo?.n)+
   '; damage/run solo '+num(entry.summary?.solo?.damage)+', duo '+num(entry.summary?.duo?.damage)+
   '; healing restored/run solo '+num(entry.summary?.solo?.healingRestored)+', duo '+num(entry.summary?.duo?.healingRestored)+
   '; wasted healing solo '+num(entry.summary?.solo?.healingWasted)+', duo '+num(entry.summary?.duo?.healingWasted)+
   '; solo win after Vault '+pct(entry.summary?.solo?.conditionalWin)+
   '; Warden combat wins/starts solo '+clean(entry.summary?.solo?.wardenCombatWins)+'/'+clean(entry.summary?.solo?.wardenFightStarts)+
   ', duo '+clean(entry.summary?.duo?.wardenCombatWins)+'/'+clean(entry.summary?.duo?.wardenFightStarts)+'.','');
  lines.push('');
 }

 lines.push('Screening and refinement samples may differ; independent holdout confirmation is needed before adopting changes.');
 return {lines,headline:'solo '+pct(s.winRate)+' · duo '+pct(d.winRate)+' · encounters '+num(v.encounters36)};
}
function extractTables(markdown){
 const lines=markdown.split(/\r?\n/),out=[];
 let main='Overview',sub='',fenced=false;
 const divider=line=>/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
 for(let i=0;i<lines.length;i++){
  const line=lines[i],trim=line.trim();
  if(trim.startsWith(String.fromCharCode(96).repeat(3))||trim.startsWith('~~~')){fenced=!fenced;continue;}
  if(fenced)continue;
  const m=line.match(/^(#{1,5})\s+(.+)$/);
  if(m){if(m[1].length<=2){main=m[2];sub='';}else sub=m[2];}
  if(!trim.startsWith('|')||!divider(lines[i+1]??''))continue;
  const header=line,separator=lines[++i],body=[];
  while(i+1<lines.length&&lines[i+1].trim().startsWith('|'))body.push(lines[++i]);
  if(!/win|vault|encounter|score|damage|survival|time|hp|heal|fight|result|trial|lift|rate|coverage|room|decision|puct|selection|outcome/i.test(header))continue;
  const priority=(/confirm|held.out|validation/i.test(main)?35:0)+
   (/screen|initial/i.test(main)?8:0)+
   (/candidate|hypothesis|arm|variant/i.test(header)?16:0)+
   (/wins|win rate|vault|encounter|lift/i.test(header)?8:0)+
   (/paired|difference|interaction/i.test(sub+' '+header)?5:0);
  out.push({main,sub,header,separator,body,priority,index:out.length});
 }
 return out;
}
function markdownComparison(markdown){
 const tables=extractTables(markdown);
 if(!tables.length)return null;
 const chosen=[...tables].sort((a,b)=>b.priority-a.priority||a.index-b.index).slice(0,6)
  .sort((a,b)=>a.index-b.index),out=['**Comparison statistics (selected source tables):**',''];
 const status=markdown.match(/^Status:\s*.+$/m);
 if(status)out.push(clean(status[0]),'');
 for(const t of chosen){
  out.push('**'+clean(t.main+(t.sub?' · '+t.sub:''))+'**','',t.header,t.separator);
  const rows=t.body.slice(0,7);
  const control=t.body.find(x=>/\|\s*(?:baseline|canonical|control|reference)(?:\s|\|)/i.test(x));
  if(control&&!rows.includes(control))rows.push(control);
  out.push(...rows,'');
  if(t.body.length>rows.length)out.push((t.body.length-rows.length)+' further rows omitted from this table.','');
 }
 if(tables.length>chosen.length)out.push((tables.length-chosen.length)+' additional source tables omitted.','');
 const canonical=markdown.match(/^Canonical:\s*.+$/gm);
 if(canonical?.length)out.push('**Canonical references:**',...canonical.slice(0,3).map(x=>'- '+x),'');
 return {lines:out,headline:null};
}
function mctsSummary(summary){
 const data=summary?.byBudget;
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const out=['**Search comparisons by budget (from summary.json):**','',
  '| Budget | Arm | Trials | Win (95% CI) | Vault | Search / run |',
  '|---:|---|---:|---:|---:|---:|'];
 let count=0;
 for(const [budget,groups]of Object.entries(data)){
  if(!Array.isArray(groups))continue;
  for(const g of groups.slice(0,8)){
   out.push('| '+clean(budget)+' | '+clean(g.arm??g.id)+' | '+clean(g.n??'—')+
    ' | '+pct(g.winRate)+ci(g.winWilson95)+' | '+pct(g.vaultRate)+
    ' | '+(Number.isFinite(g.meanSearchSeconds)?num(g.meanSearchSeconds,1)+' s':'—')+' |');
   count++;
  }
  if(groups.length>8)out.push('','Other arms for budget '+clean(budget)+': '+(groups.length-8)+'.','');
 }
 return count?{lines:out,headline:null}:null;
}
export function summarizeComparison(dir,{archive=[],complete=false,baselineHash=null}={}){
 const json=readJSON(join(dir,'comparison.json'));
 const recent=Array.isArray(archive)&&archive.some(e=>e?.summary&&e?.fitness);
 const selection=recent?archive:json?.schema==='uba-comparison-v1'?json.entries:null;
 if(Array.isArray(selection)){
  const locked=readJSON(join(dir,'optimizer-lock.json'));
  const result=uba(selection,{complete,baselineHash:baselineHash??json?.baselineHash,
   space:locked?.configuration?.settings?.space??json?.space,
   origin:recent?'latest optimizer checkpoint (including saved refinements)':'comparison.json'});
  if(result)return result;
 }
 const markdown=readText(join(dir,'comparison.md'));
 if(markdown!==null){
  const report=markdownComparison(markdown);
  if(report)return report;
 }
 const summary=readJSON(join(dir,'summary.json'));
 return mctsSummary(summary);
}
