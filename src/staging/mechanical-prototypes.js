/**
 * Pre-registered mechanical experiments: independently assess interventions
 * and their interactions using the same canonical expedition+MCTS engine.
 * Do NOT bake new rules into the printed edition.
 */
import {compileStaging} from "./catalogue.js";
const one=(id,description,mechanics)=>({
 schema:"rogue-cards-staging-v1",id,description,mechanics
});
const ideas=[
 ["patrol-four-safe","Periodic Monster after every fourth regional Room; first response skipped.",{patrolEvery:4,patrolOpening:"skip"}],
 ["patrol-three-safe","Periodic Monster after every third regional Room; first response skipped.",{patrolEvery:3,patrolOpening:"skip"}],
 ["patrol-two-safe","Periodic Monster after every second regional Room; first response skipped.",{patrolEvery:2,patrolOpening:"skip"}],
 ["patrol-three-dis","Every third Room: Monster's first attack has DIS instead of skipping.",{patrolEvery:3,patrolOpening:"dis"}],
 ["patrol-three-raw","Every third Room has an unprotected Monster patrol.",{patrolEvery:3,patrolOpening:"normal"}],
 ["negotiate-wit","Every Monster offers an opposed WIT persuasion attempt; failure strengthens first attack.",{negotiation:"wit"}],
 ["negotiate-bribe","Every Monster can be given an Item as nonlethal tribute.",{negotiation:"item"}],
 ["negotiate-choice","Every Monster offers both opposed persuasion and one-Item tribute.",{negotiation:"both"}],
 ["retreat-tribute","During regional combat: discard an Item and abandon the battle.",{retreat:"item"}],
 ["retreat-wit","During regional combat: attempt WIT escape; failure provokes attack ADV.",{retreat:"wit"}],
 ["morale-half","At or below half Monster HP: allow it to yield and leave, or press the attack.",{morale:"half"}],
 ["morale-quarter","At or below one-quarter HP: allow the Monster to yield, or finish the fight.",{morale:"quarter"}],
 ["kill-loot","A defeated ordinary Monster adds an Item draw beyond its printed defeat effect.",{killReward:"draw"}],
 ["kill-recover","Defeating an ordinary Monster restores 2 HP to the party.",{killReward:"heal"}],
 ["warden-brace","Instead of attacking: guard to impose DIS on Warden's next attack.",{wardenTactic:"brace"}],
 ["warden-interrupt","Instead of attacking: spend an Item to cancel one Warden response.",{wardenTactic:"interrupt"}],
 ["warden-breach","Instead of attacking: WIT check to bypass the Warden's defence for 3 damage; failure grants ADV.",{wardenTactic:"breach"}],
 ["patrol-wit","Safe patrol every 3 Rooms plus universal WIT negotiation.",{patrolEvery:3,patrolOpening:"skip",negotiation:"wit"}],
 ["patrol-tribute","Safe patrol every 3 Rooms plus one-Item retreat.",{patrolEvery:3,patrolOpening:"skip",retreat:"item"}],
 ["patrol-mercy","Safe patrol every 3 Rooms plus Monster surrender at half HP.",{patrolEvery:3,patrolOpening:"skip",morale:"half"}],
 ["patrol-loot","Safe patrol every 3 Rooms plus full-kill loot incentive.",{patrolEvery:3,patrolOpening:"skip",killReward:"draw"}],
 ["fast-patrol-wit-mercy","Safe patrol every 2 Rooms plus WIT negotiation and half-HP surrender.",{patrolEvery:2,patrolOpening:"skip",negotiation:"wit",morale:"half"}],
 ["patrol-mercy-loot","Safe patrol every 3 Rooms plus half-HP surrender and distinct kill-loot incentive.",{patrolEvery:3,patrolOpening:"skip",morale:"half",killReward:"draw"}],
 ["negotiation-with-loot","WIT negotiation balanced against added post-kill Item rewards.",{negotiation:"wit",killReward:"draw"}],
 ["escape-or-mercy","WIT retreat during combat combined with half-HP Monster morale.",{retreat:"wit",morale:"half"}],
 ["warden-brace-patrol","Warden defensive reaction plus three-Room safe patrols.",{wardenTactic:"brace",patrolEvery:3,patrolOpening:"skip"}],
 ["warden-interrupt-morale","Interrupt Warden at cost, ordinary Monsters can yield at half HP.",{wardenTactic:"interrupt",morale:"half"}],
 ["warden-breach-talk","Warden weakness opportunities and universal opposed WIT negotiation.",{wardenTactic:"breach",negotiation:"wit"}],
 ["dungeon-adventure","Three-Room patrol + WIT parley + reward for killing + Warden guard.",{patrolEvery:3,patrolOpening:"skip",negotiation:"wit",killReward:"draw",wardenTactic:"brace"}],
 ["dungeon-survival","Two-Room patrol + WIT parley + quarter-HP surrender + healing after kills + Warden interrupt.",{patrolEvery:2,patrolOpening:"skip",negotiation:"wit",morale:"quarter",killReward:"heal",wardenTactic:"interrupt"}],
 ["dungeon-diplomacy","Four-Room patrol + all parley approaches + surrender + Warden breach.",{patrolEvery:4,patrolOpening:"skip",negotiation:"both",morale:"half",wardenTactic:"breach"}],
 ["dungeon-tactics","Negotiation, item retreat, Monster surrender and Warden interrupt without new patrols.",{negotiation:"both",retreat:"item",morale:"half",wardenTactic:"interrupt"}]
];
export function mechanicalPrototypes(){
 const ids=new Set();
 const result=ideas.map(([id,description,mechanics])=>{
  if(ids.has(id))throw Error("Duplicate prototype "+id);
  ids.add(id);
  const intervention=one(id,description,mechanics);
  compileStaging(intervention);
  return Object.freeze(intervention);
 });
 return Object.freeze(result);
}
