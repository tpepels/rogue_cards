/**
 * Controlled local decisions study, current canonical cards + HP.
 * Usage:
 *   node scripts/study-decisions.mjs 200 > decision-study.json
 *
 * Same seeds, parties and cards across six alternative simulator policies.
 * The canonical rules and default simulator policy are unchanged.
 */
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition,researchPolicies} from "../src/expedition-campaign.js";

const usage="Usage: node scripts/study-decisions.mjs [runsPerSetup 1..3000]";
const n=Number(process.argv[2]??200);
if(process.argv.length>3||!Number.isSafeInteger(n)||n<1||n>3000)throw Error(usage);

const profiles=["none","parley","seal","conserve","rooms","adaptive"];
for(const p of profiles)if(!researchPolicies.includes(p))throw Error("Unavailable research profile: "+p);
const parties=[...HEROES.map(h=>[h.id]),["warrior","priest"],
 ["knight","wizard"],["rogue","witch"],["thief","monk"]];
const strategies=["magic","treasure"];
const seed0=0x120a2026,step=0x9e3779b1;
const seedAt=i=>(seed0+Math.imul(i,step))>>>0;
let simulated=0,unresolved=0,stalls=0;
function experiment(){
 return {n:0,wins0:0,wins1:0,vault0:0,vault1:0,
  only0:0,only1:0,both:0,neither:0,
  damage0:0,damage1:0,spent0:0,spent1:0,activated0:0,activated1:0,
  magic0:0,magic1:0,negotiations0:0,negotiations1:0,
  sealAttempts0:0,sealAttempts1:0,sealWins0:0,sealWins1:0,
  decisions:{parleyConsidered:0,parleySelected:0,spellsReserved:0,
   sealConsidered:0,sealSelected:0}};
}
function record(t,a,b){
 const va=Number(a.cleared===9),vb=Number(b.cleared===9);
 t.n++;t.wins0+=Number(a.won);t.wins1+=Number(b.won);
 t.vault0+=va;t.vault1+=vb;
 t.only0+=Number(a.won&&!b.won);t.only1+=Number(!a.won&&b.won);
 t.both+=Number(a.won&&b.won);t.neither+=Number(!a.won&&!b.won);
 t.damage0+=a.damage;t.damage1+=b.damage;
 t.spent0+=a.spent;t.spent1+=b.spent;
 t.activated0+=a.activated;t.activated1+=b.activated;
 t.magic0+=a.magicActions;t.magic1+=b.magicActions;
 t.negotiations0+=a.negotiations;t.negotiations1+=b.negotiations;
 t.sealAttempts0+=Number(a.sealAttempt);t.sealAttempts1+=Number(b.sealAttempt);
 t.sealWins0+=Number(a.sealWin);t.sealWins1+=Number(b.sealWin);
 for(const k of Object.keys(t.decisions))t.decisions[k]+=b.researchDecisions?.[k]??0;
}
function finish(t){
 const d=t.n?(t.wins1-t.wins0)/t.n:null;
 const q=t.n?(t.only0+t.only1)/t.n:null;
 const se=t.n?Math.sqrt(Math.max(0,q-d*d)/t.n):null;
 return {n:t.n,baselineWinRate:t.n?t.wins0/t.n:null,
  alternativeWinRate:t.n?t.wins1/t.n:null,
  pairedWinDelta:d,ci95:t.n?[Math.max(-1,d-1.96*se),Math.min(1,d+1.96*se)]:null,
  baselineVaultRate:t.n?t.vault0/t.n:null,
  alternativeVaultRate:t.n?t.vault1/t.n:null,
  vaultDelta:t.n?(t.vault1-t.vault0)/t.n:null,
  damageDelta:t.n?(t.damage1-t.damage0)/t.n:null,
  spentDelta:t.n?(t.spent1-t.spent0)/t.n:null,
  activatedDelta:t.n?(t.activated1-t.activated0)/t.n:null,
  magicActionDelta:t.n?(t.magic1-t.magic0)/t.n:null,
  parleyAttemptDelta:t.n?(t.negotiations1-t.negotiations0)/t.n:null,
  sealAttemptDelta:t.n?(t.sealAttempts1-t.sealAttempts0)/t.n:null,
  sealWinDelta:t.n?(t.sealWins1-t.sealWins0)/t.n:null,
  discordant:t.only0+t.only1,
  decisions:t.decisions};
}
function assertValid(r){
 simulated++;unresolved+=r.unresolved;stalls+=Number(r.roundLimit);
 return r;
}
const buckets={};
for(const strategy of strategies){
 buckets[strategy]={};
 for(const k of ["solo","duo"])
  buckets[strategy][k]=Object.fromEntries(profiles.slice(1).map(p=>[p,experiment()]));
}
const heroBuckets=Object.fromEntries(HEROES.map(h=>[h.id,
 Object.fromEntries(strategies.map(strategy=>[strategy,
  Object.fromEntries(profiles.slice(1).map(p=>[p,experiment()]))]))]));
for(const strategy of strategies)for(const heroes of parties)for(let i=0;i<n;i++){
 const options={seed:seedAt(i),heroes,strategy};
 const base=assertValid(simulateFullExpedition(options));
 for(const profile of profiles.slice(1)){
  const alternate=assertValid(simulateFullExpedition({...options,researchPolicy:profile}));
  record(buckets[strategy][heroes.length===1?"solo":"duo"][profile],base,alternate);
  if(heroes.length===1)record(heroBuckets[heroes[0]][strategy][profile],base,alternate);
 }
}
const completed={
 experiment:"rogue-cards-decision-policy-ablation-v1",
 commit:null,seed:seed0,step,runsPerPartyStrategy:n,
 partySetups:parties,strategies,profiles,
 simulated,unresolved,stalls,
 groups:Object.fromEntries(Object.entries(buckets).map(([strategy,byClass])=>[
  strategy,Object.fromEntries(Object.entries(byClass).map(([kind,byProfile])=>[
   kind,Object.fromEntries(Object.entries(byProfile).map(([p,t])=>[p,finish(t)]))
  ]))])),
 soloHeroes:Object.fromEntries(Object.entries(heroBuckets).map(([id,byStrategy])=>[
  id,Object.fromEntries(Object.entries(byStrategy).map(([strategy,byProfile])=>[
   strategy,Object.fromEntries(Object.entries(byProfile).map(([p,t])=>[p,finish(t)]))
  ]))])),
 notes:[
  "Read-only simulator policy experiments: no printed cards or game rules changed.",
  "Each experiment pairs exact seeds, party and base strategy.",
  "A policy can change how many random numbers are consumed after an intervention.",
  "95% normal intervals for paired binary win deltas, unadjusted for multiple tests.",
  "Adaptive profile combines contextual Rooms, selective PARLEY, conditional Seal and conserving Magic consumables.",
  "Baseline policies are preserved for reproducibility; do not replace older baselines silently."
 ]
};
try{completed.commit=execFileSync("git",["rev-parse","HEAD"],
 {encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
if(unresolved||stalls)process.exitCode=1;
process.stdout.write(JSON.stringify(completed,null,2)+"\n");
