#!/usr/bin/env bash
# Step 14e-1: combined regression runner (approved plan rev. 2, §4).
#
# Usage: run-all.sh <repo> <run dir (scratch)> <out dir> [stage ...]
#   env ALLOW="<stage>:<script>[,...]"  a failure of exactly these scripts was CLASSIFIED (superseded / external flake)
#                                        and does not stop the run; the script still runs and its output is kept.
#   env TAG=<suffix>                     appended to output file names (for re-runs of a stage).
#
# - The original scripts are copied from <repo> into <run dir>/<origin>/ and each copy's SHA-256 is verified against
#   acceptance-14e/scripts/manifest.sha256 (hashes taken from the approved ZIP). A mismatch aborts before anything runs.
# - Every stage gets a FRESH backend (new H2 in-memory instance) and a fresh Vite dev server; both are stopped after it.
# - The runner stops at the first failing seed or script (exit 2), unless that script is listed in ALLOW.
# - Runtime inputs that are not scripts: tokens.json (= seed14a's own stdout), and blue.png / red.png generated with
#   13e's own mkpng.mjs. Their creation is logged.
set -uo pipefail
REPO=$(cd "$1" && pwd); RUN=$2; OUT=$3; shift 3
STAGES=("$@"); [ ${#STAGES[@]} -eq 0 ] && STAGES=(S1 S2 S3 S4 S5)
ALLOW=${ALLOW:-}; TAG=${TAG:-}
mkdir -p "$RUN" "$OUT"; RUN=$(cd "$RUN" && pwd); OUT=$(cd "$OUT" && pwd)   # v2: absolute (stages cd elsewhere)
RESULTS="$OUT/results${TAG}.tsv"; LOG="$OUT/runner${TAG}.log"
echo -e "time\tstage\tkind\tscript\texit\toutput" > "$RESULTS"
log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

# ---------------------------------------------------------------- copy + verify
origin_key() { case "$1" in acceptance-14a/scripts/*) echo 14a ;; acceptance-14b/scripts/*) echo 14b ;; acceptance-14d-3/scripts/*) echo 14d3 ;; acceptance-13e/scripts/*) echo 13e ;; *) echo "" ;; esac; }   # bash 3.2 (macOS): no associative arrays
[ -d "$RUN/node_modules/playwright-core" ] || (cd "$RUN" && npm init -y >/dev/null && npm i playwright-core@1.48.2 >/dev/null 2>&1)
log "playwright-core $(node -p "require('$RUN/node_modules/playwright-core/package.json').version")"
MANIFEST="$REPO/acceptance-14e/scripts/manifest.sha256"
: > "$OUT/copy-verification${TAG}.txt"
while read -r sum path; do
  k=$(origin_key "$path"); [ -z "$k" ] && { log "ABORT: unknown manifest path $path"; exit 3; }
  mkdir -p "$RUN/$k"; cp "$REPO/$path" "$RUN/$k/"
  got=$(shasum -a 256 "$RUN/$k/$(basename "$path")" | cut -d' ' -f1)
  if [ "$got" != "$sum" ]; then echo "MISMATCH $path expected $sum got $got" | tee -a "$OUT/copy-verification${TAG}.txt"; log "ABORT: copy mismatch"; exit 3; fi
  echo "OK $sum $k/$(basename "$path")" >> "$OUT/copy-verification${TAG}.txt"
done < "$MANIFEST"
log "all $(grep -c '^OK' "$OUT/copy-verification${TAG}.txt") copies verified against the manifest"

# v2: amended t3/t4 (approved C1) + fixture.mjs, verified against their own manifest; copied next to 13e's common.mjs.
AMAN="$REPO/acceptance-14e/14e-1/amended/manifest.sha256"
while read -r sum path; do
  cp "$REPO/$path" "$RUN/13e-amended-$(basename "$path")" 2>/dev/null || { log "ABORT: missing $path"; exit 3; }
  got=$(shasum -a 256 "$RUN/13e-amended-$(basename "$path")" | cut -d' ' -f1)
  [ "$got" != "$sum" ] && { echo "MISMATCH $path expected $sum got $got" | tee -a "$OUT/copy-verification${TAG}.txt"; log "ABORT: amended copy mismatch"; exit 3; }
  echo "OK $sum 13e/amended/$(basename "$path")" >> "$OUT/copy-verification${TAG}.txt"
done < "$AMAN"
mkdir -p "$RUN/13e/amended"; for f in "$RUN"/13e-amended-*; do mv "$f" "$RUN/13e/amended/${f##*/13e-amended-}"; done
log "amended copies verified: $(grep -c 'amended/' "$OUT/copy-verification${TAG}.txt") (manifest acceptance-14e/14e-1/amended/manifest.sha256)"

# fixtures
(cd "$RUN/13e" && node -e "import('./mkpng.mjs').then(({png}) => { png('red.png', 120, 80, [220, 40, 40]); png('blue.png', 120, 80, [40, 80, 220]); })")
cp "$RUN/13e/blue.png" "$RUN/14b/blue.png"
log "fixtures: 13e/red.png, 13e/blue.png, 14b/blue.png (120x80, generated with 13e mkpng.mjs; sha256 $(shasum -a 256 "$RUN/13e/red.png" | cut -c1-16) / $(shasum -a 256 "$RUN/13e/blue.png" | cut -c1-16))"

# ---------------------------------------------------------------- servers
# v2 (approved 14e-1 S5 correction): the runner stops ONLY the processes it started (tracked launcher PIDs and their
# descendants). It never uses pkill and never kills a process just because it owns a port. If 8080 or 8081 is already
# occupied before a stage, the runner aborts (exit 4) without touching it.
BPID=""; VPID=""; B_LAUNCH=""; V_LAUNCH=""
descendants() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done; }
port_busy() { lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1; }
kill_tracked() {   # $1 label, $2 launcher pid: stops the launcher and its descendants only
  [ -z "$2" ] && return 0
  local pids; pids="$(descendants "$2") $2"; pids=$(echo $pids)
  kill $pids 2>/dev/null
  for _ in $(seq 1 30); do local alive=""; for p in $pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done; [ -z "$alive" ] && break; sleep 1; done
  for p in $pids; do kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null; done
  log "stopped $1 tracked pids: $pids"
}
start_servers() {   # $1 stage
  for port in 8081 8080; do
    if port_busy $port; then log "ABORT: port $port is already in use by pid(s) $(lsof -ti tcp:$port -sTCP:LISTEN | tr '\n' ' ')- not started by this runner, left untouched"; exit 4; fi
  done
  (cd "$REPO/backend" && exec mvn -q spring-boot:run -Dspring-boot.run.profiles=h2 > "$OUT/$1-backend${TAG}.log" 2>&1) & B_LAUNCH=$!
  for _ in $(seq 1 90); do curl -s -o /dev/null http://localhost:8081/api/public/collections && break; sleep 2; done
  BPID=$(lsof -ti tcp:8081 -sTCP:LISTEN | head -1)
  [ -z "$BPID" ] && { log "ABORT: backend did not start listening on 8081"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  echo " $(descendants "$B_LAUNCH" | tr '\n' ' ') " | grep -q " $BPID " || { log "ABORT: :8081 listener $BPID is not a descendant of launcher $B_LAUNCH"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  (cd "$REPO" && exec npx vite --port 8080 --strictPort > "$OUT/$1-vite${TAG}.log" 2>&1) & V_LAUNCH=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:8080/ && break; sleep 1; done
  VPID=$(lsof -ti tcp:8080 -sTCP:LISTEN | head -1)
  [ -z "$VPID" ] && { log "ABORT: vite did not start listening on 8080"; kill_tracked vite "$V_LAUNCH"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  echo " $V_LAUNCH $(descendants "$V_LAUNCH" | tr '\n' ' ') " | grep -q " $VPID " || { log "ABORT: :8080 listener $VPID is not tracked (launcher $V_LAUNCH)"; kill_tracked vite "$V_LAUNCH"; kill_tracked backend "$B_LAUNCH"; exit 4; }
  local apistatus; apistatus=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8081/api/public/collections)
  log "$1: FRESH backend pid=$BPID (launcher $B_LAUNCH) port=8081 (H2 in-memory, profile h2; public API $apistatus) · vite pid=$VPID (launcher $V_LAUNCH) port=8080"
  echo -e "$(date -u +%FT%TZ)\t$1\tbackend\tpid=$BPID vite=$VPID\t0\t$1-backend${TAG}.log" >> "$RESULTS"
}
stop_servers() {
  kill_tracked vite "$V_LAUNCH"; kill_tracked backend "$B_LAUNCH"; V_LAUNCH=""; B_LAUNCH=""
  local free=yes; for port in 8080 8081; do port_busy $port && { free=no; log "WARNING: port $port still in use after stop: $(lsof -ti tcp:$port -sTCP:LISTEN | tr '\n' ' ')"; }; done
  log "$1: servers stopped; ports 8080/8081 free: $free"
}

# ---------------------------------------------------------------- steps
FAILED=""
step() {   # $1 stage, $2 kind (seed|test), $3 dir, $4 script, rest: args; stdout+stderr → out file
  local st=$1 kind=$2 dir=$3 sc=$4; shift 4
  local of="$OUT/$st-${sc%.mjs}${TAG}.txt"
  log "$st: $kind $dir/$sc $*"
  (cd "$RUN/$dir" && node "$sc" "$@") > "$of" 2>&1; local ec=$?
  local summary; summary=$(grep -E "checks passed|TOTAL|^FAILED" "$of" | tail -1)
  # v2: the 13e scripts print "FAIL  <check>" and still exit 0 - a failed check counts as a failure here.
  local nfail; nfail=$(grep -c '^FAIL  ' "$of"); local npass; npass=$(grep -c '^PASS  ' "$of")
  [ "$ec" -eq 0 ] && [ "$nfail" -gt 0 ] && ec=1
  summary="$summary [PASS lines $npass, FAIL lines $nfail]"
  echo -e "$(date -u +%FT%TZ)\t$st\t$kind\t$dir/$sc\t$ec\t$(basename "$of")" >> "$RESULTS"
  log "$st: result $ec $summary"
  if [ $ec -ne 0 ]; then
    if [[ ",$ALLOW," == *",$st:$sc,"* ]]; then log "$st: $sc failed — ALLOWED (classified), continuing"; return 0; fi
    FAILED="$st $dir/$sc (exit $ec)"; return 1
  fi
}
stop_here() { log "STOPPED at the first failure: $FAILED. Later steps not run."; echo "STOPPED: $FAILED" >> "$RESULTS"; stop_servers "$1"; exit 2; }
shots() { mkdir -p "$OUT/screenshots${TAG}/$1"; echo "$OUT/screenshots${TAG}/$1"; }

for ST in "${STAGES[@]}"; do
  start_servers "$ST"
  case $ST in
    S1)
      step S1 seed 14a seed14a.mjs || stop_here S1
      tail -1 "$OUT/S1-seed14a${TAG}.txt" > "$RUN/14a/tokens.json"; log "S1: tokens.json = seed14a stdout (last line)"
      step S1 test 14a t14a.mjs "$(shots S1-14a)" || stop_here S1 ;;
    S2)
      step S2 seed 14a seed14a.mjs || stop_here S2            # 14b ran on top of the 14a seed (seed14b deletes 14a's "oslo")
      tail -1 "$OUT/S2-seed14a${TAG}.txt" > "$RUN/14b/tokens.json"; log "S2: tokens.json = seed14a stdout (last line)"
      step S2 seed 14b seed14b.mjs || stop_here S2
      step S2 test 14b t14b.mjs "$(shots S2-14b)" || stop_here S2
      step S2 test 14b t14b-stale.mjs "$(shots S2-14b-stale)" || stop_here S2 ;;
    S3)
      step S3 seed 14d3 seed14c.mjs || stop_here S3
      step S3 seed 14d3 seed14d3.mjs || stop_here S3
      step S3 test 14d3 t14d3.mjs "$(shots S3-14d3)" || stop_here S3
      step S3 test 14d3 t14d1.mjs "$(shots S3-14d1)" || stop_here S3
      step S3 test 14d3 t14d2.mjs "$(shots S3-14d2)" || stop_here S3
      step S3 test 14d3 t14c.mjs "$(shots S3-14c)" || stop_here S3 ;;
    S4)
      step S4 seed 14d3 seed14c.mjs || stop_here S4
      step S4 seed 14d3 seed14d3.mjs || stop_here S4
      step S4 seed 14d3 seed14d3c.mjs || stop_here S4
      step S4 test 14d3 t14d3c.mjs || stop_here S4 ;;
    S5)
      mkdir -p "$RUN/screenshots" "$RUN/13e/screenshots"     # 13e writes to ../screenshots relative to its directory
      cp "$RUN/13e/common.mjs" "$RUN/13e/red.png" "$RUN/13e/blue.png" "$RUN/13e/amended/"   # verified original common.mjs + fixtures
      step S5 test 13e t1-templates.mjs || stop_here S5
      step S5 test 13e t2-editor.mjs || stop_here S5
      step S5 test 13e/amended t3-media.mjs || stop_here S5      # v2: amended copy (C1), original stays verified + unchanged
      step S5 test 13e/amended t4-regression.mjs || stop_here S5
      mkdir -p "$OUT/screenshots${TAG}/S5-13e"; cp "$RUN/screenshots/"* "$RUN/13e/screenshots/"* "$OUT/screenshots${TAG}/S5-13e/" 2>/dev/null ;;
  esac
  stop_servers "$ST"
done
log "ALL REQUESTED STAGES COMPLETED: ${STAGES[*]}"
