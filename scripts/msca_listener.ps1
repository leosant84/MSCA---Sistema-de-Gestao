Add-Type -AssemblyName System.Web

$port = 39871
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "[MSCA] Servico conectado e pronto na porta $port!" -ForegroundColor Green
    Write-Host "[MSCA] Aguardando cliques no sistema..." -ForegroundColor Cyan
} catch {
    Write-Host "[ERRO] Nao foi possivel iniciar na porta $port: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Pressione Enter para fechar"
    exit 1
}

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $res.Headers.Add("Access-Control-Allow-Origin", "*")
        $res.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
        $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($req.HttpMethod -eq "OPTIONS") {
            $res.StatusCode = 204
            $res.Close()
            continue
        }

        if ($req.Url.AbsolutePath -eq "/health") {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok"}')
            $res.ContentType = "application/json"
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($req.Url.AbsolutePath -eq "/api/open-folder") {
            $qs = [System.Web.HttpUtility]::ParseQueryString($req.Url.Query)
            $clientName = $qs["name"]
            $customFolder = $qs["folder"]
            $basePath = $qs["basePath"]

            if (-not $basePath) {
                $basePath = "I:\Meu Drive\00. MSCA\00. CLIENTES"
            }

            $activeDir = $basePath
            if (-not (Test-Path $activeDir)) {
                $drives = @("I", "J", "G", "H", "D", "C")
                foreach ($d in $drives) {
                    $cand = "$($d):\Meu Drive\00. MSCA\00. CLIENTES"
                    if (Test-Path $cand) {
                        $activeDir = $cand
                        break
                    }
                }
            }

            if (-not (Test-Path $activeDir)) {
                $msg = '{"success":false,"message":"Pasta do Google Drive nao encontrada nesta maquina."}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
                $res.StatusCode = 404
                $res.ContentType = "application/json"
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.Close()
                continue
            }

            $target = ""
            if ($customFolder -and (Test-Path (Join-Path $activeDir $customFolder))) {
                $target = Join-Path $activeDir $customFolder
            } else {
                $clean = $clientName.Trim()
                $dirs = Get-ChildItem -Path $activeDir -Directory | Select-Object -ExpandProperty Name
                $m = $dirs | Where-Object { $_ -eq $clean } | Select-Object -First 1
                if (-not $m) { $m = $dirs | Where-Object { $_ -like "$clean*" } | Select-Object -First 1 }
                if (-not $m) { $m = $dirs | Where-Object { $_ -like "*$clean*" } | Select-Object -First 1 }
                if ($m) { $target = Join-Path $activeDir $m }
            }

            $finalDir = if ($target) { $target } else { $activeDir }
            Start-Process "explorer.exe" -ArgumentList ('"' + $finalDir + '"')
            Write-Host "[MSCA] Abrindo pasta: $finalDir" -ForegroundColor Yellow

            $exact = [bool]$target
            $json = '{"success":true,"exactMatch":' + $exact.ToString().ToLower() + ',"folderOpened":' + ($finalDir | ConvertTo-Json) + '}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($req.Url.AbsolutePath -eq "/api/create-folder") {
            $clientName = ""
            if ($req.HasEntityBody) {
                $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
                $bodyText = $reader.ReadToEnd()
                try {
                    $parsed = $bodyText | ConvertFrom-Json
                    $clientName = $parsed.name
                } catch {}
            }
            if (-not $clientName) {
                $qs = [System.Web.HttpUtility]::ParseQueryString($req.Url.Query)
                $clientName = $qs["name"]
            }

            if (-not $clientName) {
                $msg = '{"success":false,"message":"Nome do cliente nao informado."}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
                $res.StatusCode = 400
                $res.ContentType = "application/json"
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.Close()
                continue
            }

            $baseDir = "I:\Meu Drive\00. MSCA\00. CLIENTES"
            if (-not (Test-Path $baseDir)) {
                $drives = @("I", "J", "G", "H", "D", "C")
                foreach ($d in $drives) {
                    $cand = "$($d):\Meu Drive\00. MSCA\00. CLIENTES"
                    if (Test-Path $cand) { $baseDir = $cand; break }
                }
            }

            if (-not (Test-Path $baseDir)) {
                $msg = '{"success":false,"message":"Diretorio do Google Drive nao encontrado nesta maquina."}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
                $res.StatusCode = 404
                $res.ContentType = "application/json"
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                $res.Close()
                continue
            }

            $folderUpper = $clientName.Trim().ToUpper()
            $clientPath = Join-Path $baseDir $folderUpper
            if (-not (Test-Path $clientPath)) {
                New-Item -ItemType Directory -Path $clientPath -Force | Out-Null
            }

            $subs = @("01. SOCIETÁRIO", "02. FISCAL", "03. DEP. PESSOAL")
            foreach ($s in $subs) {
                $subPath = Join-Path $clientPath $s
                if (-not (Test-Path $subPath)) {
                    New-Item -ItemType Directory -Path $subPath -Force | Out-Null
                }
            }

            Write-Host "[MSCA] Pasta criada/verificada: $clientPath com 3 subpastas padrao." -ForegroundColor Green
            $json = ('{"success":true,"folderName":' + ($folderUpper | ConvertTo-Json) + ',"folderPath":' + ($clientPath | ConvertTo-Json) + '}')
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        $res.StatusCode = 404
        $res.Close()
    } catch {
        Write-Host "[AVISO] Erro na requisicao: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}
