/**
 * Compare old per-action deck sampling against shared-deck scenario forks.
 * Pure local microbenchmark: no winning percentages or sampling claims.
 * npm run bench:rollout-scenarios -- --samples 300 --choices 4
 */
import {performance} from "node:perf_hooks";
import {ExpeditionState} from "../src/engine/index.js";
import {randomSource} from "../src/engine/random.js";
import {forkExpeditionState,cloneRolloutState,prepareRolloutDecks}
 from "../src/rollout-state.js";
const args=process.argv.slice(2),read=(name,fallback)=>{
 const at=args.indexOf(name);
 return at<0?fallback:Number(args[at+1]);
};
if(args.some((a,i)=>a.startsWith("--")&&!["--samples","--choices"].includes(a)))
 throw Error("Usage: npm run bench:rollout-scenarios -- --samples 300 --choices 4");
const samples=read("--samples",300),choices=read("--choices",4);
if(!Number.isInteger(samples)||samples<10||samples>10000||
 !Number.isInteger(choices)||choices<2||choices>15)
 throw Error("Require 10..10000 samples and 2..15 alternatives");
const s=new ExpeditionState({seed:719391,heroes:["warrior","wizard"],strategy:"magic"});
s.beginRoom(s.rooms.UPPER.shift());
const knowledge="fair",blueprint=prepareRolloutDecks(s,knowledge);
const scenarios=Array.from({length:samples},(_,i)=>({
 diceSeed:(0x48217a2f+i*0x9e3779b1)>>>0,
 deckSeed:(0x1835a73f+i*0x85ebca6b)>>>0
}));
function old(seeds){
 let checksum=0;
 for(let k=0;k<choices;k++){
  const f=forkExpeditionState(s,{...seeds,knowledge,blueprint});
  checksum+=f.deck.length+f.die()+f.rooms.UPPER.length;
 }
 return checksum;
}
function shared(seeds){
 const base=forkExpeditionState(s,{...seeds,knowledge,blueprint});
 let checksum=0;
 for(let k=choices-1;k>=0;k--){
  const f=k===0?base:cloneRolloutState(base);
  if(k!==0)f.rng=randomSource(seeds.diceSeed);
  checksum+=f.deck.length+f.die()+f.rooms.UPPER.length;
 }
 return checksum;
}
for(const seed of scenarios.slice(0,Math.min(25,scenarios.length))){
 if(old(seed)!==shared(seed))
  throw Error("Shared-deck optimization changed the sampled dice/decks");
}
const variants=[{name:"before: sample hidden deck for every action",fn:old},
 {name:"after: sample once, clone branch state",fn:shared}];
for(let w=0;w<2;w++)for(const v of variants)
 for(const seed of scenarios.slice(0,20))v.fn(seed);
const measured=variants.map(v=>({name:v.name,rounds:[]}));
for(let run=0;run<5;run++){
 for(const k of [run%2,(run+1)%2]){
  const start=performance.now();let checksum=0;
  for(const seed of scenarios)checksum+=variants[k].fn(seed);
  measured[k].rounds.push((performance.now()-start)/samples);
  measured[k].checksum=checksum;
 }
}
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
if(measured[0].checksum!==measured[1].checksum)
 throw Error("Simulation checksums diverged");
process.stdout.write(JSON.stringify({
 node:process.version,samples,choices,units:"milliseconds per scenario",
 checksumsMatch:true,
 measurements:measured.map(x=>({
  name:x.name,medianMs:median(x.rounds),runs:x.rounds
 })),
 speedup:median(measured[0].rounds)/median(measured[1].rounds),
 warning:"Microbenchmark for deck sampling + state cloning only; "+
 "real-run speed also depends on resolving full Room/Monster decisions."
},null,2)+"\n");
