# Room composition hypotheses (A/B/C)

The ordinary Monsters, including all expansion Monsters, use canonical
**ceil(HP/2), minimum 1** and **ATK -2, minimum 1**. DEF and behaviour are
unchanged. The Warden is **15 HP, ATK 4, DEF 5**, switching at **8 HP**
to Unbound (**8 HP, ATK 6, DEF 5**) without resetting the health counter.

## What varies

Only the regional Room pile composition. Every model enters at most
12 non-Corridor Rooms per region, plus any Corridors reached. Each staged
deck contains 16 non-Corridor cards per region (four spare cards for
route/discard effects). Existing printed Rooms may be repeated as
hypothetical reprints; their printed effects are unchanged. Eight shared
support Rooms have exactly one copy in every variant:

- UPPER: u-shrine, u-lantern-shrine, ex-u-coal-store
- MIDDLE: m-altar, m-second-name, m-well
- DEEP: d-apothecary, d-mirror

A Room with a Monster on entry belongs to **guaranteed**, even if it
can spawn another Monster. Other Rooms offering a Monster by d6 or a
voluntary action belong to **conditional**. The remaining Rooms are
**none**. These describe Room definitions, not the number of
encounters actually generated; the MCTS agent still chooses freely.

| Variant | Guaranteed | Conditional | No spawn | Corridors |
|---|---:|---:|---:|---:|
| A · Corridors and chance | 13 | 19 | 16 | 9 |
| B · Balanced | 19 | 16 | 13 | 6 |
| C · Guaranteed encounters | 24 | 11 | 13 | 3 |

The original targets were expressed as 10/14/12, 14/12/10 and
18/8/10 in 36 Rooms. Each table row above has 48 available ordinary
Room cards (16 per region); its category *proportions* approximate
those pre-registered targets. Actual visited proportions may differ
because of drawing without replacement, corridors, player routes,
trapdoors and early deaths.

## Preview (does not run games)

```bash
node scripts/study-balance-hypotheses.mjs \
  --suite room-ratios --variant-limit 3 --finalists 3 --dry-run
```

## Smoke test

```bash
npm run test:balance:room-ratios
node scripts/study-balance-hypotheses.mjs \
  --suite room-ratios --smoke true --variant-limit 3 \
  --finalists 3 --workers 4 --minutes 15 \
  --out results/room-ratios-smoke
```

## Screening and independent holdout

```bash
node scripts/study-balance-hypotheses.mjs \
  --suite room-ratios --variant-limit 3 --finalists 3 \
  --screen-repeats 8 --confirm-repeats 16 \
  --workers 8 --minutes 600 \
  --out results/room-ratios-v2
```

Use the same command and output directory to resume an incomplete
run. Changing code, agent profile, seed or hypothesis definitions
requires a new output directory.

The runner produces `manifest.json`, `trials.ndjson`,
`summary.json` and `comparison.md`. Interpret encounters per 36
equivalent separately from actual encounters in complete runs.
The eight Hero starts are independently stratified; the frozen
`solo-balance-reference-v1` player is unchanged.

Success targets: 16–20 ordinary encounters per 36 counted Rooms,
55–70% encounter-to-fight conversion, ~40% solo wins and ~50% of runs
reaching the Vault. Simulated win rates do not directly represent
human playtest enjoyment or expedition duration.

## Repeat-copy rollout accounting

Staged Room selections may repeat a printed ID. The fair MCTS sampler
subtracts public Room-visit counts, public discards and held paths one
physical copy at a time, then reserves shown/top and known/bottom cards.
Canonical unique-ID decks use their original public sampler.
A previous 0-trial `results/room-ratios-v1` manifest was created before this
fix; use the `v2` output path instead of resuming against another Git revision.
