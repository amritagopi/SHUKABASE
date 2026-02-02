# Build data archives with books folder included
# Run with: powershell -ExecutionPolicy Bypass -File build_data_archives.ps1

$ErrorActionPreference = "Stop"

Write-Host "Starting Shukabase Data Archives Build..." -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Create build directory
$BUILD_DIR = "builds\data_archives"
if (-not (Test-Path $BUILD_DIR)) { New-Item -ItemType Directory -Path $BUILD_DIR | Out-Null }

# --- English Archive ---
$EN_ZIP = "$BUILD_DIR\shukabase_data_en.zip"
if (Test-Path $EN_ZIP) {
    Write-Host "English archive already exists. Skipping..." -ForegroundColor Gray
}
else {
    Write-Host "`nBuilding English archive..." -ForegroundColor Yellow
    $EN_DIR = "$BUILD_DIR\shukabase_data_en"
    if (Test-Path $EN_DIR) { Remove-Item -Recurse -Force $EN_DIR }
    New-Item -ItemType Directory -Path "$EN_DIR\books" | Out-Null

    Copy-Item "rag\faiss_index_en.bin" $EN_DIR
    Copy-Item "rag\faiss_metadata_en.json" $EN_DIR
    Copy-Item "rag\chunked_scriptures_en.json" $EN_DIR
    if (Test-Path "rag\bm25_index_en.pkl") { Copy-Item "rag\bm25_index_en.pkl" $EN_DIR }

    Write-Host "   Copying English books..."
    Copy-Item -Recurse "public\books\en" "$EN_DIR\books\"

    if (Test-Path "rag\graph_index") {
        Write-Host "   Adding knowledge graph..."
        Copy-Item -Recurse "rag\graph_index" $EN_DIR
    }

    Write-Host "   Creating zip..."
    Compress-Archive -Path "$EN_DIR\*" -DestinationPath $EN_ZIP -Force
    Write-Host "English archive ready" -ForegroundColor Green
    
    Remove-Item -Recurse -Force $EN_DIR
}

# --- Russian Archive ---
$RU_ZIP = "$BUILD_DIR\shukabase_data_ru.zip"
if (Test-Path $RU_ZIP) {
    Write-Host "Russian archive already exists. Skipping..." -ForegroundColor Gray
}
else {
    Write-Host "`nBuilding Russian archive..." -ForegroundColor Yellow
    $RU_DIR = "$BUILD_DIR\shukabase_data_ru"
    if (Test-Path $RU_DIR) { Remove-Item -Recurse -Force $RU_DIR }
    New-Item -ItemType Directory -Path "$RU_DIR\books" | Out-Null

    Copy-Item "rag\faiss_index_ru.bin" $RU_DIR
    Copy-Item "rag\faiss_metadata_ru.json" $RU_DIR
    Copy-Item "rag\chunked_scriptures_ru.json" $RU_DIR
    if (Test-Path "rag\bm25_index_ru.pkl") { Copy-Item "rag\bm25_index_ru.pkl" $RU_DIR }

    Write-Host "   Copying Russian books..."
    Copy-Item -Recurse "public\books\ru" "$RU_DIR\books\"

    if (Test-Path "rag\graph_index") {
        Write-Host "   Adding knowledge graph..."
        Copy-Item -Recurse "rag\graph_index" $RU_DIR
    }

    Write-Host "   Creating zip..."
    Compress-Archive -Path "$RU_DIR\*" -DestinationPath $RU_ZIP -Force
    Write-Host "Russian archive ready" -ForegroundColor Green

    Remove-Item -Recurse -Force $RU_DIR
}

# --- Multilingual Archive ---
$ALL_ZIP = "$BUILD_DIR\shukabase_data_multilingual.zip"
if (Test-Path $ALL_ZIP) {
    Write-Host "Multilingual archive already exists. Skipping..." -ForegroundColor Gray
}
else {
    Write-Host "`nBuilding Multilingual archive..." -ForegroundColor Yellow
    $ALL_DIR = "$BUILD_DIR\shukabase_data_multilingual"
    if (Test-Path $ALL_DIR) { Remove-Item -Recurse -Force $ALL_DIR }
    New-Item -ItemType Directory -Path "$ALL_DIR\books" | Out-Null

    Copy-Item "rag\faiss_index_en.bin" $ALL_DIR
    Copy-Item "rag\faiss_metadata_en.json" $ALL_DIR
    Copy-Item "rag\chunked_scriptures_en.json" $ALL_DIR
    Copy-Item "rag\faiss_index_ru.bin" $ALL_DIR
    Copy-Item "rag\faiss_metadata_ru.json" $ALL_DIR
    Copy-Item "rag\chunked_scriptures_ru.json" $ALL_DIR
    if (Test-Path "rag\bm25_index_en.pkl") { Copy-Item "rag\bm25_index_en.pkl" $ALL_DIR }
    if (Test-Path "rag\bm25_index_ru.pkl") { Copy-Item "rag\bm25_index_ru.pkl" $ALL_DIR }

    Write-Host "   Copying all books..."
    Copy-Item -Recurse "public\books\en" "$ALL_DIR\books\"
    Copy-Item -Recurse "public\books\ru" "$ALL_DIR\books\"

    if (Test-Path "rag\graph_index") {
        Write-Host "   Adding knowledge graph..."
        Copy-Item -Recurse "rag\graph_index" $ALL_DIR
    }

    Write-Host "   Creating zip..."
    Compress-Archive -Path "$ALL_DIR\*" -DestinationPath $ALL_ZIP -Force
    Write-Host "Multilingual archive ready" -ForegroundColor Green

    Remove-Item -Recurse -Force $ALL_DIR
}

# --- Summary ---
Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "Archive Summary:" -ForegroundColor Cyan
Get-ChildItem "$BUILD_DIR\*.zip" | ForEach-Object { Write-Host "   $($_.Name): $([math]::Round($_.Length / 1MB, 2)) MB" }
Write-Host "`nDone! Upload these to GitHub Releases with tag 'data-v2'" -ForegroundColor Green
