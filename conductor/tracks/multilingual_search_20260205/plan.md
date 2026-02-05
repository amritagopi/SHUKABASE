# Implementation Plan: Multilingual Search Enhancement

## Phase 1: Research & Setup [checkpoint: ee8b942]
- [x] Task: Анализ текущей реализации поиска в `rag_engine.py` и `rag_search_service.py` ee8b942
- [x] Task: Проверка структуры FAISS индексов для `ru` и `en` сегментов ee8b942
- [x] Task: Conductor - User Manual Verification 'Phase 1: Research & Setup' (Protocol in workflow.md) ee8b942

## Phase 2: RAG Backend Updates [checkpoint: 71564b2]
- [x] Task: Реализация метода расширения запроса (query expansion) для поддержки двух языков 71564b2
- [x] Task: Обновление `rag_engine.py` для параллельного поиска по двум индексам 71564b2
- [x] Task: Разработка механизма ранжирования кросс-языковых результатов 71564b2
- [x] Task: Написание тестов для проверки мультиязычного поиска в `test_engine.py` (реализовано в `test_multilingual.py`) 71564b2
- [x] Task: Conductor - User Manual Verification 'Phase 2: RAG Backend Updates' (Protocol in workflow.md) 71564b2

## Phase 3: Content Linking Logic [checkpoint: d66ee10]
- [x] Task: Реализация маппинга идентификаторов (ID) между русскими и английскими чанками книг d66ee10
- [x] Task: Обновление API ответа для включения связанных фрагментов на другом языке d66ee10
- [x] Task: Conductor - User Manual Verification 'Phase 3: Content Linking Logic' (Protocol in workflow.md) d66ee10

## Phase 4: UI/UX Integration
- [~] Task: Обновление компонентов поиска для отображения языковых меток
- [ ] Task: Добавление опции «Мультиязычный поиск» в настройки или панель поиска
- [ ] Task: Финальное тестирование всей цепочки от запроса до отображения
- [ ] Task: Conductor - User Manual Verification 'Phase 4: UI/UX Integration' (Protocol in workflow.md)
