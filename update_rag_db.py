import os
import sys
import shutil
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# Add rag directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'rag'))

try:
    import chunk_splitter
    import embeddings_generator
    import faiss_indexer
    import rebuild_bm25
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

def main():
    print("="*80)
    print("  RAG DATABASE UPDATER")
    print("="*80)
    print("This script will:")
    print("1. Re-chunk all books from parsed_scriptures_*.json")
    print("2. Re-generate embeddings using Google Gemini API (WARNING: Costs/Quota applies)")
    print("3. Re-build FAISS vector indices")
    print("4. Re-build BM25 keyword indices")
    print("-" * 80)
    
    confirm = input("Are you sure you want to proceed? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Aborted.")
        return

    rag_dir = Path("rag")
    languages = ['ru', 'en']

    # 1. CLEANUP STALE FILES
    print("\n[1/5] Cleaning up old index files...")
    files_to_remove = []
    
    for lang in languages:
        files_to_remove.extend([
            rag_dir / f"chunked_scriptures_{lang}.json",
            rag_dir / f"faiss_index_{lang}.bin",
            rag_dir / f"faiss_metadata_{lang}.json",
            rag_dir / f"bm25_index_{lang}.pkl",
            # We enforce removing embeddings to ensure we pick up new content definitively,
            # though embeddings_generator overwrites, explicitly deleting avoids confusion.
            # However, if user wants to keep cache, they can't.
            # Given the request is to "add new books", we assume full rebuild.
            rag_dir / f"embeddings_{lang}.npz",
            rag_dir / f"embeddings_metadata_{lang}.json",
        ])

    for f in files_to_remove:
        if f.exists():
            try:
                os.remove(f)
                print(f"  Deleted: {f.name}")
            except Exception as e:
                print(f"  Error deleting {f.name}: {e}")

    # 2. RUN CHUNK SPLITTER
    print("\n[2/5] Running Chunk Splitter...")
    try:
        chunk_splitter.process_all_languages()
    except Exception as e:
        print(f"Error in Chunk Splitter: {e}")
        return

    # 3. RUN EMBEDDINGS GENERATOR
    print("\n[3/5] Running Embeddings Generator (Gemini API)...")
    try:
        embeddings_generator.process_all_languages()
    except Exception as e:
        print(f"Error in Embeddings Generator: {e}")
        return

    # 4. RUN FAISS INDEXER
    print("\n[4/5] Running FAISS Indexer...")
    try:
        faiss_indexer.process_all_languages()
    except Exception as e:
        print(f"Error in FAISS Indexer: {e}")
        return

    # 5. RUN BM25 REBUILDER
    print("\n[5/5] Rebuilding BM25 Index...")
    try:
        rebuild_bm25.rebuild()
    except Exception as e:
        print(f"Error in BM25 Rebuilder: {e}")
        return

    print("\n" + "="*80)
    print("SUCCESS: RAG Database Updated!")
    print("="*80)

if __name__ == "__main__":
    main()
