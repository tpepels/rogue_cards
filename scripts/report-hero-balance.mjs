/** Report new Hero balance in every magic/treasure solo and duo cohort. */
import {readFileSync} from "node:fs";
const file=process.argv[2];
if(process.argv.length!==3||!file)throw Error("Usage: node scripts/report-hero-balance.mjs hero-balance.json");
const r=JSON.parse(readFileSync(file,"utf8"));
if(r.experiment!=="rogue-cards-hero-balance-v1")throw Error("Unknown Hero balance study");
const percent=n=>(100*n).toFixed(1)+"%";
const rates=ids=>ids.map(id=>({
 party:id,magic:r.results.magic[id],treasure:r.results.treasure[id],
 mean:(r.results.magic[id].winRate+r.results.treasure[id].winRate)/2
}));
const solo=r.parties.filter(p=>p.length===1).map(p=>p.join("+"));
const duo=r.parties.filter(p=>p.length===2).map(p=>p.join("+"));
const out=[
 "# Rogue Cards - Hero and Item balance follow-up","",
 "Simulation commit: "+r.commit+" | Seed: "+r.seed+
 " | Expeditions: "+r.simulated+" | Per cohort: "+r.runsPerPartyStrategy,
 "",
 "This is scripted-agent simulation, not observed human play.",
 "All Item changes and revised Hero text are present in this run.","",
 "## Design guardrails","",
 "| Goal | Observation | Meets target? |",
 "|---|---:|---|",
 "| Solo range within 10 percentage points | "+percent(r.spreads.solo.range)+
 " | "+(r.goals.soloRangeAtMost0_10?"Yes":"No")+" |",
 "| Average two-Hero win rate 70–85% | "+percent(r.overall.duo.winRate)+
 " | "+(r.goals.duoMeanWithin0_70to0_85?"Yes":"No")+" |",
 "| No pair at or above 95% | Highest "+
 percent(r.spreads.duo.highest.rate)+" | "+(r.goals.noDuoAbove0_95?"Yes":"No")+" |",
 "",
 "## Solo Heroes - sorted by average win rate","",
 "| Hero | Magic | Treasure | Mean | 95% CI, Magic | 95% CI, Treasure |",
 "|---|---:|---:|---:|---:|---:|"
];
for(const row of rates(solo).sort((a,b)=>b.mean-a.mean))
 out.push("| "+row.party+" | "+percent(row.magic.winRate)+
 " | "+percent(row.treasure.winRate)+" | "+percent(row.mean)+
 " | "+row.magic.ci95.map(percent).join("–")+
 " | "+row.treasure.ci95.map(percent).join("–")+" |");
out.push("","## Two-Hero combinations - sorted by average win rate","",
 "| Party | Magic | Treasure | Mean | HP remaining (magic/treasure) |",
 "|---|---:|---:|---:|---:|");
for(const row of rates(duo).sort((a,b)=>b.mean-a.mean))
 out.push("| "+row.party+" | "+percent(row.magic.winRate)+
 " | "+percent(row.treasure.winRate)+" | "+percent(row.mean)+
 " | "+row.magic.meanRemainingHp.toFixed(1)+" / "+row.treasure.meanRemainingHp.toFixed(1)+" |");
out.push("","## Knight and Warrior in context","",
 "The updated Warrior has 18 HP and 4 printed ATK, retaining the starting",
 "Notched Sword's +2 ATK, BLOOD RUSH, and the high-risk damage identity.",
 "The Knight keeps the very strong 6 result, but 5 cancels damage without",
 "forcing a safer subsequent Monster behaviour. The Knight's second trigger",
 "will not fire after Warded Shield already completely blocks the hit.",
 "The Wizard and Priest roll d6 and lose half the result in HP, rounded up,",
 "on the low band. Monk 6 cancels the current Monster response and heals 2 HP;",
 "the Monk can wait for a dangerous Monster response before spending STILLNESS.",
 "",
 "## Recommendations for next iteration","",
 "- Only adjust card statistics again if the independently seeded result suggests a persistent and meaningful imbalance.",
 "- If Warrior + Knight remains dominant, compare Knight alone to Warrior alone and evaluate the Shield/INTERCEPT overlap before further stat nerfs.",
 "- If an underperforming Hero remains below target, prefer a distinctive ability buff over a universal HP or attack increase.",
 "- Check duo composition separately from solo strength; synergy drives pair variance.",
 "- Per-cell intervals are wide with 300 trials; do not interpret differences of 1–3 percentage points as decisive.",
 "- The earlier 108,000-run planner-v1 studies are from different mechanics and cannot serve as a controlled causal baseline.","",
 "## Caveats","");
for(const n of r.assumptions)out.push("- "+n);
process.stdout.write(out.join("\n")+"\n");
