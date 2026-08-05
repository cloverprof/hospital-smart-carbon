@echo off
setlocal

set "HOSPITAL_PROJECT=%~dp0"
set "HOSPITAL_VITE=%HOSPITAL_PROJECT%node_modules\.bin\vite.cmd"

if not exist "%HOSPITAL_VITE%" (
  echo [ERROR] Project dependencies are missing.
  echo Reinstall dependencies before starting the preview.
  exit /b 1
)

call "%HOSPITAL_VITE%" --host 127.0.0.1 --port 5173 --strictPort

endlocal
