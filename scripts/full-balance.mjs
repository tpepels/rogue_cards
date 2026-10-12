import {execFileSync} from "node:child_process";
import {simulateFullBatch} from "../src/expedition-campaign.js";
import {HEROES} from "../src/tabletop-data.js";
import {strategies} from "../src/expedition-runtime.js";

// Same fixed seed and setup order as the original Phase 5 benchmark.
// This command changes reporting only; game rules and policies are untouched.
const SEED=0x120a2026;
const SETUPS=[...HEROES.map(h=>[h.id]),["warrior","priest"],["knight","wizard"],
 ["rogue","witch"],["thief","monk"]];
const USAGE="Usage: npm run balance -- [runs: 1..100000] [--json]";

function argumentsFor(args){
 const flags=args.filter(arg=>arg.startsWith("--"));
 const positional=args.filter(arg=>!arg.startsWith("--"));
 if(flags.some(flag=>flag!=="--json")||flags.length>1||positional.length>1)
  throw new Error(USAGE);
 const runs=positional.length?Number(positional[0]):300;
 if(!Number.isSafeInteger(runs)||runs<1||runs>100000)throw new Error(USAGE);
 return {runs,json:flags.includes("--json")};
}
const {runs,json}=argumentsFor(process.argv.slice(2));
let commit=null;
try {commit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}
catch { /* Report is still useful from an exported source tree. */ }

const results=[];
for(const strategy of strategies){
 for(const heroes of SETUPS){
  const r=simulateFullBatch({runs,seed:SEED,heroes,strategy});
  results.push(r);
  if(r.unresolvedEffects||r.stalledExpeditions)process.exitCode=1;
 }
}
const fmt=x=>(100*x).toFixed(1);
function summary(rows){
 const total=rows.reduce((n,r)=>n+r.runs,0);
 const count=name=>rows.reduce((n,r)=>n+r[name],0);
 const wins=count("winCount"),vault=count("vaultCount");
 const seals=count("sealWins"),attempts=count("sealAttempts");
 return {expeditions:total,wins,vaultArrivals:vault,sealAttempts:attempts,
  sealWins:seals,wardenWins:wins-seals,
  winRate:wins/total,vaultRate:vault/total,
  vaultWinRate:vault?wins/vault:0,
  sealAttemptRateAtVault:vault?attempts/vault:0,
  sealSuccessRatePerAttempt:attempts?seals/attempts:0,
  unresolvedEffects:count("unresolvedEffects"),
  stalledExpeditions:count("stalledExpeditions")};
}
if(json){
 process.stdout.write(JSON.stringify({
  experiment:"rogue-cards-full-effect-detailed",
  model:"phase5-explicit-card-policy-v1",
  commit,seed:SEED,runsPerSetupPerStrategy:runs,
  totalExpeditions:results.length*runs,
  strategies,setups:SETUPS,
  warning:"Policy-dependent simulated outcomes, not optimal or human win rates. Policies do not have the same Warden-versus-seal decision.",
  definitions:{
   sealAvailabilityAtVault:"Fraction of Vault arrivals able to pay the seal cost.",
   sealAttemptRateAtVault:"Fraction of Vault arrivals that actually attempted a seal.",
   sealSuccessRatePerAttempt:"Fraction of attempted seals that succeeded.",
   sealWinRateAtVault:"Fraction of all Vault arrivals won via seal, including those who never attempted one.",
   cardActivations:"Number of actual activations, not number of times cards were drawn or available.",
   operations:"Number of executed effect operations. These are not independent expeditions."
  },
  summary:summary(results),
  byStrategy:Object.fromEntries(strategies.map(strategy=>[
   strategy,summary(results.filter(r=>r.strategy===strategy))])),
  byPartySize:{
   solo:summary(results.filter(r=>r.heroes.length===1)),
   cooperative:summary(results.filter(r=>r.heroes.length===2))
  },
  results
 },null,2)+"\n");
}else{
 console.log("ROGUE CARDS / FULL-EFFECT EXPLICIT POLICY MONTE CARLO");
 console.log("Measured outcomes are POLICY-DEPENDENT, not verified optimal or human win rates.");
 console.log("Runs per setup per policy:",runs);
 console.log("Strategy\tHeroes\tWin%\tVault%\tSpells/exp\tPotions/exp\tNegotiations/exp\tUnresolved\tStalls");
 for(const r of results)
  console.log([r.strategy,r.heroes.join("+"),fmt(r.winRate),fmt(r.vaultRate),
   r.meanMagic.toFixed(2),r.meanPotions.toFixed(2),r.meanNegotiations.toFixed(2),
   r.unresolvedEffects,r.stalledExpeditions].join("\t"));
}
