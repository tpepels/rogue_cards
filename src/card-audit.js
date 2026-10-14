/**
 * Phase 5 editorial mechanical audit. This is a heuristic link/effect audit,
 * not a rules interpreter. In particular, v2.links is metadata ONLY.
 */
import {HEROES,ROOMS,VAULT,MONSTERS,WARDEN_CARDS,OBJECTS,CATALOGUE} from "./tabletop-data.js";
const allRooms=[...ROOMS,VAULT];
const roomById=new Map(allRooms.map(r=>[r.id,r]));
const roomText=r=>[r.v2.prompt,...r.v2.choices.map(x=>x.effect),...(r.v2.roll?.outcomes||[]).map(x=>x.effect)].join(" ").toLowerCase();
const objectText=o=>[o.v2.trigger,o.v2.alternative||"",...(o.v2.roll?.outcomes||[]).map(x=>x.effect)].join(" ").toLowerCase();
const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]/g," ");
export function auditCards(){
 const brokenReferences=[],indirectReferences=[],printedReferences=[],isolatedObjects=[];
 let totalLinks=0;
 for(const o of OBJECTS){
  const links=o.v2.links||[];
  if(!links.length)isolatedObjects.push(o.id);
  for(const id of links){
   totalLinks++;
   const r=roomById.get(id);
   if(!r){brokenReferences.push({object:o.id,room:id});continue;}
   const obj=objectText(o),room=roomText(r);
   const grounded=obj.includes(r.title.toLowerCase())||room.includes(o.title.toLowerCase())||
     o.v2.tags.some(tag=>tag.length>=4&&room.includes(tag.toLowerCase()));
   const ref={object:o.id,room:id,objectTitle:o.title,roomTitle:r.title};
   if(grounded)printedReferences.push(ref);else indirectReferences.push(ref);
  }
 }
 const malformedRolls=[];
 for(const card of CATALOGUE){
  if(!card.v2?.roll)continue;
  const faces=[];
  for(const o of card.v2.roll.outcomes){
   const [a,b=a]=o.range.split("–").map(Number);
   if(!(a>=1&&b<=6&&a<=b)){malformedRolls.push(card.id);break;}
   for(let n=a;n<=b;n++)faces.push(n);
  }
  if(faces.sort().join(",")!=="1,2,3,4,5,6")malformedRolls.push(card.id);
 }
 const duplicateCardIDs=[];
 const ids=new Set();
 for(const card of CATALOGUE){const key=card.type+":"+card.id;if(ids.has(key))duplicateCardIDs.push(key);ids.add(key);}
 const dieResults=CATALOGUE.filter(c=>c.v2?.roll).length;
 const battleBehavior=MONSTERS.concat(WARDEN_CARDS).filter(m=>m.behavior.length===4).length;
 return {
  cards:CATALOGUE.length,heroes:HEROES.length,rooms:ROOMS.length,monsters:MONSTERS.length,
  objects:OBJECTS.length,wardenPhases:WARDEN_CARDS.length,d6Cards:dieResults,d6Monsters:battleBehavior,
  declaredLinks:totalLinks,printedLinkEvidence:printedReferences.length,
  metadataOnlyLinks:indirectReferences.length,
  brokenReferences,isolatedObjects,malformedRolls:[...new Set(malformedRolls)],
  duplicateCardIDs,metadataOnlyExamples:indirectReferences.slice(0,12)
 };
}
