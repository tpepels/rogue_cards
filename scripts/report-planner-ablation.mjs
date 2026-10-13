/**
 * Report all 16 interventions, conditional contrasts, and non-additive
 * interactions. Percent-point calculations happen only for display.
 */
import {readFileSync} from "node:fs";
const file=process.argv[2];
if(process.argv.length!==3||!file)
 throw Error("Usage: node scripts/report-planner-ablation.mjs ablation.json");
const r=JSON.parse(readFileSync(file,"utf8"));
if(r.experiment!=="rogue-cards-planner-ablation-v1")
 throw Error("Not a planner ablation study");
const pct=x=>(100*x).toFixed(1)+"%";
const pp=x=>(100*x).toFixed(2)+" pp";
const fx=x=>x.toFixed(2);
const nice=s=>s==="room"?"Room choices":s==="combat"?"Combat Items":
 s==="parley"?"PARLEY":s==="seal"?"SEAL":s;
const groups=[
 ["All parties, both strategies",r.groups.all],
 ["Magic solo",r.groups.magic.solo],
 ["Magic duo",r.groups.magic.duo],
 ["Treasure solo",r.groups.treasure.solo],
 ["Treasure duo",r.groups.treasure.duo]
];
const lines=[
 "# Rogue Cards - isolated planner feature ablations","",
 "Commit: "+(r.commit||"unknown"),
 "Seed: "+r.seed,
 "Expeditions: "+r.simulated.toLocaleString("en-US")+
 " | Unresolved: "+r.unresolved+" | Stalls: "+r.stalls,
 "Runs per party and strategy: "+r.runsPerPartyStrategy,
 "",
 "The same 16 combinations of planner features are tested for each seed,",
 "party, and strategy. All other scripted decisions follow the simulator.",
 "All reported differences are **win-rate percentage points** (pp).",
 "",
 "## 1. Headline - one feature at a time versus all features","",
 "| Group | Scripted (none) | All four | Combined gain |",
 "|---|---:|---:|---:|"
];
for(const [label,g] of groups)lines.push("| "+label+" | "+pct(g.configurations[0].winRate)+
 " | "+pct(g.configurations[15].winRate)+" | "+
 pp(g.configurations[15].winRate-g.configurations[0].winRate)+" |");
for(const [label,g] of groups){
 lines.push("","## 2. Feature attribution - "+label,"",
  "Stand-alone: enabling only that feature. Leave-one-out: the loss from",
  "removing it when the other three are enabled. Factorial average: its",
  "effect averaged across all eight combinations of the other features.",
  "These are different causal contrasts and cannot be summed.",
  "",
  "| Feature | Stand-alone | Leave-one-out | Factorial average | 95% CI (factorial) |",
  "|---|---:|---:|---:|---:|");
 for(const f of r.features){
  const x=g.effects;
  lines.push("| "+nice(f)+" | "+pp(x.alone[f].estimate)+
   " | "+pp(x.removed[f].estimate)+" | "+pp(x.average[f].estimate)+
   " | ["+pp(x.average[f].ci95[0])+", "+pp(x.average[f].ci95[1])+"] |");
 }
}
lines.push("","## 3. Pairwise interactions (overall)","",
 "Positive values mean the two features reinforce each other; negative values",
 "mean diminishing returns or interference. Values average over the other",
 "two features and include future RNG path divergence.",
 "",
 "| Feature pair | Interaction | Approx. 95% CI |",
 "|---|---:|---:|");
for(const [name,x] of Object.entries(r.groups.all.effects.pairwise)){
 const label=name.split("+").map(nice).join(" + ");
 lines.push("| "+label+" | "+pp(x.estimate)+" | ["+
  pp(x.ci95[0])+", "+pp(x.ci95[1])+"] |");
}
lines.push("","## 4. All sixteen configurations","",
 "| Bits (R,C,P,S) | Enabled | Overall wins | Magic solo | Magic duo | Treasure solo | Treasure duo |",
 "|---|---|---:|---:|---:|---:|---:|");
for(const conf of r.configs){
 const i=conf.mask, label=conf.enabled.length?conf.enabled.map(nice).join(", "):"none";
 lines.push("| "+conf.id+" | "+label+" | "+
 pct(r.groups.all.configurations[i].winRate)+" | "+
 pct(r.groups.magic.solo.configurations[i].winRate)+" | "+
 pct(r.groups.magic.duo.configurations[i].winRate)+" | "+
 pct(r.groups.treasure.solo.configurations[i].winRate)+" | "+
 pct(r.groups.treasure.duo.configurations[i].winRate)+" |");
}
lines.push("","## 5. Observable behavioural changes","",
 "All rates below are per simulated expedition except combat use conditional",
 "on a legal combat Item being available; those opportunities exclude emergency",
 "Potion use, automatic triggers, and reactive Items.",
 "",
 "| Group | Policy | Room planner evaluations / run | Combat Item use (when eligible) | PARLEY attempts / run | SEAL attempts / run |",
 "|---|---|---:|---:|---:|---:|");
for(const [label,g] of groups){
 for(const i of [0,15]){
  const x=g.configurations[i];
  lines.push("| "+label+" | "+(i?"All four":"Scripted")+" | "+
   fx(x.roomDecisions/x.n)+" | "+
   (x.combatItemUseWhenLegal==null?"n/a":pct(x.combatItemUseWhenLegal))+
   " | "+fx(x.negotiations)+" | "+fx(x.sealAttempts)+" |");
 }
}
lines.push("","## 6. Smallest win-rate groups under the full planner","",
 "| Strategy | Party | Scripted | All four | Delta |",
 "|---|---|---:|---:|---:|");
for(const st of r.strategies){
 const rows=Object.entries(r.partyResults[st]).map(([name,v])=>({
  name,base:v.winRates[0],full:v.winRates[15]
 })).sort((a,b)=>a.full-b.full).slice(0,8);
 for(const x of rows)lines.push("| "+st+" | "+x.name+" | "+
  pct(x.base)+" | "+pct(x.full)+" | "+pp(x.full-x.base)+" |");
}
lines.push("","## Interpretation and limitations","",
 "- The baseline mask must be verified against the original non-planner scripted simulator.",
 "- Each contrast is paired within its party/strategy/seed and uses an approximate normal 95% interval.",
 "- These intervals are unadjusted for multiple comparisons; many tiny effects will be indistinguishable from noise.",
 "- Stand-alone gains and removal losses are distinct because features interact.",
 "- Do not attribute any change to a feature whose effect is near zero or has a wide interval crossing zero.",
 "- Full policy paths can consume different random numbers after the first different decision.",
 "- Observed improvements concern this scripted simulator only, not physical players.","",
 "### Study caveats","");
for(const x of r.limitations)lines.push("- "+x);
process.stdout.write(lines.join("\n")+"\n");
