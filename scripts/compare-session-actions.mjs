#!/usr/bin/env node
/**
 * LOCAL ONLY. Reach one real canonical decision using the session MCTS,
 * then compare every legal action from that EXACT state on paired seeds.
 *
 * Examples:
 * npm run oracle:contrast -- --seed 100 --trials 30 --out results/contrast-100
 * npm run oracle:contrast -- --seed 315 --heroes warrior,wizard \
 *   --target-room m-ladder --trials 200 --future-budget 4 \
 *   --out results/ladder-315
 *
 * A source Room not encountered naturally is reported, never fabricated.
 * This is conditional evidence for one state, not an all-card balance study.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
import {createDecisionSession,sessionActions,submitDecision}
 from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import {compareSessionActions} from "../src/session-counterfactual.js";

const names=new Set(["--seed","--heroes","--target-room","--target-phase",
 "--trials","--navigate-budget","--future-budget","--knowledge",
 "--max-search-steps","--max-game-steps","--reference-index","--out"]);
const values={};
for(let i=2;i<process.argv.length;i++){
 const k=process.argv[i],v=process.argv[i+1];
 if(!names.has(k)||values[k]!==undefined||!v||v.startsWith("--"))
  throw Error("Unknown, duplicate or incomplete CLI option "+k);
 values[k]=v;i++;
}
const number=(key,fallback,min,max)=>{
 const value=values[key]??String(fallback),n=Number(value);
 if(!/^(0|[1-9]\d*)$/.test(value)||!Number.isSafeInteger(n)||
     n<min||n>max)
  throw Error(key+" must be integer from "+min+" to "+max);
 return n;
};
const seed=number("--seed",100,0,0xffffffff),
 trials=number("--trials",30,1,100000),
 navigateBudget=number("--navigate-budget",2,1,100000),
 futureBudget=number("--future-budget",2,1,100000),
 maxSearchSteps=number("--max-search-steps",4000,1,100000),
 maxGameSteps=number("--max-game-steps",7000,1,100000),
 referenceIndex=number("--reference-index",0,0,100000);
const knowledge=values["--knowledge"]||"fair";
if(!["fair","oracle"].includes(knowledge))throw Error("Invalid knowledge");
const heroes=(values["--heroes"]||"warrior").split(",");
if(heroes.length<1||heroes.length>2||new Set(heroes).size!==heroes.length||
 heroes.some(id=>!HEROES.some(h=>h.id===id)))
 throw Error("--heroes requires one or two distinct printed Hero IDs");
const targetPhase=values["--target-phase"]||"room";
const targetRoom=values["--target-room"]||null;
const out=resolve(values["--out"]||"results/session-contrast-"+seed);
if(existsSync(out))
 throw Error("Output directory already exists, choose a new --out: "+out);
const session=createDecisionSession({seed,heroes});
let sourceStep=null;
for(let step=0;step<maxGameSteps&&session.phase!=="terminal";step++){
 const actions=sessionActions(session);
 const phase=session.pendingNested?
  "reaction:"+session.pendingNested.trigger.phase:session.phase;
 if(phase===targetPhase&&actions.length>=2&&
    (!targetRoom||session.state.room?.id===targetRoom)){
  sourceStep=step;break;
 }
 if(!actions.length)throw Error("No legal navigation action at "+phase);
 const chosen=actions.length===1?actions[0]:
  searchDecision(session,{
   budget:Math.max(navigateBudget,actions.length),
   seed:(seed^Math.imul(step+1,0x85ebca6b))>>>0,
   knowledge,maxSteps:maxSearchSteps
  }).recommended;
 if(!chosen)throw Error("Navigation MCTS returned no legal action");
 submitDecision(session,chosen);
}
if(sourceStep===null)throw Error("Requested decision never reached naturally: "+
 JSON.stringify({targetPhase,targetRoom,seed,heroes}));
console.error("Matched decision: "+JSON.stringify({
 seed,heroes,step:sourceStep,phase:targetPhase,
 roomId:session.state.room?.id,monsterId:session.state.monster?.id,
 choices:sessionActions(session).length,trials,knowledge
}));
const start=Date.now();
const report=compareSessionActions(session,{
 seed:seed^0x27d4eb2f,trials,knowledge,futureBudget,
 maxSearchSteps,maxGameSteps,referenceIndex
});
const git=()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8"}).trim()}catch{return null}};
mkdirSync(out,{recursive:true});
const envelope={...report,
 provenance:{gitSha:git(),sourceSeed:seed,heroes,sourceStep,
  navigateBudget,elapsedSeconds:(Date.now()-start)/1000}};
writeFileSync(join(out,"summary.json"),JSON.stringify(envelope,null,2)+"\n");
const fmt=x=>x===null?"n/a":(100*x).toFixed(2)+"%";
const lines=[
 "# Canonical paired-action comparison","",
 "Source Git SHA: "+envelope.provenance.gitSha,
 "Source seed: "+seed+"; Heroes: "+heroes.join("+"),
 "Decision: "+report.phase+" / "+(report.roomId||"(none)"),
 "Independent paired chance samples: "+trials,
 "Knowledge: "+knowledge+"; future MCTS minimum budget: "+futureBudget,
 "",
 "| Action | Wins | Win rate | Difference vs reference | Discordant +/- | Exact McNemar p | Holm p |",
 "|---|---:|---:|---:|---:|---:|---:|",
 ...report.actions.map((a,i)=>
  "| "+i+" "+JSON.stringify(a.action).replace(/\|/g,"/")+
  " | "+a.wins+"/"+trials+
  " | "+fmt(a.winRate)+
  " | "+fmt(a.differenceVsReference)+
  " | "+a.discordantPositive+"/"+a.discordantNegative+
  " | "+a.mcnemarExactP.toPrecision(4)+
  " | "+(a.holmAdjustedP===null?"reference":a.holmAdjustedP.toPrecision(4))+
  " |"),
 "",
 "## Interpretational limits","",
 report.validity,
 ...report.limitations.map(s=>"- "+s),
 "",
 "These alternatives used identical source state, deck/dice sample seeds,",
 "and future MCTS rules. No untested alternative is assigned a loss.",
 "Multiple source states and familywise correction across cards are",
 "necessary before changing printed balance."
];
writeFileSync(join(out,"summary.md"),lines.join("\n")+"\n");
console.log(join(out,"summary.md"));
