#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔎 REST API ДЛЯ RAG ПОИСКА

Этот сервер предоставляет API для поиска, используя централизованный RAGEngine.
Поддерживает "Мастер настройки" для первого запуска.

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
import threading
import time
from pathlib import Path

# --- Настройка логгирования (СРАЗУ) ---
# Определяем путь к логам до всего остального
APP_NAME = "Shukabase"
if getattr(sys, 'frozen', False):
    base_path = os.path.join(os.getenv('LOCALAPPDATA'), APP_NAME)
else:
    base_path = os.path.dirname(os.path.abspath(__file__))

log_dir = os.path.join(base_path, "logs")
if not os.path.exists(log_dir):
    try:
        os.makedirs(log_dir, exist_ok=True)
    except:
        pass # Если не можем создать, пишем в stderr

log_file = os.path.join(log_dir, "rag_api_server.log")

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8', mode='a'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --- Добавляем корень проекта в sys.path ---
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    # ⚠️ КРИТИЧЕСКИЙ ИМПОРТ ⚠️
    try:
        from rag.rag_engine import RAGEngine
    except ImportError:
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from rag_engine import RAGEngine
except Exception as e:
    logger.critical(f"🔥 FATAL IMPORT ERROR: {e}", exc_info=True)
    # Пытаемся продолжить чтобы сервер запустился и отдал лог, но без движка
    RAGEngine = None 

# --- Константы ---

# ID архива данных
DATA_ARCHIVE_ID = os.environ.get("SHUKABASE_DATA_ID", "1eqZDHhw2HbpaiWydGZXKvTPJf6EIShA0")

DATA_DIR = os.path.join(base_path, "rag_data") if getattr(sys, 'frozen', False) else base_path
CHAT_HISTORY_DIR = os.path.join(base_path, "chat_history")

# --- Глобальные переменные ---
app = Flask(__name__)
CORS(app)
rag_engine_instance = None

# Состояние процесса установки
setup_state = {
    "is_downloading": False,
    "progress": 0,
    "status": "idle", # idle, downloading, extracting, completed, error
    "error": None,
    "current_file": ""
}

# --- Функции для скачивания данных ---

# --- Функции для скачивания данных (Улучшенные) ---

# --- Ссылки на данные (GitHub Releases) ---
DATA_URLS = {
    'all': "https://github.com/amritagopi/shukabase-install-data/releases/download/data/shukabase_data_multilingual.zip",
    'ru': "https://github.com/amritagopi/shukabase-install-data/releases/download/data/shukabase_data_ru.zip",
    'en': "https://github.com/amritagopi/shukabase-install-data/releases/download/data/shukabase_data_en.zip"
}

# --- Функции для скачивания данных ---

def download_file_direct(url, destination):
    session = requests.Session()
    logger.info(f"Downloading from: {url}")
    
    try:
        response = session.get(url, stream=True, timeout=30)
        response.raise_for_status() # Check for HTTP errors
        
        CHUNK_SIZE = 32768
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        # Если сервер не отдает размер, используем примерный (500MB)
        if total_size == 0:
            total_size = 500 * 1024 * 1024 
        
        with open(destination, "wb") as f:
            for chunk in response.iter_content(CHUNK_SIZE):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    # Обновляем прогресс (0-80% выделяем на скачивание)
                    progress = min(80, int((downloaded / total_size) * 80))
                    setup_state["progress"] = progress
                    setup_state["status"] = "downloading"
                    
        logger.info("Download saved successfully.")
        
    except Exception as e:
        logger.error(f"❌ Download error: {e}")
        raise e

def background_download_task(language_mode):
    global setup_state
    setup_state["is_downloading"] = True
    setup_state["status"] = "downloading"
    setup_state["progress"] = 0
    setup_state["error"] = None
    
    try:
        if not os.path.exists(DATA_DIR):
            os.makedirs(DATA_DIR, exist_ok=True)

        zip_path = os.path.join(DATA_DIR, "shukabase_data.zip")
        
        # Выбираем URL
        download_url = DATA_URLS.get(language_mode, DATA_URLS['all'])
        
        logger.info(f"Starting download for mode: {language_mode} from {download_url}")
        
        download_file_direct(download_url, zip_path)
        
        # Проверка целостности архива ПЕРЕД извлечением
        if not zipfile.is_zipfile(zip_path):
             with open(zip_path, 'rb') as f:
                 head = f.read(200)
             logger.error(f"File is not a valid ZIP. Header: {head}")
             setup_state["error"] = "Downloaded file is corrupted or not a zip file. Check logs."
             setup_state["status"] = "error"
             setup_state["is_downloading"] = False
             return

        setup_state["status"] = "extracting"
        setup_state["progress"] = 85
        
        logger.info("Extracting archive...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(DATA_DIR)
            
            # Smart Flattening: Find where the key file is
            found_root = None
            for root, dirs, files in os.walk(DATA_DIR):
                if any(f.startswith('faiss_index_') for f in files):
                    found_root = root
                    break
            
            if found_root and found_root != DATA_DIR:
                logger.info(f"Found data in nested folder: {found_root}. Moving to {DATA_DIR}...")
                for item in os.listdir(found_root):
                    s = os.path.join(found_root, item)
                    d = os.path.join(DATA_DIR, item)
                    if os.path.exists(d):
                        if os.path.isdir(d):
                            shutil.rmtree(d)
                        else:
                            os.remove(d)
                    shutil.move(s, d)
                # Cleanup empty dirs
                try:
                    shutil.rmtree(found_root)
                except:
                    pass

        os.remove(zip_path)
        
        setup_state["progress"] = 95
        setup_state["status"] = "initializing"
        
        # Инициализируем движок
        # Важно: это может занять время, поэтому делаем это здесь
        if initialize_engine():
            setup_state["progress"] = 100
            setup_state["status"] = "completed"
        else:
            setup_state["status"] = "error"
            setup_state["error"] = "Initialization failed. Check logs for missing files."
            
        setup_state["is_downloading"] = False
        
    except Exception as e:
        logger.error(f"Setup failed: {e}", exc_info=True)
        setup_state["status"] = "error"
        setup_state["error"] = str(e)
        setup_state["is_downloading"] = False

# --- Инициализация ---
def initialize_engine():
    global rag_engine_instance
    try:
        # Проверяем наличие основных файлов
        required = ["faiss_index", "chunked_scriptures"] # Check partial names
        present_files = os.listdir(DATA_DIR) if os.path.exists(DATA_DIR) else []
        logger.info(f"Files in DATA_DIR: {present_files}")
        
        # Determine strict requirements based on what we see (multilingual vs single)
        # But minimally we need at least one index and one json
        has_index = any(f.startswith("faiss_index") for f in present_files)
        has_json = any(f.startswith("chunked_scriptures") for f in present_files)
        
        if not (has_index and has_json):
            logger.warning(f"Missing essential files. Present: {present_files}")
            return False

        logger.info("🧠 Initializing RAGEngine...")
        rag_engine_instance = RAGEngine(languages=['ru', 'en'], base_dir=DATA_DIR)
        logger.info("✅ RAGEngine initialized successfully.")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to initialize RAGEngine: {e}", exc_info=True)
        return False

# --- API Endpoints ---

@app.route('/api/setup/status', methods=['GET'])
def get_setup_status():
    is_installed = False
    if os.path.exists(DATA_DIR):
        # Простая проверка наличия ключевых файлов
        # Проверяем наличие любого индекса, а не только ru
        if any(f.startswith("faiss_index") for f in os.listdir(DATA_DIR)):
            is_installed = True
            
    return jsonify({
        "installed": is_installed,
        "engine_ready": rag_engine_instance is not None,
        "setup_state": setup_state
    })

@app.route('/api/setup/download', methods=['POST'])
def start_download():
    if setup_state["is_downloading"]:
        return jsonify({"error": "Download already in progress"}), 400
        
    lang = request.json.get('language', 'all')
    thread = threading.Thread(target=background_download_task, args=(lang,))
    thread.start()
    
    return jsonify({"success": True, "message": "Download started"})

@app.route('/api/search', methods=['POST'])
def search():
    if rag_engine_instance is None:
        # Пытаемся инициализировать, если вдруг файлы появились
        if not initialize_engine():
            return jsonify({'success': False, 'error': 'Knowledge base not loaded. Please complete setup.'}), 503

    try:
        data = request.json
        query = data.get('query', '').strip()
        language = data.get('language', 'ru')
        top_k = int(data.get('top_k', 10))
        
        if not query:
            return jsonify({'success': False, 'error': 'Empty query'}), 400

        search_results = rag_engine_instance.search(
            query=query,
            language=language,
            top_k=top_k,
            api_key=data.get('api_key') # Pass API key from request
        )
        return jsonify(search_results), 200
    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'engine_initialized': rag_engine_instance is not None
    }), 200

# --- Остальные эндпоинты (conversations) без изменений ---
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
                except Exception:
                    pass
        conversations.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        return jsonify(conversations)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations/<string:conversation_id>', methods=['GET'])
def get_conversation_by_id(conversation_id):
    filepath = os.path.join(CHAT_HISTORY_DIR, f"{conversation_id}.json")
    if not os.path.exists(filepath):
        return jsonify({'error': 'Not found'}), 404
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations', methods=['POST'])
def save_conversation():
    try:
        data = request.json
        conversation_id = data.get('id')
        if not os.path.exists(CHAT_HISTORY_DIR):
            os.makedirs(CHAT_HISTORY_DIR, exist_ok=True)
        filepath = os.path.join(CHAT_HISTORY_DIR, f"{conversation_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({'success': True, 'id': conversation_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations/<string:conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    filepath = os.path.join(CHAT_HISTORY_DIR, f"{conversation_id}.json")
    if os.path.exists(filepath):
        os.remove(filepath)
        return jsonify({'success': True})
    return jsonify({'error': 'Not found'}), 404

if __name__ == '__main__':
    logger.info("="*80)
    logger.info(f"🚀 Shukabase AI Server Starting. Data dir: {DATA_DIR}")
    
    # ВАЖНО: Выводим этот статус, чтобы Rust понял, что сервер жив
    print("STATUS: SERVER_STARTED", flush=True)

    # Инициализируем в фоне, чтобы не задерживать старт сервера и сплэша
    threading.Thread(target=initialize_engine, daemon=True).start()
    
    app.run(host='0.0.0.0', port=5000, debug=False)