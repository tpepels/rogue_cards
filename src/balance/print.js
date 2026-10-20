import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {printSheets,esc} from '../tabletop-view.js';
import {printableDeck,printableDiff} from './compiler.js';
import {writeJSON} from './artifacts.js';

/** Use the actual existing card renderer and physical sheet layout. The local
 * base URL lets the preview share canonical artwork/fonts without copying a
 * large asset tree into every experiment. JSON exports remain portable. */
export function exportPrintProposal(candidate,out){
 const cards=printableDeck(candidate),root=fileURLToPath(new URL('../../',import.meta.url));
 mkdirSync(out,{recursive:true});
 writeJSON(join(out,'deck.json'),cards);writeJSON(join(out,'diff.json'),printableDiff(candidate));
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<base href="'+esc(pathToFileURL(root).href)+'"><title>UBA proposal — '+esc(candidate.id)+'</title>'+
  ['tabletop','compositions','pasted-notes','card-placements'].map(name=>'<link rel="stylesheet" href="styles/'+name+'.css">').join('')+
  '</head><body><p class="tt-noprint">Experimental proposal '+esc(candidate.id)+'. Canonical cards unchanged. '+cards.length+' physical copies. Print on A4 at 100%.</p><main>'+printSheets(cards)+'</main></body></html>';
 writeFileSync(join(out,'print.html'),html);return {copies:cards.length,html:join(out,'print.html')};
}
