import test from "node:test";
import assert from "node:assert/strict";
import {HEROES,ROOMS,OBJECTS,MONSTERS,VAULT,WARDEN,WARDEN_FURY,
 CATALOGUE} from "../src/tabletop-data.js";
import {createDecisionSession} from "../src/engine/decision-session.js";
import {
 ALL_CARD_ROSTER,cardKey,getCard,cardTrialSeed,partiesForCard,
 arrangePhysicalCard,cardSummary,exactPairedP
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
