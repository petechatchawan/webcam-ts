#!/bin/bash
# Webcam-TS 2.0.0 Publish Script

echo "🚀 Publishing Webcam-TS 2.0.0"

# Navigate to package directory
cd "$(dirname "$0")"

echo "📦 Building package..."
npm run build

echo "🧪 Running tests (if available)..."
npm test --if-present

echo "📋 Creating package..."
npm pack

echo "✅ Package created: webcam-ts-2.0.0.tgz"

echo "📝 To publish to npm registry:"
echo "  npm publish webcam-ts-2.0.0.tgz"
echo ""
echo "📝 To publish as beta:"
echo "  npm publish webcam-ts-2.0.0.tgz --tag beta"
echo ""
echo "📝 To install locally for testing:"
echo "  npm install ./webcam-ts-2.0.0.tgz"

echo "🎉 Package ready for publishing!"
