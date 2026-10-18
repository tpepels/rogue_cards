# Card balance staging — canonical vs experimental

This tool tests hypotheses about **the physical Rogue Cards game**, not how to maximize an AI score. The canonical card files, artwork, print HTML and ordinary game constructors remain unchanged until a human explicitly approves a change.

## Basic workflow

1. Write one hypothesis as `experiments/staging/<unique-id>.json`. Do not edit `src/monsters.js`, `src/rooms.js`, `src/objects.js`, etc.
2. Use the locked test agent `experiments/agents/solo-balance-reference-v1.json`. The JSON and its SHA-256 are recorded for the **entire experiment**.
3. Run a small paired pilot:

   ```bash
   npm run test:card:staging
   npm run study:card:staging -- \
     --stage experiments/staging/wisp-hp-8.json \
     --runs-per-hero 2 --workers 8 \
     --out results/staging-wisp-pilot
   ```

4. After verifying the results and exposure to the modified card, run an independent comparison with a **new seed and directory**:

   ```bash
   npm run study:card:staging -- \
     --stage experiments/staging/wisp-hp-8.json \
     --seed 20261122 --runs-per-hero 40 --workers 8 \
     --out results/staging-wisp-study
   ```

5. Read `comparison.md` (human-readable) and `summary.json` (structured), then inspect `trials.ndjson` for exceptional outcomes. Retest the hypothesis with human players. **No automatic promotion exists.**

The experiment alternates canonical/staging starts with the same Hero, starting random seed, physical game rules and agent profile. Changing a Room deck changes the later distribution and number of random draws, so subsequent identical *die rolls* are **not** guaranteed. Paired results are still useful as comparisons of the two full systems, not as a fixed-dice replay.

## Allowed staging changes

```json
{
  "schema": "rogue-cards-staging-v1",
  "id": "sample-composition-hypothesis",
  "description": "An explicit single design hypothesis.",
  "cards": [
    { "collection": "monsters", "id": "wisp", "set": { "hp": 8 } },
    { "collection": "items", "id": "rope", "set": { "copies": 2 } }
  ],
  "roomDeck": {
    "UPPER": { "exclude": ["ex-u-guard-cell"] }
  },
  "roomEffects": {
    "ex-u-coal-store": {
      "choices": [["ROLL_ROOM"], ["COST:1", "HEAL:2"]]
    }
  }
}
```

The JSON above is **illustrative**, not an approved experiment. Prefer **one change per staging file** initially.

Currently supported card fields:
- `heroes`: HP, ATK, DEF, WIT (integers).
- `monsters`: HP, ATK, DEF, physical copy count.
- `items`: physical copy count only.
- `warden` and `wardenFury`: HP, ATK, DEF. Existing phase thresholds and hard-coded special transitions are unchanged.
- `rooms`: exclude existing regional Room IDs from the initial Room pool (no duplicate IDs, no new card definitions). At least 12 distinct Rooms must remain in each regional pool.
- `roomEffects`: replacement executable operation arrays for **existing** Room choices and/or d6 outcomes. The number and order of choices/bands must remain unchanged. Only opcodes already supported by `ROOM_OPERATIONS` are permitted; runtime execution remains the canonical engine.

**Limitations of v1:** Item effect rewrites, changing Room selection weights independently of available cards, importing brand-new card IDs, card art, and auto-updating printed wording are deliberately unsupported. Existing named special-case effects and monster behavior bands are not modified by changing ordinary numeric stats. A staged Room opcode edit changes simulation mechanics **only**, so update the human-readable printed text as part of an eventual approved canonical change. Do not print such an experiment as final rules.

## Results and interpretation

Output files:
- `manifest.json` pins git revision, stage spec hash, agent hash, exact initial deck counts, Hero order and seeds. An incompatible resume is rejected.
- `trials.ndjson` records all canonical and staging expeditions, including final canonical telemetry and observed cards.
- With `--trace full`, each run additionally writes a compressed `traces/<arm>-<hero>-<replicate>.json.gz` containing the canonical decision log and initial/final snapshots.
- `summary.json` provides paired mean changes and exploratory bootstrap intervals for wins, Vault reach, Rooms completed, ordinary encounters, fights, damage, HP, Items and runtime. Per-Hero and per-card information is included.
- `comparison.md` shows the same indicators plus a deck composition table, per-Hero summary and card-exposure deltas.

**Do not infer a card's balance from a run in which that card was never encountered.** Returning Monsters can be counted multiple times; Rooms seen are not necessarily completed. If you change multiple cards, their separate causal effects are not identified. These agent runs are complements to, not replacements for, human playtests.

## Reproducibility and safety

- The catalogue is compiled fresh for every worker from the immutable stage JSON and used by **both the real canonical phase engine and the fair-information MCTS hidden-deck model**.
- The public `createGame()` still always loads canonical cards. Staging is accepted **only** as an explicit `createDecisionSession(..., cardPools)` research option, or by the staging runner.
- `forkGameState()` preserves physical Item identities and staged card aliases, and MCTS does not peek at true hidden order.
- The A/B pipeline cannot change printed sources. Any later promotion requires an explicit, reviewed source-code change and subsequent rules/print checks.
