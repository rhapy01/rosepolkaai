$ErrorActionPreference = "Stop"

$Root = "D:\defi-pal-main"
$Nssm = Join-Path $Root "tools\nssm\nssm.exe"
$ServiceName = "defai-relayer"
$Node = "C:\Program Files\nodejs\node.exe"
$RelayerScript = Join-Path $Root "scripts\relay-bridge.cjs"
$LogDir = Join-Path $Root "logs"

if (!(Test-Path $Nssm)) { throw "NSSM not found at: $Nssm" }
if (!(Test-Path $Node)) { throw "Node not found at: $Node" }
if (!(Test-Path $RelayerScript)) { throw "Relayer script not found at: $RelayerScript" }

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

try { & $Nssm stop $ServiceName | Out-Null } catch {}
try { & $Nssm remove $ServiceName confirm | Out-Null } catch {}

& $Nssm install $ServiceName $Node $RelayerScript | Out-Null
& $Nssm set $ServiceName DisplayName "DeFAI Bridge Relayer" | Out-Null
& $Nssm set $ServiceName AppDirectory $Root | Out-Null
& $Nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
& $Nssm set $ServiceName AppStdout (Join-Path $LogDir "relayer.out.log") | Out-Null
& $Nssm set $ServiceName AppStderr (Join-Path $LogDir "relayer.err.log") | Out-Null
& $Nssm set $ServiceName AppRotateFiles 1 | Out-Null
& $Nssm set $ServiceName AppRotateOnline 1 | Out-Null
& $Nssm set $ServiceName AppRotateBytes 10485760 | Out-Null

& $Nssm start $ServiceName | Out-Null

Write-Host "NSSM status:"
& $Nssm status $ServiceName
Write-Host ""
Write-Host "SC status:"
sc.exe query $ServiceName

