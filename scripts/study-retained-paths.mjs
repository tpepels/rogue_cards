/**
 * Retained Room / return decision / unused-path laboratory.
 * Research-only policy interventions. Printed rules are never rewritten.
 *
 * node scripts/study-retained-paths.mjs --runs 200 --coverage-runs 250 --out results/retained-paths
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {HEROES,ROOMS,OBJECTS,VAULT} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";

const FATES=ROOMS.filter(x=>x.v2.fate);
const OTHER_KEPT=[
 ["m-fungus",0],["m-bridge",0],["m-well",0],["m-clock",0],
 ["u-lantern-shrine",0],["m-second-name",0],["m-wax-bridge",0],
 ["d-apothecary",0],["d-last-bell",0],["u-rat-favor",0],
 ["u-leech-pool",0],["m-hungry-door",0],["m-beetle",0],
 ["m-treasure",1],["d-gilded",1],["u-puppet",null],["d-crown",null]
];
const RETAINED=[
 ...FATES.map(x=>({id:x.id,title:x.title,force:0})),
 ...OTHER_KEPT.map(([id,force])=>{
  const card=ROOMS.find(x=>x.id===id);
  if(!card)throw Error("Unknown retained Room "+id);
  return {id,title:card.title,force};
 })
];
const RETURNS=[
 {id:"m-fungus",force:0,from:"heal",to:"save"},
 {id:"m-fungus",force:0,from:"heal",to:"burn"},
 {id:"m-well",force:0,from:"roll",to:"leave"},
 {id:"m-clock",force:0,from:"pay",to:"roll"},
 {id:"m-hungry-door",force:0,from:"pay",to:"roll"},
 {id:"m-ferryman-oath",force:0,from:"return",to:"smuggle"},
 {id:"u-hollow-knight",force:0,from:"save",to:"escape"},
 {id:"m-wax-bridge",force:0,from:"use",to:"save"},
 {id:"u-puppet",force:null,from:"use",to:"save"}
];
const CHECK_PARTIES=[["wizard"],["warrior","wizard"]];
const CHECK_STRATEGIES=["magic","treasure"];
const COVERAGE_PARTIES=[
 ...HEROES.map(x=>[x.id]),
 [["warrior","wizard"],["knight","priest"],["rogue","monk"],
  ["thief","witch"],["knight","wizard"],["monk","witch"]]
].flatMap(x=>Array.isArray(x[0])?x:[x]);
// Above expansion is explicitly checked so nested party arrays cannot become a Hero id.
const PARTIES=[...HEROES.map(x=>[x.id]),
 ["warrior","wizard"],["knight","priest"],["rogue","monk"],
 ["thief","witch"],["knight","wizard"],["monk","witch"]];
const STYLES=["survival","treasure","magic","seal","negotiation"];
const ENDINGS=["amulet_taken","amulet_sealed","smuggled_amulet",
 "bargained_amulet","unthroned_warden","escaped_empty_handed",
 "cursed_servant"];
const arg=(name,fallback)=>{
 const i=process.argv.indexOf(name);
 if(i<0)return fallback;
 if(i===process.argv.length-1)throw Error("Missing "+name);
 return process.argv[i+1];
};
const intArg=(name,fallback,limit)=>{
 const raw=arg(name,String(fallback)),n=Number(raw);
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<1||n>limit)
  throw Error("Bad "+name+" (1-"+limit+")");
 return n;
};
const runs=intArg("--runs",200,1200),
 coverageRuns=intArg("--coverage-runs",250,2000),
 seed=intArg("--seed",20261013,0xffffffff),
 out=resolve(arg("--out","results/retained-paths"));
const allowed=new Set(["--runs","--coverage-runs","--seed","--out"]);
for(let i=0;i<process.argv.length;i++){
 if(!process.argv[i].startsWith("--"))continue;
 if(!allowed.has(process.argv[i])||i+1===process.argv.length)throw Error("Unknown/missing flag "+process.argv[i]);
 i++;
}
const estimated=PARTIES.length*STYLES.length*coverageRuns+
 (RETAINED.length+RETURNS.length)*CHECK_PARTIES.length*CHECK_STRATEGIES.length*runs*2;
if(estimated>175000)throw Error("Split the experiment into smaller seed batches (estimate "+estimated+")");
const seedAt=(base,i)=>((seed+Math.imul(base+1,0x85ebca6b)+
 Math.imul(i+1,0x9e3779b1))>>>0)||1;
const count=(map,key,n=1)=>{map[key]=(map[key]||0)+n;};
const sum=(map,values)=>{for(const [key,n] of Object.entries(values||{}))count(map,key,n);};
let simulated=0;
function play(o){
 const result=simulateFullExpedition(o);simulated++;
 if(result.unresolved||result.roundLimit)
  throw Error("Unresolved effect/stall for "+JSON.stringify({
   seed:o.seed,party:o.heroes,style:o.strategy,ablation:o.retainedRoomAblation,
   returnChoices:o.returnChoices
  }));
 return result;
}
function pairStats(){
 return {n:0,baseWins:0,changedWins:0,baseVault:0,changedVault:0,
  winDelta:0,winDeltaSquares:0,changedEndings:0,changedWinStatus:0,
  differentVaultArrival:0,baseEndings:{},changedEndingsByKind:{},examples:[]};
}
const reachedVault=r=>Boolean(r.vaultEntered||r.vaultState);
function addPair(s,a,b,meta){
 const d=Number(a.won)-Number(b.won);
 s.n++;s.baseWins+=Number(a.won);s.changedWins+=Number(b.won);
 s.baseVault+=Number(reachedVault(a));s.changedVault+=Number(reachedVault(b));
 s.winDelta+=d;s.winDeltaSquares+=d*d;
 const e1=a.endingKind||"none",e2=b.endingKind||"none";
 count(s.baseEndings,e1);count(s.changedEndingsByKind,e2);
 if(e1!==e2)s.changedEndings++;
 if(a.won!==b.won)s.changedWinStatus++;
 if(reachedVault(a)!==reachedVault(b))s.differentVaultArrival++;
 if(s.examples.length<4&&(e1!==e2||a.won!==b.won))
  s.examples.push({...meta,original:e1,intervention:e2,
   winOriginal:!!a.won,winIntervention:!!b.won});
}
const summarize=s=>{
 const n=s.n,mean=n?s.winDelta/n:null,
  variance=n>1?Math.max(0,(s.winDeltaSquares-n*mean*mean)/(n-1)):null,
  error=variance===null?null:1.96*Math.sqrt(variance/n);
 return {
  n,originalWinRate:n?s.baseWins/n:null,interventionWinRate:n?s.changedWins/n:null,
  pairedWinDelta:mean,paired95CI:error===null?null:[mean-error,mean+error],
  differentEndingRate:n?s.changedEndings/n:null,
  differentWinStatusRate:n?s.changedWinStatus/n:null,
  differentVaultArrivalRate:n?s.differentVaultArrival/n:null,
  endingsOriginal:s.baseEndings,endingsIntervention:s.changedEndingsByKind,
  examples:s.examples
 };
};
const subjects=CHECK_PARTIES.flatMap(heroes=>CHECK_STRATEGIES.map(strategy=>({heroes,strategy})));
function studyRetained(){
 const records=[];
 for(const [ti,t] of RETAINED.entries()){
  const s=pairStats();let seen=0,placementMismatch=0;
  for(const [ci,cohort] of subjects.entries())for(let i=0;i<runs;i++){
   const opts={...cohort,seed:seedAt(10000+ti*subjects.length+ci,i),
    ...(t.force===null?{}:{forceRoomChoice:{id:t.id,choice:t.force}})};
   const a=play(opts);
   const b=play({...opts,retainedRoomAblation:t.id});
   const original=a.retainedRoomPlacements.some(x=>x.id===t.id);
   const removed=b.retainedRoomAblations.some(x=>x.id===t.id);
   if(original)seen++;
   if(original!==removed){placementMismatch++;throw Error("Placement and ablation differ: "+t.id);}
   if(a.choiceComparison&&JSON.stringify(a.choiceComparison)!==
      JSON.stringify(b.choiceComparison))
    throw Error("Initial decision state diverged before targeted removal: "+t.id);
   if(!removed)continue;
   addPair(s,a,b,{seed:opts.seed,heroes:cohort.heroes,strategy:cohort.strategy});
  }
  records.push({...t,attempts:subjects.length*runs,observedPlacements:seen,
   placementMismatch,...summarize(s)});
  process.stderr.write("Retained "+t.id+" "+seen+" comparable placements\n");
 }
 return records;
}
function studyReturns(){
 const records=[];
 for(const [ti,t] of RETURNS.entries()){
  const s=pairStats();let placed=0,choiceMismatch=0;
  for(const [ci,cohort] of subjects.entries())for(let i=0;i<runs;i++){
   const opts={...cohort,seed:seedAt(20000+ti*subjects.length+ci,i),
    ...(t.force===null?{}:{forceRoomChoice:{id:t.id,choice:t.force}})};
   const a=play({...opts,returnChoices:{[t.id]:t.from}});
   const b=play({...opts,returnChoices:{[t.id]:t.to}});
   const left=a.retainedRoomPlacements.some(x=>x.id===t.id);
   const right=b.retainedRoomPlacements.some(x=>x.id===t.id);
   if(left!==right){choiceMismatch++;throw Error("Second decision changed initial placement "+t.id);}
   if(!left)continue;
   placed++;
   addPair(s,a,b,{seed:opts.seed,heroes:cohort.heroes,strategy:cohort.strategy});
  }
  records.push({...t,attempts:subjects.length*runs,observedPlacements:placed,
   choiceMismatch,...summarize(s)});
  process.stderr.write("Return "+t.id+" "+t.to+" "+placed+" retained cases\n");
 }
 return records;
}
function studyCoverage(){
 const c={runs:0,wins:0,vault:0,endings:{},gates:{},
  rooms:{},roomChoices:{},roomOptions:{},
  roomRollBands:{},objectRollBands:{},
  items:Object.fromEntries(OBJECTS.map(x=>[x.id,{
   draws:0,acquisitions:0,roomExposures:0,opportunities:0,uses:0,
   passiveTriggers:0
  }])),retainedPlacements:{},fateChoices:{},trapdoorDestinations:{},
  elberethAttempts:0,rerollCount:0};
 for(const [pi,heroes] of PARTIES.entries()){
  for(const [si,strategy] of STYLES.entries()){
   for(let i=0;i<coverageRuns;i++){
    const r=play({seed:seedAt(30000+pi*STYLES.length+si,i),heroes,strategy});
    c.runs++;c.wins+=Number(r.won);c.vault+=Number(reachedVault(r));
    count(c.endings,r.endingKind||"none");
    for(const key of ["smuggleAvailable","bargainAvailable","unthroneAvailable"])
     if(r.vaultModifiers?.[key])count(c.gates,key);
    for(const id of r.roomsEncountered)count(c.rooms,id);
    sum(c.roomChoices,r.roomChoices);sum(c.roomOptions,r.roomOptionAvailable);
    sum(c.roomRollBands,r.roomRollBands);sum(c.objectRollBands,r.objectRollBands);
    for(const x of r.retainedRoomPlacements)count(c.retainedPlacements,x.id);
    for(const x of r.fateChoices)count(c.fateChoices,x.id+":"+x.choice);
    for(const x of r.trapdoors)count(c.trapdoorDestinations,x.to);
    c.elberethAttempts+=r.elberethAttempts;c.rerollCount+=r.rerolls.length;
    for(const [id,item] of Object.entries(c.items)){
     item.draws+=r.objectDraws?.[id]||0;
     item.acquisitions+=r.objectAcquisitions[id]||0;
     item.roomExposures+=r.objectRoomExposures[id]||0;
     item.opportunities+=r.itemOpportunities?.[id]?.total||0;
     item.uses+=r.itemUses?.[id]?.total||0;
     item.passiveTriggers+=r.itemPassiveEffects?.[id]?.triggers||0;
    }
   }
   process.stderr.write("Coverage "+heroes.join("+")+"/"+strategy+" complete\n");
  }
 }
 const unencountered=ROOMS.filter(r=>!c.rooms[r.id]).map(r=>r.id);
 const choiceNeverLegal=[],choiceLegalNeverTaken=[];
 for(const room of ROOMS)for(const [index] of room.v2.choices.entries()){
  const key=room.id+":"+index;
  if(!c.roomOptions[key])choiceNeverLegal.push(key);
  else if(!c.roomChoices[key])choiceLegalNeverTaken.push({id:key,legal:c.roomOptions[key]});
 }
 const unobservedRoomBands=[];
 for(const room of [...ROOMS,VAULT])if(room.v2.roll)
  room.v2.roll.outcomes.forEach((o,i)=>{
   const id=room.id+":"+i;
   if(!c.roomRollBands[id])unobservedRoomBands.push({id,roomSeen:c.rooms[room.id]||0});
  });
 const unobservedObjectBands=[];
 for(const card of OBJECTS)if(card.v2.roll)
  card.v2.roll.outcomes.forEach((o,i)=>{
   const id=card.id+":"+i;
   if(!c.objectRollBands[id])unobservedObjectBands.push({id,acquisitions:c.items[card.id].acquisitions});
  });
 const neverAcquired=[],opportunityNeverUsed=[],acquiredNoOpportunity=[];
 for(const [id,v] of Object.entries(c.items)){
  if(v.acquisitions===0)neverAcquired.push(id);
  else if(v.opportunities===0&&v.passiveTriggers===0)
   acquiredNoOpportunity.push({id,acquisitions:v.acquisitions,roomExposures:v.roomExposures});
  if(v.opportunities>0&&v.uses===0&&v.passiveTriggers===0)
   opportunityNeverUsed.push({id,opportunities:v.opportunities,acquisitions:v.acquisitions});
 }
 return {...c,winRate:c.wins/c.runs,vaultRate:c.vault/c.runs,
  unencountered,choiceNeverLegal,choiceLegalNeverTaken,
  unobservedRoomBands,unobservedObjectBands,
  neverAcquired,opportunityNeverUsed,acquiredNoOpportunity,
  neverObservedEndings:ENDINGS.filter(x=>!c.endings[x]),
  note:"Zero in this finite sample means unobserved by these policies, not mechanically unreachable."};
}
function asPct(x){return x===null?"n/a":(100*x).toFixed(2)+"%";}
function render(result){
 const out=["# Rogue Cards - Retained Rooms, Items, and unused paths","",
  "Commit: "+(result.commit||"unknown"),
  "Seed: "+result.seed+" | Total complete expeditions: "+result.simulated,
  "Printed card effects unchanged. The retained-room ablation discards only the saved later effect, after the initial choice and cost.",
  "Identical seeds and pre-decision checks do not force identical subsequent dice after interventions.",
  "",
  "## Matched retained-Room effect ablations","",
  "| Room | Kept / tested | Original win | Suppressed win | Win difference | Ending changed |",
  "|---|---:|---:|---:|---:|---:|"];
 for(const r of result.retained){
  out.push("| "+r.title+" | "+r.n+" / "+r.attempts+
   " | "+asPct(r.originalWinRate)+" | "+asPct(r.interventionWinRate)+
   " | "+asPct(r.pairedWinDelta)+" | "+asPct(r.differentEndingRate)+" |");
 }
 out.push("","Positive win difference means the kept Room's later effect helped the simulated policy; negative means removing it helped. Sparse comparisons do not establish card weakness.",
  "","## Second decisions on returning Rooms","",
  "| Room | Default -> alternative | Kept cases | Victory difference (default - alternative) | Different ending |",
  "|---|---|---:|---:|---:|");
 for(const r of result.returns)out.push("| "+r.id+" | "+r.from+" -> "+r.to+
  " | "+r.n+" | "+asPct(r.pairedWinDelta)+" | "+asPct(r.differentEndingRate)+" |");
 const c=result.coverage;
 out.push("","## Natural policy path coverage","",
  "Runs: "+c.runs+" | Victory "+asPct(c.winRate)+
   " | Vault arrival "+asPct(c.vaultRate),
  "","| Ending | Observed |","|---|---:|");
 for(const id of ENDINGS)out.push("| "+id+" | "+(c.endings[id]||0)+" |");
 out.push("","Unlocked gates: "+
  ["smuggleAvailable","bargainAvailable","unthroneAvailable"]
   .map(x=>x+" "+(c.gates[x]||0)).join("; ")+".",
  "","### Unobserved or ignored under these policies","",
  "- Rooms never encountered: "+(c.unencountered.join(", ")||"none"),
  "- Room choices never legal: "+(c.choiceNeverLegal.join(", ")||"none"),
  "- Room choices legal but never selected: "+(c.choiceLegalNeverTaken.map(x=>x.id+" ("+x.legal+" offers)").join(", ")||"none"),
  "- Resolved Room d6 bands never observed: "+(c.unobservedRoomBands.map(x=>x.id).join(", ")||"none"),
  "- Resolved Item d6 bands never observed: "+(c.unobservedObjectBands.map(x=>x.id).join(", ")||"none"),
  "- Items with legal opportunities but no recorded use or passive application: "+
   (c.opportunityNeverUsed.map(x=>x.id+" ("+x.opportunities+" opportunities)").join(", ")||"none"),
  "- Acquired Items without opportunity or passive application: "+
   (c.acquiredNoOpportunity.map(x=>x.id).join(", ")||"none"),
  "",
  "**Interpretation:** An unobserved path is not proven unreachable. A used or frequently triggered Item is not necessarily worth its cost. Pairwise win differences are exploratory and are not adjusted for testing many Rooms.",
  "","See detail.json for per-card opportunity counts, matched confidence intervals, and example seeds where an ending changed."];
 return out.join("\n")+"\n";
}
const result={kind:"retained-room-path-outcome-study-v1",
 seed,runs,coverageRuns,estimated,simulated:0,commit:null,
 retained:studyRetained(),returns:studyReturns(),coverage:studyCoverage()};
result.simulated=simulated;
try{result.commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
mkdirSync(out,{recursive:true});
writeFileSync(join(out,"detail.json"),JSON.stringify(result,null,2)+"\n");
writeFileSync(join(out,"summary.md"),render(result));
process.stdout.write(render(result));
