/**
 * Exhaustive solo-only roots for stochastic MCTS studies.
 * A single real Hero, real printed starting gear and one randomly drawn
 * physical Item. No artificial inventory cards or two-Hero profiles.
 */
import {HEROES,MONSTERS} from "../src/tabletop-data.js";
import {EXTRA_MONSTERS} from "../src/monster-expansion.js";
import {makeEncounter} from "./study-combat-causes.mjs";

const ids=["crawler","troll","wisp","mold","wax-golem",
 "sentinel","bone-cantor","glass-revenant"];
const monsterPool=[...MONSTERS,...EXTRA_MONSTERS];
export const SOLO_HERO_IDS=Object.freeze(HEROES.map(h=>h.id));
export const SOLO_MONSTER_IDS=Object.freeze(ids);
export const SOLO_CONDITIONS=Object.freeze(["fresh","injured","critical"]);
export function soloScenarioIds(){
 const result=[];
 // Interleave conditions for fair partial runs: any short prefix covers
 // multiple Hero classes, Monsters, and health risk regimes.
 for(const monster of ids)
  for(const hero of SOLO_HERO_IDS)
   for(const condition of SOLO_CONDITIONS)
    result.push(monster+"__solo-"+hero+"-"+condition);
 return result;
}
export function makeSoloScenario(scenarioId,{seed=20261018}={}){
 const match=/^([a-z0-9-]+)__solo-([a-z]+)-(fresh|injured|critical)$/.exec(scenarioId);
 if(!match)throw Error("Invalid solo scenario ID "+scenarioId);
 const [,monsterId,heroId,condition]=match;
 if(!ids.includes(monsterId)||!SOLO_HERO_IDS.includes(heroId))
  throw Error("Unknown solo Monster or Hero "+scenarioId);
 const monster=monsterPool.find(m=>m.id===monsterId);
 if(!monster)throw Error("Missing printed Monster "+monsterId);
 const session=makeEncounter(monster,[heroId],seed);
 const hero=session.state.heroes[0];
 if(condition==="injured")
  hero.hp=Math.max(1,Math.floor(hero.card.hp*0.6));
 else if(condition==="critical")
  hero.hp=Math.max(1,Math.floor(hero.card.hp*0.25));
 if(condition==="critical")hero.poison=true;
 if(session.state.heroes.length!==1||
   session.state.heroes[0].hp<=0)
  throw Error("Not a living solo scenario "+scenarioId);
 return {id:scenarioId,monsterId,heroId,condition,session};
}
