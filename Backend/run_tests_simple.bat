@echo off
echo Running all tests...
echo.
npm test -- --passWithNoTests --forceExit
echo.
echo Tests completed!
pause
