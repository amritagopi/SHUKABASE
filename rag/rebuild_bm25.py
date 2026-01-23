import sys
import os
import logging
from pathlib import Path

# Add project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.rag_engine import RAGEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def rebuild():
    print("="*70)
    print("BM25 INDEX REBUILDER")
    print("="*70)
    
    # Path to the rag directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Define languages to process
    langs = ['ru', 'en']
    
    # Delete old pkl files to force rebuild
    for lang in langs:
        pkl_path = os.path.join(base_dir, f"bm25_index_{lang}.pkl")
        if os.path.exists(pkl_path):
            print(f"Removing old BM25 index: {pkl_path}")
            os.remove(pkl_path)

    # Initialize RAGEngine. It will build BM25 indices automatically if they are missing.
    print("\nInitializing RAGEngine to trigger BM25 build...")
    engine = RAGEngine(base_dir=base_dir, languages=langs)
    
    print("\n" + "="*70)
    print("BM25 REBUILD COMPLETED!")
    print("="*70)

if __name__ == "__main__":
    rebuild()
