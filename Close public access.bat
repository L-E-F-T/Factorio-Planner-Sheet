@echo off
title Factorio Ratios - close public access
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0close.ps1" -Port 8765
pause
