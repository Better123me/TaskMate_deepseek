@echo off
cd /d "%~dp0"
start "" http://localhost:3001
start "" node server.js
exit
