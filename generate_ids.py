import os
import re

source_dir = r'c:/Users/annac/shukabase-ai/доп книги для шуки'
files = [f for f in os.listdir(source_dir) if f.endswith('.txt')]
ids = []

for f in files:
    name = os.path.splitext(f)[0]
    name = re.sub(r'^\d+[-_]*', '', name)
    name = name.strip().replace(' ', '-')
    ids.append(name)

print('--- BOOK_MAP ENTRIES ---')
for i in ids:
    print(f"    '{i}': '{i}',")

print('\n--- TRANSLATIONS ENTRIES ---')
for i in ids:
    title = i.replace('-', ' ')
    print(f'            "{i}": "{title}",')
