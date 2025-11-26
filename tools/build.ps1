# GoScript Build Script
# Bundles the SDK and wasm_exec.js into a single distributable file

param(
    [switch]$Minify,
    [switch]$IncludeWasmExec
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$sdkDir = Join-Path $rootDir "sdk"
$srcDir = Join-Path $rootDir "src"
$distDir = Join-Path $rootDir "dist"

# Ensure dist directory exists
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

Write-Host "Building GoScript SDK..."
Write-Host ""

# Read files
$wasmExec = Get-Content (Join-Path $srcDir "runtime\wasm_exec.js") -Raw
$goscript = Get-Content (Join-Path $sdkDir "goscript.js") -Raw

# Build combined file
$banner = @"
/**
 * GoScript SDK v1.0.0
 * Browser-based Go compiler using WebAssembly
 * 
 * https://github.com/user/goscript
 * 
 * Includes:
 * - GoScript SDK (MIT License)
 * - Go wasm_exec.js (BSD License)
 * 
 * Built: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
 */

"@

# Combined bundle (SDK + wasm_exec)
$bundleContent = $banner + @"

// ============================================================
// Go WASM Runtime (wasm_exec.js)
// ============================================================

$wasmExec

// ============================================================
// GoScript SDK
// ============================================================

$goscript
"@

# SDK only (requires wasm_exec.js to be loaded separately)
$sdkOnlyContent = $banner + $goscript

# Write outputs
$bundlePath = Join-Path $distDir "goscript.bundle.js"
$sdkPath = Join-Path $distDir "goscript.js"

Set-Content -Path $bundlePath -Value $bundleContent -Encoding UTF8
Set-Content -Path $sdkPath -Value $sdkOnlyContent -Encoding UTF8

# Calculate sizes
$bundleSize = [math]::Round((Get-Item $bundlePath).Length / 1KB, 1)
$sdkSize = [math]::Round((Get-Item $sdkPath).Length / 1KB, 1)

Write-Host "Output files:"
Write-Host "  dist/goscript.bundle.js - $bundleSize KB (SDK + wasm_exec.js)"
Write-Host "  dist/goscript.js        - $sdkSize KB (SDK only)"
Write-Host ""

# Copy assets reference
$assetsDir = Join-Path $rootDir "assets"
if (Test-Path $assetsDir) {
    $packSize = [math]::Round((Get-Item (Join-Path $assetsDir "goscript.pack")).Length / 1MB, 1)
    Write-Host "Required asset:"
    Write-Host "  assets/goscript.pack    - $packSize MB (toolchain)"
}

Write-Host ""
Write-Host "Build complete!"
Write-Host ""
Write-Host "Usage:"
Write-Host '  <script src="dist/goscript.bundle.js"></script>'
Write-Host '  <script>'
Write-Host '    const gs = new GoScript();'
Write-Host '    await gs.init();'
Write-Host '  </script>'
