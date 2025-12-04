#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔎 REST API ДЛЯ RAG ПОИСКА

Этот сервер предоставляет API для поиска, используя централизованный RAGEngine.
При первом запуске он автоматически скачивает необходимые данные (индексы), если их нет.

Запуск:
    python rag/rag_api_server.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import sys
import os
import json
import shutil
import zipfile
import requests
from pathlib import Path

# Добавляем корень проекта в sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.rag_engine import RAGEngine

# --- Константы ---
APP_NAME = "Shukabase"
DATA_ARCHIVE_ID = "1noqtdfABCV4xpVhlfmO4SlridrfQPkiO" # ID файла на Google Drive
REQUIRED_FILES = [
    "faiss_index_en.bin", "faiss_index_ru.bin",
    "faiss_metadata_en.json", "faiss_metadata_ru.json",
    "chunked_scriptures_en.json", "chunked_scriptures_ru.json",
    "bm25_index_en.pkl", "bm25_index_ru.pkl"
]

# Определяем путь к данным
if getattr(sys, 'frozen', False):
    # Если запущено как exe (PyInstaller)
    # Используем AppData/Local/Shukabase/rag_data
    base_path = os.path.join(os.getenv('LOCALAPPDATA'), APP_NAME)
else:
    # Если запущено как скрипт (Dev)
    # Используем локальную папку rag
    base_path = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(base_path, "rag_data") if getattr(sys, 'frozen', False) else base_path
CHAT_HISTORY_DIR = os.path.join(base_path, "chat_history")

# --- Настройка логгирования ---
log_dir = os.path.join(base_path, "logs")
if not os.path.exists(log_dir):
    os.makedirs(log_dir, exist_ok=True)

log_file = os.path.join(log_dir, "rag_api_server.log")

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --- Глобальные переменные ---
app = Flask(__name__)
CORS(app)
rag_engine_instance = None

# --- Функции для скачивания данных ---

def download_file_from_google_drive(id, destination):
    """Скачивает файл с Google Drive с поддержкой больших файлов."""
    URL = "https://docs.google.com/uc?export=download"

    session = requests.Session()

    response = session.get(URL, params={'id': id}, stream=True)
    token = get_confirm_token(response)

    if token:
        params = {'id': id, 'confirm': token}
        response = session.get(URL, params=params, stream=True)

    save_response_content(response, destination)

def get_confirm_token(response):
    for key, value in response.cookies.items():
        if key.startswith('download_warning'):
            return value
    return None

def save_response_content(response, destination):
    CHUNK_SIZE = 32768
    total_size = 0
    
    logger.info(f"⬇️ Начало скачивания в {destination}...")
    
    with open(destination, "wb") as f:
        for chunk in response.iter_content(CHUNK_SIZE):
            if chunk: # filter out keep-alive new chunks
                f.write(chunk)
                total_size += len(chunk)
                # Можно добавить логирование прогресса, но не слишком часто
                if total_size % (10 * 1024 * 1024) == 0: # Каждые 10 МБ
                    print(f"Downloading... {total_size / (1024*1024):.1f} MB", flush=True)

    logger.info(f"✅ Скачивание завершено. Размер: {total_size / (1024*1024):.2f} MB")

def ensure_data_exists():
    """Проверяет наличие данных и скачивает их при необходимости."""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)

    missing_files = [f for f in REQUIRED_FILES if not os.path.exists(os.path.join(DATA_DIR, f))]

    if missing_files:
        logger.info(f"⚠️ Отсутствуют файлы данных: {missing_files}")
        logger.info("⏳ Начинаю автоматическое скачивание базы знаний...")
        
        # Сообщаем пользователю через stdout (Tauri может это читать)
        print("STATUS: DOWNLOADING_DATA", flush=True)
        
        zip_path = os.path.join(DATA_DIR, "shukabase_data.zip")
        
        try:
            download_file_from_google_drive(DATA_ARCHIVE_ID, zip_path)
            
            print("STATUS: EXTRACTING_DATA", flush=True)
            logger.info("📦 Распаковка архива...")
            
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                # Распаковываем прямо в DATA_DIR
                # В архиве файлы могут быть в папке rag/ или в корне. 
                # Проверим структуру
                file_list = zip_ref.namelist()
                is_nested = any(f.startswith('rag/') for f in file_list)
                
                zip_ref.extractall(DATA_DIR)
                
                # Если файлы были в папке rag/, переместим их в корень DATA_DIR
                if is_nested:
                    nested_dir = os.path.join(DATA_DIR, 'rag')
                    if os.path.exists(nested_dir):
                        for item in os.listdir(nested_dir):
                            s = os.path.join(nested_dir, item)
                            d = os.path.join(DATA_DIR, item)
                            if os.path.exists(d):
                                if os.path.isdir(d):
                                    shutil.rmtree(d)
                                else:
                                    os.remove(d)
                            shutil.move(s, d)
                        os.rmdir(nested_dir)

            logger.info("✅ Данные успешно распакованы.")
            
            # Удаляем архив
            os.remove(zip_path)
            
        except Exception as e:
            logger.critical(f"❌ Ошибка при скачивании/распаковке данных: {e}", exc_info=True)
            print(f"ERROR: DATA_DOWNLOAD_FAILED: {e}", flush=True)
            sys.exit(1)
    else:
        logger.info("✅ Все файлы данных на месте.")

# --- Инициализация ---
def initialize_engine():
    """Инициализирует RAGEngine."""
    global rag_engine_instance
    if rag_engine_instance is None:
        logger.info("🧠 Инициализация RAGEngine...")
        print("STATUS: INITIALIZING_ENGINE", flush=True)
        try:
            # Передаем DATA_DIR как base_dir
            rag_engine_instance = RAGEngine(languages=['ru', 'en'], base_dir=DATA_DIR)
            logger.info("✅ RAGEngine успешно инициализирован.")
            print("STATUS: READY", flush=True)
        except Exception as e:
            logger.critical(f"❌ Не удалось инициализировать RAGEngine: {e}", exc_info=True)
            rag_engine_instance = None 

# --- Эндпоинты API ---

@app.route('/api/search', methods=['POST'])
def search():
    if rag_engine_instance is None:
        return jsonify({'success': False, 'error': 'RAG Engine не инициализирован.'}), 503

    try:
        data = request.json
        query = data.get('query', '').strip()
        language = data.get('language', 'ru')
        top_k = int(data.get('top_k', 10))
        
        logger.info(f"📥 Поисковый запрос: query='{query}', lang='{language}', top_k={top_k}")

        if not query:
            return jsonify({'success': False, 'error': 'Пустой запрос'}), 400
        if language not in rag_engine_instance.languages:
            return jsonify({'success': False, 'error': f'Язык {language} не поддерживается'}), 400

        use_reranking = data.get('use_reranking', True)
        expand_query = data.get('expand_query', True)
        vector_distance_threshold = data.get('vector_distance_threshold', None)
        
        search_results = rag_engine_instance.search(
            query=query,
            language=language,
            top_k=top_k,
            use_reranking=use_reranking,
            expand_query=expand_query,
            vector_distance_threshold=vector_distance_threshold
        )
        
        return jsonify(search_results), 200

    except Exception as e:
        logger.error(f"❌ Ошибка в эндпоинте /api/search: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500

@app.route('/api/keyword_search', methods=['POST'])
def keyword_search():
    """Простой поиск по ключевым словам (точное совпадение)"""
    try:
        data = request.json
        query = data.get('query', '').strip()
        language = data.get('language', 'en')
        case_sensitive = data.get('case_sensitive', False)
        
        logger.info(f"📥 Keyword search request: query='{query}', lang='{language}'")

        if not query:
            return jsonify({'success': False, 'error': 'Пустой запрос'}), 400
        if language not in rag_engine_instance.languages:
            return jsonify({'success': False, 'error': f'Язык {language} не поддерживается'}), 400

        search_results = rag_engine_instance.keyword_search(
            query=query,
            language=language,
            case_sensitive=case_sensitive
        )
        
        return jsonify(search_results), 200

    except Exception as e:
        logger.error(f"❌ Ошибка в эндпоинте /api/keyword_search: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    if rag_engine_instance:
        status = {
            'status': 'healthy',
            'engine_status': 'initialized',
            'loaded_languages': list(rag_engine_instance.indices.keys())
        }
        return jsonify(status), 200
    else:
        status = {
            'status': 'unhealthy',
            'engine_status': 'not_initialized',
            'error': 'RAGEngine failed to initialize. Check logs.'
        }
        return jsonify(status), 503

@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    if not os.path.exists(CHAT_HISTORY_DIR):
        return jsonify([])

    conversations = []
    try:
        for filename in os.listdir(CHAT_HISTORY_DIR):
            if filename.endswith('.json'):
                filepath = os.path.join(CHAT_HISTORY_DIR, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        conversations.append({
                            'id': data.get('id'),
                            'title': data.get('title'),
                            'createdAt': data.get('createdAt')
                        })
                except (json.JSONDecodeError, IOError) as e:
                    logger.warning(f"Could not read or parse conversation file {filename}: {e}")
        
        conversations.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        return jsonify(conversations)

    except Exception as e:
        logger.error(f"Error listing conversations: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Could not list conversations'}), 500

@app.route('/api/conversations/<string:conversation_id>', methods=['GET'])
def get_conversation_by_id(conversation_id):
    filepath = os.path.join(CHAT_HISTORY_DIR, f"{conversation_id}.json")
    if not os.path.exists(filepath):
        return jsonify({'success': False, 'error': 'Conversation not found'}), 404

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        logger.error(f"Error reading conversation {conversation_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Could not read conversation file'}), 500

@app.route('/api/conversations', methods=['POST'])
def save_conversation():
    try:
        data = request.json
        conversation_id = data.get('id')
        if not conversation_id:
            return jsonify({'success': False, 'error': 'Conversation ID is required'}), 400

        if not os.path.exists(CHAT_HISTORY_DIR):
            os.makedirs(CHAT_HISTORY_DIR, exist_ok=True)

        filepath = os.path.join(CHAT_HISTORY_DIR, f"{conversation_id}.json")
        
        if 'title' not in data or 'createdAt' not in data or 'messages' not in data:
            return jsonify({'success': False, 'error': 'Missing required conversation fields'}), 400

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"💾 Conversation '{conversation_id}' saved successfully.")
        return jsonify({'success': True, 'id': conversation_id})

    except Exception as e:
        logger.error(f"Error saving conversation: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Could not save conversation'}), 500

@app.route('/api/conversations/<string:conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    filepath = os.path.join(CHAT_HISTORY_DIR, f"{conversation_id}.json")
    if not os.path.exists(filepath):
        return jsonify({'success': False, 'error': 'Conversation not found'}), 404

    try:
        os.remove(filepath)
        logger.info(f"🗑️ Conversation '{conversation_id}' deleted successfully.")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error deleting conversation {conversation_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Could not delete conversation file'}), 500


# --- Запуск сервера ---
if __name__ == '__main__':
    logger.info("="*80)
    logger.info(f"🚀 Запуск сервера Shukabase AI. Data dir: {DATA_DIR}")
    
    # 1. Проверяем и скачиваем данные
    ensure_data_exists()
    
    # 2. Инициализируем движок
    initialize_engine()
    
    if rag_engine_instance:
        logger.info("✅ Сервер готов к работе на http://localhost:5000")
        app.run(host='0.0.0.0', port=5000, debug=False)
    else:
        logger.critical("❌ Ошибка запуска сервера.")
        sys.exit(1)