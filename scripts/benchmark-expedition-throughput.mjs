/**
 * Honest whole-expedition throughput benchmark.
 *
 * Measure complete *real* game runs and whatever policy/rollout work they
 * invoke. This belongs strictly to research scripts, not src/engine.
 *
 * npm run bench:expeditions -- --runs 10 --budgets 0,8 --repeats 3
 *
 * Every arm receives the same initial expedition seeds and frozen weights.
 * Repeating an arm must produce an identical checksum, even if CPU time varies.
 * No statistical win-rate conclusions should be drawn from tiny benchmark runs.
 */
import {performance} from "node:perf_hooks";
import {writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {AGENT_WEIGHTS,validateAgentConfig} from "../src/research-agent.js";
const allowed=new Set(["--runs","--repeats","--warmup","--budgets",
 "--heroes","--strategy","--seed","--rollout-rooms",
 "--combat-actions","--combat-room-depth","--out"]);
function options(argv){
 const raw={};
 for(let i=0;i<argv.length;i++){
  const flag=argv[i],value=argv[++i];
  if(!allowed.has(flag)||!value||value.startsWith("--")||flag in raw)
   throw Error("Unknown/duplicate/missing flag "+flag);
  raw[flag]=value;
 }
 const uint=(name,fallback,max,min=0)=>{
  const input=raw[name]??String(fallback);
  if(!/^\d+$/.test(input)||!Number.isSafeInteger(Number(input))||
   Number(input)<min||Number(input)>max)
   throw Error("Bad "+name+" = "+input);
  return Number(input);
 };
 const runs=uint("--runs",10,100,1),repeats=uint("--repeats",3,12,1),
  warmup=uint("--warmup",2,20),
  seed=uint("--seed",712389,0xffffffff),
  rolloutRooms=uint("--rollout-rooms",2,9,1),
  combatActions=uint("--combat-actions",14,600,4),
  combatRoomDepth=uint("--combat-room-depth",0,9);
 const budgets=(raw["--budgets"]??"0,8").split(",").map(x=>{
  if(!/^\d+$/.test(x)||Number(x)>128)throw Error("Bad rollout budget "+x);
  return Number(x);
 });
 if(!budgets.length||new Set(budgets).size!==budgets.length)
  throw Error("Budgets must be unique");
 const heroes=(raw["--heroes"]??"warrior,wizard").split(",");
 if(![1,2].includes(heroes.length)||new Set(heroes).size!==heroes.length||
  heroes.some(x=>!HEROES.some(h=>h.id===x)))
  throw Error("Expected one or two distinct canonical Heroes");
 const strategy=raw["--strategy"]??"magic";
 if(!["magic","treasure","survival","seal","negotiation"].includes(strategy))
  throw Error("Bad strategy "+strategy);
 const arms=["current",...budgets.flatMap(n=>["fair-"+n,"oracle-"+n])];
 return {runs,repeats,warmup,seed,budgets,heroes,strategy,arms,
  rolloutRooms,combatActions,combatRoomDepth,
  out:raw["--out"]?resolve(raw["--out"]):null};
}
function seedAt(base,index){
 // Deterministic set of starting states; not future dice samples.
 const x=(base+Math.imul(index,0x9e3779b1))>>>0;
 return x||1;
}
function params(config,arm){
 if(arm==="current")return {researchPolicy:"planner",plannerRisk:"cautious"};
 const budget=Number(arm.split("-")[1]);
 return {researchPolicy:"agent",agentConfig:validateAgentConfig({
  knowledge:arm.startsWith("oracle-")?"oracle":"fair",
  budget,weights:{...AGENT_WEIGHTS},planning:"rollout",
  rolloutRooms:config.rolloutRooms,
  combatActions:config.combatActions,
  combatRoomDepth:config.combatRoomDepth,
  samplingSeed:0x4a6f792d
 })};
}
const sum=(a,number)=>(a+number);
const median=arr=>[...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)];
function measure(config,arm,runs,startSeed=0){
 const opts=params(config,arm),started=performance.now();
 let wins=0,unresolved=0,stalls=0,rooms=0,combat=0,samples=0;
 // Compact deterministic checksum, including decisions AND results; avoid
 // collecting report objects and accidentally benchmarking JSON serialization.
 let hash=2166136261;
 for(let i=0;i<runs;i++){
  const r=simulateFullExpedition({
   ...opts,seed:seedAt(config.seed,startSeed+i),
   heroes:config.heroes,strategy:config.strategy
  });
  wins+=Number(r.won);unresolved+=r.unresolved;
  stalls+=Number(r.roundLimit);
  const d=r.plannerDecisions||{};
  rooms+=d.rolloutRoomDecisions||0;
  combat+=d.rolloutCombatDecisions||0;
  samples+=d.rolloutSamples||0;
  for(const n of [i,Number(r.won),r.cleared,r.rounds,r.battles,
   r.drawn,r.damage,r.spent,rooms,combat,samples]){
   hash=Math.imul(hash^(n>>>0),16777619)>>>0;
  }
 }
 if(unresolved||stalls)throw Error(arm+": unresolved="+unresolved+
  ", stalled="+stalls);
 const ms=performance.now()-started;
 return {ms,expeditions:runs,wins,rolloutRoomDecisions:rooms,
  rolloutCombatDecisions:combat,rolloutSamples:samples,
  checksum:hash.toString(16).padStart(8,"0")};
}
const c=options(process.argv.slice(2));
const rounds=Object.fromEntries(c.arms.map(arm=>[arm,[]]));
const initial=new Map();
for(let warm=0;warm<c.warmup;warm++)
 for(const arm of c.arms)measure(c,arm,1,30000+warm);
for(let round=0;round<c.repeats;round++){
 // Rotate measurement order to reduce warm-up and GC ordering bias.
 for(let k=0;k<c.arms.length;k++){
  const arm=c.arms[(round+k)%c.arms.length];
  const result=measure(c,arm,c.runs);
  const expected=initial.get(arm);
  if(expected!==undefined&&expected!==result.checksum)
   throw Error("Non-deterministic full-expedition results for "+arm+
    " in repeat "+round+": "+expected+" != "+result.checksum);
  initial.set(arm,result.checksum);
  rounds[arm].push(result);
 }
}
const measurements=c.arms.map(arm=>{
 const data=rounds[arm],medianMs=median(data.map(x=>x.ms)),
  example=data[0];
 return {arm,medianMs,msPerExpedition:medianMs/c.runs,
  expeditionsPerSecond:1000*c.runs/medianMs,
  wins:example.wins,rolloutRoomDecisions:example.rolloutRoomDecisions,
  rolloutCombatDecisions:example.rolloutCombatDecisions,
  rolloutSamples:example.rolloutSamples,
  deterministicChecksum:example.checksum,
  timesMs:data.map(x=>x.ms)};
});
const baseline=measurements.find(x=>x.arm==="current").msPerExpedition;
for(const entry of measurements)
 entry.runtimeMultipleVsCurrent=entry.msPerExpedition/baseline;
const report={
 schema:"rogue-cards-expedition-throughput-v1",node:process.version,
 configuration:{...c,weights:"frozen AGENT_WEIGHTS",
  out:undefined},measurements,
 note:"The entire full-effect expedition and all lookahead work are timed. "+
 "This is a speed benchmark on identical starting seeds, NOT a "+
 "statistically valid game-balance study. CPU throughput depends on "+
 "JIT warmup, GC, workload, OS scheduling and local hardware."
};
const json=JSON.stringify(report,null,2)+"\n";
process.stdout.write(json);
if(c.out){mkdirSync(dirname(c.out),{recursive:true});writeFileSync(c.out,json)}
