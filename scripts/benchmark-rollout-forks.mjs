/**
 * Isolated, reproducible microbenchmark of the costly rollout fork path.
 *
 * node scripts/benchmark-rollout-forks.mjs --samples 300
 *
 * Measures three variants on the SAME state, deck/dice seeds and Node
 * process. Prints measured timings instead of a speculative speedup claim.
 * This is not the complete expedition runtime / agent win rate.
 */
import {performance} from "node:perf_hooks";
import {ExpeditionState} from "../src/expedition-runtime.js";
import {prepareRolloutDecks,forkExpeditionState} from "../src/rollout-state.js";
import {validateAgentConfig,AGENT_WEIGHTS} from "../src/research-agent.js";

const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==="--samples"))
 throw Error("Usage: node scripts/benchmark-rollout-forks.mjs [--samples 300]");
const samples=Number(args[1]??300);
if(!Number.isSafeInteger(samples)||samples<20||samples>100000)
 throw Error("Samples must be an integer from 20 to 100000");

const median=xs=>{
 const list=[...xs].sort((a,b)=>a-b);
 return list[Math.floor(list.length/2)];
};
const state=()=>new ExpeditionState({seed:819313,
 heroes:["warrior","wizard"],strategy:"magic"});
const s=state();
s.beginRoom(s.rooms.UPPER.shift());
s.researchPolicy="agent";
s.agentConfig=validateAgentConfig({knowledge:"fair",weights:AGENT_WEIGHTS,
 budget:8,planning:"rollout",samplingSeed:23213});
s.plannerRisk="cautious";
const controls=[
 {name:"structured / prepare each fork",mode:"structured",cache:false},
 {name:"structured / prepared once",mode:"structured",cache:true},
 {name:"card-aware / prepared once",mode:"card-aware",cache:true}
];
function run(spec,iterations,offset){
 let checksum=0;
 const prepared=spec.cache?prepareRolloutDecks(s,"fair"):null;
 const start=performance.now();
 for(let i=0;i<iterations;i++){
  const fork=forkExpeditionState(s,{knowledge:"fair",
   diceSeed:100030+offset+i,deckSeed:900029+offset+i,
   cloneMode:spec.mode,blueprint:prepared});
  checksum+=(fork.deck.length+
   fork.heroes.reduce((n,h)=>n+h.hp,0)+fork.die());
 }
 return {ms:performance.now()-start,checksum};
}
// All three variants MUST produce precisely identical outcomes for identical
// hypotheticals, not merely similar statistical distributions.
for(const scenario of [0,1,17,32]){
 const values=controls.map(spec=>run(spec,1,scenario));
 if(new Set(values.map(x=>x.checksum)).size!==1)
  throw Error("Clone variants produced different sampled outcomes");
}
const rounds=5,scores=controls.map(()=>[]);
for(let warm=0;warm<3;warm++)
 for(const spec of controls)run(spec,Math.min(samples,50),warm*1000);
for(let round=0;round<rounds;round++){
 // Rotate ordering so GC/JIT warmup is not always allocated to one variant.
 for(let k=0;k<controls.length;k++){
  const i=(round+k)%controls.length;
  if(globalThis.gc)globalThis.gc();
  const measurement=run(controls[i],samples,round*samples);
  scores[i].push(measurement.ms/samples);
 }
}
const basems=median(scores[0]);
const report={node:process.version,samplesPerRound:samples,
 rounds,mode:"single process, two Hero party, UPPER Room, fair hidden decks",
 measurements:controls.map((spec,i)=>({
  variant:spec.name,msPerFork:median(scores[i]),
  microbenchmarkSpeedupVsOriginal:basems/median(scores[i]),
  msPerForkByRound:scores[i]
 })),caveat:"Microbenchmark only. Full-expedition performance also depends on "+
 "Room fights, Items, legal action count, sampling budget and Worker overhead."};
process.stdout.write(JSON.stringify(report,null,2)+"\n");
