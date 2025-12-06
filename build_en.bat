@echo off
REM Сборка SHUKABASE - English version  
REM English only, less memory usage

echo ========================================
echo   SHUKABASE EN Build
echo ========================================

set SHUKABASE_DATA_ID=1QkEi1D5SisVwJTGSpje_qNyIGnt6eTT4
set SHUKABASE_LANG=en

echo.
echo [1/3] Building Python backend...
call .\venv\Scripts\activate
pyinstaller --clean rag_api_server.spec

echo.
echo [2/3] Copying backend...
copy /Y dist\rag_api_server.exe src-tauri\rag_api_server.exe

echo.
echo [3/3] Building Tauri...
npm run tauri:build

echo.
echo ========================================
echo   Done! Installer:
echo   src-tauri\target\release\bundle\nsis\SHUKABASE_0.1.0_x64-setup.exe
echo   
echo   Rename it to SHUKABASE_EN_0.1.0_x64-setup.exe
echo ========================================
pause
