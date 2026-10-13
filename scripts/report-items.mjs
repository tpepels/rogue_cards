/** Human-readable independent-seed Item access and use experiment. */
import {readFileSync} from "node:fs";
const filename=process.argv[2];
if(!filename||process.argv.length!==3)
 throw Error("Usage: node scripts/report-items.mjs items.json");
const r=JSON.parse(readFileSync(filename,"utf8"));
if(r.experiment!=="rogue-cards-item-trials-v1")throw Error("Wrong study");
const pct=n=>(n*100).toFixed(1)+"%";
const pp=n=>(n*100).toFixed(2)+" pp";
const fixed=n=>n.toFixed(2);
const out=[
 "# Rogue Cards - Item accessibility, actions and value","",
 "Commit: "+(r.commit||"unknown"),"Seed: "+r.seed,
 "Simulations: "+r.simulated+" | Unresolved: "+r.unresolved+" | Stalls: "+r.stalls,
 "Runs per party and strategy: "+r.runsPerPartyStrategy,
 "",
 "## Policy comparison","",
 "Normal = contextual cautious planner. Free = no future reservation penalty",
 "but all printed card costs remain. Force = use a legal combat Item whenever",
 "possible, even where attacking is preferable. Scripted = old policy.","",
 "| Cohort | Scripted | Normal | Zero reservation | Forced legal Item |",
 "|---|---:|---:|---:|---:|"
];
for(const [label,g] of [
 ["All",r.groups.all],["Magic solo",r.groups.magic.solo],
 ["Magic duo",r.groups.magic.duo],["Treasure solo",r.groups.treasure.solo],
 ["Treasure duo",r.groups.treasure.duo]
])out.push("| "+label+" | "+r.policies.map(p=>pct(g.policies[p].winRate)).join(" | ")+" |");
out.push("","## Paired policy differences versus scripted baseline","",
 "| Cohort | Policy | Win-rate difference | Approximate 95% CI |",
 "|---|---|---:|---:|");
for(const [label,g] of [
 ["All",r.groups.all],["Magic solo",r.groups.magic.solo],
 ["Magic duo",r.groups.magic.duo],["Treasure solo",r.groups.treasure.solo],
 ["Treasure duo",r.groups.treasure.duo]
])for(const p of r.policies.slice(1)){
 const c=g.pairedContrasts[p];
 out.push("| "+label+" | "+p+" | "+pp(c.delta)+" | "+
 pp(c.ci95[0])+" to "+pp(c.ci95[1])+" |");
}
out.push("","## Item-by-Item observations","",
 "Draws exclude the automatically granted starting Object; acquisitions include it.",
 "Opportunities are **phase-specific trigger opportunities**, often repeated",
 "across turns for the same copy. Uses include reactive effects and exploration",
 "activations, not only combat actions.","",
 "| Item | Draws | Trigger opportunities | Normal uses | Free uses | Forced uses | Normal use / opportunity |",
 "|---|---:|---:|---:|---:|---:|---:|");
const all=r.groups.all.policies;
const IDs=Object.keys(all.normal.items);
for(const id of IDs){
 const n=all.normal.items[id],f=all.free.items[id],x=all.force.items[id];
 out.push("| "+id+" | "+n.draws+" | "+n.opportunities+" | "+
 n.uses+" | "+f.uses+" | "+x.uses+" | "+
 (n.opportunities?pct(n.uses/n.opportunities):"n/a")+" |");
}
out.push("","## Where each Item is usable","",
 "| Item | Opportunity phases (normal policy) | Actual use types |",
 "|---|---|---|");
for(const id of IDs){
 const x=all.normal.items[id];
 out.push("| "+id+" | "+
 Object.entries(x.byPhase).sort((a,b)=>b[1]-a[1])
  .map(([phase,n])=>phase+" ("+n+")").join(", ")+" | "+
 Object.entries(x.byMode).sort((a,b)=>b[1]-a[1])
  .map(([mode,n])=>mode+" ("+n+")").join(", ")+" |");
}
out.push("","## Passive equipment applications (separate from activations)","",
 "Passive bonuses work without consuming a Hero action. Their trigger totals",
 "should not be treated as dice-activation counts.","",
 "| Item | Passive applications | Added ATK totals | Added DEF totals | WIT disadvantage applications |",
 "|---|---:|---:|---:|---:|");
for(const id of IDs){
 const p=all.normal.items[id].passive;
 if(!p||!p.triggers)continue;
 out.push("| "+id+" | "+p.triggers+" | "+p.attackBonus+
  " | "+p.defenceBonus+" | "+p.witPenalties+" |");
}
out.push("","## Observed direct outcomes from actual activations","",
 "These are totals over normal-policy simulations, NOT intrinsic item power;",
 "they depend on encounters, draws, targets, survival and sequencing.","",
 "| Item | Uses | Monster damage | HP healed | Self damage | Draws | Responses skipped | Cures |",
 "|---|---:|---:|---:|---:|---:|---:|---:|");
for(const id of IDs){
 const x=all.normal.items[id],v=x.result;
 out.push("| "+id+" | "+x.uses+" | "+v.damage+" | "+v.healing+
 " | "+v.selfDamage+" | "+v.draws+" | "+v.responsesSkipped+
 " | "+v.poisonCured+" |");
}
out.push("","## Interpretation","",
 "- A zero-opportunity card may be conditional or rarely drawn, not necessarily defective.",
 "- For any Item with substantial exposure but zero legal opportunities, investigate the trigger coverage.",
 "- For any Item with many legal opportunities but no uses, investigate the contextual decision value.",
 "- The forced policy deliberately spends legal resources aggressively; worse outcomes do not prove the card is weak.",
 "- Passive equipment benefits are not fully represented in activation-level outcomes.",
 "- Comparing outcomes across policies does not isolate an Item's intrinsic value because the policies alter future states.",
 "- Any proposal to redesign a printed card requires targeted scenario-level tests and a physical playtest.","",
 "## Limitations","");
for(const l of r.limitations)out.push("- "+l);
process.stdout.write(out.join("\n")+"\n");
