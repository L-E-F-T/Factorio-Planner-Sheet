@echo off
title Factorio Ratios - LOCAL (this PC only)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local.ps1" -Port 8765
pause
