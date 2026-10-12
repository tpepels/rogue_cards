import {simulateBatch,MODEL_VERSION} from "../src/playtest.js";
import {HEROES} from "../src/tabletop-data.js";
const runs=Number(process.argv[2]||2000);
if(!Number.isInteger(runs)||runs<1||runs>200000)throw Error("Usage: npm run balance -- [1..200000 runs]");
const setups=[...HEROES.map(h=>[h.id]),
 ["warrior","priest"],["knight","wizard"],["rogue","witch"],["thief","monk"],
 ["warrior","wizard"],["knight","priest"]];
console.log("ROGUE CARDS / "+MODEL_VERSION);
console.log("Conservative BASIC-ATTACK model: not a verified full-game win probability.");
console.log("Modeled: deck copies, nine regional Rooms, equipment statistics, all Monster behaviours, Hero combat abilities, Warden phases, seal price/roll.");
console.log("Not modeled: most card synergies, potions, Scroll/Wand activation, parley choices, corpse eating, room look-ahead. See meanUnmodeledEffects.");
console.log("RUNS EACH:",runs);
console.log(["Party","Win %","Vault %","Seal available % at Vault","Damage/run","Items/run","Unmodeled effects/run"].join("\t"));
for(const heroes of setups){
 const x=simulateBatch({runs,seed:0x16082026,heroes});
 const p=v=>(100*v).toFixed(1);
 console.log([heroes.join("+"),p(x.winRate),p(x.vaultRate),p(x.sealAvailabilityRate),
  x.meanDamage.toFixed(1),x.meanItemsDrawn.toFixed(1),x.meanUnmodeledEffects.toFixed(1)].join("\t"));
}
