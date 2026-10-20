import {BASELINE_ID,contentHash,deepFreeze} from './baseline.js';
import {normalizeCandidateSpec} from './validator.js';
const trustedCandidates=new WeakSet();
export const isBalanceCandidate=value=>trustedCandidates.has(value);

/** Immutable content-addressed data, with a non-semantic display id. */
export function createCandidate(spec={}){
 const normalized=normalizeCandidateSpec(spec);
 const {schema,staging,additions}=normalized;
 const hash=contentHash({schema,base:BASELINE_ID,staging,additions});
 if(normalized.hash!==undefined&&normalized.hash!==hash)throw Error('Candidate content hash mismatch');
 const candidate=deepFreeze({schema,id:normalized.id??'candidate-'+hash.slice(0,12),
  base:BASELINE_ID,hash,staging,additions});
 trustedCandidates.add(candidate);return candidate;
}
