<div align="center">
  <img src="public/logo512.png" alt="Shukabase AI Logo" width="128" height="128" />
  <img src="public/parrot.png" alt="Shuka Parrot" width="128" height="128" />

  # 🦜 SHUKABASE AI

  **Intelligent Spiritual Research Assistant**
  <br>
  *Search, Study, and Connect with Srila Prabhupada's Books like never before.*

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](https://tauri.app/)
  [![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-orange)](https://v2.tauri.app/)
  [![Powered by Gemini](https://img.shields.io/badge/AI-Gemini%202.0-8E75B2)](https://deepmind.google/technologies/gemini/)

  [🇷🇺 Читать на русском](README_RU.md) • [📥 Download Latest Release](https://github.com/amritagopi/shukabase-gemini/releases/latest) • [💬 Report a Bug](https://github.com/amritagopi/shukabase-gemini/issues)

</div>

---

## 📖 About

**Shukabase AI** is a cutting-edge desktop application designed to bridge the gap between ancient wisdom and modern technology. It serves as your personal research assistant for studying the Srila Prabhupada's books (Bhagavad-gita, Srimad-Bhagavatam, Caitanya-caritamrta, and more).

Powered by **RAG (Retrieval-Augmented Generation)** technology, Shukabase allows you to ask complex questions in natural language and receive accurate, citation-backed answers directly from the scriptures.

## ✨ Key Features

- **🧠 Smart Semantic Search**: Go beyond keywords. Ask "What is the duty of a soul?" and get relevant verses across all books.
- **🦜 Interactive AI Assistant**: Chat with *Shuka*, your spiritual guide powered by **Google Gemini 2.0 Flash** (Free) or connect your own **OpenRouter** models.
- **📚 Rich Library Support**:
  - *Bhagavad-gita As It Is*
  - *Srimad-Bhagavatam*
  - *Sri Caitanya-caritamrta*
  - *Nectar of Devotion* & more.
- **🌍 Multilingual**: Full support for **English** and **Russian** languages (Interface + Content).
- **⚡ Performance First**: Built with **Rust** and **Tauri** for a lightweight, blazing-fast experience.
- **🔄 Auto-Updates**: The app keeps itself up-to-date automatically.

## 🛠️ Installation

### For Users
Simply head over to the [Releases Page](https://github.com/amritagopi/shukabase-gemini/releases) and download the installer for your operating system (`.exe` for Windows, `.dmg` for macOS).

### For Developers

1. **Prerequisites**:
   - Node.js (v18+)
   - Rust (latest stable)
   - Python 3.10+ (for the RAG backend)

2. **Clone & Install**:
   ```bash
   git clone https://github.com/amritagopi/shukabase-gemini.git
   cd shukabase-gemini
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file (optional, mostly handled by the app settings UI):
   ```env
   GEMINI_API_KEY=your_key_here
   ```

4. **Run Locally**:
   ```bash
   npm run tauri dev
   ```

## 🏗️ Architecture

- **Frontend**: React + TypeScript + TailwindCSS (Vite)
- **Core**: Tauri v2 (Rust)
- **AI Backend**: Python (Flask + FAISS + Google Gemini SDK)
- **Vector Database**: FAISS (Local embedding index)

## 🤝 Contributing

We welcome contributions! Whether it's fixing bugs, improving documentation, or suggesting new features – your help is appreciated.

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## ❤️ Acknowledgements

Dedicated to **His Divine Grace A.C. Bhaktivedanta Swami Prabhupada**, whose books are the heart of this project.

---

<div align="center">
  <i>Built with ❤️ for the Devotee Community</i>
</div>
