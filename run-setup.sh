#!/bin/bash

echo "🚀 Wealth Vault Setup & Run Script"
echo "==================================="
echo

# Step 1: Create environment files
echo "📝 Creating environment files..."
node setup-env.js
if [ $? -ne 0 ]; then
    echo "❌ Failed to create environment files"
    exit 1
fi
echo "✅ Environment files created"

# Step 2: Install dependencies
echo
echo "📦 Installing dependencies..."
npm run install-all
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✅ Dependencies installed"

# Step 3: Run database migrations
echo
echo "🗄️  Running database migrations..."
cd backend
npm run db:migrate
if [ $? -ne 0 ]; then
    echo "⚠️  Database migration failed or skipped (this is OK if DB is not configured yet)"
fi
cd ..

# Step 4: Start the application
echo
echo "✅ Setup completed successfully!"
echo
echo "🚀 Starting Wealth Vault application..."
echo "📡 Backend will run on: http://localhost:5001"
echo "🌐 Frontend will run on: http://localhost:3002"
echo
echo "Press CTRL+C to stop the application"
echo

# Run both frontend and backend concurrently
npm run dev
