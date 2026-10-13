// Export the actual physical-card catalogue and existing art assignments for Python.
import {CATALOGUE} from '../src/tabletop-data.js';
import {CARD_ART} from '../src/tabletop-view.js';
const cards=CATALOGUE.map(card=>({
  key:card.type+":"+card.id,
  title:card.title,
  filename:CARD_ART[card.type+":"+card.id]??null,
}));
if(new Set(cards.map(c=>c.key)).size!==cards.length){
  throw new Error('Duplicate canonical card identifiers');
}
console.log(JSON.stringify(cards));
