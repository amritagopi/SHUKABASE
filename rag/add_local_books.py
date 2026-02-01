import os
import re
import json
import shutil
from pathlib import Path

# CONFIGURATION
SOURCE_DIR = r"c:/Users/annac/shukabase-ai/доп книги для шуки/processed"

def clean_filename(filename):
    name = os.path.splitext(filename)[0]
    # Remove prefix like 421235852-
    name = re.sub(r'^\d+[-_]*', '', name)
    name = name.strip().replace(' ', '-')
    return name

def is_russian(text):
    return bool(re.search('[а-яА-Я]', text))

def clean_page_content(text):
    lines = text.split('\n')
    cleaned_lines = []
    
    noise_patterns = [
        r'email:', r'contact:', r'www\.', r'published and printed',
        r'© \d{4}', r'isbn:', r'first edition', r'bhaktivedanta vidyapitha',
        r'govardhan eco village', r'tulsi books', r'copyright',
        r'all rights reserved', r'no part of this publication',
        r'kindly correspond with', r'vidyapitha\.in', r'tulsibooks\.com',
        r'\+91 \d{5} \d{5}', r'Maharashtra, India', r'Mumbai - \d{6}',
        r'7\. K\. M\. Munshi marg', r'Girgaum Chowpatty',
        r'Email:', r'Contact:', r'Tel:', r'Phone:', r'Fax:',
        r'Distributed by', r'Printed at', r'For more details',
        r'Visit us at', r'Follow us on', r'Like us on',
        r'Copyright ©'
    ]
    
    procedural_footer = r'^[^a-zA-Zа-яА-Я0-9 ]{5,}$'

    generic_lines = [
        r'^Bhágavata Subodhini$', r'^Bhágavata-Subodhini$', r'^Gita Subodhini$', 
        r'^Caitanya Subodhini$', r'^Canto \d+ Overview$', r'^About BVVP$', 
        r'^About the Series$', r'^About This Edition$', r'^Acknowledgements$',
        r'^Contents$', r'^About Bhaktivedánta Vidyápitha$', r'^Srímad Bhágavatam$',
        r'^Canto \d+ At a Glance$', r'^Overview$', r'^Articles on Special Verses$',
        r'^Thematic Compilations$', r'^Appendix$', r'^Nomenclature$',
        r'^Introduction$', r'^Foreword$', r'^Preface$', r'^Title Page$',
        r'^Dedicated to$', r'^Dedication$', r'^Abbreviations$', r'^Guide to Transliteration$'
    ]

    for line in lines:
        l = line.strip()
        if not l:
            continue
            
        if re.fullmatch(r'(Page\s+)?\d+', l, re.IGNORECASE):
            continue

        is_noise = False
        for p in noise_patterns:
            if re.search(p, l, re.IGNORECASE):
                is_noise = True
                break
        if is_noise: continue
            
        for p in generic_lines:
            if re.fullmatch(p, l, re.IGNORECASE):
                is_noise = True
                break
        if is_noise: continue

        if re.search(procedural_footer, l) and len(l) > 10:
            if not any(c.isalpha() for c in l):
                continue

        alpha_count = sum(c.isalpha() for c in l)
        if len(l) > 8 and alpha_count / len(l) < 0.35:
            continue
            
        if len(l) < 3 and not l.isalnum():
             continue

        cleaned_lines.append(l)
        
    return "\n".join(cleaned_lines)

def detect_structure(paragraphs):
    """
    Attempts to detect structure in prose text.
    Returns a list of dicts: {'type': 'header'|'verse'|'text', 'content': str}
    """
    structured_content = []
    
    for p in paragraphs:
        p = p.strip()
        if not p: continue
        
        # Detection logic
        if re.match(r'^(Chapter|Canto|Text|Verse|Translation|Purport|Section)\s+\d+', p, re.IGNORECASE) or (len(p) < 60 and p.isupper()):
            structured_content.append({'type': 'header', 'content': p})
        elif re.match(r'^\d+(\.\d+)+', p): # Simple numbering 1.1.1
            structured_content.append({'type': 'verse', 'content': p})
        elif any(kw in p.lower() for kw in ['text', 'verse', 'translation']): # Explicit keywords
            structured_content.append({'type': 'verse', 'content': p})
        else:
            structured_content.append({'type': 'text', 'content': p})
            
    return structured_content

def generate_standard_html(title, paragraphs, current_page, total_pages, relative_base="../"):
    """
    Generates HTML mimicking the exact structure of Shukabase's existing books (e.g. bg, Iso).
    Includes Tailwind-like classes (em:*) and specific div structures.
    """
    
    # Navigation Links
    prev_link = f"{relative_base}{current_page - 1}/index.html" if current_page > 1 else "#"
    next_link = f"{relative_base}{current_page + 1}/index.html" if current_page < total_pages else "#"
    
    prev_button_class = "inline-flex font-sans items-center px-4 py-2 mr-4 text-base font-medium bg-vb-header-top bg-opacity-30 border border-vb-header-top border-opacity-30 rounded-lg hover:bg-opacity-50"
    next_button_class = "inline-flex font-sans items-center px-4 py-2 text-base font-medium bg-vb-header-top bg-opacity-30 border border-vb-header-top border-opacity-30 rounded-lg hover:bg-opacity-50"
    
    if prev_link == "#": prev_button_class += " opacity-50 cursor-not-allowed hidden"
    if next_link == "#": next_button_class += " opacity-50 cursor-not-allowed hidden"

    # SVG Icons
    arrow_left = '<svg class="mr-2" fill="currentColor" height="1em" stroke="currentColor" stroke-width="0" viewBox="0 0 448 512" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M257.5 445.1l-22.2 22.2c-9.4 9.4-24.6 9.4-33.9 0L7 273c-9.4-9.4-9.4-24.6 0-33.9L201.4 44.7c9.4-9.4 24.6-9.4 33.9 0l22.2 22.2c9.5 9.5 9.3 25-.4 34.3L136.6 216H424c13.3 0 24 10.7 24 24v32c0 13.3-10.7 24-24 24H136.6l120.5 114.8c9.8 9.3 10 24.8.4 34.3z"></path></svg>'
    arrow_right = '<svg class="ml-2" fill="currentColor" height="1em" stroke="currentColor" stroke-width="0" viewBox="0 0 448 512" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M190.5 66.9l22.2-22.2c9.4-9.4 24.6-9.4 33.9 0L441 239c9.4 9.4 9.4 24.6 0 33.9L246.6 467.3c-9.4 9.4-24.6 9.4-33.9 0l-22.2-22.2c-9.5-9.5-9.3-25 .4-34.3L311.4 296H24c-13.3 0-24-10.7-24-24v-32c0-13.3 10.7-24 24-24h287.4L190.9 101.2c-9.8-9.3-10-24.8-.4-34.3z"></path></svg>'

    html_parts = []
    html_parts.append("<main>")
    html_parts.append("<div>")
    
    # Title Section
    html_parts.append('<div class="em:mb-4 em:leading-8 em:text-base s-justify copy user-select-text">')
    html_parts.append(f'<h1 class="text-center em:leading-5 em:text-3xl em:mt-3 em:mb-3">{title}</h1>')
    html_parts.append('</div>')

    # Content
    structure = detect_structure(paragraphs)
    
    for item in structure:
        content = item['content']
        if item['type'] == 'header':
             html_parts.append(f'<div class="em:mb-4 em:leading-8 em:text-base s-justify copy user-select-text"><h2 class="text-center em:leading-5 em:text-xl font-bold em:mb-4">{content}</h2></div>')
        elif item['type'] == 'verse':
             html_parts.append(f'<div class="av-verse_text"><div class="em:mb-4 em:leading-8 em:text-base s-justify copy user-select-text"><div class="em:mb-4 em:leading-8 em:text-base text-center italic">{content}</div></div></div>')
        else:
             html_parts.append(f'<div class="em:mb-4 em:leading-8 em:text-base s-justify copy user-select-text"><div class="em:mb-4 em:leading-8 em:text-base s-justify">{content}</div></div>')

    html_parts.append("</div>")

    # Footer Navigation
    html_parts.append(f'<div class="mt-10 flex justify-between">')
    html_parts.append(f'<a class="{prev_button_class}" href="{prev_link}">{arrow_left}Prev Page</a>')
    html_parts.append(f'<a class="{next_button_class}" href="{next_link}">Next Page{arrow_right}</a>')
    html_parts.append('</div>')

    html_parts.append("</main>")
    
    return "\n".join(html_parts)

def process_books():
    print("="*70)
    print("MATCHING LIBRARY AESTHETICS - PROCESSING BOOKS")
    print("="*70)
    
    if not os.path.exists(SOURCE_DIR):
        print(f"ERROR: Source directory {SOURCE_DIR} not found.")
        return

    files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith('.txt')]
    print(f"Found {len(files)} books to process.")

    parsed_jsons = {
        'ru': "rag/parsed_scriptures_ru.json",
        'en': "rag/parsed_scriptures_en.json"
    }
    
    data = {}
    for lang, path in parsed_jsons.items():
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                data[lang] = json.load(f)
        else:
            data[lang] = {}

    processed_ids = set()

    for filename in sorted(files): # Sort to be deterministic
        # Check for duplicates based on clean filename
        book_id = clean_filename(filename)
        if book_id in processed_ids:
            print(f"Skipping duplicate: {filename} (ID: {book_id})")
            continue
        processed_ids.add(book_id)

        file_path = os.path.join(SOURCE_DIR, filename)
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                full_content = f.read()
        except Exception as e:
            print(f"  FAILED to read {filename}: {e}")
            continue

        lang = 'ru' if is_russian(full_content[:15000]) else 'en'
        public_dir = f"public/books/{lang}"
        
        print(f"  [{lang.upper()}] Converting: {book_id}")

        raw_pages = full_content.split('\f')
        if len(raw_pages) < 5:
            lines = [l.strip() for l in full_content.split('\n') if l.strip()]
            raw_pages = ["\n".join(lines[i:i+60]) for i in range(0, len(lines), 60)]

        # PRE-FILTER PAGES to get accurate total count for navigation
        clean_pages_list = []
        in_front_matter = True
        
        for i, raw_page in enumerate(raw_pages):
            cleaned = clean_page_content(raw_page)
            if not cleaned or len(cleaned) < 60:
                continue
                
            if in_front_matter and i < 25:
                if any(kw in cleaned.upper() for kw in ['CONTENTS', 'TABLE OF CONTENTS', 'СОДЕРЖАНИЕ', 'ABOUT THE AUTHOR', 'COPYRIGHT']):
                    continue
                if any(kw in cleaned.upper() for kw in ['CHAPTER 1', 'ГЛАВА 1', 'INTRODUCTION', 'ПРЕДИСЛОВИЕ', 'TEXT 1']):
                    in_front_matter = False
            
            clean_pages_list.append(cleaned)

        total_pages = len(clean_pages_list)
        if total_pages == 0:
            print(f"    WARNING: No valid pages found for {book_id}")
            continue

        book_data = {}
        book_public_dir = Path(public_dir) / book_id
        if book_public_dir.exists():
            shutil.rmtree(book_public_dir)
        book_public_dir.mkdir(parents=True, exist_ok=True)

        for idx, page_content in enumerate(clean_pages_list):
            page_num = idx + 1
            rel_path = f"{page_num}/index.html"
            
            # Save for RAG
            book_data[rel_path] = page_content
            
            # Save HTML
            page_dir = book_public_dir / str(page_num)
            page_dir.mkdir(exist_ok=True)
            
            paras = [p.strip() for p in page_content.split('\n') if p.strip()]
            
            html_content = generate_standard_html(
                title=f"{book_id.replace('-', ' ')} - Page {page_num}",
                paragraphs=paras,
                current_page=page_num,
                total_pages=total_pages,
                relative_base="../"
            )
            
            with open(page_dir / "index.html", "w", encoding="utf-8") as f:
                f.write(html_content)

        data[lang][book_id] = book_data
        print(f"     -> Generated {total_pages} pages")

    # Save databases
    for lang, path in parsed_jsons.items():
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data[lang], f, ensure_ascii=False, indent=2)
        print(f"Database {path} updated.")

    print("\nSUCCESS: Library unified.")

if __name__ == "__main__":
    process_books()
