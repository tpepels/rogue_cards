#!/usr/bin/env node
/**
 * Phase 2b: matched evaluation on 48 deliberately constructed, canonically
 * legal encounter states with wounded Heroes, carried physical Items, equipped
 * weapons/armour and lingering conditions.
 *
 * IMPORTANT: these are PLAUSIBLE intervention states, not empirical samples
 * from a live expedition. Their construction is disclosed in scenarios.json.
 *
 * All effects, actions, Monster queues and responses are run by the real
 * decision-session engine, never a shadow combat rules implementation.
 */
import {mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {forkGameState} from "../src/engine/fork-state.js";
import {randomSource} from "../src/engine/random.js";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {MONSTERS} from "../src/tabletop-data.js";
import {EXTRA_MONSTERS} from "../src/monster-expansion.js";
import {makeEncounter,choose,completeEncounter,phase2Tactical,encounterOutcome}
 from "./study-combat-causes.mjs";

const MONSTER_IDS=[
 "crawler","troll","wisp","mold","wax-golem",
 "sentinel","bone-cantor","glass-revenant"
];
const ALL_MONSTERS=[...MONSTERS,...EXTRA_MONSTERS];
/**
 * Six fixed party/resource profiles x eight Monster cards = 48 states.
 * Every item listed is physically removed from the real deck. Max HP is
 * checked against each printed Hero. Existing starter gear is retained.
 *
 * A few starts use the canonical Parley boundary. Others begin with a
 * Hero-turn choice or an already identified attacker, so all decisions
 * genuinely available during an encounter can be compared.
 */
const PROFILES=[
 {id:"wounded-warrior",heroes:["warrior"],hp:[11],
  items:[["scroll-flame","ex-jerkin"]],poison:[],dis:[],phase:"combat-hero"},
 {id:"injured-knight",heroes:["knight"],hp:[8],
  items:[["scroll-frost","ex-mace","ex-helm"]],poison:[],dis:[0],
  phase:"combat-hero"},
 {id:"poisoned-witch",heroes:["witch"],hp:[10],
  items:[["needle","scroll-banish","ex-buckler"]],poison:[0],dis:[],
  phase:"parley"},
 {id:"asymmetric-frontline",heroes:["warrior","knight"],hp:[7,17],
  items:[["scroll-lightning"],["ex-buckler","spore-jar"]],
  poison:[],dis:[0],phase:"combat-hero"},
 {id:"weakened-mages",heroes:["wizard","monk"],hp:[8,12],
  items:[["scroll-frost","ex-jerkin"],["scroll-flame","moth"]],
  poison:[0],dis:[],phase:"parley"},
 {id:"exhausted-support",heroes:["rogue","priest"],hp:[12,6],
  items:[["ex-spear","scroll-flame"],["scroll-banish","ex-helm"]],
  poison:[1],dis:[1],phase:"combat-hero"}
];
const mix=n=>{n=(n+0x9e3779b9)>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return(n^(n>>>16))>>>0;};
export function identitySeed(master,id){
 let h=2166136261;
 for(const ch of id)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
 return mix((master>>>0)^h);
}
const cloneSession=session=>({
 ...session,state:forkGameState(session.state),
 history:[],remainingReturns:[...session.remainingReturns],
 pendingNested:session.pendingNested?{
  ...session.pendingNested,root:{...session.pendingNested.root},
  responses:session.pendingNested.responses.map(x=>({...x})),
  actions:session.pendingNested.actions.map(x=>({...x}))
 }:null
});
const totalHp=s=>s.heroes.reduce((sum,h)=>sum+Math.max(0,h.hp),0);
const count=(object,key)=>object[key]??0;
const actionKey=a=>JSON.stringify(a&&{
 phase:a.phase,kind:a.kind,heroIndex:a.heroIndex,
 optionIndex:a.optionIndex,mode:a.mode,cardId:a.cardId
});
function assignItem(s,h,id){
 // Starting Items must actually come from the printed physical pile.
 const existing=h.inventory.find(c=>c.id===id);
 if(existing)return existing;
 const position=s.deck.findIndex(c=>c.id===id);
 if(position<0)throw Error("Physical Item unavailable: "+id);
 const [card]=s.deck.splice(position,1);
 s.noteDeckRemoval(card);
 h.inventory.push(card);s.objectsEverOwned.add(card.id);
 // The explicit choice to equip a useful owned Item is a *pre-combat*
 // state setting. No free equipment mutation is possible in combat.
 if(card.v2.tags.includes("WEAPON"))h.slots.weapon=card;
 else if(card.v2.tags.includes("ARMOUR"))h.slots.armour=card;
 else if(card.v2.kind==="RING")h.slots.ring=card;
 else if(card.v2.kind==="COMPANION")h.slots.companion=card;
 return card;
}
export function makeScenario(monsterId,profileId,{seed=20261017}={}){
 const monster=ALL_MONSTERS.find(m=>m.id===monsterId);
 const profile=PROFILES.find(p=>p.id===profileId);
 if(!monster||!profile)throw Error("Unknown Phase 2b scenario "+monsterId+"/"+profileId);
 const id=monsterId+"__"+profileId;
 const scenarioSeed=identitySeed(seed,id);
 const session=makeEncounter(monster,profile.heroes,scenarioSeed);
 const s=session.state;
 for(let i=0;i<profile.heroes.length;i++){
  const h=s.heroes[i];
  if(!Number.isInteger(profile.hp[i])||
     profile.hp[i]<1||profile.hp[i]>=h.card.hp)
   throw Error("Implausible starting HP "+id+" hero "+i);
  h.hp=profile.hp[i];
  for(const itemId of profile.items[i])assignItem(s,h,itemId);
  if(profile.poison.includes(i))h.poison=true;
  if(profile.dis.includes(i))h.nextDis=1;
 }
 if(profile.phase==="parley"&&monster.id!=="sentinel"){
  // Sentinel always forces combat; never construct an unreachable Parley
  // phase for it. All other printed regional Monsters may offer Parley.
  session.phase="parley";session.heroIndex=-1;
 }
 // Other than the controlled interventions above, all mutable state
 // remains canonical, including Monster stages, real Item copies, RNG.
 const actions=sessionActions(session);
 const hasParley=actions.some(a=>a.kind==="parley");
 if(session.phase==="parley"&&!actions.some(a=>a.kind==="fight"))
  throw Error("No legal fight alternative at Parley start "+id);
 return {
  id,monsterId,monster:monster.title,stage:monster.stage,profileId,
  heroes:profile.heroes.join("+"),partySize:profile.heroes.length,
  hp:profile.hp.join("/"),poisoned:profile.poison.join("/"),
  dis:profile.dis.join("/"),items:profile.items.map(x=>x.join("+")).join("/"),
  phase:session.phase,hasParley,scenarioSeed,session
 };
}
export function scenarios({seed=20261017,limit=48,ids=MONSTER_IDS}={}){
 if(!Number.isInteger(limit)||limit<1||limit>48)throw Error("Scenario limit must be 1..48");
 const out=[];
 for(const id of ids)for(const p of PROFILES)
  out.push(makeScenario(id,p.id,{seed}));
 return out.slice(0,limit);
}
const policyList=["attack_only","phase2_safe","phase2_elbereth","phase2_parley"];
export function simulateScenario(scenario,policy,{
 samples=2,followupSamples=2,seed=20261017
}={}){
 if(!policyList.includes(policy))throw Error("Unknown policy "+policy);
 const session=cloneSession(scenario.session),s=session.state;
 // No correlation with iteration index, filtered population or arm order.
 const diceSeed=identitySeed(seed,scenario.id+"|combat");
 s.rng=randomSource(diceSeed);
 const initialHp=totalHp(s),initialByHero=s.heroes.map(h=>h.hp);
 const startKills=count(s.metrics,"kills");
 const startItemUses=Object.values(s.metrics.itemUses).reduce((n,x)=>n+x.total,0);
 let opportunities={attack:0,item:0,parley:0,elbereth:0,
  heroSelection:0,meaningfulAlternatives:0};
 const actions={},firstDeviation={},firstDecision={};
 let deviations=0,decisionCount=0,baselineActions=0;
 const result=completeEncounter(session,{
  selectAction:(at,step)=>{
   const legal=sessionActions(at);
   const baseline=choose(at,"basic");
   const eligible=!at.pendingNested&&
    ["combat-hero","combat","parley"].includes(at.phase);
   if(eligible){
    decisionCount++;
    if(legal.some(a=>a.kind==="attack"))opportunities.attack++;
    if(legal.some(a=>a.kind==="item"))opportunities.item++;
    if(legal.some(a=>a.kind==="parley"))opportunities.parley++;
    if(legal.some(a=>a.kind==="elbereth"))opportunities.elbereth++;
    if(legal.some(a=>a.kind==="choose-hero-turn"))opportunities.heroSelection++;
    if(legal.length>1)opportunities.meaningfulAlternatives++;
   }
   let selected=baseline;
   if(policy!=="attack_only"&&eligible&&
      (policy==="phase2_parley"||at.phase!=="parley"))
    selected=phase2Tactical(at,{
     samples,followupSamples,
     decisionSeed:identitySeed(diceSeed,at.phase+"|"+step),
     allowElbereth:policy==="phase2_elbereth"
    });
   if(!legal.some(a=>actionKey(a)===actionKey(selected)))
    throw Error("Search returned an illegal action at "+scenario.id+
     " step "+step+": "+JSON.stringify(selected));
   actions[selected.kind]=(actions[selected.kind]||0)+1;
   if(eligible){
    if(!Object.hasOwn(firstDecision,"chosen")){
     firstDecision.chosen=actionKey(selected);
     firstDecision.baseline=actionKey(baseline);
    }
    if(actionKey(selected)!==actionKey(baseline)){
     deviations++;
     if(!Object.hasOwn(firstDeviation,"step")){
      firstDeviation.step=step;
      firstDeviation.phase=at.phase;
      firstDeviation.baseline=actionKey(baseline);
      firstDeviation.chosen=actionKey(selected);
     }
    }else baselineActions++;
   }
   return selected;
  }
 });
 const resolved=encounterOutcome(session);
 if(resolved!==result.outcome)throw Error("Outcome inconsistency");
 if(resolved==="cleared"&&(s.monster||s.monsterQueue.length||
   session.pendingNested||session.phase!=="between-rooms"))
  throw Error("False encounter clear in Phase 2b "+scenario.id);
 return {
  scenarioId:scenario.id,monsterId:scenario.monsterId,stage:scenario.stage,
  profileId:scenario.profileId,partySize:scenario.partySize,
  heroes:scenario.heroes,seed:scenario.scenarioSeed,diceSeed,
  policy,outcome:resolved,safelyCleared:resolved==="cleared",
  initialHP:initialHp,remainingHP:totalHp(s),
  hpLost:initialHp-totalHp(s),
  heroHpBefore:initialByHero.join("/"),
  heroHpAfter:s.heroes.map(h=>h.hp).join("/"),
  deaths:s.heroes.filter(h=>h.hp<=0).length,
  killedMonsters:count(s.metrics,"kills")-startKills,
  queuedRemaining:s.monsterQueue.length,
  damagedByMonster:s.metrics.damage,
  poisonEnd:s.heroes.filter(h=>h.poison&&h.hp>0).length,
  actualItemUses:Object.values(s.metrics.itemUses).reduce((n,x)=>n+x.total,0)-startItemUses,
  actionsAttack:actions.attack||0,
  actionsItem:actions.item||0,
  actionsElbereth:actions.elbereth||0,
  actionsParley:actions.parley||0,
  heroSelections:actions["choose-hero-turn"]||0,
  decisions:decisionCount,
  decisionsMatchingBasic:baselineActions,
  deviations,
  firstDecision:JSON.stringify(firstDecision),
  firstDeviation:JSON.stringify(firstDeviation),
  opportunities
 };
}
function summaryFor(rows){
 const basic=new Map(rows.filter(r=>r.policy==="attack_only").map(r=>[r.scenarioId,r]));
 const arms=policyList.map(policy=>{
  const selected=rows.filter(r=>r.policy===policy);
  const sum=(f)=>selected.reduce((n,r)=>n+f(r),0);
  const n=selected.length;
  return {
   policy,n,safeClears:sum(r=>Number(r.safelyCleared)),
   totalDeaths:sum(r=>r.deaths),
   meanHpLost:sum(r=>r.hpLost)/n,
   meanHpSavedVsAttack:sum(r=>basic.get(r.scenarioId).hpLost-r.hpLost)/n,
   betterHpThanAttack:sum(r=>Number(r.hpLost<basic.get(r.scenarioId).hpLost)),
   worseHpThanAttack:sum(r=>Number(r.hpLost>basic.get(r.scenarioId).hpLost)),
   equalHpToAttack:sum(r=>Number(r.hpLost===basic.get(r.scenarioId).hpLost)),
   safetyGains:sum(r=>Number(r.safelyCleared&&!basic.get(r.scenarioId).safelyCleared)),
   safetyLosses:sum(r=>Number(!r.safelyCleared&&basic.get(r.scenarioId).safelyCleared)),
   differingScenarios:sum(r=>Number(r.deviations>0)),
   deviatingChoices:sum(r=>r.deviations),
   totalDecisionWindows:sum(r=>r.decisions),
   itemActions:sum(r=>r.actionsItem),
   parleyActions:sum(r=>r.actionsParley),
   elberethActions:sum(r=>r.actionsElbereth),
   legalItemOpportunities:sum(r=>r.opportunities.item),
   legalParleyOpportunities:sum(r=>r.opportunities.parley),
   legalHeroSelections:sum(r=>r.opportunities.heroSelection)
  };
 });
 return {byPolicy:arms};
}
const csv=rows=>{
 const keys=Object.keys(rows[0]??{}).filter(x=>x!=="opportunities");
 const quote=x=>{
  const s=String(x??"");
  return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
 };
 return keys.join(",")+"\n"+rows.map(r=>keys.map(k=>quote(r[k])).join(",")).join("\n")+"\n";
};
export function runPhase2b({
 seed=20261017,limit=48,samples=2,followupSamples=2,
 ids=MONSTER_IDS,selectedPolicies=policyList,
 out="results/combat-phase2b-"+seed,write=true
}={}){
 if(!Number.isSafeInteger(seed)||seed<1||
    !Number.isInteger(samples)||samples<1||samples>16||
    !Number.isInteger(followupSamples)||followupSamples<1||followupSamples>8)
  throw Error("Invalid Phase 2b sample settings");
 if(selectedPolicies.some(p=>!policyList.includes(p))||
    !selectedPolicies.includes("attack_only"))
  throw Error("Must include the attack-only baseline");
 const fixtures=scenarios({seed,limit,ids});
 const rows=[];
 for(const scenario of fixtures){
  for(const policy of selectedPolicies)
   rows.push(simulateScenario(scenario,policy,{
    seed,samples,followupSamples
   }));
  if(write)console.error("Completed "+scenario.id);
 }
 // Recheck no missing or duplicated arms; provide comparisons only against
 // the same scenario's exact starting state and seeded combat stream.
 for(const fixture of fixtures){
  const subset=rows.filter(r=>r.scenarioId===fixture.id);
  if(subset.length!==selectedPolicies.length||
     new Set(subset.map(r=>r.diceSeed)).size!==1||
     new Set(subset.map(r=>r.seed)).size!==1)
   throw Error("Invalid paired scenario: "+fixture.id);
  const basic=subset.find(r=>r.policy==="attack_only");
  for(const r of subset){
   r.hpSavedVsAttack=basic.hpLost-r.hpLost;
   r.safetyDeltaVsAttack=Number(r.safelyCleared)-Number(basic.safelyCleared);
   r.firstDecisionDifferentFromBasic=
    JSON.parse(r.firstDecision).chosen!==JSON.parse(r.firstDecision).baseline;
  }
 }
 const report={
  schema:"combat-phase2b-v1",
  design:{seed,limit,samples,followupSamples,arms:selectedPolicies,
   scenarioCount:fixtures.length,monsterIds:[...new Set(fixtures.map(s=>s.monsterId))]},
  comparisons:summaryFor(rows),rows:rows.length,
  caveats:[
   "Scenarios are plausible constructed interventions, not naturally sampled reached states",
   "Only real physical cards and canonical combat transitions are used; scenario HP and conditions are set before combat",
   "Identical scenario IDs use stable independent master/game/combat seeds regardless of filtering and loop order",
   "Policies can consume dice in different order; paired RNG starting streams are not forced identical die outcomes afterward",
   "Any strategy with the same actions and dice as Attack-only has no demonstrated tactical benefit"
  ]
 };
 if(write){
  const dir=resolve(out);
  if(existsSync(dir))throw Error("Output already exists: "+dir);
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"summary.json"),JSON.stringify(report,null,2)+"\n");
  writeFileSync(join(dir,"fights.csv"),csv(rows));
  writeFileSync(join(dir,"scenarios.json"),JSON.stringify(fixtures.map(
   ({session,...info})=>info),null,2)+"\n");
  console.log("Results: "+dir+" ("+fixtures.length+" states, "+rows.length+" runs)");
  for(const arm of report.comparisons.byPolicy)
   console.log(arm.policy+": safe="+arm.safeClears+"/"+arm.n+
    " meanHP="+arm.meanHpLost.toFixed(2)+
    " saved="+arm.meanHpSavedVsAttack.toFixed(2)+
    " differingStates="+arm.differingScenarios+"/"+arm.n+
    " actionChanges="+arm.deviatingChoices+
    " items="+arm.itemActions+
    " parley="+arm.parleyActions+
    " elbereth="+arm.elberethActions);
 }
 return {report,rows,fixtures};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2),allowed=new Set([
  "--seed","--scenarios","--samples","--followup","--out","--monsters"
 ]);
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],v=argv[i+1];
  if(!allowed.has(key)||!v||Object.hasOwn(opts,key))
   throw Error("Invalid Phase 2b argument "+key);
  opts[key]=v;
 }
 const integer=(key,fallback,min,max)=>{
  const n=Number(opts[key]??fallback);
  if(!Number.isSafeInteger(n)||n<min||n>max)
   throw Error("Invalid "+key);
  return n;
 };
 runPhase2b({
  seed:integer("--seed",20261017,1,0xffffffff),
  limit:integer("--scenarios",48,1,48),
  samples:integer("--samples",2,1,16),
  followupSamples:integer("--followup",2,1,8),
  ids:opts["--monsters"]?.split(",")??MONSTER_IDS,
  out:opts["--out"]??"results/combat-phase2b-"+(opts["--seed"]??20261017)
 });
}
