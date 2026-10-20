import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {randomSource} from "../src/engine/random.js";
import {ROOMS,MONSTERS} from "../src/tabletop-data.js";
import {FATE_ROOMS} from "../src/room-fates.js";
import {createCandidate} from "../src/balance/candidate.js";
import {playBalanceTrial} from "../src/balance/trial.js";

function stream(faces){
 for(let i=1;i<100000;i++){
  const seed=Math.imul(i,0x9e3779b9)>>>0,rng=randomSource(seed);
  if(faces.every(([sides,face])=>rng.die(sides)===face))return randomSource(seed);
 }
 throw Error("No deterministic fixture stream");
}
function setup(hero="thief"){
 const session=createDecisionSession({seed:11,heroes:[hero],gameMode:"everything-goes"});
 const s=session.state,h=s.heroes[0];
 for(const card of [...h.inventory])s.remove(h,card);
 h.used.add("hero");
 return session;
}
function give(session,id){
 const s=session.state,index=s.deck.findIndex(c=>c.id===id);
 assert.ok(index>=0,id);const [card]=s.deck.splice(index,1);
 s.noteDeckRemoval(card);s.add(s.heroes[0],card);return card;
}
function battle(hero="thief"){
 const session=setup(hero),s=session.state;
 s.room=ROOMS.find(r=>r.id==="u-passage");
 s.monster=MONSTERS.find(m=>m.id==="rat");s.monsterHP=s.monster.hp;
 session.phase="combat";session.heroIndex=0;return session;
}
const chooseDefault=legal=>legal.find(a=>a.kind==="keep")??
 legal.find(a=>a.kind==="skip")??legal.find(a=>a.mode==="save")??legal[0];
function paired(make,pick,pickReaction=chooseDefault){
 const traced=make(),plain=make(),effects=[],dice=[];
 let action=pick(sessionActions(traced),traced),guard=0;
 do{
  assert.ok(action,"fixture must choose a canonical action");
  let emitted=0;
  submitDecision(traced,action,{observeResult:false,recordHistory:false,
   onCommittedEvents:events=>{emitted++;effects.push(...events);},
   onCommittedDice:rolls=>dice.push(...rolls)});
  submitDecision(plain,action,{observeResult:false,recordHistory:false});
  assert.deepEqual(observeSession(traced).game,observeSession(plain).game);
  assert.deepEqual(traced.state.metrics,plain.state.metrics);
  assert.equal(traced.state.rng.snapshot(),plain.state.rng.snapshot());
  assert.equal(traced.state._telemetryEvents,undefined);
  if(traced.pendingNested){assert.equal(emitted,0);action=pickReaction(sessionActions(traced),traced);}
  else if(traced.phase==="retained-entry")action=pickReaction(sessionActions(traced),traced);
  else break;
 }while(++guard<100);
 assert.ok(guard<100,"transaction must settle");
 return {session:traced,effects,dice};
}
const damage=result=>result.effects.filter(e=>e.type==="damage"&&e.damage>0);

test("actual Monster attack attributes HP to the Monster and preserves dice/outcome",()=>{
 const result=paired(()=>{
  const session=battle();session.phase="monster-response";
  session.state.forcedBehavior=3;session.state.rng=stream([[20,20],[6,3],[6,2]]);
  return session;
 },legal=>legal[0]);
 assert.ok(damage(result).length);
 assert.ok(damage(result).every(e=>e.source==="monster:rat"));
 assert.ok(result.dice.some(d=>d.sides===20));
});

test("actual Wizard misfire attributes HP to the Hero rather than the active Monster",()=>{
 const result=paired(()=>{
  const session=battle("wizard");session.state.heroes[0].used.clear();
  session.state.rng=stream([[6,1],[6,4]]);return session;
 },legal=>legal.find(a=>a.kind==="attack"),legal=>legal.find(a=>a.mode==="risk")??chooseDefault(legal));
 assert.equal(damage(result).length,1);
 assert.equal(damage(result)[0].source,"hero:wizard");
 assert.equal(damage(result)[0].damage,2);
});

test("actual Item backfire and overcharge attribute HP to their physical Item",()=>{
 for(const mode of ["action","overcharge"]){
  const result=paired(()=>{
   const session=battle();give(session,"wand-sparks");
   session.state.rng=stream([[6,1]]);return session;
  },legal=>legal.find(a=>a.kind==="item"&&a.cardId==="wand-sparks"&&a.mode===mode));
  assert.ok(damage(result).length,mode);
  assert.ok(damage(result).every(e=>e.source==="item:wand-sparks"),mode);
  assert.ok(damage(result).every(e=>e.sourceCopy?.startsWith("wand-sparks#")),mode);
 }
});

test("retained fate damage and healing name the retained card on later entry",()=>{
 for(const [id,choice,stage,type] of [
  ["u-bone-seed",1,"DEEP","damage"],
  ["m-ferryman-oath",0,"FINAL","healing"],
  ["m-ferryman-oath",1,"FINAL","damage"]]){
  const result=paired(()=>{
   const session=setup(),s=session.state;
   s.heroes[0].hp-=4;s.keptRooms.push({card:FATE_ROOMS.find(r=>r.id===id),choice});
   s.stageProgress.UPPER=12;s.stageProgress.MIDDLE=12;
   if(stage==="FINAL")s.stageProgress.DEEP=12;
   return session;
  },legal=>legal.find(a=>a.kind==="continue"));
  const event=result.effects.find(e=>e.type===type&&(e.damage>0||e.restored>0));
  assert.ok(event,id);assert.equal(event.source,"room:"+id);
 }
});

test("actual paid reroll names the printed reroll rule instead of its triggering Item",()=>{
 const result=paired(()=>{
  const session=battle();give(session,"wand-undo");
  session.state.rng=stream([[20,2],[6,4],[20,1]]);return session;
 },legal=>legal.find(a=>a.kind==="attack"),legal=>
  legal.find(a=>a.cardId==="wand-undo"&&a.kind==="item-trigger")??
  legal.find(a=>a.kind==="reroll")??chooseDefault(legal));
 assert.ok(damage(result).length);
 assert.ok(damage(result).every(e=>e.source==="rule:push-your-luck"));
 assert.ok(damage(result).every(e=>e.sourceCopy===null));
});

test("unusual Item HP payments identify the exact physical tool",()=>{
 const result=paired(()=>{const session=setup();give(session,"odd-fever-candle");return session;},
  legal=>legal.find(a=>a.kind==="item-trigger"&&a.cardId==="odd-fever-candle"));
 assert.equal(damage(result)[0].source,"item:odd-fever-candle");
});

test("sampled real canonical trials have no unknown positive HP events",t=>{
 const candidate=createCandidate();let hpEvents=0;
 for(const heroes of [["warrior"],["wizard"],["priest"],["thief"],["knight"],
  ["monk"],["witch"],["rogue"],["warrior","priest"],["wizard","witch"]]){
  for(const seed of [3,42]){
   const result=playBalanceTrial({candidate,heroes,seed,profile:"random-v1",recordEvents:true});
   for(const event of result.events.flatMap(e=>e.effects)){
    if(!(event.damage>0||event.restored>0))continue;
    hpEvents++;assert.ok(event.source&&!event.source.includes("unattributed:"),
     JSON.stringify({heroes,seed,event}));
   }
  }
 }
 assert.ok(hpEvents>100);
 t.diagnostic(hpEvents+" positive HP events across 20 seeded expeditions; zero unknown sources");
});

test("delayed fight healing keeps its printed source even if the active Room changes",()=>{
 const result=paired(()=>{
  const session=battle(),s=session.state;
  s.heroes[0].hp-=8;s.monsterHP=0;session.phase="corpse";
  s.apply("FIGHT_HEAL",["2"],ROOMS.find(r=>r.id==="m-beetle"));
  return session;
 },legal=>legal.find(a=>a.kind==="leave"));
 assert.ok(result.effects.some(e=>e.type==="healing"&&e.source==="room:m-beetle"));
});

test("Knight self-misfire replaces the hit source without changing damage",()=>{
 const result=paired(()=>{
  const session=battle("knight");session.phase="monster-response";
  session.state.heroes[0].used.clear();session.state.forcedBehavior=3;
  session.state.rng=stream([[20,20],[6,4],[6,2],[6,1]]);return session;
 },legal=>legal[0],legal=>legal.find(a=>a.mode==="risk")??chooseDefault(legal));
 assert.equal(damage(result).length,1);
 assert.equal(damage(result)[0].damage,2);
 assert.equal(damage(result)[0].source,"hero:knight");
});

test("composite Monster hits preserve exact Item contributions without splitting HP mutation",()=>{
 for(const itemId of ["cursed-mail","mirror"]){
  const result=paired(()=>{
   const session=battle(),s=session.state;session.phase="monster-response";
   give(session,itemId);s.forcedBehavior=3;
   s.rng=stream(itemId==="mirror"?[[6,1],[20,20],[6,3],[6,2]]:
    [[20,20],[6,3],[6,2]]);return session;
  },legal=>legal[0],legal=>legal.find(a=>a.cardId==="mirror"&&a.kind==="item-trigger")??chooseDefault(legal));
  assert.equal(damage(result).length,1);
  const event=damage(result)[0];assert.equal(event.damage,7);
  assert.equal(event.attribution,"composite");
  assert.ok(event.source.includes("item:"+itemId));
  const contribution=event.sourceContributions.find(x=>x.source==="item:"+itemId);
  assert.equal(contribution.offered,2);
  assert.ok(contribution.sourceCopy.startsWith(itemId+"#"));
  assert.equal(event.effectiveDamageByContributor,null);
 }
});
