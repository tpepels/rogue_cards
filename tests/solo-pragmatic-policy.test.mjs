import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,pragmaticSoloAction,
 selectSessionPolicyAction} from "../src/session-policy.js";
import {ALL_MONSTERS} from "../src/decks.js";
import {playFullSoloExpedition} from "../scripts/study-solo-expedition-balance.mjs";
import {createDecisionRecorder} from "../src/experiment-telemetry.js";

const hero=(seed=891)=>createDecisionSession({
 seed,heroes:["warrior"],gameMode:"everything-goes"
});
const monster=(s,id)=>{
 const card=ALL_MONSTERS.find(m=>m.id===id);
 assert.ok(card,"Missing monster "+id);
 s.state.monster=card;s.state.monsterHP=card.hp;
 s.phase="parley";
 return card;
};
const give=(s,id)=>{
 const i=s.state.deck.findIndex(x=>x.id===id);
 assert.ok(i>=0,"Missing physical item "+id);
 const [card]=s.state.deck.splice(i,1);
 s.state.heroes[0].inventory.push(card);
 return card;
};

test("Low HP triggers only a legal predictable healing Tool without searching",()=>{
 const s=hero(),h=s.state.heroes[0];
 give(s,"ex-rations");
 h.hp=2;
 const policy=createSessionPolicy();
 const legal=sessionActions(s);
 const callback=[];
 const choice=selectSessionPolicyAction(s,policy,{
  equipmentMode:"solo-pragmatic",budget:2,legalActions:legal,
  onPolicyDecision:x=>callback.push(x),
  onSearchResult:()=>assert.fail("Must skip MCTS for reliable healing")
 });
 assert.ok(legal.includes(choice));
 assert.equal(choice.kind,"item-trigger");
 assert.equal(choice.cardId,"ex-rations");
 assert.deepEqual(callback.map(x=>x.rule),["safe-heal:ex-rations"]);
 assert.equal(policy.shortcutCount,1);
 submitDecision(s,choice,{recordHistory:false,observeResult:false});
 assert.equal(s.state.heroes[0].hp,4);
 assert.ok(!s.state.heroes[0].inventory.some(x=>x.id==="ex-rations"),
  "Printed consumable is actually spent");
});
test("Healthy/near-full HP never wastes a healing Tool",()=>{
 const s=hero(),h=s.state.heroes[0];
 give(s,"ex-rations");h.hp=h.card.hp-1;
 const res=pragmaticSoloAction(s,sessionActions(s));
 assert.equal(res,null);
});
test("Unidentified Potions are not assumed to be safe heals",()=>{
 const s=hero(),h=s.state.heroes[0];
 // Starting Item might already be a random Potion; no assumptions made.
 h.hp=2;
 const res=pragmaticSoloAction(s,sessionActions(s));
 assert.equal(res,null);
});
test("Low HP uses legal free WIT parley; actual result remains random/canonical",()=>{
 const s=hero(),h=s.state.heroes[0];
 monster(s,"wisp");h.hp=2;
 const legal=sessionActions(s);
 assert.ok(legal.some(a=>a.kind==="parley"));
 const policy=createSessionPolicy(),chosen=[];
 const a=selectSessionPolicyAction(s,policy,{
  equipmentMode:"solo-pragmatic",legalActions:legal,budget:1,
  onPolicyDecision:x=>chosen.push(x.rule),
  onSearchResult:()=>assert.fail("No MCTS at safe shortcut")
 });
 assert.equal(a.kind,"parley");
 assert.deepEqual(chosen,["critical-hp-avoid:wisp"]);
 assert.equal(policy.shortcutCount,1);
});
test("Healthy Hero fights Monster only if printed reward is useful",()=>{
 const s=hero(),h=s.state.heroes[0];
 const goblin=monster(s,"goblin");
 h.hp=h.card.hp;
 assert.ok(goblin.v2.defeatOps.some(x=>x.startsWith("DRAW:")));
 const safe=pragmaticSoloAction(s,sessionActions(s));
 assert.equal(safe?.action.kind,"fight");
 assert.equal(safe.rule,"healthy-reward-fight:goblin");
 // Rat HEAL 2 is not a useful reward at maximum Hero HP.
 monster(s,"rat");
 assert.equal(pragmaticSoloAction(s,sessionActions(s)),null);
});
test("Critical HP prioritizes guaranteed escape even when it spends the last Items",()=>{
 const s=hero(),h=s.state.heroes[0];
 monster(s,"goblin");h.hp=2;
 // Initial 2 Items would both be discarded to pay the Goblin.
 assert.ok(sessionActions(s).some(a=>a.kind==="parley"));
 assert.equal(h.inventory.length,2);
 const forced=pragmaticSoloAction(s,sessionActions(s));
 assert.equal(forced?.action.kind,"parley");
 assert.equal(forced?.rule,"critical-hp-avoid:goblin");
 // At moderately low HP the same two-Item payment is deferred to MCTS.
 h.hp=Math.ceil(h.card.hp*.4);
 assert.equal(pragmaticSoloAction(s,sessionActions(s)),null);
 give(s,"ex-rations");
 const result=pragmaticSoloAction(s,sessionActions(s));
 assert.equal(result?.action.kind,"parley");
 assert.equal(result?.rule,"low-hp-avoid:goblin");
});
test("No forced retreat from Monster when no legal Parley",()=>{
 const s=hero(),h=s.state.heroes[0];
 monster(s,"sentinel");h.hp=2;
 // Sentinel requires two METAL Items; starter Items do not qualify.
 const actions=sessionActions(s);
 assert.ok(actions.some(a=>a.kind==="fight"));
 if(!actions.some(a=>a.kind==="parley"))
  assert.equal(pragmaticSoloAction(s,actions),null);
});
test("Only safe trivial Attack versus Pass bypasses MCTS",()=>{
 const s=hero(),h=s.state.heroes[0];
 monster(s,"rat");s.phase="combat";
 h.hp=h.card.hp;
 const pair=[
  {phase:"combat",kind:"attack",heroIndex:0},
  {phase:"combat",kind:"pass",heroIndex:0}
 ];
 const shortcut=pragmaticSoloAction(s,pair);
 assert.equal(shortcut?.action.kind,"attack");
 assert.equal(shortcut.rule,"only-attack-or-pass");
 h.hp=2;
 assert.equal(pragmaticSoloAction(s,pair),null);
});
test("All shortcuts are isolated to explicit SOLO policy, no hidden multi-hero change",()=>{
 const duo=createDecisionSession({seed:198,heroes:["warrior","wizard"]});
 assert.equal(pragmaticSoloAction(duo,sessionActions(duo)),null);
 assert.throws(()=>selectSessionPolicyAction(duo,createSessionPolicy(),{
  equipmentMode:"solo-pragmatic",budget:1
 }),/exactly one Hero/);
});
test("Canonical complete expedition records policy shortcuts and ends normally",{
 timeout:180000
},()=>{
 const r=playFullSoloExpedition({
  hero:"warrior",seed:20261016,arm:"implicit",
  heuristicMode:"solo-threat",budget:1,
  equipmentMode:"solo-pragmatic",recordTelemetry:true
 });
 assert.ok(r.steps>0);
 assert.ok(["death","escape","win"].includes(r.ending));
 assert.ok(r.policyShortcutCount>=0);
 assert.equal(Object.values(r.policyShortcutReasons).reduce((a,b)=>a+b,0),
  r.policyShortcutCount);
 assert.equal(r.events.filter(e=>e.via==="policy-shortcut").length,
  r.policyShortcutCount,
  "Only actual opportunities trigger shortcuts; no manufactured actions");
 assert.ok(r.events.every(e=>!e.policyRule||
  ["policy-shortcut"].includes(e.via)));
 assert.ok(r.events.every(e=>!e.policyRule||
  !e.search),"Do not count bypassed MCTS as an actual search");
});

test("Actual committed healing shortcut is audited with its reason and zero MCTS diagnostics",()=>{
 const s=hero(2032);s.state.heroes[0].hp=2;
 give(s,"ex-rations");
 const recorder=createDecisionRecorder();
 const legal=sessionActions(s);
 let rule=null;
 const action=selectSessionPolicyAction(s,createSessionPolicy(),{
  equipmentMode:"solo-pragmatic",legalActions:legal,
  onPolicyDecision:event=>{rule=event.rule;},
  onSearchResult:()=>assert.fail("No search should happen")
 });
 assert.equal(rule,"safe-heal:ex-rations");
 recorder.handler({moment:"before",step:1,phase:s.phase,
  actions:legal,chosen:action,session:s,policyRule:rule,
  searchMs:0,diagnostic:null});
 submitDecision(s,action,{observeResult:false,recordHistory:false});
 recorder.handler({moment:"after",step:1,phase:"between-rooms",
  actions:legal,chosen:action,session:s,dice:[],transitionMs:0});
 const events=recorder.finish();
 assert.equal(events.length,1);
 assert.equal(events[0].via,"policy-shortcut");
 assert.equal(events[0].policyRule,"safe-heal:ex-rations");
 assert.equal(events[0].search,undefined);
 assert.equal(events[0].after.heroes[0].hp,4);
});
