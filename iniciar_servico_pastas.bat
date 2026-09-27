@echo off
title MSCA - Servico Local de Pastas
cd /d "c:\Repositorio\MS Contadores Associados\Sistema de Gestao"
echo ========================================================
echo   MSCA CONTADORES - SERVICO LOCAL DE PASTAS (DRIVE G:)
echo ========================================================
echo.
echo Iniciando ponte local na porta 39871...
node scripts/msca_folder_bridge.js
pause
