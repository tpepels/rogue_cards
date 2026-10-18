import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";

const base=resolve(process.argv[2]??"results/pragmatic-ablation-v1");
const variants=["external-only","tree-only","rollout-only","both"];
const sample=(seed)=>{
 let x=seed>>>0;
 return ()=>{
  x^=x<<13;x^=x>>>17;x^=x<<5;
  return (x>>>0)/4294967296;
 };
};
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
function bootstrapCI(paired,seed){
 const rng=sample(seed);
 const replicates=[];
 for(let i=0;i<4000;i++){
  let total=0;
  for(let j=0;j<paired.length;j++)
   total+=paired[Math.floor(rng()*paired.length)];
  replicates.push(total/paired.length);
 }
 replicates.sort((a,b)=>a-b);
 return [replicates[Math.floor(.025*(replicates.length-1))],
  replicates[Math.floor(.975*(replicates.length-1))]];
}
function load(variant){
 const dir=join(base,variant),summary=join(dir,"summary.json"),
  data=join(dir,"trials.ndjson");
 if(!existsSync(summary)||!existsSync(data))
  throw Error("Missing complete experiment output for "+variant);
 const report=JSON.parse(readFileSync(summary,"utf8"));
 if(report.schema!=="solo-full-expedition-balance-v1")
  throw Error("Unknown experiment schema "+variant);
 if(report.design.mctsPragmaticVariant!==variant)
  throw Error("Design variant mismatch for "+variant);
 const rows=readFileSync(data,"utf8").trim().split("\n").map(JSON.parse);
 const expected=report.design.runsPerHero*report.design.heroes.length*
  report.design.arms.length;
 if(!report.complete||report.completed!==expected||rows.length!==expected)
  throw Error("Incomplete paired trial grid for "+variant);
 const byKey=new Map();
 for(const row of rows){
  const key=row.arm+"|"+row.hero+"|"+row.replicate;
  if(byKey.has(key))throw Error("Duplicate trial "+variant+" "+key);
  byKey.set(key,row);
 }
 return {report,rows,byKey};
}
const data=Object.fromEntries(variants.map(v=>[v,load(v)]));
const baseDesign=data["external-only"].report.design;
for(const variant of variants){
 const design=data[variant].report.design;
 // These fields MUST match: separate directories can never pass off a
 // changed budget, starting deck, heuristic or source tuning as an ablation.
 for(const k of ["revision","seed","runsPerHero","budget","c","alpha",
   "heuristicMode","sourceStudyHash","equipmentMode","gameMode",
   "samples","tacticalMax","maxGameSteps","maxSearchSteps"])
  if(JSON.stringify(design[k])!==JSON.stringify(baseDesign[k]))
   throw Error("Unmatched design "+variant+": "+k);
 if(design.equipmentMode!=="solo-pragmatic")
  throw Error("Ablation must retain the same live pragmatic policy");
 if(data[variant].byKey.size!==data["external-only"].byKey.size||
  [...data[variant].byKey.keys()].some(k=>
   !data["external-only"].byKey.has(k)||
   data[variant].byKey.get(k).seed!==
    data["external-only"].byKey.get(k).seed))
  throw Error("Unpaired hero/seed/algorithm grid: "+variant);
}
const fields={win:"won",vault:"vaultReached",rooms:"roomsCleared",
 timeSeconds:"elapsedMs",damage:"combatContextDamage"};
const numeric=row=>({
 win:Number(row.won),vault:Number(row.vaultReached),
 rooms:Number(row.roomsCleared),timeSeconds:Number(row.elapsedMs)/1000,
 damage:Number(row.combatContextDamage)
});
const comparison={schema:"solo-pragmatic-four-way-ablation-v1",
 revision:baseDesign.revision,sourceStudyHash:baseDesign.sourceStudyHash,
 matchedSeedHeroPairs:baseDesign.runsPerHero*baseDesign.heroes.length,
 variants:{},comparisons:[],caveats:[
 "Reported win intervals are bootstrap intervals over matched Hero-seeds, not game-balance confidence bounds.",
 "Live pragmatic shortcuts and canonical card rules are IDENTICAL in every variant.",
 "Tree-only, rollout-only and both modify internal MCTS policies, not the actual starting decks or game rules.",
 "Each hero-seed is paired, but counterfactual play may consume different later random dice.",
 "External-only retains the original random internal MCTS policy (with existing six-equipment-action progress cap)."
 ]};
for(const variant of variants){
 comparison.variants[variant]={};
 const rows=data[variant].rows;
 for(const arm of baseDesign.arms){
  const selected=rows.filter(r=>r.arm===arm);
  const values=selected.map(numeric);
  const p=selected.map(r=>r.pragmaticSimulation||{});
  comparison.variants[variant][arm]={
   n:selected.length,wins:values.reduce((sum,x)=>sum+x.win,0),
   meanWin:mean(values.map(v=>v.win)),
   meanVault:mean(values.map(v=>v.vault)),
   meanRooms:mean(values.map(v=>v.rooms)),
   meanTimeSeconds:mean(values.map(v=>v.timeSeconds)),
   meanCombatDamage:mean(values.map(v=>v.damage)),
   treeShortcuts:p.reduce((sum,x)=>sum+(x.treeShortcuts||0),0),
   rolloutShortcuts:p.reduce((sum,x)=>sum+(x.rolloutShortcuts||0),0),
   treeSoftChosen:p.reduce((sum,x)=>sum+(x.treeSoftChosen||0),0),
   rolloutSoftChosen:p.reduce((sum,x)=>sum+(x.rolloutSoftChosen||0),0)
  };
 }
 if(variant==="external-only")continue;
 for(const arm of baseDesign.arms){
  const paired=[...data["external-only"].byKey].filter(([key])=>
   key.startsWith(arm+"|")).map(([key,a])=>({
    a:numeric(a),b:numeric(data[variant].byKey.get(key))
   }));
  const delta=field=>paired.map(x=>x.b[field]-x.a[field]);
  const win=delta("win"),vault=delta("vault");
  comparison.comparisons.push({
   variant,baseline:"external-only",arm,n:paired.length,
   winDelta:mean(win),winDelta95:bootstrapCI(win,20261101+paired.length),
   vaultDelta:mean(vault),vaultDelta95:bootstrapCI(vault,20261102+paired.length),
   roomsDelta:mean(delta("rooms")),
   timeSecondsDelta:mean(delta("timeSeconds")),
   discordantWins:{
    gained:win.filter(x=>x>0).length,lost:win.filter(x=>x<0).length
   }
  });
 }
}
const percent=v=>(100*v).toFixed(1)+"%";
const lines=[
 "# Matched pragmatic MCTS ablation",
 "",
 "Revision: `"+comparison.revision+"`",
 "",
 "| Variant | Arm | Wins | Vault reach | Rooms | Seconds/run | Soft tree | Soft rollouts |",
 "|---|---|---:|---:|---:|---:|---:|---:|"
];
for(const variant of variants){
 for(const arm of baseDesign.arms){
  const x=comparison.variants[variant][arm];
  lines.push("| "+variant+" | "+arm+" | "+x.wins+"/"+x.n+" | "+
   percent(x.meanVault)+" | "+x.meanRooms.toFixed(2)+" | "+
   x.meanTimeSeconds.toFixed(2)+" | "+x.treeSoftChosen+" | "+
   x.rolloutSoftChosen+" |");
 }
}
lines.push("","## Paired change against external-only","","| Variant | Arm | Win change | Bootstrap 95% | Vault change | Rooms change |",
 "|---|---|---:|---|---:|---:|");
for(const d of comparison.comparisons)
 lines.push("| "+d.variant+" | "+d.arm+" | "+percent(d.winDelta)+
  " | ["+d.winDelta95.map(percent).join(", ")+"] | "+
  percent(d.vaultDelta)+" | "+d.roomsDelta.toFixed(2)+" |");
lines.push("","All variants share the same live shortcuts, seed grid and printed rules.",
 "Intervals are exploratory at small sample sizes; do not treat these pilot estimates as final balance proof.");
writeFileSync(join(base,"comparison.json"),JSON.stringify(comparison,null,2)+"\n");
writeFileSync(join(base,"comparison.md"),lines.join("\n")+"\n");
console.log(lines.join("\n"));
