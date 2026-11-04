@echo off
chcp 65001 >nul
title Live Arena - TikTok game
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Download the LTS version from https://nodejs.org then run this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules\ (
  echo  First run: installing, please wait...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

node server.js --open
echo.
echo  The game server stopped.
pause
