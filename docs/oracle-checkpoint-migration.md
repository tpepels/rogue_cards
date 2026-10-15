# Migrating a slow Oracle study to an optimized revision

The canonical room study started on revision
\`6940e50fd0f8fd848a0b58f534bd9478312b9e83\`. Its independent
\`checkpoints/000118.json\`-style files are completed full-game MCTS source
results. They cannot be resumed under a different Git revision simply by
editing \`manifest.json\`.

The migration script, \`scripts/migrate-session-balance.mjs\`, uses the
optimized study worker to **fully replay every completed old seed** with
identical study settings. It deep-compares *all returned fields*: wins,
selection of paired Room and action alternatives, progression decisions,
party, per-source observation, and policy statistics. Only old records that
exactly match are imported. A single mismatch aborts publication and leaves
the original data untouched.

This is more expensive than spot-checking, but avoids incorrectly merging
statistical samples produced by different algorithms. Verifying already
completed source seeds costs real CPU time; it is NOT a zero-cost resume.

## Steps

1. **Stop the slow study** (Ctrl+C inside its tmux session) to freeze the
   source checkpoint set. Do not delete the original worktree or its audit.
2. In the main checkout, fetch the changes and create a **new pinned**
   worktree for the migration commit:

   \`\`\`bash
   cd ~/Projects/rogue_cards
   git fetch origin
   git worktree add --detach ../rogue_cards_oracle_migrated TARGET_COMMIT
   cd ../rogue_cards_oracle_migrated
   npm run test:session
   npm run validate:deck
   npm run audit:canonical -- --runs 36 --seed 20261014 --max-steps 3000 --out results/canonical-audit-migrated
   \`\`\`

3. Verify and import the old checkpoints. This **uses seven workers** and
   can take significant time for hundreds of completed sources:

   \`\`\`bash
   npm run oracle:migrate-checkpoints -- --from ../rogue_cards_oracle_v3/results/session-balance-rooms-11 --to results/session-balance-rooms-migrated --audit results/canonical-audit-migrated/summary.json --workers 7
   \`\`\`

   The old source manifest and both revision-matched PASS audits must
   exist. The destination must not exist. The tool stages its verification
   in \`results/session-balance-rooms-migrated.migration-in-progress\`.
   Interrupting verification is safe; run **the same migration command**
   again to continue. It never publishes a resumable study unless every
   old completed seed has been verified.

4. Only after the tool prints \`SUCCESS\`, resume the original experimental
   design under the optimized revision:

   \`\`\`bash
   npm run oracle:balance -- --resume --focus room --runs 7200 --workers 7 --hours 10 --seed 20261014 --navigate-budget 2 --future-budget 2 --min-eligible 60 --audit results/canonical-audit-migrated/summary.json --out results/session-balance-rooms-migrated
   \`\`\`

The new manifest contains the optimized revision and target audit path;
the original records are byte-preserved. Audit trail:
\`migration-provenance.json\`, plus a source/target SHA-256 receipt under
\`verified/\` for every migrated checkpoint.

## Stop conditions and invariants

- An old checkpoint cannot be migrated by changing its Git revision
  without re-running its exact independent source through the optimized
  canonical worker.
- The source and destination settings must match in the same order expected
  by the actual balance runner. Worker count and time budget may differ:
  they do not influence seed identity or the experiment.
- If a replay returns a different outcome **or any different field**, the
  migration does **not** publish mixed results. A
  \`failure-XXXXXX.json\` in the staging directory identifies differences.
  Debug the discrepancy before choosing a new migration destination.
- Source files must not change while being verified. The tool hashes the
  entire original snapshot and checks it again before publication.
- Unfinished/in-flight old work is not migrated. The new resume run
  recomputes any missing source index from the beginning.
- The regression test suite, print/deck check, and target canonical audit
  must pass before doing expensive verification.
- The migration cannot certify that both engine versions are mathematically
  identical on unseen states; it proves that **each imported seed's full
  result** is identical under the new revision. Future seeds run solely on
  the new engine.
