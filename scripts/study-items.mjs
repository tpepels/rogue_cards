/**
 * Controlled comparison of Item decisions with identical printed effects:
 * scripted baseline, contextual planner, zero reservation, forced legal use.
 * node scripts/study-items.mjs 250 --all --seed 58123017 > items.json
 * node scripts/report-items.mjs items.json > items.md
 */
import {execFileSync} from "node:child_process";
import {HEROES,OBJECTS} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
const args=process.argv.slice(2);
const usage="Usage: node scripts/study-items.mjs [runs 1..1000] [--all] [--seed UINT32] [--progress]";
const si=args.indexOf("--seed");
if(si>=0&&(si===args.length-1||!/^\d+$/.test(args[si+1])))throw Error(usage);
const seed=si<0?58123017:Number(args[si+1]);
const rest=args.filter((_,i)=>si<0||(i!==si&&i!==si+1));
const flags=rest.filter(a=>a.startsWith("--")),nums=rest.filter(a=>!a.startsWith("--"));
if(nums.length>1||flags.some(f=>!["--all","--progress"].includes(f))||
 new Set(flags).size!==flags.length||!Number.isSafeInteger(seed)||
 seed<0||seed>0xffffffff)throw Error(usage);
const runs=Number(nums[0]??100);
if(!Number.isSafeInteger(runs)||runs<1||runs>1000)throw Error(usage);
const parties=flags.includes("--all")?[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(b=>[h.id,b.id]))]:
 [...HEROES.map(h=>[h.id]),["warrior","priest"],["knight","wizard"],
 ["rogue","witch"],["thief","monk"]];
const policies=["scripted","normal","free","force"];
const styles=["magic","treasure"];
const seedAt=(st,party,i)=>(seed+Math.imul(st+1,0xc2b2ae35)+
 Math.imul(party+1,0x85ebca6b)+Math.imul(i,0x9e3779b1))>>>0;
const obj=()=>({draws:0,acquired:0,opportunities:0,uses:0,byPhase:{},
 byMode:{},result:{damage:0,healing:0,selfDamage:0,draws:0,resourcesSpent:0,
 responsesSkipped:0,poisonCured:0,recharges:0,scouts:0}});
const counter=()=>({n:0,wins:0,vault:0,damage:0,rounds:0,spent:0,
 activated:0,magicActions:0,negotiations:0,seal:0,
 items:Object.fromEntries(OBJECTS.map(c=>[c.id,obj()]))});
const contrast=()=>({n:0,sum:0,sumsq:0});
const group=()=>({policies:Object.fromEntries(policies.map(p=>[p,counter()])),
 contrasts:Object.fromEntries(policies.slice(1).map(p=>[p,contrast()]))});
const groups={all:group(),magic:{solo:group(),duo:group()},
 treasure:{solo:group(),duo:group()}};
function record(c,r){
 c.n++;c.wins+=Number(r.won);c.vault+=Number(r.cleared===9);
 c.damage+=r.damage;c.rounds+=r.rounds;c.spent+=r.spent;
 c.activated+=r.activated;c.magicActions+=r.magicActions;
 c.negotiations+=r.negotiations;c.seal+=Number(r.sealAttempt);
 for(const [id,cell] of Object.entries(c.items)){
  cell.draws+=r.objectDraws?.[id]||0;
  cell.acquired+=r.objectAcquisitions[id]||0;
  const op=r.itemOpportunities?.[id];
  cell.opportunities+=op?.total||0;
  for(const [phase,n] of Object.entries(op?.byPhase||{}))
   cell.byPhase[phase]=(cell.byPhase[phase]||0)+n;
  const used=r.itemUses?.[id];
  cell.uses+=used?.total||0;
  for(const [mode,n] of Object.entries(used?.byMode||{}))
   cell.byMode[mode]=(cell.byMode[mode]||0)+n;
  const result=r.itemResults?.[id];
  if(result)for(const k of Object.keys(cell.result))
   cell.result[k]+=result[k]||0;
 }
}
function update(g,results){
 for(const [i,p] of policies.entries())record(g.policies[p],results[i]);
 for(const [i,p] of policies.entries())if(i){
  const x=g.contrasts[p],v=Number(results[i].won)-Number(results[0].won);
  x.n++;x.sum+=v;x.sumsq+=v*v;
 }
}
const summarizeC=c=>({n:c.n,winRate:c.wins/c.n,vaultRate:c.vault/c.n,
 damage:c.damage/c.n,rounds:c.rounds/c.n,spent:c.spent/c.n,
 activated:c.activated/c.n,magicActions:c.magicActions/c.n,
 negotiations:c.negotiations/c.n,seal:c.seal/c.n,
 items:c.items});
const summarizeContrast=c=>{
 const mean=c.sum/c.n;
 const variance=Math.max(0,(c.sumsq-c.n*mean*mean)/Math.max(1,c.n-1));
 const se=Math.sqrt(variance/c.n);
 return {n:c.n,delta:mean,ci95:[mean-1.96*se,mean+1.96*se]};
};
const summary=g=>({policies:Object.fromEntries(
 Object.entries(g.policies).map(([p,c])=>[p,summarizeC(c)])),
 pairedContrasts:Object.fromEntries(
 Object.entries(g.contrasts).map(([p,c])=>[p,summarizeContrast(c)]))});
let simulated=0,stalls=0,unresolved=0;
for(const [st,style] of styles.entries())
 for(const [pi,party] of parties.entries()){
  const grp=groups[style][party.length===1?"solo":"duo"];
  for(let i=0;i<runs;i++){
   const opts={seed:seedAt(st,pi,i),heroes:party,strategy:style};
   const rs=policies.map(p=>simulateFullExpedition(p==="scripted"?opts:{
    ...opts,researchPolicy:"planner",plannerRisk:"cautious",itemTrial:p
   }));
   for(const r of rs){simulated++;unresolved+=r.unresolved;stalls+=Number(r.roundLimit);}
   update(groups.all,rs);update(grp,rs);
  }
  if(flags.includes("--progress"))process.stderr.write(style+" "+
   party.join("+")+" completed: "+simulated+"\n");
 }
let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const output={
 experiment:"rogue-cards-item-trials-v1",commit,seed,runsPerPartyStrategy:runs,
 simulated,stalls,unresolved,parties,styles,policies,
 trialDefinitions:{
  scripted:"Previous scripted actions, no planner decisions",
  normal:"Full cautious planner with contextual reservation",
  free:"Same planner and printed costs, but ignore future-reservation penalty; Items are NOT free to consume",
  force:"Always choose the highest-scoring currently legal combat Item action when any exists, including bad options",
  opportunity:"A phase-specific printed trigger is legally available; multiple turns may expose the same physical Object",
  outcome:"Changes in actual HP, Monster HP, draws, skips, condition and spent cards during each Item activation",
  paired:"Same initial seed within a party/style cohort; future dice paths may diverge after choices differ"
 },
 groups:{all:summary(groups.all),
  magic:{solo:summary(groups.magic.solo),duo:summary(groups.magic.duo)},
  treasure:{solo:summary(groups.treasure.solo),duo:summary(groups.treasure.duo)}},
 limitations:[
  "Controlled use policies do not isolate intrinsic printed card power from encounter selection and inventory supply.",
  "The forced policy can waste Items, so a lower win rate does not prove Items are weak.",
  "Even identical starting seeds diverge in future RNG consumption after different decisions.",
  "Availability counts may exceed acquisitions and do not represent distinct physical copies.",
  "Triggered effects are recorded, but passive equipment effects do not create a discrete activation outcome.",
  "Combat scoring remains approximate and is not an exhaustive optimal human policy."
 ]
};
if(stalls||unresolved)process.exitCode=1;
process.stdout.write(JSON.stringify(output,null,2)+"\n");
