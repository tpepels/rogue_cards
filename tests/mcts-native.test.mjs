import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {loadNativeMcts} from "../src/native-mcts-node.js";
import {searchDecision,mctsPublicStateHash}
 from "../src/session-mcts.js";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {ROOMS,MONSTERS} from "../src/tabletop-data.js";

const available=loadNativeMcts();
const require=createRequire(import.meta.url);
const addon=available?
 require(fileURLToPath(new URL("../native/build/mcts.node",import.meta.url))):null;
const fnv=(seed,s)=>{
 let hash=seed>>>0;
 for(let i=0;i<s.length;i++)
  hash=Math.imul(hash^s.charCodeAt(i),16777619)>>>0;
 return hash;
};
test("compiled hash preserves exact UTF-16 FNV for unicode, surrogates and game observations",
 {skip:!available},()=>{
 for(const seed of [0,1,2166136261,0xffffffff]){
  for(const text of ["","a","é","🪦","one\u0000two",
   'X'.repeat(13000),JSON.stringify({p:"reaction",nested:[1,2,3]})]){
   assert.equal(addon.hashPart(seed,text),fnv(seed,text));
  }
 }
 for(const heroes of [["warrior"],["warrior","wizard"]]){
  const session=createDecisionSession({seed:20261016,heroes});
  assert.equal(mctsPublicStateHash(session,true),mctsPublicStateHash(session));
  const actions=sessionActions(session);
  submitDecision(session,actions.find(a=>a.kind==="continue"));
  assert.equal(mctsPublicStateHash(session,true),mctsPublicStateHash(session));
 }
});
function atRoom(seed,id,heroes){
 const session=createDecisionSession({seed,heroes});
 const card=ROOMS.find(r=>r.id===id),pile=session.state.rooms[card.stage];
 session.state.beginRoom(pile.splice(pile.findIndex(x=>x.id===id),1)[0]);
 session.phase="room";
 return session;
}
function atCombat(seed){
 const s=atRoom(seed,"u-nest",["wizard"]);
 s.state.monster=MONSTERS.find(m=>m.id==="rat");
 s.state.monsterHP=s.state.monster.hp;
 s.phase="combat";s.heroIndex=0;
 return s;
}
test("compiled hash gives bit-identical seeded MCTS outcomes with unchanged live state",
 {skip:!available},()=>{
 for(const [factory,budget] of [
  [()=>atRoom(212,"u-fountain",["warrior"]),4],
  [()=>atRoom(313,"u-passage",["warrior","wizard"]),3],
  [()=>atCombat(414),5],
  [()=>createDecisionSession({seed:515,heroes:["wizard"]}),3]
 ]){
  const session=factory();
  const before=JSON.stringify(observeSession(session));
  const rng=session.state.rng.snapshot();
  const opts={budget,seed:7121,knowledge:"fair",maxSteps:4000,
   speculativeTransitions:true,canonicalReactionPhases:true,
   deferReactionCheckpoints:true,collectCoverage:false};
  const canonical=searchDecision(session,opts);
  const native=searchDecision(session,{...opts,nativeHash:true});
  assert.deepEqual(native,canonical);
  assert.equal(JSON.stringify(observeSession(session)),before);
  assert.equal(session.state.rng.snapshot(),rng);
 }
});
test("native option refuses invalid use rather than silently falling back",()=>{
 const session=createDecisionSession({seed:14,heroes:["warrior"]});
 assert.throws(()=>searchDecision(session,{budget:1,nativeHash:"yes"}),
  /nativeHash must be boolean/);
 assert.throws(()=>searchDecision(session,{budget:1,nativeHash:true,
  fastStateHash:false}),/nativeHash requires fastStateHash/);
});
