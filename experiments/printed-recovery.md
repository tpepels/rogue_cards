# Printable recovery alternatives — +5 diagnostic benchmark

**Status:** Three physical rule proposals implemented **in staging only**; simulation / statistical validation **pending**.  
**Reference:** `combat-healing` study, Balanced B; diagnostic automatic **+5 HP after each won regional fight**.  
**Decision:** Do **not** add a universal after-combat healing rule. Do **not** modify the canonical deck until validation and explicit designer approval.

## Why this work precedes Ultimate Balance Act

The recent +5 diagnostic simulations suggest that the game benefits from substantially more *available* recovery. In the partial confirmation uploaded on 2026-10-19, the +5 arm restored about **18.3 effective HP per expedition** on average, with additional offered HP wasted at the cap. This is a **reference effect**, not a proposed printable rule and not a claim of an exact required total. It cannot be reproduced by adding 18 HP worth of consumables: opportunities, card draws, costs, timing, agent choices and HP caps all matter.

We must first find viable **existing-rule** ways to supply the recovery: Items, the already-printed paid REST choice and individual printed Monster DEFEAT effects. Once validated, these will become a concrete baseline for Ultimate Balance Act.

## Physical rule changes permitted

All proposals keep the **same Balanced B Room distribution**, Heroes, Warden, encounter/spawn rules and Monster stats.

1. **Healing Items already in the game** — increase copies of existing Linen Bandages (`ex-bandages`: discard outside combat to heal d6), Dry Rations (`ex-rations`: discard outside combat to heal 2) and Thorn Tonic (`odd-thorn-tonic`: discard outside combat to heal 3 with a WIT DIS cost). Existing Item timing and effects do not change.
2. **Existing Room REST choices** — raise recovery on Coal Store, Abandoned Barracks and Vacant Watchpost using only the existing `HEAL` opcode. Coal Store and Barracks still require discarding an Item. The REST choice competes with rolling for Items/risks; we do not create free additional actions.
3. **Individual printed Monster DEFEAT rewards** — selected Monsters retain their current printed reward and add an explicit, Monster-specific small `HEAL` effect after defeat. Other Monsters are unchanged. No automatic rule applies to every won fight. As with the existing DEFEAT cards, Parley, banishment, retreat and Warden victories do not award it.
4. **Optional corpse EAT/SEARCH** remains unchanged: these are already existing, sometimes risky recovery mechanics that the agent can choose.

The staging compiler generates the actual printed `v2.defeat`, `v2.defeatOps` or Room `v2.choices[1].effect` together with their executable effects. No separate natural-language guessing or unprinted hidden opcode.

## Current candidate arms

| Arm | Bandages / Rations / Tonic copies | Paid REST: Coal / Barracks / Watchpost | Added Monster-specific DEFEAT healing |
|---|---|---|---|
| **Canonical** | 3 / 3 / 2 | 3 / 4 / 2 HP | none beyond canonical reward set |
| **printed-recovery-light** | 5 / 4 / 3 | 5 / 5 / 3 HP | 6 named Monsters, +2 HP |
| **printed-recovery-supplies** | 9 / 6 / 5 | 6 / 7 / 5 HP | 12 named Monsters, +2 HP |
| **printed-recovery-combat** | 6 / 5 / 3 | 5 / 6 / 4 HP | 12 named Monsters +2 HP, 6 more +3 HP |
| **balanced-combat-heal-5** | 3 / 3 / 2 | 3 / 4 / 2 HP | **Non-printable universal +5 diagnostic reference** |

All three printed candidates are *hypotheses*. They are not known to reproduce the reference, and this table is **not** a performance ranking. Note that increased Item copies change the overall draw probabilities: the comparator should assess both access and use, not simply the raw number of cards.

## Running the existing study (without building Ultimate Balance Act)

This is a temporary dedicated suite using the **existing** full-expedition and frozen-player runner.

~~~bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:balance:printed-recovery

node scripts/study-balance-hypotheses.mjs \
  --suite printed-recovery --variant-limit 4 --finalists 4 \
  --screen-repeats 8 --confirm-repeats 16 \
  --workers 8 --minutes 600 \
  --out results/printed-recovery-v1
~~~

Always use a **fresh output directory** for this new code revision. Interrupted jobs are resumable using the **same command, revision and output directory**. Do not change the Git revision between starting and resuming: the runner checks manifests.

The study contains a canonical control, three real printed-recovery proposals and the diagnostic +5 arm. It schedules 320 screening expeditions and 640 independent confirmation expeditions when the specified repeats are used.

For a quick execution-path smoke check:

~~~bash
node scripts/study-balance-hypotheses.mjs \
  --suite printed-recovery --variant-limit 4 --finalists 4 --dry-run
~~~

The simulation must not be treated as already run just because these commands are now available. Exact comparison to the prior +5 results also requires attention to the new seed plan and code revision.

## How to decide whether this is solved

Compare the printed arms with **both** Balanced B canonical and the +5 benchmark on disjoint confirmation seeds:

- Vault access target ~60%.
- Victory given Vault access target ~60%, reporting Warden-fight success separately.
- Approximately 16–20 ordinary Monster encounters / 36 Rooms, and 55–70% fight conversion.
- No universal healing; every healing event must be a printed card rule.
- All eight Heroes individually viable; avoid a single powerful Hero masking weak ones.
- Items acquired and used, paid REST selected, and printed heal rewards triggered.
- Look for healing wasted near max HP and excessive end-of-game Item stockpiles.
- Preserve meaningful decisions, costs and characteristic Monster rewards.

**If no tested variant matches +5:** do not invent a new background rule. Inspect whether Item draw scarcity, the player's reluctance to spend Items, too-late recovery or particular difficult Monsters are responsible. Iterate on the *existing* physical options and re-confirm.

## Code locations

- `src/staging/catalogue.js` — safe `monsterHealing` and `roomRestHealing` staged printed edits.
- `src/staging/printed-recovery-hypotheses.js` — the current arm definitions.
- `scripts/study-balance-hypotheses.mjs` — temporary `printed-recovery` suite.
- `tests/printed-recovery.test.mjs` — printed/executable parity, exclusion and CLI tests.
- `experiments/ultimate-balance-act.md` — the subsequent full optimizer architecture.

## Progress checklist

- [x] Choose +5 as the **numerical reference**, not a final rule.
- [x] Identify existing recovery channels.
- [x] Implement three fully staged, physically printable recovery proposals.
- [x] Add targeted invariant/parity tests (**execution in user's Node environment pending**).
- [ ] Execute targeted tests and repair failures if any.
- [ ] Complete fresh candidate screening.
- [ ] Complete independent held-out confirmation.
- [ ] Select a playable printed candidate based on evidence.
- [ ] Obtain designer approval before applying changes to canonical card faces.
- [ ] Only then proceed with the Ultimate Balance Act roadmap.
