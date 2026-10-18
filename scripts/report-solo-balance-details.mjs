#!/usr/bin/env node
/**
 * Reconstruct detailed SOLO game balance exposure from compressed
 * canonical event traces produced by study:solo:balance --trace full.
 *
 * No invented Room/Monster/Item outcomes. Events contain before & after,
 * so irreversible HP/Item/status/room changes can be inspected directly.
 * Keeps aggregated detail separate from the per-decision raw JSONL logs.
 */
import {readFileSync,writeFileSync,renameSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";

const add=(map,id,n=1)=>{
 if(id&&n!==0)map[id]=(map[id]||0)+n;
};
const delta=value=>{
 if(typeof value==="number")return value;
 if(value&&typeof value==="object"&&"now" in value&&
  typeof value.now==="number")
  return value.now-(typeof value.was==="number"?value.was:0);
 return 0;
};
const mapDelta=(dest,changes)=>{
 for(const [id,change] of Object.entries(changes||{})){
  const d=delta(change);
  if(d)add(dest,id,d);
 }
};
const encounter=(monster,name)=>{
 const key=monster?.id??name??null;
 return key;
};
const baseDetail=()=>({
 decisions:0,dice:0,faceCounts:{},
 phaseCounts:{},actions:{},roomEntries:{},roomCompletions:{},
 roomsByStage:{},monsterEncounters:{},monsterFights:{},
 monsterKills:{},monsterParley:{},monsterParleyWins:{},
 monsterDamageTaken:{},monsterFlees:{},monsterActions:{},
 itemAcquisitions:{},itemDraws:{},itemActivations:{},
 itemUses:{},itemDiscards:{},itemEquips:{},
 roomChoices:{},statusChanges:{},
 hpGained:0,hpLost:0,damageEvents:0,healingEvents:0,
 minHP:null,maxHP:null,poisonedDecisionCount:0,
 elberethWard:0,elberethFlee:0,searchMs:0
});
export function analyzeSoloEvents(record,events){
 if(!Array.isArray(events)||events.length!==record.steps)
  throw Error("Missing canonical decision trace for "+record.hero);
 const detail=baseDetail();
 const perRoom={},perMonster={};
 const touch=(map,key)=>map[key]??=(baseDetail());
 let previous=null;
 for(let i=0;i<events.length;i++){
  const e=events[i];
  if(e.step!==i+1||!e.before||!e.after||!e.chosen||
   !e.metrics||!Array.isArray(e.dice))
   throw Error("Malformed decision event "+(i+1)+" for "+record.hero);
  if(previous&&JSON.stringify(previous.after)!==JSON.stringify(e.before))
   throw Error("Gapped canonical state between events "+i+" and "+(i+1));
  const before=e.before.heroes?.[0],after=e.after.heroes?.[0];
  if(!before||!after)throw Error("Trace without solo Hero");
  const currentRoom=e.before.room?.id??e.after.room?.id??null;
  const currentMonster=encounter(e.before.monster,e.after.monster?.id);
  const buckets=[detail];
  if(currentRoom)buckets.push(touch(perRoom,currentRoom));
  if(currentMonster)buckets.push(touch(perMonster,currentMonster));
  const hpChange=after.hp-before.hp;
  const phase=e.phase,action=e.chosen;
  for(const b of buckets){
   b.decisions++;
   add(b.phaseCounts,phase);
   add(b.actions,action.kind);
   b.dice+=e.dice.length;
   b.searchMs+=Number(e.searchMs)||0;
   b.minHP=Math.min(b.minHP??before.hp,after.hp,before.hp);
   b.maxHP=Math.max(b.maxHP??before.hp,after.hp,before.hp);
   if(before.poison)b.poisonedDecisionCount++;
   if(hpChange<0){b.hpLost-=hpChange;b.damageEvents++;}
   if(hpChange>0){b.hpGained+=hpChange;b.healingEvents++;}
   if(action.kind==="elbereth"){
    if(action.mode==="ward")b.elberethWard++;
    if(action.mode==="flee")b.elberethFlee++;
   }
   if(currentMonster)add(b.monsterActions,currentMonster);
   for(const die of e.dice)add(b.faceCounts,die.sides+":"+die.face);
   const metric=e.metrics;
   mapDelta(b.roomChoices,metric.roomChoices);
   mapDelta(b.monsterEncounters,metric.monsterVisits);
   mapDelta(b.monsterFights,metric.monsterFightStartsById);
   mapDelta(b.monsterKills,metric.monsterKillsById);
   mapDelta(b.monsterParley,metric.monsterParleyAttemptsById);
   mapDelta(b.monsterParleyWins,metric.monsterParleyWinsById);
   mapDelta(b.monsterDamageTaken,metric.damageContextById);
   mapDelta(b.itemAcquisitions,metric.objectAcquisitions);
   mapDelta(b.itemDraws,metric.objectDraws);
   mapDelta(b.itemActivations,metric.objectActivations);
   for(const [id,change] of Object.entries(metric.itemUses||{})){
    const old=change?.total;
    const count=delta(old);
    if(count)add(b.itemUses,id,count);
   }
   const beforeCopies=new Map((before.inventory||[]).map(
    x=>[x.copy||x.id,x.id]));
   const afterCopies=new Map((after.inventory||[]).map(
    x=>[x.copy||x.id,x.id]));
   for(const [id,card] of beforeCopies)if(!afterCopies.has(id))
    add(b.itemDiscards,card);
   // Record explicit equip decisions; cards can equip through powers too,
   // in which case exact physical slot deltas are retained in raw trace.
   if(["equip","unequip","transfer"].includes(action.kind)){
    const beforeSlots=before.slots||{},afterSlots=after.slots||{};
    for(const [slot,card] of Object.entries(afterSlots))
     if(card&&JSON.stringify(card)!==JSON.stringify(beforeSlots[slot]))
      add(b.itemEquips,card.id);
   }
   for(const [field,old] of Object.entries(before.scalarStatuses||{}))
    if(JSON.stringify(old)!==JSON.stringify(after.scalarStatuses?.[field]))
     add(b.statusChanges,field);
  }
  if(e.after.room?.id&&e.after.room?.id!==e.before.room?.id){
   for(const b of [detail,touch(perRoom,e.after.room.id)]){
    add(b.roomEntries,e.after.room.id);
    add(b.roomsByStage,e.after.room.stage);
   }
  }
  const roomsCompleted=delta(e.metrics.cleared);
  if(roomsCompleted>0&&e.before.room?.id){
   for(const b of [detail,touch(perRoom,e.before.room.id)])
    add(b.roomCompletions,e.before.room.id,roomsCompleted);
  }
  if(e.chosen.kind==="elbereth"&&e.chosen.mode==="flee"&&currentMonster){
   for(const b of [detail,touch(perMonster,currentMonster)])
    add(b.monsterFlees,currentMonster);
  }
  previous=e;
 }
 const last=events.at(-1);
 if(last.after.heroes[0].hp!==record.finalHero?.hp)
  throw Error("Final Hero HP differs from last committed state");
 if(last.after.phase!=="terminal")
  throw Error("Trace does not terminate the canonical expedition");
 if(record.finalMetrics){
  for(const [key,field] of [
   ["cleared","roomCompletions"],["encounterStarts","monsterEncounters"],
   ["combatStarts","monsterFights"]]){
   if(key==="combatStarts")continue; // includes FINAL Warden phases
   const counted=Object.values(detail[field]).reduce((n,v)=>n+v,0);
   if(counted!==record.finalMetrics[key])
    throw Error("Telemetry "+field+" mismatch "+counted+" != "+
     record.finalMetrics[key]+" in "+record.hero);
  }
 }
 return {
  hero:record.hero,replicate:record.replicate,arm:record.arm,
  seed:record.seed,ending:record.ending,won:record.won,
  vaultReached:record.vaultReached,
  roomsCleared:record.roomsCleared,finalHP:record.finalHero?.hp,
  stats:detail,perRoom,perMonster
 };
}
export function loadSoloTrace(directory,record){
 if(!record.traceFile||!record.traceSHA256)
  throw Error("Missing trace reference for "+record.hero);
 const path=resolve(directory,record.traceFile);
 if(!path.startsWith(resolve(directory)+"/"))
  throw Error("Unsafe trace path");
 const raw=readFileSync(path);
 if(createHash("sha256").update(raw).digest("hex")!==record.traceSHA256)
  throw Error("Modified or corrupted trace: "+record.traceFile);
 const text=gunzipSync(raw).toString("utf8");
 const events=text.split("\n").filter(Boolean).map(JSON.parse);
 if(events.length!==record.traceEvents)
  throw Error("Truncated trace "+record.traceFile);
 return events;
}
export function reportSoloTraceDirectory(directory){
 const root=resolve(directory);
 const rowsFile=join(root,"trials.ndjson");
 if(!existsSync(rowsFile))throw Error("No trials.ndjson at "+root);
 const rows=readFileSync(rowsFile,"utf8").split("\n").
  filter(Boolean).map(JSON.parse);
 const results=rows.map(record=>analyzeSoloEvents(record,
  loadSoloTrace(root,record)));
 const grouped={};
 for(const item of results){
  for(const name of [item.arm,item.arm+"|"+item.hero]){
   const bucket=grouped[name]??={n:0,wins:0,vault:0,
    rooms:0,steps:0,dice:0,hpLost:0,hpGained:0,
    roomEntries:{},roomCompletions:{},monsterEncounters:{},
    monsterFights:{},monsterKills:{},monsterParley:{},
    monsterDamageTaken:{},monsterFlees:{},
    itemAcquisitions:{},itemDraws:{},itemActivations:{},
    itemUses:{},itemDiscards:{},itemEquips:{},
    actions:{},phaseCounts:{},statusChanges:{}};
   bucket.n++;bucket.wins+=item.won;bucket.vault+=item.vaultReached;
   bucket.rooms+=item.roomsCleared;bucket.steps+=item.stats.decisions;
   bucket.dice+=item.stats.dice;bucket.hpLost+=item.stats.hpLost;
   bucket.hpGained+=item.stats.hpGained;
   for(const key of Object.keys(bucket).filter(k=>
    bucket[k]!==null&&typeof bucket[k]==="object"))
    for(const [id,count] of Object.entries(item.stats[key]||{}))
     add(bucket[key],id,count);
  }
 }
 const report={
  schema:"solo-balance-trace-analysis-v1",
  trialCount:results.length,grouped,runs:results,
  notes:[
   "Every run is grounded in a SHA256-verified canonical compressed action log.",
   "Per-action before/after state, physical Item copies and committed die outcomes remain in traces/*.jsonl.gz.",
   "Room/Monster counts derive exclusively from canonical metric deltas; encounters may involve fleeing or negotiations.",
   "Damage attributed to a Room/Monster by the active card is descriptive context, not necessarily the cause of damage.",
   "Per-decision HP changes are net changes, not necessarily total damage and healing if both happened inside one canonical action."
  ]
 };
 const path=join(root,"details.json"),tmp=path+".tmp";
 writeFileSync(tmp,JSON.stringify(report,null,2)+"\n");
 renameSync(tmp,path);
 return {path,trialCount:results.length};
}
if(process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=="--dir")
  throw Error("Usage: npm run report:solo:balance -- --dir results/solo-balance-v2");
 console.log(JSON.stringify(reportSoloTraceDirectory(args[1]),null,2));
}
