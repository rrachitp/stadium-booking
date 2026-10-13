@echo off
cd /d "%~dp0"
title CityArena Server
node backend\server.js
echo.
echo The server stopped. See the message above.
pause
