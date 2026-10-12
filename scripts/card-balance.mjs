/**
 * Controlled card-balance experiments. All 52 Objects and 36 regional Rooms.
 *
 * npm run balance:items -- 200 > item-balance.json
 * npm run balance:room-cards -- 200 > room-card-balance.json
 *
 * Item comparison: identical seed, standard starting inventory versus one
 * additional EXISTING copy of the named Item taken out of the deck. This
 * estimates the marginal value of an extra resource, not inherent Item power.
 *
 * Room comparison: identical seed, force option 0 vs option 1 only when BOTH
 * are legal at the encounter. Check exact pre-choice state equality; conditional
 * statistics use only cases in which the Room appeared and both were legal.
 *
 * Simulations are policy-dependent, not human playtest scores.
 */
import {execFileSync} from "node:child_process";
import {OBJECTS,ROOMS} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";

const SETUPS=[["warrior"],["knight"],["wizard"],["witch"],["rogue"],["thief"],
 ["priest"],["monk"],["warrior","priest"],["knight","wizard"],
 ["rogue","witch"],["thief","monk"]];
const STRATEGIES=["survival","magic","seal"];
const SEED=0x120a2026, STEP=0x9e3779b1;
const [mode,amount]=process.argv.slice(2);
const USAGE="Usage: node scripts/card-balance.mjs <items|rooms> [runs per setup: 1..10000]";
const runs=amount===undefined?200:Number(amount);
if(!["items","rooms"].includes(mode)||process.argv.length>4||
 !Number.isSafeInteger(runs)||runs<1||runs>10000)throw Error(USAGE);

let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}
catch{/* Exported source without Git metadata. */}
const seedAt=i=>(SEED+Math.imul(i,STEP))>>>0;
const zero=()=>({eligible:0,controlWins:0,treatmentWins:0,onlyControl:0,
 onlyTreatment:0,bothWin:0,neitherWin:0,controlDamage:0,treatmentDamage:0,
 unresolved:0,stalls:0});
function add(p,a,b){
 p.eligible++;p.controlWins+=Number(a.won);p.treatmentWins+=Number(b.won);
 if(a.won&&b.won)p.bothWin++;
 else if(a.won)p.onlyControl++;
 else if(b.won)p.onlyTreatment++;
 else p.neitherWin++;
 p.controlDamage+=a.damage;p.treatmentDamage+=b.damage;
 p.unresolved+=a.unresolved+b.unresolved;
 p.stalls+=Number(a.roundLimit)+Number(b.roundLimit);
}
function finish(t){
 const n=t.eligible,delta=n?(t.treatmentWins-t.controlWins)/n:null;
 const discordant=t.onlyControl+t.onlyTreatment;
 const se=n?Math.sqrt(Math.max(0,discordant/n-delta**2)/n):null;
 return {...t,controlWinRate:n?t.controlWins/n:null,
  treatmentWinRate:n?t.treatmentWins/n:null,pairedWinDelta:delta,
  pairedDelta95CI:n?[Math.max(-1,delta-1.96*se),Math.min(1,delta+1.96*se)]:null,
  meanDamageDelta:n?(t.treatmentDamage-t.controlDamage)/n:null};
}
const report=[];
for(const card of mode==="items"?OBJECTS:ROOMS){
 const summary=zero();let trials=0,excluded=0;
 for(const heroes of SETUPS)for(const strategy of STRATEGIES)
  for(let i=0;i<runs;i++){
   const base={seed:seedAt(i),heroes,strategy,vaultChoice:"policy"};
   let a,b,eligible=false;
   if(mode==="items"){
    a=simulateFullExpedition(base);
    b=simulateFullExpedition({...base,extraObjectId:card.id});
    eligible=b.extraObjectGranted;
   }else{
    a=simulateFullExpedition({...base,forceRoomChoice:{id:card.id,choice:0}});
    b=simulateFullExpedition({...base,forceRoomChoice:{id:card.id,choice:1}});
    if(JSON.stringify(a.choiceComparison)!==JSON.stringify(b.choiceComparison))
     throw Error("Room choices diverged before decision: "+card.id+
      " "+heroes+" "+strategy+" "+seedAt(i));
    eligible=!!a.choiceComparison?.bothLegal;
   }
   trials++;
   if(!eligible){excluded++;continue;}
   add(summary,a,b);
  }
 const result={id:card.id,title:card.title,kind:mode==="items"?card.v2.kind:card.stage,
  trials,excluded,...finish(summary)};
 if(result.unresolved||result.stalls)process.exitCode=1;
 report.push(result);
}
process.stdout.write(JSON.stringify({
 experiment:"rogue-cards-card-balance-v1",commit,mode,seed:SEED,
 runsPerSetup:runs,partySetups:SETUPS,strategies:STRATEGIES,
 totalSimulatedExpeditions:report.reduce((n,r)=>n+2*r.trials,0),
 notes:mode==="items"?[
  "Paired seeds compare normal starting inventory versus one extra Item physically moved from the remaining deck.",
  "An extra resource is inherently beneficial; deltas are marginal item-gift effects, not standalone card rankings.",
  "Pairs where no copy remained in the deck are excluded. Do not infer Item weakness from non-activation."
 ]:[
  "Force choice zero and one only if the named Room is visited and both choices are legal.",
  "Both runs are verified to have exactly equal pre-choice HP, inventory, and pending Monster.",
  "After a choice changes RNG consumption, downstream paths differ. Results are policy-specific causal interventions on the same starting seed."
 ],
 results:report
},null,2)+"\n");
