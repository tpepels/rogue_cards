#!/usr/bin/env node
/**
 * Compare original full fork/replay with safely journaled deterministic
 * settlement actions in exact canonical MCTS, with identical search results.
 *
 * npm run bench:mcts-settlements -- --budget 8 --samples 11
 * npm run bench:mcts-settlements -- --mode expedition --budget 8 --runs 2
 */
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {createDecisionSession,sessionActions,observeSession,submitDecision}
 from "../src/engine/decision-session.js";
import {createSessionPolicy,selectSessionPolicyAction}
 from "../src/session-policy.js";
import {searchDecision} from "../src/session-mcts.js";
import {ROOMS,MONSTERS,WARDEN,VAULT} from "../src/tabletop-data.js";

const args=process.argv.slice(2);
function arg(name,def){
 const i=args.indexOf(name);
 return i===-1?String(def):args[i+1];
}
function number(name,def,max){
 const raw=arg(name,def),n=Number(raw);
 if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(n)||n>max)
  throw Error("Invalid "+name);
 return n;
}
const mode=arg("--mode","search");
const optimization=arg("--optimization","settlements");
if(!["search","expedition"].includes(mode))throw Error("Unknown --mode");
if(!["settlements","metrics","combined"].includes(optimization))
 throw Error("Unknown --optimization");
const budget=number("--budget",8,256),
 samples=number("--samples",11,50),runs=number("--runs",2,12),
 seed=number("--seed",20261016,0xffffffff);
const names=new Set(["--budget","--samples","--runs","--seed","--mode",
 "--optimization"]);
const fastOptions=optimization==="combined"?
 {directSettlements:true,fastMetricClones:true}:
 optimization==="settlements"?{directSettlements:true}:
 {fastMetricClones:true};
for(let i=0;i<args.length;i+=2){
 if(!names.has(args[i])||args[i+1]===undefined)throw Error("Unknown option "+args[i]);
}
const mix=value=>{
 let n=(value+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};
function source(kind,seed){
 const session=createDecisionSession({seed,heroes:["warrior","witch"]});
 const s=session.state;
 if(kind==="corpse"){
  const pile=s.rooms.UPPER;
  const position=pile.findIndex(r=>r.id==="u-nest");
  assert.ok(position>=0,"Missing physical printed Room");
  s.beginRoom(pile.splice(position,1)[0]);
  s.monster=MONSTERS.find(m=>m.id==="rat");s.monsterHP=0;
  session.phase="corpse";
 }else if(kind==="vault"){
  s.beginRoom(VAULT);session.phase="vault";
 }else if(kind==="post-warden"){
  s.beginRoom(VAULT);s.monster=WARDEN;s.monsterHP=10;
  session.phase="post-warden";
 }else throw Error("Unknown scenario "+kind);
 return session;
}
function search(fast,kind,gameSeed){
 const session=source(kind,gameSeed);
 const before=JSON.stringify(observeSession(session)),rng=session.state.rng.snapshot();
 const t=performance.now();
 const result=searchDecision(session,{
  budget,seed,knowledge:"oracle",treeMode:"full",
  ...(fast?fastOptions:{}),collectCoverage:false,maxSteps:4000
 });
 const timeMs=performance.now()-t;
 assert.equal(result.completed,budget);
 assert.equal(result.incomplete,0);
 assert.equal(JSON.stringify(observeSession(session)),before);
 assert.equal(session.state.rng.snapshot(),rng);
 return {timeMs,result};
}
function expedition(fast,gameSeed,heroes){
 const session=createDecisionSession({seed:gameSeed,heroes});
 const policy=createSessionPolicy(),actions=[];
 let eligible=0;
 const t=performance.now();
 for(let i=0;i<7000&&session.phase!=="terminal";i++){
  const legal=sessionActions(session);
  if(!legal.length)throw Error("No legal actions at "+session.phase);
  const chosen=selectSessionPolicyAction(session,policy,{
   budget,knowledge:"fair",
   seed:mix(gameSeed^Math.imul(i+1,0xc2b2ae35)),
   maxSearchSteps:4000,legalActions:legal,
   mctsOptimizations:fast?fastOptions:{}
  });
  if(["corpse","vault","post-warden"].includes(session.phase)&&
   ["leave","fight"].includes(chosen.kind))eligible++;
  actions.push(chosen);
  submitDecision(session,chosen,{observeResult:false,recordHistory:false,
   ...(fast?fastOptions:{})});
 }
 assert.equal(session.phase,"terminal","Canonical expedition unresolved");
 assert.ok(!session.state.metrics.roundLimit&&!session.state.metrics.unresolved);
 const timeMs=performance.now()-t;
 return {timeMs,eligible,result:{
  actions,terminal:observeSession(session),
  dice:session.state.rng.snapshot(),
  won:!!session.state.metrics.won,ending:session.state.endingKind
 }};
}
const timings={baseline:[],fast:[]};
const pairs=[],count=mode==="search"?samples:runs;
for(let i=0;i<count;i++){
 const gameSeed=mode==="search"?[3573,7292,1842][i%3]:
  mix(seed^Math.imul(i+1,0x85ebca6b))||1;
 const kind=["corpse","vault","post-warden"][i%3];
 const heroes=i%2===0?["warrior"]:["warrior","witch"];
 const order=i%2===0?[false,true]:[true,false];
 const measured=order.map(enabled=>({
  enabled,...(mode==="search"?
   search(enabled,kind,gameSeed):
   expedition(enabled,gameSeed,heroes))
 }));
 assert.deepEqual(measured[0].result,measured[1].result,
  "Canonical action, future dice, tree statistics or ending changed "+
   "(source "+gameSeed+")");
 for(const sample of measured)
  timings[sample.enabled?"fast":"baseline"].push(sample.timeMs);
 pairs.push({seed:gameSeed,kind:mode==="search"?kind:null,
  baselineMs:measured.find(x=>!x.enabled).timeMs,
  fastMs:measured.find(x=>x.enabled).timeMs,
  eligibleSettlements:measured.find(x=>x.enabled).eligible??null});
 if(mode==="expedition")
  console.error("Verified canonical expedition "+(i+1)+"/"+runs);
}
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const old=median(timings.baseline),current=median(timings.fast);
console.log(JSON.stringify({
 schema:"canonical-direct-settlements-benchmark-v1",
 mode,optimization,budget,seed,samples:count,canonicalParity:true,
 baselineMedianMs:Number(old.toFixed(2)),
 optimizedMedianMs:Number(current.toFixed(2)),
 speedup:Number((old/current).toFixed(2)),
 totalEligibleSettlementDecisions:
  mode==="expedition"?pairs.reduce((n,p)=>n+p.eligibleSettlements,0):null,
 perSeed:pairs,
 note:"The fast path remains disabled by default; performance changes are "+
  "not proof of policy strength or individual card balance."
},null,2));
