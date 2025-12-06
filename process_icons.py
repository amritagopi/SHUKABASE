from PIL import Image
import os

# Paths
source_sidebar = r"C:/Users/annac/.gemini/antigravity/brain/0027a958-7279-4073-a7f0-e2ee99f5d428/installer_sidebar_1764994540393.png"
source_header = r"C:/Users/annac/.gemini/antigravity/brain/0027a958-7279-4073-a7f0-e2ee99f5d428/installer_header_1764994555025.png"

dest_sidebar = r"c:\Users\annac\shukabase-ai\src-tauri\icons\installer_sidebar.bmp"
dest_header = r"c:\Users\annac\shukabase-ai\src-tauri\icons\installer_header.bmp"

# NSIS Recommended Sizes
# Welcome/Finish page image
SIZE_SIDEBAR = (164, 314)
# Header image (for other pages)
SIZE_HEADER = (150, 57)

def process_image(src, dst, size):
    try:
        img = Image.open(src)
        # Resize/Crop to fit
        img = img.convert("RGB")
        img = img.resize(size, Image.Resampling.LANCZOS)
        img.save(dst, "BMP")
        print(f"Saved {dst}")
    except Exception as e:
        print(f"Error processing {src}: {e}")

if __name__ == "__main__":
    process_image(source_sidebar, dest_sidebar, SIZE_SIDEBAR)
    process_image(source_header, dest_header, SIZE_HEADER)
