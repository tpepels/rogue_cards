#!/usr/bin/env node
/**
 * Zero-dependency C++17 N-API build, designed for native Linux/macOS Node.
 * Never silently falls back to JS when a native benchmark was requested.
 */
import {existsSync,mkdirSync} from "node:fs";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {platform} from "node:os";

if(!["linux","darwin"].includes(platform()))
 throw Error("Native MCTS kernels currently support Linux and macOS");
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const headerCandidates=[
 process.env.NODE_INCLUDE_DIR,
 join(dirname(dirname(process.execPath)),"include","node"),
 "/usr/include/node",
 "/usr/local/include/node"
].filter(Boolean);
const include=headerCandidates.find(p=>existsSync(join(p,"node_api.h")));
if(!include)throw Error("Node N-API headers unavailable. Install Node development headers or set NODE_INCLUDE_DIR.");
const out=join(root,"native","build","mcts.node");
mkdirSync(dirname(out),{recursive:true});
const cxx=process.env.CXX||"c++";
const args=[
 "-std=c++17","-O3","-DNAPI_VERSION=8","-fPIC","-shared",
 "-I"+include,join(root,"native","mcts.cc"),"-o",out
];
if(platform()==="darwin")args.unshift("-undefined","dynamic_lookup");
console.log("Native MCTS compiler: "+cxx);
console.log("Node headers: "+include);
const run=spawnSync(cxx,args,{stdio:"inherit"});
if(run.error)throw run.error;
if(run.status!==0)process.exit(run.status||1);
console.log("Built "+out);
