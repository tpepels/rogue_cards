# Canonical Oracle completion gates and local research

This work has three distinct gates. Do not run a broad balance study
as a substitute for the canonical mechanical audit, and never interpret
missing observations as evidence that a card is balanced.

## 1. Searchable canonical decisions

The production game is controlled by
src/engine/decision-session.js and the one legalActions/applyAction
interface in src/engine/index.js. Nested triggers use transactional
replay rather than duplicating card effects.

Current supported decision families include:

- Printed Room choice, conditional costs and Shrine alternatives
- Corridor selection, revealed Room order, and the saved-corridor exit
- Hero-mode selection and the option to skip a Hero power
- Push-your-luck costs, kept rerolls, Ring of Echoes selection
- Equipment, transfer and choice of physical paid Item
- Item activation/reactions, including before/after attack, defense,
  magic, Room rolls, and retained used Potions
- Retained Room trigger alternatives, Monster responses and remains
- PARLEY, Vault SEAL, post-Warden choices, and combat actions

The engine explicitly exposes sequential choices inside an earlier
decision. Multiple chance switches reconstruct already observed results
before resampling genuinely unseen outcomes. A finite regression suite
does not prove that every conceivable *combination* of card timing
and triggers is correct. Treat unverified interactions as open coverage.

Information-set MCTS uses PUBLIC game observations, including the
observable per-Hero used Item tokens, exhausted cards, retained effects,
and pending combat modifiers. Fair mode samples unknown decks.
Oracle mode knows actual remaining decks but not future dice.

## 2. Canonical correctness audit (local only)

First run the focused tests and print/handler validation:

~~~bash
git pull --ff-only
npm run test:session
npm run validate:deck
~~~

Then run the NEW canonical dispatcher/decision audit:

~~~bash
npm run audit:canonical -- \
  --runs 36 --seed 20261014 --max-steps 3000 \
  --out results/canonical-audit-01
~~~

It exercises:
- Every printed Room d6 face through roomRoll()
- Every printed rolled Item face through actual physical ownership
  and activate()
- All four bands of each Monster and Warden through monsterRespond()
- Both printed Room decisions with legalActions() and applyAction()
- Every legal alternative reached by seeded exploratory expeditions,
  on a separate state fork, plus terminal and resource invariants

The audit fuzzer deliberately samples many actions. Its behavior is
NOT an agent policy and its results contain NO valid win-rate evidence.

Inspect summary.json, summary.md and reproducible-failures.json.
Failures contain card ID or action, source seed, phase and step, a
stack trace, and recorded decisions. A branch that cannot be reached
with the current legal fixtures is flagged as missing coverage,
never silently marked passed.

IMPORTANT: The audit is an exhaustive *printed-face enumeration*
under defined fixture contexts, plus a finite sampled *state-space*
audit. It cannot prove all possible interactions in an enormous game
tree. Its completeFaceCoverage and pass fields must be checked;
no human should override failed or missing mechanics.

If this gate is red, repair the engine first.

## 3. Local overnight paired balance study

Preview the study without running expeditions:

~~~bash
npm run oracle:balance -- \
  --runs 7200 --workers 7 --hours 10 \
  --seed 20261014 \
  --navigate-budget 2 --future-budget 2 \
  --min-eligible 60 \
  --out results/session-balance-01 \
  --dry-run
~~~

After passing the correctness audit, use the same command without
--dry-run. Real runs now **refuse to start** unless the default
results/canonical-audit-01/summary.json reports a complete passing
audit of at least 36 seeded walks at precisely the same Git revision.
Use --audit /path/to/summary.json if the audit has another location.
A dry-run does not require the audit to have completed.

The runner:
- Rotates all eight solo Heroes and 28 two-Hero combinations
- Navigates real expedition states with canonical session MCTS
- Selects candidate decisions across the entire expedition, including
  later regions, rather than always comparing the first Room
- For each independent initial seed, compares ONE matched pair of
  genuine legal choices using identical initial resources, matched
  future chance seeds and MCTS for all later decisions
- Stores one checkpoint for each completed *source seed*
- Stops and writes a failure reproduction file on the first
  unsupported/invalid rule transition
- Stops scheduling new seeds after its local hour cap. In-flight
  jobs are allowed to finish
- Corrects exact two-sided paired McNemar tests across all observed
  card contrasts with Holm's method
- Requires at least min-eligible independent states per contrast
  before reporting statistical significance

Do not change code or options before resuming:

~~~bash
npm run oracle:balance -- \
  --runs 7200 --workers 7 --hours 10 \
  --seed 20261014 \
  --navigate-budget 2 --future-budget 2 \
  --min-eligible 60 \
  --out results/session-balance-01 \
  --resume
~~~

Summary files contain both card-level candidate contrasts and
unreached/unpowered alternatives. A missing Item or Room remains
untested. The runner does not invent extra Items or force a Room
into the opening deck.

MONSTERS: a Monster's printed behavior results have mechanical
dispatcher coverage, but this study does not yet implement
causal Monster-stat counterfactuals. Passive Items likewise have
no optional activation contrast. The report says this explicitly.
No result can be interpreted as a comprehensive certificate for
all 139 unique cards until those gaps are closed.

## Analysis requirements

A contrast qualifies as *statistically significant* only if it
has at least the stated independent-source minimum and its
Holm-adjusted p-value is below 0.05. Its effect size and paired
confidence interval must also be considered. "Inconclusive" does
not imply balanced, and significant difference does not alone
prove that a mechanic is faulty.

Repeated seeds from the same source state are NOT counted as
independent card samples. One matched pair per independently
seeded naturally reached state is the study's counting unit.

An engine failure is NOT a lost expedition. The study stops and
keeps the failure record. Correct the printed-mechanic mismatch,
rerun local tests, then start a new report pinned to the new
Git revision; don't merge those outcomes with older data.

For review, archive results locally:

~~~bash
tar -czf rogue-cards-canonical-audit.tar.gz \
  -C results canonical-audit-01

tar -czf rogue-cards-session-balance.tar.gz \
  -C results session-balance-01
~~~

Upload both archives for mechanical defect repair and card-value
analysis. No experiment is scheduled on GitHub Actions.
