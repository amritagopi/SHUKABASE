import pytest
import sys
import os
from unittest.mock import MagicMock

# Add the project root to sys.path so we can import 'rag'
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

@pytest.fixture
def mock_genai(mocker):
    """Mocks google.generativeai module."""
    mock = mocker.patch('google.generativeai.embed_content')
    mock.return_value = {'embedding': [0.1] * 768}
    return mock

@pytest.fixture
def mock_faiss(mocker):
    """Mocks faiss module."""
    mock_index = MagicMock()
    mock_index.ntotal = 100
    mock_index.search.return_value = ([[0.1, 0.2]], [[0, 1]]) # distances, indices
    
    mocker.patch('faiss.read_index', return_value=mock_index)
    
    # Also patch the IndexIVFFlat or whatever is used if instantiated directly
    # But rag_engine uses faiss.read_index mostly.
    return mock_index

@pytest.fixture
def mock_reranker(mocker):
    """Mocks the RerankerModel internally used or imported."""
    # We essentially want to mock transformers inside rag_engine or the RerankerModel class
    pass

@pytest.fixture
def sample_metadata():
    return [
        {
            'book': 'bg',
            'chapter': '1',
            'chunk_idx': 0,
            'text_preview': 'Chapter 1 Verse 1 Text',
            'html_path': 'bg/1/1.html'
        },
        {
            'book': 'bg',
            'chapter': '2',
            'chunk_idx': 0,
            'text_preview': 'Chapter 2 Verse 5 Text',
            'html_path': 'bg/2/5.html'
        }
    ]

@pytest.fixture
def mock_rag_engine(mocker, sample_metadata, mock_faiss, mock_genai):
    """Creates a RAGEngine instance with mocked dependencies."""
    # Patch dependencies globally for the module
    mocker.patch('rag.rag_engine.RerankerModel') # Mock the RerankerModel class
    
    # We need to ensure that when RAGEngine loads data, it uses our mocks
    # It tries to read files. We should mock those file reads or the methods that use them.
    
    mocker.patch('builtins.open', mocker.mock_open(read_data='{}'))
    mocker.patch('pickle.load', return_value=MagicMock()) # for BM25
    mocker.patch('json.load', return_value=[]) # for generic json
    
    # Specifically for metadata loading, we want to inject our sample data
    # rag_engine._load_language_data calls json.load.
    # It might be easier to instantiate the engine and then manually set the data attributes
    # effectively bypassing the _load_language_data complexity for unit tests.
    
    from rag.rag_engine import RAGEngine
    
    # Patch _load_language_data to do nothing
    mocker.patch.object(RAGEngine, '_load_language_data')
    
    engine = RAGEngine(languages=['ru'])
    
    # Manually hydrate
    engine.metadata['ru'] = sample_metadata
    engine.indices['ru'] = mock_faiss
    # engine.bm25_indices['ru'] = ...
    
    return engine
