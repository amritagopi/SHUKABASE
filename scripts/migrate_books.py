import os
import shutil
import re

SOURCE_DIR = r"c:\Users\annac\shukabase-ai\доп книги для шуки"
TARGET_DIR = r"c:\Users\annac\shukabase-ai\public\books\ru"
DUPLICATES_DIR = os.path.join(SOURCE_DIR, "duplicates")
PROCESSED_DIR = os.path.join(SOURCE_DIR, "processed")

os.makedirs(DUPLICATES_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

def clean_filename(filename):
    # Remove extension
    name = os.path.splitext(filename)[0]
    
    # Remove RU_ prefix if present
    if name.startswith("RU_"):
        name = name[3:]
    
    # Remove leading digits and dash (e.g., "12345-")
    # Also handles "01-" or just "1-"
    name = re.sub(r'^\d+-\s*', '', name)
    
    # Remove (Z-Library) and similar suffixes
    name = re.sub(r'\s*\(.*?\)', '', name)
    
    # Trim whitespace
    name = name.strip()
    
    return name

def text_to_html(title, text):
    # Simple conversion of text to HTML paragraphs
    paragraphs = text.split('\n')
    html_paragraphs = []
    for p in paragraphs:
        p = p.strip()
        if p:
            html_paragraphs.append(f'<p class="mb-4">{p}</p>')
    
    content_html = "\n".join(html_paragraphs)
    
    return f"""<main>
    <div class="em:mb-4 em:leading-8 em:text-base s-justify copy user-select-text">
        <h1 class="text-center em:text-2xl em:mt-4 em:mb-4 xs:em:text-3xl sm:em:text-4xl font-bold">{title}</h1>
        <div class="content">
{content_html}
        </div>
    </div>
</main>"""

processed_count = 0
duplicate_count = 0

print(f"Scanning {SOURCE_DIR}...")

for filename in os.listdir(SOURCE_DIR):
    if not filename.endswith(".txt"):
        continue
        
    file_path = os.path.join(SOURCE_DIR, filename)
    clean_name = clean_filename(filename)
    
    # Special mapping for known Cyrillic titles to English codes if desired
    # For now, we keep the clean name (English or Cyrillic)
    # The clean name will be the folder name.
    
    target_folder = os.path.join(TARGET_DIR, clean_name)
    
    if os.path.exists(target_folder):
        print(f"[DUPLICATE] {clean_name} already exists. Moving to duplicates.")
        shutil.move(file_path, os.path.join(DUPLICATES_DIR, filename))
        duplicate_count += 1
    else:
        print(f"[PROCESSING] Creating {clean_name}")
        os.makedirs(target_folder, exist_ok=True)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
             # Fallback for other encodings if utf-8 fails
             with open(file_path, 'r', encoding='cp1251') as f:
                content = f.read()

        html_content = text_to_html(clean_name, content)
        
        with open(os.path.join(target_folder, "index.html"), 'w', encoding='utf-8') as f:
            f.write(html_content)
            
        shutil.move(file_path, os.path.join(PROCESSED_DIR, filename))
        processed_count += 1

print(f"Done. Processed: {processed_count}, Duplicates: {duplicate_count}")
