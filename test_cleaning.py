import re
import os
import sys

# Ensure UTF-8 output for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def clean_page(text):
    lines = text.split('\n')
    cleaned_lines = []
    
    # Noise patterns (case insensitive)
    noise_patterns = [
        r'email:', r'contact:', r'www\.', r'published and printed',
        r'© \d{4}', r'isbn:', r'first edition', r'bhaktivedanta vidyapitha',
        r'govardhan eco village', r'tulsi books', r'copyright',
        r'all rights reserved', r'no part of this publication',
        r'kindly correspond with', r'vidyapitha\.in', r'tulsibooks\.com',
        r'\+91 \d{5} \d{5}', r'Maharashtra, India', r'Mumbai - \d{6}'
    ]
    
    # Page header/footer patterns to remove (specifically for these books)
    book_specific_headers = [
        r'Bhágavata Subodhini', r'Bhágavata-Subodhini', r'Gita Subodhini', r'Caitanya Subodhini',
        r'Canto \d+ Overview', r'About BVVP', r'About the Series', r'About This Edition',
        r'Acknowledgements', r'Contents', r'About Bhaktivedánta Vidyápitha'
    ]

    for line in lines:
        l = line.strip()
        if not l:
            continue
            
        # 1. Skip if it matches any major noise pattern
        is_noise = False
        for p in noise_patterns:
            if re.search(p, l, re.IGNORECASE):
                is_noise = True
                break
        if is_noise:
            continue
            
        # 2. Skip if it's a known header/footer
        for p in book_specific_headers:
            if re.fullmatch(p, l, re.IGNORECASE):
                is_noise = True
                break
        if is_noise:
            continue

        # 3. Skip OCR artifacts (weird characters, too many non-alphas)
        alpha_count = sum(c.isalpha() for c in l)
        if len(l) > 10 and alpha_count / len(l) < 0.4:
            continue
            
        # 4. Skip lines that are just symbols or punctuation
        if re.fullmatch(r'[^a-zA-Zа-яА-Я0-9 ]+', l):
            continue

        cleaned_lines.append(l)
        
    return "\n".join(cleaned_lines)

def test():
    file_path = r"c:/Users/annac/shukabase-ai/доп книги для шуки/421235852-Bhagavata-Subodhini-1-2.txt"
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        full_text = f.read()
    
    # Try splitting by form feed
    pages = full_text.split('\f')
    if len(pages) < 10: # Fallback if no form feeds
        pages = [full_text[i:i+3000] for i in range(0, len(full_text), 3000)]
    
    print(f"Total pages: {len(pages)}")
    
    for i in range(min(20, len(pages))):
        cleaned = clean_page(pages[i])
        if cleaned:
            print(f"--- PAGE {i+1} CLEANED ---")
            print(cleaned[:500])
            print("------------------------")
        else:
            print(f"--- PAGE {i+1} SKIPPED (empty or noise) ---")

if __name__ == "__main__":
    test()
