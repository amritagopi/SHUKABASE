import json
import os
from pathlib import Path
import re

def main():
    source_file = Path("rag/parsed_scriptures_ru.json")
    output_dir = Path("rag_graph_build/input")
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading {source_file}...")
    with open(source_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Loaded {len(data)} books/collections.")

    for book_code, book_data in data.items():
        if not isinstance(book_data, dict):
            print(f"Skipping {book_code}: not a dict (type {type(book_data)})")
            continue

        book_content = []
        
        # Sort pages to keep logical order roughly
        # Keys are like "1/index.html", "10/index.html", "index.html"
        # Natural sort
        
        def natural_sort_key(s):
             return [int(c) if c.isdigit() else c for c in re.split(r'(\d+)', s)]
             
        sorted_pages = sorted(book_data.keys(), key=natural_sort_key)
        
        for page_path in sorted_pages:
            text = book_data[page_path]
            if not isinstance(text, str):
                continue
            if not text.strip():
                continue
                
            full_ref_id = f"{book_code}/{page_path}"
            book_content.append(f"--- SOURCE: {full_ref_id} ---\n{text}\n")
            
        if not book_content:
            print(f"Book {book_code} is empty, skipping.")
            continue
            
        safe_name = "".join([c for c in book_code if c.isalnum() or c in ('-', '_')])
        out_path = output_dir / f"{safe_name}.txt"
        
        print(f"Writing {safe_name} -> {out_path} ({len(book_content)} segments)")
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(book_content))

    print("Done export.")

if __name__ == "__main__":
    main()
