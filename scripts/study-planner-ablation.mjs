/**
 * Independent causal attribution of the FOUR existing planner decisions.
 * 2^4 full factorial, matched initial seeds within party/strategy/run.
 * This is an intervention on scripted decision policies, not human play.
 *
 * node scripts/study-planner-ablation.mjs 300 --all --seed 91027381 > ablation.json
 * node scripts/report-planner-ablation.mjs ablation.json > ablation.md
 */
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {PLANNER_FEATURES,simulateFullExpedition} from "../src/expedition-campaign.js";

const args=process.argv.slice(2);
const usage="Usage: node scripts/study-planner-ablation.mjs [runs 1..2000] [--all] [--seed UINT32] [--progress]";
const seedPos=args.indexOf("--seed");
if(seedPos>=0&&(seedPos===args.length-1||!/^\d+$/.test(args[seedPos+1])))
 throw Error(usage);
const seed=seedPos<0?91027381:Number(args[seedPos+1]);
const remaining=args.filter((_,i)=>seedPos<0||(i!==seedPos&&i!==seedPos+1));
const flags=remaining.filter(x=>x.startsWith("--"));
const parts=remaining.filter(x=>!x.startsWith("--"));
if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||
 parts.length>1||flags.some(x=>!["--all","--progress"].includes(x))||
 new Set(flags).size!==flags.length)throw Error(usage);
const runs=Number(parts[0]??100);
if(!Number.isSafeInteger(runs)||runs<1||runs>2000)throw Error(usage);
const all=flags.includes("--all"),progress=flags.includes("--progress");
const parties=all?[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>[h.id,other.id]))]:
 [...HEROES.map(h=>[h.id]),["warrior","priest"],["knight","wizard"],
  ["rogue","witch"],["thief","monk"]];
const strategies=["magic","treasure"];
const configCount=1<<PLANNER_FEATURES.length;
const configuration=mask=>PLANNER_FEATURES.filter((_,i)=>mask&(1<<i));
const configs=Array.from({length:configCount},(_,mask)=>({
 mask,id:mask.toString(2).padStart(4,"0"),enabled:configuration(mask)
}));
const seedAt=(st,party,i)=>
 (seed+Math.imul(i,0x9e3779b1)+
  Math.imul(party+1,0x85ebca6b)+Math.imul(st+1,0xc2b2ae35))>>>0;

const measure=()=>({n:0,wins:0,vault:0,damage:0,rounds:0,spent:0,
 activated:0,magicActions:0,negotiations:0,sealAttempts:0,sealWins:0,
 legalItemTurns:0,chosenCombatItems:0,roomDecisions:0,parleyDecisions:0,sealDecisions:0});
const contrast=()=>({n:0,sum:0,sumsq:0});
const contrastSet=()=>({
 alone:Object.fromEntries(PLANNER_FEATURES.map(f=>[f,contrast()])),
 removed:Object.fromEntries(PLANNER_FEATURES.map(f=>[f,contrast()])),
 average:Object.fromEntries(PLANNER_FEATURES.map(f=>[f,contrast()])),
 pairwise:Object.fromEntries(PLANNER_FEATURES.flatMap((f,i)=>
  PLANNER_FEATURES.slice(i+1).map(g=>[f+"+"+g,contrast()])))
});
function group(){
 return {configs:configs.map(()=>measure()),contrasts:contrastSet()};
}
const groups={
 all:group(),
 magic:{solo:group(),duo:group()},
 treasure:{solo:group(),duo:group()}
};
const partyRecords=Object.fromEntries(strategies.map(st=>[st,
 Object.fromEntries(parties.map(p=>[p.join("+"),
  {size:p.length,n:0,wins:Array(configCount).fill(0)}]))]));
const metric=(m,r)=>{
 m.n++;m.wins+=Number(r.won);m.vault+=Number(r.cleared===9);
 m.damage+=r.damage;m.rounds+=r.rounds;m.spent+=r.spent;
 m.activated+=r.activated;m.magicActions+=r.magicActions;
 m.negotiations+=r.negotiations;m.sealAttempts+=Number(r.sealAttempt);
 m.sealWins+=Number(r.sealWin);
 const c=r.plannerDecisions||{};
 m.legalItemTurns+=c.combat_with_legal_item||0;
 m.chosenCombatItems+=c.combat_item||0;
 m.roomDecisions+=c.roomEvaluated||0;
 m.parleyDecisions+=c.parleyEvaluated||0;
 m.sealDecisions+=c.sealEvaluated||0;
};
function increment(target,v){
 target.n++;target.sum+=v;target.sumsq+=v*v;
}
function addContrasts(target,results){
 const wins=results.map(r=>Number(r.won));
 const full=configCount-1;
 for(let i=0;i<PLANNER_FEATURES.length;i++){
  const bit=1<<i,f=PLANNER_FEATURES[i];
  increment(target.alone[f],wins[bit]-wins[0]);
  increment(target.removed[f],wins[full]-wins[full^bit]);
  let sum=0;
  for(let mask=0;mask<configCount;mask++)if(!(mask&bit))
   sum+=wins[mask|bit]-wins[mask];
  increment(target.average[f],sum/(configCount/2));
  for(let j=i+1;j<PLANNER_FEATURES.length;j++){
   const bit2=1<<j,g=PLANNER_FEATURES[j];
   let interaction=0;
   for(let mask=0;mask<configCount;mask++)if(!(mask&bit)&&!(mask&bit2))
    interaction+=wins[mask|bit|bit2]-wins[mask|bit]-wins[mask|bit2]+wins[mask];
   increment(target.pairwise[f+"+"+g],interaction/(configCount/4));
  }
 }
}
function confidence(c){
 const mean=c.sum/c.n;
 const sd=Math.sqrt(Math.max(0,(c.sumsq-c.n*mean*mean)/(Math.max(1,c.n-1))));
 const se=sd/Math.sqrt(c.n);
 return {estimate:mean,ci95:[mean-1.96*se,mean+1.96*se],n:c.n};
}
function summary(g){
 return {
  n:g.configs[0].n,
  configurations:g.configs.map((m,i)=>({
   mask:i,enabled:configuration(i),n:m.n,
   winRate:m.wins/m.n,vaultRate:m.vault/m.n,
   damage:m.damage/m.n,rounds:m.rounds/m.n,
   spent:m.spent/m.n,activated:m.activated/m.n,
   magicActions:m.magicActions/m.n,
   negotiations:m.negotiations/m.n,
   sealAttempts:m.sealAttempts/m.n,sealWins:m.sealWins/m.n,
   combatLegalItemTurns:m.legalItemTurns,
   combatItemsSelected:m.chosenCombatItems,
   combatItemUseWhenLegal:m.legalItemTurns?m.chosenCombatItems/m.legalItemTurns:null,
   roomDecisions:m.roomDecisions,
   parleyDecisions:m.parleyDecisions,
   sealDecisions:m.sealDecisions
  })),
  effects:Object.fromEntries(Object.entries(g.contrasts).map(([kind,entries])=>[
   kind,Object.fromEntries(Object.entries(entries).map(([f,c])=>[f,confidence(c)]))
  ]))
 };
}
let simulated=0,unresolved=0,stalls=0;
for(const [strategyIndex,strategy] of strategies.entries())
 for(const [partyIndex,heroes] of parties.entries()){
  const partyKey=heroes.join("+"),stratum=groups[strategy][heroes.length===1?"solo":"duo"];
  const target=partyRecords[strategy][partyKey];
  for(let i=0;i<runs;i++){
   const opts={seed:seedAt(strategyIndex,partyIndex,i),strategy,heroes};
   const results=configs.map(c=>simulateFullExpedition({
    ...opts,researchPolicy:"planner",plannerRisk:"cautious",
    plannerFeatures:c.enabled
   }));
   simulated+=results.length;
   for(const r of results){
    unresolved+=r.unresolved;stalls+=Number(r.roundLimit);
   }
   for(const g of [groups.all,stratum]){
    results.forEach((r,k)=>metric(g.configs[k],r));
    addContrasts(g.contrasts,results);
   }
   target.n++;
   results.forEach((r,k)=>target.wins[k]+=Number(r.won));
  }
  if(progress)process.stderr.write(
   strategy+" "+partyKey+" complete ("+simulated+" simulations)\n");
 }
let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const output={
 experiment:"rogue-cards-planner-ablation-v1",commit,
 seed,runsPerPartyStrategy:runs,simulated,unresolved,stalls,
 strategies,parties,features:PLANNER_FEATURES,configs,
 method:{
  design:"Full 2^4 factorial randomized-seed simulator comparison, policy interventions only",
  baseline:"No planner features = original scripted policy",
  alone:"Feature alone minus no features (mask 0)",
  removed:"All four features minus all except selected feature (mask 15 minus mask XOR bit)",
  average:"Mean enable-minus-disable effect averaged across all 8 settings of the other three features",
  pairwise:"Difference-in-differences, averaged across the other two features",
  ci:"Paired within party/strategy/seed; approximate unadjusted 95% normal intervals on per-run contrasts",
  seed:"Separate deterministic sequences per party/strategy, shared initial seeds across all 16 interventions",
  caveat:"Once policy paths diverge, random consumption diverges; outcomes are not matched future rolls",
  inferentialScope:"Effects are for scripted agent and this simulator, not human players"
 },
 groups:{
  all:summary(groups.all),
  magic:{solo:summary(groups.magic.solo),duo:summary(groups.magic.duo)},
  treasure:{solo:summary(groups.treasure.solo),duo:summary(groups.treasure.duo)}
 },
 partyResults:Object.fromEntries(Object.entries(partyRecords).map(([st,ps])=>[
 st,Object.fromEntries(Object.entries(ps).map(([name,p])=>[
  name,{n:p.n,size:p.size,winRates:p.wins.map(n=>n/p.n)}
 ]))
 ])),
 limitations:[
  "No balancing changes were applied to the printed cards or shared game rules.",
  "Emergency potion use, equipment selection, triggered Hero abilities and other scripted actions remain fixed across planner variants.",
  "Disabling the combat feature restores scripted combat Item policy, including emergency actions; it does not ban combat Items.",
  "Magic and Treasure playstyles, and only the cautious planner weights, are evaluated.",
  "The 16 configurations share the same initial seed, but can consume later random numbers differently.",
  "Confidence intervals are unadjusted for multiple comparisons and ignore misspecification in the simulator.",
  "Feature interactions imply effects cannot be added as independent percentage-point contributions.",
  "Simulator win probabilities are not observed real-player win probabilities."
 ]
};
if(unresolved||stalls)process.exitCode=1;
process.stdout.write(JSON.stringify(output,null,2)+"\n");
