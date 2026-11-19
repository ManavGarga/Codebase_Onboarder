import os
import time
import json
import hashlib
from typing import Dict, List, Set, Any, Optional
from fastapi import APIRouter, HTTPException
from app.core.logging import logger
from app.models.schemas import (
    IngestionRequest,
    IngestionResponse,
    KnowledgeGraphData,
    SymbolDefinition,
    RouteDefinition,
    DatabaseModelDefinition,
    ImportRelationship,
    CodeChunk,
)
from app.ast_engine.parser import ast_manager
from app.ast_engine.extractors.symbol_extractor import symbol_extractor
from app.ast_engine.extractors.route_extractor import route_extractor
from app.ast_engine.extractors.model_extractor import model_extractor
from app.ast_engine.extractors.dependency_extractor import dependency_extractor
from app.graph.knowledge_graph import knowledge_graph_builder
from app.chunker.code_chunker import code_chunker
from app.retrieval.vector_store import vector_store
from app.retrieval.hybrid_search import hybrid_retriever

router = APIRouter(prefix="", tags=["Analysis & Ingestion"])

# Persistent stores for active repositories (backed by disk and in-memory cache)
from app.storage import (
    persistent_graphs,
    persistent_symbols,
    persistent_routes,
    persistent_models,
    persistent_frameworks,
    persistent_states,
    delete_all_repository_metadata,
)

REPO_GRAPHS = persistent_graphs
REPO_SYMBOLS = persistent_symbols
REPO_ROUTES = persistent_routes
REPO_MODELS = persistent_models
REPO_FRAMEWORKS = persistent_frameworks
REPO_STATES = persistent_states


IGNORED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "venv",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".next",
    ".nuxt",
    ".idea",
    ".vscode",
    "target",
    "vendor",
}

IGNORED_FILES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "poetry.lock",
    "Cargo.lock",
    ".DS_Store",
    ".onboarder_index_cache.json",
}

IGNORED_SECRET_FILES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.staging",
    ".env.test",
    "id_rsa",
    "id_dsa",
    "id_ed25519",
    "credentials.json",
    "token.json",
}

MAX_REPOSITORY_FILES = 2000
MAX_REPOSITORY_BYTES = 100 * 1024 * 1024  # 100 MB


def compute_file_hash(full_path: str) -> str:
    """Computes SHA-256 hash of file contents to detect exact modifications."""
    try:
        hasher = hashlib.sha256()
        with open(full_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception:
        return ""


def get_cache_file_path(repo_path: str) -> str:
    return os.path.join(repo_path, ".onboarder_index_cache.json")


def save_repo_state(repo_path: str, repository_id: str, state: Dict[str, Any]) -> None:
    """Persists indexing state to memory and disk cache."""
    REPO_STATES[repository_id] = state
    cache_path = get_cache_file_path(repo_path)
    try:
        # Serialize state to JSON
        serializable = {
            "commit_sha": state.get("commit_sha"),
            "file_hashes": state.get("file_hashes", {}),
            "file_symbols": {
                f: [s.model_dump() for s in syms] for f, syms in state.get("file_symbols", {}).items()
            },
            "file_routes": {
                f: [r.model_dump() for r in routes] for f, routes in state.get("file_routes", {}).items()
            },
            "file_models": {
                f: [m.model_dump() for m in models] for f, models in state.get("file_models", {}).items()
            },
            "file_imports": {
                f: [i.model_dump() for i in imps] for f, imps in state.get("file_imports", {}).items()
            },
            "file_chunks": {
                f: [c.model_dump() for c in chks] for f, chks in state.get("file_chunks", {}).items()
            },
            "frameworks": state.get("frameworks", []),
            "languages_count": state.get("languages_count", {}),
        }
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(serializable, f)
    except Exception as e:
        logger.warning(f"Failed to persist index cache for {repository_id}: {e}")


def load_repo_state(repo_path: str, repository_id: str) -> Optional[Dict[str, Any]]:
    """Loads indexing state from memory or disk cache."""
    if repository_id in REPO_STATES:
        return REPO_STATES[repository_id]

    cache_path = get_cache_file_path(repo_path)
    if not os.path.exists(cache_path):
        return None

    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        state = {
            "commit_sha": data.get("commit_sha"),
            "file_hashes": data.get("file_hashes", {}),
            "file_symbols": {
                f: [SymbolDefinition(**s) for s in syms] for f, syms in data.get("file_symbols", {}).items()
            },
            "file_routes": {
                f: [RouteDefinition(**r) for r in routes] for f, routes in data.get("file_routes", {}).items()
            },
            "file_models": {
                f: [DatabaseModelDefinition(**m) for m in models] for f, models in data.get("file_models", {}).items()
            },
            "file_imports": {
                f: [ImportRelationship(**i) for i in imps] for f, imps in data.get("file_imports", {}).items()
            },
            "file_chunks": {
                f: [CodeChunk(**c) for c in chks] for f, chks in data.get("file_chunks", {}).items()
            },
            "frameworks": data.get("frameworks", []),
            "languages_count": data.get("languages_count", {}),
        }
        REPO_STATES[repository_id] = state
        return state
    except Exception as e:
        logger.warning(f"Failed to load index cache from {cache_path}: {e}")
        return None


def detect_frameworks(files: List[str], repo_path: str) -> List[str]:
    frameworks: Set[str] = set()

    pkg_json = os.path.join(repo_path, "package.json")
    if os.path.exists(pkg_json):
        try:
            with open(pkg_json, "r", encoding="utf-8") as f:
                content = f.read()
                if "react" in content:
                    frameworks.add("React")
                if "express" in content:
                    frameworks.add("Express")
                if "next" in content:
                    frameworks.add("Next.js")
                if "tailwindcss" in content:
                    frameworks.add("Tailwind CSS")
                if "mongoose" in content:
                    frameworks.add("Mongoose")
                if "prisma" in content:
                    frameworks.add("Prisma")
                if "vite" in content:
                    frameworks.add("Vite")
        except Exception:
            pass

    req_txt = os.path.join(repo_path, "requirements.txt")
    if os.path.exists(req_txt):
        try:
            with open(req_txt, "r", encoding="utf-8") as f:
                content = f.read().lower()
                if "fastapi" in content:
                    frameworks.add("FastAPI")
                if "django" in content:
                    frameworks.add("Django")
                if "flask" in content:
                    frameworks.add("Flask")
                if "sqlalchemy" in content:
                    frameworks.add("SQLAlchemy")
                if "langgraph" in content or "langchain" in content:
                    frameworks.add("LangGraph")
        except Exception:
            pass

    return sorted(list(frameworks))


def parse_manifest_or_doc_chunk(
    full_path: str, rel_path: str, req: IngestionRequest
) -> Optional[CodeChunk]:
    """Safely extracts text and creates a documentation or manifest chunk."""
    if rel_path in ("package.json", "Readme.md", "README.md") or rel_path.endswith(".json"):
        try:
            if os.path.islink(full_path) or os.path.getsize(full_path) > 500 * 1024:
                return None
            with open(full_path, "rb") as f:
                raw_bytes = f.read(500 * 1024)
            text_content = raw_bytes.decode("utf-8", errors="replace")
            text_content = code_chunker.scrub_secrets(text_content)
            if text_content.strip():
                return CodeChunk(
                    id=f"{req.repository_id}:{rel_path}:1",
                    user_id=req.user_id,
                    repository_id=req.repository_id,
                    file_path=rel_path,
                    language=os.path.splitext(rel_path)[1].replace(".", "") or "text",
                    symbol_name=os.path.basename(rel_path),
                    node_type="manifest" if "package.json" in rel_path else "documentation",
                    start_line=1,
                    end_line=len(text_content.splitlines()),
                    signature=f"file {rel_path}",
                    content=text_content[:2500],
                    metadata={"is_manifest": True},
                )
        except Exception:
            pass
    return None


@router.post("/analyze", response_model=IngestionResponse)
def analyze_repository(req: IngestionRequest):
    start_time = time.time()
    logger.info(f"Starting AST analysis for repo {req.repository_id} at {req.repo_path}")

    if not os.path.exists(req.repo_path):
        raise HTTPException(status_code=404, detail=f"Repository path '{req.repo_path}' does not exist.")

    # 1. Discover all active files in repo
    all_files: List[str] = []
    canonical_repo_root = os.path.realpath(req.repo_path)
    cumulative_size = 0

    for root, dirs, files in os.walk(req.repo_path, followlinks=False):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
        for file in files:
            lower_file = file.lower()
            if (
                lower_file in IGNORED_SECRET_FILES
                or lower_file.startswith(".env")
                or lower_file.endswith((".pem", ".key", ".cert", ".pfx", ".p12"))
            ):
                continue

            if file in IGNORED_FILES or file.startswith("."):
                continue

            full_path = os.path.join(root, file)

            if os.path.islink(full_path):
                continue

            real_file_path = os.path.realpath(full_path)
            if not real_file_path.startswith(canonical_repo_root):
                continue

            try:
                fsize = os.path.getsize(full_path)
                cumulative_size += fsize
                if cumulative_size > MAX_REPOSITORY_BYTES:
                    logger.warning(f"Security: Repository size exceeded {MAX_REPOSITORY_BYTES} bytes.")
                    break
            except Exception:
                pass

            rel_path = os.path.relpath(full_path, req.repo_path)
            all_files.append(rel_path)

            if len(all_files) >= MAX_REPOSITORY_FILES:
                break

        if len(all_files) >= MAX_REPOSITORY_FILES or cumulative_size > MAX_REPOSITORY_BYTES:
            break

    all_files_set = set(all_files)
    detected_frameworks = detect_frameworks(all_files, req.repo_path)

    # 2. Compute current file content hashes
    current_hashes: Dict[str, str] = {}
    for rel_path in all_files:
        full_path = os.path.join(req.repo_path, rel_path)
        current_hashes[rel_path] = compute_file_hash(full_path)

    # 3. Check for previous indexing state
    prev_state = load_repo_state(req.repo_path, req.repository_id)

    if prev_state is not None:
        # === INCREMENTAL INDEXING PATH ===
        prev_hashes: Dict[str, str] = prev_state.get("file_hashes", {})
        prev_files = set(prev_hashes.keys())
        curr_files = set(current_hashes.keys())

        added_files = sorted(list(curr_files - prev_files))
        deleted_files = sorted(list(prev_files - curr_files))
        common_files = curr_files & prev_files
        changed_files = sorted([f for f in common_files if current_hashes[f] != prev_hashes[f]])
        skipped_files = sorted([f for f in common_files if current_hashes[f] == prev_hashes[f]])

        logger.info(
            f"[Incremental Indexing] Repo {req.repository_id}: "
            f"Total: {len(all_files)}, Changed: {len(changed_files)}, Added: {len(added_files)}, "
            f"Deleted: {len(deleted_files)}, Skipped: {len(skipped_files)}"
        )

        # Case 3A: Completely Unchanged Repository
        if not added_files and not changed_files and not deleted_files:
            elapsed = round(time.time() - start_time, 3)
            logger.info(
                f"[Incremental Indexing] Repository {req.repository_id} is unchanged. "
                f"Skipping all {len(skipped_files)} files; 0 embeddings regenerated."
            )

            # Ensure memory caches are loaded from state
            if req.repository_id not in REPO_GRAPHS:
                all_symbols = [s for syms in prev_state.get("file_symbols", {}).values() for s in syms]
                all_routes = [r for rts in prev_state.get("file_routes", {}).values() for r in rts]
                all_models = [m for mdls in prev_state.get("file_models", {}).values() for m in mdls]
                all_imports = [i for imps in prev_state.get("file_imports", {}).values() for i in imps]
                all_chunks = [c for chks in prev_state.get("file_chunks", {}).values() for c in chks]

                REPO_GRAPHS[req.repository_id] = knowledge_graph_builder.build_graph(
                    repository_id=req.repository_id,
                    files=all_files,
                    symbols=all_symbols,
                    routes=all_routes,
                    models=all_models,
                    imports=all_imports,
                )
                REPO_SYMBOLS[req.repository_id] = all_symbols
                REPO_ROUTES[req.repository_id] = all_routes
                REPO_MODELS[req.repository_id] = all_models
                REPO_FRAMEWORKS[req.repository_id] = prev_state.get("frameworks", detected_frameworks)
                hybrid_retriever.build_bm25_index(req.repository_id, all_chunks, user_id=req.user_id)

            total_chunks = sum(len(c) for c in prev_state.get("file_chunks", {}).values())
            total_symbols = sum(len(s) for s in prev_state.get("file_symbols", {}).values())
            total_routes = sum(len(r) for r in prev_state.get("file_routes", {}).values())
            total_models = sum(len(m) for m in prev_state.get("file_models", {}).values())

            return IngestionResponse(
                success=True,
                repository_id=req.repository_id,
                total_files_analyzed=len(all_files),
                total_symbols_extracted=total_symbols,
                total_routes_detected=total_routes,
                total_models_detected=total_models,
                total_chunks_indexed=total_chunks,
                languages_detected=prev_state.get("languages_count", {}),
                frameworks_detected=prev_state.get("frameworks", detected_frameworks),
                processing_time_sec=elapsed,
                is_incremental=True,
                total_files=len(all_files),
                changed_files=0,
                added_files=0,
                deleted_files=0,
                skipped_files=len(skipped_files),
                embeddings_regenerated=0,
                commit_sha=req.commit_sha or prev_state.get("commit_sha"),
                affected_downstream_files=[],
            )

        # Case 3B: Incremental Update (Process only added and changed files)
        file_symbols = prev_state.get("file_symbols", {})
        file_routes = prev_state.get("file_routes", {})
        file_models = prev_state.get("file_models", {})
        file_imports = prev_state.get("file_imports", {})
        file_chunks = prev_state.get("file_chunks", {})
        file_hashes = prev_state.get("file_hashes", {})
        languages_count = dict(prev_state.get("languages_count", {}))

        # 1. Clean up deleted files
        if deleted_files:
            vector_store.delete_file_chunks(req.user_id, req.repository_id, deleted_files)
            for df in deleted_files:
                file_symbols.pop(df, None)
                file_routes.pop(df, None)
                file_models.pop(df, None)
                file_imports.pop(df, None)
                file_chunks.pop(df, None)
                file_hashes.pop(df, None)

        # 2. Clean up modified files before re-extracting
        if changed_files:
            vector_store.delete_file_chunks(req.user_id, req.repository_id, changed_files)
            for cf in changed_files:
                file_symbols.pop(cf, None)
                file_routes.pop(cf, None)
                file_models.pop(cf, None)
                file_imports.pop(cf, None)
                file_chunks.pop(cf, None)
                file_hashes.pop(cf, None)

        # 3. Process ONLY affected files (added + changed)
        files_to_process = added_files + changed_files
        newly_created_chunks: List[CodeChunk] = []

        for rel_path in files_to_process:
            full_path = os.path.join(req.repo_path, rel_path)
            file_hashes[rel_path] = current_hashes[rel_path]
            parse_res = ast_manager.parse_file(full_path)

            if not parse_res:
                manifest_chunk = parse_manifest_or_doc_chunk(full_path, rel_path, req)
                if manifest_chunk:
                    file_chunks[rel_path] = [manifest_chunk]
                    newly_created_chunks.append(manifest_chunk)
                continue

            tree, lang, code_bytes = parse_res
            languages_count[lang] = languages_count.get(lang, 0) + 1
            root_node = tree.root_node

            f_syms = symbol_extractor.extract_symbols(root_node, lang, rel_path, code_bytes)
            f_routes = route_extractor.extract_routes(root_node, lang, rel_path, code_bytes)
            f_models = model_extractor.extract_models(root_node, lang, rel_path, code_bytes)
            f_imports = dependency_extractor.extract_imports(root_node, lang, rel_path, code_bytes)

            for imp in f_imports:
                imp.resolved_target_file = dependency_extractor.resolve_relative_path(
                    rel_path, imp.imported_module, all_files_set
                )

            f_chunks = code_chunker.chunk_file(
                user_id=req.user_id,
                repository_id=req.repository_id,
                file_path=rel_path,
                language=lang,
                code_bytes=code_bytes,
                symbols=f_syms,
                tree=tree,
            )

            file_symbols[rel_path] = f_syms
            file_routes[rel_path] = f_routes
            file_models[rel_path] = f_models
            file_imports[rel_path] = f_imports
            file_chunks[rel_path] = f_chunks
            newly_created_chunks.extend(f_chunks)

        # 4. Generate embeddings ONLY for newly created or modified chunks
        embeddings_regenerated = 0
        if newly_created_chunks:
            embeddings_regenerated = vector_store.index_chunks(newly_created_chunks)
            logger.info(
                f"[Incremental Indexing] Generated {embeddings_regenerated} new embeddings "
                f"for {len(files_to_process)} affected files."
            )

        # 5. Merge all files (preserved + updated) to reconstruct knowledge graph
        all_symbols = [s for syms in file_symbols.values() for s in syms]
        all_routes = [r for rts in file_routes.values() for r in rts]
        all_models = [m for mdls in file_models.values() for m in mdls]
        all_imports = [i for imps in file_imports.values() for i in imps]
        all_chunks = [c for chks in file_chunks.values() for c in chks]

        # Re-resolve imports against new file set
        for imp in all_imports:
            imp.resolved_target_file = dependency_extractor.resolve_relative_path(
                imp.source_file, imp.imported_module, all_files_set
            )

        # Rebuild Knowledge Graph
        graph_data = knowledge_graph_builder.build_graph(
            repository_id=req.repository_id,
            files=all_files,
            symbols=all_symbols,
            routes=all_routes,
            models=all_models,
            imports=all_imports,
        )

        # 6. Recalculate affected downstream relationships
        affected_downstream: Set[str] = set()
        for affected_file in changed_files + deleted_files:
            impact = knowledge_graph_builder.compute_downstream_impact(affected_file, graph_data)
            affected_downstream.update(impact.get("affected_files", []))

        affected_downstream_list = sorted(list(affected_downstream))

        # 7. Rebuild BM25 Sparse Index
        hybrid_retriever.build_bm25_index(req.repository_id, all_chunks, user_id=req.user_id)

        # 8. Cache in memory
        REPO_GRAPHS[req.repository_id] = graph_data
        REPO_SYMBOLS[req.repository_id] = all_symbols
        REPO_ROUTES[req.repository_id] = all_routes
        REPO_MODELS[req.repository_id] = all_models
        REPO_FRAMEWORKS[req.repository_id] = detected_frameworks

        # 9. Persist updated state
        new_state = {
            "commit_sha": req.commit_sha or prev_state.get("commit_sha"),
            "file_hashes": file_hashes,
            "file_symbols": file_symbols,
            "file_routes": file_routes,
            "file_models": file_models,
            "file_imports": file_imports,
            "file_chunks": file_chunks,
            "frameworks": detected_frameworks,
            "languages_count": languages_count,
        }
        save_repo_state(req.repo_path, req.repository_id, new_state)

        elapsed = round(time.time() - start_time, 2)
        logger.info(
            f"[Incremental Indexing Complete] Repo {req.repository_id}: "
            f"{len(changed_files)} changed, {len(added_files)} added, {len(deleted_files)} deleted, "
            f"{len(skipped_files)} skipped, {embeddings_regenerated} embeddings in {elapsed}s"
        )

        return IngestionResponse(
            success=True,
            repository_id=req.repository_id,
            total_files_analyzed=len(all_files),
            total_symbols_extracted=len(all_symbols),
            total_routes_detected=len(all_routes),
            total_models_detected=len(all_models),
            total_chunks_indexed=len(all_chunks),
            languages_detected=languages_count,
            frameworks_detected=detected_frameworks,
            processing_time_sec=elapsed,
            is_incremental=True,
            total_files=len(all_files),
            changed_files=len(changed_files),
            added_files=len(added_files),
            deleted_files=len(deleted_files),
            skipped_files=len(skipped_files),
            embeddings_regenerated=embeddings_regenerated,
            commit_sha=req.commit_sha or prev_state.get("commit_sha"),
            affected_downstream_files=affected_downstream_list,
        )

    # === FULL INGESTION PATH (First Run) ===
    logger.info(f"Full initial ingestion for {req.repository_id}: analyzing {len(all_files)} files...")
    file_symbols: Dict[str, List[SymbolDefinition]] = {}
    file_routes: Dict[str, List[RouteDefinition]] = {}
    file_models: Dict[str, List[DatabaseModelDefinition]] = {}
    file_imports: Dict[str, List[ImportRelationship]] = {}
    file_chunks: Dict[str, List[CodeChunk]] = {}
    languages_count: Dict[str, int] = {}
    all_chunks: List[CodeChunk] = []

    for rel_path in all_files:
        full_path = os.path.join(req.repo_path, rel_path)
        parse_res = ast_manager.parse_file(full_path)

        if not parse_res:
            manifest_chunk = parse_manifest_or_doc_chunk(full_path, rel_path, req)
            if manifest_chunk:
                file_chunks[rel_path] = [manifest_chunk]
                all_chunks.append(manifest_chunk)
            continue

        tree, lang, code_bytes = parse_res
        languages_count[lang] = languages_count.get(lang, 0) + 1
        root_node = tree.root_node

        f_syms = symbol_extractor.extract_symbols(root_node, lang, rel_path, code_bytes)
        f_routes = route_extractor.extract_routes(root_node, lang, rel_path, code_bytes)
        f_models = model_extractor.extract_models(root_node, lang, rel_path, code_bytes)
        f_imports = dependency_extractor.extract_imports(root_node, lang, rel_path, code_bytes)

        for imp in f_imports:
            imp.resolved_target_file = dependency_extractor.resolve_relative_path(
                rel_path, imp.imported_module, all_files_set
            )

        f_chunks = code_chunker.chunk_file(
            user_id=req.user_id,
            repository_id=req.repository_id,
            file_path=rel_path,
            language=lang,
            code_bytes=code_bytes,
            symbols=f_syms,
            tree=tree,
        )

        file_symbols[rel_path] = f_syms
        file_routes[rel_path] = f_routes
        file_models[rel_path] = f_models
        file_imports[rel_path] = f_imports
        file_chunks[rel_path] = f_chunks
        all_chunks.extend(f_chunks)

    all_symbols = [s for syms in file_symbols.values() for s in syms]
    all_routes = [r for rts in file_routes.values() for r in rts]
    all_models = [m for mdls in file_models.values() for m in mdls]
    all_imports = [i for imps in file_imports.values() for i in imps]

    graph_data = knowledge_graph_builder.build_graph(
        repository_id=req.repository_id,
        files=all_files,
        symbols=all_symbols,
        routes=all_routes,
        models=all_models,
        imports=all_imports,
    )

    REPO_GRAPHS[req.repository_id] = graph_data
    REPO_SYMBOLS[req.repository_id] = all_symbols
    REPO_ROUTES[req.repository_id] = all_routes
    REPO_MODELS[req.repository_id] = all_models
    REPO_FRAMEWORKS[req.repository_id] = detected_frameworks

    hybrid_retriever.build_bm25_index(req.repository_id, all_chunks, user_id=req.user_id)
    indexed_count = vector_store.index_chunks(all_chunks)

    # Save initial state for future incremental updates
    initial_state = {
        "commit_sha": req.commit_sha,
        "file_hashes": current_hashes,
        "file_symbols": file_symbols,
        "file_routes": file_routes,
        "file_models": file_models,
        "file_imports": file_imports,
        "file_chunks": file_chunks,
        "frameworks": detected_frameworks,
        "languages_count": languages_count,
    }
    save_repo_state(req.repo_path, req.repository_id, initial_state)

    elapsed = round(time.time() - start_time, 2)
    logger.info(
        f"Full analysis complete for {req.repository_id}: {len(all_files)} files, "
        f"{len(all_symbols)} symbols, {len(all_routes)} routes, {len(all_chunks)} chunks in {elapsed}s"
    )

    return IngestionResponse(
        success=True,
        repository_id=req.repository_id,
        total_files_analyzed=len(all_files),
        total_symbols_extracted=len(all_symbols),
        total_routes_detected=len(all_routes),
        total_models_detected=len(all_models),
        total_chunks_indexed=indexed_count,
        languages_detected=languages_count,
        frameworks_detected=detected_frameworks,
        processing_time_sec=elapsed,
        is_incremental=False,
        total_files=len(all_files),
        changed_files=0,
        added_files=len(all_files),
        deleted_files=0,
        skipped_files=0,
        embeddings_regenerated=indexed_count,
        commit_sha=req.commit_sha,
        affected_downstream_files=[],
    )


@router.get("/graph/{repository_id}", response_model=KnowledgeGraphData)
def get_repository_graph(repository_id: str):
    graph = REPO_GRAPHS.get(repository_id)
    if not graph:
        # Check if state exists to reconstruct the graph on-demand
        state = REPO_STATES.get(repository_id)
        if state:
            all_files = list(state.get("file_hashes", {}).keys())
            all_syms = [s for syms in state.get("file_symbols", {}).values() for s in syms]
            all_rts = [r for rts in state.get("file_routes", {}).values() for r in rts]
            all_mdls = [m for mdls in state.get("file_models", {}).values() for m in mdls]
            all_imps = [i for imps in state.get("file_imports", {}).values() for i in imps]
            graph = knowledge_graph_builder.build_graph(
                repository_id=repository_id,
                files=all_files,
                symbols=all_syms,
                routes=all_rts,
                models=all_mdls,
                imports=all_imps,
            )
            REPO_GRAPHS[repository_id] = graph

    if not graph:
        raise HTTPException(status_code=404, detail=f"Knowledge graph for '{repository_id}' not found. Run analysis first.")
    return graph


@router.get("/symbols/{repository_id}", response_model=List[SymbolDefinition])
def get_repository_symbols(repository_id: str):
    symbols = REPO_SYMBOLS.get(repository_id)
    if symbols is None:
        state = REPO_STATES.get(repository_id)
        if state:
            symbols = [s for syms in state.get("file_symbols", {}).values() for s in syms]
            REPO_SYMBOLS[repository_id] = symbols
    return symbols or []


@router.get("/routes/{repository_id}", response_model=List[RouteDefinition])
def get_repository_routes(repository_id: str):
    routes = REPO_ROUTES.get(repository_id)
    if routes is None:
        state = REPO_STATES.get(repository_id)
        if state:
            routes = [r for rts in state.get("file_routes", {}).values() for r in rts]
            REPO_ROUTES[repository_id] = routes
    return routes or []


@router.get("/models/{repository_id}", response_model=List[DatabaseModelDefinition])
def get_repository_models(repository_id: str):
    models = REPO_MODELS.get(repository_id)
    if models is None:
        state = REPO_STATES.get(repository_id)
        if state:
            models = [m for mdls in state.get("file_models", {}).values() for m in mdls]
            REPO_MODELS[repository_id] = models
    return models or []


@router.delete("/repository/{repository_id}")
def delete_repository_analysis(repository_id: str):
    """Purges persistent metadata and memory cache for a repository."""
    delete_all_repository_metadata(repository_id)
    return {"success": True, "message": f"Purged metadata for repository {repository_id}"}

