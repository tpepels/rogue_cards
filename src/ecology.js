// Physical-first Phase 5 tables: all outcomes use one d6 and printed reference.
export const ECOLOGY = {
 rat:{corpse:"rat",food:4,intrinsic:"scent",hazard:1,habitat:"SPORES",bonus:1},
 goblin:{corpse:"goblin",food:5,intrinsic:"scavenger",hazard:2,habitat:"DUST",bonus:1},
 eye:{corpse:"eye",food:2,intrinsic:"focus",hazard:3,habitat:"DARK",bonus:1},
 rust:{corpse:"rust",food:3,intrinsic:"rustproof",hazard:2,habitat:"LOCKED",bonus:1},
 wraith:{corpse:"wraith",food:1,intrinsic:"shade",hazard:4,habitat:"DARK",bonus:1},
 troll:{corpse:"troll",food:6,intrinsic:"regeneration",hazard:2,habitat:"WATER",bonus:1},
 sentinel:{corpse:null,food:0,intrinsic:null,hazard:0,habitat:"SACRED",bonus:0}
};
export const INTRINSICS=[
 {id:"scent",title:"Scent",rule:"First time you enter a room with a monster, reveal its next behaviour card (no draw)."},
 {id:"scavenger",title:"Scavenger",rule:"Once per run, gain +3 hunger when consuming a corpse."},
 {id:"focus",title:"Focus",rule:"Ignore DARK attack penalties."},
 {id:"rustproof",title:"Rustproof",rule:"Rust attacks no longer reduce your DEF."},
 {id:"shade",title:"Shade",rule:"Ignore hunger drained by the Restless Shade."},
 {id:"regeneration",title:"Regeneration",rule:"At end of every third turn, restore 1 HP."}
];
export const ECOLOGY_CARDS=[
 {id:"corpse",type:"ecology",title:"Monster Corpse",art:"bones",rule:"EAT corpse: +food hunger; roll d6 for illness and possible intrinsic. Record species and freshness.",flavor:"Something is always hungry."},
 {id:"pet",type:"ecology",title:"Faithful Dog / Instincts",art:"dog",rule:"At each turn end roll d6: 1–2 roam; 3–4 sniff; 5–6 attack the present monster for 1 damage. Pet hunger falls 1 every 3 turns.",flavor:"Not merely an extra sword."},
 {id:"prayer",type:"ecology",title:"Prayer and Favour",art:"altar",rule:"PRAY anywhere. Roll d6 + favour: 4+ heal 3 HP; otherwise lose 2 hunger. Cooldown: 6 turns.",flavor:"All gods demand patience."},
 {id:"bones",type:"ecology",title:"Bones of an Adventurer",art:"bones",rule:"Once per new run, on the first eligible room at depth 3+, roll d6: 5–6 find the last dead hero's lost item and record.",flavor:"The dungeon remembers."}
];
export const ECOLOGY_COPIES={corpse:6,pet:1,prayer:1,bones:1};
export function initEcology(s,bones=null) {
 s.intrinsics=[];
 s.corpsesEaten=0;
 s.pet={active:false,hunger:9,position:s.position,loyalty:2,alive:true,lastAction:null};
 s.prayer={favour:0,cooldown:0,lastResult:null};
 s.bonesRecord=bones&&Array.isArray(bones.items)?{
   heroId:String(bones.heroId||"unknown"),
   items:bones.items.slice(0,3).map(x=>({...x})),
   found:false,attempted:false
 }:null;
}
export function corpseFor(monster,turn){
 const e=ECOLOGY[monster?.id];return e?.corpse?{kind:"corpse",id:monster.id,created:turn,food:e.food}:null;
}
export function eatCorpse(state,index,d6,log) {
 const corpse=state.inventory[index],e=ECOLOGY[corpse.id];
 if(!e)return;
 state.inventory.splice(index,1);
 const spoiled=state.turn-corpse.created>=6;
 const roll=d6(state);
 state.hunger=Math.min(24,state.hunger+(spoiled?Math.max(1,e.food-2):e.food));
 if(roll<=e.hazard+(spoiled?1:0)){
  state.hp-=2;log("The "+corpse.id+" corpse sickens you (-2 HP).");
 }else if(roll===6&&!state.intrinsics.includes(e.intrinsic)){
  state.intrinsics.push(e.intrinsic);
  log("Intrinsic gained: "+e.intrinsic+".");
 }
 state.corpsesEaten++;
 log("Ate "+corpse.id+" corpse; hunger restored.");
}
export function pray(state,d6,log,altar=false){
 if(state.prayer.cooldown>0)return false;
 const roll=d6(state),total=roll+state.prayer.favour+(altar?1:0);
 state.prayer.cooldown=6;
 if(total>=4) {
  const heal=altar?4:3;
  state.hp=Math.min(state.maxHp,state.hp+heal);
  state.prayer.favour=Math.min(2,state.prayer.favour+1);
  state.prayer.lastResult="blessing";
  log("Prayer answered: heal "+heal+" HP. Favour +1.");
 }else{
  state.hunger=Math.max(0,state.hunger-2);
  state.prayer.favour=Math.max(-2,state.prayer.favour-1);
  state.prayer.lastResult="displeasure";
  log("Prayer unanswered: hunger -2. Favour -1.");
 }
 return true;
}
export function petTurn(state,d6,log,currentMonster){
 const pet=state.pet;
 if(!pet.active||!pet.alive)return;
 if(state.turn%3===0){
   pet.hunger=Math.max(0,pet.hunger-1);
   if(pet.hunger===0){pet.active=false;log("Your hungry dog wanders off.");return;}
 }
 if(pet.position!==state.position){pet.position=state.position;pet.lastAction="follow";log("Your dog catches up.");return;}
 const r=d6(state),monster=currentMonster();
 if(r<=2){
   pet.lastAction="roam";
   pet.loyalty=Math.max(0,pet.loyalty-1);
   log("Your dog roams and sniffs at the corners.");
 }else if(r<=4){
   pet.lastAction="sniff";pet.loyalty=Math.min(4,pet.loyalty+1);
   if(state.rooms[state.position].id==="trap"&&state.rooms[state.position].used===false)
     log("Your dog scents the old trap.");
   else log("Your dog searches the ground.");
 }else if(monster){
   pet.lastAction="attack";monster.hp--;
   log("Your dog bites "+monster.title+" for 1 damage.");
 }else {pet.lastAction="rest";log("Your dog rests nearby.");}
}
export function bonesInRoom(state,d6,log,depth) {
 const record=state.bonesRecord;
 if(!record||record.attempted||depth<3||depth>=10)return;
 record.attempted=true;
 if(d6(state)>=5&&record.items.length){
   state.rooms[state.position].bones={...record.items[0]};
   record.found=true;log("The remains of "+record.heroId+" lie here.");
 }
}
export const BONES_MAX_ITEMS=3;
export function buildBones(state){
 return {heroId:state.heroId,items:state.inventory.filter(x=>x.kind!=="corpse").slice(0,BONES_MAX_ITEMS).map(x=>({...x}))};
}
