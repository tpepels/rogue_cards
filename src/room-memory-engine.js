// Executable per-card consequences. No new universal Room rules.
import {resolveFateChoice,fateStageEntry,fateMonsterEntry,fateVaultEntry} from "./room-fates.js";
export function resolveRoomChoice(s,choice){
 if(s.room.v2.fate)return resolveFateChoice(s,choice);
 const id=s.room.id,h=s.chooseActor();
 const keep=(item=null)=>s.keptRooms.push({card:s.room,item});
 if(s.room.v2.special.corridor){
  if(id==="d-gilded"&&choice===1){
   s.keptRooms.push({card:s.room,choice:1});s.forkRooms("plain");return;
  }
  if(id==="u-smuggler"&&choice===0){s.hurt(h,1);if(s.alive())s.draw();}
  if(id==="u-mossy"&&choice===0)s.heal(h,1);
  if(["m-ladder","d-whisper-junction"].includes(id)&&choice===1){
   s.roomRoll();return;
  }
  if(choice===1||id==="m-red-detour"&&choice===0)s.roomRoll();
  if(id==="u-smuggler"&&choice===1)return;
  s.forkRooms(choice===0?id:"plain");return;
 }
 if(choice===1){if(id==="m-well")s.peek(1);else s.roomRoll();return;}
 switch(id){
 case "m-fungus":case "m-bridge":case "u-lantern-shrine":case "m-second-name":
 case "m-wax-bridge":case "d-apothecary":case "d-last-bell":keep();break;
 case "m-well":if(s.discardable()){const item=s.discard();s.heal(h,3);keep(item);}break;
 case "m-clock":case "u-rat-favor":s.draw();keep();break;
 case "u-leech-pool":s.heal(h,3);keep();break;
 case "m-hungry-door":s.draw(2);if(s.discardable())s.discard();keep();break;
 default:throw Error("Unimplemented Room choice "+id);
 }
}
export function protectHero(s,h,damage){
 if(damage<=0)return damage;
 const heal=s.keptRooms.findIndex(x=>x.card.id==="d-apothecary");
 if(heal!==-1){s.keptRooms.splice(heal,1);damage=Math.max(0,damage-2);}
 if(damage>=h.hp){const guard=s.keptRooms.findIndex(x=>x.card.id==="m-second-name");
  if(guard!==-1){s.keptRooms.splice(guard,1);damage=Math.max(0,h.hp-1);}}
 return damage;
}
export function roomEntry(s){
 const room=s.room;
 if(room.stage==="DEEP"&&!s.enteredDeep){s.enteredDeep=true;
  for(const entry of [...s.keptRooms])if(["m-well","u-leech-pool"].includes(entry.card.id)){
   s.keptRooms.splice(s.keptRooms.indexOf(entry),1);
   if(entry.card.id==="m-well"){
    if(s.returnChoices?.["m-well"]==="leave")s.heal(s.chooseActor(),3);
    else{s.resolveKeptRoll(entry.card);
     if(entry.item){const h=s.chooseActor();h.inventory.push(entry.item);
      s.consumed.delete(entry.item);s.equip(h,entry.item);}}
   }else if(s.discardable())s.discard();else s.hurt(s.chooseActor(),2);
  }
 }
 if(room.stage==="FINAL"){
  for(const entry of [...s.keptRooms])if(["m-clock","m-hungry-door","d-last-bell"].includes(entry.card.id)){
   s.keptRooms.splice(s.keptRooms.indexOf(entry),1);
   if(entry.card.id==="d-last-bell")s.resolveKeptRoll(entry.card);
   else if(s.returnChoices?.[entry.card.id]==="roll")s.resolveKeptRoll(entry.card);
   else if(s.discardable())s.discard();else s.resolveKeptRoll(entry.card);
  }
 }
 if(room.id==="u-nest"){
  const favor=s.keptRooms.find(x=>x.card.id==="u-rat-favor");
  if(favor){s.keptRooms.splice(s.keptRooms.indexOf(favor),1);
   s.skipNextMonster=true;s.draw();}
 }
 if(room.v2?.kind==="TREASURE"){
  const rat=s.keptRooms.findIndex(x=>x.card.id==="u-rat-favor");
  if(rat>=0){s.keptRooms.splice(rat,1);if(s.discardable())s.discard();else s.forfeitNextItem=true;}
 }
 if(room.stage!=="FINAL"&&!room.v2?.special?.corridor){
  const garden=s.keptRooms.findIndex(x=>x.card.id==="m-fungus");
  const h=s.chooseActor();
  if(garden>=0&&h.card.hp-h.hp>=3){
   const mode=s.returnChoices?.["m-fungus"]||"heal";
   if(mode!=="save"){
    s.keptRooms.splice(garden,1);
    if(mode==="burn"&&s.discardable(1,"FIRE")){
     s.discard(1,{tag:"FIRE"});s.draw(2);h.poison=false;
    }else s.heal(h,3);
    s.skipRoom=true;
   }
  }
 }
 if(s.nextLadder){s.nextLadder=false;if(room.v2?.kind==="LAIR")s.heroFirstAdv=true;else s.draw();}
 if(room.stage==="DEEP")fateStageEntry(s,"DEEP");
 if(room.stage==="FINAL")fateVaultEntry(s);
}
export function monsterEntry(s,monster){
 if(fateMonsterEntry(s,monster))return true;
 if(s.whisperRoom){s.rooms[s.whisperRoom.stage].unshift(s.whisperRoom);s.whisperRoom=null;}
 for(const id of ["m-bridge","m-wax-bridge"]){
  const i=s.keptRooms.findIndex(x=>x.card.id===id);if(i<0)continue;
  if(id==="m-bridge"){if(!s.discardable())continue;s.discard();}
  else{if(s.chooseActor().hp<=1)continue;s.hurt(s.chooseActor(),1);}
  s.keptRooms.splice(i,1);return true;
 }
 return false;
}
