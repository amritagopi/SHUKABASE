@echo off
echo ========================================================
echo  SHUKABASE AI - MASTER TEST RUNNER
echo ========================================================
echo.

echo [1/2] Running BACKEND Tests (Python)...
echo ----------------------------------------
call .\venv\Scripts\python -m pytest rag/tests
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backend tests FAILED!
    goto :error
) else (
    echo [SUCCESS] Backend tests PASSED.
)
echo.

echo [2/2] Running FRONTEND Tests (Vitest)...
echo ----------------------------------------
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend tests FAILED!
    goto :error
) else (
    echo [SUCCESS] Frontend tests PASSED.
)
echo.

echo ========================================================
echo  ALL TESTS PASSED SUCCESSFULLY!
echo ========================================================
pause
exit /b 0

:error
echo.
echo [FAIL] Some tests failed. Please review errors above.
pause
exit /b 1
