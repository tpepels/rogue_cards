/**
 * Node-only bridge to the optional native hash kernel.
 * The browser entrypoints keep using pure JS; no addon is imported by them.
 */
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {registerNativeMctsHash} from "./session-mcts.js";

const require=createRequire(import.meta.url);
const location=fileURLToPath(new URL("../native/build/mcts.node",import.meta.url));
let binding=null;
export function loadNativeMcts({required=false}={}){
 if(binding===null){
  try{
   binding=require(location);
  }catch(error){
   if(required)throw Error("Native MCTS addon missing or incompatible. Run npm run build:native-mcts",{
    cause:error
   });
   return false;
  }
 }
 if(typeof binding.hashPart!=="function")
  throw Error("Native MCTS addon has no hashPart implementation");
 registerNativeMctsHash(binding.hashPart);
 return true;
}
