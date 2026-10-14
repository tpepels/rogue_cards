// Choices on these Rooms are retained physically beside the Hero. No additional rules vocabulary.
const rows=[
 ["u-cartographer","UPPER","The Blind Cartographer","eye","MYSTERY","A blind hand draws two futures.",
  [["TRUST","Keep this Room. On entering DEEP, reveal the next 2 Rooms and order them; discard this map."],
   ["BURN","Reveal the next 3 Rooms and choose their order. Keep this Room as ashes. On entering DEEP, lose 2 HP; discard it."]]],
 ["u-hollow-knight","UPPER","The Hollow Knight","knight","ENCOUNTER","Its empty armour waits to be judged.",
  [["SPARE","Keep this Room. At the first DEEP Monster: discard to escape it, or save this Room to cancel the Warden's first response."],
   ["STRIP","Draw 2 Items. Keep this Room. Your first DEEP Monster attacks with ADV."]]],
 ["u-scribe-dust","UPPER","The Scribe of Dust","wizard","MYSTERY","He writes your name on a blank scroll.",
  [["INSCRIBE","Discard 1 Item; keep this Room. At Vault, SEAL costs 1 fewer MAGIC Item; discard Room."],
   ["BLOT","Draw 2 Items; keep this Room. At Vault, SEAL costs 1 extra MAGIC Item; discard Room."]]],
 ["u-bone-seed","UPPER","The Unburied Seed","mushroom","MYSTERY","The seed wants something to remember.",
  [["PLANT","Tuck 1 Item beneath this Room; keep it. Upon entering DEEP, recover it and draw 2 Items."],
   ["EAT","Heal 3 HP. Keep this Room. Entering DEEP, lose 2 HP."]]],
 ["m-ferryman-oath","MIDDLE","The Ferryman's Oath","water","ENCOUNTER","SMUGGLE: After Warden Phase I, discard 2 Items (one MAGIC) to escape with the Amulet.",
  [["PAY","Tuck 1 Item beneath this Room and keep it. At Vault, recover it and heal 3 HP, or sacrifice it to unlock SMUGGLE."],
   ["CHEAT","Draw 2 Items. Keep this Room. At the Vault, lose 3 HP."]]],
 ["m-choir-nails","MIDDLE","Choir of Nails","bones","MYSTERY","Nails sing in the stone.",
  [["LISTEN","Keep this Room. At first DEEP Monster, discard to give its first attack DIS."],
   ["STEAL","Draw 1 Item; keep this Room as a stolen nail. At first DEEP Monster, discard it to deal 3 damage; its next attack has ADV."]]],
 ["m-hourglass","MIDDLE","The Inverted Hourglass","spiral","MYSTERY","The sand falls upward.",
  [["TURN","Keep this Room. At Vault, roll OMEN twice and take the higher result; discard this Room."],
   ["BREAK","Keep sideways. Discard to reverse a Room d6 (1↔6, 2↔5, 3↔4). If kept until Vault, discard and use the lower of 2 OMEN rolls."]]],
 ["m-drowned-banner","MIDDLE","The Drowned Banner","altar","SHRINE","A lost army's colours drip black.",
  [["RAISE","Lose 2 HP; keep Room. At Vault, discard and roll d6: 1–2 each Hero loses 1 HP; 3–4 Warden loses 3 HP; 5–6 Warden loses d6 HP, next DEF roll has DIS."],
   ["BURN","Draw 2 Items; keep this Room. At Vault discard it; Warden's first attack has ADV."]]],
 ["d-sleeping-crown","DEEP","The Sleeping Crown","bones","TREASURE","UNTHRONE: After Phase I, discard 1 MAGIC Item. Opposed d20+WIT vs d20+6: win the Amulet; fail, Warden's next attack has ADV.",
  [["WEAR","Keep this Room. Your first Vault attack has ADV; SEAL costs 1 extra MAGIC Item. With kept Crown of the Unking, unlock UNTHRONE."],
   ["BREAK","Discard 1 MAGIC Item. Keep this Room. At the Vault, SEAL costs 1 fewer MAGIC Item."]]],
 ["d-last-witness","DEEP","The Last Witness","ghost","ENCOUNTER","If FREED, after Phase I BARGAIN: discard 2 Items; opposed d20+WIT vs d20+6. Win: Amulet. Lose: Warden's next attack has ADV.",
  [["FREE","Lose 2 HP; keep this Room. At Vault, increase or decrease OMEN by 1 (within 1–6). After Phase I, discard this Room to attempt BARGAIN above."],
   ["SILENCE","Draw 2 Items; keep this Room. At Vault, discard it and lose 2 HP. Witness stays trapped."]]]
];
export const FATE_ROOMS=Object.freeze(rows.map(([id,stage,title,art,kind,prompt,choices])=>({
 id,stage,title,art,type:"room",copies:1,rule:prompt,flavor:"",
 v2:{kind,prompt,choices:choices.map(([label,effect])=>({label,effect})),
  roll:null,links:[],fate:true}
})));
/** Whether a retained-Room choice can actually pay its printed Item cost.
 * Shared by the physical-effect runner and the future computer-game API.
 * This is a pure legality query: it never discards or rolls anything.
 */
export function fateChoiceLegal(s,roomId,choice){
 if(![0,1].includes(choice))return false;
 if(choice===0&&["u-scribe-dust","u-bone-seed","m-ferryman-oath"].includes(roomId))
  return s.discardable(1);
 if(choice===1&&roomId==="d-sleeping-crown")
  return s.discardable(1,"MAGIC");
 return true;
}
const mark=(s,choice,item=null)=>{
 const entry={card:s.room,choice,item};
 s.keptRooms.push(entry);
 s.fateChoices.push({id:s.room.id,title:s.room.title,choice:s.room.v2.choices[choice].label});
};
const burnItem=(s,tag=null)=>s.discard(1,{tag});
const take=(s,n=1)=>s.draw(n);
const dead=(s,n)=>s.hurt(s.chooseRecipient("fate-damage"),n);
// Returned tucked objects were already counted when first drawn from the deck.
const returnTucked=(s,item)=>{if(!item)return;
 const h=s.chooseRecipient("return-tucked-item");h.inventory.push(item);
 s.consumed.delete(item);s.equip(h,item);};
const restore=(s,n)=>s.heal(s.chooseRecipient("fate-healing"),n);
// Called by ROOM_FATE on the printed choice. Item costs are checked here.
export function resolveFateChoice(s,choice){
 const id=s.room.id;
 if(![0,1].includes(choice))throw Error("Invalid fate choice on "+id);
 if(!fateChoiceLegal(s,id,choice)){
  // Keep backward compatibility for direct printed-effect calls: use the
  // affordable other choice. UI / agent legality checks prevent selecting
  // an unaffordable option in the first place.
  choice=1-choice;
  if(!fateChoiceLegal(s,id,choice))return;
 }
 let tucked=null;
 switch(id){
 case "u-cartographer":if(choice===1)take(s,2);break;
 case "u-hollow-knight":if(choice===1)take(s,2);break;
 case "u-scribe-dust":if(choice===0)burnItem(s);else take(s,2);break;
 case "u-bone-seed":if(choice===0)tucked=burnItem(s);else restore(s,3);break;
 case "m-ferryman-oath":if(choice===0)tucked=burnItem(s);else take(s,2);break;
 case "m-choir-nails":if(choice===1)take(s,2);break;
 case "m-hourglass":if(choice===1)take(s,2);break;
 case "m-drowned-banner":if(choice===0)dead(s,2);else take(s,2);break;
 case "d-sleeping-crown":if(choice===1)burnItem(s,"MAGIC");break;
 case "d-last-witness":if(choice===0)dead(s,2);else take(s,2);break;
 default:throw Error("Unknown fate Room "+id);
 }
 if(s.alive())mark(s,choice,tucked);
}
function complete(s,entry){
 const i=s.keptRooms.indexOf(entry);
 if(i!==-1)s.keptRooms.splice(i,1);
}
// Called when a new depth is first entered; effects are resolved in encounter order.
export function fateStageEntry(s,stage){
 if(stage!=="DEEP"||s.fateDeepEntered)return;
 s.fateDeepEntered=true;
 for(const entry of [...s.keptRooms]){
  const id=entry.card.id;
  if(!["u-cartographer","u-bone-seed"].includes(id))continue;
  complete(s,entry);
  if(id==="u-cartographer"){
   if(entry.choice===0)s.peek(2,true);
   else dead(s,2);
  }else if(entry.choice===0){
   returnTucked(s,entry.item);
   take(s,2);
  }else dead(s,2);
  if(!s.alive())return;
 }
}
// Return true when the Monster is dismissed before a fight.
export function fateMonsterEntry(s,monster){
 if(monster.stage!=="DEEP")return false;
 const spared=s.keptRooms.find(entry=>entry.card.id==="u-hollow-knight"&&entry.choice===0);
 if(spared){
  const chosen=s.returnChoices?.["u-hollow-knight"]||
   (s.strategy==="survival"&&s.chooseActor().hp<s.chooseActor().card.hp*.5?"escape":"save");
  if(chosen==="escape"){complete(s,spared);return true;}
  // Saving the Knight is an actual second choice, not an automatic bonus.
 }
 let dismissed=false;
 for(const entry of [...s.keptRooms]){
  if(!["u-hollow-knight","m-choir-nails"].includes(entry.card.id))continue;
  if(entry.card.id==="u-hollow-knight"&&entry.choice===0)continue;
  complete(s,entry);
  if(entry.card.id==="u-hollow-knight")s.monsterAdv=true;
  else if(entry.choice===0)s.monsterDis=true;
  else s.monsterAdv=true;
 }
 return dismissed;
}
// Vault debts and permanent modifiers resolve when the Vault is entered.
export function fateVaultEntry(s){
 const v=s.vaultModifiers;
 v.smuggleAvailable=!!s.keptRooms.find(x=>x.card.id==="d-gilded"&&x.choice===1);
 v.unthroneAvailable=false;v.bargainAvailable=false;v.wardenOpeningSkip=false;
 const crownRoom=s.keptRooms.some(x=>x.card.id==="d-crown");
 const savedKnight=s.keptRooms.find(x=>x.card.id==="u-hollow-knight"&&x.choice===0);
 if(savedKnight){complete(s,savedKnight);v.wardenOpeningSkip=true;}
 for(const entry of [...s.keptRooms]){
  const id=entry.card.id,c=entry.choice;
  if(!["u-scribe-dust","m-ferryman-oath","m-hourglass",
       "m-drowned-banner","d-sleeping-crown","d-last-witness"].includes(id))continue;
  complete(s,entry);
  switch(id){
  case "u-scribe-dust":v.sealCostDelta+=c===0?-1:1;break;
  case "m-ferryman-oath":
   if(c===0){
    if(s.returnChoices?.["m-ferryman-oath"]==="smuggle"){
     v.smuggleAvailable=true;
    }else{returnTucked(s,entry.item);restore(s,3);}
   }
   else dead(s,3);
   break;
  case "m-hourglass":v.omen=c===0?"high":"low";break;
  case "m-drowned-banner":
   if(c===0)v.wardenDamage+=3;
   else v.wardenFirstAdv=true;
   break;
  case "d-sleeping-crown":
   if(c===0){v.heroFirstAdv=true;v.sealCostDelta++;
    if(crownRoom)v.unthroneAvailable=true;}
   else v.sealCostDelta--;
   break;
  case "d-last-witness":
   if(c===0){restore(s,3);v.bargainAvailable=true;
    s.endingMemory="The witness escapes with the Amulet.";}
   else{dead(s,2);s.endingMemory="The witness remains lost beneath the dungeon.";}
   break;
  }
  if(!s.alive())return;
 }
}
