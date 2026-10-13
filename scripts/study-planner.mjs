/**
 * Reproducible, opt-in, decision-planner comparison.
 *   node scripts/study-planner.mjs 100 > planner-study.json
 *   node scripts/study-planner.mjs 300 --all --seed 68413 > planner-study.json
 * Only the decisions change: no printed cards, rules or default policies.
 */
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";

const args=process.argv.slice(2);
const usage="Usage: node scripts/study-planner.mjs [runs 1..3000] [--all] [--seed UINT32] [--progress]";
const seedPos=args.indexOf("--seed");
if(seedPos>=0&&(seedPos===args.length-1||! /^\d+$/.test(args[seedPos+1])))
 throw Error(usage);
const seed=seedPos>=0?Number(args[seedPos+1]):0x120a2026;
const clean=args.filter((a,i)=>seedPos<0||(i!==seedPos&&i!==seedPos+1));
if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error(usage);
const flags=clean.filter(x=>x.startsWith("--")),parts=clean.filter(x=>!x.startsWith("--"));
if(parts.length>1||flags.some(x=>!["--all","--progress"].includes(x))||
 new Set(flags).size!==flags.length)throw Error(usage);
const runs=Number(parts[0]??100);
if(!Number.isSafeInteger(runs)||runs<1||runs>3000)throw Error(usage);
const all=flags.includes("--all"),progress=flags.includes("--progress");
// Stratify deterministic seeds by strategy and party. Earlier reports reused
// the same seed across every Hero party, understating aggregate uncertainty.
const seedAt=(strategyIndex,partyIndex,runIndex)=>
 (seed+Math.imul(runIndex,0x9e3779b1)+
  Math.imul(partyIndex+1,0x85ebca6b)+Math.imul(strategyIndex+1,0xc2b2ae35))>>>0;
const parties=all?[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>[h.id,other.id]))]:
 [...HEROES.map(h=>[h.id]),["warrior","priest"],["knight","wizard"],
  ["rogue","witch"],["thief","monk"]];
const strategies=["magic","treasure"];
const candidates=[
 {name:"legacy-adaptive",researchPolicy:"adaptive"},
 {name:"planner-balanced",researchPolicy:"planner",plannerRisk:"balanced"},
 {name:"planner-cautious",researchPolicy:"planner",plannerRisk:"cautious"},
 {name:"planner-bold",researchPolicy:"planner",plannerRisk:"bold"}
];
const counter=()=>({n:0,winBefore:0,winAfter:0,discordantBefore:0,
 discordantAfter:0,vaultBefore:0,vaultAfter:0,damageBefore:0,damageAfter:0,
 roundsBefore:0,roundsAfter:0,spentBefore:0,spentAfter:0,
 activatesBefore:0,activatesAfter:0,magicBefore:0,magicAfter:0,
 negotiationsBefore:0,negotiationsAfter:0,sealBefore:0,sealAfter:0,
 sealWinsBefore:0,sealWinsAfter:0,decisions:{},failures:{},sample:null});
function record(c,a,b){
 c.n++;c.winBefore+=Number(a.won);c.winAfter+=Number(b.won);
 c.discordantBefore+=Number(a.won&&!b.won);
 c.discordantAfter+=Number(!a.won&&b.won);
 c.vaultBefore+=Number(a.cleared===9);c.vaultAfter+=Number(b.cleared===9);
 c.damageBefore+=a.damage;c.damageAfter+=b.damage;
 c.roundsBefore+=a.rounds;c.roundsAfter+=b.rounds;
 c.spentBefore+=a.spent;c.spentAfter+=b.spent;
 c.activatesBefore+=a.activated;c.activatesAfter+=b.activated;
 c.magicBefore+=a.magicActions;c.magicAfter+=b.magicActions;
 c.negotiationsBefore+=a.negotiations;c.negotiationsAfter+=b.negotiations;
 c.sealBefore+=Number(a.sealAttempt);c.sealAfter+=Number(b.sealAttempt);
 c.sealWinsBefore+=Number(a.sealWin);c.sealWinsAfter+=Number(b.sealWin);
 if(!b.won)c.failures[b.failureStage]=(c.failures[b.failureStage]||0)+1;
 for(const [k,v] of Object.entries(b.plannerDecisions||b.researchDecisions||{}))
  c.decisions[k]=(c.decisions[k]||0)+v;
 if(!c.sample&&b.plannerTrace?.length&&c.n<=5)
  c.sample={seed:b.plannerSeed??null,trace:b.plannerTrace};
}
function summary(c){
 const n=c.n,d=(c.winAfter-c.winBefore)/n;
 const q=(c.discordantBefore+c.discordantAfter)/n;
 const se=Math.sqrt(Math.max(0,q-d*d)/n);
 return {n,baselineWinRate:c.winBefore/n,winRate:c.winAfter/n,
  delta:d,ci95:[Math.max(-1,d-1.96*se),Math.min(1,d+1.96*se)],
  reversedWins:c.discordantBefore,recoveredWins:c.discordantAfter,
  baselineVaultRate:c.vaultBefore/n,vaultRate:c.vaultAfter/n,
  vaultDelta:(c.vaultAfter-c.vaultBefore)/n,
  damageDelta:(c.damageAfter-c.damageBefore)/n,
  roundsDelta:(c.roundsAfter-c.roundsBefore)/n,
  spentDelta:(c.spentAfter-c.spentBefore)/n,
  itemActivationDelta:(c.activatesAfter-c.activatesBefore)/n,
  magicActionDelta:(c.magicAfter-c.magicBefore)/n,
  negotiationDelta:(c.negotiationsAfter-c.negotiationsBefore)/n,
  sealAttemptDelta:(c.sealAfter-c.sealBefore)/n,
  sealWinDelta:(c.sealWinsAfter-c.sealWinsBefore)/n,
  choices:c.decisions,failures:c.failures,sample:c.sample};
}
const records=Object.fromEntries(strategies.map(strategy=>[
 strategy,{solo:Object.fromEntries(candidates.map(x=>[x.name,counter()])),
 duo:Object.fromEntries(candidates.map(x=>[x.name,counter()]))}]));
const heroes=Object.fromEntries(HEROES.map(h=>[h.id,Object.fromEntries(strategies.map(st=>[
 st,Object.fromEntries(candidates.map(x=>[x.name,counter()]))]))]));
// Per-party results expose weak Hero combinations hidden by the duo average.
const partyRecords=Object.fromEntries(strategies.map(st=>[st,
 Object.fromEntries(parties.map(p=>[p.join("+"),
  Object.fromEntries(candidates.map(c=>[c.name,counter()]))]))]));
let simulated=0,unresolved=0,stalls=0,partiesDone=0;
function validate(r){
 simulated++;unresolved+=r.unresolved;stalls+=Number(r.roundLimit);
 return r;
}
for(const [strategyIndex,strategy] of strategies.entries())
for(const [partyIndex,party] of parties.entries()){
 for(let i=0;i<runs;i++){
  const opts={seed:seedAt(strategyIndex,partyIndex,i),heroes:party,strategy};
  const base=validate(simulateFullExpedition(opts));
  for(const variant of candidates){
   const result=validate(simulateFullExpedition({...opts,
    researchPolicy:variant.researchPolicy,plannerRisk:variant.plannerRisk||"balanced"}));
   record(records[strategy][party.length===1?"solo":"duo"][variant.name],base,result);
   record(partyRecords[strategy][party.join("+")][variant.name],base,result);
   if(party.length===1)record(heroes[party[0]][strategy][variant.name],base,result);
  }
 }
 partiesDone++;
 if(progress)process.stderr.write("Completed "+partiesDone+"/"+parties.length*strategies.length+
  " party/strategy configurations; "+simulated+" expeditions\n");
}
let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const output={
 experiment:"rogue-cards-planner-v2",commit,seed,
 randomization:"Independent deterministic seed sequences per strategy and Hero party; paired within each party/strategy/run",
 policyProtocol:"Scripted full-effect simulator; held-out seed required for confirmatory comparison; not human play",
 runsPerPartyStrategy:runs,parties,strategies,candidates,
 simulated,unresolved,stalls,
 groups:Object.fromEntries(Object.entries(records).map(([st,cls])=>[
  st,Object.fromEntries(Object.entries(cls).map(([kind,modes])=>[
   kind,Object.fromEntries(Object.entries(modes).map(([name,c])=>[name,summary(c)]))
  ]))])),
 partyResults:Object.fromEntries(Object.entries(partyRecords).map(([st,ps])=>[st,
  Object.fromEntries(Object.entries(ps).map(([party,variants])=>[party,
   Object.fromEntries(Object.entries(variants).map(([name,c])=>[name,summary(c)]))
  ]))])),
 soloHeroes:Object.fromEntries(Object.entries(heroes).map(([h,sts])=>[
  h,Object.fromEntries(Object.entries(sts).map(([st,modes])=>[
   st,Object.fromEntries(Object.entries(modes).map(([name,c])=>[name,summary(c)]))
  ]))])),
 limitations:[
  "Heuristic planning uses only available public state and approximate utility, not optimal play.",
  "Paired seeds start equivalent state generation, but random draw streams diverge after policy decisions; they are not identical future luck.",
  "Confidence intervals are approximate normal intervals, not adjusted for multiple tests.",
  "Policy win rates cannot by themselves identify a defective Item or Room rule.",
  "Only Magic and Treasure strategies are altered in this experiment.",
  "Room and Item execution still uses scripted autopilot heuristics outside the planner's decision points.",
  "The candidate weights were refined after inspecting earlier planner-v1 reports. Use independent --seed holdout runs for confirmation.",
  "No simulated win rate establishes what real human players will achieve; tabletop validation is required."
 ]
};
if(unresolved||stalls)process.exitCode=1;
process.stdout.write(JSON.stringify(output,null,2)+"\n");
