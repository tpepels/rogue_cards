// Export all physical-card designs and their actual art assignments for Python.
// The engine's canonical CATALOGUE remains unchanged: print-only cards live
// alongside it and keep their own illustration mapping.
import {CATALOGUE} from '../src/tabletop-data.js';
import {CARD_ART} from '../src/tabletop-view.js';
import {PRINT_ONLY_CARDS,PRINT_ONLY_ART} from '../src/print-expansion.js';
const cards=[
 ...CATALOGUE.map(card=>({
   key:card.type+":"+card.id,
   title:card.title,
   filename:CARD_ART[card.type+":"+card.id]??null,
   mapping_source:"canonical"
 })),
 ...PRINT_ONLY_CARDS.map(card=>({
   key:card.type+":"+card.id,
   title:card.title,
   filename:PRINT_ONLY_ART[card.type+":"+card.id]??null,
   mapping_source:"print-only"
 }))
];
if(new Set(cards.map(c=>c.key)).size!==cards.length){
  throw new Error('Duplicate physical card identifiers in illustration catalogue');
}
console.log(JSON.stringify(cards));
