@echo off
chcp 65001 > nul

echo ===========================================================
echo  GRAPHRAG BUILD WITH GEMINI 2.5 FLASH LITE (VIA PROXY)
echo  Expected time: 30-60 minutes for full index!
echo ===========================================================
echo.

cd /d "%~dp0"

REM Load .env file from rag_graph_build folder
if exist "rag_graph_build\.env" (
    echo Loading environment from rag_graph_build\.env...
    for /f "usebackq tokens=1,* delims==" %%a in ("rag_graph_build\.env") do (
        if not "%%a"=="" if not "%%a:~0,1%"=="#" (
            set "%%a=%%b"
        )
    )
)

if "%GEMINI_API_KEY%"=="" if not "%GOOGLE_API_KEY%"=="" set GEMINI_API_KEY=%GOOGLE_API_KEY%

if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

echo [1/4] Checking environment...
if "%GEMINI_API_KEY%"=="" (
    echo ERROR: GEMINI_API_KEY not set in .env!
    pause
    exit /b 1
)

echo [2/4] Installing LiteLLM...
pip install litellm[proxy] -q

echo [3/4] Starting LiteLLM Proxy in background...
start "LiteLLM Proxy" cmd /k "litellm --config rag_graph_build\litellm_config.yaml --port 4000"

echo Waiting 5 seconds for proxy to warm up...
timeout /t 5 /nobreak > nul

echo.
echo [4/4] Starting GraphRAG Indexing...
echo.
echo ===========================================================
echo  RUNNING - Press Ctrl+C to stop (progress is saved!)
echo ===========================================================
echo.

graphrag index --root ./rag_graph_build

echo.
echo Stopping proxy...
taskkill /FI "WINDOWTITLE eq LiteLLM Proxy" /F > nul 2>&1

pause
