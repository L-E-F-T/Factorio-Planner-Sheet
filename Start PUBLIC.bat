@echo off
title Factorio Ratios - PUBLIC (friends can connect while this window is open)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0public.ps1" -Port 8765
pause
