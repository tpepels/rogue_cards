import {ROOM_EFFECTS} from '../room-effect-model.js';
import {ROLL_EFFECTS} from '../effect-model.js';
import {ITEM_HEALING_DEFAULTS} from '../item-healing.js';

const heals=ops=>(ops??[]).some(op=>Array.isArray(op)?heals(op):typeof op==='string'&&op.includes('HEAL'));
const source=card=>card.type+':'+card.id;
const printedSpecialChoices=new Set(['u-mossy:0','m-well:0','u-leech-pool:0','u-bone-seed:1']);
/** Classify an ALREADY LEGAL action from executable printed definitions.
 * This records that healing is possible, never that a random outcome will
 * occur, an unchosen amount was offered, or hypothetical HP was restored. */
export function healingOpportunitySources(state,action){
 if(action.kind==='room-choice'&&state.room){
  const card=state.room,model=state.cardPools?.roomEffects?.[card.id]??ROOM_EFFECTS[card.id],ops=model?.choices?.[action.index]??[];
  if(heals(ops)||ops.some(op=>op.startsWith('ROLL_ROOM'))&&heals(model?.outcomes)||printedSpecialChoices.has(card.id+':'+action.index))return [source(card)];
 }
 if(action.kind==='shrine-item'&&action.mode==='heal'){
  const card=state.heroes[action.heroIndex]?.inventory.find(c=>c.id===action.cardId);
  if(card)return [source(card)];
 }
 if(['item','item-trigger'].includes(action.kind)){
  const card=state.heroes[action.heroIndex??0]?.inventory.find(c=>c.id===action.cardId);
  if(card&&(card.v2?.declarativeOps?heals(card.v2.declarativeOps):
    Object.hasOwn(ITEM_HEALING_DEFAULTS,card.id)||card.id==='odd-bone-dice'||heals(ROLL_EFFECTS[card.id])))return [source(card)];
 }
 if(action.kind==='hero-mode'&&action.mode==='risk'){
  const card=state.heroes[action.heroIndex]?.card;
  if(card&&['monk','witch'].includes(card.id))return ['hero:'+card.id];
 }
 if(action.kind==='return'&&action.roomId==='m-well'&&action.mode==='leave')return ['room:m-well'];
 if(action.phase==='corpse'&&state.monster){
  const card=state.monster;
  // Every corpse alternative settles the printed DEFEAT reward. EAT may
  // additionally restore HP; its uncertain roll is not offered HP yet.
  if(heals(card.v2?.defeatOps)||action.kind==='eat'||action.kind==='search'&&heals(card.v2?.remainsOps))return [source(card)];
 }
 return [];
}
