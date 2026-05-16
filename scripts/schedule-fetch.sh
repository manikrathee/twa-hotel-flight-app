#!/bin/bash
# schedule-fetch.sh — Schedule fetch-flights.js to run at a future time.
# Usage: bash scripts/schedule-fetch.sh [delay_hours]   (default: 3)

DELAY_HOURS=${1:-3}
DELAY_SECS=$(( DELAY_HOURS * 3600 ))
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/data/fetch.log"
PID_FILE="$ROOT/data/schedule.pid"

mkdir -p "$ROOT/data"

echo "[scheduler] Scheduling fetch in ${DELAY_HOURS}h (${DELAY_SECS}s) — log: $LOG"

(
  sleep "$DELAY_SECS"
  echo "" >> "$LOG"
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
  cd "$ROOT" && node scripts/fetch-flights.js >> "$LOG" 2>&1
  echo "[scheduler] fetch-flights completed" >> "$LOG"
) &

BG_PID=$!
echo $BG_PID > "$PID_FILE"
echo "[scheduler] PID $BG_PID — runs at $(date -v+${DELAY_HOURS}H '+%H:%M %Z') local"
echo "[scheduler] Monitor: tail -f $LOG"
echo "[scheduler] Cancel:  kill \$(cat $PID_FILE)"
