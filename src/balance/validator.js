/** Strict data boundary and printable, deterministic card templates. */
import {compileStaging} from '../staging/catalogue.js';
import {ALL_ROOMS,ALL_MONSTERS,ALL_OBJECTS,FIXED_CARDS} from '../decks.js';
import {ROOM_EFFECTS} from '../room-effect-model.js';
import {BASELINE_ID,deepFreeze} from './baseline.js';

const stages=['UPPER','MIDDLE','DEEP'];
const knownIds=new Set([...ALL_ROOMS,...ALL_MONSTERS,...ALL_OBJECTS,...FIXED_CARDS].map(c=>c.id));
const stageFields=['description','cards','roomDeck','roomEffects','mechanics',
 'monsterHealing','roomRestHealing','roomRestCost','roomRestCosts','itemHealing',
 'monsterBehaviors','monsterRewards','itemEffects'];
const defaults={patrolEvery:0,patrolOpening:'normal',negotiation:'canonical',
 retreat:'none',morale:'none',killReward:'canonical',postCombatHeal:0,wardenTactic:'none'};
const fail=message=>{throw Error(message)};
function object(value,where){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(where+' must be an object');
}
function keys(value,allowed,where){
 object(value,where);
 for(const key of Object.keys(value))if(!allowed.includes(key))
  fail('Unknown or unsupported '+where+' field '+key);
}
function integer(value,min,max,where){
 if(!Number.isSafeInteger(value)||value<min||value>max)fail('Invalid '+where+' (expected '+min+'..'+max+')');
 return value;
}
function text(value,where,max=100){
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))fail('Invalid '+where);
 return value;
}
/** Clone only JSON data; reject getters, inherited objects and unsafe keys. */
export function cloneData(value,where='candidate',ancestors=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value!=='object'||!value)fail('Unsafe non-JSON value at '+where);
 if(ancestors.has(value))fail('Cyclic candidate data at '+where);
 const proto=Object.getPrototypeOf(value);
 if(proto!==Object.prototype&&proto!==null&&!Array.isArray(value))fail('Unsafe object prototype at '+where);
 if(Object.getOwnPropertySymbols(value).length)fail('Unsafe symbol key at '+where);
 ancestors.add(value);
 const out=Array.isArray(value)?[]:{};
 if(Array.isArray(value)&&Object.keys(value).length!==value.length)fail('Sparse or decorated array at '+where);
 for(const key of Object.getOwnPropertyNames(value)){
  if(Array.isArray(value)&&key==='length')continue;
  if(['__proto__','constructor','prototype'].includes(key))fail('Unsafe key '+where+'.'+key);
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('Unsafe accessor or hidden field at '+where+'.'+key);
  out[key]=cloneData(descriptor.value,where+'.'+key,ancestors);
 }
 ancestors.delete(value);return out;
}

const simpleText={NONE:'No effect.',ROLL_ROOM:'Roll d6.',MONSTER_DRAW:'Draw a Monster from this stage.',
 SALVAGE:'Recover the last discarded Item, or draw 1 if none.',
 NEXT_ADV:'Your next Hero attack has ADV.',NEXT_DIS:'Your next Hero attack has DIS.',
 NEXT_WIT_DIS:'Your next WIT test has DIS.',DEF_ADV:'The next Monster attack against you has DIS.',
 POISON:'Become POISONED.',CURE:'Remove POISONED.',CLEANSE:'Cleanse one carried CURSED Item.',
 RECHARGE:'Recharge one exhausted Wand.'};
const healPattern='(?:[1-9]|1[0-9]|20|d6|d6\\+2)';
const grammar={
 HEAL:new RegExp('^HEAL:'+healPattern+'$'),HEAL_ALL:new RegExp('^HEAL_ALL:'+healPattern+'$'),
 HURT:new RegExp('^HURT:'+healPattern+'$'),
 DRAW:/^DRAW:[1-5]$/,DISCARD:/^DISCARD:[1-5]$/,COST:/^COST:[1-5]$/,
 PEEK:/^PEEK:[1-5]$/,NEXT_WIT:/^NEXT_WIT:[1-5]$/
};
const contexts={
 room:new Set([...Object.keys(simpleText),...Object.keys(grammar)]),
 reward:new Set(['NONE','HEAL','DRAW','PEEK','NEXT_WIT','NEXT_ADV','DEF_ADV','SALVAGE','CURE','CLEANSE','RECHARGE']),
 remains:new Set(['NONE','HEAL','HURT','DRAW','PEEK','POISON','CURE','NEXT_ADV','DEF_ADV']),
 item:new Set(['HEAL','HEAL_ALL','CURE','CLEANSE','RECHARGE','NEXT_WIT','NEXT_ADV','DEF_ADV'])
};
export function validateOperations(ops,context='room'){
 if(!Array.isArray(ops)||ops.length<1||ops.length>8)fail('Operations must contain 1..8 opcodes');
 for(const op of ops){
  if(typeof op!=='string')fail('Unsafe non-string opcode');
  const name=op.split(':')[0];
  if(!contexts[context]?.has(name)||
    (grammar[name]?!grammar[name].test(op):!Object.hasOwn(simpleText,op)))
   fail('Unsupported or malformed '+context+' opcode '+op);
 }
 if(ops.includes('ROLL_ROOM')&&ops.length!==1)fail('ROLL_ROOM must be the sole operation');
 if(ops.includes('MONSTER_DRAW')&&ops.filter(op=>op==='MONSTER_DRAW').length>1)
  fail('Only one Monster draw per operation sequence is supported');
 if(ops.some((op,i)=>op.startsWith('COST:')&&i!==0))fail('Room COST must precede effects');
 return ops;
}
export function printOperations(ops){
 return ops.map(op=>{
  if(simpleText[op])return simpleText[op];
  const [name,n]=op.split(':');
  switch(name){
   case 'HEAL':return 'Heal '+n+' HP.';
   case 'HEAL_ALL':return 'Each Hero heals '+n+' HP.';
   case 'HURT':return 'Lose '+n+' HP.';
   case 'COST':case 'DISCARD':return 'Discard '+n+' Item'+(n==='1'?'':'s')+'.';
   case 'DRAW':return 'Draw '+n+' Item'+(n==='1'?'':'s')+'.';
   case 'PEEK':return 'Peek at the next '+n+' Room'+(n==='1'?'':'s')+'.';
   case 'NEXT_WIT':return '+'+n+' on your next WIT test.';
   default:fail('No printable handler for opcode '+op);
  }
 }).join(' ');
}
const behaviors={none:'Wait: no attack.',hit:'Strike: ATTACK.',adv:'Lunge: ATTACK with ADV.',
 strong:'Strike: ATTACK with +2 ATK.',heavy:'Crush: ATTACK with +2 damage.',
 dis:'Distract: next Hero attack has DIS.',poison:'Poison: target becomes POISONED.',
 'def-break':'Fracture: next Monster attack ignores 2 DEF and has ADV.',
 steal:'Snatch: discard 1 carried Item, or lose 2 HP.',
 'heal-hit':'Drain: ATTACK; on hit heal 1 HP.'};
function validateBehaviors(ops){
 if(!Array.isArray(ops)||ops.length!==4||ops.some(op=>typeof op!=='string'||!Object.hasOwn(behaviors,op)))
  fail('Unsupported Monster behavior; require four deterministic supported behavior opcodes');
}
// These operations need resources before the Room action is legal. A
// guaranteed fallback cannot depend on Items, tags, or a retained card.
const resourceChoiceOps=new Set(['COST','DISCARD','COST_CURSED','CLEANSE_COST',
 'RELIQUARY_OFFER','CHOIR_SILENCE','FUNGUS_BURN','BOOKCASE_FIRE_OR_SCROLL']);
const roomRollOps=new Set(['ROLL_ROOM','ROLL_ROOM_RISK','ROLL_ROOM_RISK_D6','ROLL_ROOM_COST_REROLL']);
function validateRoomModel(card,model){
 const fallback=model.choices.some((ops,index)=>
  !card.v2.choices[index].label.includes('PACT')&&
  !(card.id==='u-puppet'&&index===1)&&
  !ops.some(op=>resourceChoiceOps.has(op.split(':')[0])));
 if(!fallback)fail('Room '+card.id+' requires at least one always-legal choice or explicit fallback');
 const roll=card.v2.roll,outcomes=model.outcomes;
 const rolls=model.choices.some(ops=>ops.some(op=>roomRollOps.has(op.split(':')[0])));
 if(rolls&&!roll)fail('Room '+card.id+' roll choice requires a printed die and outcome bands');
 if(!roll){
  if(outcomes.length)fail('Room '+card.id+' outcomes require a printed roll');
  return;
 }
 if(roll.die!=='d6'||!Array.isArray(roll.outcomes)||!roll.outcomes.length||
   roll.outcomes.length!==outcomes.length)
  fail('Room '+card.id+' printed roll and executable outcome bands must match');
 const faces=[];
 for(const row of roll.outcomes){
  const range=/^([1-6])(?:[–-]([1-6]))?$/.exec(row.range);
  if(!range)fail('Unsupported printed Room roll range '+card.id);
  const first=Number(range[1]),last=Number(range[2]??range[1]);
  if(last<first)fail('Invalid printed Room roll range '+card.id);
  for(let face=first;face<=last;face++)faces.push(face);
 }
 if(faces.length!==6||new Set(faces).size!==6)
  fail('Room '+card.id+' roll outcome bands must cover every d6 face exactly once');
}
const cardBase=a=>({id:a.id,title:a.title,type:a.type,copies:a.copies,
 art:'expansion',printOnly:true,rule:'',flavor:'',_stagedCard:true});
export function compileAdditions(additions){
 const extraCards={rooms:[],monsters:[],items:[]},extraRoomEffects={};
 if(!Array.isArray(additions)||additions.length>64)fail('additions must be an array of at most 64 cards');
 const ids=new Set(knownIds);
 for(const a of additions){
  object(a,'addition');
  if(!['room','monster','item'].includes(a.type))fail('Unsupported new card type; Hero abilities and co-op rules require explicit engine handlers');
  const common=['type','template','id','title','copies'];
  keys(a,[...common,...(a.type==='room'?['stage','kind','choices','outcomes']:
   a.type==='monster'?['stage','hp','atk','def','behaviorOps','parley','defeatOps','remains','tags','weakness']:['ops'])],'addition');
  if(typeof a.id!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(a.id)||ids.has(a.id))fail('Duplicate or invalid new card identity '+a.id);
  ids.add(a.id);text(a.title,'card title',80);integer(a.copies,1,12,'new card copies');
  const base=cardBase(a);
  if(a.type!=='item'&&!stages.includes(a.stage))fail('Invalid new card stage '+a.stage);
  if(a.type==='room'){
   if(a.template!=='room-v1')fail('Unsupported Room template '+a.template);
   if(!['TREASURE','SHRINE','LAIR','HAZARD','ENCOUNTER',undefined].includes(a.kind))fail('Unsupported Room kind');
   if(!Array.isArray(a.choices)||a.choices.length!==2)fail('New Rooms require exactly two choices');
   const choices=a.choices.map(c=>{keys(c,['label','ops'],'Room choice');text(c.label,'choice label',40);
    if(/PACT/.test(c.label))fail('New PACT rules are unsupported');
    validateOperations(c.ops);return {label:c.label,effect:printOperations(c.ops)};});
   const outcomes=a.outcomes??[];
   if(!Array.isArray(outcomes)||![0,3].includes(outcomes.length))fail('Room outcomes require three d6 bands or no roll');
   outcomes.forEach(row=>validateOperations(row));
   if(outcomes.some(row=>row.some(op=>op.startsWith('COST:'))))
    fail('Upfront COST in a Room roll outcome is unsupported');
   if(outcomes.some(row=>row.includes('ROLL_ROOM'))||
    a.choices.some(c=>c.ops.includes('ROLL_ROOM'))!==(outcomes.length===3))fail('Room roll choices and d6 outcomes must match');
   const effect={choices:a.choices.map(c=>c.ops),outcomes};
   extraRoomEffects[a.id]=deepFreeze(effect);
   extraCards.rooms.push(deepFreeze({...base,stage:a.stage,v2:{kind:a.kind??'TREASURE',
    number:0,prompt:'Choose one printed action.',choices,links:[],
    roll:outcomes.length?{label:'ROOM',die:'d6',outcomes:outcomes.map((ops,i)=>
     ({range:['1–2','3–4','5–6'][i],effect:printOperations(ops)}))}:null}}));
   validateRoomModel(extraCards.rooms.at(-1),effect);
  }else if(a.type==='monster'){
   if(a.template!=='monster-v1')fail('Unsupported Monster template '+a.template);
   integer(a.hp,1,100,'Monster HP');integer(a.atk,0,100,'Monster ATK');integer(a.def,0,100,'Monster DEF');
   validateBehaviors(a.behaviorOps);
   keys(a.parley,['mode','cost'],'Monster parley');
   if(!['WIT','ITEM'].includes(a.parley.mode))fail('Unsupported Monster parley mode');
   integer(a.parley.cost,1,20,'Monster parley cost');
   validateOperations(a.defeatOps,'reward');keys(a.remains,['mode','ops'],'Monster remains');
   if(!['EAT','SEARCH'].includes(a.remains.mode)||!Array.isArray(a.remains.ops)||a.remains.ops.length!==3)
    fail('Monster remains require EAT or SEARCH and three operations');
   a.remains.ops.forEach(op=>validateOperations([op],'remains'));
   const tags=a.tags??[];
   if(!Array.isArray(tags)||new Set(tags).size!==tags.length||
    tags.some(t=>!['BEAST','CURSED','DARK','MAGIC','METAL','LIGHT','FIRE','ICE','LIGHTNING'].includes(t)))fail('Unsupported Monster tags');
   let weakness={weakness:'No printed weakness.'};
   if(a.weakness){
    keys(a.weakness,['tag','face'],'Monster weakness');
    if(!['BEAST','CURSED','MAGIC','METAL','LIGHT','FIRE','ICE','LIGHTNING'].includes(a.weakness.tag))fail('Unsupported weakness tag');
    integer(a.weakness.face,3,6,'weakness face');weakness={weaknessTag:a.weakness.tag,weaknessFace:a.weakness.face,
     weakness:'With a '+a.weakness.tag+' Item, treat behaviour '+a.weakness.face+' as 1–2.'};
   }
   const {mode,cost}=a.parley;
   extraCards.monsters.push(deepFreeze({...base,stage:a.stage,hp:a.hp,atk:a.atk,def:a.def,
    behavior:a.behaviorOps.map(op=>behaviors[op]),v2:{number:0,kind:'MONSTER',tags,...weakness,
     behaviorOps:a.behaviorOps,parleyMode:mode,parleyCost:cost,
     parley:mode==='WIT'?'ESCAPE: opposed d20+WIT vs d20+'+cost+'. Win: leave without reward; lose: fight.':
      'OFFER: discard '+cost+' Item'+(cost===1?'':'s')+' to avoid this fight. No reward.',
     defeat:printOperations(a.defeatOps),defeatOps:a.defeatOps,
     genericRemains:a.remains.mode,remainsOps:a.remains.ops,
     remains:a.remains.mode+': d6. '+a.remains.ops.map((op,i)=>['1–2','3–4','5–6'][i]+': '+printOperations([op])).join(' ')}}));
  }else{
   if(a.template!=='consumable-v1')fail('Unsupported Item template '+a.template);
   validateOperations(a.ops,'item');
   const trigger='OUTSIDE COMBAT: Discard this Item. '+printOperations(a.ops);
   extraCards.items.push(deepFreeze({...base,rule:trigger,v2:{number:0,kind:'TOOL',tags:['TOOL'],
    trigger,roll:null,alternative:'',links:[],declarativeOps:a.ops}}));
  }
 }
 return {extraCards,extraRoomEffects};
}

export function normalizeCandidateSpec(input){
 const spec=cloneData(input);
 keys(spec,['schema','id','base','hash','staging','additions'],'candidate');
 if(spec.schema!==undefined&&spec.schema!=='uba-candidate-v1')fail('Unknown candidate schema');
 if(spec.base!==undefined&&spec.base!==BASELINE_ID)fail('Unsupported candidate base '+spec.base);
 if(spec.id!==undefined&&(typeof spec.id!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(spec.id)))fail('Candidate id must be stable kebab-case');
 const staging=spec.staging??{};keys(staging,stageFields,'staging');
 if(staging.roomRestCosts!==undefined){
  if(staging.roomRestCost!==undefined)fail('Specify only roomRestCost or roomRestCosts');
  staging.roomRestCost=staging.roomRestCosts;delete staging.roomRestCosts;
 }
 if(staging.description!==undefined)text(staging.description,'description',2000);
 if(staging.cards!==undefined&&!Array.isArray(staging.cards))fail('cards must be an array');
 if(staging.mechanics){
  keys(staging.mechanics,Object.keys(defaults),'mechanics');
  for(const [key,value] of Object.entries(staging.mechanics))if(value!==defaults[key])
   fail('Unsupported non-printable mechanic '+key+'; hidden healing, new behaviors and co-op rules are not deployable');
 }
 if(staging.roomEffects){
  object(staging.roomEffects,'roomEffects');
  for(const [id,def] of Object.entries(staging.roomEffects)){
   keys(def,['choices','outcomes'],'Room effect');
   const card=ALL_ROOMS.find(c=>c.id===id);
   if(card?.v2.special||card?.v2.fate)
    fail('Unsupported special/fate Room effect replacement '+id+'; requires explicit deterministic handler');
   for(const kind of ['choices','outcomes'])if(def[kind]!==undefined){
    if(!Array.isArray(def[kind]))fail('Room effect '+kind+' must be an array');
    def[kind].forEach((ops,i)=>{
     if(kind==='outcomes'&&Array.isArray(ops)&&ops.includes('ROLL_ROOM'))
      fail('Recursive Room roll outcomes are unsupported');
     if(kind==='outcomes'&&Array.isArray(ops)&&ops.some(op=>typeof op==='string'&&op.startsWith('COST:')))
      fail('Upfront COST in a Room roll outcome is unsupported');
     // Unchanged canonical contextual operations keep their printed handlers.
     if(JSON.stringify(ops)!==JSON.stringify(ROOM_EFFECTS[id]?.[kind]?.[i]))validateOperations(ops);
    });
   }
  }
 }
 const normalized={schema:'uba-candidate-v1',base:BASELINE_ID,staging,additions:spec.additions??[]};
 compileCandidateData({...normalized,id:spec.id??'candidate-check'});
 return {...normalized,...(spec.id!==undefined?{id:spec.id}:{}),...(spec.hash!==undefined?{hash:spec.hash}:{})};
}
export function compileCandidateData(candidate){
 const additions=compileAdditions(candidate.additions);
 const {roomRestCost,monsterBehaviors={},monsterRewards={},itemEffects={},...staging}=candidate.staging;
 const pools=compileStaging({schema:'rogue-cards-staging-v1',id:candidate.id,
  ...staging,...(roomRestCost!==undefined?{roomRestCosts:roomRestCost}:{})},
  {...additions,printOperations});
 for(const [id,model] of Object.entries(pools.roomEffects)){
  const card=pools.rooms.find(c=>c.id===id);
  if(card)validateRoomModel(card,model);
 }
 const result={...pools,monsters:[...pools.monsters],items:[...pools.items]};
 const rewrite=(collection,id,transform)=>{
  const index=result[collection].findIndex(c=>c.id===id);
  if(index<0)fail('Effect edits require a present '+collection+' card '+id);
  const card=result[collection][index];
  result[collection][index]={...card,_stagedCard:true,...transform(card)};
 };
 object(monsterBehaviors,'monsterBehaviors');
 for(const [id,ops] of Object.entries(monsterBehaviors)){
  validateBehaviors(ops);
  rewrite('monsters',id,card=>({behavior:ops.map(op=>behaviors[op]),v2:{...card.v2,behaviorOps:ops}}));
 }
 object(monsterRewards,'monsterRewards');
 for(const [id,ops] of Object.entries(monsterRewards)){
  if(Object.hasOwn(staging.monsterHealing??{},id))fail('Conflicting Monster reward/healing edits for '+id);
  validateOperations(ops,'reward');
  rewrite('monsters',id,card=>({v2:{...card.v2,defeat:printOperations(ops),defeatOps:ops}}));
 }
 object(itemEffects,'itemEffects');
 for(const [id,ops] of Object.entries(itemEffects)){
  if(Object.hasOwn(staging.itemHealing??{},id))fail('Conflicting Item effect/healing edits for '+id);
  if(!['ex-bandages','ex-rations'].includes(id)&&!additions.extraCards.items.some(c=>c.id===id))
   fail('Unsupported Item effect replacement; only plain Bandages/Rations consumables and declarative Items are supported: '+id);
  validateOperations(ops,'item');
  const trigger='OUTSIDE COMBAT: Discard this Item. '+printOperations(ops);
  rewrite('items',id,card=>({rule:trigger,v2:{...card.v2,trigger,declarativeOps:ops}}));
 }
 // Detach canonical definitions before recursively freezing the proposal.
 return deepFreeze(structuredClone(result));
}
export function validateCandidate(spec={}){normalizeCandidateSpec(spec);return true;}
