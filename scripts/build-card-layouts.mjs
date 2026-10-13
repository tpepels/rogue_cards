#!/usr/bin/env node
import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {normalizePlacements,placementCSS} from "../src/card-layouts.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const jsonPath=resolve(root,"data/card-placements.json");
const cssPath=resolve(root,"styles/card-placements.css");
const document=normalizePlacements(JSON.parse(await readFile(jsonPath,"utf8")));
const css=placementCSS(document);
if(process.argv.includes("--check")){
 const existing=await readFile(cssPath,"utf8");
 if(existing!==css){
  console.error("card-placements.css is out of date. Run npm run layouts:build.");
  process.exitCode=1;
 }else console.log("Card placement CSS is up to date.");
}else{
 await writeFile(cssPath,css,"utf8");
 console.log("Built placements for "+Object.keys(document.cards).length+" cards.");
}
