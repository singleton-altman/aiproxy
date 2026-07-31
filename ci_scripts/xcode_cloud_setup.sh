#!/bin/zsh

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

export CI=1
export EXPO_NO_TELEMETRY=1
export COCOAPODS_DISABLE_STATS=1
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
export USE_HERMES=1
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_ENV_HINTS=1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PODS_RELEASE_XCCONFIG="ios/Pods/Target Support Files/Pods-AIProxy/Pods-AIProxy.release.xcconfig"
NEEDS_NODE=0
NEEDS_POD=0

if [ ! -d node_modules ]; then
  NEEDS_NODE=1
fi

if ! command -v node >/dev/null 2>&1; then
  NEEDS_NODE=1
fi

if [ ! -f "$PODS_RELEASE_XCCONFIG" ]; then
  NEEDS_NODE=1
  NEEDS_POD=1
fi

if [ "$NEEDS_NODE" -eq 1 ] && ! command -v node >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
  echo "Node.js was not found. Installing Node.js with Homebrew..."
  NODE_INSTALL_ATTEMPTS=4
  for ATTEMPT in $(seq 1 "$NODE_INSTALL_ATTEMPTS"); do
    if brew install node; then
      break
    fi

    if [ "$ATTEMPT" -eq "$NODE_INSTALL_ATTEMPTS" ]; then
      echo "Node.js installation failed after $NODE_INSTALL_ATTEMPTS attempts."
      exit 1
    fi

    WAIT_SECONDS=$((ATTEMPT * 10))
    echo "Node.js installation attempt $ATTEMPT failed; retrying in ${WAIT_SECONDS}s..."
    sleep "$WAIT_SECONDS"
  done
fi

if [ "$NEEDS_POD" -eq 1 ] && ! command -v pod >/dev/null 2>&1 && command -v gem >/dev/null 2>&1; then
  echo "CocoaPods was not found. Installing CocoaPods with RubyGems..."
  gem install cocoapods --user-install
  export PATH="$HOME/.gem/ruby/$(ruby -e 'print RUBY_VERSION[/^\d+\.\d+/]')/bin:$PATH"
fi

echo "Repository: $REPO_ROOT"
echo "node: $(command -v node || true)"
echo "npm: $(command -v npm || true)"
echo "pod: $(command -v pod || true)"

if [ "$NEEDS_NODE" -eq 1 ]; then
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
fi

if [ ! -d node_modules ]; then
  echo "Installing JavaScript dependencies..."
  npm ci
else
  echo "Using existing node_modules."
fi

APP_VERSION="$(node -p "require('./app.json').expo.version")"
IOS_BUILD_NUMBER="$(node -p "require('./app.json').expo.ios.buildNumber")"
IOS_INFO_PLIST="ios/AIProxy/Info.plist"

if [ ! -f "$IOS_INFO_PLIST" ]; then
  echo "Missing iOS Info.plist: $IOS_INFO_PLIST"
  exit 1
fi

echo "Synchronizing iOS bundle version to ${APP_VERSION} (${IOS_BUILD_NUMBER})..."
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" "$IOS_INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $IOS_BUILD_NUMBER" "$IOS_INFO_PLIST"

if [ ! -f "$PODS_RELEASE_XCCONFIG" ]; then
  echo "Installing CocoaPods dependencies..."
  POD_INSTALL_ATTEMPTS=4
  for ATTEMPT in $(seq 1 "$POD_INSTALL_ATTEMPTS"); do
    if (
      cd ios
      if command -v bundle >/dev/null 2>&1 && [ -f Gemfile ]; then
        bundle exec pod install
      else
        pod install
      fi
    ); then
      break
    fi

    if [ "$ATTEMPT" -eq "$POD_INSTALL_ATTEMPTS" ]; then
      echo "CocoaPods installation failed after $POD_INSTALL_ATTEMPTS attempts."
      exit 1
    fi

    WAIT_SECONDS=$((ATTEMPT * 10))
    echo "CocoaPods installation attempt $ATTEMPT failed; retrying in ${WAIT_SECONDS}s..."
    sleep "$WAIT_SECONDS"
  done
else
  echo "Using existing CocoaPods dependencies."
fi

if [ ! -f "$PODS_RELEASE_XCCONFIG" ]; then
  echo "Missing CocoaPods release xcconfig: $PODS_RELEASE_XCCONFIG"
  exit 1
fi

EXPO_MODULES_JSI_BUILD_SCRIPT="node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh"
EXPO_MODULES_JSI_DEVICE_MODULE="node_modules/expo-modules-jsi/apple/Products/ExpoModulesJSI.xcframework/ios-arm64/ExpoModulesJSI.framework/Modules/ExpoModulesJSI.swiftmodule"

if [ ! -f "$EXPO_MODULES_JSI_BUILD_SCRIPT" ]; then
  echo "Missing ExpoModulesJSI build script: $EXPO_MODULES_JSI_BUILD_SCRIPT"
  exit 1
fi

echo "Preparing the ExpoModulesJSI iPhoneOS framework before Xcode copies it..."
PODS_ROOT="$REPO_ROOT/ios/Pods" \
  PLATFORM_NAME=iphoneos \
  /bin/bash "$EXPO_MODULES_JSI_BUILD_SCRIPT"

if [ ! -d "$EXPO_MODULES_JSI_DEVICE_MODULE" ]; then
  echo "ExpoModulesJSI did not produce its iPhoneOS Swift module."
  exit 1
fi
