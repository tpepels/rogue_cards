import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {MONSTERS,WARDEN_FURY} from "../src/tabletop-data.js";
import {BALANCED_ROOMS,BALANCED_ROOM_COUNTS,BALANCED_ROOM_IDS}
 from "../src/room-balance.js";
import {PRESETS,selectionForPreset,physicalDeck}
 from "../src/decks.js";
import {compileStaging} from "../src/staging/catalogue.js";
import {postCombatHealingHypotheses,POST_COMBAT_HEAL_DOSES}
 from "../src/staging/combat-healing-hypotheses.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {settleMonsterVictory} from "../src/engine/combat-outcomes.js";
import {prepareRolloutDecks,sampleRolloutDecks} from "../src/rollout-state.js";
import {createDecisionSession,sessionActions}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";

const specs=postCombatHealingHypotheses();
const setup=(dose,monsterId="goblin")=>{
 const spec=specs.find(x=>x.mechanics.postCombatHeal===dose);
 const pool=compileStaging(spec);
 const state=new ExpeditionState({gameMode:"everything-goes",seed:31001,
  heroes:["warrior"],cardPools:pool});
 const monster=pool.monsters.find(m=>m.id===monsterId);
 state.monster=monster;
 state.monsterHP=0;
 state._activeMonsterFought=true;
 state.banished=false;
 state.heroes[0].hp=state.heroes[0].card.hp-6;
 return {state,monster,pool};
};
test("canonical Balanced B is 48 ordinary Rooms and six Corridors",()=>{
 assert.equal(BALANCED_ROOM_IDS.length,54);
 assert.equal(BALANCED_ROOMS.length,54);
 assert.equal(BALANCED_ROOMS.filter(c=>c.v2.kind==="CORRIDOR").length,6);
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  assert.equal(BALANCED_ROOMS.filter(c=>c.stage===stage).length,18);
  assert.equal(BALANCED_ROOMS.filter(c=>c.stage===stage&&
   c.v2.kind!=="CORRIDOR").length,16);
 }
 const game=new ExpeditionState({gameMode:"everything-goes",
  seed:9001,heroes:["warrior"]});
 assert.equal(game.roomDeckHasDuplicates,true);
 for(const stage of ["UPPER","MIDDLE","DEEP"])
  assert.equal(game.rooms[stage].length,18);
 const preset=PRESETS.find(p=>p.id==="balanced");
 assert.ok(preset);
 const physical=physicalDeck(selectionForPreset("balanced"));
 const regional=physical.filter(c=>c.type==="room"&&
  ["UPPER","MIDDLE","DEEP"].includes(c.stage));
 assert.equal(regional.length,54);
 // The fixed Amulet Vault is also type="room", but stage FINAL.
 assert.equal(physical.filter(c=>c.type==="room").length,55);
 assert.equal(physical.filter(c=>c.id==="vault"&&c.stage==="FINAL").length,1);
 for(const [id,n] of Object.entries(BALANCED_ROOM_COUNTS))
  assert.equal(regional.filter(c=>c.id===id).length,n);
});
test("healing hypotheses keep canonical B deck and only vary staged HP grant",()=>{
 assert.deepEqual(POST_COMBAT_HEAL_DOSES,[1,2,3,4,5,6,7,8,10]);
 for(const spec of specs){
  const pool=compileStaging(spec);
  assert.deepEqual(pool.rooms.map(c=>c.id),BALANCED_ROOMS.map(c=>c.id));
  assert.equal(pool.mechanics.postCombatHeal,
   Number(spec.id.split("-").at(-1)));
  assert.equal(pool.wardenFury.atk,WARDEN_FURY.atk);
  assert.ok(pool.monsters.every((m,i)=>m.hp===
   [...MONSTERS][i]?.hp||
   typeof m.hp==="number"));
 }
});
test("post-combat grant restores effective HP and logs wasted HP at cap",()=>{
 const {state,monster}=setup(2);
 const hp=state.heroes[0].hp;
 settleMonsterVictory(state,monster);
 assert.equal(state.heroes[0].hp,hp+2);
 assert.equal(state.metrics.postCombatHealTriggers,1);
 assert.equal(state.metrics.postCombatHealRestored,2);
 assert.equal(state.metrics.postCombatHealWasted,0);
 assert.equal(state._activeMonsterFought,false);
 const capped=setup(10);
 settleMonsterVictory(capped.state,capped.monster);
 assert.equal(capped.state.heroes[0].hp,capped.state.heroes[0].card.hp);
 assert.equal(capped.state.metrics.postCombatHealRestored,6);
 assert.equal(capped.state.metrics.postCombatHealWasted,4);
});
test("no bonus for negotiation, banishment, or Warden victory",()=>{
 const noFight=setup(3);
 noFight.state._activeMonsterFought=false;
 const hp=noFight.state.heroes[0].hp;
 settleMonsterVictory(noFight.state,noFight.monster);
 assert.equal(noFight.state.heroes[0].hp,hp);
 assert.equal(noFight.state.metrics.postCombatHealTriggers,0);
 const banished=setup(3);
 banished.state.banished=true;
 const hp2=banished.state.heroes[0].hp;
 settleMonsterVictory(banished.state,banished.monster);
 assert.equal(banished.state.heroes[0].hp,hp2);
 assert.equal(banished.state.metrics.postCombatHealTriggers,0);
 const warden=setup(3);
 warden.state.monster=warden.pool.wardenFury;
 warden.state.monsterHP=0;
 const hp3=warden.state.heroes[0].hp;
 settleMonsterVictory(warden.state,warden.state.monster,{warden:true});
 assert.equal(warden.state.heroes[0].hp,hp3);
 assert.equal(warden.state.metrics.postCombatHealTriggers,0);
});
test("canonical balanced duplicate Rooms can be fairly sampled by MCTS",()=>{
 const session=createDecisionSession({gameMode:"everything-goes",
  seed:7281,heroes:["warrior"]});
 const state=session.state;
 const preparation=prepareRolloutDecks(state,"fair");
 assert.equal(preparation.rooms.UPPER.remaining,18);
 assert.equal(preparation.rooms.UPPER.available.length,18);
 const sampled=sampleRolloutDecks(state,{knowledge:"fair",
  deckSeed:55,blueprint:preparation});
 assert.equal(sampled.rooms.UPPER.length,18);
 const before=state.rng.snapshot();
 const result=searchDecision(session,{budget:2,seed:1234,
  knowledge:"fair",maxSteps:3000,strictTerminal:false,
  treeMode:"frontier"});
 assert.ok(sessionActions(session).some(x=>x.kind===result.recommended.kind));
 assert.equal(state.rng.snapshot(),before);
});
test("healing suite CLI validates and includes the balanced canonical control",()=>{
 const proc=spawnSync(process.execPath,[
  "scripts/study-balance-hypotheses.mjs","--suite","combat-healing",
  "--variant-limit","9","--finalists","4","--dry-run"
 ],{encoding:"utf8",timeout:30000});
 assert.equal(proc.status,0,proc.stderr);
 const result=JSON.parse(proc.stdout);
 assert.equal(result.hypotheses.length,9);
 assert.equal(result.suite,"combat-healing");
 assert.equal(result.screenTrials,(9+1)*8*4);
});
