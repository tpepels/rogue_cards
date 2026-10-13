/**
 * Current V4 Item value screen: controlled extra-existing-copy intervention.
 * Tests whether moving one Item from the deck to a starting Hero's hand
 * changes winning under explicit scripted strategies. NOT intrinsic Item rank.
 *
 * npm run study:v4-item-value -- --runs 60 --seed 20261013 --out results/v4-item-value
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {OBJECTS} from "../src/tabletop-data.js";
import {simulateFullExpedition} from "../src/expedition-campaign.js";

const PARTIES=[["knight"],["wizard"],["rogue"],["priest"],
 ["warrior","wizard"],["monk","witch"]];
const STRATEGIES=["survival","magic","seal"];
const argv=process.argv.slice(2);
const arg=(flag,def)=>{
 const at=argv.indexOf(flag);
 if(at<0)return def;
 if(at===argv.length-1)throw Error("Missing value for "+flag);
 return argv[at+1];
};
const runs=Number(arg("--runs","60"));
const seed=Number(arg("--seed","20261013"));
const out=resolve(arg("--out","results/v4-item-value"));
if(!Number.isSafeInteger(runs)||runs<1||runs>400||
 !Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)
 throw Error("Invalid study runs / seed");
for(let i=0;i<argv.length;i+=2)
 if(!["--runs","--seed","--out"].includes(argv[i])||i===argv.length-1)
  throw Error("Unknown argument "+argv[i]);
const total=OBJECTS.length*PARTIES.length*STRATEGIES.length*runs*2;
if(total>750000)throw Error("Requested study exceeds 750,000 expeditions");
const seedAt=(cohort,i)=>{
 return ((seed+Math.imul(cohort+1,0x85ebca6b)+
  Math.imul(i+1,0x9e3779b1))>>>0)||1;
};
const ctrlCache=new Map();
let simulated=0,excluded=0;
function run(opts){
 const r=simulateFullExpedition(opts);simulated++;
 if(r.unresolved||r.roundLimit)
  throw Error("Unresolved effect/round limit: "+JSON.stringify(opts));
 return r;
}
function baseline(cohort,i,heroes,strategy){
 const key=cohort+":"+i;
 if(!ctrlCache.has(key))
  ctrlCache.set(key,run({seed:seedAt(cohort,i),heroes,strategy}));
 return ctrlCache.get(key);
}
function count(map,key,n=1){map[key]=(map[key]||0)+n;}
const byItem=[];
for(const card of OBJECTS){
 let n=0,controlWins=0,giftWins=0,onlyControl=0,onlyGift=0,
  acquired=0,opportunities=0,uses=0,passive=0,controlUse=0,
  giftHeldWin=0,giftHeldLose=0,changedEnding=0,changedVault=0,
  controlDamage=0,giftDamage=0;
 const styles={},parties={},endingsBefore={},endingsAfter={};
 for(const [pi,heroes] of PARTIES.entries())for(const [si,strategy] of STRATEGIES.entries()){
  const cohort=pi*STRATEGIES.length+si;
  const counter=styles[strategy]??={n:0,diff:0};
  const partyKey=heroes.join("+");
  const partyCounter=parties[partyKey]??={n:0,diff:0};
  for(let i=0;i<runs;i++){
   const original=baseline(cohort,i,heroes,strategy);
   const extra=run({seed:seedAt(cohort,i),heroes,strategy,extraObjectId:card.id});
   if(!extra.extraObjectGranted){excluded++;continue;}
   n++;counter.n++;partyCounter.n++;
   const diff=Number(extra.won)-Number(original.won);
   counter.diff+=diff;partyCounter.diff+=diff;
   controlWins+=Number(original.won);giftWins+=Number(extra.won);
   onlyControl+=Number(!!original.won&&!extra.won);
   onlyGift+=Number(!original.won&&!!extra.won);
   acquired+=extra.objectAcquisitions[card.id]||0;
   opportunities+=extra.itemOpportunities?.[card.id]?.total||0;
   uses+=extra.itemUses?.[card.id]?.total||0;
   passive+=extra.itemPassiveEffects?.[card.id]?.triggers||0;
   controlUse+=original.itemUses?.[card.id]?.total||0;
   if(extra.won)giftHeldWin++;
   else giftHeldLose++;
   controlDamage+=original.damage;giftDamage+=extra.damage;
   const a=original.endingKind||"none",b=extra.endingKind||"none";
   count(endingsBefore,a);count(endingsAfter,b);
   changedEnding+=Number(a!==b);
   changedVault+=Number(Boolean(original.vaultEntered||original.vaultState)!==
    Boolean(extra.vaultEntered||extra.vaultState));
  }
 }
 const difference=n?(giftWins-controlWins)/n:null,
  discordant=onlyControl+onlyGift;
 const se=n?Math.sqrt(Math.max(0,discordant/n-difference*difference)/n):null;
 byItem.push({
  id:card.id,title:card.title,family:card.v2.kind,copies:card.copies,
  trials:PARTIES.length*STRATEGIES.length*runs,eligible:n,excluded:PARTIES.length*STRATEGIES.length*runs-n,
  controlWins,giftWins,onlyControl,onlyGift,
  controlWinRate:n?controlWins/n:null,giftWinRate:n?giftWins/n:null,
  giftDelta:difference,paired95CI:n?
   [difference-1.96*se,difference+1.96*se]:null,
  meanDamageDelta:n?(giftDamage-controlDamage)/n:null,
  changedEndingRate:n?changedEnding/n:null,
  changedVaultArrivalRate:n?changedVault/n:null,
  giftItemAcquisitions:acquired,giftItemOpportunities:opportunities,
  giftItemUses:uses,giftItemPassive:passive,controlItemUses:controlUse,
  byStrategy:Object.fromEntries(Object.entries(styles).map(([id,x])=>[id,{
   n:x.n,giftDelta:x.n?x.diff/x.n:null
  }])),
  byParty:Object.fromEntries(Object.entries(parties).map(([id,x])=>[id,{
   n:x.n,giftDelta:x.n?x.diff/x.n:null
  }])),
  endingsBefore,endingsAfter
 });
 process.stderr.write("Gift "+card.id+" / "+n+" eligible pairs\n");
}
byItem.sort((a,b)=>b.giftDelta-a.giftDelta);
const winners=byItem.filter(x=>x.paired95CI&&x.paired95CI[0]>0),
 harmful=byItem.filter(x=>x.paired95CI&&x.paired95CI[1]<0);
function fmt(n){return n===null?"n/a":(n*100>=0?"+":"")+(n*100).toFixed(2)+" pp";}
function render(){
 const s=["# V4 Item utility screen","",
 "All "+OBJECTS.length+" existing Item designs; simulation commit "+(commit||"unknown"),
 "Seed "+seed+" | "+simulated+" actual expeditions; "+runs+
 " paired starting seeds per party/strategy/Item.",
 "Same initial seed and rules, but an additional existing Item copy is transferred out of the Item deck to the first Hero's starting hand.",
 "The experiment measures benefit of early acquisition, **not intrinsic card strength or optimal play**.",
 "","## Strongest positive gift effects (exploratory, unadjusted paired intervals)","",
 "| Item | Eligible pairs | Gift win delta | 95% paired interval | Recorded uses / passive applications |",
 "|---|---:|---:|---|---:|"];
 for(const x of byItem.slice(0,12))s.push("| "+x.title+" | "+x.eligible+" | "+fmt(x.giftDelta)+
  " | "+x.paired95CI.map(fmt).join(" to ")+
  " | "+x.giftItemUses+" / "+x.giftItemPassive+" |");
 s.push("","## Weakest or negative gift effects","",
 "| Item | Eligible pairs | Gift win delta | 95% paired interval | Recorded opportunities / uses |",
 "|---|---:|---:|---|---:|");
 for(const x of byItem.slice(-12).reverse())s.push("| "+x.title+" | "+x.eligible+" | "+fmt(x.giftDelta)+
 " | "+x.paired95CI.map(fmt).join(" to ")+
 " | "+x.giftItemOpportunities+" / "+x.giftItemUses+" |");
 s.push("","Unadjusted confidence intervals excluding zero: "+winners.length+
 " positive, "+harmful.length+" negative. This is an exploratory 52-way screen;",
 "false positives are expected without multiple-comparison correction.",
 "","No-gift-distribution proof of uselessness or overpoweredness is possible from this experiment.",
 "Full per-Item data and Hero/strategy splits in detail.json.");
 return s.join("\n")+"\n";
}
let commit=null;
try{commit=execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
const report={kind:"v4-conditional-existing-item-gift",commit,seed,runs,
 simulated,eligible:byItem.reduce((x,r)=>x+r.eligible,0),
 excluded,totalRequestedSimulations:total,parties:PARTIES,strategies:STRATEGIES,
 itemCount:OBJECTS.length,ranked:byItem,positiveUnadjusted:winners.map(x=>x.id),
 negativeUnadjusted:harmful.map(x=>x.id),
 limitations:[
  "Moving a copy out of the deck changes supply/order, and early acquisition is more useful than late acquisition.",
  "These scripted strategies are not a strong optimal human Item player.",
  "Identical starting seeds do not force identical subsequent RNG histories.",
  "A conditional Item's value may be negligible despite genuinely useful rare interactions.",
  "Reported 95% intervals are exploratory and unadjusted for 52 Items."
 ]};
mkdirSync(out,{recursive:true});
writeFileSync(join(out,"detail.json"),JSON.stringify(report,null,2)+"\n");
writeFileSync(join(out,"summary.md"),render());
process.stdout.write(render());
