#!/usr/bin/env bash
# =============================================================================
# generate-icons.sh — Generates all icon sizes for iOS and Android
#
# Prerequisites:
#   npm install -g sharp-cli   (or: brew install imagemagick)
#
# Source icons used:
#   client/public/icon-512.png  (512x512, used as master icon)
#   client/public/icon-192.png  (192x192, used for Android low-res)
#
# Outputs:
#   ios/App/App/Assets.xcassets/AppIcon.appiconset/  — all Apple icon sizes
#   android/app/src/main/res/mipmap-*/               — all Android icon sizes
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_ICON="$PROJECT_ROOT/client/public/icon-512.png"

echo "================================================"
echo "  Data Veracity — Icon Generator"
echo "================================================"

if [ ! -f "$SOURCE_ICON" ]; then
  echo "[ERROR] Source icon not found: $SOURCE_ICON"
  exit 1
fi

# Choose tool: prefer sharp-cli, fall back to convert (ImageMagick)
if command -v sharp &> /dev/null; then
  RESIZE_CMD="sharp"
elif command -v convert &> /dev/null; then
  RESIZE_CMD="convert"
else
  echo "[ERROR] Neither sharp-cli nor ImageMagick found."
  echo "  Install with: npm install -g sharp-cli"
  echo "         or:    brew install imagemagick"
  exit 1
fi

resize_icon() {
  local src="$1"
  local dest="$2"
  local size="$3"

  mkdir -p "$(dirname "$dest")"

  if [ "$RESIZE_CMD" = "sharp" ]; then
    sharp -i "$src" resize "$size" "$size" -o "$dest"
  else
    convert "$src" -resize "${size}x${size}" "$dest"
  fi
  echo "  Generated: $dest (${size}x${size})"
}

# ---------------------------------------------------------------------------
# iOS — AppIcon sizes required by Apple
# ---------------------------------------------------------------------------
IOS_ICONSET="$PROJECT_ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset"
echo ""
echo "[iOS] Generating AppIcon sizes..."
mkdir -p "$IOS_ICONSET"

resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-20@1x.png"   20
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-20@2x.png"   40
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-20@3x.png"   60
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-29@1x.png"   29
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-29@2x.png"   58
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-29@3x.png"   87
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-40@1x.png"   40
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-40@2x.png"   80
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-40@3x.png"   120
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-60@2x.png"   120
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-60@3x.png"   180
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-76@1x.png"   76
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-76@2x.png"   152
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-83.5@2x.png" 167
resize_icon "$SOURCE_ICON" "$IOS_ICONSET/Icon-1024.png"    1024

# Write Contents.json for Xcode
cat > "$IOS_ICONSET/Contents.json" << 'EOF'
{
  "images": [
    { "size": "20x20",   "idiom": "iphone", "filename": "Icon-20@2x.png",   "scale": "2x" },
    { "size": "20x20",   "idiom": "iphone", "filename": "Icon-20@3x.png",   "scale": "3x" },
    { "size": "29x29",   "idiom": "iphone", "filename": "Icon-29@1x.png",   "scale": "1x" },
    { "size": "29x29",   "idiom": "iphone", "filename": "Icon-29@2x.png",   "scale": "2x" },
    { "size": "29x29",   "idiom": "iphone", "filename": "Icon-29@3x.png",   "scale": "3x" },
    { "size": "40x40",   "idiom": "iphone", "filename": "Icon-40@2x.png",   "scale": "2x" },
    { "size": "40x40",   "idiom": "iphone", "filename": "Icon-40@3x.png",   "scale": "3x" },
    { "size": "60x60",   "idiom": "iphone", "filename": "Icon-60@2x.png",   "scale": "2x" },
    { "size": "60x60",   "idiom": "iphone", "filename": "Icon-60@3x.png",   "scale": "3x" },
    { "size": "20x20",   "idiom": "ipad",   "filename": "Icon-20@1x.png",   "scale": "1x" },
    { "size": "20x20",   "idiom": "ipad",   "filename": "Icon-20@2x.png",   "scale": "2x" },
    { "size": "29x29",   "idiom": "ipad",   "filename": "Icon-29@1x.png",   "scale": "1x" },
    { "size": "29x29",   "idiom": "ipad",   "filename": "Icon-29@2x.png",   "scale": "2x" },
    { "size": "40x40",   "idiom": "ipad",   "filename": "Icon-40@1x.png",   "scale": "1x" },
    { "size": "40x40",   "idiom": "ipad",   "filename": "Icon-40@2x.png",   "scale": "2x" },
    { "size": "76x76",   "idiom": "ipad",   "filename": "Icon-76@1x.png",   "scale": "1x" },
    { "size": "76x76",   "idiom": "ipad",   "filename": "Icon-76@2x.png",   "scale": "2x" },
    { "size": "83.5x83.5","idiom": "ipad",  "filename": "Icon-83.5@2x.png", "scale": "2x" },
    { "size": "1024x1024","idiom": "ios-marketing","filename": "Icon-1024.png","scale": "1x" }
  ],
  "info": { "version": 1, "author": "xcode" }
}
EOF
echo "  Written: $IOS_ICONSET/Contents.json"

# ---------------------------------------------------------------------------
# Android — Adaptive icon sizes (mdpi → xxxhdpi)
# ---------------------------------------------------------------------------
echo ""
echo "[Android] Generating mipmap icon sizes..."

ANDROID_RES="$PROJECT_ROOT/android/app/src/main/res"
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-mdpi/ic_launcher.png"      48
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-hdpi/ic_launcher.png"      72
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-xhdpi/ic_launcher.png"     96
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-xxhdpi/ic_launcher.png"    144
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-xxxhdpi/ic_launcher.png"   192

resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-mdpi/ic_launcher_round.png"      48
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-hdpi/ic_launcher_round.png"      72
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-xhdpi/ic_launcher_round.png"     96
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-xxhdpi/ic_launcher_round.png"    144
resize_icon "$SOURCE_ICON" "$ANDROID_RES/mipmap-xxxhdpi/ic_launcher_round.png"   192

# Splash screen (full-width background)
resize_icon "$SOURCE_ICON" "$ANDROID_RES/drawable/splash.png"              512

echo ""
echo "✅ All icons generated successfully!"
echo ""
echo "Next step for iOS:"
echo "  Run 'npx cap sync ios' to copy icons into the Xcode project."
