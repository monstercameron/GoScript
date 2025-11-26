# Pack Go Standard Library into a single archive file
# Creates a simple binary format for loading in the browser

param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgDir = Join-Path $scriptDir "..\static\pkg\js_wasm"
$outputFile = Join-Path $scriptDir "..\static\pkg\stdlib.pack"
$indexFile = Join-Path $scriptDir "..\static\pkg\index.json"

Write-Host "Packing Go Standard Library..."
Write-Host "Source: $pkgDir"
Write-Host "Output: $outputFile"

# Read package index
$packages = Get-Content $indexFile -Raw | ConvertFrom-Json

# Create output stream
$outputStream = [System.IO.File]::Create($outputFile)
$writer = New-Object System.IO.BinaryWriter($outputStream)

# Write magic header
$magic = [System.Text.Encoding]::ASCII.GetBytes("GOSTDLIB")
$writer.Write($magic)

# Write version (uint32)
$writer.Write([uint32]1)

# Write package count (uint32)
$writer.Write([uint32]$packages.Count)

# Collect all package data and build index
$packageIndex = New-Object System.Collections.ArrayList
$allData = New-Object System.Collections.ArrayList
$currentOffset = [uint64]0

foreach ($pkg in $packages) {
    $filePath = Join-Path $pkgDir ($pkg + ".a")
    
    if (Test-Path $filePath) {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        
        $entry = [PSCustomObject]@{
            Name = $pkg
            Offset = $currentOffset
            Size = [uint32]$bytes.Length
        }
        [void]$packageIndex.Add($entry)
        [void]$allData.Add($bytes)
        
        $currentOffset += $bytes.Length
        
        $sizeKB = [math]::Round($bytes.Length / 1024, 1)
        Write-Host "  + $pkg ($sizeKB KB)"
    }
}

# Write index offset placeholder (uint64)
$indexOffsetPosition = $outputStream.Position
$writer.Write([uint64]0)

# Write all file data
foreach ($data in $allData) {
    $writer.Write($data)
}

# Remember where index starts
$indexOffset = $outputStream.Position

# Write index entry count (uint32)
$writer.Write([uint32]$packageIndex.Count)

# Write index entries
foreach ($entry in $packageIndex) {
    $nameBytes = [System.Text.Encoding]::UTF8.GetBytes($entry.Name)
    $writer.Write([uint16]$nameBytes.Length)
    $writer.Write($nameBytes)
    $writer.Write([uint64]$entry.Offset)
    $writer.Write([uint32]$entry.Size)
}

# Go back and write the actual index offset
$outputStream.Position = $indexOffsetPosition
$writer.Write([uint64]$indexOffset)

$writer.Close()
$outputStream.Close()

$finalSize = (Get-Item $outputFile).Length
$sizeMB = [math]::Round($finalSize / 1MB, 2)

Write-Host ""
Write-Host "Pack complete!"
Write-Host "  Packages: $($packageIndex.Count)"
Write-Host "  Total size: $sizeMB MB"
