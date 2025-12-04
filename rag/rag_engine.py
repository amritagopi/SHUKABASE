"""
🧠 RAG ENGINE - Векторный поиск с Re-ranking для Shukabase

Этот модуль предоставляет:
1. Векторный поиск с использованием Google Gemini API
2. FAISS индексирование для быстрого поиска
3. Re-ranking с помощью Jina Reranker
4. Переформулировка запросов с синонимами
"""

import json
import numpy as np
import pickle
from pathlib import Path
from typing import List, Dict, Tuple, Any
import logging
import os
import time
import re

# Управление зависимостями
try:
    import faiss
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch
    import google.generativeai as genai
    from dotenv import load_dotenv
    from rank_bm25 import BM25Okapi
    from nltk.stem import SnowballStemmer
except ImportError as e:
    raise ImportError(
        f"Отсутствует зависимость: {e}. "
        "Установите необходимые пакеты: pip install faiss-cpu transformers torch google-generativeai python-dotenv rank_bm25 nltk"
    )

logger = logging.getLogger(__name__)

# --- Вспомогательные классы (QueryExpander, RerankerModel) без изменений ---

import difflib

class QueryExpander:
    """Расширение и переформулировка запросов с поддержкой нечеткого поиска"""
    
    SYNONYMS_RU = {
        "любовь": ["преданность", "бхакти", "дружба", "привязанность", "prema"],
        "бог": ["кришна", "верховный", "абсолют", "божество", "вишну", "нараяна", "господь"],
        "душа": ["атма", "дух", "сознание", "сущность", "джива"],
        "знание": ["джняна", "мудрость", "понимание", "осознание", "веда"],
        "йога": ["практика", "медитация", "дисциплина", "путь", "садхана"],
        "карма": ["действие", "деяние", "следствие", "судьба", "кармический"],
        "освобождение": ["мокша", "спасение", "свобода", "выход", "нирвана"],
        "мир": ["материальный", "вселенная", "временный", "преходящий", "майя", "иллюзия"],
        "гуна": ["качество", "свойство", "природа", "саттва", "раджас", "тамас"],
        "преданный": ["вайшнав", "бхакта", "слуга", "садху"],
        "учитель": ["гуру", "наставник", "ачарья", "свами", "прабхупада"]
    }
    
    SYNONYMS_EN = {
        "love": ["devotion", "bhakti", "affection", "attachment", "prema"],
        "god": ["krishna", "supreme", "absolute", "deity", "vishnu", "narayana", "lord"],
        "soul": ["atma", "spirit", "consciousness", "essence", "jiva"],
        "knowledge": ["jnana", "wisdom", "understanding", "realization", "veda"],
        "yoga": ["practice", "meditation", "discipline", "path", "sadhana"],
        "karma": ["action", "deed", "consequence", "fate"],
        "liberation": ["moksha", "salvation", "freedom", "release", "nirvana"],
        "world": ["material", "universe", "temporary", "transient", "maya", "illusion"],
        "mode": ["guna", "quality", "nature", "sattva", "rajas", "tamas"],
        "devotee": ["vaishnava", "bhakta", "servant", "sadhu"],
        "teacher": ["guru", "master", "acharya", "swami", "prabhupada"]
    }
    
    @staticmethod
    def _fuzzy_find(term: str, collection: List[str], cutoff: float = 0.8) -> List[str]:
        return difflib.get_close_matches(term, collection, n=1, cutoff=cutoff)

    @staticmethod
    def expand_query_ru(query: str) -> List[str]:
        expanded = {query}
        query_words = query.lower().split()
        
        for word in query_words:
            # 1. Check keys
            for key, synonyms in QueryExpander.SYNONYMS_RU.items():
                # Direct or fuzzy match with key
                if key == word or QueryExpander._fuzzy_find(word, [key]):
                    expanded.add(key)
                    expanded.update(synonyms)
                
                # 2. Check values (synonyms)
                # Direct or fuzzy match with any synonym
                if word in synonyms or QueryExpander._fuzzy_find(word, synonyms):
                    expanded.add(key)
                    expanded.update(synonyms)
                    
        return list(expanded)[:5] # Limit to 5 variations to avoid token explosion
    
    @staticmethod
    def expand_query_en(query: str) -> List[str]:
        expanded = {query}
        query_words = query.lower().split()
        
        for word in query_words:
            # 1. Check keys
            for key, synonyms in QueryExpander.SYNONYMS_EN.items():
                if key == word or QueryExpander._fuzzy_find(word, [key]):
                    expanded.add(key)
                    expanded.update(synonyms)
                
                # 2. Check values
                if word in synonyms or QueryExpander._fuzzy_find(word, synonyms):
                    expanded.add(key)
                    expanded.update(synonyms)
                    
        return list(expanded)[:5]


class RerankerModel:
    """Модель re-ranking для переоценки релевантности"""
    
    def __init__(self, model_name: str = "jinaai/jina-reranker-v2-base-multilingual"):
        logger.info(f"Загружаю модель re-ranking: {model_name}")
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
            self.model = AutoModelForSequenceClassification.from_pretrained(
                model_name, trust_remote_code=True, torch_dtype=torch.float32
            )
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model.to(self.device)
            self.model.eval()
            logger.info(f"✅ Модель re-ranking загружена (device: {self.device})")
        except Exception as e:
            logger.error(f"❌ Ошибка загрузки модели re-ranking: {e}")
            self.model = None
    
    def rerank(self, query: str, documents: List[str], top_k: int = 5) -> List[Tuple[int, float, str]]:
        if not self.model or not documents:
            return [(i, 1.0, doc) for i, doc in enumerate(documents)][:top_k]
        try:
            with torch.no_grad():
                inputs = self.tokenizer(
                    [[query, doc] for doc in documents],
                    padding=True, truncation=True, return_tensors="pt", max_length=512
                ).to(self.device)
                scores = self.model(**inputs, return_dict=True).logits.squeeze(-1).cpu().numpy()
            
            ranked = sorted([(i, score, documents[i]) for i, score in enumerate(scores)], key=lambda x: x[1], reverse=True)
            return ranked[:top_k]
        except Exception as e:
            logger.error(f"Ошибка при re-ranking: {e}")
            return [(i, 1.0, doc) for i, doc in enumerate(documents)][:top_k]


# --- Обновленный RAGEngine ---

class RAGEngine:
    """Главный класс RAG системы с Google Gemini API"""
    
    def __init__(
        self,
        reranker_model: str = "jinaai/jina-reranker-v2-base-multilingual",
        languages: List[str] = ['ru', 'en'],
        base_dir: str = "rag"
    ):
        logger.info("🚀 Инициализирую RAG Engine...")
        
        self._configure_gemini_api()
        
        self.base_dir = Path(base_dir)
        self.embedding_model_name = "models/text-embedding-004"
        self.languages = languages
        
        self.reranker = RerankerModel(reranker_model)
        
        self.stemmers = {
            'ru': SnowballStemmer('russian'),
            'en': SnowballStemmer('english')
        }
        
        self.indices: Dict[str, faiss.Index] = {}
        self.bm25_indices: Dict[str, Any] = {}
        self.metadata: Dict[str, Any] = {}
        self.chunked_data: Dict[str, Dict] = {}
        
        for lang in languages:
            self._load_language_data(lang)
        
        logger.info("✅ RAG Engine готов к работе!")

    def _configure_gemini_api(self):
        """Загружает и настраивает ключ API для Gemini."""
        load_dotenv()
        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("Переменная окружения GEMINI_API_KEY не найдена.")
        try:
            genai.configure(api_key=api_key)
            logger.info("✅ Ключ Gemini API успешно сконфигурирован.")
        except Exception as e:
            raise RuntimeError(f"❌ Ошибка при конфигурации Gemini API: {e}")

    def _load_language_data(self, language: str):
        """Загружает индекс, метаданные и чанки для указанного языка."""
        index_file = self.base_dir / f"faiss_index_{language}.bin"
        metadata_file = self.base_dir / f"faiss_metadata_{language}.json"
        chunks_file = self.base_dir / f"chunked_scriptures_{language}.json"

        if not index_file.exists():
            logger.warning(f"⚠️ Индекс FAISS не найден: {index_file}")
            return
            
        logger.info(f"📂 Загружаю данные для языка '{language}'...")
        self.indices[language] = faiss.read_index(str(index_file))
        logger.info(f"  - Загружено {self.indices[language].ntotal:,} векторов из {index_file}")

        if metadata_file.exists():
            with open(metadata_file, 'r', encoding='utf-8') as f:
                raw_metadata = json.load(f)
            
            # Flatten metadata to match FAISS indices
            flat_metadata = []
            structure = raw_metadata.get('structure', {})
            
            # Collect all chapters
            all_chapters = []
            for book_key, book_data in structure.items():
                for chapter_key, chapter_data in book_data.items():
                    if 'embedding_key' in chapter_data:
                        all_chapters.append({
                            'book': book_key,
                            'chapter': chapter_key,
                            'data': chapter_data
                        })
            
            # Sort by embedding_key index (e.g., embeddings_0, embeddings_1)
            def get_embedding_index(item):
                key = item['data']['embedding_key']
                try:
                    return int(key.split('_')[1])
                except (IndexError, ValueError):
                    return 999999
            
            all_chapters.sort(key=get_embedding_index)
            
            # Create flat list
            for item in all_chapters:
                book = item['book']
                chapter = item['chapter']
                data = item['data']
                num_chunks = data.get('num_chunks', 0)
                text_previews = data.get('text_previews', [])
                
                for i in range(num_chunks):
                    preview = text_previews[i] if i < len(text_previews) else ""
                    flat_metadata.append({
                        'book': book,
                        'chapter': chapter,
                        'chunk_idx': i,
                        'text_preview': preview
                    })
            
            self.metadata[language] = flat_metadata
            logger.info(f"  - Загружены и обработаны метаданные ({len(flat_metadata)} записей)")
        else:
            logger.warning(f"  - Файл метаданных не найден: {metadata_file}")

        if chunks_file.exists():
            with open(chunks_file, 'r', encoding='utf-8') as f:
                self.chunked_data[language] = json.load(f)
            logger.info(f"  - Загружены чанки из {chunks_file}")
        else:
             logger.warning(f"  - Файл с чанками не найден: {chunks_file}")

        # --- Построение или Загрузка BM25 индекса ---
        bm25_file = self.base_dir / f"bm25_index_{language}.pkl"

        if language in self.metadata and self.metadata[language]:
            # Попытка загрузить существующий индекс
            if bm25_file.exists():
                logger.info(f"📂 Загружаю индекс BM25 для языка '{language}' из файла...")
                try:
                    with open(bm25_file, 'rb') as f:
                        self.bm25_indices[language] = pickle.load(f)
                    logger.info(f"✅ Индекс BM25 успешно загружен")
                except Exception as e:
                    logger.error(f"❌ Ошибка при загрузке BM25 индекса: {e}. Буду строить заново.")

            # Если индекс не загружен (файла нет или ошибка), строим его
            if language not in self.bm25_indices:
                logger.info(f"⏳ Строю индекс BM25 для языка '{language}'...")
                try:
                    corpus = []
                    for meta in self.metadata[language]:
                        text = self._get_text_from_meta(meta, language)
                        corpus.append(self._tokenize(text, language))
                    
                    self.bm25_indices[language] = BM25Okapi(corpus)
                    logger.info(f"✅ Индекс BM25 построен ({len(corpus)} документов)")
                    
                    # Сохраняем индекс для следующего раза
                    logger.info(f"💾 Сохраняю индекс BM25 в файл {bm25_file}...")
                    with open(bm25_file, 'wb') as f:
                        pickle.dump(self.bm25_indices[language], f)
                    logger.info(f"✅ Индекс BM25 сохранен")
                    
                except Exception as e:
                    logger.error(f"❌ Ошибка при построении BM25: {e}")

    def _get_embedding(self, texts: List[str]) -> np.ndarray:
        """Получает эмбеддинги для списка текстов с помощью Gemini API."""
        try:
            # RETRIEVAL_QUERY используется для запросов, чтобы найти документы
            if len(texts) == 1:
                # Для одного текста API возвращает одиночный вектор
                result = genai.embed_content(
                    model=self.embedding_model_name,
                    content=texts[0],
                    task_type="RETRIEVAL_QUERY"
                )
                embedding = result['embedding']
                return np.array([embedding], dtype='float32')
            else:
                # Для множественных текстов API возвращает список векторов
                all_embeddings = []
                for text in texts:
                    result = genai.embed_content(
                        model=self.embedding_model_name,
                        content=text,
                        task_type="RETRIEVAL_QUERY"
                    )
                    all_embeddings.append(result['embedding'])
                return np.array(all_embeddings, dtype='float32')
        except Exception as e:
            logger.error(f"❌ Ошибка при получении эмбеддинга от Gemini API: {e}", exc_info=True)
            # Возвращаем нулевой вектор, чтобы избежать падения
            dim = 768 # Размерность для text-embedding-004
            return np.zeros((len(texts), dim), dtype='float32')

    def _tokenize(self, text: str, language: str) -> List[str]:
        """Токенизация со стеммингом для BM25"""
        words = re.findall(r'\w+', text.lower())
        stemmer = self.stemmers.get(language)
        if stemmer:
            return [stemmer.stem(w) for w in words]
        return words

    def _get_text_from_meta(self, meta: Dict, language: str) -> str:
        """Извлекает полный текст чанка по метаданным"""
        book = meta.get('book')
        chapter = meta.get('chapter')
        chunk_idx = meta.get('chunk_idx')
        
        text = ""
        chunks_map = self.chunked_data.get(language, {})
        
        if book and chapter and book in chunks_map and chapter in chunks_map[book]:
            chapter_chunks = chunks_map[book][chapter]
            if isinstance(chapter_chunks, list) and isinstance(chunk_idx, int):
                if 0 <= chunk_idx < len(chapter_chunks):
                    text = chapter_chunks[chunk_idx]
        
        if not text:
            text = meta.get('text_preview', '')
            
        return text

    def _search_by_keyword(self, query: str, language: str, top_k: int) -> List[Dict[str, Any]]:
        """Поиск по ключевым словам с помощью BM25"""
        bm25 = self.bm25_indices.get(language)
        if not bm25: return []
        
        try:
            tokenized_query = self._tokenize(query, language)
            scores = bm25.get_scores(tokenized_query)
            
            # Получаем индексы топ-k результатов
            top_n_indices = np.argsort(scores)[::-1][:top_k]
            
            results = []
            metadata_list = self.metadata.get(language, [])
            
            for idx in top_n_indices:
                score = scores[idx]
                if score <= 0: continue
                
                meta = metadata_list[idx] if idx < len(metadata_list) else {}
                text = self._get_text_from_meta(meta, language)
                
                results.append({
                    'index': int(idx),
                    'distance': 0.0,
                    'score': float(score), # Raw BM25 score
                    'text': text,
                    'book': meta.get('book'), 
                    'chapter': meta.get('chapter'), 
                    'verse': None, 
                    'chunk_idx': meta.get('chunk_idx'),
                    'html_path': meta.get('html_path'),
                    'source': 'bm25'
                })
            
            return results
        except Exception as e:
            logger.error(f"Ошибка при keyword поиске: {e}")
            return []


    def _search_by_vector(self, query_embedding: np.ndarray, language: str, top_k: int, vector_distance_threshold: float = None) -> List[Dict[str, Any]]:
        """Внутренний метод векторного поиска в FAISS."""
        index = self.indices.get(language)
        if not index: return []

        try:
            query_norm = query_embedding.copy().reshape(1, -1)
            faiss.normalize_L2(query_norm)
            distances, indices_found = index.search(query_norm, top_k * 2) # Ищем с запасом
            
            results = []
            metadata_list = self.metadata.get(language, [])
            chunks_map = self.chunked_data.get(language, {})
            
            seen_ids = set()
            
            for i, (dist, idx) in enumerate(zip(distances[0], indices_found[0])):
                if idx < 0: continue

                # Применяем пороговое значение расстояния
                if vector_distance_threshold is not None and dist > vector_distance_threshold:
                    continue


                meta = metadata_list[idx] if isinstance(metadata_list, list) and idx < len(metadata_list) else {}
                book, chapter = meta.get('book'), meta.get('chapter')
                chunk_idx = meta.get('chunk_idx')
                
                # Формируем уникальный ID для дедупликации
                unique_id = f"{book}_{chapter}_{chunk_idx}"
                if unique_id in seen_ids:
                    continue
                seen_ids.add(unique_id)
                
                # Попытка получить полный текст
                text = self._get_text_from_meta(meta, language)
                if not text:
                    text = meta.get('text_preview', '') + '...'

                results.append({
                    'index': int(idx),
                    'distance': float(dist),
                    'score': float(1.0 / (1.0 + dist)),
                    'text': text,
                    'book': book, 
                    'chapter': chapter, 
                    'verse': None, 
                    'chunk_idx': chunk_idx,
                    'html_path': meta.get('html_path'),
                    'source': 'vector'
                })
                
                if len(results) >= top_k:
                    break

            return results
        except Exception as e:
            logger.error(f"Ошибка при поиске по вектору ({language}): {e}", exc_info=True)
            return []

    def _detect_verse_reference(self, query: str) -> Dict[str, Any]:
        """
        Пытается определить, является ли запрос ссылкой на стих.
        Возвращает {'book': 'bg', 'chapter': '2', 'verse': '13'} или None.
        """
        query = query.lower().strip()
        
        # Карта сокращений
        book_map = {
            'bg': 'bg', 'бг': 'bg', 'gita': 'bg', 'гита': 'bg', 'bhagavad': 'bg', 'bhagavad gita': 'bg', 'бхагавад гита': 'bg',
            'sb': 'sb', 'шб': 'sb', 'bhagavatam': 'sb', 'бхагаватам': 'sb', 'srimad bhagavatam': 'sb', 'шримад бхагаватам': 'sb',
            'cc': 'cc', 'чч': 'cc', 'caitanya': 'cc', 'чайтанья': 'cc', 'caitanya caritamrta': 'cc', 'чайтанья чаритамрита': 'cc',
            'iso': 'iso', 'ишо': 'iso', 'isopanisad': 'iso', 'sri isopanisad': 'iso', 'шри ишопанишад': 'iso',
            'nod': 'nod', 'нп': 'nod', 'nectar of devotion': 'nod',
            'noi': 'noi', 'нн': 'noi', 'nectar of instruction': 'noi'
        }
        
        # Паттерн: (book) (chapter).(verse) или (book) (chapter) (verse)
        # Пример: Бг 2.13, SB 1.1.1, CC Adi 1.1, Bhagavad Gita 2.13
        
        # 1. Простой паттерн: Book Chapter.Verse
        # Разрешаем пробелы в названии книги (например, Bhagavad Gita)
        match = re.search(r'([a-zа-я\s]+?)\.?\s*(\d+)[. :](\d+)', query)
        if match:
            book_raw, chapter, verse = match.groups()
            book_key = book_raw.strip()
            if book_key in book_map:
                return {'book': book_map[book_key], 'chapter': chapter, 'verse': verse}
        
        # 2. Паттерн для SB: 1.1.1 (Canto.Chapter.Verse)
        match_sb = re.search(r'([a-zа-я\s]+?)\.?\s*(\d+)\.(\d+)\.(\d+)', query)
        if match_sb:
            book_raw, canto, chapter, verse = match_sb.groups()
            book_key = book_raw.strip()
            if book_key in book_map:
                return {'book': book_map[book_key], 'chapter': f"{canto}.{chapter}", 'verse': verse}

        return None

    def _find_verse_in_metadata(self, ref: Dict[str, Any], language: str) -> List[Dict[str, Any]]:
        """Ищет конкретный стих в метаданных."""
        results = []
        metadata_list = self.metadata.get(language, [])
        
        target_book = ref['book']
        target_chapter = ref['chapter'] # Может быть "2" или "1.1"
        target_verse = ref['verse']
        
        logger.info(f"🎯 Ищу стих: Book={target_book}, Chapter={target_chapter}, Verse={target_verse}")
        
        for idx, meta in enumerate(metadata_list):
            if meta.get('book') == target_book:
                # Сравнение глав. В метаданных может быть "2" или "02".
                meta_chapter = str(meta.get('chapter', ''))
                
                # Нормализация глав (убираем ведущие нули для сравнения)
                def normalize_chapter(ch):
                    return '.'.join([p.lstrip('0') for p in str(ch).split('.')])
                
                if normalize_chapter(meta_chapter) == normalize_chapter(target_chapter):
                    
                    text = self._get_text_from_meta(meta, language)
                    
                    # Эвристика: стих обычно начинается с номера или содержит его в начале
                    # Проверяем, есть ли номер стиха в начале текста (или в первых 20 символах)
                    # TEXT-13 ... или 13. ...
                    
                    # Очищаем текст от маркеров типа TEXT 13
                    clean_text = text.lower()
                    
                    # Ищем точное совпадение номера стиха
                    # Варианты: "13.", "text 13", "текст 13"
                    is_match = False
                    
                    if f"text {target_verse}" in clean_text[:50]:
                        is_match = True
                    elif f"текст {target_verse}" in clean_text[:50]:
                        is_match = True
                    elif clean_text.strip().startswith(f"{target_verse}."):
                        is_match = True
                    # Для диапазона стихов (например 13-14)
                    elif f"{target_verse}-" in clean_text[:20]:
                        is_match = True
                        
                    if is_match:
                        logger.info(f"✅ Найден точный стих в индексе {idx}")
                        results.append({
                            'index': int(idx),
                            'distance': 0.0,
                            'score': 100.0, # Максимальный скор
                            'text': text,
                            'book': target_book, 
                            'chapter': meta_chapter, 
                            'verse': target_verse, 
                            'chunk_idx': meta.get('chunk_idx'),
                            'html_path': meta.get('html_path'),
                            'source': 'exact_verse'
                        })
        
        return results

    def search(
        self, 
        query: str, 
        language: str = 'ru', 
        top_k: int = 5, 
        use_reranking: bool = True,
        expand_query: bool = True,
        vector_distance_threshold: float = None
    ) -> Dict[str, Any]:
        """Основной метод поиска."""
        logger.info(f"🔍 Поиск: '{query}' ({language}, top_k={top_k})")
        if language not in self.indices:
            return {'success': False, 'error': f'Индекс для языка {language} не загружен.'}

        try:
            # 0. Проверка на точный стих
            verse_ref = self._detect_verse_reference(query)
            exact_results = []
            if verse_ref:
                exact_results = self._find_verse_in_metadata(verse_ref, language)
                if exact_results:
                    logger.info(f"🎉 Найдены точные совпадения стихов: {len(exact_results)}")
                    return {
                        'success': True,
                        'results': exact_results,
                        'query': query,
                        'search_type': 'exact_verse_reference',
                        'count': len(exact_results)
                    }

            # 1. Расширение запроса
            query_variants = [query]
            if expand_query:
                expander_method = getattr(QueryExpander, f'expand_query_{language}', None)
                if expander_method:
                    query_variants = expander_method(query)

            logger.info(f"   📋 Варианты запроса: {query_variants}")

            # 2. Получение эмбеддингов для всех вариантов запроса одним батчем
            variant_embeddings = self._get_embedding(query_variants)
            logger.info(f"   🔢 Получено эмбеддингов: {variant_embeddings.shape}")

            # 3. Векторный поиск для каждого варианта
            all_results = []
            for idx, emb in enumerate(variant_embeddings):
                vector_results = self._search_by_vector(emb, language, top_k * 2, vector_distance_threshold)
                # logger.info(f"   🔎 Вариант '{query_variants[idx]}': найдено {len(vector_results)} результатов")
                all_results.extend(vector_results)

            # 4. Удаление дубликатов и отбор лучших для векторного поиска
            seen_indices = set()
            unique_vector_results = []
            for res in sorted(all_results, key=lambda x: x['score'], reverse=True):
                if res['index'] not in seen_indices:
                    seen_indices.add(res['index'])
                    unique_vector_results.append(res)

            top_vector_results = unique_vector_results[:top_k * 2] # Берем с запасом для гибридного слияния
            
            # 5. Keyword Search (BM25)
            keyword_results = []
            if language in self.bm25_indices:
                # logger.info(f"   📚 Запуск BM25 поиска для '{query}'...")
                keyword_results = self._search_by_keyword(query, language, top_k * 2)
                # logger.info(f"      - Найдено {len(keyword_results)} результатов по ключевым словам")

            # 6. Hybrid Fusion (RRF - Reciprocal Rank Fusion)
            # RRF score = 1 / (k + rank)
            k_rrf = 60
            combined_scores = {}
            
            # Добавляем точные результаты с максимальным весом
            for res in exact_results:
                idx = res['index']
                combined_scores[idx] = {'data': res, 'rrf_score': 100.0} # Super high score

            # Process Vector Results
            for rank, res in enumerate(top_vector_results):
                idx = res['index']
                if idx not in combined_scores:
                    combined_scores[idx] = {'data': res, 'rrf_score': 0.0}
                # Если это не точный результат, добавляем RRF
                if combined_scores[idx]['rrf_score'] < 50.0:
                    combined_scores[idx]['rrf_score'] += 1.0 / (k_rrf + rank + 1)
                    combined_scores[idx]['data']['vector_rank'] = rank + 1
                
            # Process Keyword Results
            for rank, res in enumerate(keyword_results):
                idx = res['index']
                if idx not in combined_scores:
                    combined_scores[idx] = {'data': res, 'rrf_score': 0.0}
                if combined_scores[idx]['rrf_score'] < 50.0:
                    combined_scores[idx]['rrf_score'] += 1.0 / (k_rrf + rank + 1)
                    combined_scores[idx]['data']['keyword_rank'] = rank + 1

            # Sort by RRF score
            hybrid_results = sorted(combined_scores.values(), key=lambda x: x['rrf_score'], reverse=True)
            
            # Extract top_k
            final_candidates = []
            for item in hybrid_results[:top_k]:
                res = item['data']
                res['score'] = item['rrf_score'] # Обновляем скор на RRF
                final_candidates.append(res)
            
            logger.info(f"   🤝 Гибридный поиск: объединено {len(final_candidates)} результатов")

            # 7. Переранжирование (Re-ranking)
            # Не делаем реранкинг для точных совпадений (score > 50)
            if use_reranking and self.reranker.model:
                docs_to_rerank = []
                indices_to_rerank = []
                
                final_results = []
                
                for i, res in enumerate(final_candidates):
                    if res['score'] > 50.0:
                        # Это точное совпадение, оставляем как есть на первом месте
                        res['final_score'] = 1.0
                        final_results.append(res)
                    else:
                        docs_to_rerank.append(res['text'])
                        indices_to_rerank.append(i)
                
                if docs_to_rerank:
                    reranked_tuples = self.reranker.rerank(query, docs_to_rerank, len(docs_to_rerank))
                    
                    for original_idx_in_subset, score, text in reranked_tuples:
                        original_idx = indices_to_rerank[original_idx_in_subset]
                        original_result = final_candidates[original_idx]
                        original_result['final_score'] = float(score)
                        final_results.append(original_result)
            else:
                final_results = final_candidates

            return {
                'success': True,
                'results': final_results,
                'query_variants': query_variants,
                'count': len(final_results)
            }
        
        except Exception as e:
            logger.error(f"❌ Критическая ошибка при поиске: {e}", exc_info=True)
            return {'success': False, 'error': str(e), 'query': query}

    def keyword_search(self, query: str, language: str = 'en', case_sensitive: bool = False) -> Dict[str, Any]:
        """
        Простой поиск по ключевым словам (точное совпадение).
        Возвращает ВСЕ результаты без ограничения.
        
        Args:
            query: Поисковый запрос
            language: Язык ('en' или 'ru')
            case_sensitive: Учитывать регистр (по умолчанию False)
        
        Returns:
            Dict с результатами поиска
        """
        import re
        
        logger.info(f"🔍 Keyword search: '{query}' (language={language}, case_sensitive={case_sensitive})")
        
        if language not in self.languages:
            logger.error(f"Язык {language} не поддерживается")
            return {'success': False, 'error': f'Language {language} not supported'}
        
        metadata = self.metadata[language]
        
        # Подготовка поискового запроса
        search_query = query if case_sensitive else query.lower()
        
        results = []
        
        # Поиск по всем чанкам
        for item in metadata:
            text = self._get_text_from_meta(item, language)
            search_text = text if case_sensitive else text.lower()
            
            # Проверяем наличие точного совпадения
            if search_query in search_text:
                # Подсчитываем количество вхождений для сортировки
                occurrences = search_text.count(search_query)
                
                results.append({
                    'text': text,
                    'book': item.get('book', 'Unknown'),
                    'chapter': item.get('chapter', ''),
                    'verse': item.get('verse', ''),
                    'chunk_idx': item.get('chunk_idx', 0),
                    'page_number': item.get('page_number'),
                    'html_path': item.get('html_path'),
                    'occurrences': occurrences,
                    'score': min(1.0, occurrences / 10.0)  # Простой score на основе количества вхождений
                })
        
        # Сортировка по количеству вхождений (больше вхождений = выше в списке)
        results.sort(key=lambda x: x['occurrences'], reverse=True)
        
        logger.info(f"✅ Keyword search found {len(results)} results")
        
        return {
            'success': True,
            'results': results,
            'query': query,
            'total_results': len(results),
            'language': language
        }