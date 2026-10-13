# Rogue Cards - Hero balance pass (13 October 2026)

## Player-approved revisions

Card source, typed Item effects, both simulators, reviewed hashes and regression tests were updated together on main.

| Card | Change |
|---|---|
| Veteran Warrior | **18 HP, 4 ATK**, down from 20 HP, 5 ATK. Notched Sword and BLOOD RUSH unchanged |
| Wandering Knight INTERCEPT 5 | **Cancel the hit** |
| Wandering Knight INTERCEPT 6 | **Cancel the hit and force the Monster's next behaviour to 1–2**, an intentionally exceptional result |
| Hedge Wizard WILD SPARK 1–2 | **Roll d6; lose half the result in HP, rounded up** (1–3 HP instead of d6) |
| Ash Priest BLESS OR CURSE 1–2 | **Roll d6; lose half the result in HP, rounded up** (1–3 HP instead of d6) |
| Roadless Monk STILLNESS 5 | Change result to 1–2; heal 2 HP |
| Roadless Monk STILLNESS 6 | **Cancel this Monster response; heal 2 HP** |
| Spore Jar 3–4 / 5–6 | Skip one / two Monster responses, respectively |
| Wand of Cold Shoulders 3–4 | Skip the Monster's next response |
| Wand of Questionable Shapes 1–2 | Lose 2 HP rather than destroying the Wand; it remains sideways |

Knight INTERCEPT is no longer consumed when a Warded Shield has already prevented all damage. A Monk may wait for a dangerous printed Monster behaviour before taking the risk of STILLNESS.

For half-d6 damage, **round up** so that a roll of 5 means 3 HP lost.

## Independently seeded 36,000-expedition study

[Successful GitHub Actions study](https://github.com/tpepels/rogue_cards/actions/runs/38377600562)

Simulation commit: 06deb06eade8e2c0126b234f00dfdd6b40629543. Study seed 78521739. There are 500 runs per Hero party/strategy, 8 solo Heroes, all 28 distinct two-Hero combinations, and two strategies (magic and treasure). Zero unresolved effects and zero stalled expeditions.

| Design goal | Observed | Met? |
|---|---:|---|
| Solo spread at most 10 percentage points | **20.4 pp** | No |
| Two-Hero parties mostly 70–85% | **25/28** in band, mean 79.3% | Broadly |
| No dominant pair near 95% | Strongest duo **88.1%** | Yes |

### Solo victory rates (mean of magic and treasure)

| Hero | Win rate |
|---|---:|
| Knight | 62.9% |
| Priest | 50.0% |
| Rogue | 48.4% |
| Warrior | 46.0% |
| Monk | 45.4% |
| Thief | 45.3% |
| Witch | 44.8% |
| Wizard | 42.5% |

Top pairings are Warrior + Knight (88.1%), Knight + Wizard (87.1%), and Knight + Rogue (86.4%). The former Warrior + Knight result of about 94% came from an earlier model version with different Item rules and different random seeds; it is indicative, not a controlled causal comparison.

The approved changes helped address extremely dominant two-Hero combinations, but **solo balance remains substantially outside the requested target**. Knight is the clear outlier, and Wizard is lowest. No further unapproved stat or ability changes were made.

### Priority next hypotheses - not applied

1. Trial Knight at 19 HP / 3 DEF while **retaining his extraordinary 6 and starting Shield**, then compare solo and Knight-inclusive duo win rates.
2. Trial stronger Wizard mid/high WILD SPARK effects while retaining the half-d6 risk. Increase meaningful power, not just a passive statistic.
3. Investigate Witch HEX BREW and Monk STILLNESS decision timing; a strong high-roll with a dangerous low-roll should matter in actual situations.
4. Validate Item effectiveness on the new card set, considering drawn, accessible and activated Items separately rather than optimizing for the raw number of activations.
5. Run physical playtests; scripted-agent results are not human player win rates.

## Reproduce

    npm test
    npm run --silent study:hero-balance -- 500 --seed 78521739 > hero-balance.json
    npm run --silent study:hero-balance:report -- hero-balance.json > hero-balance.md

See [the study workflow](../.github/workflows/hero-rebalance-study.yml) for its automated verification and complete artifacts. Uncertainty ranges are approximate, unadjusted and exclude simulator-model uncertainty.
