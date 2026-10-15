#!/usr/bin/env node
/**
 * Local-only canonical execution audit, NOT a balance simulation.
 *
 * Checks every printed Room/Item d6 face through the production dispatcher,
 * all 14 Monster/Warden behavior bands through monsterRespond, and forks
 * legal decisions found by deterministic exploratory game walks.
 *
 * Every failure writes a reproduction recipe. Missing coverage is never
 * silently called a pass.
 */
import {mkdirSync,writeFileSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {ROOMS,OBJECTS,MONSTERS,WARDEN,WARDEN_FURY,VAULT,HEROES}
 from "../src/tabletop-data.js";
import {ExpeditionState} from "../src/engine/expedition-state.js";
import {monsterRespond} from "../src/engine/combat.js";
import {d6Band} from "../src/engine/dice-bands.js";
import {legalActions,applyAction} from "../src/engine/index.js";
import {forkGameState} from "../src/engine/fork-state.js";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";
import {randomSource} from "../src/engine/random.js";
const args={};
for(let i=2;i<process.argv.length;i++){
 const k=process.argv[i],v=process.argv[i+1];
 if(!["--runs","--seed","--max-steps","--out"].includes(k)||
  args[k]!==undefined||!v||v.startsWith("--"))throw Error("Bad argument "+k);
 args[k]=v;i++;
}
const num=(k,def,max)=>{const v=args[k]??String(def),n=Number(v);
 if(!/^(0|[1-9]\d*)$/.test(v)||!Number.isSafeInteger(n)||
   n<1||n>max)throw Error("Invalid "+k);return n;};
const runs=num("--runs",36,100000),seed=num("--seed",20261014,0xffffffff),
 maxSteps=num("--max-steps",3000,100000);
const out=resolve(args["--out"]||"results/canonical-audit-"+seed);
if(existsSync(out))throw Error("Audit output already exists: "+out);
mkdirSync(out,{recursive:true});
const stages=["UPPER","MIDDLE","DEEP"];
const parties=[...HEROES.map(h=>[h.id]),
 ...HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(g=>[h.id,g.id]))];
const failures=[],missing=[],observed=new Set(),checked=new Set();
const counts={heroModes:0,roomChoices:0,roomFaces:0,itemFaces:0,monsterBands:0,
 legalActionsForked:0,gameSteps:0,terminalExpeditions:0};
const logFailure=(kind,recipe,error)=>failures.push({
 kind,recipe,message:String(error?.message||error),
 stack:String(error?.stack||error)
});
const validateState=(session)=>{
 const s=session.state;
 for(const [i,h] of s.heroes.entries()){
  if(!Number.isFinite(h.hp)||h.hp<0||h.hp>h.card.hp)
   throw Error("Invalid Hero HP at "+i+": "+h.hp);
  for(const equipped of Object.values(h.slots))
   if(equipped&&!h.inventory.includes(equipped))
    throw Error("Equipped card missing from owning inventory");
 }
 for(const stage of stages)
  if(!Number.isInteger(s.stageProgress[stage])||
   s.stageProgress[stage]<0)throw Error("Invalid stage progress");
 if(!Number.isFinite(s.monsterHP))throw Error("Invalid Monster HP");
 const acts=sessionActions(session);
 if(session.phase!=="terminal"&&!acts.length)
  throw Error("Nonterminal game has no legal actions");
 if(session.phase==="terminal"&&s.alive()&&!s.metrics.won&&
    !s.metrics.escaped&&!s.metrics.roundLimit)
  throw Error("Terminal expedition has no printed ending");
};
// Enumerate every Hero's opt-out, steady and risky power decision.
for(const hero of HEROES){
 const trialSeed=(seed+400000+HEROES.indexOf(hero))>>>0;
 try{
  const state=new ExpeditionState({seed:trialSeed,heroes:[hero.id]});
  state.beginRoom(ROOMS.find(r=>r.id==="u-gate"));
  const choices=legalActions(state,{phase:"hero-trigger",heroIndex:0,
   context:hero.id==="witch"?"after-scroll-or-potion":"test-trigger"});
  const modes=choices.filter(a=>a.kind==="hero-mode").map(a=>a.mode);
  if(modes.length!==2||!modes.includes("steady")||!modes.includes("risk")||
    !choices.some(a=>a.kind==="skip"))
   throw Error("Missing canonical Hero ability actions");
  counts.heroModes+=modes.length;
 }catch(e){logFailure("hero-actions",{heroId:hero.id,trialSeed},e)}
}

// Test both printed Room branches with the public legalActions/applyAction
// boundary. For actions requiring contextual prerequisites, report a gap
// rather than silently creating illegal inventory or claiming execution.
for(const card of ROOMS)for(const index of [0,1]){
 const key="room-choice:"+card.id+":"+index;
 let succeeded=false,illegalReason=null;
 for(let variant=0;variant<3&&!succeeded;variant++){
  const trialSeed=(seed+300000+ROOMS.indexOf(card)*6+index*3+variant)>>>0;
  try{
   const state=new ExpeditionState({seed:trialSeed,
    heroes:variant===0?["warrior","wizard"]:
     variant===1?["witch","priest"]:["thief","wizard"]});
   // Legal physical acquisition in a preparatory state: do not
   // conjure cards from outside the existing Item deck.
   for(let j=0;j<Math.min(variant*5,state.deck.length);j++){
    const copy=state.deck.pop();
    state.noteDeckRemoval(copy);state.add(state.heroes[j%2],copy);
   }
   // The Crown's OFFER is legal only when a CURSED Item can actually
   // be discarded. Fetch a real, unconsumed non-equipment CURSED copy
   // from the finite deck instead of skipping this contextual branch.
   // Cursed gear is often locked in its slot and cannot pay OFFER.
   if(card.id==="d-crown"&&index===1&&
      !state.discardable(1,"CURSED")){
    const physicalIndex=state.deck.findIndex(item=>
     ["crown-relic","scroll-last"].includes(item.id));
    if(physicalIndex<0)
     throw Error("Crown OFFER fixture lacks a physical CURSED resource");
    const [physical]=state.deck.splice(physicalIndex,1);
    state.noteDeckRemoval(physical);
    state.add(state.heroes[0],physical);
    if(!state.discardable(1,"CURSED"))
     throw Error("Crown OFFER fixture cannot discard acquired CURSED Item");
   }
   state.beginRoom(card);
   const choice=legalActions(state,{phase:"room"}).find(
    a=>a.kind==="room-choice"&&a.index===index);
   if(!choice){illegalReason="printed choice not legal in fixture";continue;}
   applyAction(state,choice);
   if(state.metrics.roomChoices[key.slice("room-choice:".length)]!==1)
    throw Error("Canonical Room choice did not record execution");
   counts.roomChoices++;checked.add(key);succeeded=true;
  }catch(e){
   // A legal choice that throws when executed is a genuine blocker.
   logFailure("room-choice",{cardId:card.id,index,variant,trialSeed},e);
   break;
  }
 }
 if(!succeeded)missing.push({kind:"room-choice",cardId:card.id,index,
  reason:illegalReason||"handler failed"});
}

// Actual production Room roll (not enact(table[band]) approximations).
let serial=0;
for(const card of [...ROOMS,VAULT]){
 if(!card.v2.roll)continue;
 for(let face=1;face<=6;face++){
  const key="room:"+card.id+":"+face;
  const trialSeed=(seed+10000+serial++)>>>0;
  try{
   const s=new ExpeditionState({seed:trialSeed,heroes:["warrior","wizard"]});
   s.beginRoom(card);
   if(s.roomRoll(face)===false)throw Error("Refused printed Room roll");
   counts.roomFaces++;checked.add(key);
  }catch(e){logFailure("room-face",{cardId:card.id,face,trialSeed},e)}
 }
}
// Physical acquisition followed by actual Item activation and selected die.
for(const card of OBJECTS){
 if(!card.v2.roll)continue;
 for(let face=1;face<=6;face++){
  const key="item:"+card.id+":"+face;
  const trialSeed=(seed+100000+serial++)>>>0;
  try{
   const s=new ExpeditionState({seed:trialSeed,heroes:["warrior","wizard"]});
   s.beginRoom(ROOMS.find(c=>c.id==="u-gate"));
   const h=s.heroes[0],m=MONSTERS.find(c=>c.id==="rat");
   const owner=s.heroes.find(x=>x.inventory.some(c=>c.id===card.id));
   if(!owner){
    const index=s.deck.findIndex(c=>c.id===card.id);
    if(index<0)throw Error("Physical Item copy absent from initial deck");
    const [copy]=s.deck.splice(index,1);
    s.noteDeckRemoval(copy);s.add(h,copy);
   }else if(owner!==h){
    const index=owner.inventory.findIndex(c=>c.id===card.id);
    const [copy]=owner.inventory.splice(index,1);s.add(h,copy);
   }
   const owned=h.inventory.find(c=>c.id===card.id);
   if(!owned)throw Error("Cannot acquire physical Item");
   s.monster=m;s.monsterHP=m.hp;
   if(s.activate(h,owned,{face})!==true)
    throw Error("Canonical Item activation declined selected face");
   counts.itemFaces++;checked.add(key);
  }catch(e){logFailure("item-face",{cardId:card.id,face,trialSeed},e)}
 }
}
for(const card of [...MONSTERS,WARDEN,WARDEN_FURY]){
 for(const face of [1,3,5,6]){
  const key="monster:"+card.id+":"+face,trialSeed=(seed+200000+serial++)>>>0;
  try{
   const s=new ExpeditionState({seed:trialSeed,heroes:["warrior","wizard"]});
   s.beginRoom(card.stage==="FINAL"?VAULT:
    ROOMS.find(r=>r.stage===card.stage));
   s.monster=card;s.monsterHP=card.hp;s.forcedBehavior=face;
   // Test the RAW printed outcome here. Restless Shade explicitly
   // converts behaviour 5 to 1-2 when MAGIC gear is equipped. Wizard
   // starts with an Ashwood Staff, so remove that optional modifier
   // from this fixture before requiring raw-band coverage.
   if(card.id==="wraith"&&face===5){
    for(const hero of s.heroes)
     for(const [slot,equipped] of Object.entries(hero.slots))
      if(equipped?.v2.tags.includes("MAGIC"))delete hero.slots[slot];
    if(s.anyEquippedTag("MAGIC"))
     throw Error("Wraith raw-band fixture still has equipped MAGIC");
   }
   // The physical Ring of the Sideways Eye intentionally changes
   // Floating Eye's printed 6 to band 1-2. Test the RAW 6 with that
   // optional ring unequipped; separate regression covers the modifier.
   if(card.id==="eye"&&face===6){
    for(const hero of s.heroes)
     for(const [slot,equipped] of Object.entries(hero.slots))
      if(equipped?.id==="ring-eye")delete hero.slots[slot];
    if(s.heroes.some(hero=>s.equipped(hero,"ring-eye")))
     throw Error("Eye raw-band fixture still has Ring of the Sideways Eye");
   }
   monsterRespond(s,s.heroes[0]);
   const band=face<=2?0:face<=4?1:face===5?2:3;
   if(!(s.metrics.monsterBehaviorBands[card.id+":"+band]>0))
    throw Error("Printed behavior band was not executed");
   counts.monsterBands++;checked.add(key);
  }catch(e){logFailure("monster-band",{cardId:card.id,face,trialSeed},e)}
 }
}
const cloneSession=s=>({
 ...s,state:forkGameState(s.state),history:s.history.map(x=>({...x})),
 remainingReturns:[...s.remainingReturns],
 pendingNested:s.pendingNested?{
  ...s.pendingNested,root:{...s.pendingNested.root},
  responses:s.pendingNested.responses.map(x=>({...x})),
  actions:s.pendingNested.actions.map(x=>({...x}))
 }:null
});
const actKey=(s,a)=>[s.pendingNested?"reaction:"+s.pendingNested.trigger.phase:s.phase,
 s.state.room?.id,s.state.monster?.id,a.kind,a.mode,a.cardId].join(":");
for(let run=0;run<runs;run++){
 const gameSeed=(seed+Math.imul(run+1,2654435761))>>>0;
 const heroes=parties[run%parties.length],session=createDecisionSession({
  seed:gameSeed,heroes});
 const rng=randomSource(gameSeed^0x8e69c1cf),trace=[];
 try{
  let step=0;
  for(;step<maxSteps&&session.phase!=="terminal";step++){
   validateState(session);
   const actions=sessionActions(session);
   const phase=session.pendingNested?
    "reaction:"+session.pendingNested.trigger.phase:session.phase;
   for(let index=0;index<actions.length;index++){
    const action=actions[index],key=actKey(session,action);
    observed.add(key);
    if(checked.has("action:"+key))continue;
    const fork=cloneSession(session);
    try{
     submitDecision(fork,action);validateState(fork);
     checked.add("action:"+key);counts.legalActionsForked++;
    }catch(e){
     logFailure("legal-transition",{gameSeed,heroes,step,phase,
      action,trace:[...trace],observation:observeSession(session)},e);
     checked.add("action:"+key);
    }
   }
   // This is explicitly a coverage fuzzer, NOT a balance agent.
   // Progress frequently to avoid infinite Item/Equipment shuffling,
   // but occasionally exercise all other legal alternatives.
   const advance=actions.find(a=>a.kind==="continue");
   const attack=actions.find(a=>a.kind==="attack");
   const fight=actions.find(a=>a.kind==="fight");
   const pick=actions.find(a=>a.kind==="room-choice");
   const choice=rng.die(5)<=4?
    (attack||fight||pick||advance||rng.choose(actions)):
    rng.choose(actions);
   trace.push({step,phase,action:choice});
   submitDecision(session,choice);
   counts.gameSteps++;
  }
  if(session.phase!=="terminal")throw Error("maxSteps: expedition stalled");
  if(session.state.metrics.roundLimit||session.state.metrics.unresolved)
   throw Error("round limit or unresolved canonical effects");
  validateState(session);
  counts.terminalExpeditions++;
 }catch(e){
  logFailure("expedition",{gameSeed,heroes,step:trace.length,
   trace:trace.slice(-300),phase:session.pendingNested?
   "reaction:"+session.pendingNested.trigger.phase:session.phase,
   observation:observeSession(session)},e);
 }
}
const commit=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8"}).trim()}catch{return null}};
const expected={heroModes:HEROES.length*2,roomChoices:ROOMS.length*2,
 roomFaces:[...ROOMS,VAULT].filter(c=>c.v2.roll).length*6,
 itemFaces:OBJECTS.filter(c=>c.v2.roll).length*6,
 monsterBands:(MONSTERS.length+2)*4};
const completeFaceCoverage=Object.keys(expected).every(
 key=>counts[key]===expected[key]);
const result={schema:"rogue-cards-canonical-action-audit-v1",
 commit:commit(),seed,runs,maxSteps,parties:parties.length,
 expected,counts,completeFaceCoverage,
 allWalksEnded:runs===counts.terminalExpeditions,
 legalActionSignaturesSeen:observed.size,
 legalActionSignaturesVerified:counts.legalActionsForked,
 pass:failures.length===0&&completeFaceCoverage&&
  runs===counts.terminalExpeditions&&missing.length===0,
 // A finite seed audit cannot mathematically prove all reachable states.
 exhaustiveStateSpaceProof:false,
 failures,missing,limitations:[
  "Print-face dispatcher sweep uses valid manufactured card contexts",
  "Stateful combinations across all cards remain combinatorial",
  "Seeded legal-action fuzzer is for correctness, not balance",
  "An unseen action/combination is never certified",
  "Printed no-roll actions need additional targeted regression tests"
 ]};
writeFileSync(join(out,"summary.json"),JSON.stringify(result,null,2)+"\n");
writeFileSync(join(out,"reproducible-failures.json"),
 JSON.stringify({commit:result.commit,seed,failures},null,2)+"\n");
writeFileSync(join(out,"summary.md"),[
 "# Canonical engine and decision coverage audit","",
 "Source: "+result.commit,
 "Overall: "+(result.pass?"PASS":"FAIL or incomplete"),
 ...Object.keys(expected).map(k=>"- "+k+": "+counts[k]+"/"+expected[k]),
 "- Legal transitions fork-tested: "+counts.legalActionsForked,
 "- Full seeded expeditions: "+counts.terminalExpeditions+"/"+runs,
 "- Failures: "+failures.length,
 "- Untested contextual branches: "+missing.length,"",
 "Each failure has a seed, action/face, and reproduction trace.",
 "No win rates from this fuzzer are valid balance results."
].join("\n")+"\n");
console.log(JSON.stringify({out,pass:result.pass,expected,counts,
 failures:failures.length},null,2));
if(!result.pass)process.exitCode=1;
