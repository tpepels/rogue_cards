import {simulateFullBatch} from "../src/expedition-campaign.js";
import {HEROES} from "../src/tabletop-data.js";
import {strategies} from "../src/expedition-runtime.js";
const runs=Number(process.argv[2]||300);
if(!Number.isInteger(runs)||runs<1||runs>100000)throw Error("Usage: npm run balance:full -- <runs>");
const setups=[...HEROES.map(h=>[h.id]),["warrior","priest"],["knight","wizard"],["rogue","witch"],["thief","monk"]];
const fmt=x=>(100*x).toFixed(1);
console.log("ROGUE CARDS / FULL-EFFECT EXPLICIT POLICY MONTE CARLO");
console.log("Measured outcomes are POLICY-DEPENDENT, not verified optimal or human win rates.");
console.log("Runs per setup per policy:",runs);
console.log("Strategy\tHeroes\tWin%\tVault%\tSpells/exp\tPotions/exp\tNegotiations/exp\tUnresolved\tStalls");
for(const strategy of strategies){
 for(const heroes of setups){
  const r=simulateFullBatch({runs,seed:0x120a2026,heroes,strategy});
  console.log([strategy,heroes.join("+"),fmt(r.winRate),fmt(r.vaultRate),
   r.meanMagic.toFixed(2),r.meanPotions.toFixed(2),r.meanNegotiations.toFixed(2),
   r.unresolvedEffects,r.stalledExpeditions].join("\t"));
  if(r.unresolvedEffects||r.stalledExpeditions)process.exitCode=1;
 }
}
