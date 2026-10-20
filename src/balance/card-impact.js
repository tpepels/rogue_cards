import {join} from 'node:path';
import {createCandidate} from './candidate.js';
import {compileCandidate,printableDiff,printableDeck,physicalChangeCount} from './compiler.js';
import {cloneData} from './validator.js';
import {DEFAULT_GOALS,contentHash} from './goals.js';
import {runLaboratory,ALL_PARTIES} from './runner.js';
import {optimizeBalance} from './optimizer.js';
import {evaluateFitness,summarizeTrials} from './fitness.js';
import {pairedComparison} from './statistics.js';
import {writeJSON,lockConfiguration} from './artifacts.js';
import {saveComparison} from './report.js';
import {exportPrintProposal} from './print.js';

const collections={room:'rooms',monster:'monsters',item:'items'};
export function applyCardProposal(base,definition){
 const proposal=cloneData(definition);
 if(proposal.schema!=='uba-card-proposal-v1')throw Error('Unsupported card proposal schema');
 const allowed=['schema','action','card','collection','id','copies','set','healing','restCost'];
 if(Object.keys(proposal).some(k=>!allowed.includes(k)))throw Error('Unsupported card proposal field');
 const staging=structuredClone(base.staging),additions=structuredClone(base.additions),pools=compileCandidate(base);
 let collection,id;
 if(proposal.action==='add'){
  if(!proposal.card||Object.keys(proposal).some(k=>!['schema','action','card'].includes(k)))throw Error('New card proposal requires only card definition');
  collection=collections[proposal.card.type];id=proposal.card.id;
  if(!collection)throw Error('Unsupported new physical card');
  additions.push(proposal.card);
 }else if(['modify','remove'].includes(proposal.action)){
  collection=proposal.collection;id=proposal.id;
  if(!['rooms','monsters','items','heroes','warden','wardenFury'].includes(collection)||typeof id!=='string')throw Error('Unsupported card identity');
  const group=pools[collection],card=Array.isArray(group)?group.find(c=>c.id===id):group;
  if(!card||card.id!==id)throw Error('Missing proposed physical card '+id);
  const existing=additions.findIndex(c=>c.id===id);
  if(proposal.action==='remove'){
   if(proposal.set!==undefined||proposal.healing!==undefined||proposal.restCost!==undefined)throw Error('Removal cannot contain printed effect edits');
   const copies=proposal.copies??1;if(!Number.isSafeInteger(copies)||copies<1)throw Error('Invalid removed copies');
   if(collection==='rooms'){
    const selected=pools.rooms.filter(c=>c.stage===card.stage).map(c=>c.id);
    for(let i=0;i<copies;i++){const at=selected.indexOf(id);if(at<0)throw Error('Not enough Room copies');selected.splice(at,1);}
    (staging.roomDeck??={})[card.stage]={selection:selected};
    if(existing>=0){const remaining=selected.filter(x=>x===id).length;if(!remaining)additions.splice(existing,1);else additions[existing].copies=remaining;}
   }else if(['items','monsters'].includes(collection)){
    const left=card.copies-copies;if(left<0)throw Error('Not enough physical copies');
    if(existing>=0){if(left)additions[existing].copies=left;else additions.splice(existing,1);}
    else mergeEdit(staging,collection,id,{copies:left});
   }else throw Error('Cannot remove fixed Hero or ending cards');
  }else{
   if(proposal.copies!==undefined||proposal.card!==undefined)throw Error('Use set.copies for modifications');
   if(!proposal.set&&proposal.healing===undefined&&proposal.restCost===undefined)throw Error('Empty physical card modification');
   if(existing>=0)throw Error('Modify new card definitions in the original addition proposal');
   if(proposal.set)mergeEdit(staging,collection,id,proposal.set);
   if(proposal.healing!==undefined){
    const key={items:'itemHealing',monsters:'monsterHealing',rooms:'roomRestHealing'}[collection];
    if(!key)throw Error('No supported printed healing for '+collection);
    (staging[key]??={})[id]=proposal.healing;
   }
   if(proposal.restCost!==undefined){if(collection!=='rooms')throw Error('REST costs require a Room');(staging.roomRestCost??={})[id]=proposal.restCost;}
  }
 }else throw Error('Unsupported card proposal action');
 const candidate=createCandidate({id:'impact-'+contentHash(proposal).slice(0,16),base:base.base,staging,additions});
 compileCandidate(candidate);return {candidate,protectedCards:[collection+':'+id],proposal};
}
function mergeEdit(staging,collection,id,set){
 const cards=staging.cards??=[],prior=cards.find(c=>c.collection===collection&&c.id===id);
 if(prior)Object.assign(prior.set,set);else cards.push({collection,id,set:structuredClone(set)});
}
export function restrictCompensationSpace(space,protectedCards,{base=createCandidate()}={}){
 const pools=compileCandidate(base),locked=new Set(protectedCards),out=[];
 for(const raw of space){
  const d=structuredClone(raw);
  if(d.kind==='card-stat'){
   const group=pools[d.collection],cards=(Array.isArray(group)?group:[group]).filter(c=>c&&(!d.id||c.id===d.id)&&(!d.ids||d.ids.includes(c.id))&&!locked.has(d.collection+':'+c.id));
   if(!cards.length)continue;
   if(d.id){if(locked.has(d.collection+':'+d.id))continue;}
   else d.ids=cards.map(c=>c.id);
  }else if(d.kind==='room-transfer'){
   if(locked.has('rooms:'+d.from)||locked.has('rooms:'+d.to))continue;
  }else{
   const collection=d.kind.startsWith('item')?'items':d.kind.startsWith('monster')?'monsters':'rooms';
   if(locked.has(collection+':'+d.id))continue;
  }
  out.push(d);
 }
 return out;
}
export async function analyzeCardImpact({proposal,base=createCandidate(),goals=DEFAULT_GOALS,out,workers=8,seed=20261020,profile='reference-v1',parties=ALL_PARTIES,
 runsPerParty=goals.search.screenRuns,protectedCards=[],space=goals.search.space,search={},budgetMs=12*3600000,maxTrials,validate=true}={}){
 const applied=applyCardProposal(base,proposal),lockedCards=[...new Set([...protectedCards,...applied.protectedCards])],restricted=restrictCompensationSpace(space,lockedCards,{base:applied.candidate}),started=Date.now();
 lockConfiguration(join(out,'impact-lock.json'),{proposal,base,goals,profile,parties,runsPerParty,seed,lockedCards,restricted,search,validate});
 const impact=await runLaboratory({candidates:[base,applied.candidate],profiles:[profile],parties,runsPerParty,seed,split:'screen',workers,out:join(out,'impact'),budgetMs,maxTrials,goals});
 if(impact.errors.length)throw Error('Card impact simulation failed: '+JSON.stringify(impact.errors));
 const entries=[base,applied.candidate].map(c=>{
  const rows=impact.rows.filter(r=>r.candidateHash===c.hash),summary=summarizeTrials(rows),diff=printableDiff(c);
  return {candidate:c,summary,rows,diff,fitness:evaluateFitness(summary,goals,{physicalChanges:physicalChangeCount(c),expectedParties:parties})};
 });
 saveComparison(out,entries,{title:'UBA — physical card impact',baselineHash:base.hash,complete:impact.complete});
 writeJSON(join(out,'proposed-card.json'),applied.candidate);writeJSON(join(out,'proposed-deck.json'),printableDeck(applied.candidate));
 exportPrintProposal(applied.candidate,join(out,'print-proposal'));
 if(!impact.complete)return {schema:'uba-card-impact-v1',complete:false,stage:'impact',entries};
 const optimizer=restricted.length?await optimizeBalance({base:applied.candidate,goals,profile,parties,seed,workers,out:join(out,'compensation'),budgetMs:Math.max(0,budgetMs-(Date.now()-started)),maxTrials,
  search:{...search,space:restricted},protectedCards:lockedCards,validate}):null;
 const patches=(optimizer?.finalists??[]).map(candidate=>({candidate,printableDiff:printableDiff(candidate),
  validation:optimizer.validation?.entries.find(e=>e.candidate.hash===candidate.hash)?.assessment??null}));
 const originalCard=printableDeck(applied.candidate).filter(c=>lockedCards.includes((collections[c.type]??c.type)+':'+c.id));
 for(const patch of patches){
  const actual=printableDeck(patch.candidate).filter(c=>lockedCards.includes((collections[c.type]??c.type)+':'+c.id));
  if(contentHash(originalCard)!==contentHash(actual))throw Error('Compensation changed a protected physical card');
 }
 const report={schema:'uba-card-impact-v1',complete:optimizer?.complete??true,proposal,proposedCandidate:applied.candidate,protectedCards:lockedCards,
  impact:{pairedWinDifference:pairedComparison(entries[0].rows,entries[1].rows,'won'),entries:entries.map(({rows,...e})=>e)},patches,
  conclusion:!restricted.length?'No legal compensation dimensions remain.':!patches.length?'No feasible improving compensation found within this search budget.':
   patches.some(p=>p.validation?.status==='validated')?'Independently validated proposals available for human review.':'Candidate patches found; evidence remains uncertain or rejected. No canonical cards adopted.'};
 writeJSON(join(out,'card-impact.json'),report);return report;
}
