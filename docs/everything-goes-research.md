# Everything Goes - decision-ready experimental protocol

This is the new 36-normal-Room experiment. Use it rather than the older
nine-Room baseline or short `study-everything-goes.mjs` pacing smoke test.

## One-command experiment (run on the actual workstation)

```bash
cd ~/Projects/rogue_cards
git pull --ff-only
bash scripts/run-everything-goes-research.sh
```

**Before launching:** keep a clean, committed Git checkout. In particular,
commit locally generated illustration PNGs and their `src/print-expansion.js`
mappings before starting. The experiment refuses dirty source, because
otherwise two resumed batches could silently use different game rules.

The wrapper runs `test:experiment` and `test:everything`, then launches:

- **3,600 organic Everything Goes expeditions** - exactly 100 for each of
  the 8 solo Heroes and 28 two-Hero combinations.
- **2,160 matched Item pairs** - 120 paired seeds for each of the 18 odd
  Items, using solo Heroes rotated equally.
- **7,920 total real played expeditions**, not MCTS rollouts or truncated
  games. Every nontrivial actual decision is chosen via fair-hidden-information
  canonical UCT (budget 2). A progress-safe policy moves forward after
  12 consecutive free equipment actions at one safe boundary. This
  convention, its frequency, and the UCT budget are recorded.
- **Six workers, 72-hour window per invocation.** If the window expires,
  the script saves a **PARTIAL** report and exits nonzero. Running the
  identical command again resumes remaining jobs. Completed games and
  their records are never rerun.
- Experiments are pinned to the complete **Git commit hash** and a SHA-256
  of their configuration; `--resume` rejects changes to either.

For checking command syntax without launching an experiment:

```bash
npm run test:experiment
npm run study:deep -- --dry-run --runs 36 --pairs-per-item 1
```

For an initial small data-path pilot (not a balance verdict):

```bash
npm run study:deep -- --mode survey --runs 36 --workers 2 --hours 1 \
  --budget 2 --out results/everything-goes-pilot
```

The full protocol can be expensive. CPU workers can be reduced using the
direct script's `--workers` option; worker count and walltime do not
change the experiment signature. The wrapper itself fixes six workers.

## Exact outputs

The automatically revision-pinned folder is
`results/everything-goes-deep-<first-12-commit-characters>/`.

| File | Information it contains |
| --- | --- |
| `manifest.json` | Full SHA, Node/OS, seed design, policy, paired comparator, requested work |
| `checkpoints/NNNNNN.json` | One finished game, compact exact metrics, validation and raw hash |
| `raw/NNNNNN.json.gz` | **Every actually accepted game decision**, all available alternatives, exact choice, root search estimates, real committed d6/d20 rolls, hero status and full inventory before/after, Room/Monster and depth transitions, nested reactions, RNG state, recursive delta of **every engine metric** |
| `runs.csv` | One row per game: win, ending, wipe cause, Rooms/ Corridors by depth, Hero, fights (ordinary vs bosses), Items, HP lost, final HP, actions, CPU and MCTS timing, raw hash |
| `card-coverage.csv` | **All** regional Rooms, Monsters and Items, even if unexposed: entries, Room choices offered/chosen, roll bands, Monster encounters/kills/Parley attempts/Parley successes, Item acquisitions/draws/offers/uses/passive uses, Room exposure |
| `paired-item-effects.csv` | Pair-level difference between extra odd Item and extra Dry Rations for each matched Hero+seed, including win, Rooms, fights, total HP damage, Items drawn, actions, search work, etc. |
| `coverage.json` | All engine metrics combined, complete card universes, non-encountered designs and gaps |
| `summary.json` | Structured means, 95% confidence intervals, Hero/party breakdown, all Monster/Item/Room aggregates, matched outcomes and explicit interpretation limits |
| `summary.md` | Human-readable overview, all 24 Monsters, 79 Items and 79 Rooms, plus decisions and unobserved designs |
| `validation.json` | Checkpoints present, full completion, source pinning, no acceptance of truncated runs, gaps and decision readiness |

Raw files are **gzip**, but otherwise ordinary JSON. Nothing is destroyed
after aggregation: unusual events can be reconstructed by exact seed,
decision, observed action and original RNG snapshot. Search rollouts do not
enter the game's real-dice tape.

## Study questions, denominators and how to act

1. **Length and pacing.** For each party and each stage, record actual
   non-Corridor Room entries, bonus Corridors, stage skips, action count,
   ordinary encounters, real fights, boss stages and ending. A death before
   completing 36 Rooms is a legitimate short expedition, not a completed
   36-Room success. Track the probability of reaching each depth rather
   than treating an early death as a missing Room.
2. **Combat difficulty.** Separate Monster **draw** from **encounter**,
   encounter from **fight**, and fight from **kill**. Report Parley attempts
   and success separately for **each Monster**. Record per-Hero HP loss,
   wipe cause, number of combat rounds, bonuses and rewards, without
   collapsing the three categories into an ambiguous `battles` counter.
3. **Room choices.** For all 79 Rooms: visits, printed option 1/2 selected,
   opportunity denominators and rolled d6 bands. Treat low-exposure Rooms
   as explicit coverage gaps, not as balanced by default.
4. **Items.** For all 79 Items: acquired, drawn, held across Rooms,
   offered a trigger, actually used, mode and direct change in HP,
   Monster HP, Items, poison, skips, recharge and scouting. A card's low
   use rate only means something when its opportunity denominator is known.
5. **Heroes and parties.** Use the 36 predefined party strata and report
   independent win rates with Wilson 95% intervals, mean fights, Room
   counts and decisions. Also report the decision policy's MCTS search
   work; a game taking longer to compute is NOT longer at the table.
6. **New odd-Item value.** Treatment: move one real copy of the odd Item
   from the deck to starting inventory. Control: do the same with
   **Dry Rations**. Paired runs share Hero and seed, so differences are
   in the identity of one extra starting Item, not resource quantity.
   Report paired deltas and CIs in win rate, fights, Rooms, damage and
   decision burden, plus treatment-side **opportunities, use rates and
   direct effect magnitudes**. This estimates value relative to Rations,
   not absolute printed-card power or optimal human choices.
7. **Rule quality and pathologies.** All actual nested reactions, action
   availability, equipment loops, non-terminal failures, replay RNG
   consistency and study exceptions must be represented. A failure
   terminates the study with a nonzero exit status and retains prior data.

A paired 95% CI crossing zero is not a statistical finding of equality.
High-use or high-impact cards with narrow intervals can be prioritised for
playtest changes; low-exposure cards must receive focused follow-up trials,
not speculative balance verdicts. The full per-card/Item outputs are
generated **with** the experiment - no second script needed to unlock
them afterward.

## Physical duration cannot come from simulated computation

No CPU-based experiment can honestly determine that a tabletop game takes
**60 minutes**. The study does measure every game action and Room, which
gives a repeatable pacing indicator. To calibrate real minutes, time a
small number of physical solo and duo expeditions separately, subtract
breaks and compare active minutes with their actual decisions/Rooms.
Do **not** call `searchMs`, `transitionMs` or `wallMs` playtime.

## Important methodological boundary

Organic card appearance is randomised by shuffled piles, but MCTS
decisions are strategic. Observational outcomes conditioned on choosing a
Room option, using an Item, or defeating a Monster are **not themselves
causal estimates**. The supplementary matched starter-Item comparisons
are intentionally separate. Their conclusions only apply to the chosen
extra-Item-vs-Rations intervention, not to every possible deck-building
configuration. Confidence intervals and minimum sample counts are
included to make this distinction explicit.
