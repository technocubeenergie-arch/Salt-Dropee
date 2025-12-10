#!/bin/bash

# Raining Bud - Cordova Build Script
# Usage: ./build.sh [android|ios|both] [debug|release]

set -e  # Exit on error

PLATFORM=${1:-both}
BUILD_TYPE=${2:-debug}

echo "======================================"
echo "  Raining Bud - Cordova Build"
echo "======================================"
echo "Platform: $PLATFORM"
echo "Build Type: $BUILD_TYPE"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
fi

# Check if Cordova CLI is available
if ! command -v cordova &> /dev/null; then
    echo -e "${RED}Cordova CLI not found. Installing globally...${NC}"
    npm install -g cordova
fi

# Function to add platform if not exists
add_platform_if_needed() {
    local platform=$1
    if [ ! -d "platforms/$platform" ]; then
        echo -e "${YELLOW}Adding $platform platform...${NC}"
        cordova platform add $platform
    else
        echo -e "${GREEN}$platform platform already exists${NC}"
    fi
}

# Function to build for a platform
build_platform() {
    local platform=$1
    local build_type=$2

    echo -e "${YELLOW}Building for $platform ($build_type)...${NC}"

    if [ "$build_type" == "release" ]; then
        cordova build $platform --release
    else
        cordova build $platform
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $platform build successful!${NC}"

        # Show output location
        if [ "$platform" == "android" ]; then
            if [ "$build_type" == "release" ]; then
                echo -e "${GREEN}APK location: platforms/android/app/build/outputs/apk/release/${NC}"
            else
                echo -e "${GREEN}APK location: platforms/android/app/build/outputs/apk/debug/${NC}"
            fi
        elif [ "$platform" == "ios" ]; then
            echo -e "${GREEN}IPA location: platforms/ios/build/${NC}"
        fi
    else
        echo -e "${RED}✗ $platform build failed!${NC}"
        exit 1
    fi
}

# Main build logic
case $PLATFORM in
    android)
        add_platform_if_needed android
        build_platform android $BUILD_TYPE
        ;;
    ios)
        # Check if running on macOS
        if [[ "$OSTYPE" != "darwin"* ]]; then
            echo -e "${RED}Error: iOS builds require macOS${NC}"
            exit 1
        fi
        add_platform_if_needed ios
        build_platform ios $BUILD_TYPE
        ;;
    both)
        add_platform_if_needed android
        build_platform android $BUILD_TYPE

        if [[ "$OSTYPE" == "darwin"* ]]; then
            add_platform_if_needed ios
            build_platform ios $BUILD_TYPE
        else
            echo -e "${YELLOW}Skipping iOS (requires macOS)${NC}"
        fi
        ;;
    *)
        echo -e "${RED}Invalid platform: $PLATFORM${NC}"
        echo "Usage: ./build.sh [android|ios|both] [debug|release]"
        exit 1
        ;;
esac

echo -e "${GREEN}======================================"
echo -e "  Build Complete!"
echo -e "======================================${NC}"
