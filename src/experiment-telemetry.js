/**
 * Event-level telemetry for ACTUAL canonical decisions only.
 * All helpers are pure and Node-free so snapshots can be audited in tests.
 * These observations do not imply causal Item or Room effects.
 */
const item=card=>card?{id:card.id,copy:card._physicalCopy??null}:null;
const countById=cards=>{
 const out={};
 for(const c of cards||[])out[c.id]=(out[c.id]||0)+1;
 return out;
};
const sorted=map=>Object.fromEntries(Object.entries(map||{}).sort(([a],[b])=>
 a.localeCompare(b)));
export function experimentSnapshot(s,phase){
 const state=s.state;
 return {
  phase:phase??s.phase,pendingReaction:!!s.pendingNested,
  reaction:s.pendingNested?.trigger??null,
  actionCount:s.actionCount,
  room:state.room?{id:state.room.id,kind:state.room.v2?.kind,
   stage:state.room.stage}:null,
  monster:state.monster?{id:state.monster.id,hp:state.monsterHP,
   maxHp:state.monster.hp,stage:state.monster.stage}:null,
  queuedMonsters:(state.monsterQueue||[]).map(c=>c.id),
  stageProgress:{...state.stageProgress},roomGoal:state.roomGoal,
  roomPiles:Object.fromEntries(Object.entries(state.rooms).map(([k,v])=>[k,v.length])),
  monsterPiles:Object.fromEntries(Object.entries(state.monsters).map(([k,v])=>[k,v.length])),
  itemDeck:state.deck.length,
  discardedItems:countById(state.discardPile),
  discardedRooms:[...state.discardedRoomIds].sort(),
  seenRooms:[...state.seenRooms].sort(),
  keptRooms:state.keptRooms.map(x=>({id:x.card.id,choice:x.choice,
   echo:!!x.echoCopy})),
  bosses:{vaultEntered:!!state.metrics.vaultEntered,
   sealAttempt:!!state.metrics.sealAttempt,
   sealWin:!!state.metrics.sealWin,won:!!state.metrics.won,
   escaped:!!state.metrics.escaped,ending:state.endingKind||null},
  heroes:state.heroes.map((h,index)=>({
   index,id:h.card.id,hp:h.hp,maxHp:h.card.hp,alive:h.hp>0,
   poison:!!h.poison,
   inventory:h.inventory.map(item),
   slots:Object.fromEntries(Object.entries(h.slots).map(([name,c])=>
    [name,item(c)])),
   used:[...h.used].map(x=>typeof x==="object"?x.id:String(x)).sort(),
   equipment:{
    atk:state.stats(h).atk,def:state.stats(h).def,
    wit:h.card.wit,
    nextAdv:h.nextAdv||0,nextDis:h.nextDis||0,
    nextWitDis:h.nextWitDis||0,graveSalt:!!h.graveSalt
   }
  }))
 };
}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function diffTree(before,after){
 if(equal(before,after))return undefined;
 if(before&&after&&typeof before==="object"&&typeof after==="object"&&
  !Array.isArray(before)&&!Array.isArray(after)){
  const patch={};
  for(const k of new Set([...Object.keys(before),...Object.keys(after)])){
   const d=diffTree(before[k],after[k]);
   if(d!==undefined)patch[k]=d;
  }
  return Object.keys(patch).length?patch:undefined;
 }
 if(typeof before==="number"&&typeof after==="number")
  return {was:before,now:after,delta:after-before};
 return {was:before??null,now:after??null};
}
export const cloneMetrics=s=>JSON.parse(JSON.stringify(s.metrics));
export function createDecisionRecorder({includeLegal=true,includeSearch=true}={}){
 const events=[];let pending=null;
 const handler=event=>{
  if(event.moment==="before"){
   if(pending)throw Error("Unpaired previous actual decision");
   pending={
    step:event.step,phase:event.phase,legalCount:event.actions.length,
    legal:includeLegal?event.actions.map(x=>({...x})):undefined,
    chosen:{...event.chosen},
    via:event.diagnostic?"mcts":"forced",
    searchMs:event.searchMs,
    search:includeSearch&&event.diagnostic?{
     budget:event.diagnostic.budget,
     rootActionCount:event.diagnostic.rootActionCount,
     treeNodes:event.diagnostic.treeNodes,
     maximumDepth:event.diagnostic.maximumDepth,
     terminalWins:event.diagnostic.terminalWins,
     complete:event.diagnostic.complete,
     rootEveryActionTried:event.diagnostic.rootEveryActionTried,
     choices:event.diagnostic.choices}:undefined,
    before:experimentSnapshot(event.session,event.phase),
    metricBefore:cloneMetrics(event.session.state),
    rngBefore:event.session.state.rng.snapshot()
   };
   return;
  }
  if(event.moment!=="after"||!pending||pending.step!==event.step)
   throw Error("Unpaired actual decision event");
  const after=experimentSnapshot(event.session);
  const record={
   step:pending.step,phase:pending.phase,
   legalCount:pending.legalCount,legal:pending.legal,
   chosen:pending.chosen,via:pending.via,
   searchMs:pending.searchMs,transitionMs:event.transitionMs,
   search:pending.search,
   before:pending.before,
   after,delta:diffTree(pending.before,after)||{},
   metrics:diffTree(pending.metricBefore,cloneMetrics(event.session.state))||{},
   dice:event.dice||[],rngBefore:pending.rngBefore,
   rngAfter:event.session.state.rng.snapshot(),
   committed:!event.session.pendingNested
  };
  events.push(record);pending=null;
 };
 return {handler,events,finish:()=>{
  if(pending)throw Error("Unpaired decision at end of expedition");
  return events;
 }};
}
export const allCards=()=>{
 // Deliberately import via dedicated catalogue lists in the runner;
 // this module remains independent of physical card definitions.
 return null;
};
