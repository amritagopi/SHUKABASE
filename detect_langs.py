import os
import re

SOURCE_DIR = r"c:/Users/annac/shukabase-ai/доп книги для шуки"

def is_russian(text):
    # Check for cyrillic characters
    return bool(re.search('[а-яА-Я]', text))

def detect_languages():
    files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith('.txt')]
    languages = {}
    
    for filename in files:
        file_path = os.path.join(SOURCE_DIR, filename)
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                # Read first 2000 chars to detect language
                sample = f.read(2000)
                if is_russian(sample):
                    languages[filename] = 'ru'
                else:
                    languages[filename] = 'en'
        except Exception as e:
            print(f"Error reading {filename}: {e}")
            
    print("Language Detection Results:")
    ru_count = 0
    en_count = 0
    for f, lang in languages.items():
        print(f" - {f}: {lang}")
        if lang == 'ru': ru_count += 1
        else: en_count += 1
        
    print(f"\nSummary: RU: {ru_count}, EN: {en_count}")
    return languages

if __name__ == "__main__":
    detect_languages()
