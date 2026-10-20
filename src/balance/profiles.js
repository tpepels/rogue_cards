import {createHash} from "node:crypto";

const schema="uba-agent-profile-v1";
const defaults={schema,policyKind:"mcts",budget:8,maxSearchSteps:5000,knowledge:"fair",
 searchProfile:"classic",treeMode:"frontier",exploration:0.2,
 implicitWeight:0.5,implicitHeuristicMode:"legacy",
 equipmentMode:"party-efficient",rolloutCombatMode:"random",
 progressiveWidening:false,nodePriors:false,puctC:0.35};
const stable=value=>JSON.stringify(Object.fromEntries(Object.entries(value)
 .sort(([a],[b])=>a.localeCompare(b))));
const freeze=value=>{
 if(value&&typeof value==="object"){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};
function identify(spec){
 const {hash,...definition}=spec;
 const computed=createHash("sha256").update(stable(definition)).digest("hex");
 if(hash!==undefined&&hash!==computed)throw Error("Agent profile hash mismatch");
 return freeze({...definition,hash:computed});
}
// Profiles are experiment inputs, independent of candidate fitness/search.
// Budget is the policy budget floor; canonical policy still covers every
// remaining root action when its legal set is larger than that floor.
export const AGENT_PROFILES=freeze(Object.fromEntries([
 ["reference-v1",{}],
 ["widening-v1",{progressiveWidening:true}],
 ["priors-v1",{nodePriors:true}],
 // PUCT c=0.70 selected on independent solo expedition validation (96 trials/arm at budget 32).
 // The 2026-10-20 solo study used the tree-only pragmatic policy and solo-threat heuristic.
 // For duo trials, trial.js switches only the incompatible solo equipment mode to party-efficient.
 ["puct-c070-v1",{budget:32,nodePriors:true,puctC:0.70,
  implicitHeuristicMode:"solo-threat",equipmentMode:"solo-pragmatic",
  mctsPragmaticVariant:"tree-only",softTreeBonus:0.15,
  softTreeFirstVisitProbability:0.75,softRolloutProbability:0.75,
  implicitHpScale:1,implicitThreatScale:1}],
 ["combined-v1",{progressiveWidening:true,nodePriors:true}],
 ["weak-v1",{budget:2}],
 ["random-v1",{policyKind:"random",budget:1}]
].map(([id,edits])=>[id,identify({...defaults,id,...edits})])));

/** Resolve a pinned id or copy/validate a fully explicit versioned profile.
 * Functions, unknown knobs and altered canonical identities are rejected.
 */
export function getAgentProfile(input="reference-v1"){
 if(typeof input==="string"){
  if(!Object.hasOwn(AGENT_PROFILES,input))throw Error("Unknown agent profile "+input);
  return AGENT_PROFILES[input];
 }
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw Error("Invalid agent profile");
 if(typeof input.id!=="string"||!/-v[1-9]\d*$/.test(input.id))
  throw Error("Agent profile requires a versioned id (name-v1)");
 const extensions=["mctsPragmaticVariant","softTreeBonus",
  "softTreeFirstVisitProbability","softRolloutProbability",
  "implicitHpScale","implicitThreatScale"];
 const allowed=new Set([...Object.keys(defaults),...extensions,"id","hash"]);
 if(Object.keys(input).some(key=>!allowed.has(key)))
  throw Error("Unsupported agent profile field");
 if(input.schema!==schema)throw Error("Unsupported agent profile schema");
 input={policyKind:"mcts",...input};
 for(const [key,value] of Object.entries(defaults)){
  if(input[key]===undefined)throw Error("Explicit agent profile missing "+key);
  if(typeof input[key]!==typeof value)throw Error("Invalid agent profile "+key);
 }
 for(const key of ["budget","maxSearchSteps"])
  if(!Number.isSafeInteger(input[key])||input[key]<1)
   throw Error("Invalid agent profile "+key);
 for(const key of ["exploration","implicitWeight","puctC"])
  if(!Number.isFinite(input[key])||input[key]<0||
    key==="implicitWeight"&&input[key]>1)throw Error("Invalid agent profile "+key);
 // Phase 1 compares fixed party-aware, fair-information profiles only.
 // The locked new profile is an exact adoption of the calibrated SOLO policy;
 // old profile hashes and accepted configurations remain unchanged.
 const pinned=AGENT_PROFILES[input.id];
 for(const key of ["knowledge","searchProfile","treeMode",
  "implicitHeuristicMode","equipmentMode","rolloutCombatMode"])
  if(input[key]!==((input.id==="puct-c070-v1")?pinned[key]:defaults[key]))
   throw Error("Unsupported agent profile "+key);
 if(input.id==="puct-c070-v1"){
  if(extensions.some(k=>input[k]===undefined))
   throw Error("Incomplete pinned PUCT profile");
  if(input.mctsPragmaticVariant!=="tree-only"||
   ["softTreeBonus","softTreeFirstVisitProbability","softRolloutProbability",
    "implicitHpScale","implicitThreatScale"].some(k=>
     !Number.isFinite(input[k])||input[k]<0)||
   ["softTreeFirstVisitProbability","softRolloutProbability"].some(k=>input[k]>1))
   throw Error("Invalid pinned PUCT parameters");
 }else if(extensions.some(k=>input[k]!==undefined))
  throw Error("Unrecognized agent profile extensions");
 const resolved=identify({...input});
 if(!["mcts","random"].includes(resolved.policyKind))
  throw Error("Unsupported agent profile policyKind");
 const canonical=AGENT_PROFILES[resolved.id];
 if(canonical&&canonical.hash!==resolved.hash)
  throw Error("Cannot retune a canonical agent profile");
 return canonical??resolved;
}
