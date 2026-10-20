/** Uncertainty for fixed Hero strata and matched initial seeds. Matching seeds
 * does not imply identical RNG consumption after a physical intervention. */
export const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
export function randomSource(seed=1){
 let s=seed>>>0;
 return ()=>{s=(s+0x6d2b79f5)>>>0;let t=Math.imul(s^(s>>>15),s|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
// Inverse standard-normal CDF (Acklam approximation).
export function normalQuantile(p){
 if(!(p>0&&p<1))throw Error('Probability must be inside (0,1)');
 const a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924],
 b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857],
 c=[-0.00778489400243029,-0.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878],
 d=[0.00778469570904146,0.32246712907004,2.445134137143,3.75440866190742];
 const tail=q=>(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
 if(p<0.02425)return tail(Math.sqrt(-2*Math.log(p)));
 if(p>0.97575)return -tail(Math.sqrt(-2*Math.log(1-p)));
 const q=p-0.5,r=q*q;
 return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
export function wilsonInterval(successes,n,confidence=0.95){
 if(!n)return null;
 if(!Number.isSafeInteger(n)||n<0||successes<0||successes>n)throw Error('Invalid binomial counts');
 const z=normalQuantile((1+confidence)/2),p=successes/n,z2=z*z,d=1+z2/n;
 const mid=(p+z2/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/d;
 return [Math.max(0,mid-half),Math.min(1,mid+half)];
}
function stratifiedSumVariance(rows,get){
 const groups=new Map();
 for(const row of rows){const v=get(row);if(!Number.isFinite(v))return null;const key=row.party+'|'+(row.profileHash??row.profile??'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(v);}
 let variance=0;
 for(const values of groups.values()){
  if(values.length<2)return null;
  const center=mean(values),sampleVariance=values.reduce((n,v)=>n+(v-center)**2,0)/(values.length-1);
  variance+=values.length*sampleVariance;
 }
 return groups.size?variance:null;
}
/** Normal/delta-method intervals condition on the fixed party strata;
 * one expedition is the observational unit, never an individual fight.
 * Confirmation separately requires the predeclared per-party sample floor. */
export function meanInterval(rows,metric,{confidence=0.95,bounds=null}={}){
 const get=typeof metric==='function'?metric:r=>r[metric],values=rows.map(get),estimate=values.every(Number.isFinite)?mean(values):null,
  variance=estimate===null?null:stratifiedSumVariance(rows,get);
 const se=variance===null?null:Math.sqrt(variance)/rows.length,z=normalQuantile((1+confidence)/2);
 return {estimate,standardError:se,interval:se===null?null:[Math.max(bounds?.[0]??-Infinity,estimate-z*se),Math.min(bounds?.[1]??Infinity,estimate+z*se)],method:'fixed-party stratified normal approximation over complete expeditions'};
}
export function ratioInterval(rows,numerator,denominator,{confidence=0.95,bounds=null}={}){
 const getN=typeof numerator==='function'?numerator:r=>r[numerator],getD=typeof denominator==='function'?denominator:r=>r[denominator],
  observed=rows.length&&rows.every(r=>Number.isFinite(getN(r))&&Number.isFinite(getD(r))),sumD=observed?rows.reduce((n,r)=>n+getD(r),0):0,
  estimate=sumD>0?rows.reduce((n,r)=>n+getN(r),0)/sumD:null,
  variance=estimate===null?null:stratifiedSumVariance(rows,r=>getN(r)-estimate*getD(r)),se=variance===null?null:Math.sqrt(variance)/sumD,z=normalQuantile((1+confidence)/2);
 return {estimate,standardError:se,interval:se===null?null:[Math.max(bounds?.[0]??-Infinity,estimate-z*se),Math.min(bounds?.[1]??Infinity,estimate+z*se)],method:'fixed-party stratified delta-method ratio of expedition totals'};
}
const quantile=(sorted,p)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.floor(p*(sorted.length-1))))];
export function stratifiedBootstrap(rows,metric,{seed=1,samples=2000,confidence=0.95}={}){
 const get=typeof metric==='function'?metric:r=>r[metric];
 const groups=new Map();
 for(const r of rows)if(Number.isFinite(get(r))){const k=r.party+'|'+(r.profileHash??r.profile??'');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(get(r));}
 if(!groups.size)return {estimate:null,interval:null,strata:0};
 const rng=randomSource(seed),strata=[...groups.values()],draws=[];
 for(let i=0;i<samples;i++)draws.push(mean(strata.map(values=>{
  let sum=0;for(let j=0;j<values.length;j++)sum+=values[Math.floor(rng()*values.length)];return sum/values.length;
 })));
 draws.sort((a,b)=>a-b);
 return {estimate:mean(strata.map(mean)),interval:[quantile(draws,(1-confidence)/2),quantile(draws,(1+confidence)/2)],strata:strata.length,samples,
  method:'within-fixed-party-strata bootstrap; conditional on the eight fixed Heroes'};
}
const pairKey=r=>[r.party,r.seed,r.profileHash??r.profile??''].join('|');
export function pairedComparison(baseline,candidate,metric='won',{confidence=0.95,samples=2000,seed=1}={}){
 const unique=rows=>{const m=new Map();for(const r of rows){const k=pairKey(r);if(m.has(k))throw Error('Duplicate paired trial '+k);m.set(k,r);}return m;};
 const a=unique(baseline),b=unique(candidate),pairs=[];
 for(const [k,row] of b){const base=a.get(k);if(base&&Number.isFinite(row[metric])&&Number.isFinite(base[metric]))pairs.push({party:row.party,stratum:row.party+'|'+(row.profileHash??row.profile??''),seed:row.seed,delta:row[metric]-base[metric]});}
 if(!pairs.length)return {pairs:0,difference:null,interval:null,partyClusters:0,seedClusters:0};
 // Resample shared seed blocks, then party clusters: conservative two-way
 // bootstrap preserves cross-Hero pairing from common random initial seeds.
 const parties=[...new Set(pairs.map(r=>r.stratum))],seeds=[...new Set(pairs.map(r=>r.seed))],rng=randomSource(seed),draws=[];
 const cells=new Map(pairs.map(r=>[r.stratum+'|'+r.seed,r.delta]));
 for(let i=0;i<samples;i++){
  const ps=parties.map(()=>parties[Math.floor(rng()*parties.length)]),ss=seeds.map(()=>seeds[Math.floor(rng()*seeds.length)]),values=[];
  for(const p of ps)for(const s of ss){const d=cells.get(p+'|'+s);if(d!==undefined)values.push(d);}
  if(values.length)draws.push(mean(values));
 }
 draws.sort((a,b)=>a-b);
 return {pairs:pairs.length,difference:mean(pairs.map(r=>r.delta)),
  interval:draws.length?[quantile(draws,(1-confidence)/2),quantile(draws,(1+confidence)/2)]:null,
  partyClusters:new Set(pairs.map(r=>r.party)).size,profileStrata:parties.length,seedClusters:seeds.length,
  method:'two-way party and initial-seed block bootstrap; seed coupling can diverge'};
}
