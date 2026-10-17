#!/usr/bin/env node
/**
 * Diagnose MCTS root decisions without rerunning whole expedition cohorts.
 *
 * Real canonical full-expedition UCT rollouts from controlled, printed-card
 * combat positions. Produces root visit/win counts and tie diagnostics.
 * These positions are constructed, not sampled from natural game exposure.
 */
import {mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {MONSTERS} from "../src/tabletop-data.js";
import {EXTRA_MONSTERS} from "../src/monster-expansion.js";
import {makeEncounter} from "./study-combat-causes.mjs";
import {sessionActions,submitDecision} from "../src/engine/decision-session.js";
import {searchDecision,mctsActionKey} from "../src/session-mcts.js";

const monsterSet=[...MONSTERS,...EXTRA_MONSTERS];
const defaults=["wisp","troll","crawler","sentinel"];
function parse(argv){
 const opts={};
 const allowed=new Set(["--monsters","--low","--high","--max-search-steps","--seed","--out"]);
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!allowed.has(k)||!v||v.startsWith("--")||Object.hasOwn(opts,k))
   throw Error("Invalid argument "+k);
  opts[k]=v;
 }
 const num=(key,def,min,max)=>{
  const s=opts[key]??String(def),n=Number(s);
  if(!Number.isSafeInteger(n)||n<min||n>max)
   throw Error("Bad "+key);
  return n;
 };
 const ids=(opts["--monsters"]??defaults.join(",")).split(",");
 if(ids.length<1||ids.length>12||new Set(ids).size!==ids.length||
  ids.some(id=>!monsterSet.some(m=>m.id===id)))
  throw Error("Invalid --monsters IDs");
 return {ids,low:num("--low",2,1,256),high:num("--high",16,2,256),
  maxSteps:num("--max-search-steps",5000,100,20000),
  seed:num("--seed",20261017,1,0xffffffff),
  out:opts["--out"]??"results/mcts-root-probes-"+(opts["--seed"]??20261017)};
}
const mix=n=>{
 n=(n+0x9e3779b9)>>>0;n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);return(n^(n>>>16))>>>0;
};
function main(){
 const c=parse(process.argv.slice(2)),dir=resolve(c.out);
 if(existsSync(dir))throw Error("Output directory exists: "+dir);
 const results=[];
 for(let i=0;i<c.ids.length;i++){
  const monster=monsterSet.find(m=>m.id===c.ids[i]);
  const scenarioSeed=mix(c.seed^Math.imul(i+1,0x9e3779b9));
  const session=makeEncounter(monster,["warrior","knight"],scenarioSeed);
  // Root at a real combat choice, not the trivial 'choose acting Hero' phase.
  const first=sessionActions(session)[0];
  if(first?.kind!=="choose-hero-turn")throw Error("No combat Hero selector");
  submitDecision(session,first,{observeResult:false,recordHistory:false});
  const legal=sessionActions(session);
  if(!legal.some(a=>a.kind==="attack"))
   throw Error("No combat attack in "+monster.id);
  for(const [arm,budget] of [["low",c.low],["high",c.high]]){
   const actualBudget=Math.max(budget,legal.length);
   const result=searchDecision(session,{
    budget:actualBudget,seed:mix(scenarioSeed^0x85ebca6b),
    knowledge:"fair",maxSteps:c.maxSteps,strictTerminal:true,
    collectCoverage:false,rootActions:legal,treeMode:"full"
   });
   const firstKey=mctsActionKey(legal[0]);
   const chosenKey=mctsActionKey(result.recommended);
   const row={monsterId:monster.id,stage:monster.stage,
    arm,requestedBudget:budget,actualBudget,
    actions:legal.length,allRootActionsSampled:result.rootEveryActionTried,
    terminalWins:result.terminalWins,terminalRollouts:result.completed,
    allActionWinsZero:result.choices.every(x=>x.wins===0),
    choseFirstLegalAction:firstKey===chosenKey,
    recommended:result.recommended,
    root:result.choices.map(x=>({
     action:x.action,visits:x.visits,wins:x.wins,
     estimatedWinRate:x.estimatedWinRate
    }))
   };
   results.push(row);
   console.log([monster.id,arm,"visits="+actualBudget,
    "wins="+row.terminalWins,"all zero="+row.allActionWinsZero,
    "first action="+row.choseFirstLegalAction].join(" | "));
  }
 }
 const report={schema:"mcts-root-probes-v1",
  description:"Root-action visit/win evidence on isolated canonical combat starts",
  design:c,
  results,
  limitations:[
   "Not naturally sampled combat states or full-run win rates",
   "When all root action scores are zero, raw visit counts and action order matter",
   "A low budget is lifted to the number of legal actions by the existing policy",
   "Only exact canonical terminal wins are counted; no HP heuristic",
   "Search consumes hypothetical dice only; session is not changed by search"
  ]};
 mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,"summary.json"),JSON.stringify(report,null,2)+"\n");
 console.log("Wrote "+join(dir,"summary.json"));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
