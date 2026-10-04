# native/helper/build.ps1
# Compilation du Helper Windows natif C++ Astral Vanguard v3.0

$ErrorActionPreference = 'Stop'

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  ASTRAL VANGUARD - COMPILATION DU HELPER PRIVILEGIE NATIF C++" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$vsBatch = "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vsBatch)) {
    Write-Error "vcvars64.bat introuvable : $vsBatch"
    exit 1
}

$helperDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceFile = Join-Path $helperDir "main.cpp"
$binDir = Join-Path $helperDir "..\..\astral-desktop\bin"
$outExe = Join-Path $binDir "astral-helper.exe"
$objFile = Join-Path $helperDir "main.obj"

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

Write-Host "Source : $sourceFile" -ForegroundColor Gray
Write-Host "Cible  : $outExe" -ForegroundColor Gray

# Execution de cl.exe dans l'environnement vcvars64
$cmd = @"
call "$vsBatch" >nul
cl.exe /O2 /MT /EHsc /std:c++17 /W4 "$sourceFile" /Fe:"$outExe" /Fo:"$objFile" advapi32.lib dnsapi.lib psapi.lib user32.lib /link /INCREMENTAL:NO /SUBSYSTEM:CONSOLE
"@

$tempBat = Join-Path $helperDir "_temp_compile.bat"
Set-Content -Path $tempBat -Value $cmd -Encoding ASCII

cmd.exe /c "$tempBat"
$buildExit = $LASTEXITCODE

if (Test-Path $tempBat) { Remove-Item $tempBat -Force }
if (Test-Path $objFile) { Remove-Item $objFile -Force }

if ($buildExit -ne 0) {
    Write-Error "Echec de compilation du Helper (Code: $buildExit)"
    exit $buildExit
}

Write-Host ""
Write-Host "[SUCCES] Binaire Helper natif C++ compile avec succes !" -ForegroundColor Green
Write-Host "Chemin : $outExe" -ForegroundColor Green

& "$outExe" --version
& "$outExe" --self-test
