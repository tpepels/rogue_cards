// Executable per-card consequences. No new universal Room rules.
import {resolveFateChoice,fateStageEntry,fateMonsterEntry,fateVaultEntry} from "./room-fates.js";
export function resolveRoomChoice(s,choice){
 if(s.room.v2.fate)return resolveFateChoice(s,choice);
 const id=s.room.id,h=s.actor||s.chooseRecipient("retained-room-choice");
 const pact=!!s.room.v2.choices[choice]?.label.includes("PACT");
 if(pact&&s.pactUsed)throw Error("Only one Pact per expedition");
 if(pact)s.pactUsed=true;
 const keep=(item=null)=>s.keptRooms.push({card:s.room,item});
 if(id==="d-last-bell"){
  if(choice===0)s.roomRoll();
  else keep();
  return;
 }
 if(s.room.v2.special.corridor){
  if(id==="d-gilded"&&choice===1){
   s.keptRooms.push({card:s.room,choice:1});s.forkRooms("plain");return;
  }
  if(id==="u-smuggler"&&choice===0){s.hurt(h,1);if(s.alive())s.draw();}
  if(id==="u-mossy"&&choice===0)s.heal(h,1);
  // Rolled corridor outcomes already specify whether and how to enter a
  // revealed Room. Do not add an unprinted second fork afterwards.
  if(choice===1){s.roomRoll();return;}
  // IGNORE on the Red Detour is an ordinary choice between two Rooms.
  s.forkRooms(id==="m-red-detour"?"plain":id);return;
 }
 if(choice===1){if(id==="m-well")s.peek(1);else s.roomRoll();return;}
 switch(id){
 case "m-fungus":case "m-bridge":case "u-lantern-shrine":case "m-second-name":
 case "m-wax-bridge":case "d-apothecary":case "d-last-bell":keep();break;
 case "m-well":if(s.discardable()){
  const item=s.discard();s.heal(h,3);keep(item);
 }else throw Error("Bottomless Well OFFER requires an Item");
 break;
 case "m-clock":s.draw(2);keep();break;
 case "u-rat-favor":s.draw(2);if(s.alive())s.discard();keep();break;
 case "u-leech-pool":s.heal(h,3);keep();break;
 case "m-hungry-door":
  if(!s.discardable())throw Error("Hungry Door requires 1 Item");
  s.discard(1);if(s.alive())s.draw(3);keep();break;
 default:throw Error("Unimplemented Room choice "+id);
 }
}
export function protectHero(s,h,damage){
 if(damage<=0)return damage;
 if(s._trapDamageContext&&s._trapPrevention>0){
  damage=Math.max(0,damage-s._trapPrevention);
  s._trapPrevention=0;
 }
 if(s._resolvingWardenHit){
  const chest=s.keptRooms.find(x=>x.card.id==="d-last-chest");
  if(chest&&s.chooseEffect("last-chest-prevent-warden-hit",
   ["save","use"],"use")==="use"){
   s.keptRooms.splice(s.keptRooms.indexOf(chest),1);
   damage=Math.max(0,damage-3);
  }
 }
 if(h.nextHitBlock>0){
  damage=Math.max(0,damage-h.nextHitBlock);
  h.nextHitBlock=0;
  if(damage===0)return 0;
 }
 const heal=s.keptRooms.findIndex(x=>x.card.id==="d-apothecary");
 if(heal!==-1&&s.chooseEffect("apothecary-protect",
  ["save","use"],"use")==="use"){
  s.keptRooms.splice(heal,1);damage=Math.max(0,damage-2);
 }
 if(damage>=h.hp){const guard=s.keptRooms.findIndex(x=>x.card.id==="m-second-name");
  if(guard!==-1&&s.chooseEffect("second-name-protect",
    ["save","use"],"use")==="use"){
    s.keptRooms.splice(guard,1);damage=Math.max(0,h.hp-1);
  }}
 return damage;
}
export function roomEntry(s){
 const room=s.room;
 if(room.stage==="DEEP"&&!s.enteredDeep){s.enteredDeep=true;
  for(const entry of [...s.keptRooms])if(["m-well","u-leech-pool"].includes(entry.card.id)){
   s.keptRooms.splice(s.keptRooms.indexOf(entry),1);
   if(entry.card.id==="m-well"){
    if(s.returnChoices?.["m-well"]==="leave")
     s.heal(s.chooseRecipient("well-healing"),3);
    else{s.resolveKeptRoll(entry.card);
     if(entry.item){const h=s.chooseRecipient("well-returned-item");
      h.inventory.push(entry.item);
      s.consumed.delete(entry.item);s.equip(h,entry.item);}}
   }else if(s.discardable(1,"ALCHEMY")&&s.chooseEffect("leech-pool-debt",
    ["lose-hp","discard-alchemy"],"discard-alchemy")==="discard-alchemy")
     s.discard(1,{tag:"ALCHEMY"});
   else s.hurt(s.chooseRecipient("leech-pool-debt"),2);
  }
 }
 if(room.stage==="FINAL"){
  for(const entry of [...s.keptRooms]){
   if(!["m-clock","m-hungry-door","d-last-bell"].includes(entry.card.id))
    continue;
   s.keptRooms.splice(s.keptRooms.indexOf(entry),1);
   if(entry.card.id==="m-clock"){
    const preset=s.returnChoices["m-clock"];
    const mode=!s.discardable()?"force-six":preset?
     (preset==="pay"?"pay-and-telegraph":"force-six"):
     s.chooseEffect("confessional-vault-debt",
      ["force-six","pay-and-telegraph"],"pay-and-telegraph");
    if(mode==="pay-and-telegraph"){
     s.discard();s.telegraphWarden();
    }else s.forcedBehavior=6;
   }else if(entry.card.id==="m-hungry-door"){
    const preset=s.returnChoices["m-hungry-door"];
    const mode=!s.discardable()?"force-six":preset?
     (preset==="pay"?"pay":"force-six"):
     s.chooseEffect("hungry-door-vault-debt",["force-six","pay"],"pay");
    if(mode==="pay")s.discard();
    else s.forcedBehavior=6;
   }else{
    // Bell saved instead of rung: a known cost and a first-response
    // telegraph. The d6 outcomes that KEEP a bell resolve on the
    // next Monster, not automatically on Vault entry.
    if(entry.mode){s.keptRooms.push(entry);continue;}
    // SAVE is optional: an unaffordable Bell debt never costs HP.
    const payer=[...s.living()].sort((a,b)=>b.hp-a.hp)[0];
    if(payer?.hp>2&&s.chooseEffect("last-bell-vault-payment",
      ["skip","pay"],"pay")==="pay"){
      s.hurt(payer,2);
      if(s.alive())s.telegraphWarden({mayReroll:true});
    }
   }
  }
 }
 if(room.id==="u-nest"){
  const favor=s.keptRooms.find(x=>x.card.id==="u-rat-favor"&&!x.spent);
  if(favor){favor.spent=true;s.ratFavor=true;}
 }
 if(room.v2?.kind==="TREASURE"){
  const favor=s.keptRooms.find(x=>x.card.id==="u-rat-favor"&&!x.spent);
  if(favor){
   favor.spent=true;
   if(s.discardable()&&s.chooseEffect("rat-favor-debt",
    ["forfeit-next-item","discard"],"discard")==="discard")s.discard();
   else s.forfeitNextItem=true;
  }
 }
 if(s.nextLadder){s.nextLadder=false;if(room.v2?.kind==="LAIR")s.heroFirstAdv=true;else s.draw();}
 if(room.stage==="DEEP")fateStageEntry(s,"DEEP");
 if(room.stage==="FINAL")fateVaultEntry(s);
 if(s.followingWisp&&(room.stage==="FINAL"||room.v2?.special?.corridor)){
  const m=s.followingWisp;s.followingWisp=null;
  if(s.monster){
   s.monsterQueue.unshift(m);s.queuedForcedWisp=m;
  }else{
   s.monster=m;s.monsterHP=m.hp;s.banished=false;
   s.monsterFirstAttackPending=true;
   if(s.useRetainedPotion("laughter","pursuing-wisp"))s.forcedBehavior=1;
   s.elberethAttempts=0;s.elberethSkipResponse=false;
   s.mustFightFollowingWisp=true;
  }
  s.metrics.monsterVisits[m.id]=(s.metrics.monsterVisits[m.id]||0)+1;
 }
}
export function monsterEntry(s,monster){
 if(fateMonsterEntry(s,monster))return true;
 const bell=s.keptRooms.find(entry=>entry.card.id==="d-last-bell"&&
  ["force","skip"].includes(entry.mode));
 if(bell&&s.chooseEffect("last-bell-monster:"+monster.id,
   ["save","use"],"use")==="use"){
  s.keptRooms.splice(s.keptRooms.indexOf(bell),1);
  if(bell.mode==="force")s.forcedBehavior=1;
  else s.monsterSkip++;
 }
 if(s.whisperRoom){s.rooms[s.whisperRoom.stage].unshift(s.whisperRoom);s.whisperRoom=null;}
 // Bridge of Whispering Rope, unlike Wax Bridge, actually grants
 // an escape from a newly revealed non-Warden Monster.
 if(monster.stage!=="FINAL"){
  const i=s.keptRooms.findIndex(x=>x.card.id==="m-bridge");
  if(i>=0&&s.discardable()){
   const action=s._decisionHook?.({phase:"retained",roomId:"m-bridge",
    monsterId:monster.id,context:"monster-entry"});
   if(action?.mode!=="save"){
    s.discard();
    s.keptRooms.splice(i,1);return true;
   }
  }
 }
 return false;
}
