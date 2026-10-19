# Rogue Cards — broad physical-mechanics balance study (32 prototypes)

This is a **batch of genuinely different rule systems**, not another grid
search over Monster HP/ATK. All 32 prototypes are preregistered in
`src/staging/mechanical-prototypes.js`, compiled and checked by the
immutable staging catalogue, and executed through the **same**
`ExpeditionState`, `decision-session`, Monster combat and MCTS search
code as the canonical Everything Goes game.

Canonical printed cards remain unchanged, and no variant is automatically
promoted or printed. Each experiment records its source revision, profile
hash, list of rule interventions and paired start seeds. Previous experiments
must remain in their own output folders: changing this source code invalidates
any in-progress resume on the earlier revision.

## Mechanic families and real rule effects

| Family | Candidates | Executable gameplay variation |
|---|---:|---|
| Monster patrol pressure | 5 | A patrol appears every 2, 3 or 4 regional Rooms. The initial response may be skipped, an attack at DIS, or normal. Room decks and Monster stats are unchanged. |
| Alternative diplomacy | 3 | All ordinary Monsters may be negotiated with via opposed WIT, a one-Item bribe, or either. Failed persuasion makes the first attack harder; success dismisses the Monster without a corpse. |
| Combat withdrawal | 2 | During an ongoing ordinary combat, spend one carried Item to leave, or attempt opposed WIT. Failed WIT gives the Monster attack ADV. |
| Monster morale | 2 | A weakened Monster offers to yield at 50% or 25% HP. The player can spare it (no kill/defeat loot), or continue fighting. |
| Incentives | 2 | Full Monster kills additionally grant one Item draw or two points of healing, as alternatives to default rewards. |
| Warden tactics | 3 | During Warden combat, spend your Hero turn to impose attack DIS, sacrifice an Item to skip a response, or attempt WIT to deal three damage through armor. These keep the Warden's starting 20/10 HP. |
| Mechanic combinations | 15 | Prespecified mixtures of patrols, negotiation, retreat, surrender, rewards and Warden tactics to test interaction effects. |

**Total: 32** physical-mechanics prototypes (plus canonical). Each
intervention is an *experimental rule proposal* and would require rewritten
printable text / reference rules and human playtesting if adopted.

### Important distinctions

- The patrols are **actual physical Monster draws**, with canonical regional
  Monster decks and normal parley/combat. They do not create new Monster cards.
- A successful bribe, negotiated resolution, combat retreat or surrender is
  a real encounter but **not a kill**; no corpse and no kill loot is awarded.
- Failed negotiation or escape is not free: the Monster starts its attack
  with ADV. An Item escape consumes a physical carried Item.
- The Warden tactical alternatives are **Hero actions**, competing with
  attacking, not passive unconditional buffs.
- At surrender the player chooses **spare or press on**. The surrender
  threshold is a *trigger* for a decision, not automatic defeat.
- There is no new administrative tracker: a future printed version could
  use the existing HP counter, the Room number and known dice.

## Design targets and richer metrics

The existing physical game goals remain: 16–20 ordinary Monster encounters
in 36 Rooms; 55–70% culminating in combat; ~50% Vault reach; ~40% solo
wins; 90–120 minutes at the table. These objectives may conflict. **A
candidate only worth considering if it improves multiple dimensions while
remaining printable and playable**, not just maximizing one scalar score.

The structured report now includes, per arm and per Hero:

- Encounters per 36 Rooms and actual 36-Room complete runs
- Number of fights, negotiations, wins/losses, HP and resource attrition
- Number of patrols, selected alternative actions, successful diplomatic /
  withdrawal / mercy / Warden actions, kills and compensation rewards
- Vault reach, Warden engagement and victory conditioned on Vault entry
- Per-card Monster exposure and original Room decision breakdowns

MCTS is a *model player*. It can test whether alternatives are rational under
the current evaluation, but **cannot prove that a choice is fun**, nor does
its wall-clock CPU time predict actual tabletop minutes. The key human
criterion after the computational study is whether each added decision
feels worthwhile while keeping cards clear.

## Large local study — run both phases in one command

**Do not update or switch branches in the checkout used by an older active
study.** Finish it or use another worktree. This suite needs source code at
the latest `main` revision, and a new result directory.

A full multi-arm study with all eight Heroes, 32 candidates, and family-
balanced independent confirmation:

```bash
cd ~/Projects/rogue_cards
git pull --ff-only

npm run test:balance:mechanics
npm run test:card:staging

npm run study:balance:hypotheses -- \
  --suite mechanics \
  --workers 8 --minutes 720 \
  --seed 20270201 \
  --screen-repeats 12 --confirm-repeats 32 \
  --finalists 8 \
  --out results/mechanical-balance-v1
```

- **Screening:** 33 arms (32 hypotheses + shared canonical control) ×
  8 Heroes × 12 starts = **3,168 full expeditions**.
- **Independent confirmation:** 9 arms (best 8, with at least one per
  mechanic family if the screen contains all seven families, plus canonical)
  × 8 Heroes × 32 *different* starts = **2,304 expeditions**.
- **Total:** **5,472** full expeditions with one frozen MCTS agent.

The time limit is a hard cap, not a runtime guarantee. The runner saves each
finished trial immediately and writes its summary periodically. If it does
not finish in one session, re-run with **identical** options and the same
code revision and directory. It refuses incompatible resumes.

Artifact names:

- `manifest.json` — exact code revision, agent and staged definition
  hashes, seed plan and starting deck counts
- `trials.ndjson` — independent full-expedition records for canonical and
  every selected prototype, including mechanism outcomes
- `summary.json` — separate screening and holdout results, per Hero
  and selected mechanism/card effects
- `comparison.md` — human-readable ranking plus
  `mechanicTotals`, `mechanicSuccesses` and Warden measures

## Statistical honesty

The 32-way screen is exploratory. The top eight are confirmed on genuinely
different start seeds, with at least one candidate from each mechanic family,
rather than all eight being variants of the same rule. Screen selection,
not holdout outcomes, determines which candidates go forward. Compare
paired differences and uncertainty **on the holdout**; inspect by-Hero results
and the number of actual mechanic uses, because a rule that the agent almost
never chooses cannot demonstrate its usefulness.

No A/B pairing fixes later RNG results after play paths diverge. For narrow
Warden causal claims, reuse saved *identical Vault-entry states* in an
additional specialist study before changing printable rules.
