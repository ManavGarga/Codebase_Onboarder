from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import logger
from app.api.routes import analysis, qa, roadmap, impact, pr, evaluation, flow

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="AST-driven Code Intelligence, Knowledge Graph, Code-Aware RAG, and Grounded Citations Engine.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(analysis.router, prefix=settings.API_V1_STR)
app.include_router(qa.router, prefix=settings.API_V1_STR)
app.include_router(roadmap.router, prefix=settings.API_V1_STR)
app.include_router(impact.router, prefix=settings.API_V1_STR)
app.include_router(pr.router, prefix=settings.API_V1_STR)
app.include_router(evaluation.router, prefix=settings.API_V1_STR)
app.include_router(flow.router, prefix=settings.API_V1_STR)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "codebase-onboarder-ai-engine",
        "version": "1.0.0",
        "tree_sitter": "active",
        "vector_db": settings.QDRANT_COLLECTION,
        "openai_configured": bool(settings.OPENAI_API_KEY and settings.OPENAI_API_KEY != "your_openai_api_key_here"),
    }


@app.on_event("startup")
async def startup_event():
    logger.info("Initializing Codebase Onboarder AI Engine...")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Codebase Onboarder AI Engine...")
