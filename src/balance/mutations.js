import {createCandidate} from './candidate.js';
import {compileCandidate} from './compiler.js';
import {contentHash,freezeData,canonicalJSON} from './goals.js';

const STAT_FIELDS={heroes:['hp','atk','def','wit'],monsters:['hp','atk','def','copies'],items:['copies'],warden:['hp','atk','def'],wardenFury:['hp','atk','def']};
const MAP_FIELDS={'item-healing':'itemHealing','monster-healing':'monsterHealing','room-rest-healing':'roomRestHealing','room-rest-cost':'roomRestCost'};
function cardsFor(pools,d){
 const pool=pools[d.collection],cards=Array.isArray(pool)?pool:[pool];
 return cards.filter(c=>c&&(!d.id||c.id===d.id)&&(!d.ids||d.ids.includes(c.id)));
}
export function validateSearchSpace(space,{base=createCandidate(),protectedCards=[]}={}){
 if(!Array.isArray(space)||!space.length||space.length>128)throw Error('Search needs 1..128 dimensions');
 const pools=compileCandidate(base),keys=new Set(),writes=new Set();
 for(const d of space){
  if(!d||typeof d.key!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(d.key))throw Error('Invalid search dimension key');
  if(keys.has(d.key))throw Error('Duplicate search gene '+d.key);keys.add(d.key);
  if(!Array.isArray(d.values)||!d.values.length||d.values.length>128||new Set(d.values.map(canonicalJSON)).size!==d.values.length)throw Error('Invalid bounded values '+d.key);
  const allowedKeys=new Set(['key','kind','values','collection','id','ids','field','offset','stage','from','to']);
  for(const key of Object.keys(d))if(!allowedKeys.has(key))throw Error('Unsupported search dimension property '+key);
  const targets=[];
  if(d.kind==='card-stat'){
   if(d.offset!==undefined&&typeof d.offset!=='boolean')throw Error('Invalid offset flag '+d.key);
   if(d.ids&&(!Array.isArray(d.ids)||!d.ids.length||new Set(d.ids).size!==d.ids.length))throw Error('Invalid search card ids '+d.key);
   if(!STAT_FIELDS[d.collection]?.includes(d.field)||d.values.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>100))throw Error('Unsupported printed stat search '+d.key);
   const cards=cardsFor(pools,d);if(!cards.length)throw Error('Missing card in search '+d.key);
   if(d.ids&&cards.length!==d.ids.length)throw Error('Missing search card id '+d.key);
   if(d.id&&d.ids)throw Error('Choose id or ids '+d.key);
   for(const c of cards){targets.push(d.collection+':'+c.id);const key=d.collection+':'+c.id+':'+d.field;if(writes.has(key))throw Error('Overlapping search dimensions '+key);writes.add(key);}
  }else if(d.kind==='room-transfer'){
   if(!['UPPER','MIDDLE','DEEP'].includes(d.stage)||d.from===d.to||d.values.some(v=>!Number.isSafeInteger(v)||v<0||v>12))throw Error('Invalid physical Room transfer '+d.key);
   // The target may be a canonical Room currently absent from Balanced B.
   if(!pools.rooms.some(c=>c.id===d.from&&c.stage===d.stage))throw Error('Missing Room transfer source '+d.from);
   targets.push('rooms:'+d.from,'rooms:'+d.to);
   if(writes.has('rooms:'+d.from))throw Error('Overlapping Room transfer sources');writes.add('rooms:'+d.from);
  }else if(MAP_FIELDS[d.kind]){
   if(typeof d.id!=='string'||d.values.some(v=>!(Number.isSafeInteger(v)&&v>=0&&v<=100)&&v!=='d6'))throw Error('Unsupported effect values '+d.key);
   const coll=d.kind.startsWith('item')?'items':d.kind.startsWith('monster')?'monsters':'rooms';
   targets.push(coll+':'+d.id);
   const key=d.kind+':'+d.id;if(writes.has(key))throw Error('Overlapping effect search '+key);writes.add(key);
  }else throw Error('Unsupported physical search dimension '+d.kind);
  if(targets.some(t=>protectedCards.includes(t)))throw Error('Search targets protected card '+targets.find(t=>protectedCards.includes(t)));
 }
 // Compile every individual allowed allele; cross-dimension conflicts are
 // rejected again when producing a joint candidate.
 for(const d of space)for(let i=0;i<d.values.length;i++){
  const single=candidateFromGenes({base,space:[d],genes:{[d.key]:i},validate:false});
  compileCandidate(single);
 }
 return freezeData(structuredClone(space));
}
export const randomGenes=(space,rng)=>Object.fromEntries(space.map(d=>[d.key,Math.floor(rng()*d.values.length)]));
export function mutateGenes(parent,space,rng,rate=0.3){
 const child={...parent},mutable=space.filter(d=>d.values.length>1);let changed=false;
 for(const d of mutable)if(rng()<rate){const old=child[d.key];child[d.key]=(old+1+Math.floor(rng()*(d.values.length-1)))%d.values.length;changed=true;}
 if(!changed&&mutable.length){const d=mutable[Math.floor(rng()*mutable.length)];child[d.key]=(child[d.key]+1)%d.values.length;}
 return child;
}
export const recombineGenes=(a,b,space,rng)=>Object.fromEntries(space.map(d=>[d.key,rng()<0.5?a[d.key]:b[d.key]]));
export function candidateFromGenes({base=createCandidate(),space,genes,validate=true}={}){
 const pools=compileCandidate(base),staging=structuredClone(base.staging??{});
 if(!genes||Object.keys(genes).some(k=>!space.some(d=>d.key===k)))throw Error('Unknown search gene');
 const edits=new Map((staging.cards??[]).map(e=>[e.collection+':'+e.id,e]));
 const roomSelections={};
 for(const d of space){
  const index=genes[d.key];if(!Number.isSafeInteger(index)||index<0||index>=d.values.length)throw Error('Out of bounds gene '+d.key);
  const value=d.values[index];
  if(d.kind==='card-stat')for(const card of cardsFor(pools,d)){
   const amount=d.offset?card[d.field]+value:value;
   if(amount===card[d.field])continue;
   const key=d.collection+':'+card.id,prior=edits.get(key)??{collection:d.collection,id:card.id,set:{}};
   prior.set[d.field]=amount;edits.set(key,prior);
  }else if(d.kind==='room-transfer'){
   if(!value)continue;
   const selected=roomSelections[d.stage]??=pools.rooms.filter(r=>r.stage===d.stage).map(r=>r.id);
   for(let i=0;i<value;i++){const at=selected.indexOf(d.from);if(at<0)throw Error('Not enough physical copies for '+d.key);selected[at]=d.to;}
  }else if(MAP_FIELDS[d.kind]){
   const field=MAP_FIELDS[d.kind];(staging[field]??={})[d.id]=value;
  }else throw Error('Unsupported physical search dimension '+d.kind);
 }
 if(edits.size)staging.cards=[...edits.values()].sort((a,b)=>(a.collection+':'+a.id).localeCompare(b.collection+':'+b.id));
 for(const [stage,selection] of Object.entries(roomSelections)){
  (staging.roomDeck??={})[stage]={selection:selection.sort()};
 }
 const candidate=createCandidate({id:'uba-'+contentHash({base:base.hash,genes}).slice(0,16),base:base.base,staging,additions:base.additions??[]});
 if(validate)compileCandidate(candidate);
 return candidate;
}
export function factorialCandidates({base=createCandidate(),space,maxCandidates=1024}={}){
 validateSearchSpace(space,{base});
 if(space.reduce((n,d)=>n*d.values.length,1)>maxCandidates)throw Error('Factorial exceeds candidate cap');
 const out=[];
 const visit=(i,genes)=>{if(i===space.length){out.push(candidateFromGenes({base,space,genes}));return;}const d=space[i];for(let j=0;j<d.values.length;j++)visit(i+1,{...genes,[d.key]:j});};
 visit(0,{});return out;
}
