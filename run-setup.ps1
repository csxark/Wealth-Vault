Write-Host ""
Write-Host "🚀 Wealth Vault Setup & Run Script" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create environment files
Write-Host "📝 Creating environment files..." -ForegroundColor Yellow
node setup-env.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create environment files" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Environment files created" -ForegroundColor Green

# Step 2: Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm run install-all
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Step 3: Run database migrations
Write-Host ""
Write-Host "🗄️  Running database migrations..." -ForegroundColor Yellow
Push-Location backend
npm run db:migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Database migration failed or skipped (this is OK if DB is not configured yet)" -ForegroundColor Yellow
}
Pop-Location

# Step 4: Start the application
Write-Host ""
Write-Host "✅ Setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Starting Wealth Vault application..." -ForegroundColor Cyan
Write-Host "📡 Backend will run on: http://localhost:5001" -ForegroundColor White
Write-Host "🌐 Frontend will run on: http://localhost:3002" -ForegroundColor White
Write-Host ""
Write-Host "Press CTRL+C to stop the application" -ForegroundColor Yellow
Write-Host ""

# Run both frontend and backend concurrently
npm run dev
