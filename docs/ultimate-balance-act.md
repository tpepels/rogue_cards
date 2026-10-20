# Ultimate Balance Act

UBA evaluates printable proposals with the canonical 36-Room expedition engine. It never promotes cards. The authoritative phase tracker is [the roadmap](../experiments/ultimate-balance-act.md).

Run an automatic search:

```bash
node scripts/balance-optimize.mjs \
  --goals experiments/balance-goals.json \
  --base balanced-recovery-v1 --workers 8 --budget-hours 12 \
  --out results/ultimate-balance
```

The default search freezes `reference-v1`: party-aware frontier implicit MCTS, budget 8, fair knowledge, no priors or progressive widening. `--algorithm random` provides the random-search control. An evolutionary run screens a generated population, refines promising and uncertain configurations, preserves Pareto compromises, and independently confirms finalists. The finite population/generation settings are ceilings; the time budget is a cap, not a request to fill every hour.

Re-run the same command to resume. Worker count and resource allocation can change. Candidates, profiles, goals, seeds, trial plans, runtime source bytes, Node version and platform must match. A crash during a final NDJSON write can recover its unfinished tail; checksums, duplicate tasks, unexpected records and changed inputs cause an explicit error. Failed, interrupted or unresolved trials remain pending and never become losses.

Outputs include the exact configuration, baseline inventory, candidate manifests, checksummed raw trials, progress/resource usage, detailed comparisons, ranked and Pareto archives, independent confirmation, full physical decks, printable diffs and local HTML print previews. The preview uses the repository’s existing card renderer, artwork and A4 sheets. Keep the repository available when opening a preview; JSON exports are portable.

For a fast integration exercise, explicitly select `--profile random-v1 --population 4 --generations 2 --screen-runs 1 --refine-runs 2 --no-validate`. Random-policy results verify the machinery; they do not establish balance under MCTS or human players. `--no-validate` never produces a validated design.

## Evaluate arbitrary candidates and factorial designs

```bash
node scripts/balance-run.mjs --candidates experiments/candidates/ \
  --profiles reference-v1 --runs 4 --workers 8 --out results/uba-batch

node scripts/balance-run.mjs --factorial experiments/uba-factorial.json \
  --profiles random-v1 --runs 1 --workers 8 --out results/uba-factorial
```

The supplied factorial crosses Room composition, Monster HP and printed Bandage healing. `factorial.json` contains descriptive orthogonal contrasts; replicated independent confirmation is needed before interpreting an interaction as established. Use `--record-events` for compact committed traces, including resolved HP effects and dice. Ordinary encounter counters exclude both Warden phases.

A candidate is immutable JSON:

```json
{
  "schema": "uba-candidate-v1",
  "id": "joint-proposal",
  "base": "balanced-recovery-v1",
  "staging": {
    "cards": [
      {"collection": "monsters", "id": "rat", "set": {"hp": 4}},
      {"collection": "items", "id": "ex-rations", "set": {"copies": 4}},
      {"collection": "heroes", "id": "warrior", "set": {"hp": 19}}
    ],
    "itemHealing": {"ex-bandages": 4},
    "roomRestCost": {"ex-u-coal-store": 0},
    "monsterRewards": {"rat": ["HEAL:3"]},
    "monsterBehaviors": {"rat": ["none", "hit", "dis", "adv"]}
  }
}
```

`roomDeck.STAGE.selection` lists physical IDs, with repetitions representing additional printed copies. Starter Items cannot disappear, Monster stages cannot be empty, and each stage needs at least twelve non-Corridor Rooms. Hero HP/ATK/DEF/WIT, both Warden stat blocks, Item/Monster quantities, supported Room operations, REST healing/costs, Monster behaviors/rewards and Bandage/Ration effects can vary jointly. Printed text and executable operations are generated together. Unknown fields, malformed opcodes, hidden recovery mechanics, unsupported abilities and new co-op rules reject explicitly.

Search dimensions are bounded JSON data. Supported kinds are `card-stat`, `room-transfer`, `item-healing`, `monster-healing`, `room-rest-healing` and `room-rest-cost`. Stat dimensions accept one `id`, explicit `ids`, or every card in a collection, with absolute values or `offset:true`. Each candidate is compiled before simulation. `--space file.json` restricts the dimensions; no function bodies or agent parameters belong in that file.

## Independent confirmation

```bash
node scripts/balance-validate.mjs \
  --candidate results/ultimate-balance/finalists/candidate-1.json \
  --tuning results/ultimate-balance/optimizer-state.json \
  --runs 32 --workers 8 --out results/uba-validation
```

Candidates and goals lock before holdout seeds are opened. Split seed domains are disjoint by construction. Confirmation requires every Hero and pair, adequate samples and Vault entries, the goals’ required distinct profiles, complete telemetry, physical constraints, target tolerances and baseline regression checks. Missing evidence yields `uncertain`; positive evidence of a violation yields `rejected`. Wilson intervals and paired party/seed bootstrap comparisons accompany the estimates; continuous means and resource ratios use explicit fixed-party normal/delta-method approximations over complete expeditions, with inadequate replication reported as unknown. Confirmation checks their target intervals too. The validation family uses Bonferroni adjustment. Multiple policies are reported separately and cannot be pooled into one optimization score.

The initial minimum sample settings are safeguards, not a guarantee that every desired effect is detectable. They often leave a design uncertain. Human playtest JSON can be supplied with `--human-feedback`; enjoyment and physical duration are never inferred from simulator wall time.

## Compare agents independently of game changes

```bash
node scripts/balance-compare-agents.mjs --dry-run
node scripts/balance-compare-agents.mjs --workers 8 --budget-hours 12 \
  --out results/uba-agent-comparison
```

This command freezes canonical cards and compares reference, widening, priors and combined profiles. Screening and confirmation use separate seed domains. The default conservative power plan uses 467 confirmation repeats per party: 67,248 expeditions across four profiles, with 80% power to detect a ten-point true improvement above a two-point superiority threshold under its independent bounded-difference assumptions. The simultaneous Hoeffding decision bound avoids assuming a favorable unknown paired variance. A smaller override is a pilot and cannot pass the default sample gate. Nothing changes the canonical MCTS defaults automatically.

## Card impact and compensation

```bash
node scripts/balance-card-impact.mjs --card experiments/uba-new-tonic.json \
  --base balanced-recovery-v1 --workers 8 --budget-hours 12 \
  --out results/uba-card-impact
```

Proposals use `uba-card-proposal-v1` with `action:add|modify|remove`. Additions supply a complete `room-v1`, `monster-v1` or `consumable-v1` definition; the Tonic example illustrates a new printed Item. Modify/remove proposals specify a `collection` and `id`, numeric `set` or removed `copies`, with optional supported `healing` or Room `restCost` edits. New opcodes and arbitrary code are rejected.

The proposed card is frozen during compensation. `--restrictions file.json` accepts `protectedCards` such as `monsters:rat` and an allowed `space` list. Global stat operators exclude protected cards. The report compares the original and proposed decks on paired starts, then searches compensation within that restricted space and validates any finalists independently. A bounded search may report that no feasible improvement was found; a proposed patch is not an adopted or validated edition.

## Current limits

The opcode grammar intentionally covers deterministic supported effects. It does not invent new Hero abilities, co-op mechanics, special/fate Room handlers or new equipment systems. Ordinary Item effect replacement is limited to Bandages/Rations and declarative consumables.

Committed HP effects conserve each Hero’s initial HP plus healing minus damage. Canonical emitters identify their printed card or rule; the laboratory rejects unknown HP-source effects. Compound hits preserve their printed contributors, while effective HP per contributor stays unallocated when protection/caps act on the combined hit and the rules define no allocation. Available/selected/resolved action counters distinguish opportunity from transaction completion; completion is not the same as succeeding at a die check. Healing availability counts actually legal source/action pairs with a possible executable healing operation. Unchosen chance outcomes and hypothetical HP restored never become offered or effective healing. Raw traces and aggregate metrics preserve these distinctions.

The included execution evidence is an engineering pilot. Large reference-agent optimization, repeated baseline-domination benchmarks, high-power independent design confirmation, and the full powered agent comparison remain separate computational studies. No current pilot justifies promoting a card or changing the default agent.
