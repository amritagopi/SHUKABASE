"""
Скрипт для разделения shukabase_data.zip на 3 архива:
- shukabase_data_multilingual.zip (все языки)
- shukabase_data_ru.zip (только русский)
- shukabase_data_en.zip (только английский)

Запуск: python split_archives.py
"""

import zipfile
import os
import shutil
from pathlib import Path

SOURCE_ZIP = "shukabase_data.zip"
TEMP_DIR = "temp_extract"
OUTPUT_DIR = "split_archives"

# Файлы, которые относятся к конкретному языку
RU_PATTERNS = ['_ru.', '_ru_', 'russian', 'ru/']
EN_PATTERNS = ['_en.', '_en_', 'english', 'en/']

def is_russian_file(filename: str) -> bool:
    """Проверяет, относится ли файл к русской базе."""
    lower = filename.lower()
    return any(p in lower for p in RU_PATTERNS)

def is_english_file(filename: str) -> bool:
    """Проверяет, относится ли файл к английской базе."""
    lower = filename.lower()
    return any(p in lower for p in EN_PATTERNS)

def is_common_file(filename: str) -> bool:
    """Проверяет, является ли файл общим (не зависит от языка)."""
    return not is_russian_file(filename) and not is_english_file(filename)

def main():
    print("🔍 Проверяю наличие исходного архива...")
    
    if not os.path.exists(SOURCE_ZIP):
        print(f"❌ Файл {SOURCE_ZIP} не найден!")
        return
    
    # Получаем размер
    size_mb = os.path.getsize(SOURCE_ZIP) / (1024 * 1024)
    print(f"✅ Найден {SOURCE_ZIP} ({size_mb:.1f} MB)")
    
    # Создаем временную папку
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("📦 Распаковываю архив...")
    with zipfile.ZipFile(SOURCE_ZIP, 'r') as zip_ref:
        zip_ref.extractall(TEMP_DIR)
    
    # Собираем все файлы
    all_files = []
    for root, dirs, files in os.walk(TEMP_DIR):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, TEMP_DIR)
            all_files.append((full_path, rel_path))
    
    print(f"📊 Всего файлов: {len(all_files)}")
    
    # Классифицируем
    ru_files = [(fp, rp) for fp, rp in all_files if is_russian_file(rp) or is_common_file(rp)]
    en_files = [(fp, rp) for fp, rp in all_files if is_english_file(rp) or is_common_file(rp)]
    
    ru_only = [rp for fp, rp in all_files if is_russian_file(rp)]
    en_only = [rp for fp, rp in all_files if is_english_file(rp)]
    common = [rp for fp, rp in all_files if is_common_file(rp)]
    
    print(f"  🇷🇺 Русских: {len(ru_only)}")
    print(f"  🇬🇧 Английских: {len(en_only)}")
    print(f"  🌐 Общих: {len(common)}")
    
    # Создаем архивы
    print("\n📦 Создаю shukabase_data_multilingual.zip...")
    with zipfile.ZipFile(os.path.join(OUTPUT_DIR, "shukabase_data_multilingual.zip"), 'w', zipfile.ZIP_DEFLATED) as zf:
        for fp, rp in all_files:
            zf.write(fp, rp)
    
    print("📦 Создаю shukabase_data_ru.zip...")
    with zipfile.ZipFile(os.path.join(OUTPUT_DIR, "shukabase_data_ru.zip"), 'w', zipfile.ZIP_DEFLATED) as zf:
        for fp, rp in ru_files:
            zf.write(fp, rp)
    
    print("📦 Создаю shukabase_data_en.zip...")
    with zipfile.ZipFile(os.path.join(OUTPUT_DIR, "shukabase_data_en.zip"), 'w', zipfile.ZIP_DEFLATED) as zf:
            for fp, rp in en_files:
                zf.write(fp, rp)
    
    # Удаляем временную папку
    shutil.rmtree(TEMP_DIR)
    
    # Показываем результаты
    print("\n✅ Готово! Созданы архивы:")
    for name in ["shukabase_data_multilingual.zip", "shukabase_data_ru.zip", "shukabase_data_en.zip"]:
        path = os.path.join(OUTPUT_DIR, name)
        size = os.path.getsize(path) / (1024 * 1024)
        print(f"   📁 {name}: {size:.1f} MB")
    
    print(f"\n📂 Архивы находятся в папке: {os.path.abspath(OUTPUT_DIR)}")
    print("\n🚀 Следующий шаг: загрузи эти архивы на Google Drive и скопируй их ID")

if __name__ == "__main__":
    main()
