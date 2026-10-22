import {decodePrintQueue} from "./print-queue.js";
import {printSheets} from "./tabletop-view.js";

const root=document.getElementById("print-app");
const params=new URLSearchParams(window.location.search);
const MAX_BATCH=16; // Four A4 sheets. Keep Chromium print preview responsive.
let queue,first=0,edition=0;
try{queue=decodePrintQueue(window.location.search);}
catch(error){
 root.innerHTML='<main class="tt-shell"><h1>Print selection unavailable</h1><p>'+String(error.message).replaceAll("<","&lt;")+'</p><p><a href="./cards.html">Return to all cards</a></p></main>';
 throw error;
}
const batchCount=Math.ceil(queue.length/MAX_BATCH);
const title=document.createElement("title");
title.textContent="Rogue Cards – "+queue.length+" cards – quick print";
document.head.append(title);
function display(){
 const current=++edition;
 const count=Math.min(MAX_BATCH,queue.length-first);
 const batch=queue.slice(first,first+MAX_BATCH);
 const number=Math.floor(first/MAX_BATCH)+1;
 root.innerHTML=
 '<div class="tt-sitehead"><div><div class="tt-brand">ROGUE CARDS</div><div class="tt-sub">QUICK PRINT · '+queue.length+' PHYSICAL CARDS</div></div><nav class="tt-nav"><a href="./cards.html">ALL CARDS</a><a href="./decks.html">DECK BUILDER</a><a href="javascript:history.back()">BACK</a></nav></div>'+
 '<main class="tt-shell tt-print-controls"><h1>Print in manageable batches</h1>'+
 '<p>Batch <strong>'+number+' of '+batchCount+'</strong> · cards '+(first+1)+'–'+(first+count)+' of '+queue.length+
 ' · '+Math.ceil(count/4)+' A4 sheets. This page loads only these '+count+' cards, not the full collection.</p>'+
 '<p>In the browser print dialog select A4, 100% scale, enable background graphics and disable browser headers and footers.</p>'+
 '<div class="tt-toolbar-controls">'+
 '<button id="print-back" '+(first===0?'disabled':'')+'>PREVIOUS BATCH</button>'+
 '<button id="print-current" disabled>LOADING ILLUSTRATIONS…</button>'+
 '<button id="print-next" '+(first+MAX_BATCH>=queue.length?'disabled':'')+'>NEXT BATCH</button>'+
 '</div><p id="print-progress" role="status">Preparing '+count+' illustrated cards…</p></main>'+
 '<div class="tt-print-only" aria-hidden="true">'+printSheets(batch)+'</div>';
 root.querySelector("#print-back").addEventListener("click",()=>{first=Math.max(0,first-MAX_BATCH);display()});
 root.querySelector("#print-next").addEventListener("click",()=>{first+=MAX_BATCH;display()});
 const button=root.querySelector("#print-current");
 // Decode only the current batch. No print call or preload of other pages.
 const images=[...root.querySelectorAll(".tt-print-only img")];
 Promise.all(images.map(img=>img.decode().then(()=>true,()=>false))).then(results=>{
  if(current!==edition)return;
  const failures=results.filter(ok=>!ok).length;
  if(failures){
   root.querySelector("#print-progress").textContent=failures+" illustration(s) could not load. Check your connection and reload before printing.";
   button.textContent="ILLUSTRATIONS NOT READY";
  }else{
   root.querySelector("#print-progress").textContent=count+" illustrations ready. Print this batch, then advance to the next.";
   button.disabled=false;
   button.textContent="PRINT BATCH "+number+" ("+Math.ceil(count/4)+" PAGES)";
  }
 });
 button.addEventListener("click",()=>window.print());
}
display();
