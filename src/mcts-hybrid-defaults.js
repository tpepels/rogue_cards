/**
 * Calibration starting points, not measured optimal values.
 *
 * Classic UCT stays mathematically and reproducibly unchanged.
 * A heuristic-assisted search uses a smaller exploration multiplier so
 * its [0,1] implicit values can influence selection at finite budgets.
 * Alpha 0.25 falls within the 0.15-0.4 range reported for implicit
 * minimax backups, but Rogue Cards requires its own held-out trials.
 */
export const CLASSIC_UCT_C=Math.SQRT2;
export const HYBRID_UCT_C=0.7;
export const HYBRID_IMPLICIT_ALPHA=0.25;

/** Resolve the effective C without silently altering classic UCT. */
export function resolveExploration({
 rolloutCombatMode="random",implicitWeight=0,exploration=null
}={}){
 const c=exploration??(
  rolloutCombatMode==="sampled-expectimax"||implicitWeight>0?
   HYBRID_UCT_C:CLASSIC_UCT_C
 );
 if(!Number.isFinite(c)||c<0)
  throw Error("Exploration coefficient must be nonnegative");
 return c;
}

/** Explicitly selected profile with both hybrid components enabled. */
export function resolveSearchProfile({
 searchProfile="classic",rolloutCombatMode=null,
 implicitWeight=null,exploration=null
}={}){
 if(!["classic","deep-uct","combat-hybrid"].includes(searchProfile))
  throw Error("Unknown searchProfile "+searchProfile);
 const hybrid=searchProfile==="combat-hybrid";
 const mode=rolloutCombatMode??(hybrid?"sampled-expectimax":"random");
 const alpha=implicitWeight??(hybrid?HYBRID_IMPLICIT_ALPHA:0);
 if(!["random","sampled-expectimax"].includes(mode))
  throw Error("Invalid combat rollout mode");
 if(!Number.isFinite(alpha)||alpha<0||alpha>1)
  throw Error("Implicit backup weight must be in [0,1]");
 return {rolloutCombatMode:mode,implicitWeight:alpha,
  exploration:resolveExploration({
   rolloutCombatMode:mode,implicitWeight:alpha,exploration
  })};
}
