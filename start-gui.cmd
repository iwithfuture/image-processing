@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo Installing required files, please wait...
  call npm.cmd install
)

npm.cmd run gui
pause
