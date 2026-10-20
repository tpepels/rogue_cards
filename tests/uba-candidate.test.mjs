import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidate} from '../src/balance/candidate.js';
import {compileCandidate,printableDeck,printableDiff} from '../src/balance/compiler.js';
import {BASELINE_MANIFEST} from '../src/balance/baseline.js';
import {canonicalStagingCatalogue,compileStaging} from '../src/staging/catalogue.js';
import {physicalDeck,selectionForPreset,ALL_OBJECTS} from '../src/decks.js';
import {BALANCED_ROOM_IDS} from '../src/room-balance.js';
import {ExpeditionState} from '../src/engine/expedition-state.js';
import {prepareRolloutDecks,sampleRolloutDecks} from '../src/rollout-state.js';
import {chooseRoom,legalRoomChoices,legalActions,applyAction,takeMonsterResponse} from '../src/engine/index.js';
import {settleMonsterVictory} from '../src/engine/combat-outcomes.js';
import {cardMarkup} from '../src/tabletop-view.js';

const counts=cards=>Object.fromEntries([...cards.reduce((m,c)=>m.set(c.type+':'+c.id,(m.get(c.type+':'+c.id)??0)+1),new Map())].sort());
const makeState=c=>new ExpeditionState({seed:91,heroes:['warrior'],gameMode:'everything-goes',cardPools:compileCandidate(c)});
const readable=c=>cardMarkup(c).replace(/<[^>]+>/g,'');

test('no-change candidate inventories exactly the printed Balanced B edition',()=>{
 const c=createCandidate();
 assert.equal(c.schema,'uba-candidate-v1');assert.equal(c.base,'balanced-recovery-v1');
 assert.deepEqual(counts(printableDeck(c)),counts(physicalDeck(selectionForPreset('balanced'))));
 assert.deepEqual(BASELINE_MANIFEST.inventory,counts(printableDeck(c)));
 assert.match(BASELINE_MANIFEST.fingerprint,/^[a-f0-9]{64}$/);
 assert.deepEqual(printableDiff(c).changes,[]);
 assert.deepEqual(canonicalStagingCatalogue().rooms.map(r=>r.id),BALANCED_ROOM_IDS);
 assert.equal(canonicalStagingCatalogue({roomBaseline:'full'}).rooms.length>54,true);
 const p=compileStaging({schema:'rogue-cards-staging-v1',id:'no-change'});
 assert.deepEqual(p.rooms.map(r=>r.id),BALANCED_ROOM_IDS);
 const archived=compileStaging({schema:'rogue-cards-staging-v1',id:'archive-control',roomBaseline:'full'});
 assert.deepEqual(counts(archived.rooms),counts(canonicalStagingCatalogue({roomBaseline:'full'}).rooms));
 const s=makeState(c),ordinary=new ExpeditionState({seed:91,heroes:['warrior'],gameMode:'everything-goes'});
 for(const key of ['rooms','monsters','deck'])assert.deepEqual(s[key],ordinary[key]);
});

test('candidate hashing ignores display id, sorts data keys and freezes detached input',()=>{
 const spec={id:'first-name',staging:{cards:[{collection:'heroes',id:'warrior',set:{hp:30,atk:3}}]}};
 const a=createCandidate(spec),b=createCandidate({staging:{cards:[{set:{atk:3,hp:30},id:'warrior',collection:'heroes'}]},id:'other-name'});
 assert.equal(a.hash,b.hash);assert.match(a.hash,/^[a-f0-9]{64}$/);
 spec.staging.cards[0].set.hp=1;assert.equal(a.staging.cards[0].set.hp,30);
 assert.ok(Object.isFrozen(a.staging.cards[0].set));
 assert.throws(()=>{a.additions.push({})},TypeError);
 assert.equal(createCandidate(JSON.parse(JSON.stringify(a))).hash,a.hash);
 assert.notEqual(a.hash,createCandidate().hash);
});

test('reject unknown, executable, prototype and unsupported rule data before simulation',()=>{
 for(const spec of [
  {surprise:true},{base:'other'},{staging:{postCombatHeal:5}},
  {staging:{mechanics:{postCombatHeal:5}}},{staging:{mechanics:{killReward:'heal'}}},
  {staging:{cooperative:{sealCost:1}}},{staging:{cards:[{collection:'heroes',id:'warrior',set:{ability:'win'}}]}},
  {staging:{cards:[{collection:'monsters',id:'rat',set:{behavior:['none']}}]}},
  {staging:{roomEffects:{'ex-u-coal-store':{choices:[['ROLL_ROOM'],['HEAL:2:EXEC']]}}}},
  {staging:{roomEffects:{'ex-u-coal-store':{choices:[['ROLL_ROOM'],['HEAL:NaN']]}}}},
  {staging:{roomEffects:{'ex-u-coal-store':{outcomes:[['ROLL_ROOM'],['DRAW:1'],['DRAW:2']]}}}},
  {staging:{roomEffects:{'u-lantern-shrine':{choices:[['HEAL:3'],['HEAL:4']]}}}},
  {staging:{itemHealing:{'ex-rations':()=>5}}},
  JSON.parse('{"staging":{"__proto__":{"polluted":true}}}'),
  {additions:[{type:'hero',id:'new-hero',template:'hero-v1'}]},
  {additions:[{type:'monster',id:'new-foe',template:'monster-v1',behaviorOps:['eval']}]}
 ])assert.throws(()=>createCandidate(spec),Error,JSON.stringify(spec));
});

test('joint physical interventions change execution, printing and fair pools without changing source',()=>{
 const original=JSON.stringify(physicalDeck(selectionForPreset('balanced')));
 const upper=BALANCED_ROOM_IDS.filter(id=>canonicalStagingCatalogue().rooms.find(r=>r.id===id)?.stage==='UPPER');
 const c=createCandidate({id:'joint-change',staging:{
  cards:[{collection:'heroes',id:'warrior',set:{hp:32}},{collection:'monsters',id:'goblin',set:{hp:7,copies:4}},
   {collection:'items',id:'ex-rations',set:{copies:5}},{collection:'warden',id:'warden',set:{hp:18}},
   {collection:'wardenFury',id:'warden-fury',set:{hp:6,atk:4}}],
  roomDeck:{UPPER:{selection:[...upper,'ex-u-coal-store']}},
  monsterHealing:{goblin:3},roomRestHealing:{'ex-u-coal-store':8},
  roomRestCosts:{'ex-u-coal-store':2},itemHealing:{'ex-rations':6}
 }});
 const s=makeState(c),p=s.cardPools,h=s.heroes[0];h.hp=1;
 const goblin=p.monsters.find(m=>m.id==='goblin');s.monster=goblin;s.monsterHP=0;
 settleMonsterVictory(s,goblin);assert.equal(h.hp,4);s.monster=null;
 s.room=p.rooms.find(r=>r.id==='ex-u-coal-store');
 while(h.inventory.length<2)s.add(h,ALL_OBJECTS.find(i=>i.id==='coin'));
 const before=h.inventory.length;chooseRoom(s,1,{observeResult:false});
 assert.equal(h.hp,12);assert.equal(h.inventory.length,before-2);
 assert.match(readable(s.room),/Discard 2 Items/);assert.match(readable(s.room),/heal 8 HP/i);
 assert.match(readable(p.warden),/At 6 HP/);
 assert.equal(printableDeck(c).filter(x=>x.id==='goblin').length,4);
 assert.equal(printableDeck(c).filter(x=>x.id==='ex-rations').length,5);
 const fresh=makeState(c),blueprint=prepareRolloutDecks(fresh,'fair');
 assert.equal(blueprint.monsters.UPPER.pool.filter(m=>m.id==='goblin'&&m.hp===7).length,4);
 assert.equal(printableDiff(c).changes.some(x=>x.id==='goblin'&&x.after.copies===4),true);
 assert.equal(JSON.stringify(physicalDeck(selectionForPreset('balanced'))),original);
});

test('zero-copy removal is legal except starters and empty Monster stages',()=>{
 const c=createCandidate({staging:{cards:[{collection:'monsters',id:'rat',set:{copies:0}},
  {collection:'items',id:'ex-rations',set:{copies:0}}]}});
 const s=makeState(c);
 assert.equal(printableDeck(c).some(c=>['rat','ex-rations'].includes(c.id)),false);
 assert.equal(s.monsters.UPPER.some(c=>c.id==='rat'),false);
 assert.equal(s.deck.some(c=>c.id==='ex-rations'),false);
 assert.equal(prepareRolloutDecks(s,'fair').monsters.UPPER.pool.some(c=>c.id==='rat'),false);
 assert.throws(()=>createCandidate({staging:{cards:[{collection:'items',id:'sword',set:{copies:0}}]}}),/starter/i);
 assert.throws(()=>createCandidate({staging:{cards:canonicalStagingCatalogue().monsters.filter(m=>m.stage==='UPPER')
  .map(m=>({collection:'monsters',id:m.id,set:{copies:0}}))}}),/UPPER|stage/);
});

test('declarative new Room, Monster and Item execute the same effects they print',()=>{
 const c=createCandidate({additions:[
  {type:'room',template:'room-v1',id:'uba-rest',title:'Quiet Recess',stage:'UPPER',copies:2,
   choices:[{label:'SEARCH',ops:['ROLL_ROOM']},{label:'REST',ops:['COST:1','HEAL:7']}],
   outcomes:[['MONSTER_DRAW'],['DRAW:1'],['HEAL:3']]},
  {type:'monster',template:'monster-v1',id:'uba-moth',title:'Pale Moth',stage:'UPPER',copies:2,hp:4,atk:1,def:2,
   behaviorOps:['none','hit','dis','adv'],parley:{mode:'WIT',cost:3},defeatOps:['DRAW:1','HEAL:3'],
   remains:{mode:'SEARCH',ops:['HURT:2','PEEK:1','DRAW:1']}},
  {type:'item',template:'consumable-v1',id:'uba-salve',title:'Herbal Salve',copies:3,ops:['HEAL:6','CURE']}
 ]});
 const s=makeState(c),h=s.heroes[0],p=s.cardPools;
 assert.equal(s.rooms.UPPER.filter(r=>r.id==='uba-rest').length,2);
 s.room=p.rooms.find(r=>r.id==='uba-rest');h.hp=1;
 assert.ok(legalRoomChoices(s).includes(1));chooseRoom(s,1,{observeResult:false});assert.equal(h.hp,8);
 const m=p.monsters.find(m=>m.id==='uba-moth');s.monster=m;s.monsterHP=0;settleMonsterVictory(s,m);
 assert.equal(h.hp,11);assert.match(readable(m),/Heal 3 HP/i);
 s.monster=null;s.room=null;h.hp=1;h.poison=true;
 const item=s.deck.find(x=>x.id==='uba-salve');s.deck.splice(s.deck.indexOf(item),1);s.noteDeckRemoval(item);s.add(h,item);
 const action=legalActions(s,{phase:'between-rooms',heroIndex:0}).find(a=>a.cardId==='uba-salve');
 assert.ok(action);applyAction(s,action,{observeResult:false});assert.equal(h.hp,7);assert.equal(h.poison,false);
 assert.equal(h.inventory.includes(item),false);assert.match(readable(item),/Heal 6 HP/i);
 assert.equal(printableDeck(c).filter(c=>c.id==='uba-rest').length,2);
 assert.equal(printableDiff(c).changes.filter(x=>x.kind==='added').length,3);
});

test('fair Room sampling preserves physical duplicates after visits, discards and reveals',()=>{
 const s=makeState(createCandidate());
 const pile=s.rooms.UPPER;
 const visited=pile.splice(pile.findIndex(r=>r.id==='ex-u-guard-cell'),1)[0];
 s.beginRoom(visited);
 const discarded=pile.shift();s.discardedRoomIds.add(discarded.id);s.discardedRoomCounts[discarded.id]=1;
 s.savedPath=pile.shift();s.peekedRoomIds.UPPER=[pile[0].id];s.publicBottomRoomIds={UPPER:[pile.at(-1).id]};
 for(const seed of [4,17,91]){
  const sample=sampleRolloutDecks(s,{knowledge:'fair',deckSeed:seed});
  assert.deepEqual(counts(sample.rooms.UPPER),counts(pile));
  assert.equal(sample.rooms.UPPER[0].id,pile[0].id);
  assert.equal(sample.rooms.UPPER.at(-1).id,pile.at(-1).id);
 }
});

test('search supports printed bandage quantities 2/3/4 and free or paid REST',()=>{
 for(const heal of [2,3,4]){
  const c=createCandidate({staging:{itemHealing:{'ex-bandages':heal}}});
  const s=makeState(c),h=s.heroes[0];h.hp=1;
  const item=s.deck.find(x=>x.id==='ex-bandages');s.deck.splice(s.deck.indexOf(item),1);s.noteDeckRemoval(item);s.add(h,item);
  const a=legalActions(s,{phase:'between-rooms',heroIndex:0}).find(a=>a.cardId==='ex-bandages');
  applyAction(s,a,{observeResult:false});assert.equal(h.hp,1+heal);assert.match(readable(item),new RegExp('heal '+heal+' HP','i'));
 }
 for(const cost of [0,1,2]){
  const c=createCandidate({staging:{roomRestCost:{'ex-u-coal-store':cost}}});
  const s=makeState(c),h=s.heroes[0];s.room=s.cardPools.rooms.find(r=>r.id==='ex-u-coal-store');
  h.inventory=[];h.slots={};h.hp=1;
  assert.equal(legalRoomChoices(s).includes(1),cost===0);
  for(let i=0;i<cost;i++)s.add(h,ALL_OBJECTS.find(x=>x.id==='coin'));
  assert.ok(legalRoomChoices(s).includes(1));chooseRoom(s,1,{observeResult:false});
  assert.equal(h.hp,6);assert.equal(h.inventory.length,0);
 }
});

test('existing Monster behaviors/rewards and consumable effects change print and execution jointly',()=>{
 const c=createCandidate({staging:{
  cards:[{collection:'monsters',id:'rat',set:{hp:5}}],
  monsterBehaviors:{rat:['poison','none','dis','adv']},
  monsterRewards:{rat:['HEAL:4','NEXT_ADV']},
  itemEffects:{'ex-rations':['HEAL:3','CURE']}
 }});
 const s=makeState(c),h=s.heroes[0],m=s.cardPools.monsters.find(m=>m.id==='rat');
 h.hp=1;s.monster=m;s.monsterHP=5;
 s.rng={...s.rng,die:()=>1};takeMonsterResponse(s,0,{observeResult:false});
 assert.equal(h.poison,true);assert.match(readable(m),/target becomes POISONED/);
 s.monsterHP=0;settleMonsterVictory(s,m);assert.equal(h.hp,5);assert.equal(h.nextAdv,1);
 assert.match(readable(m),/Heal 4 HP/);assert.match(readable(m),/next Hero attack has ADV/);
 s.monster=null;h.hp=1;
 const item=s.deck.find(c=>c.id==='ex-rations');s.deck.splice(s.deck.indexOf(item),1);s.noteDeckRemoval(item);s.add(h,item);
 const options=legalActions(s,{phase:'between-rooms',heroIndex:0}).filter(a=>a.cardId==='ex-rations');
 assert.equal(options.length,1);applyAction(s,options[0],{observeResult:false});
 assert.equal(h.hp,4);assert.equal(h.poison,false);assert.equal(h.inventory.includes(item),false);
 assert.match(readable(item),/Heal 3 HP/);assert.match(readable(item),/Remove POISONED/);
 for(const patch of [
  {monsterBehaviors:{rat:['none','none','none','execute']}},
  {monsterRewards:{rat:['HEAL:3:EXEC']}},
  {itemEffects:{sword:['HEAL:3']}},
  {monsterHealing:{rat:2},monsterRewards:{rat:['HEAL:3']}},
  {itemHealing:{'ex-rations':3},itemEffects:{'ex-rations':['HEAL:4']}}
 ])assert.throws(()=>createCandidate({staging:patch}),Error);
});

test('reject costs in roll outcomes that cannot be checked when choosing the action',()=>{
 assert.throws(()=>createCandidate({staging:{roomEffects:{'ex-u-coal-store':{
  outcomes:[['COST:5','HEAL:7'],['DRAW:1'],['DRAW:2']]
 }}}}),/outcome|cost/i);
 assert.throws(()=>createCandidate({additions:[{type:'room',template:'room-v1',
  id:'uba-unsafe-cost',title:'Unsafe Cost',stage:'UPPER',copies:1,
  choices:[{label:'SEARCH',ops:['ROLL_ROOM']},{label:'LEAVE',ops:['NONE']}],
  outcomes:[['COST:5','HEAL:7'],['DRAW:1'],['DRAW:2']]}]}),/outcome|cost/i);
});

test('behavior opcode arrays cannot masquerade as allowlisted strings',()=>{
 assert.throws(()=>createCandidate({staging:{monsterBehaviors:{rat:[['poison'],'none','none','none']}}}),/behavior/i);
});

test('healing override replaces all printed dice reward wording',()=>{
 const c=createCandidate({additions:[{type:'monster',template:'monster-v1',id:'uba-dice-healer',
  title:'Dice Healer',stage:'UPPER',copies:1,hp:4,atk:1,def:1,
  behaviorOps:['none','hit','dis','adv'],parley:{mode:'WIT',cost:3},
  defeatOps:['DRAW:1','HEAL:d6+2'],remains:{mode:'SEARCH',ops:['HURT:2','PEEK:1','DRAW:1']}}],
  staging:{monsterHealing:{'uba-dice-healer':7}}});
 const m=compileCandidate(c).monsters.find(m=>m.id==='uba-dice-healer');
 assert.deepEqual(m.v2.defeatOps,['DRAW:1','HEAL:7']);
 assert.match(readable(m),/Heal 7 HP/);assert.doesNotMatch(readable(m),/Heal d6\+2 HP/);
});

test('shallow-frozen external candidates cannot bypass hash validation through compiled cache',()=>{
 const c=Object.freeze(JSON.parse(JSON.stringify(createCandidate({staging:{cards:[
  {collection:'heroes',id:'warrior',set:{hp:30}}
 ]}}))));
 assert.equal(compileCandidate(c).heroes.find(h=>h.id==='warrior').hp,30);
 c.staging.cards[0].set.hp=1;
 assert.throws(()=>compileCandidate(c),/hash/i);
});

test('new Rooms require an always-legal choice when the party has no Items',()=>{
 const room={type:'room',template:'room-v1',id:'uba-paid-room',title:'Paid Room',stage:'UPPER',copies:1,
  choices:[{label:'PAY',ops:['COST:1','HEAL:3']},{label:'REST',ops:['COST:1','HEAL:4']}]};
 assert.throws(()=>createCandidate({additions:[room]}),/always.legal|fallback/i);
 assert.throws(()=>createCandidate({additions:[{...room,choices:[
  {label:'TRADE',ops:['DRAW:1','DISCARD:1']},room.choices[1]
 ]}]}),/always.legal|fallback/i);
 const c=createCandidate({additions:[{...room,choices:[room.choices[0],{label:'LEAVE',ops:['NONE']}]}]});
 const s=makeState(c),h=s.heroes[0];h.inventory=[];h.slots={};
 s.room=s.cardPools.rooms.find(c=>c.id===room.id);
 assert.deepEqual(legalRoomChoices(s),[1]);
 chooseRoom(s,1,{observeResult:false});assert.equal(h.inventory.length,0);
});

test('existing Room rewrites retain a resource-free legal fallback',()=>{
 const roomEffects={'ex-u-coal-store':{choices:[['COST:1','HEAL:3'],['COST:1','HEAL:4']]}};
 assert.throws(()=>createCandidate({staging:{roomEffects}}),/always.legal|fallback/i);
 const c=createCandidate({staging:{roomEffects:{'ex-u-coal-store':{
  choices:[['COST:1','HEAL:3'],['NONE']]
 }}}});
 const s=makeState(c),h=s.heroes[0];h.inventory=[];h.slots={};
 s.room=s.cardPools.rooms.find(c=>c.id==='ex-u-coal-store');
 assert.deepEqual(legalRoomChoices(s),[1]);chooseRoom(s,1,{observeResult:false});
});

test('rewritten roll choices require an actual printed die and matching outcome bands',()=>{
 const deep=canonicalStagingCatalogue().rooms.filter(c=>c.stage==='DEEP').map(c=>c.id);
 const roomDeck={DEEP:{selection:[...deep,'d-oracle']}};
 for(const outcomes of [undefined,[],[['HEAL:1'],['HEAL:2'],['HEAL:3']]]){
  const definition={choices:[['ROLL_ROOM'],['NONE']],...(outcomes===undefined?{}:{outcomes})};
  assert.throws(()=>createCandidate({staging:{roomDeck,roomEffects:{'d-oracle':definition}}}),/roll|outcome/i);
 }
 const noRoll=createCandidate({staging:{roomDeck,roomEffects:{'d-oracle':{
  choices:[['HEAL:3'],['NONE']],outcomes:[]
 }}}});
 const nonrolling=makeState(noRoll);nonrolling.room=nonrolling.cardPools.rooms.find(c=>c.id==='d-oracle');
 nonrolling.heroes[0].hp=1;chooseRoom(nonrolling,0,{observeResult:false});
 assert.equal(nonrolling.heroes[0].hp,4);assert.equal(nonrolling.room.v2.roll,null);
 const rolled=createCandidate({staging:{roomEffects:{'ex-u-coal-store':{
  choices:[['ROLL_ROOM'],['NONE']],outcomes:[['HEAL:1'],['HEAL:2'],['HEAL:3']]
 }}}});
 for(const [face,heal] of [[1,1],[3,2],[6,3]]){
  const s=makeState(rolled);s.room=s.cardPools.rooms.find(c=>c.id==='ex-u-coal-store');
  s.heroes[0].hp=1;s.heroes[0].inventory=[];s.heroes[0].slots={};s.rng={...s.rng,die:()=>face};
  assert.deepEqual(legalRoomChoices(s),[0,1]);chooseRoom(s,0,{observeResult:false});
  assert.equal(s.heroes[0].hp,1+heal);assert.equal(s.room.v2.roll.outcomes.length,3);
  assert.match(readable(s.room),new RegExp('Heal '+heal+' HP'));
 }
});
