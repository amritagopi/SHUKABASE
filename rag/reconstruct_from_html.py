
import os
import re
import json
from pathlib import Path

# CONFIGURATION
PUBLIC_BOOKS_DIR = Path("public/books")
PARSED_JSON_TEMPLATE = "rag/parsed_scriptures_{}.json"

def clean_html_tags(text):
    """Removes HTML tags and cleans up whitespace."""
    # Remove scripts and styles
    text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.DOTALL)
    text = re.sub(r'<style.*?>.*?</style>', '', text, flags=re.DOTALL)
    
    # Replace <br> and <p> with newlines
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'</p>', '\n', text)
    text = re.sub(r'</div>', '\n', text)
    
    # Remove remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Fix entities (basic ones)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    
    # Normalize whitespace
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    return '\n'.join(lines)

def extract_content_from_html(html_content):
    """Extracts text from the main content area of the HTML."""
    
    # 1. Find <main> content
    main_match = re.search(r'<main>(.*?)</main>', html_content, re.DOTALL)
    if not main_match:
        return ""
    
    main_content = main_match.group(1)
    
    # 2. Remove the footer navigation div (last div with flex justify-between)
    # The footer usually looks like: <div class="mt-10 flex justify-between">...</div>
    # We'll rely on the specific class "mt-10 flex justify-between" seen in the example
    main_content = re.sub(r'<div class="mt-10 flex justify-between">.*?</div>', '', main_content, flags=re.DOTALL)
    
    # 3. Clean tags
    text = clean_html_tags(main_content)
    
    return text

def reconstruct_database():
    print("="*60)
    print("RECONSTRUCTING RAG DATABASE FROM HTML")
    print("="*60)
    
    for lang in ["ru", "en"]:
        lang_dir = PUBLIC_BOOKS_DIR / lang
        if not lang_dir.exists():
            print(f"Skipping {lang}: directory not found.")
            continue
            
        print(f"\nProcessing language: {lang.upper()}")
        book_data = {}
        
        # Iterate over books (directories)
        for book_name in os.listdir(lang_dir):
            book_path = lang_dir / book_name
            if not book_path.is_dir():
                continue
                
            print(f"  Parsing book: {book_name}")
            book_data[book_name] = {}
            
            # Walk through the book directory to find index.html files
            for root, dirs, files in os.walk(book_path):
                for file in files:
                    if file.lower() == "index.html":
                        full_path = Path(root) / file
                        
                        # Calculate relative path from book root: e.g. "1/index.html"
                        try:
                            rel_path = full_path.relative_to(book_path).as_posix()
                        except ValueError:
                            continue
                            
                        try:
                            with open(full_path, "r", encoding="utf-8") as f:
                                html_content = f.read()
                                
                            text_content = extract_content_from_html(html_content)
                            
                            if text_content and len(text_content) > 50: # Filter empty pages
                                book_data[book_name][rel_path] = text_content
                                
                        except Exception as e:
                            print(f"    Error reading {rel_path}: {e}")

        # Save to JSON
        output_file = PARSED_JSON_TEMPLATE.format(lang)
        try:
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(book_data, f, ensure_ascii=False, indent=2)
            
            total_books = len(book_data)
            total_pages = sum(len(pages) for pages in book_data.values())
            print(f"✅ Saved {output_file}: {total_books} books, {total_pages} pages.")
            
        except Exception as e:
             print(f"❌ Error saving {output_file}: {e}")

if __name__ == "__main__":
    reconstruct_database()
