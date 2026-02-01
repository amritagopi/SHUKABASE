@echo off
echo ===================================================
echo 🚀 STARTING GRAPHRAG BUILD PROCESS
echo ===================================================
echo.
echo 1. Installing GraphRAG...
pip install graphrag
if %ERRORLEVEL% NEQ 0 (
    echo ❌ GraphRAG installation failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo 2. Pulling Embedding Model (nomic-embed-text) for Ollama...
echo (If you already have it, this will be fast)
ollama pull nomic-embed-text
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️ Failed to pull embedding model. Make sure Ollama is running!
    echo Trying to proceed anyway...
)

echo.
echo 3. Starting Indexing with Ollama (qwen2.5:14b)...
echo ☕ This process will take a LONG time (hours). 
echo ☕ Please ensure Ollama is running: 'ollama serve'
echo.
python -m graphrag.index --root ./rag_graph_build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Indexing failed. Check logs in rag_graph_build/logs
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ✅ Build Complete! Artifacts are in rag_graph_build/output
pause
