/**
 * Focused Phase 5 balance experiments; no changes to printed rules.
 *
 *   npm run balance:matched -- 1000 > matched-vault.json
 *   npm run balance:rooms -- 500 > room-policies.json
 *   npm run balance:diagnostics -- 1000 > diagnostics.json
 *
 * Optional --jsonl writes individual expedition outcomes (potentially large).
 */
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {strategies,roomPolicies} from "../src/expedition-runtime.js";
import {simulateFullExpedition,simulateFullBatch} from "../src/expedition-campaign.js";

const MODES=["vault","rooms","diagnostics"];
const SEED=0x120a2026,STEP=0x9e3779b1;
const PAIRS=HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>[h.id,other.id]));
const SETUPS=[...HEROES.map(h=>[h.id]),...PAIRS];
const [mode,...args]=process.argv.slice(2);
const options=args.filter(x=>x.startsWith("--"));
const positional=args.filter(x=>!x.startsWith("--"));
const USAGE="Usage: node scripts/analyze-balance.mjs <vault|rooms|diagnostics> [runs: 1..100000] [--jsonl]";
if(!MODES.includes(mode)||positional.length>1||
 options.some(x=>x!=="--jsonl")||options.length>1)throw Error(USAGE);
const runs=positional.length?Number(positional[0]):250;
if(!Number.isSafeInteger(runs)||runs<1||runs>100000)throw Error(USAGE);
const jsonl=options.includes("--jsonl");
let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}
catch {/* Git is optional for exported source trees. */}
const selected=(report)=>({
 won:report.won,cleared:report.cleared,damage:report.damage,rounds:report.rounds,
 failureStage:report.failureStage,failureCause:report.failureCause,
 sealAvailable:report.sealAvailable,sealAttempt:report.sealAttempt,sealWin:report.sealWin,
 vaultState:report.vaultState,remainingHP:report.remainingHP,
 objectsEverOwned:report.objectsEverOwned,
 objectAcquisitions:report.objectAcquisitions,
 objectActivations:report.objectActivations,
 objectRoomExposures:report.objectRoomExposures,
 objectEquippedRoomExposures:report.objectEquippedRoomExposures,
 roomChoices:report.roomChoices,roomOptionAvailable:report.roomOptionAvailable,
 unresolved:report.unresolved,roundLimit:report.roundLimit
});
const emit=(record)=>process.stdout.write(JSON.stringify(record)+"\n");
const header={
 experiment:"rogue-cards-policy-validation-v2",mode,commit,seed:SEED,
 runsPerConfiguration:runs,strategies,
 soloHeroes:HEROES.length,distinctTwoHeroParties:PAIRS.length,
 totalPartySetups:SETUPS.length,
 notes:[
  "Scripted policies are not trained or optimal human players.",
  "Matched Vault comparisons replay the SAME seed and Room policy; pre-Vault resources are checked for equality.",
  "Room-policy comparisons use common starting seeds but diverge in subsequent random rolls; they are NOT matched state counterfactuals.",
  "Object room exposures count inventory copies held at entry, not eligible trigger opportunities. Owned-item win associations are observational, not causal.",
  "The historical balance command and default policy remain unchanged."
 ]};
let failures=0;
if(mode==="vault"){
 const results=[];
 for(const strategy of strategies)for(const heroes of SETUPS){
  const totals={runs,vaultArrivals:0,eligibleSealStates:0,
   winsFight:0,winsSealIfAvailable:0,eligibleWinsFight:0,
   eligibleWinsSeal:0,eligibleOnlyFight:0,eligibleOnlySeal:0,
   eligibleBoth:0,eligibleNeither:0,attempts:0,sealWins:0,
   failedSealThenWardenWins:0,unresolved:0,stalls:0,
   vaultPartyHP:0,vaultPartyMaxHP:0,vaultMagicHeld:0};
  for(let i=0;i<runs;i++){
   const seed=(SEED+i*STEP)>>>0;
   const common={seed,heroes,strategy,roomPolicy:"scripted"};
   const fight=simulateFullExpedition({...common,vaultChoice:"fight"});
   const seal=simulateFullExpedition({...common,vaultChoice:"seal-if-available"});
   if(JSON.stringify(fight.vaultState)!==JSON.stringify(seal.vaultState)||
      fight.cleared!==seal.cleared)throw Error("Vault paths differ BEFORE choice: "+strategy+" "+heroes+" "+seed);
   totals.winsFight+=Number(fight.won);
   totals.winsSealIfAvailable+=Number(seal.won);
   totals.unresolved+=fight.unresolved+seal.unresolved;
   totals.stalls+=Number(fight.roundLimit)+Number(seal.roundLimit);
   totals.attempts+=Number(seal.sealAttempt);
   totals.sealWins+=Number(seal.sealWin);
   totals.failedSealThenWardenWins+=Number(seal.sealAttempt&&seal.won&&!seal.sealWin);
   if(fight.vaultState){
    totals.vaultArrivals++;
    totals.vaultPartyHP+=fight.vaultState.hp.reduce((a,b)=>a+b,0);
    totals.vaultPartyMaxHP+=fight.vaultState.maxHP.reduce((a,b)=>a+b,0);
    totals.vaultMagicHeld+=fight.vaultState.magicHeld;
   }
   const eligible=!!fight.vaultState?.sealAffordable&&fight.vaultState.hp.some(hp=>hp>0);
   if(eligible){
    totals.eligibleSealStates++;
    totals.eligibleWinsFight+=Number(fight.won);
    totals.eligibleWinsSeal+=Number(seal.won);
    if(fight.won&&seal.won)totals.eligibleBoth++;
    else if(fight.won)totals.eligibleOnlyFight++;
    else if(seal.won)totals.eligibleOnlySeal++;
    else totals.eligibleNeither++;
   }
   if(jsonl)emit({...header,seed,heroes,strategy,eligible,options:{
    fight:selected(fight),sealIfAvailable:selected(seal)}});
  }
  if(totals.unresolved||totals.stalls)failures++;
  results.push({strategy,heroes,...totals,
   fightWinRate:totals.winsFight/runs,
   sealIfAvailableWinRate:totals.winsSealIfAvailable/runs,
   pairedOverallDelta:(totals.winsSealIfAvailable-totals.winsFight)/runs,
   pairedEligibleDelta:totals.eligibleSealStates?
    (totals.eligibleWinsSeal-totals.eligibleWinsFight)/totals.eligibleSealStates:null});
 }
 if(!jsonl)process.stdout.write(JSON.stringify({...header,
  totalExpeditions:runs*SETUPS.length*strategies.length*2,
  comparisonCount:runs*SETUPS.length*strategies.length,
  groups:results},null,2)+"\n");
}else{
 const policies=mode==="rooms"?roomPolicies:["scripted"];
 const results=[];
 for(const strategy of strategies)for(const heroes of SETUPS)for(const roomPolicy of policies){
  if(jsonl){
   for(let i=0;i<runs;i++){
    const seed=(SEED+i*STEP)>>>0;
    const report=simulateFullExpedition({seed,heroes,strategy,roomPolicy,vaultChoice:"policy"});
    failures+=Number(report.unresolved||report.roundLimit);
    emit({...header,seed,heroes,strategy,roomPolicy,result:selected(report)});
   }
  }else{
   const report=simulateFullBatch({runs,seed:SEED,heroes,strategy,roomPolicy});
   failures+=Number(report.unresolvedEffects||report.stalledExpeditions);
   results.push(report);
  }
 }
 if(!jsonl)process.stdout.write(JSON.stringify({...header,
  roomPolicies:policies,configurations:results.length,
  totalExpeditions:runs*SETUPS.length*strategies.length*policies.length,
  results},null,2)+"\n");
}
if(failures)process.exitCode=1;
