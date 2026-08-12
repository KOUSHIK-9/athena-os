#!/bin/bash
# Builds the FoundationModels stdio bridge used by AppleModelClient.
# Requires Xcode 26+ (macOS 26 SDK) and Apple Intelligence enabled at runtime.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin
xcrun swiftc -O -o bin/apple-model-bridge swift/main.swift
echo "built: $(pwd)/bin/apple-model-bridge"
