$ErrorActionPreference = 'Stop'

$backendDir = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot 'runtime-e2e-vote-check.js'
$outLog = Join-Path $backendDir 'runtime-backend.out.log'
$errLog = Join-Path $backendDir 'runtime-backend.err.log'

Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

$process = Start-Process -FilePath cmd.exe -ArgumentList '/c npm start' -WorkingDirectory $backendDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $ready) {
    $outTail = if (Test-Path $outLog) { Get-Content $outLog -Tail 40 | Out-String } else { '' }
    $errTail = if (Test-Path $errLog) { Get-Content $errLog -Tail 40 | Out-String } else { '' }
    throw "Backend failed to start on port 3001.`nOUT:`n$outTail`nERR:`n$errTail"
  }

  & node $scriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "Runtime vote check failed with exit code $LASTEXITCODE"
  }
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }

  $listenerPids = Get-NetTCPConnection -LocalPort 3001,3003 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($listenerPid in $listenerPids) {
    Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
  }
}
