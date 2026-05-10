@echo off
echo Pushing ZombieWalk to GitHub...
echo.

:: Change to the project root directory
cd %~dp0\..

:: Add all changes
git add .

:: Prompt for commit message
set /p commitMsg="Enter commit message (or press Enter for 'Auto-commit updates'): "
if "%commitMsg%"=="" set commitMsg=Auto-commit updates

:: Commit
git commit -m "%commitMsg%"
echo.

:: Push
echo Pushing to origin main...
git push origin main

echo.
echo Push complete!
pause
