@echo off
title SUBURBAN WARFARE server
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
cd /d "%~dp0"
call npm run build
start "" http://localhost:3000
node server/index.js
pause
