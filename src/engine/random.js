/**
 * Pure, portable seeded RNG used by the reusable rules engine.
 *
 * This is intentionally the exact xorshift32 algorithm used by the former
 * playtest helper. It carries no Node dependency and has no knowledge of
 * studies, policies, logging, React, or the browser.
 *
 * Seed and draw order are part of the deterministic game contract.
 */
export function randomSource(seed=1){
 let state=(seed>>>0)||0x9e3779b9;
 const random=()=>{
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return (state>>>0)/4294967296;
 };
 const die=sides=>1+Math.floor(random()*sides);
 return {
  die,
  choose:items=>items[Math.floor(random()*items.length)],
  shuffle:items=>{
   const out=[...items];
   for(let i=out.length-1;i>0;i--){
    const j=die(i+1)-1;
    [out[i],out[j]]=[out[j],out[i]];
   }
   return out;
  },
  // Clone the *remaining* dice stream without drawing. Needed when a
  // player pauses in the middle of a printed effect or defence roll.
  snapshot:()=>state>>>0,
  restore:value=>{
   if(!Number.isInteger(value)||value<0||value>0xffffffff)
    throw Error("Invalid RNG snapshot");
   state=value|0;
  },
  clone:()=>{
   const copy=randomSource(1);
   copy.restore(state>>>0);
   return copy;
  }
 };
}
