import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from rag.rag_engine import RAGEngine

@pytest.fixture
def mock_engine(mocker):
    mocker.patch('rag.rag_engine.genai.Client')
    engine = RAGEngine(languages=['ru', 'en'])
    engine._get_embedding = MagicMock(side_effect=lambda texts, **kwargs: np.array([[0.1] * 768] * len(texts), dtype='float32'))
    
    mock_idx_ru = MagicMock()
    mock_idx_ru.search.return_value = (np.array([[0.1]]), np.array([[0]])) 
    mock_idx_ru.ntotal = 100
    
    mock_idx_en = MagicMock()
    mock_idx_en.search.return_value = (np.array([[0.1]]), np.array([[0]]))
    mock_idx_en.ntotal = 100
    
    engine.indices = {'ru': mock_idx_ru, 'en': mock_idx_en}
    
    # Для дедупликации используем разные главы в тесте на объединение результатов
    engine.metadata = {
        'ru': [{'book': 'sb', 'chapter': '1.1.1', 'chunk_idx': 0, 'text_preview': 'RU Verse'}],
        'en': [{'book': 'sb', 'chapter': '1.1.2', 'chunk_idx': 0, 'text_preview': 'EN Verse'}]
    }
    
    engine._get_text_from_meta = MagicMock(side_effect=lambda meta, lang: meta['text_preview'] if meta else "")
    return engine

def test_query_expansion_translation(mock_engine):
    query = "душа"
    mock_engine._translate_query = MagicMock(return_value="soul")
    results = mock_engine.search(query, language='ru', expand_query=True, multilingual=True)
    assert "soul" in results['query_variants']

def test_multilingual_results_combined(mock_engine):
    query = "test"
    mock_engine._translate_query = MagicMock(return_value="тест")
    results = mock_engine.search(query, language='ru', multilingual=True, top_k=5)
    texts = [r['text'] for r in results['results']]
    # Здесь 1.1.1 и 1.1.2 не дедуплицируются
    assert "RU Verse" in texts
    assert "EN Verse" in texts

def test_content_linking(mock_engine):
    query = "test"
    mock_engine._translate_query = MagicMock(return_value="тест")
    
    # Для теста линковки возвращаем одинаковые главы
    mock_engine.metadata['en'] = [{'book': 'sb', 'chapter': '1.1.1', 'chunk_idx': 0, 'text_preview': 'EN Verse'}]
    
    mock_engine.indices['ru'].search.return_value = (np.array([[0.1]]), np.array([[0]]))
    mock_engine.indices['en'].search.return_value = (np.array([[10.0]]), np.array([[-1]]))
    
    results = mock_engine.search(query, language='ru', multilingual=True)
    
    target_res = next((r for r in results['results'] if r.get('book') == 'sb' and r.get('lang') == 'ru'), None)
    
    assert target_res is not None
    assert 'translation' in target_res
    assert target_res['translation'] is not None
    assert target_res['translation']['text'] == 'EN Verse'
