import pytest
from unittest.mock import MagicMock, patch
from rag.rag_engine import RAGEngine

@pytest.fixture
def mock_engine(mocker):
    # Мокаем Gemini API
    mocker.patch('rag.rag_engine.genai.Client')
    engine = RAGEngine(languages=['ru', 'en'])
    # Мокаем метод получения эмбеддингов, чтобы возвращал фиксированные значения
    import numpy as np
    engine._get_embedding = MagicMock(side_effect=lambda texts, **kwargs: np.array([[0.1] * 768] * len(texts), dtype='float32'))
    
    # Мокаем индексы FAISS, чтобы они "находили" что-то
    mock_idx_ru = MagicMock()
    # Возвращаем 2 результата для RU (один попадет, один нет?)
    mock_idx_ru.search.return_value = (np.array([[0.1]]), np.array([[10]])) 
    mock_idx_ru.ntotal = 100
    
    mock_idx_en = MagicMock()
    mock_idx_en.search.return_value = (np.array([[0.1]]), np.array([[20]]))
    mock_idx_en.ntotal = 100
    
    engine.indices = {'ru': mock_idx_ru, 'en': mock_idx_en}
    
    # Мокаем метаданные
    engine.metadata = {
        'ru': [None] * 100,
        'en': [None] * 100
    }
    engine.metadata['ru'][10] = {'book': 'bg', 'chapter': '1', 'chunk_idx': 10, 'text_preview': 'RU match'}
    engine.metadata['en'][20] = {'book': 'en_bg', 'chapter': '1', 'chunk_idx': 20, 'text_preview': 'EN match'}
    
    # Мокаем _get_text_from_meta
    engine._get_text_from_meta = MagicMock(side_effect=lambda meta, lang: meta['text_preview'] if meta else "")
    
    return engine

def test_query_expansion_translation(mock_engine):
    """Проверяет, что запрос переводится и добавляется в варианты."""
    query = "душа"
    # Мокаем перевод
    mock_engine._translate_query = MagicMock(return_value="soul")
    
    results = mock_engine.search(query, language='ru', expand_query=True, multilingual=True)
    
    assert "soul" in results['query_variants']
    # Также проверим, что были обращения к обоим индексам
    assert mock_engine.indices['ru'].search.called
    assert mock_engine.indices['en'].search.called

def test_multilingual_results_combined(mock_engine):

    """Проверяет, что результаты из разных языков объединяются."""

    query = "test"

    mock_engine._translate_query = MagicMock(return_value="тест")

    

    # Делаем поиск

    results = mock_engine.search(query, language='ru', multilingual=True, top_k=5)

    

    # Выводим для отладки

    print(f"Results: {[r['text'] for r in results['results']]}")

    

    # Проверяем, что в результатах есть и RU, и EN

    texts = [r['text'] for r in results['results']]

    assert "RU match" in texts

    assert "EN match" in texts
