import os
import shutil
import glob
from pathlib import Path

# Configuration
JUNK_DIRS = [
    "NOD-ANSWERS-1-54", 
    "Bhakti-Shastri-Student-Handbook",
    "Bhakti-pravesa-Students-Handbook",
    "Complete-Study-Guide-for-Nectar-of-Devotion",
    "Comprehensive-Isopanisad-Notes"
]

RAG_ARTIFACT_PATTERNS = [
    "rag/faiss_index_*.bin",
    "rag/chunked_scriptures_*.json",
    "rag/parsed_scriptures_*.json",
    "rag/embeddings_*.npz",
    "rag/embeddings_metadata_*.json",
    "rag/faiss_metadata_*.json"
]

PUBLIC_BOOKS_DIR = Path("public/books")

def clean_junk_books():
    print("="*60)
    print("CLEANING JUNK BOOKS")
    print("="*60)
    
    count = 0
    for lang in ["ru", "en"]:
        lang_dir = PUBLIC_BOOKS_DIR / lang
        if not lang_dir.exists():
            continue
            
        for item in os.listdir(lang_dir):
            # Check if item matches any junk pattern (startswith)
            is_junk = False
            for junk in JUNK_DIRS:
                if item.startswith(junk):
                    is_junk = True
                    break
            
            if is_junk:
                full_path = lang_dir / item
                if full_path.is_dir():
                    print(f"  [DELETE] {full_path}")
                    try:
                        shutil.rmtree(full_path)
                        count += 1
                    except Exception as e:
                        print(f"    Error deleting {item}: {e}")

    print(f"\nDeleted {count} junk directories.")

def clean_rag_artifacts():
    print("\n" + "="*60)
    print("CLEANING OLD RAG ARTIFACTS")
    print("="*60)
    
    count = 0
    for pattern in RAG_ARTIFACT_PATTERNS:
        # Use glob to find files matching pattern
        files = glob.glob(pattern)
        for f in files:
            print(f"  [DELETE] {f}")
            try:
                os.remove(f)
                count += 1
            except Exception as e:
                print(f"    Error deleting {f}: {e}")
                
    print(f"\nDeleted {count} RAG artifacts.")

if __name__ == "__main__":
    clean_junk_books()
    clean_rag_artifacts()
    print("\n✅ CLEANUP COMPLETE.")
