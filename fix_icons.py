from PIL import Image
import os

icons_dir = r"c:\Users\annac\shukabase-ai\src-tauri\icons"
files = ["installer_sidebar.bmp", "installer_header.bmp"]

for filename in files:
    path = os.path.join(icons_dir, filename)
    if os.path.exists(path):
        try:
            img = Image.open(path)
            # Convert to RGB (standard 24-bit) to ensure NSIS compatibility
            img = img.convert("RGB")
            img.save(path, "BMP")
            print(f"✅ Fixed {filename}")
        except Exception as e:
            print(f"❌ Error fixing {filename}: {e}")
    else:
        print(f"⚠️ File not found: {path}")
