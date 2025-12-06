# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

hidden_imports = []
datas = []
binaries = []

# 1. Sentence Transformers (critical)
hidden_imports += collect_submodules('sentence_transformers')
datas += collect_data_files('sentence_transformers')

# 2. HuggingFace Hub & Safetensors (critical for model loading)
hidden_imports += collect_submodules('huggingface_hub')
datas += collect_data_files('huggingface_hub')
hidden_imports += collect_submodules('safetensors')

# 3. Tokenizers (Rust extension)
hidden_imports += ['tokenizers', 'tokenizers.models', 'tokenizers.decoders', 
                   'tokenizers.normalizers', 'tokenizers.pre_tokenizers', 
                   'tokenizers.processors', 'tokenizers.trainers']
datas += collect_data_files('tokenizers')

# 4. NLTK (Stemmers are dynamic)
hidden_imports += collect_submodules('nltk')
hidden_imports += collect_submodules('nltk.stem')
hidden_imports += collect_submodules('nltk.tokenize')
datas += collect_data_files('nltk')

# 5. Flask & Web
hidden_imports += ['flask_cors', 'dotenv', 'werkzeug', 'jinja2', 'markupsafe']

# 6. Core ML & Utils
hidden_imports += collect_submodules('transformers')
hidden_imports += collect_submodules('torch')
hidden_imports += collect_submodules('google.generativeai')
hidden_imports += collect_submodules('faiss')
hidden_imports += collect_submodules('rank_bm25')
hidden_imports += collect_submodules('sklearn')
hidden_imports += ['numpy', 'regex', 'requests', 'tqdm', 
                   'filelock', 'packaging', 'typing_extensions', 'pickle']

# Data files
datas += collect_data_files('transformers')
datas += collect_data_files('rank_bm25')

a = Analysis(
    ['rag\\rag_api_server.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='rag_api_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
