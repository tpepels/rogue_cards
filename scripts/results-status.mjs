#!/usr/bin/env node
import {resolve} from 'node:path';
import {writeResultsStatus} from '../src/balance/results-status.js';
const args=process.argv.slice(2);
if(args.includes('--help'))console.log('node scripts/results-status.mjs [--root results]');
else{
 if(args.length&&!(args.length===2&&args[0]==='--root'&&args[1]))
  throw Error('Usage: node scripts/results-status.mjs [--root results]');
 const root=resolve(args.length?args[1]:'results');
 console.log('Updated '+writeResultsStatus(root,{force:true}));
}
