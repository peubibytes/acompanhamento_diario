@echo off
rem Acompanhamento Diario: de dois cliques neste arquivo para abrir o aplicativo.
rem Feche esta janela para parar o servidor. Ver scripts\start-local.mjs.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao atual em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
node scripts\start-local.mjs
if errorlevel 1 pause
