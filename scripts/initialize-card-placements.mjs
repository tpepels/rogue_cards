#!/usr/bin/env node
// Fill layouts for newly added cards from the same hand-positioned templates.
// Existing placements (including manually edited ones) always win.
import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {CATALOGUE} from "../src/tabletop-data.js";
import {initializeCardLayouts} from "../src/layout-presets.js";
import {normalizePlacements,placementCSS} from "../src/card-layouts.js";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const input=resolve(root,"data/card-placements.json");
const output=resolve(root,"styles/card-placements.css");
const before=normalizePlacements(JSON.parse(await readFile(input,"utf8")));
const after=normalizePlacements(initializeCardLayouts(CATALOGUE,before));
const added=Object.keys(after.cards).length-Object.keys(before.cards).length;
await writeFile(input,JSON.stringify(after,null,2)+"\n");
await writeFile(output,placementCSS(after));
console.log("Initialized "+added+" new cards. "+Object.keys(after.cards).length+" total, existing edits preserved.");
