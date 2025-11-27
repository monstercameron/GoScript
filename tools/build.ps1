# GoScript Build Script
# Bundles the SDK and wasm_exec.js into a single distributable file

param(
    [switch]$Minify,
    [switch]$IncludeWasmExec
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$srcDir = Join-Path $rootDir "src"
$distDir = Join-Path $rootDir "dist"

# Ensure dist directory exists
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

Write-Host "Building GoScript SDK..."
Write-Host ""

# Read all source files and combine them
$wasmExec = Get-Content (Join-Path $srcDir "runtime\wasm_exec.js") -Raw
$virtualFs = Get-Content (Join-Path $srcDir "core\virtual-fs.js") -Raw
$fsPolyfill = Get-Content (Join-Path $srcDir "core\fs-polyfill.js") -Raw
$cacheManager = Get-Content (Join-Path $srcDir "core\cache-manager.js") -Raw
$toolchainLoader = Get-Content (Join-Path $srcDir "core\toolchain-loader.js") -Raw
$githubFetcher = Get-Content (Join-Path $srcDir "compiler\github-fetcher.js") -Raw
$compilationManager = Get-Content (Join-Path $srcDir "compiler\compilation-manager.js") -Raw
$appRunner = Get-Content (Join-Path $srcDir "runtime\app-runner.js") -Raw
$goscriptSdk = Get-Content (Join-Path $srcDir "goscript-sdk.js") -Raw
$main = Get-Content (Join-Path $srcDir "main.js") -Raw

# Build combined SDK (all internal modules)
$sdkContent = @"
$virtualFs

$fsPolyfill

$cacheManager

$toolchainLoader

$githubFetcher

$compilationManager

$appRunner

$goscriptSdk

$main
"@

# Build banner
$banner = @"
/**
 * GoScript SDK v1.0.0
 * Browser-based Go compiler using WebAssembly
 * 
 * https://github.com/aspect-build/aspect-cli
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

$sdkContent
"@

# SDK only (requires wasm_exec.js to be loaded separately)
$sdkOnlyContent = $banner + $sdkContent

# Write outputs
$bundlePath = Join-Path $distDir "goscript.bundle.js"
$sdkPath = Join-Path $distDir "goscript.js"

Set-Content -Path $bundlePath -Value $bundleContent -Encoding UTF8
Set-Content -Path $sdkPath -Value $sdkOnlyContent -Encoding UTF8

# Calculate sizes
$bundleSize = [math]::Round((Get-Item $bundlePath).Length / 1KB, 1)
$sdkSize = [math]::Round((Get-Item $sdkPath).Length / 1KB, 1)

Write-Host "Output files:"
Write-Host "  dist/goscript.bundle.js     - $bundleSize KB (SDK + wasm_exec.js)"
Write-Host "  dist/goscript.js            - $sdkSize KB (SDK only)"

# Minify using terser if available
$terserPath = Join-Path $rootDir "node_modules\.bin\terser.cmd"
if (Test-Path $terserPath) {
    Write-Host ""
    Write-Host "Minifying..."
    
    $bundleMinPath = Join-Path $distDir "goscript.bundle.min.js"
    $sdkMinPath = Join-Path $distDir "goscript.min.js"
    
    & $terserPath $bundlePath -o $bundleMinPath --compress --mangle
    & $terserPath $sdkPath -o $sdkMinPath --compress --mangle
    
    $bundleMinSize = [math]::Round((Get-Item $bundleMinPath).Length / 1KB, 1)
    $sdkMinSize = [math]::Round((Get-Item $sdkMinPath).Length / 1KB, 1)
    
    Write-Host "  dist/goscript.bundle.min.js - $bundleMinSize KB (minified)"
    Write-Host "  dist/goscript.min.js        - $sdkMinSize KB (minified)"
} else {
    Write-Host ""
    Write-Host "Note: Install terser for minified builds: npm install -D terser"
}

Write-Host ""

# Show asset info
$docsAssetsDir = Join-Path $rootDir "docs\assets"
if (Test-Path $docsAssetsDir) {
    $packPath = Join-Path $docsAssetsDir "goscript.pack"
    if (Test-Path $packPath) {
        $packSize = [math]::Round((Get-Item $packPath).Length / 1MB, 1)
        Write-Host "Required asset:"
        Write-Host "  docs/assets/goscript.pack   - $packSize MB (toolchain)"
        Write-Host ""
    }
}

Write-Host "Build complete!"
Write-Host ""
Write-Host "Usage:"
Write-Host '  <script src="dist/goscript.bundle.js"></script>'
Write-Host '  <script>'
Write-Host '    const gs = new GoScript();'
Write-Host '    await gs.init();'
Write-Host '  </script>'
