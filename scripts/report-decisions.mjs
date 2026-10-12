/**
 * Turn decision-study JSON into a readable Markdown report.
 * node scripts/report-decisions.mjs decision-study.json > decision-study.md
 */
import {readFileSync} from "node:fs";
const path=process.argv[2];
if(!path||process.argv.length>3)
 throw Error("Usage: node scripts/report-decisions.mjs decision-study.json");
const data=JSON.parse(readFileSync(path,"utf8"));
if(data.experiment!=="rogue-cards-decision-policy-ablation-v1")
 throw Error("Not a compatible decision-study report");
const pp=v=>v===null?"n/a":(100*v).toFixed(2)+" pp";
const pct=v=>v===null?"n/a":(100*v).toFixed(1)+"%";
const diff=v=>pp(v.pairedWinDelta)+" ("+pp(v.ci95[0])+" to "+pp(v.ci95[1])+")";
const lines=[
 "# Rogue Cards - local decision-policy study",
 "",
 "Commit: "+(data.commit||"unavailable"),
 "Expeditions: "+data.simulated.toLocaleString("en-US"),
 "Seeds per party/strategy: "+data.runsPerPartyStrategy,
 "Mechanical errors: "+data.unresolved+"; stalls: "+data.stalls,
 "",
 "Changes compared with each strategy's original automated policy.",
 "These are scripted alternatives, **not changes to cards or tabletop rules**.",
 "",
 "## Overall paired comparisons",
 "",
 "| Strategy | Party | Experiment | Original win | Experimental win | Difference (95% CI) |",
 "|---|---|---|---:|---:|---:|"
];
for(const s of data.strategies)for(const p of ["solo","duo"])
 for(const mode of data.profiles.slice(1)){
  const x=data.groups[s][p][mode];
  lines.push("| "+s+" | "+p+" | "+mode+" | "+pct(x.baselineWinRate)+
   " | "+pct(x.alternativeWinRate)+" | "+diff(x)+" |");
 }
lines.push("","## Where outcomes change","");
for(const strategy of data.strategies){
 lines.push("### "+strategy,"",
  "| Party | Mode | Vault difference | Damage/run | Items spent/run | Magic actions/run | PARLEY attempts/run | Seal attempts/run |",
  "|---|---|---:|---:|---:|---:|---:|---:|");
 for(const k of ["solo","duo"])for(const mode of data.profiles.slice(1)){
  const x=data.groups[strategy][k][mode],fmt=v=>v.toFixed(2);
  lines.push("| "+k+" | "+mode+" | "+pp(x.vaultDelta)+" | "+fmt(x.damageDelta)+
   " | "+fmt(x.spentDelta)+" | "+fmt(x.magicActionDelta)+
   " | "+fmt(x.parleyAttemptDelta)+" | "+fmt(x.sealAttemptDelta)+" |");
 }
 lines.push("");
}
lines.push("## Hero-specific results","","| Solo Hero | Strategy | Original win | Experimental win | Delta (95% CI) |",
 "|---|---|---:|---:|---:|");
for(const [hero,byStrategy] of Object.entries(data.soloHeroes))
 for(const strategy of data.strategies){
  const x=byStrategy[strategy].adaptive;
  lines.push("| "+hero+" | "+strategy+" | "+pct(x.baselineWinRate)+
   " | "+pct(x.alternativeWinRate)+" | "+diff(x)+" |");
 }
lines.push("","## Limits","",
 "- Approximate intervals are not corrected for multiple comparisons.",
 "- Decisions can change subsequent random-roll consumption despite matching seeds.",
 "- For per-Item or Room-choice effects, run the separate Item/Room studies.",
 "- Improving scripted win rates is not proof of realistic human play or fun.","");
process.stdout.write(lines.join("\n")+"\n");
