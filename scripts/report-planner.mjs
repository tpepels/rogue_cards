/**
 * Readable decision-planner report from local JSON.
 *   node scripts/report-planner.mjs planner-study.json > planner-study.md
 */
import {readFileSync} from "node:fs";
const input=process.argv[2];
if(!input||process.argv.length!==3)
 throw Error("Usage: node scripts/report-planner.mjs planner-study.json");
const r=JSON.parse(readFileSync(input,"utf8"));
if(r.experiment!=="rogue-cards-planner-v1")throw Error("Not a planner study");
const pp=x=>(100*x).toFixed(2)+" pp";
const pct=x=>(100*x).toFixed(1)+"%";
const fmt=x=>x.toFixed(2);
const names=r.candidates.map(c=>c.name);
const out=[
 "# Rogue Cards - advanced decision-planner results","",
 "Simulation commit: "+(r.commit||"unknown"),
 "Simulations: "+r.simulated.toLocaleString("en-US"),
 "Runs per party and strategy: "+r.runsPerPartyStrategy,
 "Errors: "+r.unresolved+"; stalls: "+r.stalls,
 "",
 "Matched-seed, opt-in policy comparison. Printed cards and normal",
 "game rules are unchanged. Positive deltas mean the alternative wins more.",
 "",
 "## Win-rate comparison",
 "",
 "| Strategy | Party | Decision model | Baseline | Alternative | Change | Approx. 95% CI |",
 "|---|---|---|---:|---:|---:|---:|"
];
for(const st of r.strategies)for(const size of ["solo","duo"])
 for(const name of names){
  const x=r.groups[st][size][name];
  out.push("| "+st+" | "+size+" | "+name+" | "+pct(x.baselineWinRate)+
   " | "+pct(x.winRate)+" | "+pp(x.delta)+" | "+
   pp(x.ci95[0])+" to "+pp(x.ci95[1])+" |");
 }
out.push("","## Additional effects","",
 "| Strategy | Party | Model | Vault access | Damage / expedition | Items spent / expedition | Magic actions / expedition | Negotiations / expedition | Seal attempts / expedition |",
 "|---|---|---|---:|---:|---:|---:|---:|---:|");
for(const st of r.strategies)for(const size of ["solo","duo"])
 for(const name of names){
  const x=r.groups[st][size][name];
  out.push("| "+st+" | "+size+" | "+name+" | "+pp(x.vaultDelta)+
   " | "+fmt(x.damageDelta)+" | "+fmt(x.spentDelta)+
   " | "+fmt(x.magicActionDelta)+" | "+fmt(x.negotiationDelta)+
   " | "+fmt(x.sealAttemptDelta)+" |");
 }
out.push("","## Hero-specific estimates","",
 "| Hero | Strategy | Old policy | Planner-balanced | Planner-cautious | Planner-bold |",
 "|---|---|---:|---:|---:|---:|");
for(const [hero,states] of Object.entries(r.soloHeroes))
 for(const st of r.strategies){
  const a=states[st];
  out.push("| "+hero+" | "+st+" | "+pct(a["planner-balanced"].baselineWinRate)+
   " | "+pct(a["planner-balanced"].winRate)+" | "+
   pct(a["planner-cautious"].winRate)+" | "+pct(a["planner-bold"].winRate)+" |");
 }
out.push("","## What the models actually decided","","Counts are totals within each experiment, not unique expeditions.","");
for(const st of r.strategies)for(const size of ["solo","duo"])
 for(const name of names){
  const c=r.groups[st][size][name].choices;
  if(Object.keys(c).length===0)continue;
  out.push("### "+st+" / "+size+" / "+name,"",
   "| Decision | Count |","|---|---:|");
  for(const [key,count] of Object.entries(c).sort((a,b)=>b[1]-a[1]))
   out.push("| "+key+" | "+count+" |");
  out.push("");
 }
out.push("## Interpretation","",
 "- These planners use estimated expected utility, not exhaustive game-tree search.",
 "- The Room planner enumerates all six printed die faces.",
 "- Combat planning compares typed Item outcomes with the expected value of an ordinary attack.",
 "- PARLEY considers its cost and approximate chance of success; Seal uses a separate win-probability estimate.",
 "- Risk variants change the relative cost of damage, defeat, and expending resources.",
 "- These experiments test simulated *choices*, not whether card text is correct or whether they are fun.",
 "- Differences may include later random-number sequence divergence, despite common initial seeds.",
 "- Confidence intervals have not been corrected for multiple comparisons.","");
process.stdout.write(out.join("\n")+"\n");
