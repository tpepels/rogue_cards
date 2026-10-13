/**
 * Post-card-rebalance balance verification with all 36 possible Hero parties.
 * 8 solo, 28 distinct two-Hero pairs, two playstyles and independent seeds.
 *
 * node scripts/study-hero-balance.mjs 300 --seed 78521739 > hero-balance.json
 * node scripts/report-hero-balance.mjs hero-balance.json > hero-balance.md
 */
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
const args=process.argv.slice(2),sp=args.indexOf("--seed");
const usage="Usage: node scripts/study-hero-balance.mjs [runs 1..2000] [--seed UINT32] [--progress]";
if(sp>=0&&(sp===args.length-1||!/^\d+$/.test(args[sp+1])))throw Error(usage);
const seed=sp>=0?Number(args[sp+1]):78521739;
const rem=args.filter((_,i)=>sp<0||(i!==sp&&i!==sp+1));
const flags=rem.filter(x=>x.startsWith("--")),numbers=rem.filter(x=>!x.startsWith("--"));
const runs=Number(numbers[0]??100);
if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||
 !Number.isSafeInteger(runs)||runs<1||runs>2000||numbers.length>1||
 flags.some(x=>x!=="--progress")||new Set(flags).size!==flags.length)throw Error(usage);
const parties=[...HEROES.map(h=>[h.id]),...HEROES.flatMap((h,i)=>
 HEROES.slice(i+1).map(o=>[h.id,o.id]))];
const strategies=["magic","treasure"];
const seedAt=(st,p,i)=>(seed+Math.imul(st+1,0xc2b2ae35)+
 Math.imul(p+1,0x85ebca6b)+Math.imul(i,0x9e3779b1))>>>0;
const counter=()=>({n:0,wins:0,vault:0,damage:0,rounds:0,spent:0,
 hpSum:0,hpFractionSum:0,sealWins:0,killWins:0,unresolved:0,stalls:0});
const record=(c,r)=>{
 c.n++;c.wins+=Number(r.won);c.vault+=Number(r.cleared===9);
 c.damage+=r.damage;c.rounds+=r.rounds;c.spent+=r.spent;
 c.hpSum+=r.remainingHP.reduce((a,b)=>a+b,0);
 c.hpFractionSum+=r.remainingHP.reduce((sum,h,i)=>sum+h/r.startingHP[i],0)/r.startingHP.length;
 c.sealWins+=Number(r.sealWin);c.killWins+=Number(r.won&&!r.sealWin);
 c.unresolved+=r.unresolved;c.stalls+=Number(r.roundLimit);
};
const rows=Object.fromEntries(strategies.map(st=>[st,Object.fromEntries(
 parties.map(p=>[p.join("+"),counter()]))]));
let simulated=0;
for(const [st,strategy] of strategies.entries())
 for(const [p,party] of parties.entries()){
  const cell=rows[strategy][party.join("+")];
  for(let i=0;i<runs;i++){
   const r=simulateFullExpedition({seed:seedAt(st,p,i),heroes:party,
    strategy,researchPolicy:"planner",plannerRisk:"cautious"});
   // Starting HP is based on the same actual canonical Hero cards.
   r.startingHP=party.map(id=>HEROES.find(h=>h.id===id).hp);
   record(cell,r);simulated++;
  }
  if(flags.includes("--progress"))process.stderr.write(
   strategy+" "+party.join("+")+" completed: "+simulated+"\n");
 }
function summary(c){
 const p=c.wins/c.n,se=Math.sqrt(p*(1-p)/c.n);
 return {n:c.n,wins:c.wins,winRate:p,ci95:[
  Math.max(0,p-1.96*se),Math.min(1,p+1.96*se)],
  vaultRate:c.vault/c.n,meanDamage:c.damage/c.n,
  meanRounds:c.rounds/c.n,meanSpent:c.spent/c.n,
  meanRemainingHp:c.hpSum/c.n,meanRemainingHpFraction:c.hpFractionSum/c.n,
  sealWinRate:c.sealWins/c.n,killWinRate:c.killWins/c.n,
  unresolved:c.unresolved,stalls:c.stalls};
}
let commit=null;try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const strat=Object.fromEntries(strategies.map(st=>[st,Object.fromEntries(
 Object.entries(rows[st]).map(([key,c])=>[key,summary(c)]))]));
const byPartySize=size=>{
 const cells=strategies.flatMap(st=>Object.entries(rows[st]).filter(
 ([k])=>(k.includes("+")?2:1)===size).map(([_,c])=>c));
 const sum=cells.reduce((total,c)=>{for(const k of Object.keys(total))
  total[k]+=c[k];return total;},counter());
 return summary(sum);
};
const solo=parties.filter(p=>p.length===1).map(p=>p[0]);
const duo=parties.filter(p=>p.length===2).map(p=>p.join("+"));
const meanAcrossStrategies=id=>strategies.reduce((n,st)=>n+
 strat[st][id].winRate,0)/strategies.length;
const spread=ids=>({
 highest:ids.map(id=>({party:id,rate:meanAcrossStrategies(id)})).
  sort((a,b)=>b.rate-a.rate)[0],
 lowest:ids.map(id=>({party:id,rate:meanAcrossStrategies(id)})).
  sort((a,b)=>a.rate-b.rate)[0],
 range:Math.max(...ids.map(meanAcrossStrategies))-Math.min(...ids.map(meanAcrossStrategies))
});
const output={experiment:"rogue-cards-hero-balance-v1",
 commit,seed,runsPerPartyStrategy:runs,simulated,strategies,parties,
 overall:{solo:byPartySize(1),duo:byPartySize(2)},
 spreads:{solo:spread(solo),duo:spread(duo)},
 goals:{
  soloRangeAtMost0_10:spread(solo).range<=0.10,
  duoMeanWithin0_70to0_85:byPartySize(2).winRate>=0.70&&byPartySize(2).winRate<=0.85,
  noDuoAbove0_95:duo.every(id=>meanAcrossStrategies(id)<0.95)
 },
 results:strat,
 assumptions:[
 "Scripted cautious agent, magic and treasure playstyles only.",
 "36 parties include 8 singles and 28 distinct Hero combinations.",
 "Printed Items and Hero powers match this simulation commit.",
 "95% per-cell binomial intervals approximate and not adjusted for multiple comparisons.",
 "Hero changes can alter which future RNG values are consumed, even for matching seeds.",
 "Targets are design guardrails for human playtests, not established population parameters."
 ]};
if(Object.values(rows).some(x=>Object.values(x).some(c=>c.unresolved||c.stalls)))
 process.exitCode=1;
process.stdout.write(JSON.stringify(output,null,2)+"\n");
