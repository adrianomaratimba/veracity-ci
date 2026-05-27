#!/usr/bin/env bash
# =============================================================================
# build-android.sh — Builds the Android TWA AAB for Google Play Store upload
#
# Prerequisites:
#   Java JDK 17+ (https://adoptium.net/)
#   Android SDK Command-line Tools + build-tools (https://developer.android.com/studio#command-tools)
#   Environment variable ANDROID_HOME pointing to the SDK root
#
# Usage:
#   chmod +x scripts/build-android.sh
#   ./scripts/build-android.sh
#
# Output (unsigned/debug):
#   android/app/build/outputs/bundle/debug/app-debug.aab
#
# Output (signed release — requires keystore env vars):
#   android/app/build/outputs/bundle/release/app-release.aab
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"

echo "================================================"
echo "  Data Veracity — Android TWA Build"
echo "================================================"

# --- 1. Validate prerequisites ---
if [ -z "$ANDROID_HOME" ]; then
  echo "[ERROR] ANDROID_HOME environment variable is not set."
  echo "  Install Android SDK command-line tools from:"
  echo "  https://developer.android.com/studio#command-tools"
  echo "  Then set: export ANDROID_HOME=/path/to/android-sdk"
  exit 1
fi

if ! command -v java &> /dev/null; then
  echo "[ERROR] Java not found. Install JDK 17+ from https://adoptium.net/"
  exit 1
fi

JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
if [ -n "$JAVA_VER" ] && [ "$JAVA_VER" -lt 17 ] 2>/dev/null; then
  echo "[ERROR] Java 17+ is required (found version $JAVA_VER)."
  exit 1
fi

# --- 2. Configure signing (optional — skips signing for debug builds) ---
SIGN_ARGS=""
if [ -n "$KEYSTORE_PATH" ] && [ -n "$KEYSTORE_PASSWORD" ] && [ -n "$KEY_ALIAS" ] && [ -n "$KEY_PASSWORD" ]; then
  echo "[INFO] Keystore found — building signed RELEASE AAB..."
  BUILD_TYPE="release"

  # Inject signing config via gradle properties
  SIGN_ARGS="-Pandroid.injected.signing.store.file=$KEYSTORE_PATH"
  SIGN_ARGS="$SIGN_ARGS -Pandroid.injected.signing.store.password=$KEYSTORE_PASSWORD"
  SIGN_ARGS="$SIGN_ARGS -Pandroid.injected.signing.key.alias=$KEY_ALIAS"
  SIGN_ARGS="$SIGN_ARGS -Pandroid.injected.signing.key.password=$KEY_PASSWORD"
else
  echo ""
  echo "⚠️  No keystore configured — building unsigned DEBUG AAB."
  echo "   To build a signed RELEASE AAB for Play Store upload, set:"
  echo "     export KEYSTORE_PATH=/path/to/upload-keystore.jks"
  echo "     export KEYSTORE_PASSWORD=your_keystore_password"
  echo "     export KEY_ALIAS=upload"
  echo "     export KEY_PASSWORD=your_key_password"
  echo ""
  echo "   Create a new keystore with:"
  echo "     keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA \\"
  echo "             -keysize 2048 -validity 10000 -alias upload"
  echo ""
  echo "   After creating it, extract the SHA-256 fingerprint:"
  echo "     keytool -list -v -keystore upload-keystore.jks -alias upload"
  echo "   Then set ANDROID_SHA256_FINGERPRINT env var on the server and redeploy."
  BUILD_TYPE="debug"
fi

# --- 3. Run Gradle build ---
echo "[INFO] Running Gradle bundle${BUILD_TYPE^} ..."
cd "$ANDROID_DIR"
./gradlew "bundle${BUILD_TYPE^}" $SIGN_ARGS --no-daemon

# --- 4. Report output ---
AAB_PATH="$ANDROID_DIR/app/build/outputs/bundle/${BUILD_TYPE}/app-${BUILD_TYPE}.aab"
if [ -f "$AAB_PATH" ]; then
  echo ""
  echo "✅ Build successful!"
  echo "   AAB: $AAB_PATH"
  echo ""
  echo "Next steps:"
  echo "  1. Go to play.google.com/console → your app → Production → Create release"
  echo "  2. Upload the .aab file"
  echo "  3. See APP_STORE_GUIDE.md for full Play Store submission walkthrough"
else
  echo ""
  echo "⚠️  AAB not found at $AAB_PATH — check Gradle output above."
  exit 1
fi
