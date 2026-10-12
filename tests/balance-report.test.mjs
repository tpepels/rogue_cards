import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
function run(...args){
 return execFileSync(process.execPath,["scripts/full-balance.mjs",...args],{
  cwd:root,encoding:"utf8",maxBuffer:16*1024*1024
 });
}

test("detailed JSON reports complete policy results and honest seal denominators",()=>{
 const report=JSON.parse(run("2","--json"));
 assert.equal(report.runsPerSetupPerStrategy,2);
 assert.equal(report.totalExpeditions,120);
 assert.equal(report.results.length,60);
 assert.equal(report.summary.expeditions,120);
 assert.equal(report.byPartySize.solo.expeditions,80);
 assert.equal(report.byPartySize.cooperative.expeditions,40);
 assert.equal(report.byStrategy.seal.expeditions,24);
 assert.equal(report.commit===null||typeof report.commit==="string",true);
 for(const result of report.results){
  assert.equal(result.runs,2);
  assert.ok(result.winCount>=result.sealWins);
  assert.ok(result.sealAttempts>=result.sealWins);
  assert.ok(result.vaultCount>=result.sealAttempts);
  assert.ok(result.sealAvailabilityAtVault>=0&&result.sealAvailabilityAtVault<=1);
  assert.ok(result.sealSuccessRatePerAttempt>=0&&result.sealSuccessRatePerAttempt<=1);
  for(const key of ["cardActivations","roomChoices","monsterVisits","operations"])
   assert.equal(typeof result[key],"object");
 }
 assert.equal(report.summary.sealWins+report.summary.wardenWins,report.summary.wins);
 assert.equal(report.summary.unresolvedEffects,0);
 assert.equal(report.summary.stalledExpeditions,0);
});

test("TSV remains compatible with the original balance command",()=>{
 const stdout=run("1");
 const lines=stdout.trimEnd().split("\n");
 assert.equal(lines.length,64); // 3 preamble lines + header + 60 policy/party rows
 assert.equal(lines[3],"Strategy\tHeroes\tWin%\tVault%\tSpells/exp\tPotions/exp\tNegotiations/exp\tUnresolved\tStalls");
 assert.match(lines[4],/^survival\twarrior\t/);
 assert.match(lines.at(-1),/^negotiation\tthief\+monk\t/);
});

test("balance CLI rejects invalid runs and unsupported options",()=>{
 for(const args of [["0","--json"],["100001"],["3","--csv"],["1","2"],["--json","--json"]]){
  const out=spawnSync(process.execPath,["scripts/full-balance.mjs",...args],{
   cwd:root,encoding:"utf8"
  });
  assert.notEqual(out.status,0,args.join(" "));
  assert.match(out.stderr,/Usage: npm run balance/);
 }
});
