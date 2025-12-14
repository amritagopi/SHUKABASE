import pytest
from unittest.mock import MagicMock
# Implementation details are mocked in conftest.py

def test_detect_verse_reference_bg(mock_rag_engine):
    """Test detection of Bhagavad Gita references."""
    engine = mock_rag_engine
    
    # Valid references
    assert engine._detect_verse_reference("bg 2.12") == {'book': 'bg', 'chapter': '2', 'verse': '12'}
    assert engine._detect_verse_reference("Bg 18.66") == {'book': 'bg', 'chapter': '18', 'verse': '66'}
    assert engine._detect_verse_reference("Gita 2:12") == {'book': 'bg', 'chapter': '2', 'verse': '12'}
    
    # Invalid references
    assert engine._detect_verse_reference("hello world") is None
    assert engine._detect_verse_reference("bg something") is None

def test_detect_verse_reference_sb(mock_rag_engine):
    """Test detection of Srimad Bhagavatam references."""
    engine = mock_rag_engine
    
    # Valid references
    assert engine._detect_verse_reference("SB 1.2.3") == {'book': 'sb', 'chapter': '1.2', 'verse': '3'}
    assert engine._detect_verse_reference("Bhagavatam 10.33.1") == {'book': 'sb', 'chapter': '10.33', 'verse': '1'}
    
def test_search_basic(mock_rag_engine):
    """Test basic search flow."""
    engine = mock_rag_engine
    
    # Setup mocks
    engine._get_embedding = MagicMock(return_value=[[0.1] * 768]) # Single embedding
    engine._search_by_vector = MagicMock(return_value=[
        {'index': 0, 'score': 0.9, 'text': 'Result 1', 'book': 'bg', 'chapter': '1', 'chunk_idx': 0}
    ])
    engine.reranker.model = None # Disable reranker for basic test
    
    result = engine.search("meaning of work", language="ru")
    
    assert result['success'] is True
    assert len(result['results']) > 0
    assert result['results'][0]['text'] == 'Result 1'

def test_search_error_handling(mock_rag_engine):
    """Test that search handles errors gracefully."""
    engine = mock_rag_engine
    
    # Force an error
    engine._get_embedding = MagicMock(side_effect=Exception("API Error"))
    
    result = engine.search("test query", language="ru")
    
    # Should probably return success: False or empty results depending on implementation logic
    # In rag_engine.py: catch Exception -> return {'success': False, 'error': ...}
    assert result['success'] is False
    assert "API Error" in result['error']
