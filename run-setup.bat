@echo off
echo.
echo 🚀 Wealth Vault Setup ^& Run Script
echo ===================================
echo.

REM Step 1: Create environment files
echo 📝 Creating environment files...
node setup-env.js
if errorlevel 1 (
    echo ❌ Failed to create environment files
    exit /b 1
)
echo ✅ Environment files created

REM Step 2: Install dependencies
echo.
echo 📦 Installing dependencies...
call npm run install-all
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    exit /b 1
)
echo ✅ Dependencies installed

REM Step 3: Run database migrations
echo.
echo 🗄️  Running database migrations...
cd backend
call npm run db:migrate
if errorlevel 1 (
    echo ⚠️  Database migration failed or skipped (this is OK if DB is not configured yet)
)
cd ..

REM Step 4: Start the application
echo.
echo ✅ Setup completed successfully!
echo.
echo 🚀 Starting Wealth Vault application...
echo 📡 Backend will run on: http://localhost:5001
echo 🌐 Frontend will run on: http://localhost:3002
echo.
echo Press CTRL+C to stop the application
echo.

REM Run both frontend and backend concurrently
call npm run dev
