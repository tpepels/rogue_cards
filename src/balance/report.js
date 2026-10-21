import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pairedComparison,mean} from './statistics.js';
import {writeJSON} from './artifacts.js';
import {describeCandidateConfiguration} from './comparison-summary.js';

const pct=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'unknown';
const num=value=>Number.isFinite(value)?value.toFixed(2):'unknown';
const ci=value=>value?value.map(pct).join(' – '):'unknown';
export function comparisonReport(entries,{title='Ultimate Balance Act',complete=true,baselineHash,validation=null,space=null}={}){
 const lines=['# '+title,'',complete?'Planned trials complete.':'**PARTIAL: pending trials remain.**','',
  'Results describe fixed simulated agents. No canonical cards were adopted. Human play duration and enjoyment require playtest input.','',
  '| Candidate | n solo / duo | Solo wins (95%) | Vault | Win after Vault | Duo wins (95%) | Encounters /36 | Fight conversion | Score |',
  '|---|---:|---|---:|---:|---|---:|---:|---:|'];
 for(const e of entries){const s=e.summary.solo,d=e.summary.duo;lines.push('| '+(e.candidate.id??e.candidate.hash.slice(0,12))+' | '+s.n+' / '+d.n+' | '+pct(s.winRate)+' ('+ci(s.winCI)+') | '+pct(s.vaultRate)+' | '+pct(s.conditionalWin)+' | '+pct(d.winRate)+' ('+ci(d.winCI)+') | '+num(e.fitness.values.encounters36)+' | '+pct(e.fitness.values.fightConversion)+' | '+num(e.fitness.score)+' |');}
 const baseline=entries.find(e=>e.candidate.hash===baselineHash);
 for(const e of entries){
  lines.push('','## '+e.candidate.id,'','Candidate hash: `'+e.candidate.hash+'`','',
   'Observed complete-36 encounters: solo '+num(e.summary.solo.complete36Encounters)+' ('+e.summary.solo.complete36Runs+' runs), duo '+num(e.summary.duo.complete36Encounters)+' ('+e.summary.duo.complete36Runs+' runs). Normalized rates in the table also include shorter expeditions.','',
   'Warden combat wins/starts: '+e.summary.solo.wardenCombatWins+'/'+e.summary.solo.wardenFightStarts+' solo; '+e.summary.duo.wardenCombatWins+'/'+e.summary.duo.wardenFightStarts+' duo. SEAL wins/attempts: '+e.summary.solo.sealWins+'/'+e.summary.solo.sealAttempts+' solo; '+e.summary.duo.sealWins+'/'+e.summary.duo.sealAttempts+' duo.','',
   'Healing restored/wasted per run: '+num(e.summary.solo.healingRestored)+' / '+num(e.summary.solo.healingWasted)+' solo; '+num(e.summary.duo.healingRestored)+' / '+num(e.summary.duo.healingWasted)+' duo.','');
  const configuration=describeCandidateConfiguration(e,space);
  lines.push('**Search configuration:**','',...(configuration.parameters.length?configuration.parameters.map(x=>'- '+x):['- Search parameter values unavailable for this historical report.']),'',
    '**Exact printed card changes:**','',...(configuration.changes??['Not available in the saved diff.']).map(x=>'- '+x),'');
  if(e.summary.profiles.length>1){
   lines.push('Multiple agent profiles: pooled rates above are descriptive; optimization is disabled for mixed profiles.','',
    '| Fixed profile | Solo n / win | Duo n / win |','|---|---:|---:|');
   for(const [hash,p]of Object.entries(e.summary.byProfile))lines.push('| '+(p.profileId??hash.slice(0,12))+' | '+p.solo.n+' / '+pct(p.solo.winRate)+' | '+p.duo.n+' / '+pct(p.duo.winRate)+' |');
  }
  if(baseline&&e!==baseline){
   lines.push('Differences from baseline (descriptive; independent confirmation follows selection):','');
   for(const key of e.fitness.keys){const a=baseline.fitness.values[key],b=e.fitness.values[key];if(Number.isFinite(a)&&Number.isFinite(b))lines.push('- '+key+': '+num(a)+' → '+num(b)+' ('+(b-a>=0?'+':'')+num(b-a)+').');}
   if(e.rows&&baseline.rows){const paired=pairedComparison(baseline.rows,e.rows,'won');lines.push('','Paired overall victory difference: '+num(paired.difference)+'; interval '+(paired.interval?paired.interval.map(num).join(' to '):'unknown')+' ('+paired.pairs+' paired initial seeds).');}
  }
  if(e.fitness.violations.length)lines.push('','Constraints/safeguards: '+e.fitness.violations.map(v=>v.code).join(', ')+'.');
  if(e.fitness.missingMetrics.length)lines.push('','Unobserved metrics: '+e.fitness.missingMetrics.join(', ')+'.');
  lines.push('','| Hero or pair | n | Win | Vault |','|---|---:|---:|---:|');
  for(const p of [...e.summary.solo.byParty,...e.summary.duo.byParty])lines.push('| '+p.party+' | '+p.n+' | '+pct(p.winRate)+' | '+pct(p.vaultRate)+' |');
  if(e.diff)lines.push('','Printable changes (full physical deck and source/stage metrics are in JSON):','','```json',JSON.stringify(e.diff,null,2),'```');
 }
 if(validation)for(const e of validation.entries??[])lines.push('','## Independent confirmation: '+e.candidate.id,'',e.assessment.status.toUpperCase(),'',...[...e.assessment.failures,...e.assessment.reasons].map(s=>'- '+s));
 lines.push('','Trade-offs above are measured associations for whole configurations. Factorial contrasts can estimate interactions; isolated causes require matched interventions.','');
 return lines.join('\n');
}
/** Unreplicated effects are explicitly descriptive: no invented p-values. */
export function factorialContrasts({candidates,rows,space,metric='won'}){
 const levels=new Map(candidates.map((c,i)=>[c.hash,i])),cells=new Map();
 for(const c of candidates)cells.set(c.hash,mean(rows.filter(r=>r.candidateHash===c.hash).map(r=>r[metric]).filter(Number.isFinite)));
 const decode=i=>{const out=[];for(let k=space.length-1;k>=0;k--){out[k]=i%space[k].values.length;i=Math.floor(i/space[k].values.length);}return out;};
 const contrast=indices=>{
  const plus=[],minus=[];
  for(const [hash,i] of levels){const value=cells.get(hash);if(value===null)continue;const signs=decode(i);let sign=1;for(const k of indices)sign*=signs[k]===0?-1:1;(sign>0?plus:minus).push(value);}
  return plus.length&&minus.length?mean(plus)-mean(minus):null;
 };
 if(space.some(d=>d.values.length!==2))throw Error('Factorial contrasts currently require two levels per dimension');
 const effects=space.map((d,i)=>({dimensions:[d.key],difference:contrast([i])}));
 for(let i=0;i<space.length;i++)for(let j=i+1;j<space.length;j++)effects.push({dimensions:[space[i].key,space[j].key],difference:contrast([i,j])});
 if(space.length===3)effects.push({dimensions:space.map(d=>d.key),difference:contrast([0,1,2])});
 return {schema:'uba-factorial-contrasts-v1',metric,effects,
  interpretation:'Descriptive orthogonal contrast: mean positive-sign cells minus mean negative-sign cells. An interaction contrast is half the usual two-factor difference-in-differences. Confirmation requires independent replication.'};
}
export function saveComparison(out,entries,options={}){
 mkdirSync(out,{recursive:true});
 writeJSON(join(out,'comparison.json'),{schema:'uba-comparison-v1',...options,entries:entries.map(({rows,...e})=>e)});
 writeFileSync(join(out,'comparison.md'),comparisonReport(entries,options));
}
