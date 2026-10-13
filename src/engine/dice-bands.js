/**
 * Compile printed d6 ranges once, not on every combat/Room roll.
 * Canonical cards are immutable data by convention. Noncanonical test
 * cards still work through a slow path without poisoning the cache.
 */
import {CATALOGUE} from "../tabletop-data.js";
const TABLES=new WeakMap();
const parseRange=range=>{
 const [low,high=low]=range.split("–").map(Number);
 return [low,high];
};
const build=card=>{
 const faces=new Int8Array(7);
 faces.fill(-1);
 for(const [index,entry] of card.v2.roll.outcomes.entries()){
  const [lo,hi]=parseRange(entry.range);
  if(!(Number.isInteger(lo)&&Number.isInteger(hi)&&lo>=1&&hi<=6&&hi>=lo))
   throw Error("Invalid printed d6 range "+entry.range+" on "+card.id);
  for(let d=lo;d<=hi;d++){
   if(faces[d]!==-1)throw Error("Overlapping printed d6 range on "+card.id);
   faces[d]=index;
  }
 }
 return faces;
};
for(const card of CATALOGUE){
 if(card.v2?.roll?.outcomes)TABLES.set(card,build(card));
}
/** Return the zero-based printed outcome band, or -1 if uncovered. */
export function d6Band(card,face){
 if(!card.v2?.roll?.outcomes)throw Error("No d6 outcome on "+card.id);
 if(!Number.isInteger(face)||face<1||face>6)
  throw RangeError("Invalid d6 value");
 const table=TABLES.get(card)||build(card);
 return table[face];
}
