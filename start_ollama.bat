@echo off
REM Inicia o servidor Ollama em background
REM Execute este arquivo antes (ou junto) do backend

set OLLAMA_EXE=%USERPROFILE%\ollama\ollama.exe

if not exist "%OLLAMA_EXE%" (
    echo [ERRO] Ollama nao encontrado em %OLLAMA_EXE%
    pause
    exit /b 1
)

REM Verifica se ja esta rodando
curl -s http://localhost:11434/ >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Ollama ja esta rodando em http://localhost:11434
    exit /b 0
)

echo Iniciando Ollama...
start /B "" "%OLLAMA_EXE%" serve

timeout /t 3 /nobreak >nul
echo [OK] Ollama rodando em http://localhost:11434
