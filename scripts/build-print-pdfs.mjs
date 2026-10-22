#!/usr/bin/env node
// Render each illustrated card once, as a vector PDF, then compose full editions.
// Unlike browser window.print(), this work happens once in CI, not on every print.
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {chromium} from "@playwright/test";
import {FIXED_CARDS,SELECTABLE,PRESETS,physicalDeck,selectionForPreset,cardKey} from "../src/decks.js";
import {printUrl} from "../src/print-queue.js";

const out=path.resolve(process.argv[2]||"dist/print-pdfs");
const temp=path.join(os.tmpdir(),"rogue-cards-pdf-sources");
const port=8819;
const base="http://127.0.0.1:"+port+"/";
const designs=[...FIXED_CARDS,...SELECTABLE];
if(designs.length!==193||new Set(designs.map(cardKey)).size!==193)throw Error("Expected 193 distinct physical card designs");
await mkdir(temp,{recursive:true});
await mkdir(out,{recursive:true});

const server=spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],{stdio:"ignore"});
let browser;
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw Error("Local HTTP server stopped");
  try{
   const response=await fetch(base+"print.html");
   if(response.ok){ready=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 if(!ready)throw Error("Local website did not start");
 browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage"]});
 const context=await browser.newContext({viewport:{width:1080,height:900}});
 const page=await context.newPage();
 page.setDefaultTimeout(90000);
 for(let i=0;i<designs.length;i++){
  const card=designs[i];
  const n=String(i+1).padStart(3,"0"); // stable *source* index, not the card's printed number
  const filename=path.join(temp,n+".pdf");
  await page.goto(base+printUrl([card]).slice(2),{waitUntil:"domcontentloaded"});
  const button=page.locator("#print-current");
  await button.waitFor({state:"visible"});
  await page.waitForFunction(()=>{
   const el=document.querySelector("#print-current");
   return el&&!el.disabled;
  },{timeout:90000});
  const count=await page.locator(".tt-print-only .tt-card").count();
  if(count!==1)throw Error("Expected one source card for "+n+", got "+count);
  await page.pdf({path:filename,format:"A4",preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  if((i+1)%20===0||i===designs.length-1)console.log("Rendered",i+1,"/",designs.length,"vector cards");
 }
 await browser.close();browser=null;
 const editions=[
  ["rogue-cards-one-of-each.pdf",designs],
  ["rogue-cards-all-copies.pdf",physicalDeck(selectionForPreset("chaos"))],
  ...PRESETS.filter(p=>p.id!=="chaos").map(p=>["rogue-cards-"+p.id+".pdf",physicalDeck(selectionForPreset(p.id))])
 ];
 const sourceByKey=new Map(designs.map((card,i)=>[cardKey(card),i+1]));
 const manifest={revision:process.env.GITHUB_SHA||"local",designCount:designs.length,
  editions:editions.map(([file,cards])=>({
   file,cardCount:cards.length,pages:Math.ceil(cards.length/4),
   cards:cards.map(c=>({sourceIndex:sourceByKey.get(cardKey(c)),number:c.v2.number,key:cardKey(c)}))
  }))};
 await writeFile(path.join(temp,"manifest.json"),JSON.stringify(manifest,null,2));
 const child=spawn("python3",["scripts/compose-print-pdfs.py",temp,out],{stdio:"inherit"});
 const exitCode=await new Promise((resolve,reject)=>{
  child.once("error",reject);child.once("exit",code=>resolve(code));
 });
 if(exitCode!==0)throw Error("A4 PDF composition failed");
 await writeFile(path.join(out,"manifest.json"),JSON.stringify(manifest,null,2));
 console.log("Ready for single-job A4 printing:",out);
}finally{
 if(browser)await browser.close();
 server.kill();
}
