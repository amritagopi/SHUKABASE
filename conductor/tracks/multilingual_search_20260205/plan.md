# Implementation Plan: Multilingual Search Enhancement

## Phase 1: Research & Setup
- [x] Task: Анализ текущей реализации поиска в `rag_engine.py` и `rag_search_service.py`
- [x] Task: Проверка структуры FAISS индексов для `ru` и `en` сегментов
- [~] Task: Conductor - User Manual Verification 'Phase 1: Research & Setup' (Protocol in workflow.md)

## Phase 2: RAG Backend Updates
- [ ] Task: Реализация метода расширения запроса (query expansion) для поддержки двух языков
- [ ] Task: Обновление `rag_engine.py` для параллельного поиска по двум индексам
- [ ] Task: Разработка механизма ранжирования кросс-языковых результатов
- [ ] Task: Написание тестов для проверки мультиязычного поиска в `test_engine.py`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: RAG Backend Updates' (Protocol in workflow.md)

## Phase 3: Content Linking Logic
- [ ] Task: Реализация маппинга идентификаторов (ID) между русскими и английскими чанками книг
- [ ] Task: Обновление API ответа для включения связанных фрагментов на другом языке
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Content Linking Logic' (Protocol in workflow.md)

## Phase 4: UI/UX Integration
- [ ] Task: Обновление компонентов поиска для отображения языковых меток
- [ ] Task: Добавление опции «Мультиязычный поиск» в настройки или панель поиска
- [ ] Task: Финальное тестирование всей цепочки от запроса до отображения
- [ ] Task: Conductor - User Manual Verification 'Phase 4: UI/UX Integration' (Protocol in workflow.md)
