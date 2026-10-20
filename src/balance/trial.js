import {performance} from "node:perf_hooks";
import {HEROES} from "../tabletop-data.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction,forcesEquipmentProgress}
 from "../session-policy.js";
import {usefulPartyEquipmentAction} from "../solo-pragmatic.js";
import {randomSource} from "../engine/random.js";
import {createDecisionRecorder,compactExperimentSnapshot}
 from "../experiment-telemetry.js";
import {compileCandidate} from "./compiler.js";
import {getAgentProfile} from "./profiles.js";
import {createTrialTelemetry} from "./metrics.js";

// Same per-decision search seed schedule as the canonical party study.
const mix=x=>{
 x=(x+0x9e3779b9)>>>0;
 x=Math.imul(x^(x>>>16),0x85ebca6b);
 x=Math.imul(x^(x>>>13),0xc2b2ae35);
 return (x^(x>>>16))>>>0||1;
};
const equipmentKinds=new Set(["equip","unequip","transfer"]);
function randomAction(session,policy,legal,rng){
 const safe=["between-rooms","explore"].includes(session.phase)&&!session.pendingNested;
 const upgrade=safe?usefulPartyEquipmentAction(session,legal):null;
 if(upgrade){
  policy.equipmentActions++;policy.equippedUpgradeCount++;policy.consecutiveEquipment++;
  return upgrade;
 }
 if(forcesEquipmentProgress(session,policy,legal)){
  policy.cycleBreaks++;policy.consecutiveEquipment=0;
  return legal.find(a=>a.kind==="continue");
 }
 const choices=safe?legal.filter(a=>!(a.phase==="equipment"&&equipmentKinds.has(a.kind))):legal;
 policy.consecutiveEquipment=0;
 return choices[rng.die(choices.length)-1];
}

/** Run a printable candidate through the canonical playParty loop.
 * recordEvents controls retained compact traces; summary aggregation is
 * always enabled. A capped/unresolved expedition is an error, never a loss.
 */
export function playBalanceTrial({candidate,heroes,seed,profile="reference-v1",
 recordEvents=false,maxGameSteps=20000,shouldStop=null}){
 if(!Array.isArray(heroes)||heroes.length<1||heroes.length>2||
   heroes.some(h=>!HEROES.some(x=>x.id===h))||
   new Set(heroes).size!==heroes.length)throw Error("Invalid party");
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error("Invalid trial seed");
 if(!Number.isSafeInteger(maxGameSteps)||maxGameSteps<1)throw Error("Invalid maxGameSteps");
 if(typeof recordEvents!=="boolean")throw Error("recordEvents must be boolean");
 if(shouldStop!==null&&typeof shouldStop!=="function")throw Error("Invalid shouldStop callback");
 const agent=getAgentProfile(profile),cardPools=compileCandidate(candidate);
 const session=createDecisionSession({seed,heroes,gameMode:"everything-goes",cardPools});
 const policy=createSessionPolicy(),telemetry=createTrialTelemetry(session.state);
 const policyRng=agent.policyKind==="random"?randomSource(mix(seed^0x52414e44)):null;
 const recorder=recordEvents?createDecisionRecorder({snapshotMode:"compact"}):null;
 const initialSnapshot=recorder?compactExperimentSnapshot(session):null;
 const st=performance.now();
 let decisions=0,searches=0,searchMs=0;
 while(session.phase!=="terminal"){
  if(shouldStop?.())throw Error("Trial interrupted before terminal outcome");
  if(++decisions>maxGameSteps)throw Error("NONTERMINAL party "+
   heroes.join("+")+" / seed "+seed);
  const legal=sessionActions(session);
  if(!legal.length)throw Error("Missing legal action at "+session.phase);
  const phase=session.pendingNested?
   "reaction:"+session.pendingNested.trigger.phase:session.phase;
  const forced=legal.length===1||forcesEquipmentProgress(session,policy,legal);
  const begin=performance.now();let diagnostic=null,policyRule=null;
  const {id,hash,schema,policyKind,...parameters}=agent;
  const action=policyRng?randomAction(session,policy,legal,policyRng):selectSessionPolicyAction(session,policy,{
   ...parameters,seed:mix(seed^Math.imul(decisions,0xc2b2ae35)),legalActions:legal,
   ...(recorder?{onSearchResult:d=>{diagnostic=d;},
    onPolicyDecision:d=>{policyRule=d.rule;}}:{})
  });
  const selectionMs=performance.now()-begin;
  if(!forced&&!policyRng){searches++;searchMs+=selectionMs;}
  if(policyRng)policyRule="seeded-random-party-efficient";
  if(!legal.some(x=>JSON.stringify(x)===JSON.stringify(action)))
   throw Error("Non-canonical action at "+session.phase);
  telemetry.select({phase,legal,chosen:action,state:session.state});
  recorder?.handler({moment:"before",step:decisions,phase,session,
   actions:legal,chosen:action,diagnostic,policyRule,searchMs:selectionMs});
  let effects=[],dice=[];
  const transition=performance.now();
  submitDecision(session,action,{observeResult:false,recordHistory:false,
   onCommittedEvents:tape=>{effects=tape;},
   ...(recorder?{onCommittedDice:tape=>{dice=tape;}}:{})});
  telemetry.settle(effects,session.state,!session.pendingNested);
  recorder?.handler({moment:"after",step:decisions,phase,session,
   effects,dice,transitionMs:performance.now()-transition});
 }
 const state=session.state,m=state.metrics;
 if(m.roundLimit||m.unresolved)throw Error("NONTERMINAL/UNRESOLVED expedition");
 const ending=m.won?"win":m.escaped?"escape":!state.alive()?"death":null;
 if(!ending)throw Error("Unknown terminal state: "+heroes.join("+"));
 const hp=state.heroes.reduce((n,h)=>n+Math.max(0,h.hp),0);
 const cap=state.heroes.reduce((n,h)=>n+h.card.hp,0);
 const heal=m.healing?.total??{},metrics=telemetry.finish(session);
 if(metrics.telemetry.unattributedHpEffects)throw Error('Incomplete canonical HP source attribution: '+metrics.telemetry.unattributedHpEffects+' effects');
 const vaultEntryHpFraction=metrics.vaultEntryHpFraction;
 return {party:heroes.join("+"),heroes:[...heroes],seed,budget:agent.budget,
  candidateId:candidate.id,candidateHash:candidate.hash,
  profileId:agent.id,profileHash:agent.hash,
  won:Number(ending==="win"),ending,
  vaultReached:Number(!!m.vaultEntered||vaultEntryHpFraction!==null),
  vaultEntryHpFraction,endingHpFraction:hp/Math.max(1,cap),
  roomsCleared:m.cleared,ordinaryEncounters:metrics.ordinaryEncounters,
  ordinaryFights:metrics.ordinaryFights,damage:m.damage,
  damageByStage:metrics.damageByStage,damageBySource:metrics.damageBySource,
  healingRestored:heal.restored??0,healingWasted:heal.wasted??0,
  healingBySource:metrics.healing.bySource,healingByStage:metrics.healing.byStage,
  healingByCategory:Object.fromEntries(Object.entries(m.healing?.byCategory??{})
   .map(([k,v])=>[k,{restored:v.restored,wasted:v.wasted}])),
  wipeStage:m.wipeStage??null,wipeCause:m.wipeCause??null,
  attemptsSeal:Number(!!m.sealAttempt),sealWin:Number(!!m.sealWin),
  wardenFightStarts:metrics.warden.fightStarts,
  wardenCombatWins:metrics.warden.combatWins,choiceDiversity:metrics.choiceDiversity,
  decisions,searches,searchMs,elapsedMs:performance.now()-st,
  finalHeroes:state.heroes.map(h=>({id:h.card.id,hp:h.hp,maxHp:h.card.hp})),
  postCombatHealTriggers:m.postCombatHealTriggers??0,metrics,
  initialSnapshot,finalSnapshot:recorder?compactExperimentSnapshot(session):null,
  events:recorder?recorder.finish():null};
}
