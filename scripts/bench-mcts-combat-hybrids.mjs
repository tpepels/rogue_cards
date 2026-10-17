#!/usr/bin/env node
/**
 * Equal-budget three-way MCTS rollout ablation:
 * baseline UCT, UCT + sampled combat expectimax,
 * UCT + sampled combat expectimax + implicit backups.
 *
 * Runtime is reported separately; equal rollout budgets are NOT equal CPU
 * budgets. Experimental code never alters game rules or production defaults.
 */
import {mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {MONSTERS} from "../src/tabletop-data.js";
import {EXTRA_MONSTERS} from "../src/monster-expansion.js";
import {makeEncounter} from "./study-combat-causes.mjs";
import {searchDecision,mctsActionKey} from "../src/session-mcts.js";
import {CLASSIC_UCT_C,HYBRID_UCT_C,HYBRID_IMPLICIT_ALPHA}
 from "../src/mcts-hybrid-defaults.js";

const monsters=[...MONSTERS,...EXTRA_MONSTERS];
// Four arms isolate the effect of C, expectimax and implicit backups.
const arms=[
 {name:"uct-classic",rolloutCombatMode:"random",implicitWeight:0,
  exploration:CLASSIC_UCT_C},
 {name:"uct-low-c",rolloutCombatMode:"random",implicitWeight:0},
 {name:"uct-expectimax",rolloutCombatMode:"sampled-expectimax",implicitWeight:0},
 {name:"uct-expectimax-implicit",rolloutCombatMode:"sampled-expectimax"}
];
export function runHybridAblation({
 monsterIds=["crawler","wisp"],budget=8,samples=1,seed=20261017,
 maxSteps=5000,c=HYBRID_UCT_C,alpha=HYBRID_IMPLICIT_ALPHA,
 tacticalMax=2,
 out="results/mcts-combat-hybrids-"+seed,write=true
}={}){
 if(!Number.isInteger(budget)||budget<1||budget>1000||
  !Number.isInteger(samples)||samples<1||samples>6||
  !Number.isInteger(seed)||seed<1||
  !Number.isInteger(maxSteps)||maxSteps<1||maxSteps>100000||
  !Number.isFinite(c)||c<0||c>10||
  !Number.isFinite(alpha)||alpha<0||alpha>1||
  !Number.isInteger(tacticalMax)||tacticalMax<1||tacticalMax>64)
  throw Error("Invalid MCTS ablation configuration");
 const rows=[];
 for(const monsterId of monsterIds){
  const monster=monsters.find(m=>m.id===monsterId);
  if(!monster)throw Error("Unknown Monster "+monsterId);
  const session=makeEncounter(monster,["warrior","knight"],seed);
  for(const arm of arms){
   const effectiveC=arm.exploration??c;
   const effectiveAlpha=arm.implicitWeight??alpha;
   const start=performance.now();
   const result=searchDecision(session,{
    budget,seed,knowledge:"fair",treeMode:"frontier",maxSteps,
    strictTerminal:true,collectCoverage:false,
    rolloutCombatMode:arm.rolloutCombatMode,
    rolloutCombatSamples:samples,implicitWeight:effectiveAlpha,
    rolloutCombatMaxDecisions:tacticalMax,
    exploration:effectiveC
   });
   const elapsedMs=performance.now()-start;
   rows.push({
    monsterId,arm:arm.name,budget,samples,elapsedMs,
    exploration:effectiveC,implicitWeight:effectiveAlpha,
    tacticalMax,
    completed:result.completed,incomplete:result.incomplete,
    terminalWins:result.terminalWins,
    recommended:result.recommended?mctsActionKey(result.recommended):null,
    rolloutCombatSearches:result.rolloutCombatSearches||0,
    treeNodes:result.treeNodes,
    implicitRootValue:result.implicitRootValue??null
   });
   if(write)console.log(monsterId+" "+arm.name+" "+elapsedMs.toFixed(1)+
    "ms rollouts="+result.completed+" tactical="+
    (result.rolloutCombatSearches||0)+
    " wins="+result.terminalWins+
    " C="+effectiveC+" alpha="+effectiveAlpha);
  }
 }
 const report={schema:"mcts-combat-hybrid-ablation-v1",
  design:{monsterIds,budget,samples,seed,maxSteps,c,alpha,tacticalMax,
   knowledge:"fair",
   treeMode:"frontier",strictTerminal:true},
  caveats:[
   "The low-C UCT control isolates the exploration coefficient before testing expectimax and implicit backups",
   "rolloutCombatSearches is capped per full MCTS trial, not per Monster encounter; a cap of 8 was exhausted on every trial in the original 16-rollout pilot",
   "Equal rollout counts are NOT equal CPU budgets",
   "No difference in terminal win counts does not prove decision equivalence",
   "Implicit values remain separate from terminal win counts",
   "This study measures canonical simulated expeditions starting at an isolated encounter, not natural encounter frequencies"
  ],rows};
 if(write){
  const dir=resolve(out);
  if(existsSync(dir))throw Error("Output directory already exists: "+dir);
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"summary.json"),JSON.stringify(report,null,2)+"\n");
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 const allowed=new Set(["--monsters","--budget","--samples","--seed","--max-steps","--c","--alpha","--tactical-max","--out"]);
 for(let i=0;i<args.length;i+=2){
  if(!allowed.has(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))
   throw Error("Unknown or missing MCTS ablation argument "+args[i]);
  options[args[i]]=args[i+1];
 }
 runHybridAblation({
  monsterIds:options["--monsters"]?.split(",")??["crawler","wisp"],
  budget:Number(options["--budget"]??8),
  samples:Number(options["--samples"]??1),
  seed:Number(options["--seed"]??20261017),
  maxSteps:Number(options["--max-steps"]??5000),
  c:Number(options["--c"]??HYBRID_UCT_C),
  alpha:Number(options["--alpha"]??HYBRID_IMPLICIT_ALPHA),
  tacticalMax:Number(options["--tactical-max"]??2),
  out:options["--out"]??"results/mcts-combat-hybrids-"+(options["--seed"]??20261017)
 });
}
