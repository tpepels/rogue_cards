/**
 * V4 gameplay coherence experiment - SEPARATE from reusable rules engine.
 *
 * Studies actual complete expeditions under multiple decision policies,
 * plus matched pre-choice counterfactuals for all ten retained fate Rooms.
 * Does not alter card probabilities, rewrite rules, use hidden information,
 * or pretend simulated policies are human players.
 *
 * npm run study:v4 -- --runs 15 --choice-runs 250 --out results/v4-study-01
 */
import {mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {HEROES,ROOMS,MONSTERS,OBJECTS} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";
const ALL_SOLO=HEROES.map(h=>[h.id]);
const PAIRS=HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(o=>[h.id,o.id]));
const FEATURED=[["warrior","wizard"],["knight","priest"],["rogue","monk"],
 ["thief","witch"],["knight","wizard"],["monk","witch"]];
const ARMS=[
 {id:"scripted",roomPolicy:"scripted"},
 {id:"contextual",roomPolicy:"contextual"},
 {id:"uniform",roomPolicy:"uniform"},
 {id:"second",roomPolicy:"second-when-legal"},
 {id:"steady",heroAbilityMode:"steady"},
 {id:"risky",heroAbilityMode:"risk"},
 {id:"smuggle",vaultChoice:"smuggle-if-available"},
 {id:"bargain",vaultChoice:"bargain-if-available"},
 {id:"unthrone",vaultChoice:"unthrone-if-available"},
 {id:"smuggle-route",roomPolicy:"second-when-legal",
  vaultChoice:"smuggle-if-available"},
 {id:"smuggle-targeted",vaultChoice:"smuggle-if-available",
  forceRoomChoice:{id:"d-gilded",choice:1}}
];
const FATES=ROOMS.filter(r=>r.v2.fate);
const strategies=["survival","treasure","magic","seal","negotiation"];
const winningEndings=new Set([
 "amulet_taken","amulet_sealed","smuggled_amulet",
 "bargained_amulet","unthroned_warden"
]);
const gate={smuggle:"smuggleAvailable",bargain:"bargainAvailable",
 unthrone:"unthroneAvailable"};
const sorted=object=>Object.fromEntries(Object.entries(object).sort(
 (a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));
const pct=x=>(100*x).toFixed(2)+"%";
const delta=x=>((x>=0?"+":"")+(x*100).toFixed(2)+" pp");
const add=(map,key,n=1)=>{map[key]=(map[key]||0)+n};
const sum=arr=>arr.reduce((a,b)=>a+b,0);
const warn=[];
const read=()=>{
 const args=process.argv.slice(2),raw={};
 const flags=new Set(["--runs","--choice-runs","--seed","--party-set",
  "--strategies","--out"]);
 for(let i=0;i<args.length;i++){
  const k=args[i],v=args[++i];
  if(!flags.has(k)||!v||v.startsWith("--")||k in raw)
   throw Error("Unknown, duplicate or missing study argument: "+k);
  raw[k]=v;
 }
 const number=(name,def,min,max)=>{
  const v=raw[name]??String(def);
  if(!/^\d+$/.test(v)||Number(v)<min||Number(v)>max||
   !Number.isSafeInteger(Number(v)))
   throw Error("Invalid "+name+" ("+min+".."+max+"): "+v);
  return Number(v);
 };
 const runs=number("--runs",15,1,500),choiceRuns=number("--choice-runs",250,1,3000);
 const seed=number("--seed",20261013,1,0xffffffff);
 const partySet=raw["--party-set"]??"compact";
 if(!["solo","compact","all"].includes(partySet))throw Error("Bad --party-set");
 const partyList=partySet==="solo"?ALL_SOLO:partySet==="all"?
  [...ALL_SOLO,...PAIRS]:[...ALL_SOLO,...FEATURED];
 const selected=(raw["--strategies"]??strategies.join(",")).split(",");
 if(!selected.length||new Set(selected).size!==selected.length||
  selected.some(s=>!strategies.includes(s)))throw Error("Bad --strategies");
 const estimates={
  ordinary:partyList.length*selected.length*ARMS.length*runs,
  counterfactual:FATES.length*2*choiceRuns
 };
 if(estimates.ordinary+estimates.counterfactual>150000)
  throw Error("Study too large for one run. Split the cohort or seed batches.");
 const out=resolve(raw["--out"]??"results/v4-coherence");
 return {runs,choiceRuns,seed,partySet,parties:partyList,
  strategies:selected,estimates,out};
};
const seedAt=(base,i)=>{
 const result=(base+Math.imul(i,0x9e3779b1))>>>0;
 return result||1;
};
function assertValid(r,label){
 if(r.unresolved||r.roundLimit)
  throw Error(label+" has unresolved effects or 300-round combat stall");
 if(r.elberethAttempts!==(r.elberethSuccesses+r.elberethFailures))
  throw Error(label+" has mismatched ELBERETH attempt counts");
 if(r.elberethFlees>r.elberethSuccesses)
  throw Error(label+" has more ELBERETH escapes than successful engravings");
 if(r.won&&!winningEndings.has(r.endingKind))
  throw Error(label+" claimed victory without a recognized Amulet ending: "+r.endingKind);
 if(r.endingKind==="escaped_empty_handed"&&r.won)
  throw Error(label+" counted escape without Amulet as victory");
 if(r.sealWin&&(!r.won||r.endingKind!=="amulet_sealed"))
  throw Error(label+" counted non-winning SEAL");
 for(const [name,field] of Object.entries(gate))
  if(r.endingKind==={smuggle:"smuggled_amulet",bargain:"bargained_amulet",
    unthrone:"unthroned_warden"}[name]&&!r.vaultModifiers[field])
   throw Error(label+" uses inaccessible "+name+" ending");
}
function empty(){
 return {n:0,wins:0,vault:0,deep:0,rolls:0,rerollDamage:0,
  trapdoors:0,skippedRoomVictories:0,elberethAttempts:0,
  elberethSuccesses:0,elberethFailures:0,elberethFlees:0,
  interventionSeen:0,interventionBothLegal:0,
  endings:{},failures:{},roomChoices:{},roomOpportunities:{},
  fateChoices:{},vaultGateSeen:{},vaultGateWins:{},
  objectAcquisitions:{},objectActivations:{},monstersSeen:{}};
}
function record(out,r){
 out.n++;out.wins+=Number(r.won);
 out.vault+=Number(!!r.vaultEntered||!!r.vaultState);
 out.deep+=Number(r.cleared>=6);
 out.trapdoors+=r.trapdoors.length;
 out.rerollDamage+=sum(r.rerolls.map(x=>x.cost||0));
 out.rolls+=r.rerolls.length;
 out.skippedRoomVictories+=Number(r.won&&r.cleared<9);
 out.elberethAttempts+=r.elberethAttempts;
 out.elberethSuccesses+=r.elberethSuccesses;
 out.elberethFailures+=r.elberethFailures;
 out.elberethFlees+=r.elberethFlees;
 out.interventionSeen+=Number(!!r.choiceComparison?.seen);
 out.interventionBothLegal+=Number(!!r.choiceComparison?.bothLegal);
 add(out.endings,r.endingKind||"none");
 if(!r.won)add(out.failures,r.failureCause||"unspecified");
 for(const [key,n] of Object.entries(r.roomChoices))add(out.roomChoices,key,n);
 for(const [key,n] of Object.entries(r.roomOptionAvailable))add(out.roomOpportunities,key,n);
 for(const c of r.fateChoices)add(out.fateChoices,c.id+":"+c.choice);
 for(const [name,field] of Object.entries(gate))
  if(r.vaultModifiers?.[field]){
   add(out.vaultGateSeen,name);
   if(r.won)add(out.vaultGateWins,name);
  }
 for(const [key,n] of Object.entries(r.objectAcquisitions))
  add(out.objectAcquisitions,key,n);
 for(const [key,n] of Object.entries(r.objectActivations))
  add(out.objectActivations,key,n);
 for(const [key,n] of Object.entries(r.monsterVisits))
  add(out.monstersSeen,key,n);
}
function finish(a){
 return {...a,winRate:a.wins/a.n,vaultRate:a.vault/a.n,
  rerollsPerExpedition:a.rolls/a.n,trapdoorsPerExpedition:a.trapdoors/a.n,
  elberethAttemptsPerExpedition:a.elberethAttempts/a.n,
  endings:sorted(a.endings),failures:sorted(a.failures)};
}
function paired(xs){
 const n=xs.length,mean=n?sum(xs)/n:0;
 const variance=n>1?sum(xs.map(x=>(x-mean)**2))/(n-1):0;
 const margin=n>1?1.96*Math.sqrt(variance/n):null;
 return {n,delta:mean,ci95:margin===null?null:
  [mean-margin,mean+margin],
  changed:n?xs.filter(x=>x!==0).length/n:0};
}
function collectBroad(c){
 const results={};
 const winBits={};
 for(const arm of ARMS){
  const out=empty(),byParty={};
  const winSequence=[];
  for(const heroes of c.parties)for(const strategy of c.strategies){
   const cohort=empty();
   for(let i=0;i<c.runs;i++){
    const seed=seedAt(c.seed,i);
    const r=simulateFullExpedition({seed,heroes,strategy,
     roomPolicy:arm.roomPolicy??"scripted",
     heroAbilityMode:arm.heroAbilityMode??"policy",
     vaultChoice:arm.vaultChoice??"policy",
     forceRoomChoice:arm.forceRoomChoice??null});
    assertValid(r,arm.id+" / "+heroes.join("+")+"/"+strategy+"/seed"+seed);
    record(out,r);record(cohort,r);
    winSequence.push(Number(r.won));
   }
   byParty[heroes.join("+")+" / "+strategy]={
    n:cohort.n,winRate:cohort.wins/cohort.n,
    vaultRate:cohort.vault/cohort.n,
    elberethAttempts:cohort.elberethAttempts
   };
  }
  results[arm.id]={...finish(out),byParty};
  winBits[arm.id]=winSequence;
  process.stderr.write("Policy "+arm.id+": "+out.n+
   " full expeditions, win "+pct(out.wins/out.n)+
   ", Vault "+pct(out.vault/out.n)+"\n");
 }
 const contrasts={};
 for(const arm of ARMS.filter(a=>a.id!=="scripted")){
  const changes=winBits[arm.id].map((b,i)=>b-winBits.scripted[i]);
  contrasts[arm.id]=paired(changes);
 }
 contrasts["risky-minus-steady"]=paired(winBits.risky.map(
  (x,i)=>x-winBits.steady[i]));
 return {arms:results,pairedContrasts:contrasts};
}
function collectChoices(c){
 const detail={};
 const party=["warrior","wizard"],strategy="magic";
 for(const room of FATES){
  const stats={card:room.id,title:room.title,runs:c.choiceRuns,
   encountered:0,bothLegal:0,unaffordable:0,
   aWins:0,bWins:0,aVault:0,bVault:0,
   beforeStateMismatches:0,choiceRecorded:{a:0,b:0},
   winDeltaSamples:[],vaultDeltaSamples:[]};
  for(let i=0;i<c.choiceRuns;i++){
   const seed=seedAt(c.seed^0x5fc9239b,i);
   const settings={seed,heroes:party,strategy,roomPolicy:"scripted"};
   const a=simulateFullExpedition({...settings,
    forceRoomChoice:{id:room.id,choice:0}});
   const b=simulateFullExpedition({...settings,
    forceRoomChoice:{id:room.id,choice:1}});
   assertValid(a,room.id+"/choice0/"+seed);
   assertValid(b,room.id+"/choice1/"+seed);
   const left=a.choiceComparison,right=b.choiceComparison;
   if(Boolean(left)!==Boolean(right))
    throw Error("Paired seeds disagree about reaching "+room.id+" at "+seed);
   if(!left)continue;
   stats.encountered++;
   if(JSON.stringify(left)!==JSON.stringify(right)){
    stats.beforeStateMismatches++;
    throw Error("Matched pre-choice state changed for "+room.id+" at "+seed);
   }
   if(!left.bothLegal){stats.unaffordable++;continue;}
   stats.bothLegal++;
   stats.aWins+=Number(a.won);stats.bWins+=Number(b.won);
   stats.aVault+=Number(!!a.vaultEntered||!!a.vaultState);
   stats.bVault+=Number(!!b.vaultEntered||!!b.vaultState);
   stats.winDeltaSamples.push(Number(b.won)-Number(a.won));
   stats.vaultDeltaSamples.push(Number(!!b.vaultEntered||!!b.vaultState)-
     Number(!!a.vaultEntered||!!a.vaultState));
   if(a.fateChoices.some(x=>x.id===room.id&&
      x.choice===room.v2.choices[0].label))stats.choiceRecorded.a++;
   if(b.fateChoices.some(x=>x.id===room.id&&
      x.choice===room.v2.choices[1].label))stats.choiceRecorded.b++;
  }
  detail[room.id]={
   card:stats.card,title:stats.title,runs:stats.runs,
   encountered:stats.encountered,bothLegal:stats.bothLegal,
   unaffordable:stats.unaffordable,
   choice0WinRate:stats.bothLegal?stats.aWins/stats.bothLegal:null,
   choice1WinRate:stats.bothLegal?stats.bWins/stats.bothLegal:null,
   choice0VaultRate:stats.bothLegal?stats.aVault/stats.bothLegal:null,
   choice1VaultRate:stats.bothLegal?stats.bVault/stats.bothLegal:null,
   winImpact:paired(stats.winDeltaSamples),
   vaultImpact:paired(stats.vaultDeltaSamples),
   choiceRecorded:stats.choiceRecorded,
   note:"Conditional on the card being encountered and both printed choices "+
    "being affordable. Differing choices can change subsequent dice streams."
  };
  process.stderr.write("Choice "+room.id+": "+stats.encountered+
   " observed, "+stats.bothLegal+" with both legal\n");
 }
 return detail;
}
function render(result){
 const {settings,broad,choices}=result,out=[];
 out.push("# Rogue Cards V4 - Gameplay coherence simulations","",
  "Source commit: "+(result.commit??"unknown"),"",
  "Full expeditions: "+settings.estimates.ordinary+
   "; paired fate simulations: "+settings.estimates.counterfactual+".",
  "All full expeditions use real printed effects; no oracle deck peeking.",
  "These are scripted computer policies, **not** optimal or human play.",
  "An alternate-choice comparison matches seeds and checks identical state "+
  "immediately before the forced decision, but subsequent dice may diverge.",
  "","## Decision-policy outcomes","",
  "| Policy | Expeditions | Win | Vault reached | Trapdoors/run | Rerolls/run | Elbereth attempts |",
  "|---|---:|---:|---:|---:|---:|---:|");
 for(const arm of ARMS){
  const a=broad.arms[arm.id];
  out.push("| "+arm.id+" | "+a.n+" | "+pct(a.winRate)+" | "+
   pct(a.vaultRate)+" | "+a.trapdoorsPerExpedition.toFixed(2)+" | "+
   a.rerollsPerExpedition.toFixed(2)+" | "+a.elberethAttempts+" |");
 }
 out.push("","## Paired policy contrasts against scripted baseline","",
  "| Comparison | Win difference | Approx. paired 95% CI | Different outcomes |",
  "|---|---:|---|---:|");
 for(const [name,c] of Object.entries(broad.pairedContrasts))
  out.push("| "+name+" | "+delta(c.delta)+" | "+
   (c.ci95?c.ci95.map(delta).join(" to "):"insufficient")+" | "+
   pct(c.changed)+" |");
 out.push("","## Returning Room choice counterfactuals","",
  "| Fate Room | Encountered | Both choices legal | Choice 1 - 0 win diff | Paired 95% CI |",
  "|---|---:|---:|---:|---|");
 for(const f of FATES){
  const r=choices[f.id],v=r.winImpact;
  out.push("| "+f.title+" | "+r.encountered+" | "+r.bothLegal+
   " | "+(v.n?delta(v.delta):"no comparable decisions")+
   " | "+(v.ci95?v.ci95.map(delta).join(" to "):"insufficient")+" |");
 }
 out.push("","## Alternative ending opportunities","",
  "| Ending | Scripted: gate unlocked | Special-policy: ending achieved |",
  "|---|---:|---:|");
 for(const [name,kind] of Object.entries({
  smuggle:"smuggled_amulet",bargain:"bargained_amulet",
  unthrone:"unthroned_warden"
 })){
  out.push("| "+name+" | "+(broad.arms.scripted.vaultGateSeen[name]||0)+
   " | "+(broad.arms[name].endings[kind]||0)+" |");
 }
 out.push("","### SMUGGLE prerequisite-seeking policy","",
  "A separate arm chooses the second printed Room option whenever it is "+
  "affordable and requests SMUGGLE at the Vault. This tests route-seeking "+
  "rather than the default policy's decision at the ending alone.",
  "SMUGGLE gate unlocked: "+
  (broad.arms["smuggle-route"].vaultGateSeen.smuggle||0)+
  "; ending achieved: "+
  (broad.arms["smuggle-route"].endings.smuggled_amulet||0)+".",
  "",
  "The targeted policy changes only the Gilded Hallway option, "+
  "and takes SMUGGLE if later affordable. It leaves all other "+
  "Room choices scripted.",
  "Gilded Hallway encountered: "+
  broad.arms["smuggle-targeted"].interventionSeen+
  "; both options legal: "+
  broad.arms["smuggle-targeted"].interventionBothLegal+
  "; gate unlocked: "+
  (broad.arms["smuggle-targeted"].vaultGateSeen.smuggle||0)+
  "; ending achieved: "+
  (broad.arms["smuggle-targeted"].endings.smuggled_amulet||0)+".");
 out.push("","## Diagnostics",
  "- Counterfactual estimates include affordability and identical pre-choice-state checks.",
  "- A zero count for a rare ending can mean lack of prerequisite encounters or resources, not a broken ending.",
  "- Exploratory comparisons use approximate, unadjusted 95% confidence intervals. Small fate cohorts are often inconclusive.",
  "- Win-rate differences do not establish that players enjoy the choices.",
  "- Endings and Hero modes should be targeted in dedicated deterministic scenario tests as well.",
  "","Machine-readable details: \`summary.json\`.","",
  "## Next step",
  "Investigate choices with strong paired differences, inaccessible prerequisites "+
  "or unexpectedly low activation counts. Do **not** automatically rebalance "+
  "toward equal win rates.","");
 return out.join("\n")+"\n";
}
const main=()=>{
 const settings=read(),start=Date.now();
 if(existsSync(settings.out))throw Error(
  "Output directory already exists: "+settings.out);
 if(FATES.length!==10)throw Error("Expected 10 retained fate Rooms");
 const broad=collectBroad(settings),choices=collectChoices(settings);
 const commit=(()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
  encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}catch{return null}})();
 const report={schema:"rogue-cards-v4-coherence-v1",commit,
  runtimeSeconds:Number(((Date.now()-start)/1000).toFixed(1)),
  settings:{...settings,parties:settings.parties.map(p=>p.join("+"))},
  catalogue:{heroes:HEROES.length,rooms:ROOMS.length,
   monsters:MONSTERS.length,objects:OBJECTS.length,fates:FATES.length},
  broad,choices,warnings:warn,
  limitations:["Simulated player policies are not human choice models.",
   "Matched initial seeds do not guarantee identical future dice streams after actions diverge.",
   "Rare endings require deliberate setup in addition to probabilistic coverage.",
   "Approximate confidence intervals are exploratory, not multiplicity adjusted.",
   "Increasing sample size narrows uncertainty but does not repair a misspecified policy."]};
 mkdirSync(settings.out,{recursive:true});
 writeFileSync(join(settings.out,"summary.json"),
  JSON.stringify(report,null,2)+"\n");
 writeFileSync(join(settings.out,"summary.md"),render(report));
 process.stderr.write("Saved "+settings.out+" in "+
  report.runtimeSeconds+" seconds\n");
};
main();
