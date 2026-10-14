/** Exact post-kill consequences shared by the scripted campaign and
 * player-controlled phase controller. Corpse eating is an optional
 * action, not an automatic consequence of winning a fight.
 */
export function consumeCorpse(s,m){
 if(!m||m.id==="sentinel"||m.stage==="FINAL"||!s.alive())
  throw Error("No edible regional Monster corpse");
 const h=s.chooseActor();if(!h)return;
 s.setActor(h);s.metrics.corpses++;
 const roll=s.die();
 if(roll<=2){
  if(["rat","crawler","mold","eye","rust","troll"].includes(m.id))
   s.apply("POISON",[],m);
  else s.apply("HURT",
   [["goblin","wraith","wisp","cultist"].includes(m.id)?"d6":"2"],m);
 }else if(roll<=4){
  if(["crawler","mold"].includes(m.id)&&m.id==="crawler")s.heal(h,2);
  else s.heal(h,m.id==="troll"||m.id==="mold"?s.die():2);
 }else{
  if(["rat","troll"].includes(m.id))s.heal(h,s.die());
  else if(["crawler","mold"].includes(m.id))h.poison=false;
  else if(["goblin","wraith","cultist"].includes(m.id))s.draw(1);
  else if(["eye","bat"].includes(m.id))s.peek(1);
  else if(m.id==="wisp")h.nextAdv++;
  else if(m.id==="rust")h.nextDefenseAdv=true;
 }
}
export function settleMonsterVictory(s,m,{warden=false}={}){
 if(!m||s.monster!==m||s.monsterHP>0)
  throw Error("Only a defeated active Monster may settle its reward");
 if(!s.banished)s.metrics.kills++;
 const stolen=s.stashedMonsterItems||[];
 if(stolen.length){
  s.stashedMonsterItems=stolen.filter(x=>x.monsterId!==m.id);
  if(!s.banished&&s.alive())
   for(const entry of stolen.filter(x=>x.monsterId===m.id)){
    s.consumed.delete(entry.card);
    s.add(s.chooseRecipient("recover-monster-stolen-item"),entry.card);
   }
  else for(const entry of stolen.filter(x=>x.monsterId===m.id)){
   s.discardPile.push(entry.card);s.consumed.add(entry.card);
  }
 }
 if(s.pendingReward&&s.alive())s.draw(s.pendingReward);
 if(s.pendingFightHeal&&s.alive())s.healParty(s.amount(s.pendingFightHeal));
 s.pendingReward=0;s.pendingFightHeal=null;
 s.monster=null;s.monsterHP=0;
}
