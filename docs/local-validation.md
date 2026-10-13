# Laptop validation laboratory

This is a **local-only research harness**. It neither changes the printed
cards nor rebalances the game. It needs no GitHub Actions, external API,
Playwright, GPU, or network connection after the repo is checked out.

**Design decision:** Wandering Knight is deliberately the beginner-friendly,
stronger Hero. The suite **does not mark his stronger win rate as a balance
failure**. It separately reports the span among the other seven Heroes.

## Start here (Linux, Node 22 or newer)

From the checked-out rogue_cards directory:

~~~sh
git pull --ff-only
node --version
npm run validate:local -- --preset smoke --out results/smoke-first --progress
~~~

**Smoke:** 3,776 expeditions (2 independent batch seeds, 10 trials per
party/strategy/policy/batch, all 8 solos and 28 duos, plus small
reversed-Hero-order checks). These numbers are for checking that the
validator and reports work, **not** precise card-balance conclusions.

For meaningful results:

~~~sh
npm run validate:local -- --preset standard --workers 8 \
  --out results/standard-01 --progress
~~~

**Standard:** 458,880 expeditions: 432,000 canonical and 26,880
reversed-order trials. Six seed batches, 250 runs per
Hero/party/strategy/policy/batch, two strategies (magic and treasure),
four policies:

- `scripted` - existing scripted decisions, with current printed rules
- `cautious` - cautious Room, Item, PARLEY and SEAL planning
- `balanced` - full planner with balanced weights
- `bold` - full planner with bold weights

The command first runs the full `npm test` and saves output to
`tests.log`. If contract tests fail, the simulations do not run.

For the extensive, all-strategy/all-policy evaluation:

~~~sh
npm run validate:local -- --preset deep --workers 8 \
  --out results/deep-01 --progress
~~~

**Deep:** 8,324,000 expeditions, including 224,000 reversed-pair
trials for scripted/cautious policies. Covers five playstyles
(survival, treasure, magic, seal, negotiation), all 15 supported
policies (scripted, adaptive, three planner risk profiles, four
single-feature policies, four leave-one-out policies, free-item and
forced-item use), ten independent seed batches, and 300 trials per
primary party/strategy/policy/batch.

Use `--dry-run` to display exact workload and configuration without
running any tests or simulations:

~~~sh
npm run validate:local -- --preset deep --workers 8 --dry-run
~~~

Presets are not independent replication runs: their default seeds
may overlap. Specify different seed lists for true replication.

## Custom seeds, runs and policies

~~~sh
npm run validate:local -- --preset standard \
  --seeds 101,202,303,404,505,606,707,808 \
  --runs 500 --workers 8 --seat-runs 100 \
  --out results/replication-02 --progress
~~~

Or deterministically generate unique seed batches:

~~~sh
npm run validate:local -- --preset standard \
  --seed-base 287001 --seed-count 12 --runs 300 \
  --out results/replication-03 --progress
~~~

Each starting seed is shared across policy variants for the same
Hero party and strategy. The validator retains **packed per-run
win outcomes** and computes paired-policy differences, discordant
outcomes and approximate paired confidence intervals.

Once a policy's choices diverge, subsequent random draws may diverge
as well. These are shared **initial** seeds, not guaranteed identical
future dice.

The 28 Hero pairings are run in canonical order; selected pairings
are also re-run in the opposite order with the same initial seeds.
This is a useful diagnostic but cannot isolate pure first-player
advantage, since the starting Item allocation also changes.
Use `--seat-runs 0` to skip this, or select
`--seat-policies scripted,cautious,bold`.

## Focused validation studies

Room, combat, PARLEY and SEAL switch combinations:

~~~sh
npm run validate:local -- --preset standard \
  --strategies magic,treasure \
  --policies scripted,cautious,room-only,combat-only,parley-only,seal-only,no-room,no-combat,no-parley,no-seal \
  --seeds 900001,900002,900003,900004 --runs 500 \
  --out results/feature-ablation-04 --progress
~~~

Item preservation and aggressive spending:

~~~sh
npm run validate:local -- --preset standard \
  --policies scripted,cautious,free-items,forced-items \
  --seeds 810101,810102,810103,810104,810105,810106 \
  --runs 400 --out results/item-policy-05 --progress
~~~

The existing one-card-at-a-time experiments can also be repeated
with different seeds:

~~~sh
mkdir -p results/individual-items
for seed in 410123 510123 610123; do
  npm run --silent study:items:targets -- 200 --all --seed "$seed" \
    > "results/individual-items/items-$seed.json"
  npm run --silent study:items:targets:report -- \
    "results/individual-items/items-$seed.json" \
    > "results/individual-items/items-$seed.md"
done
~~~

Targeted experiments measure **forced** use, not perfectly timed
Item use or intrinsic printed power. In addition, the local
validator's `objects.csv` records draws, acquisitions, legally
available triggers, activations, passive equipment, damage,
healing, cures, and skipped responses for all 52 Objects.

## Checks performed

**Hard failures** (nonzero exit code; see `validation.json`):

- Missing or duplicated cohorts or corrupted paired win sequences
- Invalid win counts, SEAL denominators or Hero HP bounds
- Any unresolved printed effect or run-limit stall
- Unexpected Object IDs or more draws than acquisitions
- Failing unit, card or effect-contract tests

**Descriptive warnings**, not card nerfs:

- Non-Knight solo spread above ten percentage points
- Significant sensitivity to Hero order
- Item uses with incomplete matching trigger records
- Too few seed batches/trials for statistical confidence
- Missing scripted baseline for paired comparisons

No CI gate asserts that Knight must be as weak as another Hero.

## Files produced

| File | Purpose |
|---|---|
| `summary.md` | Human-readable results and interpretation |
| `summary.json` | All aggregate metrics and confidence intervals |
| `cohorts.json` | Every cohort, counts, and compact paired win sequence |
| `cohorts.csv` | Every seed, policy, Hero party and strategy |
| `hero-parties.csv` | All solo and duo win rates and other metrics |
| `seed-stability.csv` | Win-rate variation among independent batches |
| `policy-contrasts.csv` | Paired policy comparisons to scripted baseline |
| `seat-order.csv` | Reversing pairs under matched starting seeds |
| `objects.csv` | Full Object-level use and outcome statistics |
| `validation.json` | Machine-readable failures and warnings |
| `manifest.json` | Code revision, Node version, parameters, seeds |
| `tests.log` | Full unit and contract-test output |

Each run requires a **new** `--out` directory to avoid accidental
overwrites. If tests fail, inspect `tests.log` before attempting a
bigger study.

Share the full result archive here:

~~~sh
tar -czf validation-standard-01.tar.gz -C results standard-01
~~~

Attach the resulting archive. The manifest and per-cohort data let
us combine independently seeded replications and identify whether
the simulations came from the same Git commit.

## Limitations

These are scripted-agent Monte Carlo trials, **not observed human play**.
Increasing the number of seeds narrows sampling uncertainty but does
not fix missing rules, incorrect tactical valuation, or systematic
simulation biases.

The approximate 95% Wilson intervals (win rates) and paired normal
intervals (policy differences) are not adjusted for testing many
Hero combinations, Items or policies. Use them to decide what to
playtest in person, not as a substitute for human playtests.

**Running the validator never changes Hero or Item balance.**
