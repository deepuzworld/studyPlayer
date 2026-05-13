#!/bin/bash
# Helper script to run Study Player AppImage without requiring libfuse2.
# Extracts the contents transparently and runs from RAM/Temp.

# Get current directory of this script
DIR="$(cd "$(dirname "$0")" && pwd)"
APPIMAGE="$DIR/release/Study Player-1.0.0.AppImage"

if [ ! -f "$APPIMAGE" ]; then
    echo "Error: Could not find AppImage at $APPIMAGE"
    echo "Please build the distribution first using: npm run dist"
    exit 1
fi

echo "Launching Study Player without FUSE..."
# Grant execution permission
chmod +x "$APPIMAGE"

# Execute with extract and run mode bypasses the requirement for libfuse2
export APPIMAGE_EXTRACT_AND_RUN=1
"$APPIMAGE" --no-sandbox "$@"
