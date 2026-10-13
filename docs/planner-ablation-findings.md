# Rogue Cards - planner ablation findings

Full factorial holdout: [successful GitHub Actions run](https://github.com/tpepels/rogue_cards/actions/runs/38368083219).

- Simulation commit: `e4b8537350c7405252099037786c90c57d5475e0`.
- Holdout seed: `91027381` (not used in the previous planner-v2 study).
- 36 Hero parties (8 solo, 28 duo) x 2 playstyles x 300 seeds x 16 configurations = **345,600 simulated expeditions**.
- Zero unresolved effects and zero round-limit stalls.
- Original scripted baseline: **59.75%** win rate; full cautious planner: **72.77%**, a **13.02 percentage-point increase**.
- Each feature is switched independently. The empty configuration reproduces the scripted baseline's gameplay in regression checks. Printed cards and rules are unchanged.

## What drives simulated wins?

Each row shows three *distinct* contrasts (percentage points). Do not add rows together.

| Feature | On by itself vs scripted | Marginal loss when removed from full | Mean marginal effect over all other feature combinations | Approximate 95% CI of mean effect |
|---|---:|---:|---:|---:|
| Room choices | +8.12 | +4.34 | **+6.27** | +5.71 to +6.83 |
| PARLEY | +4.64 | +1.57 | **+3.14** | +2.82 to +3.45 |
| Combat Items | +2.06 | +2.24 | **+2.31** | +1.91 to +2.71 |
| SEAL | +1.86 | +0.93 | **+1.37** | +1.25 to +1.49 |

Rooms provide the largest marginal improvement in this automated model. Their solo baseline-to-feature-only improvement is particularly large in treasure play (+11.46 pp).

## Context: solo and two-Hero parties

| Group | Scripted wins | Full cautious planner wins | Difference |
|---|---:|---:|---:|
| Magic solo | 33.62% | 49.67% | +16.04 pp |
| Magic duo | 70.02% | 80.06% | +10.04 pp |
| Treasure solo | 28.58% | 48.42% | +19.83 pp |
| Treasure duo | 65.85% | 79.05% | +13.20 pp |

The SEAL feature's factorial-average contribution is about **+5.00 to +5.15 pp for solo** but **+0.23 to +0.40 pp for two Heroes**. Do not generalise one overall SEAL effect to all play modes.

## Interaction: Room choices and PARLEY

The Room/PARLEY interaction is **-3.11 pp** (95% interval **-3.72 to -2.49 pp**), averaged over the combat and SEAL switches. Enabling both is less beneficial than summing their independent gains. Part of the likely mechanism is fewer or different fights when the Room choice policy changes; this behavioural explanation is a hypothesis, not directly proved by the aggregate win contrasts.

The Room/Combat interaction is **-0.10 pp** (-0.89 to +0.68 pp); the available evidence does not distinguish it from zero.

## Remaining validity problems

1. The simulation and its automated play policies are still approximations of how humans use the cards. No inference about real-player win rates is warranted.
2. The 16 variants share initial random seeds, but **consume different later die rolls** when their actions diverge. Paired contrasts reduce some variance; they do not hold the future dice fixed.
3. The intervals reflect simulated seed variation; they are unadjusted for multiple comparisons and for code/model misspecification.
4. Emergency Potions and triggered abilities remain governed by common scripted rules. The Combat switch controls the planner's optional attack-versus-Item action choices; turning it off restores the existing scripted policy rather than banning Items.
5. Combat Items remain scarce in planner-selected actions: with all features enabled, one was selected in **4.1% of combats where at least one legal Item action was available**. This cannot be interpreted as evidence that those Items are weak, because inventory opportunity costs may be misestimated.
6. The current study covers **magic and treasure strategies, cautious planner weights only**. It does not cover other policies or different human risk preferences.
7. The weights were tuned during earlier planner studies; this seed is held out from those studies but the simulator itself was reviewed and corrected before the run.

## Reproduce

```sh
npm test
npm run --silent study:planner:ablation -- 300 --all --seed 91027381 > planner-ablation.json
npm run --silent study:planner:ablation:report -- planner-ablation.json > planner-ablation.md
```

The [GitHub workflow](../.github/workflows/planner-ablation.yml) includes integrity checks and saves both full JSON and Markdown report as its artifact. The experiment code is [scripts/study-planner-ablation.mjs](../scripts/study-planner-ablation.mjs), and the settings are controlled in [src/expedition-campaign.js](../src/expedition-campaign.js).
