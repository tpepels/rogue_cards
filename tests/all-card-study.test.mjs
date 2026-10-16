import test from "node:test";
import assert from "node:assert/strict";
import {HEROES,ROOMS,OBJECTS,MONSTERS,VAULT,WARDEN,WARDEN_FURY,
 CATALOGUE} from "../src/tabletop-data.js";
import {createDecisionSession} from "../src/engine/decision-session.js";
import {
 ALL_CARD_ROSTER,cardKey,getCard,cardTrialSeed,partiesForCard,
 arrangePhysicalCard,cardSummary,exactPairedP,
 sharedControlKey,sharedControlForCard,evaluateSharedControl,
 evaluateCardTrial,runCanonicalCardExpedition
} from "../src/all-card-study.js";

const printed=[...HEROES,...ROOMS,...OBJECTS,...MONSTERS,
 VAULT,WARDEN,WARDEN_FURY];
const inventory=pile=>pile.map(c=>c.id).sort();
test("every printed canonical physical card has one uniquely identified study row",()=>{
 assert.equal(ALL_CARD_ROSTER.length,printed.length);
 assert.equal(ALL_CARD_ROSTER.length,CATALOGUE.length);
 assert.equal(new Set(ALL_CARD_ROSTER.map(cardKey)).size,printed.length);
 for(const card of printed){
  const row=ALL_CARD_ROSTER.filter(r=>r.id===card.id);
  assert.equal(row.length,1,"One canonical row for "+card.id);
 }
 assert.equal(ALL_CARD_ROSTER.filter(c=>c.kind==="fixed").length,3);
 assert.ok(ALL_CARD_ROSTER.every(card=>getCard(card.kind,card.id)===card));
});

test("room, item and monster interventions only reorder existing physical cards",()=>{
 for(const kind of ["room","item","monster"]){
  const s=createDecisionSession({seed:20261016,heroes:["warrior","wizard"]});
  const before={
   deck:inventory(s.state.deck),
   room:Object.fromEntries(Object.entries(s.state.rooms).map(([stage,pile])=>
    [stage,inventory(pile)])),
   monster:Object.fromEntries(Object.entries(s.state.monsters).map(([stage,pile])=>
    [stage,inventory(pile)])),
   inventory:s.state.heroes.map(hero=>inventory(hero.inventory))
  };
  const candidates=ALL_CARD_ROSTER.filter(c=>c.kind===kind);
  const card=candidates.find(c=>{
   const pile=kind==="room"?s.state.rooms[c.stage]:
    kind==="item"?s.state.deck:s.state.monsters[c.stage];
   return pile.length>1&&pile.some(x=>x.id===c.id)&&
    pile[kind==="room"?0:pile.length-1].id!==c.id;
  });
  assert.ok(card,kind+" fixture has an available physical reorder");
  const status=arrangePhysicalCard(s.state,card);
  assert.equal(status.eligible,true);
  const now={
   deck:inventory(s.state.deck),
   room:Object.fromEntries(Object.entries(s.state.rooms).map(([stage,pile])=>
    [stage,inventory(pile)])),
   monster:Object.fromEntries(Object.entries(s.state.monsters).map(([stage,pile])=>
    [stage,inventory(pile)])),
   inventory:s.state.heroes.map(hero=>inventory(hero.inventory))
  };
  assert.deepEqual(now,before,"No new or removed physical "+kind);
  assert.equal(s.phase,"between-rooms");
  const pile=kind==="room"?s.state.rooms[card.stage]:
   kind==="item"?s.state.deck:s.state.monsters[card.stage];
  assert.equal(pile[kind==="room"?0:pile.length-1].id,card.id);
  const again=arrangePhysicalCard(s.state,card);
  assert.equal(again.eligible,false,"No fabricated duplicate when already first");
 }
});

test("repeated physical Item copies at the next draw are never re-swapped",()=>{
 const session=createDecisionSession({seed:20261016,heroes:["warrior","wizard"]});
 const pile=session.state.deck;
 const counts=new Map();
 for(const card of pile)counts.set(card.id,(counts.get(card.id)||0)+1);
 const id=[...counts].find(([,copies])=>copies>=2)?.[0];
 assert.ok(id,"Physical Item pile must contain some repeated printed Item");
 const target=ALL_CARD_ROSTER.find(c=>c.kind==="item"&&c.id===id);
 assert.ok(target);
 // Put a physical copy at the next draw while another copy with the
 // same printed identity is earlier in the actual hidden pile.
 const copyAt=pile.findLastIndex(c=>c.id===id);
 const end=pile.length-1;
 if(copyAt!==end)[pile[copyAt],pile[end]]=[pile[end],pile[copyAt]];
 assert.equal(pile[end].id,id);
 assert.ok(pile.findIndex(c=>c.id===id)<end,
  "Fixture requires another physical copy preceding the draw copy");
 const originals=[...pile];
 const result=arrangePhysicalCard(session.state,target);
 assert.deepEqual(result,{eligible:false,why:"already-at-draw-position"});
 assert.ok(pile.every((card,i)=>card===originals[i]),
  "No card moved, including copy identity and draw ordering");
});

test("Hero replacement preserves party size and never repeats a Hero",()=>{
 for(const hero of ALL_CARD_ROSTER.filter(c=>c.kind==="hero")){
  for(let i=0;i<35;i++){
   const g=partiesForCard(hero,i);
   assert.equal(g.reference.length,g.treatment.length);
   assert.equal(g.treatment[0],hero.id);
   assert.notEqual(g.reference[0],hero.id);
   assert.equal(new Set(g.reference).size,g.reference.length);
   assert.equal(new Set(g.treatment).size,g.treatment.length);
   assert.deepEqual(g.reference.slice(1),g.treatment.slice(1));
  }
  assert.equal(cardTrialSeed(20261016,hero,1),
   cardTrialSeed(20261016,hero,1));
 }
});

test("report includes untested and fixed cards without invented causal p-values",()=>{
 const room=ALL_CARD_ROSTER.find(x=>x.kind==="room");
 const fixed=ALL_CARD_ROSTER.find(x=>x.kind==="fixed");
 const rows=[
  {card:cardKey(room),index:0,kind:"paired",
   control:{won:0,exposure:0},
   treatment:{won:1,exposure:1}},
  {card:cardKey(room),index:1,kind:"ineligible",
   why:"already-at-draw-position"},
  {card:cardKey(fixed),index:0,kind:"observed",
   result:{won:0,exposure:0}}
 ];
 const summary=cardSummary(rows,60);
 assert.equal(summary.length,ALL_CARD_ROSTER.length);
 const counted=summary.find(x=>x.key===cardKey(room));
 assert.equal(counted.compared,1);
 assert.equal(counted.difference,1);
 assert.equal(counted.notEligible,1);
 assert.equal(counted.status,"insufficient");
 const untested=summary.find(x=>x.kind==="item");
 assert.equal(untested.status,"insufficient");
 assert.equal(untested.difference,null);
 const boss=summary.find(x=>x.key===cardKey(fixed));
 assert.equal(boss.status,"observational-only");
 assert.equal(boss.pRaw,null);
 assert.equal(boss.pHolm,null);
 assert.equal(exactPairedP(10,0),2/1024);
});

test("common reference seeds are reusable across cards but distinct between trial indices",()=>{
 const a=ALL_CARD_ROSTER.find(c=>c.kind==="room");
 const b=ALL_CARD_ROSTER.find(c=>c.kind==="item");
 const config={seed:20261016};
 for(let i=0;i<70;i++){
  assert.equal(cardTrialSeed(config.seed,a,i),cardTrialSeed(config.seed,b,i));
  assert.equal(sharedControlKey(a,i,config),sharedControlKey(b,i,config));
 }
 assert.notEqual(cardTrialSeed(config.seed,a,0),cardTrialSeed(config.seed,a,1));
 const hero=ALL_CARD_ROSTER.find(c=>c.kind==="hero");
 assert.notEqual(sharedControlKey(hero,0,config),
  sharedControlKey(a,0,config),"Hero comparison needs its actual control party");
});

test("shared baseline exposes card-specific evidence and refuses mismatches",()=>{
 const a=ALL_CARD_ROSTER.find(c=>c.kind==="room");
 const b=ALL_CARD_ROSTER.find(c=>c.kind==="item");
 const monster=ALL_CARD_ROSTER.find(c=>c.kind==="monster");
 const hero=ALL_CARD_ROSTER.find(c=>c.kind==="hero");
 const config={seed:20261016};
 const source={key:sharedControlKey(a,1,config),
  seed:cardTrialSeed(config.seed,a,1),
  reference:partiesForCard(a,1).reference,
  result:{
   won:1,escaped:0,decisions:110,searches:30,
   coverage:{rooms:[a.id],itemDraws:{[b.id]:2},
    monsterVisits:{[monster.id]:3}}
  }};
 assert.equal(sharedControlForCard(source,a,1,config).exposure,1);
 assert.equal(sharedControlForCard(source,b,1,config).exposure,2);
 assert.equal(sharedControlForCard(source,monster,1,config).exposure,3);
 const fixed=ALL_CARD_ROSTER.find(c=>c.kind==="fixed"&&c.id==="vault");
 const vaultSource={...source,result:{...source.result,
  coverage:{...source.result.coverage,vaultEntered:true}}};
 assert.equal(sharedControlForCard(vaultSource,fixed,1,config).exposure,1);
 assert.equal(sharedControlForCard(source,b,1,config).won,1);
 assert.equal(sharedControlForCard(source,b,1,config).decisions,110);
 assert.throws(()=>sharedControlForCard(source,hero,1,config),/baseline mismatch/);
 assert.throws(()=>sharedControlForCard(source,b,2,config),/baseline mismatch/);
 assert.throws(()=>sharedControlForCard({...source,reference:["fake"]},
  a,1,config),/baseline mismatch/);
});

test("issued legal-action tickets preserve complete canonical expedition results",()=>{
 const settings={budget:2,maxSearchSteps:4000,maxGameSteps:7000};
 const make=()=>createDecisionSession({
  seed:20261016,heroes:["warrior","wizard"]
 });
 const original=runCanonicalCardExpedition(make(),null,
  {...settings,issuedActions:false},20261016);
 const optimized=runCanonicalCardExpedition(make(),null,
  {...settings,issuedActions:true},20261016);
 assert.deepEqual(optimized,original);
});

test("cached canonical baseline equals independently replayed control for printed cards",()=>{
 const settings={seed:20261016,budget:2,
  maxSearchSteps:4000,maxGameSteps:7000};
 // Item + Room + fixed encounter, without synthetic gameplay actions.
 for(const kind of ["room","item","fixed"]){
  const card=ALL_CARD_ROSTER.find(x=>x.kind===kind);
  const baseline=evaluateSharedControl(card,0,settings);
  const actual=evaluateCardTrial(card,0,settings,baseline);
  const unshared=evaluateCardTrial(card,0,settings);
  assert.deepEqual(actual,unshared,
   "Reference cache changed full-game outcome for "+kind);
 }
});
