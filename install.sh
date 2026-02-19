#!/usr/bin/env bash
# Install peon-pet as a macOS LaunchAgent so it runs at login and stays alive.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$SCRIPT_DIR/node_modules/.bin/electron"
PLIST_SRC="$SCRIPT_DIR/com.peonpet.app.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.peonpet.app.plist"

if [ ! -f "$ELECTRON" ]; then
  echo "Electron not found. Run: npm install"
  exit 1
fi

# Resolve symlink to the real binary (launchd needs the real path)
ELECTRON_REAL="$(readlink -f "$ELECTRON" 2>/dev/null || realpath "$ELECTRON")"

echo "Installing peon-pet LaunchAgent..."
echo "  App dir:  $SCRIPT_DIR"
echo "  Electron: $ELECTRON_REAL"

# Write the final plist with real paths substituted
sed \
  -e "s|ELECTRON_BIN_PLACEHOLDER|$ELECTRON_REAL|g" \
  -e "s|APP_DIR_PLACEHOLDER|$SCRIPT_DIR|g" \
  "$PLIST_SRC" > "$PLIST_DEST"

# Unload any existing instance before loading
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load -w "$PLIST_DEST"

echo "Done. peon-pet will now start at login and restart if it quits."
echo "Logs: /tmp/peon-pet.log  /tmp/peon-pet.err"
