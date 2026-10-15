/** A side-effect-free copy of the established independent-pair win test.
 * Deliberately does NOT import the agent-strength script because that
 * script is a worker entry point with message handlers.
 */
export const pairedAgentStatistics=records=>{
 const n=records.length;
 let positive=0,negative=0,ties=0,baseWins=0,candWins=0;
 let baseRollouts=0,candRollouts=0;
 for(const row of records){
  const a=row.baseline.won,b=row.candidate.won;
  if(![0,1].includes(a)||![0,1].includes(b))
   throw Error("Invalid paired terminal result");
  baseWins+=a;candWins+=b;
  baseRollouts+=row.baseline.requestedRollouts;
  candRollouts+=row.candidate.requestedRollouts;
  if(b>a)positive++;
  else if(b<a)negative++;
  else ties++;
 }
 const discordant=positive+negative;
 let p=1;
 if(discordant){
  const k=Math.min(positive,negative);
  // Numerically stable exact two-sided conditional McNemar/binomial.
  let term=Math.pow(0.5,discordant),tail=term;
  // Avoid underflow for very large N using log-factorial/LSE.
  if(discordant>900){
   const logFact=[0];
   for(let j=1;j<=discordant;j++)
    logFact[j]=logFact[j-1]+Math.log(j);
   let logMax=-Infinity,logs=[];
   for(let j=0;j<=k;j++){
    const v=logFact[discordant]-logFact[j]-
     logFact[discordant-j]-discordant*Math.LN2;
    logs.push(v);if(v>logMax)logMax=v;
   }
   tail=Math.exp(logMax)*logs.reduce((acc,v)=>
    acc+Math.exp(v-logMax),0);
  }else for(let j=1;j<=k;j++){
   term*= (discordant-j+1)/j;
   tail+=term;
  }
  p=Math.min(1,2*tail);
 }
 const difference=n?(candWins-baseWins)/n:0;
 const variance=n?(positive+negative)/n-difference*difference:0;
 const margin=n?1.95996398454*Math.sqrt(Math.max(0,variance)/n):null;
 return {
  independentPairs:n,
  baselineWins:baseWins,candidateWins:candWins,
  baselineWinRate:n?baseWins/n:null,candidateWinRate:n?candWins/n:null,
  pairedDifference:n?difference:null,
  paired95:n?[Math.max(-1,difference-margin),
   Math.min(1,difference+margin)]:null,
  improvedSeeds:positive,worsenedSeeds:negative,tiedSeeds:ties,
  exactMcNemarP:discordant?p:null,
  baselineRequestedRollouts:baseRollouts,
  candidateRequestedRollouts:candRollouts,
  computationalEffortRatio:baseRollouts?candRollouts/baseRollouts:null,
  minimumPowerGate:n>=100,
  verdict:n<100?"UNDERPOWERED":p<0.05&&positive>negative?
   "EVIDENCE_CANDIDATE_BETTER":p<0.05?
   "EVIDENCE_CANDIDATE_WORSE":"INCONCLUSIVE"
 };
};
