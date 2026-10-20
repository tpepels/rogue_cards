import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCandidate} from './candidate.js';
import {getAgentProfile} from './profiles.js';
import {ALL_PARTIES} from './runner.js';

export function parseArguments(argv,allowed,booleans=[]){
 const result={};
 for(let i=0;i<argv.length;i++){
  const key=argv[i];
  if(!allowed.includes(key)||Object.hasOwn(result,key))throw Error('Unknown/duplicate option '+key);
  if(booleans.includes(key)){result[key]=true;continue;}
  if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+key);
  result[key]=argv[++i];
 }
 return result;
}
export function positiveNumber(value,fallback,name,{integer=false,zero=false}={}){
 const n=value===undefined?fallback:Number(value);
 if(!Number.isFinite(n)||(zero?n<0:n<=0)||(integer&&!Number.isSafeInteger(n)))throw Error('Invalid '+name);
 return n;
}
export const loadJSON=path=>JSON.parse(readFileSync(resolve(path),'utf8'));
export function loadCandidate(base='balanced-recovery-v1'){
 if(['balanced-recovery-v1','balanced-b'].includes(base))return createCandidate();
 return createCandidate(loadJSON(base));
}
export const loadProfile=value=>getAgentProfile(value?.endsWith('.json')?loadJSON(value):value??'reference-v1');
export function selectParties(value='all'){
 if(value==='all')return ALL_PARTIES;
 if(value==='solo')return ALL_PARTIES.filter(p=>p.length===1);
 if(value==='duo')return ALL_PARTIES.filter(p=>p.length===2);
 const selected=value.split(',').map(p=>p.split('+'));
 for(const p of selected)if(!ALL_PARTIES.some(a=>[...a].sort().join('+')===[...p].sort().join('+')))throw Error('Unknown party '+p.join('+'));
 return selected;
}
