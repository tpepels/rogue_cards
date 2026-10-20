import {createCandidate,isBalanceCandidate} from './candidate.js';
import {compileCandidateData} from './validator.js';
import {BASELINE_MANIFEST,deepFreeze,stableStringify} from './baseline.js';

const cache=new WeakMap();
export function compileCandidate(candidate=createCandidate()){
 const trusted=isBalanceCandidate(candidate);
 if(trusted&&cache.has(candidate))return cache.get(candidate);
 const checked=trusted?candidate:createCandidate(candidate);
 const pools=compileCandidateData(checked);
 if(trusted)cache.set(candidate,pools);
 return pools;
}
/** Rooms are already physical repetitions; all other pools are definitions. */
export function printableDeck(candidate=createCandidate()){
 const p=compileCandidate(candidate);
 const definitions=[...p.heroes,p.vault,p.warden,p.wardenFury,...p.monsters,...p.items];
 return Object.freeze([...definitions.flatMap(card=>Array.from({length:card.copies},()=>card)),...p.rooms]);
}
function summary(cards){
 const map=new Map();
 for(const c of cards){const key=c.type+':'+c.id;
  const row=map.get(key);if(row)row.copies++;
  else {const {copies,_stagedCard,...definition}=c;map.set(key,{id:c.id,type:c.type,copies:1,card:definition});}
 }
 return map;
}
let reference;
export function printableDiff(candidate=createCandidate()){
 const checked=createCandidate(candidate),before=reference??=summary(printableDeck(createCandidate())),
  after=summary(printableDeck(checked));
 const changes=[];
 for(const key of [...new Set([...before.keys(),...after.keys()])].sort()){
  const a=before.get(key),b=after.get(key);
  if(stableStringify(a)===stableStringify(b))continue;
  const fields=[];
  if(a&&b){
   if(a.copies!==b.copies)fields.push({path:'copies',before:a.copies,after:b.copies});
   for(const field of [...new Set([...Object.keys(a.card),...Object.keys(b.card)])].sort())
    if(stableStringify(a.card[field])!==stableStringify(b.card[field]))
     fields.push({path:field,before:a.card[field]??null,after:b.card[field]??null});
  }
  changes.push({kind:!a?'added':!b?'removed':'changed',id:(b??a).id,type:(b??a).type,
   before:a??null,after:b??null,fields});
 }
 return deepFreeze({schema:'uba-printable-diff-v1',base:checked.base,
  baselineFingerprint:BASELINE_MANIFEST.fingerprint,candidateId:checked.id,
  candidateHash:checked.hash,changes});
}
/** Copy churn plus changed existing printed definitions, relative to the
 * canonical edition. Search, validation and impact use this same unit. */
export function physicalChangeCount(candidate=createCandidate()){
 return printableDiff(candidate).changes.reduce((n,c)=>n+
  Math.abs((c.after?.copies??0)-(c.before?.copies??0))+
  Number(!!c.before&&!!c.after&&c.fields.some(f=>f.path!=='copies')),0);
}
