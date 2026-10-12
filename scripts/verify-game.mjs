/**
 * Reproducible whole-game smoke and balance comparison.
 *
 *   npm run verify:game -- 70 --compare tests/fixtures/game-baseline.json
 *   npm run verify:game -- 1000 > full-game-verification.json
 *
 * All eight solo Heroes, all 28 distinct two-Hero parties, all five
 * strategies. This is policy-specific Monte Carlo evidence, not optimal play.
 * Intentional changes show as baseline deltas rather than silently becoming
 * "no regression". Only mechanical errors (unresolved effects/stalls) are
 * fatal by default; use --strict to reject *any* baseline outcome change.
 */
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {HEROES,ROOMS,MONSTERS,OBJECTS} from "../src/tabletop-data.js";
import {strategies} from "../src/expedition-runtime.js";
import {simulateFullBatch} from "../src/expedition-campaign.js";

const SEED=0x20261012;
const PAIRS=HEROES.flatMap((h,i)=>HEROES.slice(i+1).map(other=>[h.id,other.id]));
const PARTIES=[...HEROES.map(h=>[h.id]),...PAIRS];
const usage="Usage: npm run verify:game -- [runs: 1..10000] [--compare path] [--strict]";
const argv=process.argv.slice(2);
const positions=argv.filter(a=>!a.startsWith("--"));
const flagNames=argv.filter(a=>a.startsWith("--"));
if(positions.length>2||flagNames.some(a=>a!=="--compare"&&a!=="--strict")||
 flagNames.filter(a=>a==="--compare").length>1||
 flagNames.filter(a=>a==="--strict").length>1)throw Error(usage);
const runs=Number(positions[0]??70);
const baselinePath=flagNames.includes("--compare")?positions[1]:null;
if(!Number.isSafeInteger(runs)||runs<1||runs>10000||
 (flagNames.includes("--compare")&&!baselinePath)||
 (flagNames.includes("--strict")&&!baselinePath)||
 (!flagNames.includes("--compare")&&positions.length>1))throw Error(usage);

let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}
catch{/* Works with exported trees. */}
const groups=[],groupMap=new Map();
const totals={expeditions:0,wins:0,vaultArrivals:0,unresolvedEffects:0,
 stalledExpeditions:0,sealAttempts:0,sealWins:0};
const cardSeen=new Set(),cardActivated=new Set(),roomsChosen=new Set(),monstersSeen=new Set();
const split={solo:{wins:0,runs:0},duo:{wins:0,runs:0}};
for(const heroes of PARTIES)for(const strategy of strategies){
 const result=simulateFullBatch({seed:SEED,runs,heroes,strategy});
 const id=heroes.join("+")+" / "+strategy;
 const record={id,heroes,strategy,won:result.winCount,vault:result.vaultCount,
  runs,sealAttempts:result.sealAttempts,sealWins:result.sealWins,
  meanDamage:Number(result.meanDamage.toFixed(3)),
  unresolved:result.unresolvedEffects,stalls:result.stalledExpeditions};
 groups.push(record);groupMap.set(id,record);
 totals.expeditions+=runs;totals.wins+=result.winCount;
 totals.vaultArrivals+=result.vaultCount;
 totals.unresolvedEffects+=result.unresolvedEffects;
 totals.stalledExpeditions+=result.stalledExpeditions;
 totals.sealAttempts+=result.sealAttempts;totals.sealWins+=result.sealWins;
 const bucket=heroes.length===1?split.solo:split.duo;
 bucket.wins+=result.winCount;bucket.runs+=runs;
 for(const id of Object.keys(result.objectAcquisitions))cardSeen.add(id);
 for(const id of Object.keys(result.objectActivations))cardActivated.add(id);
 for(const key of Object.keys(result.roomChoices))roomsChosen.add(key.split(":")[0]);
 for(const id of Object.keys(result.monsterVisits))monstersSeen.add(id);
}
const totalRate=totals.wins/totals.expeditions;
const uncaught=[];
if(totals.unresolvedEffects)uncaught.push(totals.unresolvedEffects+" unresolved card effects");
if(totals.stalledExpeditions)uncaught.push(totals.stalledExpeditions+" stalled expeditions");
if(uncaught.length)process.exitCode=1;
const coverage={
 acquired:Object.keys(Object.fromEntries([...cardSeen].map(id=>[id,true]))).length,
 totalObjects:OBJECTS.length,
 activatedRollObjects:OBJECTS.filter(c=>c.v2.roll&&cardActivated.has(c.id)).length,
 totalRollObjects:OBJECTS.filter(c=>c.v2.roll).length,
 nonRollObjects:OBJECTS.filter(c=>!c.v2.roll).length,
 regionalRoomsChosen:ROOMS.filter(r=>roomsChosen.has(r.id)).length,
 totalRegionalRooms:ROOMS.length,
 regionalMonstersSeen:MONSTERS.filter(m=>monstersSeen.has(m.id)).length,
 totalRegionalMonsters:MONSTERS.length,
 unactivatedRolledObjects:OBJECTS.filter(c=>c.v2.roll&&!cardActivated.has(c.id)).map(c=>c.id)
};
let comparison=null;
if(baselinePath){
 const base=JSON.parse(readFileSync(baselinePath,"utf8"));
 if(base.seed!==SEED||base.runsPerSetup!==runs||
  base.groups?.length!==groups.length)throw Error("Baseline configuration differs; rerun with the same seed, party setups and runs");
 const before=new Map(base.groups.map(g=>[g.id,g]));
 const changed=[];
 for(const g of groups){
  const old=before.get(g.id);
  if(!old)throw Error("Unknown configuration in baseline: "+g.id);
  const deltaWins=g.won-old.won,deltaVault=g.vault-old.vault;
  if(deltaWins||deltaVault||g.sealWins!==old.sealWins||g.meanDamage!==old.meanDamage)
   changed.push({id:g.id,winRateDelta:deltaWins/runs,
    vaultRateDelta:deltaVault/runs,
    sealWinDelta:g.sealWins-old.sealWins,
    meanDamageDelta:Number((g.meanDamage-old.meanDamage).toFixed(3))});
 }
 changed.sort((a,b)=>Math.abs(b.winRateDelta)-Math.abs(a.winRateDelta));
 comparison={baselineCommit:base.commit??null,changedGroups:changed.length,
  unchangedGroups:groups.length-changed.length,largestChanges:changed.slice(0,40),
  notice:"Differences are expected after deliberate rule/card changes. Review, then explicitly update the baseline."};
 if(flagNames.includes("--strict")&&changed.length)process.exitCode=1;
}
process.stdout.write(JSON.stringify({
 experiment:"rogue-cards-whole-game-verification-v1",commit,seed:SEED,
 runsPerSetup:runs,partySetups:PARTIES.length,strategies,totals,
 winRate:totalRate,soloWinRate:split.solo.wins/split.solo.runs,
 duoWinRate:split.duo.wins/split.duo.runs,coverage,
 mechanicalErrors:uncaught,comparison,groups,
 limitations:[
  "Five scripted strategies are not optimal or human decisions.",
  "Acquisition and activation coverage is not proof that every conditional benefit is correct.",
  "A higher win rate is not by itself better balance; review changes by Hero, party, card and Room.",
  "Different card choices can change later random rolls even with matched starting seeds."
 ]
},null,2)+"\n");
