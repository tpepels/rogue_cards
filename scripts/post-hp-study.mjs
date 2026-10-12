/**
 * Post-d20 HP research. Read-only experiments: do not modify printed rules.
 *
 * node scripts/post-hp-study.mjs items [runsPerSetup=200]
 * node scripts/post-hp-study.mjs rooms [runsPerSetup=200]
 * node scripts/post-hp-study.mjs strategies [runsPerSetup=400]
 *
 * Item: Extra existing copy moved from the deck to the starting inventory,
 * identical seed/party/strategy, rather than an arbitrary free Item.
 * Room: Force each choice only when the target Room was visited and both
 * options were legal; verify pre-choice HP/inventory/Monster match.
 * Strategies: four controlled trials per seed (normal, force Vault Seal,
 * enable Monster parley, both); compare paired win/vault/damage outcomes.
 * A policy experiment is not an actual rules change.
 */
import {execFileSync} from "node:child_process";
import {OBJECTS,ROOMS,HEROES} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";

const [mode,rawRuns]=process.argv.slice(2);
const usage="Usage: node scripts/post-hp-study.mjs <items|rooms|strategies> [runsPerSetup 1..3000]";
const runs=Number(rawRuns??(mode==="strategies"?400:200));
if(!["items","rooms","strategies"].includes(mode)||!Number.isSafeInteger(runs)||
 runs<1||runs>3000||process.argv.length>4)throw Error(usage);
const seed=0x120a2026,step=0x9e3779b1;
const seedAt=i=>(seed+Math.imul(i,step))>>>0;
const party12=[...HEROES.map(x=>[x.id]),["warrior","priest"],
 ["knight","wizard"],["rogue","witch"],["thief","monk"]];
const party36=[...HEROES.map(x=>[x.id]),...HEROES.flatMap((x,i)=>
 HEROES.slice(i+1).map(y=>[x.id,y.id]))];
const referenceStrategies=["survival","magic","seal"];
const zero=()=>({n:0,controlWins:0,alternativeWins:0,onlyControl:0,
 onlyAlternative:0,both:0,neither:0,controlDamage:0,alternativeDamage:0,
 controlVault:0,alternativeVault:0,unresolved:0,stalls:0});
function record(t,a,b){
 t.n++;t.controlWins+=Number(a.won);t.alternativeWins+=Number(b.won);
 t.onlyControl+=Number(a.won&&!b.won);
 t.onlyAlternative+=Number(!a.won&&b.won);
 t.both+=Number(a.won&&b.won);t.neither+=Number(!a.won&&!b.won);
 t.controlDamage+=a.damage;t.alternativeDamage+=b.damage;
 t.controlVault+=Number(a.cleared===9);t.alternativeVault+=Number(b.cleared===9);
 t.unresolved+=a.unresolved+b.unresolved;
 t.stalls+=Number(a.roundLimit)+Number(b.roundLimit);
}
function finish(t){
 const n=t.n,d=n?(t.alternativeWins-t.controlWins)/n:null;
 const q=n?(t.onlyControl+t.onlyAlternative)/n:null;
 const se=n?Math.sqrt(Math.max(0,q-d*d)/n):null;
 return {...t,controlRate:n?t.controlWins/n:null,
  alternativeRate:n?t.alternativeWins/n:null,
  winDelta:n?d:null,ci95:n?[d-1.96*se,d+1.96*se]:null,
  vaultDelta:n?(t.alternativeVault-t.controlVault)/n:null,
  damageDelta:n?(t.alternativeDamage-t.controlDamage)/n:null};
}
function configuration(){const a=[];
 for(const heroes of party12)for(const strategy of referenceStrategies)
  for(let i=0;i<runs;i++)a.push({seed:seedAt(i),heroes,strategy});
 return a;
}
let totalSimulated=0,unresolved=0,stalls=0,body={};
function assertGood(r){totalSimulated++;unresolved+=r.unresolved;
 stalls+=Number(r.roundLimit);return r;}
if(mode==="items"){
 const cfgs=configuration();
 // Cached control run: all 52 Item experiments use identical controls.
 const bases=cfgs.map(c=>assertGood(simulateFullExpedition(c)));
 const results=[];
 for(const card of OBJECTS){
  const all=zero(),byHero=Object.fromEntries(HEROES.map(h=>[h.id,zero()]));
  const byKind={solo:zero(),duo:zero()};
  const byStrategy=Object.fromEntries(referenceStrategies.map(k=>[k,zero()]));
  let unavailable=0;
  for(let k=0;k<cfgs.length;k++){
   const alt=assertGood(simulateFullExpedition({...cfgs[k],extraObjectId:card.id}));
   if(!alt.extraObjectGranted){unavailable++;continue;}
   const base=bases[k],c=cfgs[k];
   record(all,base,alt);record(byKind[c.heroes.length===1?"solo":"duo"],base,alt);
   record(byStrategy[c.strategy],base,alt);
   if(c.heroes.length===1)record(byHero[c.heroes[0]],base,alt);
  }
  results.push({id:card.id,title:card.title,kind:card.v2.kind,unavailable,
   overall:finish(all),solo:finish(byKind.solo),duo:finish(byKind.duo),
   strategies:Object.fromEntries(Object.entries(byStrategy).map(([k,v])=>[k,finish(v)])),
   heroes:Object.fromEntries(Object.entries(byHero).map(([k,v])=>[k,finish(v)]))});
 }
 body={treatment:"one extra deck copy in starting hand",partySetups:party12,
  policyStrategies:referenceStrategies,results};
}
if(mode==="rooms"){
 const cfgs=configuration(),results=[];
 for(const card of ROOMS){
  const all=zero(),byKind={solo:zero(),duo:zero()};
  const byStrategy=Object.fromEntries(referenceStrategies.map(x=>[x,zero()]));
  let unseen=0,illegal=0;
  for(const c of cfgs){
   const a=assertGood(simulateFullExpedition({...c,forceRoomChoice:{id:card.id,choice:0}}));
   if(!a.choiceComparison?.seen){unseen++;continue;}
   if(!a.choiceComparison.bothLegal){illegal++;continue;}
   const b=assertGood(simulateFullExpedition({...c,forceRoomChoice:{id:card.id,choice:1}}));
   if(JSON.stringify(a.choiceComparison)!==JSON.stringify(b.choiceComparison))
    throw Error("Counterfactual Room state mismatch "+card.id+" "+JSON.stringify(c));
   record(all,a,b);record(byKind[c.heroes.length===1?"solo":"duo"],a,b);
   record(byStrategy[c.strategy],a,b);
  }
  results.push({id:card.id,title:card.title,stage:card.stage,
   unseen,illegal,choiceA:card.v2.choices[0],choiceB:card.v2.choices[1],
   overall:finish(all),solo:finish(byKind.solo),duo:finish(byKind.duo),
   strategies:Object.fromEntries(Object.entries(byStrategy).map(([k,v])=>[k,finish(v)]))});
 }
 body={treatment:"force second instead of first option when both legal",
  partySetups:party12,policyStrategies:referenceStrategies,results};
}
if(mode==="strategies"){
 const strategies=["survival","treasure","magic","seal","negotiation"];
 const baseline={};
 for(const strategy of strategies){
  const groups={solo:{runs:0,wins:0,vault:0,damage:0,activated:0,spent:0,
   negotiations:0,magicActions:0,sealAttempts:0,sealWins:0},
   duo:{runs:0,wins:0,vault:0,damage:0,activated:0,spent:0,
   negotiations:0,magicActions:0,sealAttempts:0,sealWins:0}};
  const solos={};
  for(const heroes of party36){
   const key=heroes.length===1?"solo":"duo",t=groups[key],solo=heroes.length===1?zero():null;
   for(let i=0;i<runs;i++){
    const r=assertGood(simulateFullExpedition({seed:seedAt(i),heroes,strategy}));
    t.runs++;t.wins+=Number(r.won);t.vault+=Number(r.cleared===9);
    t.damage+=r.damage;t.activated+=r.activated;t.spent+=r.spent;
    t.negotiations+=r.negotiations;t.magicActions+=r.magicActions;
    t.sealAttempts+=Number(r.sealAttempt);t.sealWins+=Number(r.sealWin);
    if(solo){solo.n++;solo.controlWins+=Number(r.won);solo.controlVault+=Number(r.cleared===9);}
   }
   if(solo)solos[heroes[0]]={wins:solo.controlWins,runs:solo.n,vault:solo.controlVault};
  }
  baseline[strategy]={groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{...v,
   winRate:v.wins/v.runs,vaultRate:v.vault/v.runs,vaultWinRate:v.vault?v.wins/v.vault:0,
   meanDamage:v.damage/v.runs,meanActivated:v.activated/v.runs,
   meanSpent:v.spent/v.runs,meanNegotiations:v.negotiations/v.runs,
   meanMagicActions:v.magicActions/v.runs}])),solos};
 }
 const interventions={};
 for(const strategy of ["magic","treasure"]){
  const groups={solo:{seal:zero(),parley:zero(),both:zero()},
   duo:{seal:zero(),parley:zero(),both:zero()}};
  const hero={}
  for(const heroes of party36){
   const key=heroes.length===1?"solo":"duo";
   if(heroes.length===1)hero[heroes[0]]={seal:zero(),parley:zero(),both:zero()};
   for(let i=0;i<runs;i++){
    const c={seed:seedAt(i),heroes,strategy};
    const a=assertGood(simulateFullExpedition(c));
    const opts={
     seal:{vaultChoice:"seal-if-available"},
     parley:{researchAllowParley:true},
     both:{vaultChoice:"seal-if-available",researchAllowParley:true}
    };
    for(const [name,opt] of Object.entries(opts)){
     const b=assertGood(simulateFullExpedition({...c,...opt}));
     record(groups[key][name],a,b);
     if(heroes.length===1)record(hero[heroes[0]][name],a,b);
     if(name==="seal"&&JSON.stringify(a.vaultState)!==JSON.stringify(b.vaultState))
      throw Error("Seal ablation changed pre-Vault state "+JSON.stringify(c));
    }
   }
  }
  interventions[strategy]={groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,
   Object.fromEntries(Object.entries(v).map(([name,x])=>[name,finish(x)]))])),
   soloHeroes:Object.fromEntries(Object.entries(hero).map(([h,v])=>[h,
    Object.fromEntries(Object.entries(v).map(([name,x])=>[name,finish(x)]))]))};
 }
 body={partySetups:party36,baseline,interventions};
}
let commit=null;try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const result={experiment:"rogue-cards-post-hp-study-v1",commit,seed,step,
 mode,runsPerSetup:runs,simulations:totalSimulated,unresolved,stalls,
 notes:[
  "Differences are policy-dependent paired interventions, not intrinsic card rankings.",
  "Win deltas are fractions, 0.05 = five percentage points.",
  "Approximate 95% intervals do not correct for testing many cards.",
  "The optional parley experiment changes simulator decision-making, not printed rules."
 ],...body};
if(unresolved||stalls)process.exitCode=1;
process.stdout.write(JSON.stringify(result,null,2)+"\n");
