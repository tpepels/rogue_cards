import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecisionSession,sessionActions,submitDecision} from '../src/engine/decision-session.js';
import {createCandidate} from '../src/balance/candidate.js';
import {compileCandidate} from '../src/balance/compiler.js';
import {createTrialTelemetry} from '../src/balance/metrics.js';
import {ExpeditionState} from '../src/engine/expedition-state.js';
import {playBalanceTrial} from '../src/balance/trial.js';

test('healing availability counts only actually legal choices, separately from selected and resolved HP',()=>{
 const pools=compileCandidate(createCandidate()),session=createDecisionSession({seed:1,heroes:['warrior'],gameMode:'everything-goes',cardPools:pools});
 const s=session.state,h=s.heroes[0];s.room=pools.rooms.find(c=>c.id==='ex-u-coal-store');session.phase='room';h.hp-=3;
 const telemetry=createTrialTelemetry(s),legal=sessionActions(session),chosen=legal.find(a=>a.kind==='room-choice'&&a.index===1);
 assert.ok(chosen);telemetry.select({phase:session.phase,legal,chosen,state:s});
 let effects=[];submitDecision(session,chosen,{observeResult:false,onCommittedEvents:e=>{effects=e;}});telemetry.settle(effects,session.state,!session.pendingNested);
 while(session.pendingNested){const legal=sessionActions(session),chosen=legal[0];telemetry.select({phase:'reaction',legal,chosen,state:session.state});effects=[];submitDecision(session,chosen,{observeResult:false,onCommittedEvents:e=>{effects=e;}});telemetry.settle(effects,session.state,!session.pendingNested);}
 const m=telemetry.finish(session),cell=m.healingOpportunities.bySource['room:ex-u-coal-store'];
 assert.equal(cell.available,1);assert.equal(cell.selected,1);assert.equal(cell.resolved,1);
 assert.equal(cell.offered,5);assert.equal(cell.restored,3);assert.equal(cell.wasted,2);
 assert.equal(cell.healingEvents,1);
});

test('an unaffordable REST cannot inflate available healing; unchosen legal healing remains unoffered',()=>{
 const pools=compileCandidate(createCandidate());
 for(const affordable of [false,true]){
  const session=createDecisionSession({seed:2,heroes:['warrior'],gameMode:'everything-goes',cardPools:pools}),s=session.state;
  s.room=pools.rooms.find(c=>c.id==='ex-u-coal-store');session.phase='room';
  s.die=()=>3;
  if(!affordable){s.heroes[0].inventory=[];s.heroes[0].slots={};}
  const t=createTrialTelemetry(s),legal=sessionActions(session),chosen=legal.find(a=>a.kind==='room-choice'&&a.index===0);
  t.select({phase:'room',legal,chosen,state:s});
  let effects=[];submitDecision(session,chosen,{observeResult:false,onCommittedEvents:e=>{effects=e;}});t.settle(effects,session.state,!session.pendingNested);
  while(session.pendingNested){const legal=sessionActions(session),chosen=legal[0];t.select({phase:'reaction',legal,chosen,state:session.state});effects=[];submitDecision(session,chosen,{observeResult:false,onCommittedEvents:e=>{effects=e;}});t.settle(effects,session.state,!session.pendingNested);}
  const cell=t.finish(session).healingOpportunities.bySource['room:ex-u-coal-store'];
  assert.equal(cell?.available??0,Number(affordable));
  assert.equal(cell?.selected??0,0);assert.equal(cell?.offered??0,0);
 }
});

test('missing source annotations invalidate a canonical trial instead of becoming optimization evidence',()=>{
 const original=ExpeditionState.prototype.hurt;
 // Simulate a future emitter losing its annotation. HP, dice, legal
 // decisions and the canonical mutation itself remain unchanged.
 ExpeditionState.prototype.hurt=function(h,amount){
  const previous=this._telemetrySource;delete this._telemetrySource;
  try{return original.call(this,h,amount);}finally{if(previous!==undefined)this._telemetrySource=previous;}
 };
 try{assert.throws(()=>playBalanceTrial({candidate:createCandidate(),heroes:['warrior'],seed:42,profile:'random-v1'}),/Incomplete canonical HP source/);}
 finally{ExpeditionState.prototype.hurt=original;}
});
