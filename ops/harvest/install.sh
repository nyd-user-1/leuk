#!/usr/bin/env bash
# The on/off switch for the nightly harvest runner (launchd LaunchAgent).
#
#   ops/harvest/install.sh on       install + load; fires nightly at 01:04
#   ops/harvest/install.sh off      unload + remove the agent
#   ops/harvest/install.sh status   is it loaded / when did it last run
#   ops/harvest/install.sh run      fire the runner right now (via launchd)
#
# Why 01:04: MRF loads finish before the Vercel matview cron at 04:12 ET, so
# freshly loaded rows are in the rebuilt views the same morning.
#
# Sleep, honestly: caffeinate -is holds the machine awake once the runner has
# STARTED, and launchd runs a missed 01:04 firing on next wake. What nothing
# in userland can do is open a closed lid on battery — if the machine sleeps
# shut all night, the run starts on first morning wake instead. Plugged in,
# lid open or clamshell-with-display: it runs at 01:04 every night, hands off.
set -euo pipefail

LABEL=com.leuk.harvest
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOMAIN="gui/$(id -u)"

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/.harvest/runner"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>exec /usr/bin/caffeinate -is node ops/harvest/runner.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>1</integer><key>Minute</key><integer>4</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$ROOT/.harvest/runner/launchd.log</string>
  <key>StandardErrorPath</key><string>$ROOT/.harvest/runner/launchd.log</string>
</dict>
</plist>
EOF
}

case "${1:-status}" in
  on)
    write_plist
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "loaded — fires nightly at 01:04. 'ops/harvest/install.sh run' to test now."
    ;;
  off)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "unloaded and removed."
    ;;
  run)
    launchctl kickstart "$DOMAIN/$LABEL"
    echo "kickstarted — tail .harvest/runner/runner.log"
    ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "loaded ($PLIST)"
      launchctl print "$DOMAIN/$LABEL" | grep -E "state|last exit code" || true
    else
      echo "not loaded — 'ops/harvest/install.sh on' to install"
    fi
    tail -3 "$ROOT/.harvest/runner/runner.log" 2>/dev/null || true
    ;;
  *)
    echo "usage: install.sh on|off|status|run" >&2
    exit 2
    ;;
esac
