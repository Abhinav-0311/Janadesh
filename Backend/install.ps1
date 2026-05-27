# PowerShell installation script for Backend
Write-Host "Installing Backend dependencies..." -ForegroundColor Green

# Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "Error: package.json not found. Make sure you're in the Backend directory." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Running npm install..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "Dependencies installed successfully!" -ForegroundColor Green
    
    # Try to build
    Write-Host "Testing TypeScript compilation..." -ForegroundColor Yellow
    npm run build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Build successful! Backend setup complete." -ForegroundColor Green
    } else {
        Write-Host "Build failed. Check TypeScript errors above." -ForegroundColor Red
    }
} else {
    Write-Host "npm install failed. Check errors above." -ForegroundColor Red
}