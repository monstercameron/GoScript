# Measures what each delivery model costs, and writes docs/data/size-report.json.
#
#   A) "source" model : ship .go text files + a cached compiler pack
#   B) "binary" model : ship a precompiled .wasm per app (plain `go build`)
#
# Requires PowerShell 7 (pwsh) for the Brotli stream, and a Go toolchain.
#
#   pwsh -File tools/measure-sizes.ps1 [-GoRoot <dir>] [-PackBr <path to goscript.pack.br>]
#
# Brotli at maximum quality takes about 5 minutes on the 200 MB pack, so pass
# -PackBr to reuse an existing goscript.pack.br instead of recompressing.

param(
    [string]$GoRoot = (Join-Path $env:USERPROFILE "sdk\go1.27.3\go"),
    [string]$PackBr = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$goExe = Join-Path $GoRoot "bin\go.exe"
if (-not (Test-Path $goExe)) { $goExe = "go" }

function Get-Compressed([byte[]]$bytes, [string]$kind) {
    $ms = New-Object System.IO.MemoryStream
    if ($kind -eq "gzip") {
        $s = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionLevel]::SmallestSize, $true)
    } else {
        $s = New-Object System.IO.Compression.BrotliStream($ms, [System.IO.Compression.CompressionLevel]::SmallestSize, $true)
    }
    $s.Write($bytes, 0, $bytes.Length)
    $s.Dispose()
    return $ms.Length
}

function Measure-Bytes([byte[]]$bytes) {
    [ordered]@{
        raw    = $bytes.Length
        gzip   = (Get-Compressed $bytes "gzip")
        brotli = (Get-Compressed $bytes "brotli")
    }
}

function Measure-File([string]$path) { Measure-Bytes ([System.IO.File]::ReadAllBytes($path)) }

$goVersion = (& $goExe version)
Write-Host "Go: $goVersion"

# ---------- examples ----------
$examples = @(
    @{ id = "todo";     name = "Simple todo";   dir = "docs\go\todo" },
    @{ id = "todo-pro"; name = "Advanced todo"; dir = "docs\go\todo-pro" }
)

$exampleReports = @()
foreach ($ex in $examples) {
    $srcDir = Join-Path $root $ex.dir
    $files = Get-ChildItem $srcDir -Filter *.go | Sort-Object Name
    Write-Host "== $($ex.name): $($files.Count) files"

    # Each source file is its own HTTP response, so compress them one by one.
    $sum = [ordered]@{ raw = 0; gzip = 0; brotli = 0 }
    $fileList = @()
    foreach ($f in $files) {
        $m = Measure-File $f.FullName
        $sum.raw += $m.raw; $sum.gzip += $m.gzip; $sum.brotli += $m.brotli
        $fileList += [ordered]@{ name = $f.Name; bytes = $m.raw }
    }

    # Build the same sources as ordinary wasm binaries, the way a normal Go dev ships.
    $tmp = Join-Path $env:TEMP ("measure-" + $ex.id)
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory $tmp | Out-Null
    Copy-Item (Join-Path $srcDir "*.go") $tmp
    Push-Location $tmp
    $env:GOOS = "js"; $env:GOARCH = "wasm"; $env:GOROOT = $GoRoot
    & $goExe mod init measure 2>$null | Out-Null
    & $goExe build -o default.wasm .
    if ($LASTEXITCODE -ne 0) { throw "go build failed for $($ex.id)" }
    & $goExe build -ldflags "-s -w" -o stripped.wasm .
    if ($LASTEXITCODE -ne 0) { throw "go build -s -w failed for $($ex.id)" }
    Remove-Item Env:GOOS, Env:GOARCH -ErrorAction SilentlyContinue
    Pop-Location

    $exampleReports += [ordered]@{
        id = $ex.id
        name = $ex.name
        fileCount = $files.Count
        files = $fileList
        source = $sum
        wasmDefault = (Measure-File (Join-Path $tmp "default.wasm"))
        wasmStripped = (Measure-File (Join-Path $tmp "stripped.wasm"))
    }
}

# ---------- compiler side ----------
Write-Host "== compiler pack"
$gzPath = Join-Path $root "docs\assets\goscript.pack.gz"
$packRaw = Join-Path $root "docs\assets\goscript.pack"
if (-not (Test-Path $gzPath)) { throw "missing $gzPath" }

# raw size = decompressed size of the gzip file
$in = [System.IO.File]::OpenRead($gzPath)
$gz = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
$buf = New-Object byte[] (4MB); $rawBytes = [int64]0
while (($n = $gz.Read($buf, 0, $buf.Length)) -gt 0) { $rawBytes += $n }
$in.Close()

$brBytes = 0
if ($PackBr -and (Test-Path $PackBr)) {
    $brBytes = (Get-Item $PackBr).Length
} elseif (Test-Path $packRaw) {
    Write-Host "   compressing pack with Brotli (about 5 minutes)..."
    $src = [System.IO.File]::OpenRead($packRaw)
    $ms = New-Object System.IO.MemoryStream
    $b = New-Object System.IO.Compression.BrotliStream($ms, [System.IO.Compression.CompressionLevel]::SmallestSize, $true)
    $src.CopyTo($b); $b.Dispose(); $src.Close()
    $brBytes = $ms.Length
} else {
    throw "pass -PackBr <goscript.pack.br> or keep docs/assets/goscript.pack for recompression"
}

$binDir = Join-Path $root "static\bin"
$compileRaw = if (Test-Path "$binDir\compile.wasm") { (Get-Item "$binDir\compile.wasm").Length } else { $null }
$linkRaw = if (Test-Path "$binDir\link.wasm") { (Get-Item "$binDir\link.wasm").Length } else { $null }

$report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    goVersion = ($goVersion -replace "^go version ", "")
    compiler = [ordered]@{
        packRaw = $rawBytes
        packGzip = (Get-Item $gzPath).Length
        packBrotli = $brBytes
        compileWasmRaw = $compileRaw
        linkWasmRaw = $linkRaw
    }
    runtimeJs = [ordered]@{
        goscriptBundleMin = (Measure-File (Join-Path $root "docs\scripts\goscript.bundle.min.js"))
        wasmExec = (Measure-File (Join-Path $root "src\wasm_exec.js"))
    }
    examples = $exampleReports
}

$outDir = Join-Path $root "docs\data"
New-Item -ItemType Directory -Force $outDir | Out-Null
$outFile = Join-Path $outDir "size-report.json"
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $outFile -Encoding utf8
Write-Host "Wrote $outFile"
