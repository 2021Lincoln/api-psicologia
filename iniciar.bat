@echo off
REM Inicia todo o projeto: Ollama + Backend + Frontend
REM Execute com duplo clique

echo ============================================
echo   Marketplace de Psicologia - Iniciando
echo ============================================
echo.

REM ── 1. Ollama ──────────────────────────────
set OLLAMA_EXE=%USERPROFILE%\ollama\ollama.exe
curl -s http://localhost:11434/ >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Ollama ja rodando
) else (
    echo [1/3] Iniciando Ollama...
    start /B "" "%OLLAMA_EXE%" serve
    timeout /t 3 /nobreak >nul
    echo [OK] Ollama iniciado
)

REM ── 2. Backend FastAPI ──────────────────────
echo [2/3] Iniciando Backend (porta 8000)...
start "Backend FastAPI" cmd /k "cd /d %~dp0 && .venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

REM ── 3. Frontend Next.js ────────────────────
echo [3/3] Iniciando Frontend (porta 3000)...
start "Frontend Next.js" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo ============================================
echo   Tudo iniciado!
echo   Backend:  http://localhost:8000/docs
echo   Frontend: http://localhost:3000
echo   Rede:     http://192.168.1.167:3000
echo ============================================
echo.
pause
