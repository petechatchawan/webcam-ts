#!/bin/bash
# Webcam-TS publish script

set -euo pipefail

# Navigate to package directory
cd "$(dirname "$0")"

VERSION=$(node -p "require('./package.json').version")
TARBALL="webcam-ts-${VERSION}.tgz"

echo "🚀 Publishing Webcam-TS ${VERSION}"

echo "📦 Building package..."
npm run build

echo "🧪 Running tests (if available)..."
npm run test

echo "📋 Creating package..."
npm pack

echo "✅ Package created: ${TARBALL}"

echo "📝 To publish to npm registry:"
echo "  npm publish ${TARBALL}"
echo ""
echo "📝 To publish as beta:"
echo "  npm publish ${TARBALL} --tag beta"
echo ""
echo "📝 To install locally for testing:"
echo "  npm install ./${TARBALL}"

echo "🎉 Package ready for publishing!"
