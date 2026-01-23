import os
import json
import shutil
import re

SOURCE_DIR = r"c:/Users/annac/shukabase-ai/доп книги для шуки"
PARSED_JSON_RU = "rag/parsed_scriptures_ru.json"
PUBLIC_BOOKS_RU = "public/books/ru"

def clean_filename(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r'^\d+[-_]*', '', name)
    name = name.strip().replace(' ', '-')
    return name

def cleanup_ru():
    if not os.path.exists(PARSED_JSON_RU):
        print("RU JSON not found.")
        return

    with open(PARSED_JSON_RU, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith('.txt')]
    ids_to_remove = [clean_filename(f) for f in files]
    
    removed_count = 0
    for book_id in ids_to_remove:
        if book_id in data:
            del data[book_id]
            removed_count += 1
            # Also remove the folder in public/books/ru
            folder_path = os.path.join(PUBLIC_BOOKS_RU, book_id)
            if os.path.exists(folder_path):
                print(f"Removing folder: {folder_path}")
                shutil.rmtree(folder_path)
    
    with open(PARSED_JSON_RU, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f"Removed {removed_count} books from RU index and folders.")

if __name__ == "__main__":
    cleanup_ru()
