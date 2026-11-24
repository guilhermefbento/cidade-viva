@echo off
cd /d "%~dp0"
node --env-file-if-exists=.env server/launch.js
if errorlevel 1 pause
