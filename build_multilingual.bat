@echo off
REM Сборка SHUKABASE - Multilingual Edition
REM Включает русский и английский языки

echo ========================================
echo   SHUKABASE Multilingual Build
echo ========================================

set SHUKABASE_DATA_ID=1eqZDHhw2HbpaiWydGZXKvTPJf6EIShA0
set SHUKABASE_LANG=all

echo.
echo [1/3] Сборка Python бэкенда...
call .\venv\Scripts\activate
pyinstaller --clean rag_api_server.spec

echo.
echo [2/3] Копирование бэкенда...
copy /Y dist\rag_api_server.exe src-tauri\rag_api_server.exe

echo.
echo [3/3] Сборка Tauri...
npm run tauri:build

echo.
echo ========================================
echo   Готово! Установщик:
echo   src-tauri\target\release\bundle\nsis\SHUKABASE_0.1.0_x64-setup.exe
echo ========================================
pause
