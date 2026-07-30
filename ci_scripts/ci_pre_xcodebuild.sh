#!/bin/zsh

set -euo pipefail

echo "Xcode Cloud pre-xcodebuild diagnostics started."

REPO_ROOT="${CI_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

WORKSPACE="$(find ios -maxdepth 1 -name "*.xcworkspace" -print -quit)"
XCODEPROJ="$(find ios -maxdepth 1 -name "*.xcodeproj" -print -quit)"
PODS_RELEASE_XCCONFIG="ios/Pods/Target Support Files/Pods-AIProxy/Pods-AIProxy.release.xcconfig"

if [ -z "$WORKSPACE" ]; then
  echo "No .xcworkspace found under ios/. Did ci_post_clone.sh finish successfully?"
  exit 1
fi

if [ -z "$XCODEPROJ" ]; then
  echo "No .xcodeproj found under ios/. Did ci_post_clone.sh finish successfully?"
  exit 1
fi

if [ ! -f "$PODS_RELEASE_XCCONFIG" ]; then
  echo "Missing CocoaPods release xcconfig: $PODS_RELEASE_XCCONFIG"
  echo "Running dependency setup before xcodebuild..."
  env -i \
    HOME="$HOME" \
    USER="${USER:-local}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    REPO_ROOT="$REPO_ROOT" \
    PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    /bin/zsh "$REPO_ROOT/ci_scripts/xcode_cloud_setup.sh"
fi

if [ ! -f "$PODS_RELEASE_XCCONFIG" ]; then
  echo "Still missing CocoaPods release xcconfig after pod install."
  exit 1
fi

SCHEME="$(basename "$XCODEPROJ" .xcodeproj)"

echo "Workspace: $WORKSPACE"
echo "Project: $XCODEPROJ"
echo "Expected scheme: $SCHEME"
echo "Available schemes:"
xcodebuild -list -workspace "$WORKSPACE"

echo "Xcode Cloud pre-xcodebuild diagnostics finished."
