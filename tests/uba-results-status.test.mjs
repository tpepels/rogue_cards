import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {renderResultsStatus,resultsRootForOutput,writeResultsStatus} from '../src/balance/results-status.js';

const fixture=t=>{
 const root=mkdtempSync(join(tmpdir(),'uba-status-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return root;
};
const save=(path,value)=>writeFileSync(path,JSON.stringify(value));
test('missing STATUS.md is created and recognizes a partial optimizer with live screening',t=>{
 const root=fixture(t),dir=join(root,'uba-puct-c070-v1'),phase=join(dir,'screen','g1');
 mkdirSync(phase,{recursive:true});
 save(join(dir,'optimizer-lock.json'),{configuration:{settings:{generations:3},profile:{id:'puct-c070-v1'}}});
 save(join(dir,'optimizer-state.json'),{schema:'uba-optimizer-state-v1',generation:1,complete:false,stopReason:'time-budget',
  current:{stage:'screen',population:[{candidate:{id:'next'}}]},
  archive:[{candidate:{id:'best-card'},fitness:{score:.861},summary:{solo:{n:40,winRate:.525},duo:{n:140,winRate:.686}}}]});
 save(join(phase,'progress.json'),{schema:'uba-progress-v1',planned:288,completed:45});
 save(join(phase,'.laboratory.lock'),{pid:process.pid});
 const path=writeResultsStatus(root);
 const md=readFileSync(path,'utf8');
 assert.match(md,/# Results status/);assert.match(md,/Running/);assert.match(md,/45 \/ 288/);
 assert.match(md,/best-card/);assert.match(md,/52\.5%/);assert.match(md,/68\.6%/);
 assert.match(md,/comparison.md|ranked.json|optimizer-state.json/);
 assert.equal(writeResultsStatus(root,{minIntervalMs:999999}),path);
 save(join(phase,'.laboratory.lock'),{pid:2147483647});
 const paused=readFileSync(writeResultsStatus(root,{force:true}),'utf8');
 assert.match(paused,/Paused: time-budget/);
});
test('independent run status, completed optimizer and unknown result directories are safe',t=>{
 const root=fixture(t),standalone=join(root,'calibration'),unknown=join(root,'old-sim'),done=join(root,'finished');
 for(const dir of [standalone,unknown,done])mkdirSync(dir);
 save(join(standalone,'progress.json'),{schema:'uba-progress-v1',planned:40,completed:10});
 save(join(standalone,'summary.json'),{schema:'uba-laboratory-summary-v1',complete:false,stopReason:'max-trials',planned:40,completed:10});
 writeFileSync(join(unknown,'report.md'),'# Old report\n');
 save(join(done,'optimizer-state.json'),{schema:'uba-optimizer-state-v1',complete:true,generation:3,archive:[]});
 const md=renderResultsStatus(root);
 assert.match(md,/Paused: max-trials/);assert.match(md,/10 \/ 40/);
 assert.match(md,/Report available \(state unknown\)/);assert.match(md,/old-sim\/report.md/);
 assert.match(md,/Complete/);
});
test('only repo results outputs are auto-indexed, and force regenerates an existing file',t=>{
 const root=fixture(t),cwd=join(root,'project'),result=join(cwd,'results','run');
 mkdirSync(result,{recursive:true});
 assert.equal(resultsRootForOutput(result,{cwd}),join(cwd,'results'));
 assert.equal(resultsRootForOutput(join(root,'temporary'),{cwd}),null);
 const status=writeResultsStatus(join(cwd,'results'));
 writeFileSync(status,'OLD\n');
 writeResultsStatus(join(cwd,'results'),{force:true});
 assert.match(readFileSync(status,'utf8'),/# Results status/);
});

test('complete optimizer does not falsely show a holdout without progress',t=>{
 const root=fixture(t),dir=join(root,'finished-v1');
 mkdirSync(dir,{recursive:true});
 save(join(dir,'optimizer-state.json'),{schema:'uba-optimizer-state-v1',complete:true,generation:3,
  finalists:[{id:'candidate-a'}],archive:[]});
 const md=renderResultsStatus(root);
 assert.match(md,/\| finished-v1 \| Complete \| complete \|/);
 assert.doesNotMatch(md,/holdout · No progress yet/);
});
test('legacy MCTS ablation progress and report-only studies remain visible without invented completion',t=>{
 const root=fixture(t),ablation=join(root,'mcts-search-ablation'),old=join(root,'mechanical-balance');
 mkdirSync(ablation);mkdirSync(old);
 save(join(ablation,'summary.json'),{schema:'rogue-cards-mcts-search-ablation-summary-v1',
  status:'incomplete',finished:18,total:80});
 writeFileSync(join(old,'comparison.md'),'# Historical comparison\n');
 save(join(old,'summary.json'),{schema:'historical-balance-report'});
 const md=renderResultsStatus(root);
 assert.match(md,/mcts-search-ablation \| Partial \(source report\) \| 18 \/ 80 \(22\.5%\)/);
 assert.match(md,/mechanical-balance \| Report available \(state unknown\)/);
 assert.doesNotMatch(md,/No recognized checkpoint/);
});
test('running optimizer is placed before archived comparison reports',t=>{
 const root=fixture(t);
 for(const name of ['a-archived','z-running'])mkdirSync(join(root,name));
 writeFileSync(join(root,'a-archived','report.md'),'# Archive\n');
 const dir=join(root,'z-running'),screen=join(dir,'screen','g0');
 mkdirSync(screen,{recursive:true});
 save(join(dir,'optimizer-state.json'),{schema:'uba-optimizer-state-v1',complete:false,generation:0,
   current:{stage:'screen'},archive:[]});
 save(join(screen,'.laboratory.lock'),{pid:process.pid});
 const text=renderResultsStatus(root);
 assert.ok(text.indexOf('| z-running |')<text.indexOf('| a-archived |'));
});
