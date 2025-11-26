# Pack Go Toolchain into a single archive file
# Includes: compile.wasm, link.wasm, and all stdlib packages (from stdlib.pack)
# Creates a simple binary format for loading in the browser

param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$binDir = Join-Path $scriptDir "..\static\bin"
$stdlibPack = Join-Path $scriptDir "..\static\pkg\stdlib.pack"
$outputFile = Join-Path $scriptDir "..\static\goscript.pack"
$indexFile = Join-Path $scriptDir "..\static\pkg\index.json"

Write-Host "Packing GoScript Toolchain..."
Write-Host "Output: $outputFile"
Write-Host ""

# Create output stream
$outputStream = [System.IO.File]::Create($outputFile)
$writer = New-Object System.IO.BinaryWriter($outputStream)

# Write magic header (8 bytes)
$magic = [System.Text.Encoding]::ASCII.GetBytes("GOSCRIPT")
$writer.Write($magic)

# Write version (uint32)
$writer.Write([uint32]2)

# === Section 1: Compiler WASM ===
Write-Host "Section 1: Compiler"
$compilerPath = Join-Path $binDir "compile.wasm"
$compilerBytes = [System.IO.File]::ReadAllBytes($compilerPath)
$writer.Write([uint32]$compilerBytes.Length)
$writer.Write($compilerBytes)
$compilerMB = [math]::Round($compilerBytes.Length / 1MB, 2)
Write-Host "  + compile.wasm ($compilerMB MB)"

# === Section 2: Linker WASM ===
Write-Host "Section 2: Linker"
$linkerPath = Join-Path $binDir "link.wasm"
$linkerBytes = [System.IO.File]::ReadAllBytes($linkerPath)
$writer.Write([uint32]$linkerBytes.Length)
$writer.Write($linkerBytes)
$linkerMB = [math]::Round($linkerBytes.Length / 1MB, 2)
Write-Host "  + link.wasm ($linkerMB MB)"

# === Section 3: Package Index ===
Write-Host "Section 3: Package Index"
$indexBytes = [System.IO.File]::ReadAllBytes($indexFile)
$writer.Write([uint32]$indexBytes.Length)
$writer.Write($indexBytes)
Write-Host "  + index.json ($($indexBytes.Length) bytes)"

# === Section 4: Read existing stdlib.pack and copy package data ===
Write-Host "Section 4: Standard Library Packages (from stdlib.pack)"

# Read the existing stdlib.pack
$stdlibBytes = [System.IO.File]::ReadAllBytes($stdlibPack)
$stdlibStream = New-Object System.IO.MemoryStream(,$stdlibBytes)
$stdlibReader = New-Object System.IO.BinaryReader($stdlibStream)

# Skip stdlib header: magic(8) + version(4) + count(4) + indexOffset(8) = 24 bytes
$stdlibStream.Position = 8  # skip magic
$stdlibVersion = $stdlibReader.ReadUInt32()
$stdlibPackageCount = $stdlibReader.ReadUInt32()
$stdlibIndexOffset = $stdlibReader.ReadUInt64()

Write-Host "  Reading $stdlibPackageCount packages from stdlib.pack..."

# Read the package index from stdlib.pack
$stdlibStream.Position = $stdlibIndexOffset
$indexEntryCount = $stdlibReader.ReadUInt32()

$packageIndex = New-Object System.Collections.ArrayList
for ($i = 0; $i -lt $indexEntryCount; $i++) {
    $nameLen = $stdlibReader.ReadUInt16()
    $nameBytes = $stdlibReader.ReadBytes($nameLen)
    $name = [System.Text.Encoding]::UTF8.GetString($nameBytes)
    $pkgOffset = $stdlibReader.ReadUInt64()
    $pkgSize = $stdlibReader.ReadUInt32()
    
    [void]$packageIndex.Add([PSCustomObject]@{
        Name = $name
        OldOffset = $pkgOffset
        Size = $pkgSize
    })
}

# Data starts at offset 24 in old stdlib.pack
$oldDataStart = 24

# Write package count
$writer.Write([uint32]$packageIndex.Count)

# Write index offset placeholder (will fill later)
$indexOffsetPosition = $outputStream.Position
$writer.Write([uint64]0)

# Copy all package data and track new offsets
$newOffsets = @{}
$currentOffset = [uint64]0

foreach ($entry in $packageIndex) {
    # Read from old location
    $stdlibStream.Position = $oldDataStart + $entry.OldOffset
    $data = $stdlibReader.ReadBytes($entry.Size)
    
    # Write to new location
    $writer.Write($data)
    
    $newOffsets[$entry.Name] = $currentOffset
    $currentOffset += $entry.Size
}

Write-Host "  + $($packageIndex.Count) packages copied"

# Remember where new index starts
$newIndexOffset = $outputStream.Position

# Write package index entries with new offsets
foreach ($entry in $packageIndex) {
    $nameBytes = [System.Text.Encoding]::UTF8.GetBytes($entry.Name)
    $writer.Write([uint16]$nameBytes.Length)
    $writer.Write($nameBytes)
    $writer.Write([uint64]$newOffsets[$entry.Name])
    $writer.Write([uint32]$entry.Size)
}

# Go back and write the actual index offset
$outputStream.Position = $indexOffsetPosition
$writer.Write([uint64]$newIndexOffset)

$stdlibReader.Close()
$stdlibStream.Close()
$writer.Close()
$outputStream.Close()

$finalSize = (Get-Item $outputFile).Length
$sizeMB = [math]::Round($finalSize / 1MB, 2)

Write-Host ""
Write-Host "Pack complete!"
Write-Host "  Compiler:  $compilerMB MB"
Write-Host "  Linker:    $linkerMB MB"
Write-Host "  Stdlib:    $($packageIndex.Count) packages"
Write-Host "  Total:     $sizeMB MB"
Write-Host ""
Write-Host "Output: $outputFile"
