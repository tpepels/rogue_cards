import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import defaults from '../../experiments/balance-goals.json' with {type:'json'};

export function canonicalJSON(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
}
export const contentHash=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
export function freezeData(value){
 if(value&&typeof value==='object'){
  for(const v of Object.values(value))freezeData(v);
  Object.freeze(value);
 }
 return value;
}
export function validateGoals(input){
 const g=structuredClone(input);
 if(g?.schema!=='uba-goals-v1'||g.base!=='balanced-recovery-v1')throw Error('Unsupported balance goals edition/schema');
 for(const k of ['id','objectives','constraints','validation','search','denominators'])
  if(!g[k])throw Error('Missing goals '+k);
 const required=Object.keys(defaults.objectives);
 if(Object.keys(g.objectives).some(k=>!required.includes(k)))throw Error('Unknown objective');
 for(const key of required){
  const o=g.objectives[key];
  if(!o||!Array.isArray(o.range)||o.range.length!==2||o.range.some(n=>!Number.isFinite(n))||o.range[0]>o.range[1])throw Error('Invalid objective range '+key);
  if(!Number.isFinite(o.weight)||o.weight<0)throw Error('Invalid objective weight '+key);
  if(o.target!==undefined&&(!Number.isFinite(o.target)||o.target<o.range[0]||o.target>o.range[1]))throw Error('Invalid target '+key);
 }
 if(g.constraints.postCombatHeal!==0)throw Error('Physical candidates cannot have postCombatHeal');
 if(!Number.isSafeInteger(g.constraints.maxPhysicalChanges)||g.constraints.maxPhysicalChanges<0)throw Error('Invalid maxPhysicalChanges');
 for(const key of ['requireAllHeroes','requireAllPairs'])if(typeof g.constraints[key]!=='boolean')throw Error(key+' must be boolean');
 if(typeof g.validation.requireTargetIntervals!=='boolean')throw Error('requireTargetIntervals must be boolean');
 for(const key of ['minimumHeroWinRate','minimumPairWinRate'])
  if(!Number.isFinite(g.constraints[key])||g.constraints[key]<0||g.constraints[key]>1)throw Error('Invalid constraint '+key);
 for(const key of ['minTrialsPerParty','minVaultEntriesPerSize','minIndependentSeeds'])
  if(!Number.isSafeInteger(g.validation[key])||g.validation[key]<1)throw Error('Invalid '+key);
 if(!(g.validation.confidence>0.5&&g.validation.confidence<1))throw Error('Invalid confidence');
 if(g.validation.multipleComparisons!=='bonferroni')throw Error('Unsupported multiple comparisons method');
 if(!Array.isArray(g.validation.profiles)||new Set(g.validation.profiles).size!==g.validation.profiles.length||g.validation.profiles.length<2||g.validation.profiles.some(p=>typeof p!=='string'))throw Error('Validation requires multiple distinct fixed profiles');
 if(!Number.isFinite(g.validation.maxWinRegression)||g.validation.maxWinRegression<0||g.validation.maxWinRegression>1)throw Error('Invalid regression tolerance');
 for(const key of ['population','generations','screenRuns','refineRuns','finalists','holdoutRuns'])
  if(!Number.isSafeInteger(g.search[key])||g.search[key]<1)throw Error('Invalid search '+key);
 for(const key of ['mutationRate','randomFraction'])if(!(g.search[key]>=0&&g.search[key]<=1))throw Error('Invalid search '+key);
 if(!Array.isArray(g.search.space)||!g.search.space.length)throw Error('Empty search space');
 delete g.hash;
 g.hash=contentHash(g);
 return freezeData(g);
}
export const DEFAULT_GOALS=validateGoals(defaults);
export const loadGoals=path=>path?validateGoals(JSON.parse(readFileSync(path,'utf8'))):DEFAULT_GOALS;
