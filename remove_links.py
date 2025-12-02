import os
import re
from bs4 import BeautifulSoup

def remove_vedabase_links(directory):
    count = 0
    files_modified = 0
    
    print(f"🚀 Начинаю очистку ссылок в: {directory}")
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".html"):
                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Используем BeautifulSoup для парсинга HTML
                    soup = BeautifulSoup(content, 'html.parser')
                    
                    links_found = False
                    
                    # Ищем все ссылки
                    for a_tag in soup.find_all('a', href=True):
                        # Проверяем, ведет ли ссылка на vedabase.io
                        if 'vedabase.io' in a_tag['href']:
                            # Заменяем тег <a> на его содержимое (текст)
                            a_tag.unwrap()
                            count += 1
                            links_found = True
                    
                    if links_found:
                        # Сохраняем изменения
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(str(soup))
                        files_modified += 1
                        # print(f"✅ Исправлен файл: {file_path}")
                        
                except Exception as e:
                    print(f"❌ Ошибка при обработке {file_path}: {e}")

    print(f"\n✨ Готово! Удалено {count} ссылок в {files_modified} файлах.")

if __name__ == "__main__":
    # Путь к папке с книгами
    books_dir = os.path.join(os.getcwd(), "public", "books")
    
    if os.path.exists(books_dir):
        remove_vedabase_links(books_dir)
    else:
        print(f"❌ Папка не найдена: {books_dir}")
