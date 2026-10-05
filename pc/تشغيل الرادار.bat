@echo off
chcp 65001 >nul
title Gold Radar
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py -3
echo.
echo  ... preparing
%PY% -m pip install -q -r requirements.txt
%PY% radar_pc.py
echo.
pause
