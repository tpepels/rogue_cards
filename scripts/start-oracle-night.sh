#!/usr/bin/env bash
# Long, checkpointed full-effect Oracle study for an 8-core Linux workstation.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${OUT:-results/oracle-night-01}"
RUNS="${RUNS:-1200}"
WORKERS="${WORKERS:-7}"
HOURS="${HOURS:-10}"
SEED="${SEED:-20261014}"
BUDGET="${BUDGET:-2}"
REPLAN="${REPLAN:-1}"
KNOWLEDGE="${KNOWLEDGE:-oracle}"
CHUNK_SIZE="${CHUNK_SIZE:-10}"
RESUME="${RESUME:-0}"
if [[ "$RESUME" != "0" && "$RESUME" != "1" ]]; then
 echo "RESUME must be 0 or 1" >&2; exit 2
fi
if [[ "$RESUME" = "0" && -e "$OUT" ]]; then
 echo "Output already exists: $OUT. Choose OUT=... or RESUME=1." >&2; exit 2
fi
mkdir -p "$(dirname "$OUT")"
echo "Revision: $(git rev-parse HEAD)"
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
npm run test:rollout
npm run validate:deck
ARGS=(--runs "$RUNS" --knowledge "$KNOWLEDGE"
 --budget "$BUDGET" --replan-budget "$REPLAN"
 --workers "$WORKERS" --hours "$HOURS" --chunk-size "$CHUNK_SIZE"
 --seed "$SEED" --out "$OUT")
npm run oracle:overnight -- "${ARGS[@]}" --dry-run
if [[ "$RESUME" = "1" ]]; then ARGS+=(--resume); fi
LOG="$OUT.log"
echo "Launching: $OUT"
echo "Progress log: $LOG"
if command -v systemd-inhibit >/dev/null 2>&1; then
 nohup systemd-inhibit --what=idle:sleep --mode=block \
  --why="Rogue Cards overnight Oracle experiment" \
  npm run oracle:overnight -- "${ARGS[@]}" >"$LOG" 2>&1 </dev/null &
else
 echo "Warning: systemd-inhibit absent. Prevent automatic sleep yourself." >&2
 nohup npm run oracle:overnight -- "${ARGS[@]}" >"$LOG" 2>&1 </dev/null &
fi
PID=$!
echo "Oracle study started with PID $PID"
echo "Check: tail -n 50 '$LOG'"
echo "Keep laptop plugged in, cool and lid open. Do not git pull before resuming."
