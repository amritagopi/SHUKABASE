# Файл: bridge.py
# Запуск: uvicorn bridge:app --reload --port 8000

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

# Импортируем твой существующий движок
# Убедись, что rag_engine.py лежит рядом

from rag.rag_engine import RAGEngine

# Настройка (как в твоем shukabase_rag.py)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAG_DIR = os.path.join(BASE_DIR, "rag")

print(f"Инициализация RAG из {RAG_DIR}...")
rag_engine = RAGEngine(
    reranker_model="jinaai/jina-reranker-v2-base-multilingual",
    languages=['ru', 'en'],
    base_dir=RAG_DIR
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Разрешаем доступ с React приложения
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/search")
def search(q: str):
    """
    Простой поиск для Shukabase Frontend
    """
    try:
        # Определяем язык (упрощенно)
        lang = 'ru' if any(k in q.lower() for k in 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя') else 'en'
        
        # Используем твой мощный RAG поиск
        # Мы НЕ используем OpenAI здесь, только поиск чанков
        result = rag_engine.search(
            query=q,
            language=lang,
            top_k=5,
            use_reranking=True
        )
        
        if not result.get('success'):
            return {"chunks": []}

        # Преобразуем формат данных Shukabase в формат Frontend'а
        chunks_for_frontend = []
        
        for item in result.get('results', []):
            # Извлекаем данные, которые вернул RAG
            book = item.get('book', 'Unknown')
            chap = item.get('chapter', 0)
            verse = item.get('verse', 0)
            text = item.get('text', '')
            score = item.get('final_score', item.get('score', 0))

            # Формируем уникальный ID для кликабельных ссылок
            book_short = book.replace(" ", "").lower()
            unique_id = f"{book_short}.{chap}.{verse}"
            
            chunks_for_frontend.append({
                "id": unique_id,
                "bookTitle": book,
                "chapter": chap,
                "verse": verse,
                "content": text,
                "score": score
            })
            
        return {"chunks": chunks_for_frontend}

    except Exception as e:
        print(f"Ошибка: {e}")
        raise HTTPException(status_code=500, detail=str(e))
