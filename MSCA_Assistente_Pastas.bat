@echo off
chcp 65001 >nul
title MSCA - Assistente de Pastas Local
color 0b

echo ======================================================================
echo           MSCA CONTADORES - ASSISTENTE DE PASTAS LOCAL
echo ======================================================================
echo.
echo Este assistente conecta o Sistema de Gestao MSCA as suas pastas do
echo Google Drive no seu computador.
echo.

:: Pergunta se deseja adicionar a inicialização automática do Windows
set /p AUTOSTART="Deseja que este assistente inicie automaticamente com o Windows? (S/N): "

if /i "%AUTOSTART%"=="S" (
    powershell -NoProfile -Command ^
    "$startup = [Environment]::GetFolderPath('Startup'); " ^
    "$scPath = Join-Path $startup 'MSCA_Assistente_Pastas.lnk'; " ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut($scPath); " ^
    "$s.TargetPath = '%~f0'; " ^
    "$s.WindowStyle = 7; " ^
    "$s.Save(); " ^
    "Write-Host '[OK] Atalho criado na inicializacao do Windows com sucesso!' -ForegroundColor Green"
    echo.
)

echo [INFO] Iniciando servico de conexao na porta 39871...
echo Voce ja pode clicar no icone de pasta no Sistema de Gestao!
echo.
echo (Mantenha esta janela minimizada enquanto estiver usando o sistema)
echo.

:: Executa servidor HTTP nativo via PowerShell sem depender de Node.js
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$listener = New-Object System.Net.HttpListener; " ^
"$listener.Prefixes.Add('http://127.0.0.1:39871/'); " ^
"try { $listener.Start(); } catch { Write-Host '[ERRO] Porta 39871 ja em uso ou sem permissao.' -ForegroundColor Red; exit 1; }; " ^
"Write-Host '[MSCA] Conectado e aguardando comandos do sistema...' -ForegroundColor Cyan; " ^
"while ($listener.IsListening) { " ^
"    $ctx = $listener.GetContext(); " ^
"    $req = $ctx.Request; " ^
"    $res = $ctx.Response; " ^
"    $res.Headers.Add('Access-Control-Allow-Origin', '*'); " ^
"    $res.Headers.Add('Access-Control-Allow-Methods', 'GET, OPTIONS'); " ^
"    $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type'); " ^
"    if ($req.HttpMethod -eq 'OPTIONS') { " ^
"        $res.StatusCode = 204; " ^
"        $res.Close(); " ^
"        continue; " ^
"    }; " ^
"    if ($req.Url.AbsolutePath -eq '/health') { " ^
"        $buf = [System.Text.Encoding]::UTF8.GetBytes('{\"status\":\"ok\"}'); " ^
"        $res.ContentType = 'application/json'; " ^
"        $res.OutputStream.Write($buf, 0, $buf.Length); " ^
"        $res.Close(); " ^
"        continue; " ^
"    }; " ^
"    if ($req.Url.AbsolutePath -eq '/api/open-folder') { " ^
"        $qs = [System.Web.HttpUtility]::ParseQueryString($req.Url.Query); " ^
"        $clientName = $qs['name']; " ^
"        $customFolder = $qs['folder']; " ^
"        $basePath = $qs['basePath']; " ^
"        if (-not $basePath) { $basePath = 'I:\Meu Drive\00. MSCA\00. CLIENTES'; }; " ^
"        $activeDir = $basePath; " ^
"        if (-not (Test-Path $activeDir)) { " ^
"            $drives = @('I', 'J', 'G', 'H', 'D', 'C'); " ^
"            foreach ($d in $drives) { " ^
"                $cand = \"$($d):\Meu Drive\00. MSCA\00. CLIENTES\"; " ^
"                if (Test-Path $cand) { $activeDir = $cand; break; }; " ^
"            }; " ^
"        }; " ^
"        if (-not (Test-Path $activeDir)) { " ^
"            $json = '{\"success\":false,\"message\":\"Diretorio do Google Drive nao encontrado nesta maquina.\"}'; " ^
"            $buf = [System.Text.Encoding]::UTF8.GetBytes($json); " ^
"            $res.StatusCode = 404; " ^
"            $res.ContentType = 'application/json'; " ^
"            $res.OutputStream.Write($buf, 0, $buf.Length); " ^
"            $res.Close(); " ^
"            continue; " ^
"        }; " ^
"        $target = ''; " ^
"        if ($customFolder -and (Test-Path (Join-Path $activeDir $customFolder))) { " ^
"            $target = Join-Path $activeDir $customFolder; " ^
"        } else { " ^
"            $clean = $clientName.Trim(); " ^
"            $dirs = Get-ChildItem -Path $activeDir -Directory | Select-Object -ExpandProperty Name; " ^
"            $m = $dirs | Where-Object { $_ -eq $clean } | Select-Object -First 1; " ^
"            if (-not $m) { $m = $dirs | Where-Object { $_ -like \"$clean*\" } | Select-Object -First 1; }; " ^
"            if (-not $m) { $m = $dirs | Where-Object { $_ -like \"*$clean*\" } | Select-Object -First 1; }; " ^
"            if ($m) { $target = Join-Path $activeDir $m; }; " ^
"        }; " ^
"        $finalDir = if ($target) { $target } else { $activeDir }; " ^
"        Start-Process 'explorer.exe' -ArgumentList ('\"' + $finalDir + '\"'); " ^
"        $exact = [bool]$target; " ^
"        $json = ('{\"success\":true,\"exactMatch\":' + $exact.ToString().ToLower() + ',\"folderOpened\":' + ($finalDir | ConvertTo-Json) + '}'); " ^
"        $buf = [System.Text.Encoding]::UTF8.GetBytes($json); " ^
"        $res.ContentType = 'application/json'; " ^
"        $res.OutputStream.Write($buf, 0, $buf.Length); " ^
"        $res.Close(); " ^
"        continue; " ^
"    }; " ^
"    $res.StatusCode = 404; " ^
"    $res.Close(); " ^
"}"
