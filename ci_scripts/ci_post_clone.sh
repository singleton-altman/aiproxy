#!/bin/zsh

set -euo pipefail

echo "Xcode Cloud post-clone setup started."

REPO_ROOT="${CI_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

env -i \
  HOME="$HOME" \
  USER="${USER:-local}" \
  TMPDIR="${TMPDIR:-/tmp}" \
  REPO_ROOT="$REPO_ROOT" \
  PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  /bin/zsh "$REPO_ROOT/ci_scripts/xcode_cloud_setup.sh"

echo "Repository: $REPO_ROOT"
echo "Xcode:"
xcodebuild -version

if [ ! -d ios ] || [ ! -f ios/Podfile ]; then
  echo "No committed iOS project found. Generating it with Expo prebuild..."
  CI=1 npx expo prebuild --platform ios --clean
else
  echo "Using committed iOS project."
fi

PODS_RELEASE_XCCONFIG="ios/Pods/Target Support Files/Pods-AIProxy/Pods-AIProxy.release.xcconfig"
if [ ! -f "$PODS_RELEASE_XCCONFIG" ]; then
  echo "Missing CocoaPods release xcconfig: $PODS_RELEASE_XCCONFIG"
  echo "CocoaPods installation did not generate the files required by Xcode."
  exit 1
fi

WORKSPACE="$(find ios -maxdepth 1 -name "*.xcworkspace" -print -quit)"
if [ -z "$WORKSPACE" ]; then
  echo "No Xcode workspace was found under ios/."
  exit 1
fi

echo "Generated workspace: $WORKSPACE"
echo "Xcode Cloud post-clone setup finished."
