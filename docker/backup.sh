#!/bin/sh
# Nightly pg_dump into /backups, keeping the newest $BACKUP_KEEP dumps.
# `backup.sh now` runs a single dump immediately and exits.
set -eu

BACKUP_DIR=/backups
BACKUP_HOUR="${BACKUP_HOUR:-02}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

dump() {
  file="$BACKUP_DIR/studee-$(date +%Y-%m-%d_%H%M%S).dump"
  echo "[backup] writing $file"
  pg_dump -Fc -f "$file.partial" && mv "$file.partial" "$file"
  ls -1t "$BACKUP_DIR"/studee-*.dump 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f
  echo "[backup] done"
}

if [ "${1:-}" = "now" ]; then
  dump
  exit 0
fi

echo "[backup] scheduler started; daily at ${BACKUP_HOUR}:00 ($TZ), keeping $BACKUP_KEEP dumps"
last_run=""
while true; do
  today=$(date +%Y-%m-%d)
  if [ "$(date +%H)" = "$BACKUP_HOUR" ] && [ "$last_run" != "$today" ]; then
    dump || echo "[backup] FAILED"
    last_run="$today"
  fi
  sleep 60
done
