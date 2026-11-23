#!/usr/bin/env bash
# D1 runner (plan rev. 3 §4). Derived from run-14e2.sh (approved 14e-1 v2 server pattern: own PIDs, never pkill).
# Usage: run-d1.sh <repo> <run dir> <out dir> <mode: tmenu|tmenu-geom (A11Y; derived from acceptance-d1/scripts/run-d1.sh)>
# Test scripts are taken from this script's directory; t14e/seed14e come byte-identical from acceptance-14e/scripts.
#
#
# Usage: run-14e2.sh <repo> <run dir (scratch)> <out dir> <mode>
#   mode  rep        one formal repetition: fresh backend → seed14e → t14e → contract14e → axe14e → stop
#         verify-r4  fresh backend → seed14e → t14e (independent verification of the R4 harness correction; not formal)
#         neg-a|neg-b|neg-d   fresh backend → seed14e → NEG=<x> t14e   (must FAIL in the named place)
#         neg-c               fresh backend → seed14e → NEG=c contract14e (must FAIL)
#
# Known failure D1 (approved option (ii)): the t14e check "[H J1 keyboard] no unexpected console errors" fails with
# `pageerror: Canceled` (Monaco). It is NOT filtered or suppressed: t14e still counts it as a failure and exits 1. This
# runner only CLASSIFIES it: when that is t14e's one and only FAIL line, the step is recorded as "KNOWN-FAILURE D1" and the
# repetition continues. Any other FAIL line (or that check failing with a different message) is unclassified → exit 2.
# Server handling is the approved 14e-1 v2 pattern: only processes this runner started are stopped; never pkill.
set -uo pipefail
REPO=$(cd "$1" && pwd); RUN=$2; OUT=$3; MODE=$4; SCRIPTS=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$RUN" "$OUT"; RUN=$(cd "$RUN" && pwd); OUT=$(cd "$OUT" && pwd)
LOG="$OUT/runner.log"; RESULTS="$OUT/results.tsv"
echo -e "time\tmode\tstep\texit\tclassification\toutput" > "$RESULTS"
log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
KNOWN_D1='FAIL  [H J1 keyboard] no unexpected console errors  — pageerror: Canceled'

# ---- tools (scratch only; nothing added to package.json) and script copies with recorded hashes ------------------------
[ -d "$RUN/node_modules/playwright-core" ] && [ -d "$RUN/node_modules/axe-core" ] || (cd "$RUN" && { [ -f package.json ] || npm init -y >/dev/null; } && npm i playwright-core@1.48.2 axe-core@4.10.2 >/dev/null 2>&1)
log "mode=$MODE · playwright-core $(node -p "require('$RUN/node_modules/playwright-core/package.json').version") · axe-core $(node -p "require('$RUN/node_modules/axe-core/package.json').version")"
for s in seed14e.mjs t14e.mjs contract14e.mjs axe14e.mjs; do cp "$REPO/acceptance-14e/scripts/$s" "$RUN/$s"; done
(cd "$RUN" && shasum -a 256 seed14e.mjs t14e.mjs contract14e.mjs axe14e.mjs) | tee "$OUT/scripts.sha256" >> "$LOG"

# ---- servers (14e-1 v2) ----------------------------------------------------------------------------------------------
B_LAUNCH=""; V_LAUNCH=""
descendants() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done; }
port_busy() { lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1; }
kill_tracked() {
  [ -z "$2" ] && return 0
  local pids; pids="$(descendants "$2") $2"; pids=$(echo $pids)
  kill $pids 2>/dev/null
  for _ in $(seq 1 30); do local alive=""; for p in $pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done; [ -z "$alive" ] && break; sleep 1; done
  for p in $pids; do kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null; done
  log "stopped $1 tracked pids: $pids"
}
start_servers() {
  for port in 8081 8080; do port_busy $port && { log "ABORT: port $port already in use by $(lsof -ti tcp:$port -sTCP:LISTEN | tr '\n' ' ')- left untouched"; exit 4; }; done
  (cd "$REPO/backend" && exec mvn -q spring-boot:run -Dspring-boot.run.profiles=h2 > "$OUT/backend.log" 2>&1) & B_LAUNCH=$!
  for _ in $(seq 1 90); do curl -s -o /dev/null http://localhost:8081/api/public/collections && break; sleep 2; done
  local BPID; BPID=$(lsof -ti tcp:8081 -sTCP:LISTEN | head -1)
  [ -z "$BPID" ] && { log "ABORT: backend not listening"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  echo " $(descendants "$B_LAUNCH" | tr '\n' ' ') " | grep -q " $BPID " || { log "ABORT: :8081 listener $BPID not ours"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  (cd "$REPO" && exec npx vite --port 8080 --strictPort > "$OUT/vite.log" 2>&1) & V_LAUNCH=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:8080/ && break; sleep 1; done
  local VPID; VPID=$(lsof -ti tcp:8080 -sTCP:LISTEN | head -1)
  [ -z "$VPID" ] && { log "ABORT: vite not listening"; kill_tracked vite "$V_LAUNCH"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  echo " $V_LAUNCH $(descendants "$V_LAUNCH" | tr '\n' ' ') " | grep -q " $VPID " || { log "ABORT: :8080 listener $VPID not ours"; kill_tracked vite "$V_LAUNCH"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  log "FRESH backend pid=$BPID (launcher $B_LAUNCH, H2 in-memory) · vite pid=$VPID (launcher $V_LAUNCH)"
}
stop_servers() {
  kill_tracked vite "$V_LAUNCH"; kill_tracked backend "$B_LAUNCH"; V_LAUNCH=""; B_LAUNCH=""
  local free=yes; for port in 8080 8081; do port_busy $port && free=no; done; log "servers stopped; ports 8080/8081 free: $free"
}
trap 'stop_servers' INT TERM

# ---- steps -----------------------------------------------------------------------------------------------------------
UNCLASSIFIED=0
step() {   # $1 name, rest: command (run inside $RUN); records exit, PASS/FAIL counts and classification
  local name=$1; shift; local of="$OUT/$name.txt"
  log "step $name: $*"
  (cd "$RUN" && "$@") > "$of" 2>&1; local ec=$?
  local nfail npass; nfail=$(grep -c '^FAIL  ' "$of"); npass=$(grep -c '^PASS  \|^SCAN  ' "$of")
  local cls=pass
  if [ $ec -ne 0 ] || [ "$nfail" -gt 0 ]; then
    if [ "$name" = t14e ] && [ "$nfail" -eq 1 ] && grep -qF "$KNOWN_D1" "$of"; then cls="KNOWN-FAILURE D1 (unsuppressed; counted as a failure by t14e)"
    else cls=UNCLASSIFIED; UNCLASSIFIED=1; fi
  fi
  echo -e "$(date -u +%FT%TZ)\t$MODE\t$name\t$ec\t$cls\t$(basename "$of")" >> "$RESULTS"
  log "step $name: exit $ec · PASS $npass · FAIL $nfail · $(grep -E 'checks passed|scans performed' "$of" | tail -1) · $cls"
}

start_servers
step seed14e node seed14e.mjs
cp "$RUN/seed14e.json" "$OUT/seed14e.json"
mkdir -p "$OUT/screenshots"
case "$MODE" in
  td1) cp "$SCRIPTS/td1.mjs" "$RUN/td1.mjs"; step td1 node td1.mjs ;;
  td1-creator) cp "$SCRIPTS/td1-creator.mjs" "$RUN/"; rm -f "$RUN/o2-baseline.json"; step td1-creator node td1-creator.mjs; [ -f "$RUN/o2-baseline.json" ] && cp "$RUN/o2-baseline.json" "$OUT/" ;;   # O2_BASELINE passes through the environment
  t2-editor) mkdir -p "$RUN/13e" "$RUN/screenshots"; cp "$REPO/acceptance-13e/scripts/common.mjs" "$REPO/acceptance-13e/scripts/t2-editor.mjs" "$RUN/13e/"; (cd "$RUN/13e" && shasum -a 256 common.mjs t2-editor.mjs) | tee "$OUT/13e-scripts.sha256" >> "$LOG"; step t2-editor sh -c 'cd 13e && node t2-editor.mjs' ;;
  tmenu) cp "$SCRIPTS/tmenu.mjs" "$RUN/"; step tmenu node tmenu.mjs new ;;
  tmenu-geom) cp "$SCRIPTS/tmenu.mjs" "$RUN/"; step tmenu-geom node tmenu.mjs old --geometry-only ;;
  t14e) step t14e node t14e.mjs "$OUT/screenshots" ;;
  verify-r4) step t14e node t14e.mjs "$OUT/screenshots" ;;
  neg-a|neg-b|neg-d) step t14e env NEG="${MODE#neg-}" node t14e.mjs "$OUT/screenshots" ;;
  neg-c)     step contract14e env NEG=c node contract14e.mjs ;;
  *) log "unknown mode $MODE"; stop_servers; exit 3 ;;
esac
stop_servers
case "$MODE" in
  *) [ $UNCLASSIFIED -eq 0 ] && { log "RESULT: no unclassified failure"; exit 0; } || { log "RESULT: UNCLASSIFIED failure — stop and classify"; exit 2; } ;;
  neg-*) log "RESULT (negative control): the run must FAIL — see results.tsv / outputs"; exit 0 ;;
esac
