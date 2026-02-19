#!/usr/bin/env bash
# Remove peon-pet LaunchAgent — stops it and prevents it from starting at login.
set -e

PLIST_DEST="$HOME/Library/LaunchAgents/com.peonpet.app.plist"

if [ ! -f "$PLIST_DEST" ]; then
  echo "peon-pet LaunchAgent not found — nothing to remove."
  exit 0
fi

echo "Stopping and removing peon-pet LaunchAgent..."
launchctl unload -w "$PLIST_DEST"
rm "$PLIST_DEST"
echo "Done. peon-pet will no longer start at login."
