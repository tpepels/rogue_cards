#!/usr/bin/env node
/**
 * Static, rule-preserving audit of the CURRENT canonical 36-Room deck.
 * Distinguishes guaranteed on-entry Monster draws, optional Room
 * actions, optional d6 outcome branches and novel spawned Monsters.
 * An optional existing balance trials NDJSON file provides actual
 * observed monsterVisits, fresh encounterStarts and Rooms completed.
 * No changes to physical card copies, rules, or probability tables.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {ROOMS} from "../src/tabletop-data.js";
import {PRINT_ONLY_ROOMS} from "../src/print-expansion.js";

const STAGES=["UPPER","MIDDLE","DEEP"];
const monster=/\b(?:draw|face|fight|summon|spawn|attract)\b[^.!?]*?\b(?:an?\s+)?(?:UPPER|MIDDLE|DEEP)?\s*Monster\b/i;
const direct=/\bdraw\s+(?:an?\s+)?(?:UPPER|MIDDLE|DEEP)?\s*Monster\b/i;
const numberRange=x=>{
 const digits=String(x||"").match(/[1-6]/g)||[];
 if(!digits.length)return 0;
 if(digits.length===1)return 1;
 const a=Number(digits[0]),b=Number(digits[1]);
 return b>=a?b-a+1:0;
};
const countSum=map=>Object.values(map||{}).reduce((sum,v)=>sum+v,0);
export function auditMonsterFrequency({
 canonicalRooms=[...ROOMS,...PRINT_ONLY_ROOMS],rows=[]
}={}){
 const cards=canonicalRooms.map(room=>{
  const prompt=room.v2?.prompt??"";
  const guaranteedEntry=/on entry:\s*draw\s+(?:an?\s+)?(?:UPPER|MIDDLE|DEEP)\s+monster/i.test(prompt);
  const choices=(room.v2?.choices||[]).map((a,i)=>({
   index:i,label:a.label,
   printedMonsterMention:monster.test(a.effect||""),
   directMonsterDraw:direct.test(a.effect||"")
  }));
  const roll=room.v2?.roll;
  const outcomes=(roll?.outcomes||[]).map(o=>({
   range:o.range,effect:o.effect,
   faces:numberRange(o.range),
   monsterMention:monster.test(o.effect||""),
   directMonsterDraw:direct.test(o.effect||"")
  }));
  const d6DirectFaces=outcomes.reduce((n,o)=>
   n+(o.directMonsterDraw?o.faces:0),0);
  // Printed die outcomes are conditional on choosing that roll action.
  // The numbers below are NOT automatic encounter probabilities,
  // because a Hero can elect a non-rolling Room choice.
  return {id:room.id,stage:room.stage,kind:room.v2?.kind,
   printOnly:!!room.printOnly,guaranteedEntry,
   directChoices:choices.filter(x=>x.directMonsterDraw),
   describedMonsterChoices:choices.filter(x=>x.printedMonsterMention),
   rollMonsterFaces:d6DirectFaces,
   conditionalRollProbability:d6DirectFaces/6,
   rolledMonsterBands:outcomes.filter(x=>x.monsterMention),
   hasAlternativeChoice:choices.length>1,
   hasAnyMonster:guaranteedEntry||d6DirectFaces>0||
    choices.some(x=>x.printedMonsterMention)
  };
 });
 const byStage=Object.fromEntries(STAGES.map(stage=>{
  const group=cards.filter(c=>c.stage===stage);
  const count=group.length;
  const guaranteed=group.filter(c=>c.guaranteedEntry).length;
  const rollFaces=group.reduce((n,c)=>n+c.rollMonsterFaces,0);
  const directChoices=group.filter(c=>c.directChoices.length).length;
  const withAny=group.filter(c=>c.hasAnyMonster).length;
  return [stage,{
   cards:count,normalRoomsTarget:12,
   guaranteedEntryCards:guaranteed,
   directMonsterChoiceCards:directChoices,
   cardsWithAnyPrintedMonster:withAny,
   cardsWithoutPrintedMonster:count-withAny,
   conditionalRollFaces:rollFaces,
   meanEntryDrawsIf12RandomRooms:count?12*guaranteed/count:0,
   // A loose upper-bound-style estimate from DIRECT printed roll
   // faces IF every selected Room rolls its card's d6 exactly once;
   // ignores fate triggers, rerolls, entry+roll overlap and behavior.
   extraRollDrawsIf12RoomsAllRoll:count?12*rollFaces/(6*count):0
  }];
 }));
 const runRows=rows.map(r=>({
  hero:r.hero,arm:r.arm,seed:r.seed,
  roomsCleared:r.roomsCleared,
  freshEncounterStarts:r.encounterStarts,
  monsterAppearances:countSum(r.coverage?.monsterVisits),
  ordinaryMonsterAppearances:r.ordinaryEncounters,
  fights:r.ordinaryFights,
  uniqueMonsters:Object.keys(r.coverage?.monsterVisits||{}).length,
  vaultReached:r.vaultReached,
  enteredFinal:r.finalMetrics?.vaultEntered??null,
  drawnMonsterCards:r.finalMetrics?.monsterDraws??null,
  conditionalRoomBands:r.finalMetrics?.roomRollBands??null,
  selectedRoomChoices:r.finalMetrics?.roomChoices??null,
  monsterById:r.coverage?.monsterVisits??{}
 }));
 const armSummaries=Object.fromEntries([...new Set(rows.map(r=>r.arm))].map(arm=>{
  const subset=runRows.filter(r=>r.arm===arm),n=subset.length;
  const sum=k=>subset.reduce((a,x)=>a+(x[k]??0),0);
  const complete=subset.filter(r=>r.roomsCleared>=36);
  return [arm,{
   n,
   meanCompletedRooms:n?sum("roomsCleared")/n:null,
   meanFreshMonsterStarts:n?sum("freshEncounterStarts")/n:null,
   meanMonsterAppearances:n?sum("monsterAppearances")/n:null,
   meanOrdinaryMonsterAppearances:n?sum("ordinaryMonsterAppearances")/n:null,
   meanOrdinaryFights:n?sum("fights")/n:null,
   full36Runs:complete.length,
   meanOrdinaryMonsterAppearancesAmongFull36:complete.length?
    complete.reduce((x,r)=>x+r.ordinaryMonsterAppearances,0)/complete.length:null,
   per36LinearExtrapolation:n&&sum("roomsCleared")?
    sum("ordinaryMonsterAppearances")*36/sum("roomsCleared"):null,
   warning:"Linear per-36 extrapolation is descriptive, not the distribution of actual 36-Room expeditions."
  }];
 }));
 return {
  schema:"printed-monster-frequency-audit-v1",
  methodology:{
   roomSources:["V2_ROOMS","PRINT_ONLY_ROOMS"],
   stageGoal:12,physicalDeckIsSampledWithoutReplacement:true,
   printedEntryMonsterDrawsAreGuaranteed:true,
   chanceDrawsRequireTheSelectedRoomAction:true,
   narrativeTextDoesNotProveAResolvedEngineOperation:true,
   noRulesOrCardChanges:true
  },
  totalCards:cards.length,byStage,cards,
  empirical:{runs:runRows.length,byArm:armSummaries},
  hypotheses:[
   "Only a subset of regional Rooms require a Monster draw on entry.",
   "Many additional Monster draws appear on 1-2 faces of OPTIONAL d6 rolls; risk-averse policies choose alternative options.",
   "The printed 36-Room expedition draws a random sample of regional Rooms, not every Monster-triggering card.",
   "Monster appearances, newly drawn Monsters, fights and successful kills are distinct quantities.",
   "Returning Will-o'-Wisps can reappear without raising the fresh encounterStarts counter."
  ]
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),opts={};
 for(let i=0;i<args.length;i+=2){
  if(!["--trials","--out"].includes(args[i])||!args[i+1]||
   Object.hasOwn(opts,args[i]))throw Error("Invalid audit argument "+args[i]);
  opts[args[i]]=args[i+1];
 }
 const rows=opts["--trials"]?readFileSync(opts["--trials"],"utf8")
  .split("\n").filter(Boolean).map(JSON.parse):[];
 const report=auditMonsterFrequency({rows});
 const concise={schema:report.schema,totalCards:report.totalCards,
  byStage:report.byStage,empirical:report.empirical,
  hypotheses:report.hypotheses};
 console.log(JSON.stringify(concise,null,2));
 if(opts["--out"])writeFileSync(opts["--out"],
  JSON.stringify(report,null,2)+"\n");
}
