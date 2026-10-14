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


## Reversible equipment loops in the canonical study

The printed rules permit free equip, unequip, and transfer actions at
safe decision boundaries. Human players simply continue when satisfied,
but a finite-budget MCTS continuation could choose equipment changes
indefinitely, reaching the 7,000-step source limit without a game
ending. The engine does **not** change this choice set.

`src/session-policy.js` now lets MCTS inspect **all currently legal
actions**, then after twelve consecutive reversible
equipment changes, the *study policy* selects the existing legal
`continue` action, regardless of which action MCTS recommends. This is a declared anti-cycle convention for
computational evaluation, not an additional printed-card restriction.
It is applied identically to source expeditions and both paired
counterfactual continuations. Counts of these policy interventions
are retained in the report. They must not be interpreted as
strong evidence of optimal human play.

Nested MCTS rollouts now have a separate **six consecutive free equipment
actions** cap. The canonical legal-action interface is unchanged; the
search still starts by exploring every legal root alternative (including
equipment and transfers). Beyond that limit in sampled future play,
it selects the *actual legal Continue action* instead of walking through
reversible gear changes indefinitely. This keeps full, genuine printed
terminal expeditions while making the finite-budget search less prone
to spending most of its rollout on no-progress actions. This is a
decision-policy assumption, not a proof of optimal play or a change
to the physical cards.

Failed matched continuations are still errors, never automatic losses
or excluded successful-looking samples. Failure reports include
policy counts, action-kind frequencies, the last forty actions and
matching dice/deck/policy seeds, so another cause of nontermination
is actionable rather than silently hidden.

## 2b. Estimate overnight duration before starting it

A successful 36-seed audit does NOT measure the speed of the Oracle.
The full study performs one or more actual MCTS searches at essentially
every decision and can be far more expensive than the correctness audit.

After updating Git, run the matching-revision 36-seed audit again.
Then run a bounded pilot on the **actual** overnight workload:

~~~bash
npm run oracle:balance -- \
  --benchmark \
  --runs 7200 --workers 7 --hours 10 \
  --seed 20261014 \
  --navigate-budget 2 --future-budget 2 \
  --min-eligible 60 \
  --benchmark-runs 18 --benchmark-minutes 15 \
  --focus room \
  --audit results/canonical-audit-04/summary.json \
  --out results/session-balance-01
~~~

The pilot spends **at most 15 minutes** running full canonical MCTS
worker jobs, terminates in-flight pilot work at the cutoff, and writes:

    results/session-balance-01-benchmark.json

To replay one specific failed source index with the real agent and
the same Hero party, chance seed and search settings, first rerun the
36-seed mechanical audit against the current Git revision, then:

~~~bash
npm run oracle:balance -- \
  --repro-index 3573 \
  --focus room --runs 7200 --workers 7 --hours 10 \
  --seed 20261014 \
  --navigate-budget 2 --future-budget 2 \
  --min-eligible 60 \
  --audit results/canonical-audit-06/summary.json \
  --out results/session-balance-rooms-03
~~~

This runs ONLY independent source 3573 through the real canonical
study. Its trace is written to
results/session-balance-rooms-03-repro-003573.json.
Neither a successful replay nor the benchmark contributes study samples.
A success means only that this one reproduction no longer fails, not
that the complete engine has been proved correct.

The pilot never creates actual balance checkpoints, never changes
any game rules, and never counts benchmark comparisons as scientific
evidence. It measures wall-clock completed independent sources on
the intended concurrency, then projects 7200 real sources. It reports:

- Estimated study hours from measured completions
- A 2x workload sensitivity (not a statistical confidence bound)
- Number of fully completed and paired samples
- Distinct card-decision focus families observed
- If any workers were terminated at the pilot cutoff
- A coverage *capacity* calculation, not a claim of all-card coverage

The estimate must be read conservatively. Particularly if the
pilot times out, completed jobs overrepresent the fastest seeds.
An empty or very small sample **cannot** justify launching 7200
sources. Only execute a long study after examining both the estimate
and the observed paired/eligible counts.

**Important statistical design limitation:** in the current
single-contrast-per-source design, \`--runs 7200 --focus all\` assigns
only 800 potential comparisons to each of the nine focus families.
There are 64 regional Rooms and 52 Objects, so even under ideal
uniform sampling that means at most 12.5 Room and 15.4 Item
comparisons *on average*. This cannot reach \`--min-eligible 60\`
for every card. Real reach rates are lower, and passive Objects
currently have no causal contrast at all. The generic "all" run
cannot provide an all-card statistically significant verdict.
The runner now refuses an underpowered `--focus all` overnight
configuration before scheduling expensive workers; the benchmark
still runs so you can inspect realistic costs and coverage.

A more useful focused overnight study is \`--focus room\`, followed
separately by Item and other family studies. For all-card coverage,
the runner needs more than one eligible comparison per independent
source expedition, or a larger/adaptively allocated study; it must
also add intervention designs for passive effects.

The main run now requires:
- Matching-revision passing canonical audit
- Passing \`npm run test:session\`
- Passing \`npm run validate:deck\`
- A 30-minute per-source worker watchdog (\`--job-minutes 30\`;
  configurable) so an indefinitely stalled worker halts with a
  failure JSON instead of running forever

The \`--hours 10\` limit stops assigning **new** work at ten hours.
In-flight source jobs can finish after it, up to the individual
worker watchdog limit. Checkpoint resume remains available.

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
A real run also executes `npm run test:session` and
`npm run validate:deck` in local preflight. Any failed regression
stops the run before launching MCTS workers.

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
