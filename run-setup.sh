#!/bin/bash

echo "🚀 Wealth Vault Setup Script"
echo "==========================="
echo

echo "📝 Creating environment files..."
node setup-env.js
if [ $? -ne 0 ]; then
    echo "❌ Failed to create environment files"
    exit 1
fi

echo
echo "📦 Installing dependencies..."
npm run install-all
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo
echo "✅ Setup completed successfully!"
echo
echo "📋 Next steps:"
echo "1. Start MongoDB (if not already running)"
echo "2. Run: npm run dev"
echo "3. Open http://localhost:3000 in your browser"
echo
