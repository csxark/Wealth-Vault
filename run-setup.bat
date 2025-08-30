@echo off
echo 🚀 Wealth Vault Setup Script
echo ===========================
echo.

echo 📝 Creating environment files...
node setup-env.js
if %errorlevel% neq 0 (
    echo ❌ Failed to create environment files
    pause
    exit /b 1
)

echo.
echo 📦 Installing dependencies...
npm run install-all
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ✅ Setup completed successfully!
echo.
echo 📋 Next steps:
echo 1. Start MongoDB (if not already running)
echo 2. Run: npm run dev
echo 3. Open http://localhost:3000 in your browser
echo.
pause
