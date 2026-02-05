# Tech Stack: Shukabase AI

## Frontend
- **Framework:** React 18
- **Language:** TypeScript
- **Build Tool:** Vite
- **Styling:** TailwindCSS
- **Key Libraries:** react-markdown, lucide-react, @google/genai

## Desktop Application
- **Framework:** Tauri v2
- **Language:** Rust (Core logic, system integrations)
- **Configuration:** tauri.conf.json (Auto-updates, capabilities)

## AI & RAG Backend
- **Language:** Python 3.10+
- **API Framework:** Flask (with flask-cors)
- **Vector Database:** FAISS (Local CPU index)
- **Search Algorithms:** Hybrid (Semantic via sentence-transformers + Keyword via rank_bm25)
- **Core AI Model:** Google Gemini 2.5 Flash
- **Data Processing:** pandas, numpy, nltk, transformers, torch

## Infrastructure & DevOps
- **Version Control:** Git
- **CI/CD:** GitHub Actions (workflows for build and code signing)
- **Platform Support:** Windows, macOS, Linux
