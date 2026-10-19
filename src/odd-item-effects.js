/**
 * Canonical, opt-in effects for the eighteen unusual Everything Goes Items.
 * Every effect below is directly driven by printed Item timing.
 * No blanket roll bonuses, global Item loot or extra encounter procedure.
 */
const owned=(h,id)=>h?.inventory.find(c=>c.id===id)||null;
const spend=(s,h,card,context,perform)=>s.directItem(h,card,context,()=>{
 s.consume(h,card);perform?.();return true;
});
const decision=(s,context,modes)=>s.chooseEffect(context,modes,"save");
const offer=(s,h,card,context,alternatives)=>{
 if(!card||h.hp<=0)return "save";
 // This is a REAL timing window: record opportunity even if the Hero
 // declines to spend the card. Acquisitions and uses alone are biased.
 if(alternatives.length)
  s.noteOptions([{card,mode:context,phase:"odd-item"}]);
 return decision(s,"odd-item:"+card.id+":"+context,["save",...alternatives]);
};

/** A physical d6 can be modified immediately after its result is seen.
 * One-use tools are spent only if chosen; Hooked Chain resets at each Room.
 * Caller guards against recursive prompts while extra dice are rolled.
 */
export function modifyOddDie(s,sides,value,{hero=null,attack=false}={}){
 let face=value;
 for(const h of s.living()){
  if(sides===6){
   let card=owned(h,"odd-loaded-coin");
   let choice=offer(s,h,card,"shift-d6",[
    ...(face>1?["down"]:[]),...(face<6?["up"]:[])]);
   if(choice!=="save")spend(s,h,card,"shift-d6",()=>{
    face+=choice==="up"?1:-1;
   });
   card=owned(h,"odd-crooked-die");
   if(offer(s,h,card,"reverse-d6",["flip"])==="flip")
    spend(s,h,card,"reverse-d6",()=>{face=7-face;});
   card=owned(h,"odd-witchbones");
   choice=offer(s,h,card,"middle-d6",["three","four"]);
   if(choice!=="save")spend(s,h,card,"middle-d6",()=>{
    face=choice==="three"?3:4;
   });
   card=owned(h,"odd-hooked-chain");
   if(s.room&&card&&!h.used.has(card)&&
    offer(s,h,card,"once-per-room-d6",face>1?["down"]:[])==="down"){
    s.directItem(h,card,"once-per-room-d6",()=>{
     h.used.add(card);face--;return true;
    });
   }
  }
  // "Your d20" excludes Monster attack and opposing-check d20 dice.
  if(sides===20&&hero===h){
   const mirror=owned(h,"odd-bent-mirror");
   if(offer(s,h,mirror,"reroll-d20",["reroll"])==="reroll")
    spend(s,h,mirror,"reroll-d20",()=>{face=s.die(20);});
   if(attack&&h.slots.weapon?.id==="odd-trick-knife"&&!h.trickKnifeUsed){
    const knife=h.slots.weapon;
    const choice=offer(s,h,knife,"once-per-fight-d20",[
     ...(face>1?["down"]:[]),...(face<20?["up"]:[])]);
    if(choice!=="save"){
     s.directItem(h,knife,"once-per-fight-d20",()=>{
      face+=choice==="up"?1:-1;h.trickKnifeUsed=true;return true;
     });
    }
   }
  }
  if((sides===6||sides===20&&hero===h)&&owned(h,"odd-chaos-idol")){
   const idol=owned(h,"odd-chaos-idol");
   if(offer(s,h,idol,"reroll-twice",["reroll-twice"])==="reroll-twice")
    spend(s,h,idol,"reroll-twice",()=>{
     s.die(sides);face=s.die(sides);
    });
  }
 }
 return face;
}

/** A player's meaningful d20: Room WIT, attack or Monster parley.
 * Other combat d20 rolls and Monster opposition cannot consume Hero Items.
 */
export function rollOddHeroD20(s,h,{adv=false,dis=false,attack=false}={}){
 const link=s.redString;
 if(link&&link.face!==null&&link.target===s.heroes.indexOf(h)){
  s.redString=null;return link.face;
 }
 const lucky=owned(h,"odd-lucky-thread");
 if(offer(s,h,lucky,"before-hero-d20",["adv"])==="adv"){
  spend(s,h,lucky,"before-hero-d20");adv=true;
 }
 const first=s.die(20);
 let face=adv&&!dis?Math.max(first,s.die(20)):
  dis&&!adv?Math.min(first,s.die(20)):first;
 // No recursive prompt when an Item rethrows dice or incurs an Item cost.
 if(!s._oddDieGuard){
  s._oddDieGuard=true;
  try{face=modifyOddDie(s,20,face,{hero:h,attack});}
  finally{s._oddDieGuard=false;}
 }
 if(link&&link.source===s.heroes.indexOf(h)&&link.face===null)
  link.face=face;
 return face;
}

/** Jinx Powder acts BEFORE the behaviour die (not after learning its face). */
export function rollOddMonsterBehavior(s){
 const eligible=s.living().flatMap(h=>{
  const card=owned(h,"odd-jinx-powder");return card?[{h,card}]:[];
 });
 for(const {h,card} of eligible){
  if(offer(s,h,card,"before-behaviour-d6",["jinx"])==="jinx"){
   spend(s,h,card,"before-behaviour-d6");
   return Math.min(s.die(),s.die());
  }
 }
 return s.die();
}

/** Grave Salt is a free reaction before an attack on a CURSED foe. */
export function offerGraveSalt(s,h){
 if(!s.monster?.v2?.tags?.includes("CURSED")||h.graveSalt)return;
 const salt=owned(h,"odd-grave-salt");
 if(offer(s,h,salt,"before-attack",["use"])==="use")
  spend(s,h,salt,"before-attack",()=>{h.graveSalt=true;});
}

/** Outside combat actions never consume a combat turn or invent new dice.
 * New physical Items are handed to an actual owner and discarded once.
 */
export function activateOddTool(s,h,card){
 if(!card||!h?.inventory.includes(card)||h.hp<=0)return false;
 const id=card.id;
 if(id==="odd-fever-candle"){
  spend(s,h,card,"fever-candle",()=>{
   s.witBonus+=3;s.hurt(h,1);
  });
 }else if(id==="odd-sun-charm"){
  spend(s,h,card,"sun-charm",()=>{
   h.poison=false;h.nextDis=0;h.nextWitDis=0;
   h.nextDefenseDis=0;h.nextDarknessDis=0;
  });
 }else if(id==="odd-mad-compass"){
  spend(s,h,card,"mad-compass",()=>s.peek(2,true));
 }else if(id==="odd-thorn-tonic"){
  spend(s,h,card,"thorn-tonic",()=>{
   s.heal(h,3,card);h.nextWitDis=(h.nextWitDis||0)+1;
  });
 }else if(id==="odd-moon-lens"){
  spend(s,h,card,"moon-lens",()=>{
   s.moonLensFace={roomId:s.room.id,face:s.die()};
  });
 }else if(id==="odd-bone-dice"){
  spend(s,h,card,"bone-dice",()=>{
   const face=s.die();
   if(face<=2)s.hurt(h,1);
   else if(face<=4)s.draw();
   else s.heal(h,2,card);
  });
 }else if(id==="odd-echo-bell"){
  if(!s.keptRooms.length)return false;
  const choices=[...new Set(s.keptRooms.map(x=>x.card.id))];
  const chosen=s.chooseEffect("echo-bell-trophy",
   choices,choices[0]);
  const trophy=s.keptRooms.find(x=>x.card.id===chosen);
  if(!trophy)return false;
  spend(s,h,card,"echo-bell",()=>{
   // A second physical-use token, not a blanket repeatable KEEP rule.
   s.keptRooms.push({...trophy,echoCopy:true});
  });
 }else if(id==="odd-red-string"){
  const target=s.living().find(x=>x!==h);
  if(!target)return false;
  spend(s,h,card,"red-string",()=>{
   s.redString={source:s.heroes.indexOf(h),
    target:s.heroes.indexOf(target),face:null};
  });
 }else return false;
 return true;
}
