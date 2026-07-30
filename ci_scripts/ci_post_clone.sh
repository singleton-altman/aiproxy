#!/bin/zsh

set -euo pipefail

echo "Xcode Cloud post-clone setup started."

REPO_ROOT="${CI_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

export CI=1
export EXPO_NO_TELEMETRY=1
export COCOAPODS_DISABLE_STATS=1
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if ! command -v node >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
  echo "Node.js was not found. Installing Node.js with Homebrew..."
  brew install node
fi

if ! command -v pod >/dev/null 2>&1 && command -v gem >/dev/null 2>&1; then
  echo "CocoaPods was not found. Installing CocoaPods with RubyGems..."
  gem install cocoapods --user-install
  export PATH="$HOME/.gem/ruby/$(ruby -e 'print RUBY_VERSION[/^\d+\.\d+/]')/bin:$PATH"
fi

echo "Repository: $REPO_ROOT"
echo "Xcode:"
xcodebuild -version

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on PATH."
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required for this Expo project."
  exit 1
fi

echo "Installing JavaScript dependencies..."
npm ci

echo "Running local verification before native generation..."
npm run check:version
npm run check:endpoints
npm run typecheck
npm run test

if [ ! -d ios ] || [ ! -f ios/Podfile ]; then
  echo "No committed iOS project found. Generating it with Expo prebuild..."
  CI=1 npx expo prebuild --platform ios --clean
else
  echo "Using committed iOS project."
fi

WORKSPACE="$(find ios -maxdepth 1 -name "*.xcworkspace" -print -quit)"
if [ -f ios/Podfile ]; then
  echo "Installing CocoaPods dependencies..."
  (
    cd ios
    if command -v bundle >/dev/null 2>&1 && [ -f Gemfile ]; then
      bundle exec pod install --repo-update
    else
      pod install --repo-update
    fi
  )
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
