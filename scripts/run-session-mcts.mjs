#!/usr/bin/env node
/** Local information-set tree search on the real canonical game.
 *
 * Example:
 * npm run oracle:mcts -- --heroes warrior,wizard --seed 314159 \
 *   --budget 200 --knowledge fair --out results/first-mcts.json
 */
import {createDecisionSession} from "../src/engine/decision-session.js";
import {searchDecision} from "../src/session-mcts.js";
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {HEROES} from "../src/tabletop-data.js";
const allowed=new Set(["--heroes","--seed","--budget","--knowledge",
 "--max-steps","--out"]);
const opts={};
for(let i=2;i<process.argv.length;i++){
 const key=process.argv[i],value=process.argv[i+1];
 if(!allowed.has(key)||opts[key]!==undefined||!value||value.startsWith("--"))
  throw Error("Unknown/duplicate/missing MCTS CLI flag "+key);
 opts[key]=value;i++;
}
const integer=(name,defaultValue,min,max)=>{
 const raw=opts[name]??String(defaultValue),n=Number(raw);
 if(!/^(0|[1-9]\d*)$/.test(raw)||!Number.isSafeInteger(n)||n<min||n>max)
  throw Error(name+" must be an integer in ["+min+","+max+"]");
 return n;
};
const heroes=(opts["--heroes"]||"warrior").split(",");
if(heroes.length<1||heroes.length>2||new Set(heroes).size!==heroes.length||
 heroes.some(id=>!HEROES.some(h=>h.id===id)))
 throw Error("--heroes expects one or two distinct canonical Hero IDs");
const seed=integer("--seed",314159,1,0xffffffff),
 budget=integer("--budget",100,1,100000),
 maxSteps=integer("--max-steps",4000,1,100000),
 knowledge=opts["--knowledge"]||"fair";
if(!["fair","oracle"].includes(knowledge))
 throw Error("--knowledge expects fair or oracle");
const session=createDecisionSession({seed,heroes});
const start=Date.now();
const result=searchDecision(session,{budget,seed,knowledge,maxSteps});
const report={
  schema:"Rogue Cards canonical session MCTS v1",
  seed,heroes,knowledge,budget,maxSteps,
  elapsedSeconds:(Date.now()-start)/1000,
  gitSha:(()=>{try{return execFileSync("git",["rev-parse","HEAD"],{
   encoding:"utf8"}).trim()}catch{return null}})(),
  ...result
};
const out=opts["--out"];
if(out){const file=resolve(out);mkdirSync(dirname(file),{recursive:true});
 writeFileSync(file,JSON.stringify(report,null,2)+"\n");
 console.error("Wrote "+file);
}
console.log(JSON.stringify(report,null,2));
