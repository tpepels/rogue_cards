import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateBalanceTargets,auditCardAndItemUse} from "../src/experiment-targets.js";
import {ALL_ROOMS,ALL_MONSTERS,ALL_OBJECTS,FIXED_CARDS} from "../src/decks.js";
import {HEROES} from "../src/tabletop-data.js";
const spec=JSON.parse(readFileSync(new URL(
 "../config/everything-goes-targets.v1.json",import.meta.url),"utf8"));
const twoChoice=spec.metrics.find(x=>x.id==="room_option_usefulness");
const loot=spec.metrics.find(x=>x.id==="new_items_per_12_rooms");
function organic(i,heroes=["warrior"],won=false){
 return {i,group:"survey",heroes,won,byStage:{
  UPPER:{normal:12},MIDDLE:{normal:12},DEEP:{normal:12}},
  ordinaryEncounters:18,ordinaryFightStarts:11,
  combatContextDamage:15,partyMaxHp:20,normalRoomEntries:36,
  oddItemActivations:7,itemAcquisitionsDuringPlay:15,
  vaultReached:i%2===0};
}
test("pre-registered targets retain every answer, and do not invent question 7",()=>{
 assert.equal(spec.schema,"everything-goes-targets-v1");
 assert.equal(spec.metrics.length,10);
 assert.deepEqual(spec.userDecisions,{"1":"C","2":"A","3":"B",
  "4":"C","5":"B","6":"B","7":null,"8":"A","9":"C","10":"A"});
 assert.equal(loot.ideal,null);
 assert.equal(loot.acceptable,null);
 assert.equal(loot.status,"UNSET_USER_CHOICE");
 assert.equal(twoChoice.noSelectionParity,true);
 assert.equal(spec.physicalTime[0].ideal,105);
 assert.equal(spec.physicalTime[1].ideal,135);
 assert.equal(spec.itemAudit.catalogue.allDesigns,193);
});
test("pilot never receives a confident success verdict from insufficient data",()=>{
 const result=evaluateBalanceTargets(spec,[organic(0)],{complete:false});
 assert.equal(result.metrics.find(x=>x.id==="solo_win_rate").status,
  "INSUFFICIENT_EXPOSURE");
 assert.equal(result.metrics.find(x=>x.id==="new_items_per_12_rooms").status,
  "UNSET");
 assert.equal(result.metrics.find(x=>x.id==="room_option_usefulness").status,
  "FOCUSED_TEST_REQUIRED");
 assert.equal(result.physical[0].status,"NOT_MEASURED_IN_SIMULATION");
 assert.equal(result.conclusionsAllowed,false);
});
test("unambiguous bad win rate triggers intervention only with statistical power",()=>{
 const population=Array.from({length:600},(_,i)=>organic(i,
  ["warrior"],false));
 const result=evaluateBalanceTargets(spec,population,{complete:true});
 const solo=result.metrics.find(x=>x.id==="solo_win_rate");
 assert.equal(solo.status,"INTERVENE");
 assert.equal(solo.observation.estimate,0);
 const vault=result.metrics.find(x=>x.id==="vault_reach_rate");
 assert.equal(vault.observation.estimate,0.5);
 assert.equal(vault.status,"ON_TARGET");
});
test("solo spread is stratified and depends on per-Hero coverage",()=>{
 const heroes=HEROES.map(h=>h.id);
 const population=heroes.flatMap((h,k)=>Array.from({length:80},(_,i)=>
  organic(k*80+i,[h],i<40)));
 const result=evaluateBalanceTargets(spec,population,{complete:true});
 const spread=result.metrics.find(x=>x.id==="solo_hero_win_spread");
 assert.equal(spread.observation.estimate,0);
 assert.equal(spread.observation.sampleSize,640);
 assert.ok(["ON_TARGET","UNCERTAIN"].includes(spread.status));
});
test("catalogue-wide audit distinguishes never acquired, unused and never triggered",()=>{
 const item=ALL_OBJECTS[0];
 const coverage={aggregate:{
  objectAcquisitions:{[item.id]:5},
  itemOpportunities:{[item.id]:{total:40,byMode:{}}},
  itemUses:{},itemPassiveEffects:{},
  objectActivations:{},objectRoomExposures:{},objectEquippedRoomExposures:{},
  monsterVisits:{},monsterFightStartsById:{},monsterKillsById:{},
  monsterParleyAttemptsById:{},monsterParleyWinsById:{},
  roomOptionAvailable:{},roomChoices:{}
 },visits:{}};
 const audit=auditCardAndItemUse(spec,coverage,{},{
  rooms:ALL_ROOMS,monsters:ALL_MONSTERS,items:ALL_OBJECTS,fixed:FIXED_CARDS});
 assert.equal(audit.catalog.combined,193);
 assert.equal(audit.catalog.items,79);
 assert.equal(audit.catalog.monsters,24);
 assert.equal(audit.catalog.rooms,79);
 assert.equal(audit.catalog.fixed,11);
 assert.equal(audit.items[0].finding,
  "TRIGGER_OFFERED_BUT_NEVER_USED_REVIEW_POLICY_OR_ENGINE");
 assert.equal(audit.items[1].finding,"UNOBSERVED_ACQUISITION_TARGETED_TEST");
 assert.ok(audit.flags.itemsNeverAcquired.length>0);
});
