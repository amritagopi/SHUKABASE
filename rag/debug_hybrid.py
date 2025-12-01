
import os
import sys
import logging
from pathlib import Path

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.rag_engine import RAGEngine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_hybrid():
    print("--- Starting Debug ---")
    
    # Initialize Engine
    try:
        engine = RAGEngine(languages=['ru'])
    except Exception as e:
        print(f"Failed to init engine: {e}")
        return

    # Check Data Loading
    print(f"\n--- Data Status ---")
    if 'ru' in engine.chunked_data:
        print(f"Chunked Data (ru): {len(engine.chunked_data['ru'])} books loaded")
    else:
        print("Chunked Data (ru): NOT LOADED")

    if 'ru' in engine.bm25_indices:
        print(f"BM25 Index (ru): Loaded")
        # Access the corpus size if possible, or just assume it's there
        print(f"BM25 Corpus Size: {engine.bm25_indices['ru'].corpus_size}")
    else:
        print("BM25 Index (ru): NOT LOADED")

    # Test Query
    query = "Кришна"
    print(f"\n--- Testing Query: '{query}' ---")
    
    # 1. Test Tokenization
    tokens = engine._tokenize(query, 'ru')
    print(f"Tokens: {tokens}")
    
    # 2. Test BM25 Direct
    print(f"\n--- BM25 Direct Search ---")
    bm25_results = engine._search_by_keyword(query, 'ru', top_k=5)
    for res in bm25_results:
        print(f"  [{res['score']:.4f}] {res['book']} {res['chapter']}:{res['chunk_idx']}")
        print(f"   Preview: {res['text'][:100]}...")

    # 3. Test Full Search
    print(f"\n--- Full Hybrid Search ---")
    results = engine.search(query, language='ru', top_k=5)
    
    if results['success']:
        print(f"Found {len(results['results'])} results")
        for res in results['results']:
            print(f"  [Final Score: {res.get('final_score', 0):.4f} | RRF: {res.get('score', 0):.4f}] {res['book']} {res['chapter']}")
            print(f"   Source: {res.get('source', 'unknown')}")
    else:
        print(f"Search failed: {results.get('error')}")

if __name__ == "__main__":
    test_hybrid()
