#!/usr/bin/env bash
# PocketAI ADB Reverse Port Watcher
# Ensures port 8000 (FastAPI Edge Server) and port 8081 (Metro Bundler) remain forwarded to connected Android device.

set -euo pipefail

ensure_ports() {
  local dev
  dev=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
  if [ -n "$dev" ]; then
    adb -s "$dev" reverse tcp:8000 tcp:8000 2>/dev/null || true
    adb -s "$dev" reverse tcp:8081 tcp:8081 2>/dev/null || true
  fi
}

if [ "${1:-}" = "--watch" ]; then
  echo "Watching ADB reverse ports (8000, 8081)..."
  while true; do
    ensure_ports
    sleep 5
  done
else
  ensure_ports
  echo "ADB reverse ports verified:"
  adb reverse --list
fi
