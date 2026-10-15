/**
 * Compare the same canonical equipment transactions with/without a full
 * ExpeditionState fork. This is a microbenchmark, NOT an estimated balance
 * study throughput gain. For that, compare identical oracle:balance pilots.
 *
 * Usage: npm run bench:session-transactions
 * Optional: npm run bench:session-transactions -- --actions 200 --samples 5
 */
import {performance} from "node:perf_hooks";
import {createDecisionSession,sessionActions,submitDecision,observeSession}
 from "../src/engine/decision-session.js";

const params=process.argv.slice(2);
const readNumber=(flag,fallback,min,max)=>{
 const at=params.indexOf(flag);
 if(at<0)return fallback;
 const value=Number(params[at+1]);
 if(!Number.isInteger(value)||value<min||value>max)
  throw Error("Invalid "+flag);
 return value;
};
const actions=readNumber("--actions",200,2,5000);
const samples=readNumber("--samples",5,1,30);
if(actions%2)throw Error("--actions must be even");
const run=(transactional,count)=>{
 const session=createDecisionSession({seed:3573,heroes:["warrior"]});
 const item=session.state.heroes[0].inventory.find(c=>c.id==="sword");
 if(!item||session.state.heroes[0].slots.weapon!==item)
  throw Error("Warrior starter Sword must be owned and equipped");
 for(let i=0;i<count;i++){
  const kind=i%2===0?"unequip":"equip";
  const action=sessionActions(session).find(a=>
   a.kind===kind&&a.cardId==="sword");
  if(!action)throw Error("Missing legal "+kind+" at "+i);
  submitDecision(session,action,{transactional});
 }
 return JSON.stringify(observeSession(session))+"|"+
  session.state.rng.snapshot();
};
const times=mode=>{
 const readings=[];
 for(let i=0;i<samples;i++){
  const begin=performance.now();
  const output=run(mode,actions);
  readings.push({ms:performance.now()-begin,output});
 }
 return readings;
};
// Warm the same code, not a synthetic substitute for canonical rules.
run(false,20);run(true,20);
const full=times(false),direct=times(true);
const digest=full[0].output;
for(const sample of [...full,...direct])
 if(sample.output!==digest)
  throw Error("Canonical outcomes differ between transactional and legacy execution");
const median=a=>a.map(x=>x.ms).sort((x,y)=>x-y)[Math.floor(a.length/2)];
const fullMs=median(full),directMs=median(direct);
console.log(JSON.stringify({
 schema:"rogue-cards-canonical-transaction-microbenchmark-v1",
 actions,samples,identicalCanonically:true,
 legacyFullForkMedianMs:Number(fullMs.toFixed(2)),
 transactionalMedianMs:Number(directMs.toFixed(2)),
 microbenchmarkSpeedup:Number((fullMs/directMs).toFixed(2)),
 note:"Equipment-only canonical decision microbenchmark; not a predicted full-expedition study speedup. Benchmark actual room studies separately."
},null,2));
