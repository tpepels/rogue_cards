/** Immutable printed definition, distinct physical card.
 *
 * Two physical copies have the same printed card ID and rules, but MUST
 * have different object identities: tapped/used/exhausted/equipped state
 * belongs to the physical copy, not the catalogue definition.
 * Shared v2 is read-only printed data; never mutate it during play.
 */
export function physicalCopies(definitions){
 return definitions.flatMap(definition=>
  Array.from({length:definition.copies||1},(_,number)=>
   Object.freeze({...definition,
    _physicalCard:true,
    _physicalCopy:definition.id+"#"+number
   })));
}
export function isPhysicalCard(value){
 return !!value&&value._physicalCard===true&&Object.isFrozen(value);
}
