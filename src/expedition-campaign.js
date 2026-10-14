/** Full-effect, policy-driven physical expedition runner.
 * Results measure these explicit play policies, NOT "optimal" human players.
 * All d6 Item/Room operations go through the checked card transcriptions.
 */
import {HEROES,ROOMS,VAULT,WARDEN,WARDEN_FURY} from "./tabletop-data.js";
import {ExpeditionState,strategies,roomPolicies} from "./expedition-runtime.js";
import {ROOM_EFFECTS} from "./room-effect-model.js";
import {fateChoiceLegal} from "./room-fates.js";
import {verifyObjectCoverage} from "./effect-model.js";
import {planRoom,planParley,planCombat,planSeal,PLANNER_RISKS} from "./decision-planner.js";
import {itemOptions} from "./item-access.js";
import {playerAttack,monsterRespond,blessBeforeD20,executeItemOption,engraveElbereth}
 from "./engine/combat.js";
import {verifyPrintedData} from "./playtest.js";
import {seal,sealCost} from "./engine/vault.js";
export {seal,sealCost} from "./engine/vault.js";
export {playerAttack,monsterRespond} from "./engine/combat.js";
import {validateAgentConfig,agentPlanRoom,agentPlanParley,
 agentPlanCombat,agentPlanSeal} from "./research-agent.js";
const hasTag=(x,tag)=>!!x?.v2?.tags?.includes(tag);
const isAlive=s=>s.alive();
export const researchPolicies=Object.freeze(["none","parley","seal","conserve","rooms","adaptive","planner","agent"]);
// Independent opt-in switches. An empty set must execute exactly the existing
// scripted policy; the all-enabled set is the existing cautious/balanced/bold planner.
export const PLANNER_FEATURES=Object.freeze(["room","combat","parley","seal"]);
const plannerUses=(s,feature)=>(s.researchPolicy==="planner"||
 s.researchPolicy==="agent")&&s.plannerFeatures.has(feature);
const researchUses=(s,feature)=>s.researchPolicy===feature||s.researchPolicy==="adaptive";
function recordPlan(s,kind,detail){
 const d=s.plannerDecisions; if(!d)return;
 const key=kind+"Evaluated";d[key]=(d[key]||0)+1;
 const choice=(kind==="room"?"choice"+detail.choice:kind==="parley"||kind==="seal"?
  (detail.attempt?"attempt":"decline"):detail.action);
 const selected=kind+"_"+choice;
 d[selected]=(d[selected]||0)+1;
 if(detail.reason?.startsWith("full_effect_")){
  const metric=kind==="room"?"rolloutRoomDecisions":"rolloutCombatDecisions";
  d[metric]=(d[metric]||0)+1;
  d.rolloutSamples=(d.rolloutSamples||0)+(detail.samples||0);
 }
 if(kind==="combat"){
  if(detail.forcedTarget){
   d.targetForced=(d.targetForced||0)+1;
   d["targetForced_"+detail.forcedTarget]=(d["targetForced_"+detail.forcedTarget]||0)+1;
  }
  d.combatEligibleActions=(d.combatEligibleActions||0)+(detail.options||0);
  const label=detail.options>0?"combat_with_legal_item":"combat_no_legal_item";
  d[label]=(d[label]||0)+1;
 }
 if(s.plannerTrace.length<12)s.plannerTrace.push({
  room:s.room?.id||null,kind,choice,
  scores:detail.scores||null,
  margin:detail.margin??null,
  probability:detail.chance??detail.sealChance??null,
  score:detail.score??null,
  attackScore:detail.attackScore??null,
  fightChance:detail.fightChance??null,
  cost:detail.cost??null
 });
}

const partyHpFraction=s=>s.living().reduce((t,h)=>t+h.hp,0)/
 Math.max(1,s.living().reduce((t,h)=>t+h.card.hp,0));
// This is an experimental decision heuristic, not an additional tabletop rule.
function shouldTryResearchParley(s,m){
 const hp=partyHpFraction(s);
 if(hp>.85&&m.atk<5&&m.hp<12)return false;
 if(["rat","eye","rust"].includes(m.id))return s.discardable(2);
 if(["goblin","troll"].includes(m.id))return s.discardable(3);
 if(m.id==="sentinel")return s.discardable(3,"METAL");
 if(["bat","wisp"].includes(m.id))return bestWit(s)?.card.wit>=2;
 if(["crawler","mold"].includes(m.id))return hp<.45&&
  s.living().some(h=>h.inventory.some(o=>o.v2.kind==="POTION"));
 if(["wraith","cultist"].includes(m.id))return hp>.65&&s.anyEquippedTag("CURSED");
 return false;
}
const bestWit=s=>[...s.living()].sort((a,b)=>b.card.wit-a.card.wit)[0];
const rollD20=(s,{adv=false,dis=false}={})=>{
 const a=s.die(20);return adv&&!dis?Math.max(a,s.die(20)):
  dis&&!adv?Math.min(a,s.die(20)):a;
};
const chooseRoom=s=>{
 const room=s.room,choices=ROOM_EFFECTS[room.id].choices,actor=s.chooseActor();
 if(room.stage==="FINAL")return 0;
 const cost=(ops)=>ops.reduce((n,op)=>n+(/^(?:COST|DISCARD):(\d+)$/.exec(op)?.[1]*1||0),0);
 const affordable=ops=>s.discardable(cost(ops))&&(
  !ops.includes("CLEANSE_COST")||s.partyCount("CURSED")>0);
 const choiceOK=i=>affordable(choices[i])&&(
   !choices[i].some(op=>op==="FUNGUS_BURN"||op==="CHOIR_SILENCE"||op==="BOOKCASE_FIRE_OR_SCROLL")||
    s.has("torch")||s.has("lantern-heart")||s.partyCount("FIRE")>0||s.partyCount("MAGIC")>0);
 const ok0=choiceOK(0)&&(!room.v2.fate||fateChoiceLegal(s,room.id,0));
 const ok1=choiceOK(1)&&(!room.v2.fate||fateChoiceLegal(s,room.id,1));
 for(const i of [0,1])if(i===0?ok0:ok1){
  const key=room.id+":"+i;
  s.metrics.roomOptionAvailable[key]=(s.metrics.roomOptionAvailable[key]||0)+1;
 }
 if(s.forceRoomChoice?.id===room.id){
  s.choiceComparison={
   seen:true,bothLegal:ok0&&ok1,
   hp:s.heroes.map(h=>h.hp),
   inventory:s.heroes.map(h=>h.inventory.map(o=>o.id).sort()),
   pendingMonster:s.monster?.id||null
  };
  if(ok0&&ok1)return s.forceRoomChoice.choice;
 }
 // The rollout agent must compare retained Rooms through their future effects.
 // Earlier policies still use their documented fate-choice preferences.
 if(room.v2.fate&&plannerUses(s,"room")&&s.researchPolicy==="agent"&&
    s.agentConfig?.planning==="rollout"&&s.agentConfig.budget>0){
  if(!ok0&&!ok1)return null;
  const result=agentPlanRoom(s,[ok0,ok1]);
  recordPlan(s,"room",result);
  s.plannerDecisions.fateRoomsPlanned=(s.plannerDecisions.fateRoomsPlanned||0)+1;
  return result.choice;
 }
 // Longer-term Room choices are assessed by policy, not short-horizon Room utilities.
 if(room.v2.fate){
  if(!ok0&&!ok1)return null;
  if(s.roomPolicy==="uniform")return ok0&&ok1?s.die(2)-1:ok0?0:1;
  if(s.roomPolicy==="second-when-legal")return ok1?1:0;
  const desired=s.strategy==="treasure"?1:0;
  return desired===0?(ok0?0:1):(ok1?1:0);
 }
 if(!ok0&&!ok1)return null;
 if(plannerUses(s,"room")){
  const result=s.researchPolicy==="agent"?agentPlanRoom(s,[ok0,ok1]):
   planRoom(s,[ok0,ok1]);
  recordPlan(s,"room",result);
  return result.choice;
 }
 if(s.roomPolicy==="second-when-legal")return ok1?1:0;
 if(s.roomPolicy==="uniform")return ok0&&ok1?s.die(2)-1:ok1?1:0;
 const hpFrac=actor.hp/actor.card.hp;
 if(s.roomPolicy==="contextual"){
  const score=ops=>{
   const text=ops.join(" "),items=s.living().reduce((n,h)=>n+h.inventory.length,0);
   const price=ops.reduce((n,op)=>n+Number(/^(?:COST|DISCARD):(\d+)$/.exec(op)?.[1]||0),0);
   let val=-price*(s.strategy==="seal"?4:2);
   if(/HEAL|CURE/.test(text))val+=hpFrac<.7?8:1;
   if(/DRAW|TRADE|FIGHT_REWARD/.test(text))val+=items<4?7:3;
   if(/RECHARGE/.test(text))val+=s.exhaustedWand()?8:-2;
   if(/CLEANSE/.test(text))val+=s.anyEquippedTag("CURSED")?7:-3;
   if(/BANISH|BRIBE|SILENCE/.test(text))val+=hpFrac<.75?5:2;
   if(/CHECK_WIT/.test(text))val+=Math.max(...s.living().map(h=>h.card.wit))>=3?4:0;
   if(/ROLL_ROOM_RISK|ROLL_ROOM_COST_REROLL/.test(text))val+=hpFrac<.6?-8:1;
   if(/FIGHT/.test(text))val+=hpFrac<.6?-6:0;
   return val;
  };
  return !ok0?1:!ok1?0:score(choices[1])>score(choices[0])?1:0;
 }
 const b=choices[1].join(" ");
 let desired=0;
 if(s.strategy==="survival"&&hpFrac<.65&&/HEAL/.test(b))desired=1;
 if(s.strategy==="magic"&&s.exhaustedWand()&&(/RECHARGE/.test(b)||room.v2.kind==="SHRINE"))desired=1;
 if(s.strategy==="seal"&&/COST:2/.test(b))desired=0;
 if(s.strategy==="treasure"&&/DRAW:2|DRAW:3|FIGHT_REWARD:[23]/.test(b)&&hpFrac>.55)desired=1;
 if(s.strategy==="negotiation"&&(/BANISH|BRIBE|SILENCE|CHECK_WIT|FUNGUS_BURN/.test(b)))desired=1;
 if(["u-nest","m-crypt","d-gate"].includes(room.id)&&s.strategy!=="treasure")desired=0;
 if(!choiceOK(desired))desired=1-desired;
 if(!choiceOK(desired))return null;
 return desired;
};
function rollItem(s,h,card,{face=null}={}){
 s.setActor(h);return s.activate(h,card,{face});
}
function itemIn(s,h,id){return h.inventory.find(o=>o.id===id);}
function itemWith(s,h,kind){return h.inventory.find(o=>o.v2.kind===kind);}
function setupPrepared(s){
 const h=s.chooseActor();s.setActor(h);
 for(const x of s.living()){
  s.noteOptions(itemOptions(s,x,"explore"));
  s.noteOptions(itemOptions(s,x,"passive"));
 }
 // ONCE PER ROOM scout activations, not new universal actions.
 for(const x of s.heroes){
  if(x.hp<=0)continue;
  for(const id of ["raven","ring-eye","skull","chalk"]){
   const o=itemIn(s,x,id);if(o&&!x.used.has(o)&&
    (o.v2.kind!=="RING"||x.slots.ring===o)&&
    (s.strategy==="treasure"||s.strategy==="seal"))
    rollItem(s,x,o);
  }
  const gp=itemIn(s,x,"goblin-pet"),br=itemIn(s,x,"ring-bargain");
  if(s.room.v2.kind==="ENCOUNTER"){
   if(gp&&x.slots.companion===gp)rollItem(s,x,gp);
   const coin=itemIn(s,x,"coin");
   if(coin&&s.strategy!=="seal"){rollItem(s,x,coin);if(x.inventory.includes(coin))s.consume(x,coin);}
   if(br&&x.slots.ring===br)rollItem(s,x,br);
   const wm=itemIn(s,x,"wand-market");
   if(wm&&!s.exhausted.has(wm)&&s.strategy!=="seal")rollItem(s,x,wm);
  }
  if(s.room.v2.kind==="SHRINE"&&s.anyEquippedTag("CURSED")){
   const needle=itemIn(s,x,"needle");
   if(needle&&s.strategy==="survival"){s.consume(x,needle);s.apply("CLEANSE",[],null);}
  }
  const sight=itemIn(s,x,"scroll-reveal");
  if(sight&&(s.strategy==="treasure"||s.strategy==="seal")&&s.room.stage!=="FINAL")
   rollItem(s,x,sight);
  // Misprint can be read outside combat; the old simulator had no branch.
  if(plannerUses(s,"combat")&&s.room.stage!=="FINAL"&&!s.monster&&
      x.hp<=x.card.hp*.6&&x.inventory.length<=3){
   const chaos=itemIn(s,x,"scroll-mischief");
   if(chaos)s.activate(x,chaos,{mode:"exploration-action"});
  }
  if(x.poison){
   for(const id of ["moth","ring-spores","needle"]){
    const o=itemIn(s,x,id);if(o&&(!["ring-spores"].includes(id)||x.slots.ring===o))
     {rollItem(s,x,o);if(!x.poison)break;}
   }
  }
  if(x.hp<=x.card.hp-4){
   const needle=itemIn(s,x,"needle");
   if(needle&&!x.used.has(needle))rollItem(s,x,needle);
   for(const kind of ["POTION"]){
    const potion=itemWith(s,x,kind);
    if(potion&&x.hp<=x.card.hp*.65)rollItem(s,x,potion);
   }
  }
 }
 s.setActor(h);
}
function finishRoom(s){
 for(const h of s.heroes){
  if(h.hp>0)s.noteOptions(itemOptions(s,h,"between-rooms"));
  if(h.hp<=0)continue;
  // Outside combat the player may use a Potion. No once-per-room Potion limit.
  while(h.hp<=h.card.hp*.5&&h.inventory.some(o=>o.v2.kind==="POTION")){
   const p=h.inventory.find(o=>o.v2.kind==="POTION");const before=h.inventory.length;
   rollItem(s,h,p);
   if(h.inventory.length>=before||!s.alive())break;
  }
 }
 s.endRoom();
}
function actRoom(s,{prepared=false,choiceOverride=null}={}){
 const room=s.room;
 if(s.skipRoom)return;
 if(!prepared){
  const entry=room.v2.prompt.match(/Draw an? (UPPER|MIDDLE|DEEP) Monster/);
  if(entry)s.drawMonster();
  setupPrepared(s);
  for(const h of s.living())s.noteOptions(itemOptions(s,h,"room-choice"));
 }
 const n=choiceOverride===null?chooseRoom(s):choiceOverride;
 if(n===null)return;
 s.metrics.roomChoices[room.id+":"+n]=(s.metrics.roomChoices[room.id+":"+n]||0)+1;
 const ops=ROOM_EFFECTS[room.id].choices[n];
 s.setActor(s.chooseActor());
 // The Staff or the printed Shrine option replaces the single Room choice:
 // it cannot grant both Room rewards and a Wand recharge.
 if(room.v2.kind==="SHRINE"&&!room.v2.fate&&s.exhaustedWand()&&s.strategy==="magic"){
  if(s.has("staff")||!ops.some(op=>op==="RECHARGE")){s.recharge();return;}
 }
 // A reusable crowbar, one-use Scroll, or exhausted-on-use Wand can
 // replace the printed lock roll, never add an extra Room result.
 const locked=["u-gate","u-mimic","m-vault","d-last-chest"];
 if(n===0&&locked.includes(room.id)&&["treasure","magic"].includes(s.strategy)){
  for(const id of ["scroll-unlock","wand-door","crowbar"]){
   const owner=s.own(id),card=owner&&itemIn(s,owner,id);
   if(card&&!(card.v2.kind==="WAND"&&s.exhausted.has(card))){
    s.activate(owner,card);return;
   }
  }
 }
 if(room.id==="m-fungus"&&n===0&&s.has("spore-jar")&&s.strategy==="survival"){
  const owner=s.own("spore-jar"),card=itemIn(s,owner,"spore-jar");
  s.consume(owner,card);s.heal(owner,s.die());return;
 }
 for(const op of ops){
  const [kind,...args]=op.split(":");s.apply(kind,args,room);
 }
 if(s.alive()&&["m-beetle","m-treasure"].includes(room.id)&&
    (room.id==="m-beetle"||n===1))
  s.keptRooms.push({card:room,choice:n});
 if(room.id==="d-bazaar"&&s.alive()){
  const beetle=s.keptRooms.find(x=>x.card.id==="m-beetle");
  if(beetle){
   s.keptRooms.splice(s.keptRooms.indexOf(beetle),1);
   if(beetle.choice===0)s.draw();
   else if(s.discardable())s.discard();
   else s.hurt(s.chooseActor(),2);
  }
 }
}
// Deliberately require the printed parley cost/roll, and never grant a corpse.
function attemptParley(s,m,forced=null){
 if(forced===false)return false;
 const defaultParley=["negotiation","survival","seal"].includes(s.strategy);
 const heuristicParley=!defaultParley&&["magic","treasure"].includes(s.strategy)&&
  researchUses(s,"parley");
 const planner=plannerUses(s,"parley");
 if(m.stage==="FINAL"||forced!==true&&
  (!defaultParley&&!s.researchAllowParley&&!heuristicParley&&!planner))
  return false;
 if(forced!==true&&planner){
  const selection=s.researchPolicy==="agent"?agentPlanParley(s,m):
   planParley(s,m);
  recordPlan(s,"parley",selection);
  if(!selection.attempt)return false;
 }
 if(forced!==true&&heuristicParley){
  s.researchDecisions.parleyConsidered++;
  if(!shouldTryResearchParley(s,m))return false;
  s.researchDecisions.parleySelected++;
 }
 const h=bestWit(s);if(!h)return false;
 s.setActor(h);
 const cost=(n,tag=null)=>s.discardable(n,tag);
 const pay=(n,tag=null)=>{if(!cost(n,tag))return false;s.discard(n,{tag});return true;};
 let success=false;
 switch(m.id){
 case "rat":success=pay(1);break;
 case "goblin":success=pay(2);if(success){
  const owner=s.chooseActor();if(!owner.slots.companion){owner.recruitedGoblin=true;s.temporaryCompanions.push("goblin");}
 }break;
 case "crawler":{const potion=s.heroes.find(x=>x.inventory.some(o=>o.v2.kind==="POTION"));
  if(potion){s.consume(potion,potion.inventory.find(o=>o.v2.kind==="POTION"));success=true;}break;}
 case "bat":case "wisp":{
  const difficulty=m.id==="bat"?3:5;
  const boon=blessBeforeD20(s,h);
  let rogueAdv=false,rogueDis=false,rogueReward=false;
  if(h.card.id==="rogue"&&!h.used.has("hero")){
   h.used.add("hero");const trick=s.die();
   rogueDis=trick<=2;rogueAdv=trick>=3;rogueReward=trick>=5;
  }
  const r=s.rerollIfKept(h,rollD20(s,{adv:boon.adv||rogueAdv,dis:h.poison||h.slots.armour?.id==="mail"||rogueDis}));
  const opp=s.die(20);
  success=r===20||(r!==1&&r+h.card.wit+boon.bonus>opp+difficulty);
  if(success&&rogueReward)s.draw();
  if(success&&m.id==="wisp")s.peek(1);
  break;
 }
 case "troll":success=pay(2);break;
 case "eye":success=pay(1);break;
 case "mold":{const potion=s.heroes.find(x=>x.inventory.some(o=>o.v2.kind==="POTION"));
  if(potion){s.consume(potion,potion.inventory.find(o=>o.v2.kind==="POTION"));success=true;}break;}
 case "wraith":success=s.anyEquippedTag("CURSED");
  if(success)s.hurt(h,s.die());break;
 case "rust":success=pay(1,"METAL");if(success)s.draw();break;
 case "cultist":success=s.anyEquippedTag("CURSED");
  if(success){s.hurt(h,s.die());s.draw();}break;
 case "sentinel":success=pay(2,"METAL");break;
 default:throw Error("Monster missing parley "+m.id);
 }
 s.metrics.negotiations++;
 if(success){s.metrics.negotiationsWon++;s.metrics.banishments++;
  s.monster=null;s.monsterHP=0;return true;}
 return false;
}
function eatCorpse(s,m){
 if(m.id==="sentinel"||!s.alive())return;
 const h=s.chooseActor();if(!h)return;
 const hungry=h.hp<h.card.hp*.60||h.poison;
 if(!hungry||s.strategy==="seal"&&h.hp>h.card.hp*.35)return;
 s.setActor(h);s.metrics.corpses++;
 const roll=s.die();
 if(roll<=2){
  if(["rat","crawler","mold","eye","rust","troll"].includes(m.id))s.apply("POISON",[],m);
  else s.apply("HURT",[["goblin","wraith","wisp","cultist"].includes(m.id)?"d6":"2"],m);
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
// Responsible for pre-attack Hero and gear triggers.
function useItemsInCombat(s,h){
 if(!s.monster||h.hp<=0)return false;
 s.setActor(h);
 const eligible=itemOptions(s,h,"combat");
 s.noteOptions(eligible);
 // Existing emergency-Potion autopilot is deliberately retained for both
 // baseline and planner. The planner evaluates other usable Potions normally.
 // Unlike the legacy scripted policy, the research agent evaluates a
 // Potion or recovery tool alongside every other legal combat action.
 if(s.researchPolicy!=="agent"&&h.hp<h.card.hp*.4){
  const p=h.inventory.find(o=>o.v2.kind==="POTION");
  if(p)return s.activate(h,p,{mode:"emergency"});
  for(const id of ["needle"]){
   const x=itemIn(s,h,id);
   if(x&&!h.used.has(x)){s.activate(h,x,{mode:"emergency"});return true;}
  }
 }
 if(plannerUses(s,"combat")){
  const decision=s.researchPolicy==="agent"?agentPlanCombat(s,h):
   planCombat(s,h,{
    trial:s.itemTrial||"normal",focus:s.itemFocus||null
   });
  recordPlan(s,"combat",decision);
  if(decision.action==="item")
   return executeItemOption(s,h,decision);
  if(decision.action==="elbereth")
   return engraveElbereth(s,h,{mode:decision.mode}).legal;
  return false;
 }
 // The legacy policy is unchanged, including its preference ordering.
 if(s.strategy==="survival"&&s.monsterHP<8)return false;
 if(s.strategy==="magic"&&researchUses(s,"conserve")&&
  s.monster.stage!=="FINAL"&&s.monsterHP<=6&&h.hp>=h.card.hp*.4){
  s.researchDecisions.spellsReserved++;
  return false;
 }
 const monsterThreat=s.monster.hp>=10||s.monster.stage==="FINAL";
 if(s.strategy==="magic"&&["u-lamp","d-shadow","m-crypt"].includes(s.room?.id)){
  const torch=itemIn(s,h,"torch");
  if(torch&&s.monsterSkip===0){
   s.directItem(h,torch,"torch-skip",()=>{
    s.consume(h,torch);s.monsterSkip++;return true;});return true;
  }
 }
 if(s.strategy==="magic"&&s.exhaustedWand()){
  const lantern=itemIn(s,h,"lantern-heart");
  if(lantern){
   s.directItem(h,lantern,"lantern-recharge",()=>{
    s.consume(h,lantern);s.recharge();return true;});return true;
  }
 }
 if(!monsterThreat&&s.strategy!=="magic")return false;
 const names=s.strategy==="seal"?
  ["wand-sparks","wand-frost","wand-turn","wand-morph","spore-jar"]:
  ["scroll-last","scroll-lightning","scroll-flame","wand-sparks","wand-frost",
   "scroll-banish","wand-turn","scroll-frost","wand-morph","scroll-mischief","spore-jar"];
 for(const id of names){
  const card=itemIn(s,h,id);
  if(!card)continue;
  if(card.v2.kind==="WAND"&&s.exhausted.has(card))continue;
  if(card.id==="spore-jar"){s.activate(h,card);s.consume(h,card);return true;}
  s.activate(h,card);return true;
 }
 // A Wand can be deliberately sacrificed for its highest band.
 if(s.monster.stage==="FINAL"&&h.hp>6&&s.strategy==="magic"){
  const wand=itemOptions(s,h,"combat").find(o=>o.mode==="overcharge")?.card;
  if(wand){s.directItem(h,wand,"overcharge",()=>{
   s.metrics.overcharges++;s.hurt(h,s.die());
   s.activate(h,wand,{face:6,record:false});
   if(h.inventory.includes(wand))s.consume(h,wand);
   return true;});return true;}
 }
 return false;
}
function fight(s,{warden=false,continuation=false,firstHeroIndex=0,
  firstDecision=null,maxHeroActions=Infinity}={}){
 if(!s.monster||!s.alive())return false;
 if(!continuation){s.metrics.battles++;s.trollScorched=false;}
 const m=s.monster,threshold=warden&&m.id==="warden"?10:0;
 let turns=0,actions=0,truncated=false;
 while(s.alive()&&s.monsterHP>threshold&&turns<300){
  turns++;
  for(let i=turns===1?firstHeroIndex:0;i<s.heroes.length;i++){
   const hero=s.heroes[i];
   if(hero.hp<=0||s.monsterHP<=threshold)continue;
   if(firstDecision!==null){
    const forced=firstDecision;
    firstDecision=null;
    if(forced.action==="item"){
     s.setActor(hero);
     const option=itemOptions(s,hero,"combat")[forced.itemIndex];
     if(!option||!executeItemOption(s,hero,option))
      throw Error("Rollout tried illegal combat Item option");
    }else if(forced.action==="attack")playerAttack(s,hero);
    else if(forced.action==="elbereth"){
     if(!engraveElbereth(s,hero,{mode:forced.mode}).legal)
      throw Error("Illegal rollout Elbereth");
    }else throw Error("Bad rollout combat choice "+forced.action);
   }else if(s.strategy==="survival"&&s.monster?.stage!=="FINAL"&&
      s.monster?.id!=="sentinel"&&s.elberethAttempts<1&&
      hero.hp<=Math.floor(hero.card.hp*.22)&&s.monsterHP>6){
     engraveElbereth(s,hero,{mode:"ward"});
    }else if(!useItemsInCombat(s,hero))playerAttack(s,hero);
   actions++;
   if(s.monsterHP>threshold&&s.alive())monsterRespond(s,hero);
   if(!s.alive()||s.monsterHP<=threshold)break;
   if(actions>=maxHeroActions){truncated=true;break;}
  }
  if(truncated)break;
 }
 s.metrics.rounds+=turns;
 // Rollout cutoffs retain the living Monster and its state. The ordinary
 // combat simulation never truncates: maxHeroActions defaults to Infinity.
 if(truncated)return null;
 if(turns>=300)s.metrics.roundLimit=true;
 const completed=s.monsterHP<=threshold;
 if(completed&&threshold===0){
  if(!s.banished)s.metrics.kills++;
  if(!s.banished&&!warden)eatCorpse(s,m);
  if(s.pendingReward&&s.alive())s.draw(s.pendingReward);
  if(s.pendingFightHeal&&s.alive())s.healParty(s.amount(s.pendingFightHeal));
  s.pendingReward=0;s.pendingFightHeal=null;
 }
 s.monster=null;
 return completed&&s.alive();
}
function finishMonsters(s){
 while(s.alive()&&(s.monster||s.monsterQueue.length)){
  if(!s.monster){
   const m=s.monsterQueue.shift();s.monster=m;s.monsterHP=m.hp;s.banished=false;
  }
  if(attemptParley(s,s.monster))continue;
  if(!fight(s))return false;
 }
 return s.alive();
}
/** Resolve upcoming Rooms using the same real effect engine as an ordinary
 * expedition. Called only by isolated research forks. Setting a finite
 * horizon does not secretly roll dice or pretend a Room was completed.
 */
function advanceRolloutRooms(s,maxRooms){
 // Budget counts ordinary Rooms, exactly as the live expedition does.
 // CORRIDOR cards reveal paths but do not consume one of the 3 stage
 // progress slots. Counting them against the horizon would incorrectly
 // call a 9-Room search "full expedition" before reaching the Vault.
 let visited=0,steps=0;
 const available=()=>["UPPER","MIDDLE","DEEP"].find(stage=>
  s.rooms[stage].length&&s.stageProgress[stage]<3);
 while(s.alive()&&visited<maxRooms&&available()){
  // A protective cap prevents an accidental recurring corridor loop.
  // Do not fabricate a win/loss if the cap is reached: score nonterminal.
  if(++steps>128)return {complete:false,state:s,
   roomsAdvanced:visited,corridorLimit:true};
  const stage=available(),room=s.rooms[stage].shift();
  s.beginRoom(room);
  actRoom(s);
  if(!s.alive()||!finishMonsters(s))return {complete:true,state:s,won:false};
  finishRoom(s);
  if(!s.room.v2.special?.corridor){
   visited++;s.metrics.cleared++;s.stageProgress[stage]++;
  }
  if(s.metrics.roundLimit)return {complete:true,state:s,won:false};
 }
 if(!s.alive())return {complete:true,state:s,won:false};
 if(available())return {complete:false,state:s,roomsAdvanced:visited};
 // The printed Vault/SEAL/Warden rules are executed rather than estimated.
 finishVault(s);
 return {complete:true,state:s,won:Boolean(s.metrics.won)};
}
/** Resolve an actual PARLEY/FIGHT branch at an active Monster using the
 * canonical printed payment and combat handlers, then play the rest.
 */
export function rolloutParleyContinuation(s,action,{roomDepth=9}={}){
 if(!s.monster||!["fight","parley"].includes(action))
  throw Error("Invalid active PARLEY decision");
 const passed=action==="parley"?attemptParley(s,s.monster,true):false;
 if(!passed&&!fight(s))return {complete:true,state:s,won:false};
 if(!finishMonsters(s))return {complete:true,state:s,won:false};
 finishRoom(s);
 if(!s.room.v2.special?.corridor){
  s.metrics.cleared++;s.stageProgress[s.room.stage]++;
 }
 return advanceRolloutRooms(s,roomDepth);
}
export function rolloutRoomContinuation(s,choice,{depth=2}={}){
 if(s.room?.stage==="FINAL"||![0,1].includes(choice)||depth<1)
  throw Error("Invalid Room rollout decision");
 // The fork is taken during chooseRoom: its entry Monster and preparation
 // already occurred, so replaying those would double-count actions/Items.
 actRoom(s,{prepared:true,choiceOverride:choice});
 if(!s.alive()||!finishMonsters(s))return {complete:true,state:s,won:false};
 finishRoom(s);
 const corridor=!!s.room.v2.special?.corridor;
 if(!corridor){s.metrics.cleared++;s.stageProgress[s.room.stage]++;}
 if(s.metrics.roundLimit)return {complete:true,state:s,won:false};
 // If the chosen Room is only a corridor, the next real Room still
 // belongs to the same search horizon.
 return advanceRolloutRooms(s,depth-(corridor?0:1));
}
export function rolloutCombatContinuation(s,heroIndex,decision,
 {maxHeroActions=14,roomDepth=1}={}){
 if(!s.monster||!Number.isInteger(heroIndex)||
   heroIndex<0||heroIndex>=s.heroes.length)
  throw Error("Combat rollout needs an active Monster and Hero");
 if(!decision||!["attack","item","elbereth"].includes(decision.action))
  throw Error("Invalid rollout action");
 const warden=s.monster.stage==="FINAL";
 const phaseOne=s.monster.id==="warden";
 const survived=fight(s,{warden,continuation:true,firstHeroIndex:heroIndex,
  firstDecision:decision,maxHeroActions});
 if(survived===null)return {complete:false,state:s,combatTruncated:true};
 if(!s.alive()||!survived)return {complete:true,state:s,won:false};
 if(warden){
  if(phaseOne){
   // Exactly the same post-Phase-I alternatives as a normal expedition.
   // In particular, smuggling, bargains and escape can end the run BEFORE
   // Warden Fury; do not force a generic Phase II fight in rollouts.
   finishWardenAfterPhaseOne(s,s.vaultChoice??"policy");
  }else{
   s.metrics.won=true;
   s.endingKind="amulet_taken";
  }
  return {complete:true,state:s,won:Boolean(s.metrics.won)};
 }
 if(!finishMonsters(s))return {complete:true,state:s,won:false};
 finishRoom(s);if(!s.room.v2.special?.corridor){s.metrics.cleared++;s.stageProgress[s.room.stage]++;}
 return advanceRolloutRooms(s,roomDepth);
}
export const vaultChoices=Object.freeze(["policy","fight","seal-if-available",
 "smuggle-if-available","bargain-if-available","unthrone-if-available","escape-if-available"]);
export function simulateFullExpedition({seed=1,heroes=["warrior"],strategy="survival",
 roomPolicy="scripted",vaultChoice="policy",extraObjectId=null,forceRoomChoice=null,
 heroAbilityMode="policy",returnChoices=null,retainedRoomAblation=null,
 researchTargetRoomId=null,
 researchAllowParley=false,researchPolicy="none",plannerRisk="balanced",
 plannerFeatures=null,itemTrial="normal",itemFocus=null,agentConfig=null}={}){
 verifyPrintedData();
 if(!vaultChoices.includes(vaultChoice))throw Error("Unknown Vault decision "+vaultChoice);
 if(!["policy","steady","risk"].includes(heroAbilityMode))
  throw Error("Unknown Hero ability policy "+heroAbilityMode);
 if(!researchPolicies.includes(researchPolicy))throw Error("Unknown research policy "+researchPolicy);
 if(!PLANNER_RISKS.includes(plannerRisk))throw Error("Unknown planner risk "+plannerRisk);
 if(researchPolicy==="agent"&&agentConfig===null)
  throw Error("Agent policy requires agentConfig");
 if(researchPolicy!=="agent"&&agentConfig!==null)
  throw Error("agentConfig requires researchPolicy=agent");
 const checkedAgent=agentConfig===null?null:validateAgentConfig(agentConfig);
 if(!["normal","free","force","target"].includes(itemTrial))throw Error("Unknown Item trial "+itemTrial);
 if(itemTrial==="target"&&(typeof itemFocus!=="string"||!itemFocus.trim()))
  throw Error("Target Item trial requires itemFocus");
 if(itemTrial!=="normal"&&(researchPolicy!=="planner"||
    plannerFeatures!==null&&!plannerFeatures.includes("combat")))
  throw Error("Item trial requires planner combat enabled");
 if(plannerFeatures!==null&&(!Array.isArray(plannerFeatures)||
    new Set(plannerFeatures).size!==plannerFeatures.length||
    plannerFeatures.some(f=>!PLANNER_FEATURES.includes(f))))
  throw Error("Invalid planner features; choose a unique subset of "+PLANNER_FEATURES.join(", "));
 if(plannerFeatures!==null&&researchPolicy!=="planner"&&researchPolicy!=="agent")
  throw Error("Planner features require researchPolicy=planner or agent");
 if(returnChoices!==null&&(typeof returnChoices!=="object"||Array.isArray(returnChoices)||
  Object.entries(returnChoices).some(([id,mode])=>!id||typeof mode!=="string")))
  throw Error("Invalid retained Room return-choice overrides");
 if(retainedRoomAblation!==null&&(typeof retainedRoomAblation!=="string"||!retainedRoomAblation))
  throw Error("Invalid retained Room ablation ID");
 if(forceRoomChoice!==null&&
  (!forceRoomChoice||typeof forceRoomChoice.id!=="string"||
   ![0,1].includes(forceRoomChoice.choice)))
  throw Error("Invalid forced Room choice");
 if(researchTargetRoomId!==null&&
  !ROOMS.some(c=>c.id===researchTargetRoomId))
  throw Error("Unknown research Room target");
 if(researchTargetRoomId!==null&&forceRoomChoice?.id!==researchTargetRoomId)
  throw Error("Targeted Room setup requires a matching forced-choice comparison");
 const appliedRoomPolicy=(researchPolicy==="rooms"||researchPolicy==="adaptive")&&
  roomPolicy==="scripted"?"contextual":roomPolicy;
 const s=new ExpeditionState({seed,heroes,strategy,roomPolicy:appliedRoomPolicy,extraObjectId});
 // Research-only conditional placement: move the real existing Room to the
 // start of its own stage, without inventing copies or skipping its effects.
 // Both paired arms use exactly the same reordered deck before first choice.
 if(researchTargetRoomId!==null){
  const card=ROOMS.find(c=>c.id===researchTargetRoomId);
  const pile=s.rooms[card.stage],i=pile.findIndex(c=>c.id===card.id);
  if(i<0)throw Error("Research target Room missing from physical stage deck");
  pile.unshift(...pile.splice(i,1));
 }
 s.vaultChoice=vaultChoice;
 if(heroAbilityMode!=="policy")
  s.heroAbilityModes=Object.fromEntries(heroes.map(id=>[id,heroAbilityMode]));
 s.heroAbilityMode=heroAbilityMode;
 s.researchPolicy=researchPolicy;
 s.plannerRisk=researchPolicy==="agent"?"cautious":plannerRisk;
 s.agentConfig=checkedAgent;
 s.agentDecisionSerial=0;
 s.agentInformation=null;
 s.itemTrial=itemTrial;
 s.itemFocus=itemFocus;
 s.plannerFeatures=new Set(plannerFeatures??PLANNER_FEATURES);
 s.plannerSeed=seed;
 s.plannerDecisions=["planner","agent"].includes(researchPolicy)?{}:null;
 s.plannerTrace=[];
 s.researchDecisions={parleyConsidered:0,parleySelected:0,
  spellsReserved:0,sealConsidered:0,sealSelected:0};
 s.forceRoomChoice=forceRoomChoice;
 if(returnChoices!==null)s.returnChoices={...returnChoices};
 // Experiment-only removal of a saved Room AFTER its initial printed effect.
 // The reusable game engine never depends on this intervention.
 s.researchRetainedAblations=[];
 s.researchRetainedPlacements=[];
 s.researchAllowParley=researchAllowParley;
 s.choiceComparison=null;
 for(const stage of ["UPPER","MIDDLE","DEEP"]){
  while(s.rooms[stage].length&&s.stageProgress[stage]<3){
   const room=s.rooms[stage].shift();s.beginRoom(room);
   actRoom(s);
   if(!s.alive()||!finishMonsters(s))return report(s);
   finishRoom(s);
   for(const kept of s.keptRooms)if(kept.card.id===s.room.id)
    s.researchRetainedPlacements.push({id:kept.card.id,choice:kept.choice??null});
   if(retainedRoomAblation!==null){
    const kept=s.keptRooms.filter(x=>x.card.id===retainedRoomAblation);
    if(kept.length){
     s.researchRetainedAblations.push(...kept.map(x=>({id:x.card.id,
      choice:x.choice??null,stage:s.room.stage,after:s.room.id})));
     s.keptRooms=s.keptRooms.filter(x=>x.card.id!==retainedRoomAblation);
    }
   }
   if(!s.room.v2.special?.corridor){s.metrics.cleared++;s.stageProgress[stage]++;}
   if(s.metrics.roundLimit)return report(s);
  }
 }
 return finishVault(s);
}

function finishVault(s){
 const vaultChoice=s.vaultChoice??"policy",strategy=s.strategy;
 if(!s.alive())return report(s);
 s.beginRoom(VAULT);if(!s.alive())return report(s);s.roomRoll();
 s.metrics.sealAvailable=s.discardable(sealCost(s),"MAGIC");
 // Captured *before* the branch: same seed + policy must yield the same state
 // regardless of whether the Vault decision is fight or seal-if-available.
 s.vaultState={
  hp:s.heroes.map(h=>h.hp),maxHP:s.heroes.map(h=>h.card.hp),
  inventory:s.heroes.map(h=>h.inventory.map(o=>o.id).sort()),
  equipped:s.heroes.map(h=>Object.fromEntries(
   Object.entries(h.slots).map(([slot,item])=>[slot,item.id]))),
  magicHeld:s.partyCount("MAGIC"),
  sealCost:sealCost(s),
  sealAffordable:s.metrics.sealAvailable,
  potions:s.heroes.reduce((n,h)=>n+h.inventory.filter(o=>o.v2.kind==="POTION").length,0),
  scrolls:s.heroes.reduce((n,h)=>n+h.inventory.filter(o=>o.v2.kind==="SCROLL").length,0),
  wands:s.heroes.reduce((n,h)=>n+h.inventory.filter(o=>o.v2.kind==="WAND").length,0),
  exhaustedWands:s.exhausted.size
 };
 if(!s.alive())return report(s);
 const tacticalSeal=vaultChoice==="policy"&&["magic","treasure"].includes(strategy)&&
  researchUses(s,"seal");
 if(tacticalSeal){
  s.researchDecisions.sealConsidered++;
 }
 const sealAffordable=s.metrics.sealAvailable;
 const sealPreferred=tacticalSeal&&sealAffordable&&
  (bestWit(s).card.wit>=3||partyHpFraction(s)<.75);
 if(sealPreferred)s.researchDecisions.sealSelected++;
 const plannerSeal=plannerUses(s,"seal")&&vaultChoice==="policy"?
  (s.researchPolicy==="agent"?agentPlanSeal(s):planSeal(s)):null;
 if(plannerSeal)recordPlan(s,"seal",plannerSeal);
 const preferSeal=vaultChoice==="seal-if-available"||plannerSeal?.attempt||sealPreferred||
  (vaultChoice==="policy"&&(strategy==="seal"||(strategy==="survival"&&
   s.partyCount("MAGIC")>=sealCost(s)&&s.heroes.every(h=>h.hp<h.card.hp*.55))));
 if(preferSeal&&seal(s)){
  s.metrics.won=true;s.endingKind="amulet_sealed";return report(s);
 }
 if(s.metrics.sealAttempt)s.monsterAdv=true;
 s.monster=WARDEN;s.monsterHP=Math.max(11,WARDEN.hp-s.vaultModifiers.wardenDamage);
 if(s.vaultModifiers.wardenFirstAdv)s.monsterAdv=true;
 if(s.vaultModifiers.heroFirstAdv)s.heroFirstAdv=true;
 if(s.vaultModifiers.wardenOpeningSkip)s.monsterSkip++;
 s.metrics.monsterVisits.warden=(s.metrics.monsterVisits.warden||0)+1;
 if(!fight(s,{warden:true}))return report(s);
 return finishWardenAfterPhaseOne(s,vaultChoice);
}
function finishWardenAfterPhaseOne(s,vaultChoice){
 // Canonical post-Warden-I resolution, shared with stochastic combat forks.
 // Rare alternative endings require earlier saved Rooms and payment.
 const v=s.vaultModifiers;
 const canSmuggle=v.smuggleAvailable&&s.discardable(2)&&s.discardable(1,"MAGIC");
 const canBargain=v.bargainAvailable&&s.discardable(2);
 const canUnthrone=v.unthroneAvailable&&s.discardable(1,"MAGIC");
 const prefer=choice=>vaultChoice===choice+"-if-available"||
  vaultChoice==="policy"&&(
   choice==="smuggle"&&s.strategy==="survival"||
   choice==="bargain"&&s.strategy==="negotiation"||
   choice==="unthrone"&&s.strategy==="magic");
 if(canSmuggle&&prefer("smuggle")){
  // The retained Gilded Hallway is spent when its printed exit is used.
  const map=s.keptRooms.findIndex(x=>x.card.id==="d-gilded");
  if(map>=0)s.keptRooms.splice(map,1);
  s.discard(1,{tag:"MAGIC"});s.discard();
  s.metrics.won=true;s.endingKind="smuggled_amulet";return report(s);
 }
 if(v.smuggleAvailable&&s.discardable()&&vaultChoice==="escape-if-available"){
  const map=s.keptRooms.findIndex(x=>x.card.id==="d-gilded");
  if(map>=0)s.keptRooms.splice(map,1);
  s.discard();s.endingKind="escaped_empty_handed";s.metrics.escaped=true;
  return report(s);
 }
 const challenge=(cost,kind,tag=null)=>{
  s.discard(cost,{tag});
  const h=bestWit(s),a=s.die(20),b=s.die(20);
  if(a===20||a!==1&&a+h.card.wit>b+6){
   s.metrics.won=true;s.endingKind=kind;return true;
  }
  s.monsterAdv=true;return false;
 };
 if(canBargain&&prefer("bargain")&&challenge(2,"bargained_amulet"))return report(s);
 if(canUnthrone&&prefer("unthrone")&&challenge(1,"unthroned_warden","MAGIC"))return report(s);
 s.monster=WARDEN_FURY;s.monsterHP=Math.max(0,Math.min(WARDEN_FURY.hp,s.monsterHP));
 s.metrics.monsterVisits["warden-fury"]=(s.metrics.monsterVisits["warden-fury"]||0)+1;
 if(!fight(s,{warden:true}))return report(s);
 s.metrics.won=true;s.endingKind="amulet_taken";return report(s);
}
function report(s){
 const {operationCounts,cardCounts,roomChoices,roomOptionAvailable,
  monsterVisits,objectAcquisitions,objectActivations,objectRoomExposures,
  objectEquippedRoomExposures,...m}=s.metrics;
 if(!s.metrics.won&&!s.alive()&&s.anyEquippedTag("CURSED")){
  s.endingKind="cursed_servant";
  if(!s.endingMemory)s.endingMemory="The dungeon keeps a cursed soul.";
 }
 return {...m,remainingHP:s.heroes.map(h=>h.hp),magicHeld:s.partyCount("MAGIC"),
  endingKind:s.endingKind,heroAbilityMode:s.heroAbilityMode,
  rerolls:s.rerollHistory,
  trapdoors:s.trapdoorHistory,secretFinds:s.secretFinds,
  failureStage:s.metrics.won?null:s.metrics.roundLimit?"ROUND_LIMIT":
   s.metrics.wipeStage||s.room?.stage||"unknown",
  failureCause:s.metrics.won?null:s.metrics.roundLimit?"ROUND_LIMIT":
   s.metrics.wipeCause||"unknown",
  vaultState:s.vaultState,
  fateChoices:s.fateChoices,
  roomsEncountered:[...s.seenRooms].sort(),
  retainedRoomAblations:s.researchRetainedAblations??[],
  retainedRoomPlacements:s.researchRetainedPlacements??[],
  ending:s.metrics.won?s.endingMemory:null,
  vaultModifiers:{...s.vaultModifiers},
  extraObjectGranted:s.extraObjectGranted,
  choiceComparison:s.choiceComparison,
  researchDecisions:s.researchPolicy==="none"?null:s.researchDecisions,
  plannerDecisions:s.plannerDecisions,plannerTrace:s.plannerTrace,
  plannerSeed:["planner","agent"].includes(s.researchPolicy)?s.plannerSeed:null,
  agent:s.agentConfig?{knowledge:s.agentConfig.knowledge,
   weights:s.agentConfig.weights,budget:s.agentConfig.budget,
   samplingSeed:s.agentConfig.samplingSeed}:null,
  plannerFeatures:s.researchPolicy==="planner"?[...s.plannerFeatures].sort():null,
  itemTrial:s.researchPolicy==="planner"?s.itemTrial:null,
  itemFocus:s.researchPolicy==="planner"?s.itemFocus:null,
  objectsEverOwned:[...s.objectsEverOwned].sort(),
  operationCounts,cardCounts,roomChoices,roomOptionAvailable,monsterVisits,
  objectAcquisitions,objectActivations,objectRoomExposures,objectEquippedRoomExposures,
  identifiedPotions:s.potionIdentities.size,
  exhaustedWands:s.exhausted.size};
}
export function simulateFullBatch({runs=1000,seed=1,heroes=["warrior"],strategy="survival",
 roomPolicy="scripted",vaultChoice="policy"}={}){
 if(!Number.isSafeInteger(runs)||runs<1||runs>100000)throw RangeError("Bad number of runs");
 if(!roomPolicies.includes(roomPolicy))throw Error("Unknown Room policy "+roomPolicy);
 if(!vaultChoices.includes(vaultChoice))throw Error("Unknown Vault choice "+vaultChoice);
 const sum={wins:0,vault:0,deep:0,damage:0,drawn:0,spent:0,rounds:0,battles:0,
  negotiations:0,corpses:0,activated:0,potions:0,scouts:0,magic:0,
  unidentified:0,unresolved:0,stalls:0,sealAvailable:0,sealAttempts:0,sealWins:0,cardCounts:{},roomChoices:{},
  monsterVisits:{},operationCounts:{},roomOptionAvailable:{},
  objectAcquisitions:{},objectActivations:{},objectRoomExposures:{},
  objectEquippedRoomExposures:{},objectSeenRuns:{},objectSeenWins:{},
  failureCauses:{},failureStages:{},vaultHp:0,vaultMaxHp:0,vaultMagic:0};
 for(let i=0;i<runs;i++){
  const r=simulateFullExpedition({seed:(seed+i*0x9e3779b1)>>>0,heroes,strategy,roomPolicy,vaultChoice});
  sum.wins+=Number(r.won);sum.vault+=Number(r.vaultEntered||r.vaultState!==null);
  sum.deep+=Number(r.cleared>=6);sum.damage+=r.damage;sum.drawn+=r.drawn;
  sum.spent+=r.spent;sum.rounds+=r.rounds;sum.battles+=r.battles;
  sum.negotiations+=r.negotiations;sum.corpses+=r.corpses;sum.activated+=r.activated;
  sum.potions+=r.potionsUsed;sum.scouts+=r.scouted;sum.magic+=r.magicActions;
  sum.unidentified+=r.identifiedPotions;sum.unresolved+=r.unresolved;
  sum.stalls+=Number(r.roundLimit);sum.sealAvailable+=Number(r.sealAvailable);
  sum.sealAttempts+=Number(r.sealAttempt);sum.sealWins+=Number(r.sealWin);
  if(r.vaultState){sum.vaultHp+=r.vaultState.hp.reduce((a,b)=>a+b,0);
   sum.vaultMaxHp+=r.vaultState.maxHP.reduce((a,b)=>a+b,0);
   sum.vaultMagic+=r.vaultState.magicHeld;}
  if(!r.won){
   sum.failureCauses[r.failureCause]=(sum.failureCauses[r.failureCause]||0)+1;
   sum.failureStages[r.failureStage]=(sum.failureStages[r.failureStage]||0)+1;
  }
  for(const id of r.objectsEverOwned){
   sum.objectSeenRuns[id]=(sum.objectSeenRuns[id]||0)+1;
   if(r.won)sum.objectSeenWins[id]=(sum.objectSeenWins[id]||0)+1;
  }
  for(const key of ["cardCounts","roomChoices","roomOptionAvailable","monsterVisits","operationCounts",
   "objectAcquisitions","objectActivations","objectRoomExposures","objectEquippedRoomExposures"])
   for(const [name,n] of Object.entries(r[key]))sum[key][name]=(sum[key][name]||0)+n;
 }
 const mean=x=>sum[x]/runs;
 return {model:"phase5-explicit-card-policy-v1",strategy,heroes,roomPolicy,vaultChoice,runs,
  winCount:sum.wins,vaultCount:sum.vault,deepCount:sum.deep,
  winRate:mean("wins"),vaultRate:mean("vault"),deepRate:mean("deep"),
  meanDamage:mean("damage"),meanDrawn:mean("drawn"),meanSpent:mean("spent"),
  meanCombatRounds:mean("rounds"),meanBattles:mean("battles"),
  meanNegotiations:mean("negotiations"),meanCorpses:mean("corpses"),
  meanActivated:mean("activated"),meanPotions:mean("potions"),
  meanScouting:mean("scouts"),meanMagic:mean("magic"),
  sealAvailabilityAtVault:sum.sealAvailable/Math.max(1,sum.vault),
  sealAttempts:sum.sealAttempts,sealWins:sum.sealWins,
  wardenWins:sum.wins-sum.sealWins,
  sealAttemptRateAtVault:sum.sealAttempts/Math.max(1,sum.vault),
  sealSuccessRatePerAttempt:sum.sealWins/Math.max(1,sum.sealAttempts),
  sealWinRateAtVault:sum.sealWins/Math.max(1,sum.vault),
  unresolvedEffects:sum.unresolved,stalledExpeditions:sum.stalls,
  meanVaultPartyHP:sum.vaultHp/Math.max(1,sum.vault),
  meanVaultPartyMaxHP:sum.vaultMaxHp/Math.max(1,sum.vault),
  meanVaultMagicHeld:sum.vaultMagic/Math.max(1,sum.vault),
  failureCauses:sum.failureCauses,failureStages:sum.failureStages,
  objectSeenRuns:sum.objectSeenRuns,objectSeenWins:sum.objectSeenWins,
  objectAcquisitions:sum.objectAcquisitions,objectActivations:sum.objectActivations,
  objectRoomExposures:sum.objectRoomExposures,
  objectEquippedRoomExposures:sum.objectEquippedRoomExposures,
  cardActivations:sum.cardCounts,roomChoices:sum.roomChoices,
  roomOptionAvailable:sum.roomOptionAvailable,
  monsterVisits:sum.monsterVisits,operations:sum.operationCounts};
}
