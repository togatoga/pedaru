#!/bin/bash

# Generate app icons for macOS from app-icon.png
# Usage: npm run generate:icons

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_IMAGE="$PROJECT_ROOT/app-icon.png"
ICONSET_DIR="/tmp/pedaru-icon.iconset"
ICONS_DIR="$PROJECT_ROOT/src-tauri/icons"

# Check if source image exists
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Error: app-icon.png not found in project root"
    exit 1
fi

# Create iconset directory
mkdir -p "$ICONSET_DIR"

echo "Generating icons from app-icon.png..."

# Generate all required icon sizes
sips -z 16 16     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512.png"
sips -z 1024 1024 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to icns
echo "Converting to icns..."
iconutil -c icns "$ICONSET_DIR" -o "$ICONS_DIR/icon.icns"

# Generate PNG icons for other platforms
echo "Generating PNG icons for other platforms..."
sips -z 32 32   "$SOURCE_IMAGE" --out "$ICONS_DIR/32x32.png"
sips -z 128 128 "$SOURCE_IMAGE" --out "$ICONS_DIR/128x128.png"
sips -z 256 256 "$SOURCE_IMAGE" --out "$ICONS_DIR/128x128@2x.png"
sips -z 512 512 "$SOURCE_IMAGE" --out "$ICONS_DIR/icon.png"

# Generate ICO for Windows (requires additional tool or manual conversion)
echo "Note: Windows .ico file needs to be generated separately"

# Clean up iconset directory
rm -rf "$ICONSET_DIR"

echo "Done! Icons generated in $ICONS_DIR"
