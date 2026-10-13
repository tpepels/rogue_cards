/**
 * Targeted Item intervention: one named Item is forced only when its printed
 * combat action is available. All other actions remain normal.
 * node scripts/study-item-targets.mjs 100 --all --seed 10983427 > item-targets.json
 */
import {execFileSync} from "node:child_process";
import {HEROES,OBJECTS} from "../src/tabletop-data.js";
import {COMBAT_ACTION_IDS} from "../src/decision-planner.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
const args=process.argv.slice(2),si=args.indexOf("--seed");
const usage="Usage: node scripts/study-item-targets.mjs [runs 1..500] [--all] [--seed UINT32] [--progress]";
if(si>=0&&(si===args.length-1||!/^\d+$/.test(args[si+1])))throw Error(usage);
const seed=si>=0?Number(args[si+1]):10983427;
const rem=args.filter((_,i)=>si<0||(i!==si&&i!==si+1));
const flags=rem.filter(x=>x.startsWith("--")),nums=rem.filter(x=>!x.startsWith("--"));
const runs=Number(nums[0]??50);
if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||
 !Number.isSafeInteger(runs)||runs<1||runs>500||
 nums.length>1||flags.some(x=>!["--all","--progress"].includes(x))||
 new Set(flags).size!==flags.length)throw Error(usage);
const parties=flags.includes("--all")?[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>[h.id,other.id]))]:
 [...HEROES.map(h=>[h.id]),["warrior","priest"],["knight","wizard"],
  ["rogue","witch"],["thief","monk"]];
const styles=["magic","treasure"];
const candidates=[...new Set([...COMBAT_ACTION_IDS,
 ...OBJECTS.filter(o=>o.v2.kind==="POTION").map(o=>o.id),
 "torch","lantern-heart","needle"])];
const seedAt=(st,p,i)=>(seed+Math.imul(st+1,0xc2b2ae35)+
 Math.imul(p+1,0x85ebca6b)+Math.imul(i,0x9e3779b1))>>>0;
const record=()=>({n:0,baseWins:0,targetWins:0,discordantFor:0,
 discordantAgainst:0,pairedSum:0,pairedSquares:0,
 forcedActions:0,normalActions:0,normalOpportunities:0,targetOpportunities:0,
 targetAcquired:0,normalAcquired:0,exposedRuns:0});
const overall=Object.fromEntries(candidates.map(x=>[x,record()]));
const groups=Object.fromEntries(styles.map(st=>[st,{
 solo:Object.fromEntries(candidates.map(x=>[x,record()])),
 duo:Object.fromEntries(candidates.map(x=>[x,record()]))
}]));
function tally(c,b,r,id){
 const v=Number(r.won)-Number(b.won),force=r.plannerDecisions?.targetForced||0;
 c.n++;c.baseWins+=Number(b.won);c.targetWins+=Number(r.won);
 c.discordantFor+=Number(v===1);c.discordantAgainst+=Number(v===-1);
 c.pairedSum+=v;c.pairedSquares+=v*v;
 c.forcedActions+=force;c.exposedRuns+=Number(force>0);
 c.normalActions+=b.itemUses?.[id]?.byMode?.action||0;
 c.normalOpportunities+=b.itemOpportunities?.[id]?.byPhase?.combat||0;
 c.targetOpportunities+=r.itemOpportunities?.[id]?.byPhase?.combat||0;
 c.targetAcquired+=r.objectAcquisitions[id]||0;
 c.normalAcquired+=b.objectAcquisitions[id]||0;
}
const summarize=c=>{
 const mean=c.pairedSum/c.n;
 const variance=Math.max(0,(c.pairedSquares-c.n*mean*mean)/Math.max(1,c.n-1));
 const se=Math.sqrt(variance/c.n);
 return {n:c.n,baselineWinRate:c.baseWins/c.n,targetWinRate:c.targetWins/c.n,
  delta:mean,ci95:[mean-1.96*se,mean+1.96*se],
  gainedWins:c.discordantFor,lostWins:c.discordantAgainst,
  forcedActions:c.forcedActions,exposedRuns:c.exposedRuns,
  normalActions:c.normalActions,normalOpportunities:c.normalOpportunities,
  targetOpportunities:c.targetOpportunities,targetAcquired:c.targetAcquired,
  normalAcquired:c.normalAcquired};
};
let simulated=0,unresolved=0,stalls=0;
for(const [st,style] of styles.entries())
 for(const [p,party] of parties.entries()){
  for(let i=0;i<runs;i++){
   const opts={seed:seedAt(st,p,i),heroes:party,strategy:style,
    researchPolicy:"planner",plannerRisk:"cautious"};
   const base=simulateFullExpedition(opts);
   simulated++;unresolved+=base.unresolved;stalls+=Number(base.roundLimit);
   for(const id of candidates){
    const result=simulateFullExpedition({...opts,itemTrial:"target",itemFocus:id});
    simulated++;unresolved+=result.unresolved;stalls+=Number(result.roundLimit);
    tally(overall[id],base,result,id);
    tally(groups[style][party.length===1?"solo":"duo"][id],base,result,id);
   }
  }
  if(flags.includes("--progress"))process.stderr.write(
   style+" "+party.join("+")+" "+simulated+" simulations\n");
 }
let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const output={
 experiment:"rogue-cards-targeted-items-v1",seed,commit,runsPerPartyStrategy:runs,
 simulated,unresolved,stalls,styles,parties,candidates,
 overall:Object.fromEntries(Object.entries(overall).map(([id,c])=>[id,summarize(c)])),
 groups:Object.fromEntries(Object.entries(groups).map(([style,sizes])=>[style,
  Object.fromEntries(Object.entries(sizes).map(([size,entries])=>[size,
   Object.fromEntries(Object.entries(entries).map(([id,c])=>[id,summarize(c)]))]))])),
 notes:[
  "Only the named card is force-selected; other Items use the ordinary cautious planner.",
  "Forced-use decisions follow printed timing and retain the card's real costs.",
  "No intervention occurs in runs where the named card is unavailable.",
  "A decline is not proof that a card is intrinsically weak: forced timing can be poor.",
  "Intervals are per-run paired normal approximations and not multiplicity corrected.",
  "Policy paths can consume later random numbers differently.",
  "Passive and reactive Item abilities are not forced in this combat-only intervention."
 ]
};
if(unresolved||stalls)process.exitCode=1;
process.stdout.write(JSON.stringify(output,null,2)+"\n");
