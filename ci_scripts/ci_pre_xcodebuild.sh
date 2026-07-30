#!/bin/zsh

set -euo pipefail

echo "Xcode Cloud pre-xcodebuild diagnostics started."

REPO_ROOT="${CI_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

WORKSPACE="$(find ios -maxdepth 1 -name "*.xcworkspace" -print -quit)"
XCODEPROJ="$(find ios -maxdepth 1 -name "*.xcodeproj" -print -quit)"

if [ -z "$WORKSPACE" ]; then
  echo "No .xcworkspace found under ios/. Did ci_post_clone.sh finish successfully?"
  exit 1
fi

if [ -z "$XCODEPROJ" ]; then
  echo "No .xcodeproj found under ios/. Did ci_post_clone.sh finish successfully?"
  exit 1
fi

SCHEME="$(basename "$XCODEPROJ" .xcodeproj)"

echo "Workspace: $WORKSPACE"
echo "Project: $XCODEPROJ"
echo "Expected scheme: $SCHEME"
echo "Available schemes:"
xcodebuild -list -workspace "$WORKSPACE"

echo "Xcode Cloud pre-xcodebuild diagnostics finished."
