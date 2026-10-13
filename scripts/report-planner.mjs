/**
 * Readable decision-planner report from local JSON.
 *   node scripts/report-planner.mjs planner-study.json > planner-study.md
 */
import {readFileSync} from "node:fs";
const input=process.argv[2];
if(!input||process.argv.length!==3)
 throw Error("Usage: node scripts/report-planner.mjs planner-study.json");
const r=JSON.parse(readFileSync(input,"utf8"));
if(!["rogue-cards-planner-v1","rogue-cards-planner-v2"].includes(r.experiment))
 throw Error("Not a planner study");
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
 r.randomization||"Earlier v1 study reused the same seeds across Hero parties.",
 "Policies start with comparable seeds, but later random streams may diverge.",
 "Printed cards and game rules are unchanged. Positive deltas favour the alternative.",
 r.policyProtocol||"Opt-in scripted simulation, not a human playtest.",
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
out.push("","## Combat Item eligibility and usage","",
 "| Strategy | Party | Planner | Combat decisions | With legal Item | Item selected | Use when eligible |",
 "|---|---|---|---:|---:|---:|---:|");
for(const st of r.strategies)for(const size of ["solo","duo"])
 for(const name of names.filter(n=>n.startsWith("planner-"))){
  const c=r.groups[st][size][name].choices||{};
  const evaluated=c.combatEvaluated||0;
  const eligible=c.combat_with_legal_item||0;
  const selected=c.combat_item||0;
  out.push("| "+st+" | "+size+" | "+name+" | "+evaluated+
   " | "+eligible+" | "+selected+" | "+
   (eligible?pct(selected/eligible):"n/a")+" |");
 }
if(r.partyResults){
 out.push("","## Per-party differences","",
  "Every solo Hero and duo pairing is reported separately; the five weakest",
  "planner-cautious parties in each strategy are shown below. Each party uses",
  "a separate deterministic seed stream.","",
  "| Strategy | Party | Baseline | Cautious | Change |",
  "|---|---|---:|---:|---:|");
 for(const st of r.strategies){
  const rows=Object.entries(r.partyResults[st]).map(([party,plans])=>({
   party,...plans["planner-cautious"]
  })).sort((a,b)=>a.winRate-b.winRate).slice(0,5);
  for(const x of rows)out.push("| "+st+" | "+x.party+" | "+
   pct(x.baselineWinRate)+" | "+pct(x.winRate)+" | "+pp(x.delta)+" |");
 }
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
 "- The Room planner enumerates printed d6 outcomes and adjusts known die overrides and reroll distributions.",
 "- Combat planning restricts Item choices to printed combat ACTION triggers, comparing damage, response prevention, and opportunity cost.",
 "- Combat choice counts must be interpreted relative to how often a legal Item was actually held.",
 "- PARLEY considers its cost and approximate chance of success; Seal uses a separate win-probability estimate.",
 "- Risk variants change the relative cost of damage, defeat, and expending resources.",
 "- These experiments test simulated *choices*, not whether card text is correct or whether they are fun.",
 "- Differences may include later random-number sequence divergence, despite common initial seeds.",
 "- Confidence intervals are approximate, have not been corrected for multiple comparisons, and do not include simulator-model uncertainty.",
 "- The game still automates many non-planner tactical decisions, including gear and potion usage.",
 "- Use a different --seed for an independent confirmatory sample after tuning; do not call this human-level balance.","",
 "## Stated limitations","",
 ...(r.limitations||[]).map(x=>"- "+x),"");
process.stdout.write(out.join("\n")+"\n");
