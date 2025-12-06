@echo off
REM Сборка SHUKABASE - Русская версия
REM Только русский язык, меньше памяти

echo ========================================
echo   SHUKABASE RU Build
echo ========================================

set SHUKABASE_DATA_ID=1kLZ3e0x2i2ivaPZgKSL1NChmxZh5adKG
set SHUKABASE_LANG=ru

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
echo   
echo   Переименуй его в SHUKABASE_RU_0.1.0_x64-setup.exe
echo ========================================
pause
