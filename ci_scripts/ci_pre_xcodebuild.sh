#!/bin/zsh

set -euo pipefail

echo "Xcode Cloud pre-xcodebuild diagnostics started."

REPO_ROOT="${CI_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

export COCOAPODS_DISABLE_STATS=1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export USE_HERMES=1

unset SWIFT_DEBUG_INFORMATION_FORMAT
unset SWIFT_DEBUG_INFORMATION_VERSION

if ! command -v pod >/dev/null 2>&1 && command -v gem >/dev/null 2>&1; then
  echo "CocoaPods was not found. Installing CocoaPods with RubyGems..."
  gem install cocoapods --user-install
  export PATH="$HOME/.gem/ruby/$(ruby -e 'print RUBY_VERSION[/^\d+\.\d+/]')/bin:$PATH"
fi

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
  echo "Running pod install before xcodebuild..."
  (
    cd ios
    if command -v bundle >/dev/null 2>&1 && [ -f Gemfile ]; then
      bundle exec pod install --repo-update
    else
      pod install --repo-update
    fi
  )
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
