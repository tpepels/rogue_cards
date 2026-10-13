/** Report one-at-a-time forced-legal Item interventions. */
import {readFileSync} from "node:fs";
const path=process.argv[2];
if(process.argv.length!==3||!path)
 throw Error("Usage: node scripts/report-item-targets.mjs item-targets.json");
const r=JSON.parse(readFileSync(path,"utf8"));
if(r.experiment!=="rogue-cards-targeted-items-v1")
 throw Error("Wrong targeted Item experiment");
const pct=x=>(100*x).toFixed(2)+"%";
const pp=x=>(100*x).toFixed(2)+" pp";
const out=[
 "# Rogue Cards - targeted Item strength/usage experiments","",
 "Commit: "+r.commit+" · Seed: "+r.seed+" · Expeditions: "+r.simulated,
 "Unresolved effects: "+r.unresolved+" · Stalls: "+r.stalls,
 "Runs per party/strategy: "+r.runsPerPartyStrategy,"",
 "Each named Item is forced only at one of **its own legal combat triggers**.",
 "All other decisions follow the same cautious planner. Actual card costs and",
 "random effects are unchanged. Contrasts start with matched seed/party/strategy",
 "but future dice sequences can diverge. A negative result is NOT proof that an",
 "Item is intrinsically weak, only that forcing it at legal opportunities is",
 "worse for this scripted policy.","",
 "## Card-by-card policy effects","",
 "| Item | Intervention runs | Runs actually forced | Forced uses | Baseline wins | Targeted wins | Change | Paired 95% CI |",
 "|---|---:|---:|---:|---:|---:|---:|---:|"
];
const entries=Object.entries(r.overall).sort((a,b)=>a[1].delta-b[1].delta);
for(const [id,x] of entries)out.push("| "+id+" | "+x.n+" | "+x.exposedRuns+
 " | "+x.forcedActions+" | "+pct(x.baselineWinRate)+" | "+
 pct(x.targetWinRate)+" | "+pp(x.delta)+" | "+
 pp(x.ci95[0])+" to "+pp(x.ci95[1])+" |");
out.push("","## Potentially wasteful forced use (screening, not verdict)","",
 "A negative paired effect with a 95% interval entirely below zero, and",
 "meaningful actual interventions, is a candidate for closer tactical study.","",
 "| Card | Estimated change | 95% interval | Forced-use runs |",
 "|---|---:|---:|---:|");
const negatives=entries.filter(([_,x])=>x.exposedRuns>=50&&x.ci95[1]<0);
if(!negatives.length)out.push("| None with sufficient observations | — | — | — |");
for(const [id,x] of negatives)out.push("| "+id+" | "+pp(x.delta)+
 " | "+pp(x.ci95[0])+" to "+pp(x.ci95[1])+" | "+x.exposedRuns+" |");
out.push("","## Strategy and party differences","",
 "| Item | Magic solo | Magic duo | Treasure solo | Treasure duo |",
 "|---|---:|---:|---:|---:|");
for(const id of r.candidates){
 const cells=[];
 for(const style of r.styles)for(const size of ["solo","duo"]){
  const x=r.groups[style][size][id];
  cells.push(pp(x.delta)+" ("+x.exposedRuns+" exposures)");
 }
 out.push("| "+id+" | "+cells.join(" | ")+" |");
}
out.push("","## Reading the results","",
 "- Low exposure makes a percentage-point contrast inconclusive.",
 "- Forced use at the first legal opportunity is *not* optimally timed use.",
 "- A card can be excellent as a passive, reaction, or Room-specific effect and be absent from this combat-action shortlist.",
 "- Use the full per-card opportunity and result report to distinguish scarcity, access, and tactical weakness.",
 "- Approximate normal confidence intervals are unadjusted for tests across many cards; any candidate requires replication.",
 "- The observed aggregate win-rate effect belongs to this scripted simulator, not to human play.","");
for(const note of r.notes)out.push("- "+note);
process.stdout.write(out.join("\n")+"\n");
