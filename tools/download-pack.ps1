param(
    [string]$Tag = "",
    [string]$Repo = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $Tag) {
    $Tag = if ($env:GOSCRIPT_PACK_TAG) { $env:GOSCRIPT_PACK_TAG } else { "demo" }
}

if (-not $Repo) {
    $Repo = if ($env:GOSCRIPT_PACK_REPO) { $env:GOSCRIPT_PACK_REPO } else { "monstercameron/GoScript" }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$outputDir = Join-Path $rootDir "docs\assets"
$outputFile = Join-Path $outputDir "goscript.pack"
$downloadUrl = "https://github.com/$Repo/releases/download/$Tag/goscript.pack"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if ((Test-Path $outputFile) -and -not $Force) {
    Write-Host "goscript.pack already exists at $outputFile"
    Write-Host "Use -Force to re-download."
    exit 0
}

Write-Host "Downloading goscript.pack from $downloadUrl"
Invoke-WebRequest -Uri $downloadUrl -OutFile $outputFile

$sizeMB = [math]::Round((Get-Item $outputFile).Length / 1MB, 1)
Write-Host "Saved $outputFile ($sizeMB MB)"
