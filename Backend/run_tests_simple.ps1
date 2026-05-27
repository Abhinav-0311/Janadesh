Write-Host "Running all tests..." -ForegroundColor Green
Write-Host ""

npm test -- --passWithNoTests --forceExit

Write-Host ""
Write-Host "Tests completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "Look for the line that says: Tests: X passed, Y failed, Z total" -ForegroundColor Cyan
