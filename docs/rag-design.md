# RAG Design

## Why
The AI agent answers patient queries and grounds check-in assessments / doctor reports in medical
documents instead of unverifiable LLM memory.

## Stack (all free)
- **Vector store:** Qdrant **local mode** via `qdrant-client` (`QDRANT_PATH=data/qdrant`,
  gitignored; no server). Persistent on disk.
- **Embeds:** NVIDIA NIM `/v1/embeddings`, model `EMBEDDING_MODEL=nvidia/nv-embed-v1` (dim
  `EMBEDDING_DIM=4096`). If unavailable → deterministic keyword `fallback_embed` (pure token hashing).
- **Chunking:** `langchain_text_splitters.RecursiveCharacterTextSplitter` (`CHUNK_SIZE=500`,
  `CHUNK_OVERLAP=50`).
- **Corpus:** `backend/knowledge/*.md`.

## Modules (`backend/app/rag/`)
- `vector_store.ensure_collection()` — creates the collection; **preserves data unless the vector
  size changed** (do NOT change back to `recreate_collection` or you wipe the index every boot).
- `embeddings.embed_texts()` + `embed_texts_or_fallback()`.
- `indexer.index_knowledge_base()` — content-hash idempotent (skips unchanged docs), never raises.
  Wired into the `backend/main.py` lifespan.
- `retriever.retrieve(query, top_k)` — Qdrant search, keyword fallback (`keyword_retrieve`).
- `retriever.retrieve_for_checkin(answers)` — turns check-in answers into a retrieval query.

## Usage
- Adaptive questions + vision advice: pull 1 guideline excerpt.
- Patient Q&A: `answer_from_knowledge` (`POST /api/patient/conversation/ask`).
- Doctor report: `report_agent` pulls 3 excerpts from the check-in raw input.

## Gotchas
- Qdrant point IDs are 64-bit ints (not strings/UUIDs).
- Point IDs must NOT be strings or Qdrant rejects them.
- If `EMBEDDING_MODEL` returns a different dimension, update `EMBEDDING_DIM` — `ensure_collection`
  auto-recreates.
- The NVIDIA embed key is the same `NVIDIA_API_KEY`; if it 404s on a model, the keyword fallback
  keeps RAG working (silently degraded).