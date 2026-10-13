/**
 * All-card overnight audit using the actual full-effect Oracle/Fair game.
 *
 * PAIRED INTERVENTIONS:
 *   Room: move its real card to the front of its printed stage deck, compare
 *         the two legal printed choices at exactly the same pre-choice state.
 *   Item: move one existing physical copy out of the Item deck to starter
 *         inventory, compare it to the untouched initial Item supply.
 * HERO/MONSTER/Vault: coverage and outcome telemetry only; NOT causal effects.
 *
 * Not a universal optimizer: report never treats unsearched decisions as tested.
 * Workers save independent, deterministic chunks for incremental resume.
 */
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {availableParallelism} from "node:os";
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync}
 from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {HEROES,ROOMS,OBJECTS,MONSTERS,WARDEN_CARDS,VAULT}
 from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
import {validateAgentConfig,AGENT_WEIGHTS} from "../src/research-agent.js";

const CARDS=[...ROOMS.map(c=>({kind:"room",id:c.id,title:c.title,stage:c.stage})),
 ...OBJECTS.map(c=>({kind:"item",id:c.id,title:c.title,family:c.v2.kind}))];
const PARTIES=[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(o=>[h.id,o.id]))];
const STYLES=["survival","magic","treasure","seal","negotiation"];
const usage="npm run oracle:overnight -- --runs 800 --workers 7 --hours 10 --out results/oracle-night-01";
const mix=x=>{let a=(x+0x9e3779b9)>>>0;
 a=Math.imul(a^(a>>>16),0x85ebca6b);a=Math.imul(a^(a>>>13),0xc2b2ae35);
 return (a^(a>>>16))>>>0;};
const hash=str=>{let h=2166136261;for(const c of str)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const uid=c=>c.kind+"-"+c.id;
const gitSha=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();}catch{return null}};
const hashConfig=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
function parse(args){
 const allowed=new Set(["--runs","--workers","--hours","--out",
  "--seed","--chunk-size","--budget","--replan-budget"]);
 const values={},flags=new Set();
 for(let i=0;i<args.length;i++){
  const k=args[i];
  if(["--dry-run","--resume"].includes(k)){
   if(flags.has(k))throw Error("Duplicate "+k);flags.add(k);continue;
  }
  if(!allowed.has(k)||values[k]!==undefined||!args[i+1]||args[i+1].startsWith("--"))
   throw Error("Invalid CLI. "+usage);
  values[k]=args[++i];
 }
 const integer=(key,def,min,max)=>{
  const raw=values[key]??String(def),n=Number(raw);
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<min||n>max)
   throw Error("Invalid "+key+" (requires integer "+min+".."+max+")");
  return n;
 };
 const c={runs:integer("--runs",800,1,10000),
  workers:integer("--workers",Math.min(7,availableParallelism()),1,16),
  hours:integer("--hours",10,1,72),
  seed:integer("--seed",20261014,1,0xffffffff),
  chunkSize:integer("--chunk-size",10,1,100),
  budget:integer("--budget",2,1,128),
  replanBudget:integer("--replan-budget",1,0,8),
  out:resolve(values["--out"]||"results/oracle-overnight"),
  resume:flags.has("--resume"),dryRun:flags.has("--dry-run")};
 if(c.resume&&c.dryRun)throw Error("--resume and --dry-run are mutually exclusive");
 c.plannedPairs=c.runs*CARDS.length;
 c.plannedExpeditions=2*c.plannedPairs;
 if(c.plannedPairs>1160000)throw Error("Split the workload into separately seeded studies");
 c.study={schema:1,runs:c.runs,seed:c.seed,chunkSize:c.chunkSize,
  budget:c.budget,replanBudget:c.replanBudget,strictTerminal:true,
  printedCards:[...CARDS.map(uid)]};
 c.signature=hashConfig(c.study);
 return c;
}
function jobs(c){
 const result=[];
 // Visit every card early, then deepen every card systematically.
 for(let from=0;from<c.runs;from+=c.chunkSize)
  for(const card of CARDS)result.push({
   id:uid(card)+"__"+from,card,from,count:Math.min(c.chunkSize,c.runs-from)});
 return result;
}
function config(c){
 return validateAgentConfig({knowledge:"fair",planning:"rollout",
  budget:c.budget,replanBudget:c.replanBudget,strictTerminal:true,
  rolloutRooms:9,combatActions:600,combatRoomDepth:9,
  weights:{...AGENT_WEIGHTS},samplingSeed:0x4a6f792d});
}
function compactMetric(source,result,party){
 const fields=["roomChoices","roomOptionAvailable","roomRollBands",
  "objectAcquisitions","objectRollBands","monsterVisits","monsterBehaviorBands",
  "itemOpportunities","itemUses","itemPassiveEffects"];
 for(const field of fields)for(const [key,val] of Object.entries(result[field]||{})){
  const v=typeof val==="number"?val:val?.total??val?.triggers??0;
  if(v)source[field][key]=(source[field][key]||0)+v;
 }
 for(const hero of party)source.heroes[hero]=(source.heroes[hero]||0)+1;
 if(result.vaultEntered||result.vaultState)source.vaults++;
 if(result.won)source.wins++;
 if(result.roundLimit||result.unresolved)throw Error("Incomplete original expedition");
 if(result.rolloutAudit?.nonterminalBranches)
  throw Error("Research sampled a nonterminal hypothetical: "+result.rolloutAudit.nonterminalBranches);
 source.branchSamples+=(result.rolloutAudit?.roomBranches||0)+
  (result.rolloutAudit?.combatBranches||0);
 source.nestedSamples+=result.rolloutAudit?.futureReplannedBranches||0;
}
function newCoverage(){
 return {roomChoices:{},roomOptionAvailable:{},roomRollBands:{},
  objectAcquisitions:{},objectRollBands:{},monsterVisits:{},
  monsterBehaviorBands:{},itemOpportunities:{},itemUses:{},
  itemPassiveEffects:{},heroes:{},vaults:0,wins:0,branchSamples:0,nestedSamples:0};
}
const safeParty=(card,i)=>{
 const idx=mix(hash(uid(card))^Math.imul(i+1,0x6a09e667));
 const party=PARTIES[(i+hash(card.id))%PARTIES.length];
 const strategy=STYLES[Math.floor(i/PARTIES.length+idx%5)%STYLES.length];
 return {party,strategy};
};
const runOne=(card,index,c,policy)=>{
 const scenario=safeParty(card,index);
 const seed=mix(c.seed^hash(uid(card))^Math.imul(index+1,0x85ebca6b))||1;
 const base={seed,heroes:scenario.party,strategy:scenario.strategy,
  researchPolicy:"agent",agentConfig:policy};
 const opts=card.kind==="room"?{
  researchTargetRoomId:card.id,
  forceRoomChoice:{id:card.id,choice:0}}:{};
 const contrast=card.kind==="room"?{
  ...opts,forceRoomChoice:{id:card.id,choice:1}}:
  {extraObjectId:card.id};
 const a=simulateFullExpedition({...base,...opts});
 const b=simulateFullExpedition({...base,...contrast});
 if(a.unresolved||b.unresolved||a.roundLimit||b.roundLimit)
  throw Error("Incomplete expedition "+card.id+" seed "+seed);
 let eligible=true,encountered=true,why=null;
 if(card.kind==="room"){
  const x=a.choiceComparison,y=b.choiceComparison;
  encountered=!!x&&!!y;
  if(Boolean(x)!==Boolean(y)||JSON.stringify(x)!==JSON.stringify(y))
   throw Error("Matched pre-choice state diverged for "+card.id+" seed "+seed);
  eligible=Boolean(x?.bothLegal);
  if(!eligible)why=encountered?"only one printed option legal":"target not reached";
 }else{
  eligible=Boolean(b.extraObjectGranted);
  if(!eligible)why="no additional physical copy available";
 }
 return {a,b,eligible,encountered,why,party:scenario.party,
  strategy:scenario.strategy,seed};
};
function execute(job,c,policy){
 const s={id:job.id,card:job.card,from:job.from,count:job.count,
  tried:0,eligible:0,notReached:0,unaffordable:0,
  winsA:0,winsB:0,onlyA:0,onlyB:0,
  healthDelta:0,damageDelta:0,byParty:{},byStrategy:{},
  coverage:newCoverage(),exampleSeeds:[]};
 for(let i=job.from;i<job.from+job.count;i++){
  const r=runOne(job.card,i,c,policy);
  s.tried++;compactMetric(s.coverage,r.a,r.party);compactMetric(s.coverage,r.b,r.party);
  if(!r.encountered)s.notReached++;
  if(!r.eligible){s.unaffordable++;continue}
  s.eligible++;
  const {a,b}=r;
  s.winsA+=Number(a.won);s.winsB+=Number(b.won);
  s.onlyA+=Number(!!a.won&&!b.won);
  s.onlyB+=Number(!a.won&&!!b.won);
  s.healthDelta+=b.remainingHP.reduce((x,y)=>x+y,0)-
   a.remainingHP.reduce((x,y)=>x+y,0);
  s.damageDelta+=b.damage-a.damage;
  const outcome=Number(b.won)-Number(a.won);
  const partyKey=r.party.join("+");
  const pp=s.byParty[partyKey]??={n:0,delta:0};
  pp.n++;pp.delta+=outcome;
  const strat=s.byStrategy[r.strategy]??={n:0,delta:0};
  strat.n++;strat.delta+=outcome;
  if(s.exampleSeeds.length<6&&outcome!==0)
   s.exampleSeeds.push({seed:r.seed,party:partyKey,strategy:r.strategy,
    controlWon:a.won,treatmentWon:b.won});
 }
 return s;
}
if(!isMainThread){
 const c=workerData.config,policy=config(c);
 parentPort.on("message",msg=>{
  if(msg.type!=="job")return;
  try{const result=execute(msg.job,c,policy);
   parentPort.postMessage({type:"done",result});}
  catch(e){parentPort.postMessage({type:"error",id:msg.job.id,
   message:e.stack||String(e)});}
 });
}
function writeAtomic(path,data){
 const tmp=path+".tmp-"+process.pid;
 writeFileSync(tmp,data);renameSync(tmp,path);
}
function count(map,key,val){map[key]=(map[key]||0)+val;}
function merge(a,b){
 for(const [k,v] of Object.entries(b)){
  if(typeof v==="number")a[k]=(a[k]||0)+v;
  else if(Array.isArray(v))a[k]=[...(a[k]||[]),...v].slice(0,8);
  else if(v&&typeof v==="object"){
   a[k]??={};merge(a[k],v);
  }
 }
 return a;
}
function exactP(a,b){
 const n=a+b;if(!n)return 1;
 // Exact two-sided McNemar/binomial via stable small-tail recurrence.
 let k=Math.min(a,b),prob=Math.pow(.5,n),sum=prob;
 if(n>1000){
  const z=(Math.abs(a-b)-1)/Math.sqrt(n);
  const cdf=.5*(1-erf(z/Math.SQRT2));
  return Math.min(1,2*cdf);
 }
 for(let i=1;i<=k;i++){prob*= (n-i+1)/i;sum+=prob;}
 return Math.min(1,2*sum);
}
function erf(x){
 // Abramowitz-Stegun 7.1.26, 1e-7 max absolute error.
 const sign=Math.sign(x),z=Math.abs(x),t=1/(1+.3275911*z);
 const poly=(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t;
 return sign*(1-poly*Math.exp(-z*z));
}
function summary(c,finished){
 const allCards=CARDS.map(card=>{
  const pieces=finished.filter(x=>x.card.id===card.id&&x.card.kind===card.kind);
  const total=pieces.reduce((a,b)=>{
   for(const name of ["tried","eligible","notReached","unaffordable",
    "winsA","winsB","onlyA","onlyB","healthDelta","damageDelta"])
    a[name]+=b[name]||0;
   merge(a.byParty,b.byParty);merge(a.byStrategy,b.byStrategy);
   merge(a.coverage,b.coverage);
   a.exampleSeeds.push(...b.exampleSeeds);
   return a;
  },{tried:0,eligible:0,notReached:0,unaffordable:0,
   winsA:0,winsB:0,onlyA:0,onlyB:0,healthDelta:0,
   damageDelta:0,byParty:{},byStrategy:{},coverage:newCoverage(),exampleSeeds:[]});
  const n=total.eligible,d=total.onlyA+total.onlyB,
   effect=n?(total.winsB-total.winsA)/n:null;
  const se=n?Math.sqrt(Math.max(0,d/n-(effect||0)**2)/n):null;
  const ci=n?[effect-1.96*se,effect+1.96*se]:null;
  return {kind:card.kind,id:card.id,title:card.title,stage:card.stage,
   family:card.family,...total,exampleSeeds:total.exampleSeeds.slice(0,8),
   winDelta:effect,winDelta95CI:ci,
   pUnadjusted:n?exactP(total.onlyA,total.onlyB):null,
   status:n===0?"no_comparable_trials":
    n<500?"insufficient_conditional_trials":"estimated",
   complete:total.tried===c.runs};
 });
 const ranked=allCards.filter(x=>x.pUnadjusted!==null).sort(
  (a,b)=>a.pUnadjusted-b.pUnadjusted);
 let correction=0;
 for(let i=0;i<ranked.length;i++){
  correction=Math.max(correction,Math.min(1,
   ranked[i].pUnadjusted*(ranked.length-i)));
  ranked[i].pHolm=correction;
  ranked[i].significantHolm=correction<.05&&ranked[i].eligible>=500;
 }
 const coverage=newCoverage();
 for(const x of allCards)merge(coverage,x.coverage);
 const noRoomChoices=ROOMS.flatMap(room=>[0,1].filter(i=>
  !(coverage.roomChoices[room.id+":"+i]||0)).map(i=>room.id+":"+i));
 const noRoomBands=ROOMS.flatMap(room=>
  room.v2.roll?.outcomes?.map((_,i)=>room.id+":"+i)||[])
  .filter(key=>!(coverage.roomRollBands[key]||0));
 const noItemAcquisitions=OBJECTS.filter(o=>!coverage.objectAcquisitions[o.id]).map(o=>o.id);
 const noItemBands=OBJECTS.flatMap(o=>o.v2.roll?.outcomes?.map((_,i)=>
  o.id+":"+i)||[]).filter(k=>!(coverage.objectRollBands[k]||0));
 const noMonsterVisits=[...MONSTERS,...WARDEN_CARDS].filter(m=>
  !(coverage.monsterVisits[m.id]||0)).map(m=>m.id);
 const noMonsterBands=[...MONSTERS,...WARDEN_CARDS].flatMap(m=>
  (m.behavior||[]).map((_,i)=>m.id+":"+i)).filter(k=>
   !(coverage.monsterBehaviorBands[k]||0));
 const noHeroes=HEROES.filter(h=>!coverage.heroes[h.id]).map(h=>h.id);
 const coverageGaps={noRoomChoices,noRoomBands,noItemAcquisitions,
  noItemBands,noMonsterVisits,noMonsterBands,noHeroes,
  vaultNeverReached:coverage.vaults===0,
  itemTriggerNotCovered:OBJECTS.filter(o=>
    !coverage.itemOpportunities[o.id]&&!coverage.itemUses[o.id]&&
    !coverage.itemPassiveEffects[o.id]).map(o=>o.id),
  // Current engine search API still lacks legal-action branching at
  // every printed timing window, so never claim exhaustive game search.
  knownUnsearchedDecisionTypes:[
   "retained Room return choices","PARLEY alternatives","Vault SEAL decision",
   "Hero abilities and rerolls","reactive/noncombat Item timing",
   "equipment and postcombat Item decisions"
  ]};
 const completed=allCards.every(x=>x.complete),enough=allCards.every(x=>x.eligible>=500);
 return {schema:"oracle-card-audit-v1",seed:c.seed,
  plannedPairedTrials:c.plannedPairs,
  actualPairedTrials:allCards.reduce((n,x)=>n+x.tried,0),
  eligiblePairedTrials:allCards.reduce((n,x)=>n+x.eligible,0),
  everyCardFullySampled:completed,
  everyCardAtLeast500Comparable:enough,
  mechanicalCoverageComplete:Object.entries(coverageGaps).every(([k,v])=>
   Array.isArray(v)?v.length===0:!v),
  conclusionReady:completed&&enough&&coverageGaps.knownUnsearchedDecisionTypes.length===0,
  correction:"Holm step-down across all testable Room and Item contrasts; exact McNemar when <=1000 discordant pairs, continuity-corrected normal otherwise",
  cautions:[
   "No sample size guarantees significance if the true effect is zero.",
   "Rooms are deliberately relocated to the beginning of their stage; results are conditional on that placement.",
   "Items are gifted early, moving a physical copy out of the shuffled deck; results are NOT generic Item power.",
   "Only legal comparable target Room decisions enter pairwise estimates.",
   "Other future decisions use two-ply full-effect rollout agent, not complete information-set MCTS.",
   "Holm correction addresses multiplicity, not model incompleteness, selection biases or practical importance.",
   "Observed monster visits, Hero outcomes and Vault encounters are descriptive, NOT causal card comparisons."
  ],cards:allCards,coverage,coverageGaps};
}
function fmt(x){return x===null?"n/a":(x*100).toFixed(2)+" pp";}
function render(s,c){
 const out=["# Overnight Oracle card audit","",
  "Status: "+(s.everyCardFullySampled?"All planned card trials completed":"PARTIAL - resume required"),
  "Source commit: "+gitSha(),
  "Full-effect paired trials: "+s.actualPairedTrials+" / "+s.plannedPairedTrials,
  "Eligible conditional paired trials: "+s.eligiblePairedTrials,
  "All sampled action branches must terminate; any nonterminal branch aborts its checkpoint.",
  "**No statistically justified claim of universal game balance:** "+s.coverageGaps.knownUnsearchedDecisionTypes.join(", ")+".",
  "","## Conditional Room and Item intervention estimates","",
  "| Card | Kind | Eligible / attempts | Treatment - control win | Paired 95% interval | Holm adjusted p | Status |",
  "|---|---|---:|---:|---|---:|---|"];
 for(const x of s.cards){
  out.push("| "+x.title+" | "+x.kind+" | "+x.eligible+"/"+x.tried+
   " | "+fmt(x.winDelta)+" | "+(x.winDelta95CI?.map(fmt).join(" to ")||"n/a")+
   " | "+(x.pHolm??"n/a")+" | "+x.status+(x.complete?"":" (partial)")+" |");
 }
 out.push("","## Mechanical and decision coverage gaps","");
 for(const [k,v] of Object.entries(s.coverageGaps)){
  const txt=Array.isArray(v)?v.length?(v.length>35?
   v.slice(0,35).join(", ")+" ... ("+v.length+" total)":v.join(", ")):"none":String(v);
  out.push("- "+k+": "+txt);
 }
 out.push("","## Interpretation","",
  "All numerical results use the actual printed-effect engine. A legal printed action that has not been reached or cannot be chosen is explicitly reported as a gap.",
  "These conditional interventions and the current two-ply continuation do NOT establish complete optimal play. Cards with insufficient eligible trials have no reliable balance verdict.",
  "The strongest positive/negative contrasts should be repeated with independent seeds, later acquisition for Items and each original Room position before editing their rules.",
  "For a complete result supply manifest.json, summary.json, summary.md, validation.json and checkpoints/.");
 return out.join("\n")+"\n";
}
function persist(c,done,active=false){
 const s=summary(c,[...done.values()]);
 const validation={pass:s.everyCardFullySampled&&s.mechanicalCoverageComplete&&
   s.coverageGaps.knownUnsearchedDecisionTypes.length===0,
  simulationsFinished:s.actualPairedTrials*2,
  complete:s.everyCardFullySampled,
  cardComparisonsEligible:s.eligiblePairedTrials,
  allPathsReached:s.mechanicalCoverageComplete,
  fullDecisionSearchImplemented:false,
  noUnsupportedRulesAsserted:false};
 writeAtomic(join(c.out,"summary.json"),JSON.stringify(s,null,2)+"\n");
 writeAtomic(join(c.out,"summary.md"),render(s,c));
 writeAtomic(join(c.out,"validation.json"),JSON.stringify(validation,null,2)+"\n");
 return s;
}
async function main(){
 const c=parse(process.argv.slice(2));
 const tasks=jobs(c),s=JSON.stringify({pairs:c.plannedPairs,
  games:c.plannedExpeditions,cards:CARDS.length,
  chunks:tasks.length,workers:c.workers,hours:c.hours,
  budget:c.budget,replanBudget:c.replanBudget,
  estimatedSampledBranches:"unbounded in advance; monitor actual telemetry",
  warning:"Existing search does not branch all printed timings; explicit coverage gaps remain."},null,2);
 process.stderr.write(s+"\n");
 if(c.dryRun)return;
 const commit=gitSha();
 if(c.resume){
  const existing=JSON.parse(readFileSync(join(c.out,"manifest.json"),"utf8"));
  if(existing.commit!==commit||existing.signature!==c.signature)
   throw Error("Cannot resume: Git commit or sampling design changed");
 }else{
  if(existsSync(c.out))throw Error("Output path already exists; use --resume or a new path");
  mkdirSync(join(c.out,"checkpoints"),{recursive:true});
  writeFileSync(join(c.out,"manifest.json"),JSON.stringify({commit,signature:c.signature,
   config:c.study,node:process.version,modelWarnings:[
    "The oracle is two-ply, not exhaustive MCTS.",
    "PARLEY, SEAL, reactions, retained Room returns not completely branched.",
    "Each test deliberately changes where a Room occurs or when an Item is acquired."
   ]},null,2)+"\n");
 }
 const files=readdirSync(join(c.out,"checkpoints")).filter(x=>x.endsWith(".json"));
 const known=new Map(tasks.map(j=>[j.id,j]));
 const done=new Map();
 for(const name of files){
  const id=name.slice(0,-5);
  if(!known.has(id))throw Error("Unexpected checkpoint "+id);
  const row=JSON.parse(readFileSync(join(c.out,"checkpoints",name),"utf8"));
  if(row.signature!==c.signature||row.result?.id!==id)
   throw Error("Corrupt/mismatched checkpoint "+id);
  done.set(id,row.result);
 }
 const queue=tasks.filter(j=>!done.has(j.id));
 const deadline=Date.now()+c.hours*3600*1000;
 process.stderr.write("Resuming "+done.size+"/"+tasks.length+" chunks; "+
  queue.length+" remaining. Time limit "+c.hours+" hours.\n");
 if(!queue.length){persist(c,done);return;}
 let index=0,completed=0,failed=null,settled=false;
 const workers=Array.from({length:Math.min(c.workers,queue.length)},()=>
  new Worker(new URL(import.meta.url),{workerData:{config:c}}));
 const state=new Map(),busy=new Set();
 const heartbeat=setInterval(()=>{
  const used=Date.now();
  process.stderr.write("Oracle progress "+done.size+"/"+tasks.length+
   " chunks, "+Math.round((used-(deadline-c.hours*3600*1000))/60000)+
   " minutes, active "+[...state.values()].join(", ")+"\n");
  persist(c,done,true);
 },60000);
 try{
  await new Promise((yes,no)=>{
   function assign(w){
    if(failed||settled)return;
    if(Date.now()>=deadline||index>=queue.length){
     if(busy.size===0){settled=true;yes();}
     return;
    }
    const job=queue[index++];
    busy.add(w);state.set(w,job.id);
    w.postMessage({type:"job",job});
   }
   for(const w of workers){
    w.on("message",msg=>{
     if(failed)return;
     if(msg.type==="error"){
      failed=Error("Checkpoint "+msg.id+": "+msg.message);no(failed);return;
     }
     if(msg.type!=="done")return;
     const row=msg.result;
     if(state.get(w)!==row.id){failed=Error("Out-of-order worker response");no(failed);return;}
     writeAtomic(join(c.out,"checkpoints",row.id+".json"),
      JSON.stringify({signature:c.signature,result:row})+"\n");
     done.set(row.id,row);completed++;
     busy.delete(w);state.delete(w);
     if(completed%10===0||index===queue.length)
      process.stderr.write("Completed "+done.size+"/"+tasks.length+
       " chunks; last card "+row.card.id+" ("+row.eligible+"/"+row.tried+" comparable)\n");
     assign(w);
     if(!busy.size&&(Date.now()>=deadline||index>=queue.length)){
      settled=true;yes();
     }
    });
    w.on("error",err=>{if(!failed){failed=err;no(err)}});
    w.on("exit",code=>{if(code&&!settled&&!failed){
     failed=Error("Study worker exited "+code);no(failed);
    }});
    assign(w);
   }
  });
 }finally{
  clearInterval(heartbeat);
  await Promise.all(workers.map(w=>w.terminate()));
  const result=persist(c,done);
  process.stderr.write("Saved "+result.actualPairedTrials+"/"+c.plannedPairs+
   " pairs in "+join(c.out,"summary.md")+"\n");
 }
}
if(isMainThread&&process.argv[1]&&resolve(process.argv[1])===
 fileURLToPath(import.meta.url))await main().catch(e=>{
 console.error(e.stack||String(e));process.exitCode=1;
});
