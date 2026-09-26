@echo off
REM ==============================================================================
REM MSCA - Rotina Automática Diária de Backup para Google Drive
REM ==============================================================================

cd /d "C:\Repositorio\MS Contadores Associados\Sistema de Gestao"

echo [%date% %time%] Iniciando rotina de backup MSCA... >> backups\backup_scheduler.log
"C:\Program Files\nodejs\node.exe" scripts\backup_msca.js >> backups\backup_scheduler.log 2>&1

if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] Backup executado com sucesso e enviado ao Google Drive! >> backups\backup_scheduler.log
) else (
    echo [%date% %time%] Ocorreu um erro na execucao do backup. >> backups\backup_scheduler.log
)
