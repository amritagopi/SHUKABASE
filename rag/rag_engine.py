"""
🧠 RAG ENGINE - Векторный поиск с Re-ranking для Shukabase

Этот модуль предоставляет:
1. Векторный поиск с использованием Google Gemini API
2. FAISS индексирование для быстрого поиска
3. Re-ranking с помощью Jina Reranker
4. Переформулировка запросов с синонимами
5. Гибридный поиск (Vector + BM25 + Simple Keyword)
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
import difflib

# GraphRAG support
GRAPHRAG_AVAILABLE = True
try:
    import pandas as pd
except ImportError:
    GRAPHRAG_AVAILABLE = False

# Управление зависимостями
try:
    import faiss
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch
    from google import genai
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
                if key == word or QueryExpander._fuzzy_find(word, [key]):
                    expanded.add(key)
                    expanded.update(synonyms)
                
                # 2. Check values (synonyms)
                if word in synonyms or QueryExpander._fuzzy_find(word, synonyms):
                    expanded.add(key)
                    expanded.update(synonyms)
                    
        return list(expanded)[:5]
    
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
        self.model = None
        self.tokenizer = None
        self.device = "cpu"
        
        try:
            # Сначала пробуем загрузить, если есть интернет или кэш
            self.tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
            self.model = AutoModelForSequenceClassification.from_pretrained(
                model_name, trust_remote_code=True, dtype=torch.float32
            )
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model.to(self.device)
            self.model.eval()
            logger.info(f"✅ Модель re-ranking загружена (device: {self.device})")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось загрузить модель re-ranking (Jina): {e}")
            logger.warning("⚠️ RAG будет работать без фазы переранжирования (только векторный поиск). Это нормально для оффлайн режима.")
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


class GraphSearchService:
    """Service for querying GraphRAG extracted entities and community reports."""
    
    def __init__(self, data_dir: Path):
        self.entities = None
        self.reports = None
        self.enabled = False
        
        if not GRAPHRAG_AVAILABLE:
            logger.warning("⚠️ pandas not available. Graph search disabled.")
            return

        try:
            nodes_path = data_dir / "entities.parquet"
            reports_path = data_dir / "community_reports.parquet"
            
            if nodes_path.exists() and reports_path.exists():
                logger.info(f"📂 Loading GraphRAG artifacts from {data_dir}...")
                self.entities = pd.read_parquet(nodes_path, columns=["title", "description", "human_readable_id"])
                # Create a lowercase column for faster matching
                self.entities['name_lower'] = self.entities['title'].str.lower()
                
                self.reports = pd.read_parquet(reports_path, columns=["title", "summary", "full_content", "rank"])
                self.enabled = True
                logger.info(f"✅ GraphSearchService initialized with {len(self.entities)} entities and {len(self.reports)} reports.")
            else:
                logger.warning(f"⚠️ GraphRAG files not found in {data_dir}. Graph search disabled.")
        except Exception as e:
            logger.error(f"❌ Failed to load GraphRAG data: {e}")

    def search_context(self, query: str, top_k: int = 3) -> str:
        """Find relevant community reports and format them as context."""
        if not self.enabled or not self.reports is not None:
            return ""
        
        try:
            # Simple keyword search in report summaries/titles
            query_lower = query.lower()
            # We use a very basic regex search for now
            mask = self.reports['summary'].str.contains(query_lower, case=False, na=False) | \
                   self.reports['title'].str.contains(query_lower, case=False, na=False)
            
            relevant_reports = self.reports[mask].sort_values(by="rank", ascending=False).head(top_k)
            
            if relevant_reports.empty:
                return ""
            
            context = "### KNOWLEDGE GRAPH CONTEXT (Synthesized Knowledge)\n\n"
            for _, report in relevant_reports.iterrows():
                context += f"#### {report['title']}\n{report['summary']}\n\n"
            
            return context
        except Exception as e:
            logger.error(f"Error in graph search: {e}")
            return ""


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
        
        # Initialize GraphRAG service
        self.graph_service = GraphSearchService(self.base_dir / "graph_index")
        
        logger.info("✅ RAG Engine готов к работе!")

    def _configure_gemini_api(self):
        """Загружает и настраивает ключ API для Gemini."""
        load_dotenv()
        api_key = os.environ.get('GEMINI_API_KEY')
        self.current_api_key = None
        self.genai_client = None
        
        if not api_key:
            logger.warning("⚠️ Переменная окружения GEMINI_API_KEY не найдена. RAG будет работать в ограниченном режиме.")
            return

        try:
            self.genai_client = genai.Client(api_key=api_key)
            self.current_api_key = api_key
            logger.info("✅ Клиент Gemini API (google-genai) успешно создан.")
        except Exception as e:
            logger.error(f"❌ Ошибка при создании клиента Gemini API: {e}")

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
                        'text_preview': preview,
                        'html_path': data.get('html_path')
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
            if bm25_file.exists():
                logger.info(f"📂 Загружаю индекс BM25 для языка '{language}' из файла...")
                try:
                    with open(bm25_file, 'rb') as f:
                        self.bm25_indices[language] = pickle.load(f)
                    logger.info(f"✅ Индекс BM25 успешно загружен")
                except Exception as e:
                    logger.error(f"❌ Ошибка при загрузке BM25 индекса: {e}. Буду строить заново.")

            if language not in self.bm25_indices:
                logger.info(f"⏳ Строю индекс BM25 для языка '{language}'...")
                try:
                    corpus = []
                    for meta in self.metadata[language]:
                        text = self._get_text_from_meta(meta, language)
                        corpus.append(self._tokenize(text, language))
                    
                    self.bm25_indices[language] = BM25Okapi(corpus)
                    logger.info(f"✅ Индекс BM25 построен ({len(corpus)} документов)")
                    
                    logger.info(f"💾 Сохраняю индекс BM25 в файл {bm25_file}...")
                    with open(bm25_file, 'wb') as f:
                        pickle.dump(self.bm25_indices[language], f)
                    logger.info(f"✅ Индекс BM25 сохранен")
                    
                except Exception as e:
                    logger.error(f"❌ Ошибка при построении BM25: {e}")

    def _get_embedding(self, texts: List[str], api_key: str = None) -> np.ndarray:
        """Получает эмбеддинги для списка текстов с помощью Gemini API."""
        if api_key and api_key != self.current_api_key:
            try:
                masked_key = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "***"
                logger.info(f"🔑 Using dynamic API key: {masked_key}")
                self.genai_client = genai.Client(api_key=api_key)
                self.current_api_key = api_key
            except Exception as e:
                logger.error(f"Error configuring API key: {e}")

        if not self.genai_client:
            logger.error("❌ Gemini API client not initialized.")
            dim = 768
            return np.zeros((len(texts), dim), dtype='float32')

        try:
            all_embeddings = []
            for text in texts:
                result = self.genai_client.models.embed_content(
                    model="text-embedding-004",
                    contents=text,
                    config={"task_type": "RETRIEVAL_QUERY"}
                )
                # result.embeddings - это список объектов Embedding.
                # Если передан один текст, в списке будет один элемент.
                if result.embeddings:
                    all_embeddings.append(result.embeddings[0].values)
                else:
                    logger.warning(f"No embeddings returned for text snippet: {text[:50]}...")
                    all_embeddings.append([0.0] * 768)

            return np.array(all_embeddings, dtype='float32')
            
        except Exception as e:
            logger.error(f"❌ Ошибка при получении эмбеддинга от Gemini API: {e}", exc_info=True)
            dim = 768
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
                    'score': float(score),
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

    def _search_by_simple_match(self, query: str, language: str, top_k: int) -> List[Dict[str, Any]]:
        """
        Простой поиск по точному совпадению подстроки.
        ВАЖНО: Возвращает результаты с 'index', совместимые с RRF слиянием.
        """
        metadata_list = self.metadata.get(language, [])
        if not metadata_list:
            return []

        search_query = query.lower().strip()
        results = []

        # Итерируемся по метаданным, чтобы сохранить индекс
        for idx, meta in enumerate(metadata_list):
            text = self._get_text_from_meta(meta, language)
            lower_text = text.lower()
            
            if search_query in lower_text:
                # Считаем количество вхождений для ранжирования
                count = lower_text.count(search_query)
                
                results.append({
                    'index': int(idx),
                    'distance': 0.0,
                    'score': float(count), # Score = количество вхождений
                    'text': text,
                    'book': meta.get('book'),
                    'chapter': meta.get('chapter'),
                    'verse': None,
                    'chunk_idx': meta.get('chunk_idx'),
                    'html_path': meta.get('html_path'),
                    'source': 'simple_match'
                })

        # Сортируем по количеству вхождений
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:top_k]

    def _search_by_vector(self, query_embedding: np.ndarray, language: str, top_k: int, vector_distance_threshold: float = None) -> List[Dict[str, Any]]:
        """Внутренний метод векторного поиска в FAISS."""
        index = self.indices.get(language)
        if not index: return []

        try:
            query_norm = query_embedding.copy().reshape(1, -1)
            faiss.normalize_L2(query_norm)
            distances, indices_found = index.search(query_norm, top_k * 2)
            
            results = []
            metadata_list = self.metadata.get(language, [])
            
            seen_ids = set()
            
            for i, (dist, idx) in enumerate(zip(distances[0], indices_found[0])):
                if idx < 0: continue

                if vector_distance_threshold is not None and dist > vector_distance_threshold:
                    continue

                meta = metadata_list[idx] if isinstance(metadata_list, list) and idx < len(metadata_list) else {}
                book, chapter = meta.get('book'), meta.get('chapter')
                chunk_idx = meta.get('chunk_idx')
                
                unique_id = f"{book}_{chapter}_{chunk_idx}"
                if unique_id in seen_ids:
                    continue
                seen_ids.add(unique_id)
                
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
        """Пытается определить, что запрос — это ссылка на стих (БГ 2.1, ШБ 1.1.1, УГ 1.1)."""
        query = query.lower().strip()
        
        book_map = {
            'bg': 'bg', 'бг': 'bg', 'gita': 'bg', 'гита': 'bg', 'bhagavad': 'bg', 'bhagavad gita': 'bg', 'бхагавад гита': 'bg',
            'sb': 'sb', 'шб': 'sb', 'bhagavatam': 'sb', 'бхагаватам': 'sb', 'srimad bhagavatam': 'sb', 'шримад бхагаватам': 'sb',
            'cc': 'cc', 'чч': 'cc', 'caitanya': 'cc', 'чайтанья': 'cc', 'caitanya caritamrta': 'cc', 'чайтанья чаритамрита': 'cc',
            'iso': 'iso', 'ишо': 'iso', 'isopanisad': 'iso', 'sri isopanisad': 'iso', 'шри ишопанишад': 'iso',
            'nod': 'nod', 'нп': 'nod', 'nectar of devotion': 'nod',
            'noi': 'noi', 'нн': 'noi', 'nectar of instruction': 'noi',
            'ug': 'Uddhava-Gita', 'уг': 'Uddhava-Gita', 'uddhava': 'Uddhava-Gita', 'уддхава': 'Uddhava-Gita'
        }
        
        # 1. Проверяем формат Песнь.Глава.Стих (для ШБ)
        match_sb = re.search(r'([a-zа-я\s]+?)\.?\s*(\d+)\.(\d+)\.(\d+)', query)
        if match_sb:
            book_raw, canto, chapter, verse = match_sb.groups()
            book_key = book_raw.strip()
            if book_key in book_map:
                return {'book': book_map[book_key], 'chapter': f"{canto}.{chapter}", 'verse': verse}

        # 2. Проверяем формат Глава.Стих (БГ 2.1, УГ 3.4)
        match = re.search(r'([a-zа-я\s]+?)\.?\s*(\d+)[. :](\d+)', query)
        if match:
            book_raw, chapter, verse = match.groups()
            book_key = book_raw.strip()
            if book_key in book_map:
                return {'book': book_map[book_key], 'chapter': chapter, 'verse': verse}

        return None

    def _find_verse_in_metadata(self, ref: Dict[str, Any], language: str) -> List[Dict[str, Any]]:
        """Ищет конкретный стих в метаданных."""
        results = []
        metadata_list = self.metadata.get(language, [])
        
        target_book = ref['book']
        target_chapter = ref['chapter']
        target_verse = ref['verse']
        
        logger.info(f"🎯 Exact Verse Search: Book={target_book}, Ch={target_chapter}, V={target_verse}")
        
        BOOK_ALIASES = {
            'sb': ['srimad-bhagavatam', 'бхагаватам', 'шб'],
            'bg': ['bhagavad-gita', 'бхагавад-гита', 'бг'],
            'cc': ['caitanya-caritamrta', 'чайтанья-чаритамрита', 'чч'],
            'nod': ['nectar of devotion', 'нектар преданности', 'нп'],
            'noi': ['nectar of instruction', 'нектар наставлений', 'нн'],
            'iso': ['isopanisad', 'ишопанишад', 'ишо'],
        }
        
        target_book_lower = target_book.lower()
        
        for idx, meta in enumerate(metadata_list):
            meta_book = meta.get('book', '').lower()
            
            # Check for direct match or alias match
            is_book_match = target_book_lower in meta_book or meta_book in target_book_lower
            
            if not is_book_match:
                # Check aliases
                for canonical, aliases in BOOK_ALIASES.items():
                    if target_book_lower == canonical or target_book_lower in aliases:
                        if meta_book == canonical or any(a in meta_book for a in aliases):
                            is_book_match = True
                            break
            
            if not is_book_match:
                 continue

            meta_chapter = str(meta.get('chapter', ''))
            
            def normalize_chapter(ch):
                return '.'.join([p.lstrip('0') for p in str(ch).split('.')])
            
            if normalize_chapter(meta_chapter) == normalize_chapter(target_chapter):
                text = self._get_text_from_meta(meta, language)
                clean_text = text.lower()
                
                is_match = False
                
                # Эвристики для поиска номера стиха в тексте
                indicators = [
                    f"text {target_verse}", f"текст {target_verse}", 
                    f"verse {target_verse}", f"стих {target_verse}",
                    f"{target_verse}."
                ]
                
                if any(ind in clean_text[:100] for ind in indicators):
                     is_match = True
                elif f"{target_verse}-" in clean_text[:20]: # 10-11
                     is_match = True
                elif clean_text.strip().startswith(target_verse):
                     is_match = True

                if is_match:
                    logger.info(f"✅ Found exact verse at index {idx}")
                    results.append({
                        'index': int(idx),
                        'distance': 0.0,
                        'score': 100.0,
                        'text': text,
                        'book': meta.get('book'), 
                        'chapter': meta_chapter, 
                        'verse': target_verse, 
                        'chunk_idx': meta.get('chunk_idx'),
                        'html_path': meta.get('html_path'),
                        'source': 'exact_verse',
                        'is_study_guide': False # Стихи обычно из шастр
                    })
        
        return results

    def search(
        self, 
        query: str, 
        language: str = 'ru', 
        top_k: int = 5, 
        use_reranking: bool = True,
        expand_query: bool = True,
        vector_distance_threshold: float = None,
        api_key: str = None
    ) -> Dict[str, Any]:
        """
        Основной метод поиска.
        Объединяет: Exact Verse + Vector Search + BM25 + Simple Keyword Search
        """
        # ==================== PRIORITY RAG LAYER CONFIG ====================
        # Книги, которые всегда должны быть в топе ("Core ISKCON Basics")
        CORE_BOOKS = [
             'Introductory-handbook-for-Krishna-Consciousness', # Normalized name
             'Introductory_handbook_for_Krishna_Consciousness',
             'Disciple-Course-SHB-5th-Edition',
             'Disciple-Course-SHB-5th-Edition-March-2017',
             'Наука самоосознания',
             'Учение Шри Чайтаньи',
             'Шри Ишопанишад',
             'Нектар наставлений'
        ]
        CORE_BOOST_MULTIPLIER = 3.0 
        # ===================================================================

        logger.info(f"🔍 Поиск: '{query}' (lang={language}, top_k={top_k})")
        
        target_languages = []
        if language == 'all':
            target_languages = list(self.indices.keys())
        else:
            if language in self.indices:
                target_languages = [language]
            else:
                return {'success': False, 'error': f'Индекс для языка {language} не загружен.'}

        try:
            all_exact_results = []
            all_vector_results = []
            all_keyword_results = []
            all_simple_match_results = []
            all_query_variants = [query]

            # --- SEARCH IN EACH LANGUAGE ---
            for lang in target_languages:
                # 0. Проверка на точный стих
                verse_ref = self._detect_verse_reference(query)
                if verse_ref:
                    exact_res = self._find_verse_in_metadata(verse_ref, lang)
                    if exact_res:
                        all_exact_results.extend(exact_res)

                # 1. Расширение запроса
                if expand_query:
                    expander_method = getattr(QueryExpander, f'expand_query_{lang}', None)
                    if expander_method:
                        variants = expander_method(query)
                        all_query_variants.extend(variants)

                # 2. Получение эмбеддингов и Векторный поиск
                # Используем варианты для текущего языка + оригинал
                # (Можно оптимизировать и эмбеддить один раз для всех вариантов, но пока так)
                lang_query_variants = [query]
                if expand_query and getattr(QueryExpander, f'expand_query_{lang}', None):
                     lang_query_variants = getattr(QueryExpander, f'expand_query_{lang}')(query)
                
                variant_embeddings = self._get_embedding(lang_query_variants, api_key=api_key)
                
                for idx, emb in enumerate(variant_embeddings):
                    vec_res = self._search_by_vector(emb, lang, top_k * 2, vector_distance_threshold)
                    all_vector_results.extend(vec_res)

                # 4. Keyword Search (BM25)
                if lang in self.bm25_indices:
                    kw_res = self._search_by_keyword(query, lang, top_k * 2)
                    all_keyword_results.extend(kw_res)

                # 5. Simple Exact Phrase Search
                sm_res = self._search_by_simple_match(query, lang, top_k * 2)
                all_simple_match_results.extend(sm_res)

            # Если нашли точные стихи, возвращаем их сразу (если их достаточно?)
            # Но пользователь может хотеть мульти-язычный ответ. 
            # Если reference, то вернем что нашли.
            if all_exact_results:
                logger.info(f"🎉 Найдены точные совпадения стихов: {len(all_exact_results)}")
                return {
                    'success': True,
                    'results': all_exact_results,
                    'query': query,
                    'search_type': 'exact_verse_reference',
                    'count': len(all_exact_results)
                }

            # Deduplicate variants
            all_query_variants = list(set(all_query_variants))
            logger.info(f"   📋 Варианты запроса (combined): {all_query_variants}")

            # Deduplicate vector results (by index AND language? No, index is per-language specific)
            # We must be careful: index 10 in RU is different from index 10 in EN.
            # We need a unique ID that includes language.
            # My current implementation of `_search_by_...` returns 'book', 'chapter', etc.
            # But 'index' is raw integer.
            # RRF loop below uses `idx`. We need to make `idx` composite or unique.
            # Let's Modify the results to have a unique key for RRF.
            
            # Helper to make unique key
            def make_unique_key(res):
                # We don't have 'lang' in 'res' yet. We assume res are distinct objects.
                # But RRF uses 'index'.
                # Let's use (book, chapter, chunk_idx) as unique key which is stable across logic
                return f"{res.get('book')}_{res.get('chapter')}_{res.get('chunk_idx')}"

            # 6. Hybrid Fusion (RRF)
            k_rrf = 60
            combined_scores = {}
            
            # Helper to check if book is CORE
            def get_boost_multiplier(res_item):
                book_name = res_item.get('book', '')
                if any(cb.lower() in book_name.lower().replace('_', '-') for cb in CORE_BOOKS) or \
                   any(cb.lower() in book_name.lower().replace('-', '_') for cb in CORE_BOOKS):
                    logger.info(f"   🚀 BOOSTING CORE BOOK: {book_name}")
                    return CORE_BOOST_MULTIPLIER
                return 1.0

            # Process Vector Results
            # Sort globally by score before RRF ranking? 
            # Ideally RRF ranks per-system. Here we treat "Vector Search" as one system, regardless of language.
            # So we sort all vector results by distance/score.
            all_vector_results.sort(key=lambda x: x['score'], reverse=True)
            
            # Remove duplicates based on unique content
            seen_content = set()
            unique_vector_results = []
            for res in all_vector_results:
                ukey = make_unique_key(res)
                if ukey not in seen_content:
                    seen_content.add(ukey)
                    unique_vector_results.append(res)
            
            for rank, res in enumerate(unique_vector_results[:top_k * 4]): # Consider more candidates
                ukey = make_unique_key(res)
                if ukey not in combined_scores:
                    combined_scores[ukey] = {'data': res, 'rrf_score': 0.0}
                
                boost = get_boost_multiplier(res)
                combined_scores[ukey]['rrf_score'] += (1.0 / (k_rrf + rank + 1)) * boost
                combined_scores[ukey]['data']['vector_rank'] = rank + 1

            # Process BM25 Results
            all_keyword_results.sort(key=lambda x: x['score'], reverse=True)
            for rank, res in enumerate(all_keyword_results[:top_k * 4]):
                ukey = make_unique_key(res)
                if ukey not in combined_scores:
                    combined_scores[ukey] = {'data': res, 'rrf_score': 0.0}
                
                boost = get_boost_multiplier(res)
                combined_scores[ukey]['rrf_score'] += (1.0 / (k_rrf + rank + 1)) * boost
                combined_scores[ukey]['data']['keyword_rank'] = rank + 1

            # Process Simple Match Results
            all_simple_match_results.sort(key=lambda x: x['score'], reverse=True)
            for rank, res in enumerate(all_simple_match_results[:top_k * 4]):
                ukey = make_unique_key(res)
                if ukey not in combined_scores:
                    combined_scores[ukey] = {'data': res, 'rrf_score': 0.0}
                
                boost = get_boost_multiplier(res)
                combined_scores[ukey]['rrf_score'] += (1.0 / (k_rrf + rank + 1)) * boost
                combined_scores[ukey]['data']['simple_match_rank'] = rank + 1

            # Sort by RRF score
            hybrid_results = sorted(combined_scores.values(), key=lambda x: x['rrf_score'], reverse=True)
            
            # Extract top_k
            final_candidates = []
            for item in hybrid_results[:top_k]:
                res = item['data']
                res['score'] = item['rrf_score']
                final_candidates.append(res)
            
            logger.info(f"   🤝 Гибридный поиск: объединено {len(final_candidates)} результатов")

            # 7. Переранжирование (Re-ranking)
            if use_reranking and self.reranker.model:
                try:
                    logger.info("⏳ Starting Re-ranking process...")
                    docs_to_rerank = []
                    indices_to_rerank = []
                    final_results = []
                    
                    for i, res in enumerate(final_candidates):
                        if res['score'] > 50.0: # High confidence exact match
                            res['final_score'] = 1.0
                            final_results.append(res)
                        else:
                            docs_to_rerank.append(res['text'])
                            indices_to_rerank.append(i)
                    
                    if docs_to_rerank:
                        logger.info(f"   Reranking {len(docs_to_rerank)} documents...")
                        reranked_tuples = self.reranker.rerank(query, docs_to_rerank, len(docs_to_rerank))
                        
                        for original_idx_in_subset, score, text in reranked_tuples:
                            original_idx = indices_to_rerank[original_idx_in_subset]
                            original_result = final_candidates[original_idx]
                            original_result['final_score'] = float(score)
                            final_results.append(original_result)
                    else:
                        final_results.extend([res for res in final_candidates if 'final_score' not in res])
                    
                    # Sort final results by final_score
                    final_results.sort(key=lambda x: x.get('final_score', 0), reverse=True)
                    logger.info("✅ Re-ranking finished successfully.")

                except Exception as e:
                    logger.error(f"❌ Re-ranking failed (using standard results): {e}")
                    final_results = final_candidates
            else:
                final_results = final_candidates

            # 8. Graph Context
            graph_context = self.graph_service.search_context(query)

            return {
                'success': True,
                'results': final_results,
                'query_variants': all_query_variants,
                'graph_context': graph_context,
                'count': len(final_results)
            }
        
        except Exception as e:
            logger.error(f"❌ Критическая ошибка при поиске: {e}", exc_info=True)
            return {'success': False, 'error': str(e), 'query': query}

    def keyword_search(self, query: str, language: str = 'en', case_sensitive: bool = False) -> Dict[str, Any]:
        """
        Простой поиск по ключевым словам (standalone метод).
        Теперь использует общий формат, но без интеграции в RRF pipeline.
        """
        logger.info(f"🔍 Standalone Keyword search: '{query}'")
        
        if language not in self.languages:
            return {'success': False, 'error': f'Language {language} not supported'}
        
        # Используем внутренний метод, если регистр не важен
        if not case_sensitive:
            results = self._search_by_simple_match(query, language, top_k=100)
            return {
                'success': True,
                'results': results,
                'query': query,
                'total_results': len(results),
                'language': language
            }
        
        # Если нужен case_sensitive, идем старым путем
        metadata = self.metadata[language]
        results = []
        for item in metadata:
            text = self._get_text_from_meta(item, language)
            if query in text:
                results.append({
                    'text': text,
                    'book': item.get('book'),
                    'chapter': item.get('chapter'),
                    'score': 1.0
                })
        
        return {
            'success': True,
            'results': results,
            'query': query,
            'total_results': len(results),
            'language': language
        }