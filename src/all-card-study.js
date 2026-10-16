/**
 * Canonical full-expedition physical-card contrasts.
 *
 * Every printed card has a row. Room / Item / ordinary Monster contrasts
 * change ONLY the order of existing physical cards in their printed pile.
 * Hero contrasts replace one party slot with another printed Hero.
 * Fixed Vault and Warden cards have observation-only evidence: we never
 * invent an alternative boss, omit encounters, or call coverage a treatment.
 *
 * The estimator is the intention-to-schedule effect (not a conditional
 * effect among survivors). It is relative to the naturally shuffled
 * next card, not the effect of adding a copy or removing printed rules.
 */
import {HEROES,ROOMS,OBJECTS,MONSTERS,VAULT,WARDEN,WARDEN_FURY}
 from "./tabletop-data.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "./engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction}
 from "./session-policy.js";

const heroIds=HEROES.map(c=>c.id);
const parties=[
 ...heroIds.map(x=>[x]),
 ...heroIds.flatMap((x,i)=>heroIds.slice(i+1).map(y=>[x,y]))
];
export const ALL_CARD_ROSTER=Object.freeze([
 ...ROOMS.map(c=>({kind:"room",id:c.id,title:c.title,stage:c.stage,
  method:"first-room-in-printed-stage"})),
 ...OBJECTS.map(c=>({kind:"item",id:c.id,title:c.title,family:c.v2.kind,
  method:"next-physical-item-draw"})),
 ...MONSTERS.map(c=>({kind:"monster",id:c.id,title:c.title,stage:c.stage,
  method:"first-monster-in-printed-stage"})),
 ...HEROES.map(c=>({kind:"hero",id:c.id,title:c.title,
  method:"hero-slot-replacement"})),
 ...[VAULT,WARDEN,WARDEN_FURY].map(c=>({kind:"fixed",id:c.id,
  title:c.title,method:"observation-only"}))
]);
const byKey=new Map(ALL_CARD_ROSTER.map(c=>[c.kind+":"+c.id,c]));
if(byKey.size!==ALL_CARD_ROSTER.length)
 throw Error("Duplicate printed card identifier in all-card roster");

export const cardKey=c=>c.kind+":"+c.id;
export const getCard=(kind,id)=>byKey.get(kind+":"+id)||null;
export const allParties=()=>parties.map(p=>[...p]);
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
const hash=value=>{
 let n=2166136261;
 for(const ch of value)n=Math.imul(n^ch.charCodeAt(0),16777619);
 return n>>>0;
};
// Common source-seed per sample index enables exact control sharing across
// different physical cards in the same party. Independent indices still
// have independent seeds. The design is NOT compatible with old checkpoints.
export function cardTrialSeed(seed,card,index){
 if(!byKey.has(cardKey(card)))throw Error("Unknown card in seed schedule");
 return mix(seed^Math.imul(index+1,0x85ebca6b))||1;
}
/**
 * Separate party-size populations have independent manifests and must never
 * be pooled. "single" rotates evenly through all eight Hero identities for
 * every non-Hero card; Hero comparisons replace one actual single Hero.
 * "two" enumerates all unordered two-Hero parties for non-Hero cards.
 * "mixed" retains the historical all-party research schedule unchanged.
 */
export function partiesForCard(card,index,c={}){
 if(!Number.isSafeInteger(index)||index<0)
  throw Error("Invalid independent source index");
 const mode=c.partySize??"mixed";
 if(!["single","two","mixed"].includes(mode))
  throw Error("Invalid party-size research population "+mode);
 if(card.kind!=="hero"){
  const pool=mode==="single"?heroIds.map(id=>[id]):
   mode==="two"?parties.filter(p=>p.length===2):parties;
  const reference=[...pool[index%pool.length]];
  return card.kind==="fixed"?{reference}:
   {reference,treatment:[...reference]};
 }
 const alternatives=heroIds.filter(id=>id!==card.id);
 const referenceHero=alternatives[index%alternatives.length];
 const double=mode==="two"||
  mode==="mixed"&&index%2===1;
 if(!double)return {reference:[referenceHero],treatment:[card.id]};
 const partners=alternatives.filter(id=>id!==referenceHero);
 const partner=partners[
  Math.floor(index/alternatives.length)%partners.length];
 return {reference:[referenceHero,partner],
  treatment:[card.id,partner]};
}
// Moves a card already present in a real printed pile; never creates,
// duplicates, discards, or silently adds a physical card.
function swapTo(pile,id,atLast){
 const dest=atLast?pile.length-1:0;
 // Several Items and Monsters have different physical copies with the
 // same printed id. Compare the card at the draw position by *identity
 // of the design*, not the index of the first matching physical copy.
 // Otherwise a repeated intervention swaps two real copies unnecessarily
 // and mistakenly reports another eligible treatment.
 if(pile[dest]?.id===id)
  return {eligible:false,why:"already-at-draw-position"};
 const found=pile.findIndex(c=>c.id===id);
 if(found<0)return {eligible:false,why:"physical-copy-unavailable"};
 [pile[found],pile[dest]]=[pile[dest],pile[found]];
 return {eligible:true,why:null};
}
export function arrangePhysicalCard(state,card){
 if(card.kind==="room")return swapTo(state.rooms[card.stage],card.id,false);
 if(card.kind==="item")return swapTo(state.deck,card.id,true);
 if(card.kind==="monster")return swapTo(state.monsters[card.stage],card.id,true);
 if(card.kind==="hero"||card.kind==="fixed")return {eligible:true,why:null};
 throw Error("Unknown physical-card trial kind");
}
export function runCanonicalCardExpedition(session,card,c,runSeed,
 {captureCoverage=false}={}){
 const policy=createSessionPolicy();
 let decisions=0,searches=0;
 const fast={
  speculativeTransitions:true,
  canonicalReactionPhases:true,
  deferReactionCheckpoints:true,
  // All optimizations below retain the identical UCT, dice, legal choices
  // and complete canonical terminal-game rollouts. The regression suite
  // compares this combined path against the original study policy.
  ...(c.optimizedSearch===false?{}:{
   lazyColdEdges:true,
   reuseTraceSlots:true,
   fastPileClones:true,
   reuseEdgeActions:true,
   reuseEmptyReplaySwitches:true,
   reuseSelectionScratch:true,
   streamHistoryHash:true
  }),
  ...(c.nativeHash?{nativeHash:true}:{})
 };
 for(;session.phase!=="terminal"&&decisions<c.maxGameSteps;decisions++){
  // Issue a canonical legal-action ticket once per live decision.
  // The engine can then verify the selected action without rebuilding the
  // same full equipment + Room + Hero legal list on commit. This is the
  // existing production decision API, not a reduced legal-action set.
  const legal=sessionActions(session,{issueTicket:c.issuedActions!==false});
  if(!legal.length)throw Error("Nonterminal source has zero legal decisions");
  const requiresSearch=legal.length>1;
  const chosen=selectSessionPolicyAction(session,policy,{
   knowledge:"fair",budget:c.budget,
   maxSearchSteps:c.maxSearchSteps,legalActions:legal,
   seed:mix(runSeed^Math.imul(decisions+1,0xc2b2ae35)),
   mctsOptimizations:fast
  });
  if(requiresSearch)searches++;
  submitDecision(session,chosen,{observeResult:false,recordHistory:false,
   ...(c.issuedActions===false?{}:{verifiedLegalActions:legal})});
 }
 if(session.phase!=="terminal")throw Error("Canonical expedition exceeded decision cap");
 const s=session.state;
 if(s.metrics.roundLimit||s.metrics.unresolved)
  throw Error("Canonical expedition ended with unresolved rule effects");
 if(s.alive()&&!s.metrics.won&&!s.metrics.escaped)
  throw Error("Terminal session without a printed ending");
 let exposure=0;
 if(card?.kind==="room")exposure=Number(s.seenRooms.has(card.id));
 if(card?.kind==="item")exposure=s.metrics.objectDraws[card.id]||0;
 if(card?.kind==="monster"||card?.kind==="fixed"&&card.id!=="vault")
  exposure=s.metrics.monsterVisits[card.id]||0;
 if(card?.kind==="fixed"&&card.id==="vault")
  exposure=Number(!!s.metrics.vaultEntered);
 if(card?.kind==="hero")exposure=1;
 return {
  won:Number(!!s.metrics.won),escaped:Number(!!s.metrics.escaped),
  ending:s.endingKind||null,exposure,
  decisions,searches,cycleBreaks:policy.cycleBreaks,
  ...(captureCoverage?{coverage:{
   rooms:[...s.seenRooms],
   itemDraws:{...s.metrics.objectDraws},
   monsterVisits:{...s.metrics.monsterVisits},
   // Save every Item and Monster counter, not only encounter counts.
   // These are terminal telemetry snapshots; copying numeric values
   // avoids retaining mutable metrics or inventing missing Item uses.
   itemUses:Object.fromEntries(Object.entries(s.metrics.itemUses).map(
    ([id,entry])=>[id,entry.total])),
   itemPassives:Object.fromEntries(Object.entries(
    s.metrics.itemPassiveEffects).map(([id,entry])=>[id,entry.triggers])),
   monsterBehaviorBands:{...s.metrics.monsterBehaviorBands},
   vaultEntered:Boolean(s.metrics.vaultEntered)
  }}:{}),
  itemUses:card?.kind==="item"?
   (s.metrics.itemUses[card.id]?.total||0):null,
  itemPassives:card?.kind==="item"?
   (s.metrics.itemPassiveEffects[card.id]?.triggers||0):null,
  monsterBehaviors:card?.kind==="monster"?
   Object.entries(s.metrics.monsterBehaviorBands).filter(([k])=>
    k.startsWith(card.id+":")).reduce((n,[,v])=>n+v,0):null
 };
}
export function sharedControlKey(card,index,c){
 const seed=cardTrialSeed(c.seed,card,index);
 const party=partiesForCard(card,index,c).reference;
 return String(index).padStart(6,"0")+":"+party.join(",");
}
export function evaluateSharedControl(card,index,c){
 // A fixed boss card is observational only. Its full expedition is
 // identical to the matching reference for every other printed card.
 const seed=cardTrialSeed(c.seed,card,index);
 const group=partiesForCard(card,index,c);
 const session=createDecisionSession({seed,heroes:group.reference});
 const result=runCanonicalCardExpedition(session,null,c,seed,{
  captureCoverage:true});
 return {key:sharedControlKey(card,index,c),seed,
  reference:[...group.reference],result};
}
export function sharedControlForCard(baseline,card,index,c){
 const key=sharedControlKey(card,index,c);
 const seed=cardTrialSeed(c.seed,card,index);
 const reference=partiesForCard(card,index,c).reference;
 if(!baseline||baseline.key!==key||baseline.seed!==seed||
   JSON.stringify(baseline.reference)!==JSON.stringify(reference)||
   !baseline.result?.coverage||
   !baseline.result.coverage.itemUses||
   !baseline.result.coverage.itemPassives||
   !baseline.result.coverage.monsterBehaviorBands)
  throw Error("Shared baseline mismatch or missing canonical coverage: "+key);
 const {coverage,...common}=baseline.result;
 // runCanonicalCardExpedition(null) records null for card-specific
 // telemetry. A cached control must reproduce the exact numerical
 // counters returned by a direct card-specific full expedition.
 return {...common,
  itemUses:card.kind==="item"?(coverage.itemUses[card.id]||0):null,
  itemPassives:card.kind==="item"?(coverage.itemPassives[card.id]||0):null,
  monsterBehaviors:card.kind==="monster"?
   Object.entries(coverage.monsterBehaviorBands).reduce((count,[k,v])=>
    count+(k.startsWith(card.id+":")?v:0),0):null,
  exposure:
  card.kind==="room"?Number(coverage.rooms.includes(card.id)):
  card.kind==="item"?(coverage.itemDraws[card.id]||0):
  card.kind==="monster"?(coverage.monsterVisits[card.id]||0):
  card.kind==="hero"?1:
  card.kind==="fixed"?(card.id==="vault"?
   Number(coverage.vaultEntered):
   (coverage.monsterVisits[card.id]||0)):0};
}
export function evaluateCardTrial(card,index,c,sharedBaseline=null){
 if(!byKey.has(cardKey(card)))throw Error("Card is absent from canonical roster");
 const seed=cardTrialSeed(c.seed,card,index);
 const group=partiesForCard(card,index,c);
 if(card.kind==="fixed"&&sharedBaseline)return {
  card:cardKey(card),index,seed,kind:"observed",
  parties:group.reference,
  result:sharedControlForCard(sharedBaseline,card,index,c)
 };
 const treatment=createDecisionSession({seed,heroes:group.treatment||group.reference});
 const eligibility=arrangePhysicalCard(treatment.state,card);
 if(!eligibility.eligible)
  return {card:cardKey(card),index,seed,kind:"ineligible",why:eligibility.why};
 // The same complete search policy and same initial chance seed in both
 // arms. Card order / party identity may subsequently diverge dice use.
 const alternative=runCanonicalCardExpedition(treatment,card,c,seed);
 if(card.kind==="fixed")return {
  card:cardKey(card),index,seed,kind:"observed",
  parties:group.reference,result:alternative
 };
 const control=sharedBaseline?
  sharedControlForCard(sharedBaseline,card,index,c):
  runCanonicalCardExpedition(
   createDecisionSession({seed,heroes:group.reference}),card,c,seed);
 return {
  card:cardKey(card),index,seed,kind:"paired",
  parties:group,control,treatment:alternative
 };
}
const logFacts=[0];
const logFactorial=n=>{
 while(logFacts.length<=n){
  const k=logFacts.length;
  logFacts.push(logFacts[k-1]+Math.log(k));
 }
 return logFacts[n];
};
export function exactPairedP(plus,minus){
 const n=plus+minus;if(!n)return 1;
 const k=Math.min(plus,minus),terms=[];
 for(let j=0;j<=k;j++)terms.push(
  logFactorial(n)-logFactorial(j)-logFactorial(n-j)-n*Math.LN2);
 const biggest=Math.max(...terms);
 return Math.min(1,2*Math.exp(biggest)*
  terms.reduce((acc,v)=>acc+Math.exp(v-biggest),0));
}
export function cardSummary(rows,minPaired=60){
 const grouped=new Map();
 for(const card of ALL_CARD_ROSTER)grouped.set(cardKey(card),{
  key:cardKey(card),id:card.id,title:card.title,
  kind:card.kind,method:card.method,attempted:0,
  compared:0,observed:0,notEligible:0,
  treatmentExposures:0,controlExposures:0,
  treatmentWins:0,controlWins:0,positive:0,negative:0,tied:0,
  reasons:{},itemUses:0,itemPassives:0,monsterBehaviors:0
 });
 for(const result of rows){
  const g=grouped.get(result.card);
  if(!g)throw Error("Unexpected checkpoint card "+result.card);
  g.attempted++;
  if(result.kind==="ineligible"){
   g.notEligible++;
   g.reasons[result.why]=(g.reasons[result.why]||0)+1;
  }else if(result.kind==="observed"){
   g.observed++;g.treatmentWins+=result.result.won;
   g.treatmentExposures+=Number(result.result.exposure>0);
  }else if(result.kind==="paired"){
   const a=result.control,b=result.treatment;
   g.compared++;g.controlWins+=a.won;g.treatmentWins+=b.won;
   g.controlExposures+=Number(a.exposure>0);
   g.treatmentExposures+=Number(b.exposure>0);
   g.positive+=Number(b.won>a.won);
   g.negative+=Number(b.won<a.won);
   g.tied+=Number(b.won===a.won);
   g.itemUses+=b.itemUses||0;
   g.itemPassives+=b.itemPassives||0;
   g.monsterBehaviors+=b.monsterBehaviors||0;
  }else throw Error("Invalid checkpoint category");
 }
 const report=[...grouped.values()].map(g=>{
  const n=g.compared,d=(g.positive-g.negative)/Math.max(1,n);
  const variance=n>=2?
   (g.positive+g.negative-n*d*d)/(n-1):null;
  const half=n>=2?1.959963984540054*
   Math.sqrt(Math.max(0,variance/n)):null;
  return {...g,
   difference:n?d:null,
   approximate95:half===null?null:[
    Math.max(-1,d-half),Math.min(1,d+half)],
   pRaw:n?exactPairedP(g.positive,g.negative):null,
   pHolm:null,significant:false,
   status:g.kind==="fixed"?
    g.observed?"observational-only":"not-sampled":
    n<minPaired?"insufficient":"inconclusive"
  };
 });
 const family=report.filter(x=>x.pRaw!==null)
  .sort((a,b)=>a.pRaw-b.pRaw||a.key.localeCompare(b.key));
 let floor=0;
 for(let i=0;i<family.length;i++){
  const g=family[i];
  floor=Math.max(floor,Math.min(1,g.pRaw*(family.length-i)));
  g.pHolm=floor;
  g.significant=g.compared>=minPaired&&floor<.05;
  if(g.significant)g.status="significant";
 }
 return report;
}
