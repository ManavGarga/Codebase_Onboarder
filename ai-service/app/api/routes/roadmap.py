import os
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.schemas import OnboardingRoadmap
from app.agents.roadmap_agent import roadmap_generator
from app.api.routes.analysis import REPO_ROUTES, REPO_MODELS, REPO_FRAMEWORKS

router = APIRouter(prefix="", tags=["Onboarding Roadmap"])


class RoadmapRequest(BaseModel):
    repository_id: str
    repository_name: Optional[str] = None
    repo_path: Optional[str] = None


@router.post("/roadmap", response_model=OnboardingRoadmap)
def get_or_generate_roadmap(req: RoadmapRequest):
    repo_name = req.repository_name or req.repository_id

    routes = REPO_ROUTES.get(req.repository_id, [])
    models = REPO_MODELS.get(req.repository_id, [])
    frameworks = REPO_FRAMEWORKS.get(req.repository_id, [])

    # Collect files from repo_path if provided
    files: List[str] = []
    if req.repo_path and os.path.exists(req.repo_path):
        for root, _, fs in os.walk(req.repo_path):
            for f in fs:
                rel = os.path.relpath(os.path.join(root, f), req.repo_path)
                files.append(rel)
    else:
        files = [r.file_path for r in routes] + [m.file_path for m in models]

    return roadmap_generator.generate_roadmap(
        repository_id=req.repository_id,
        repo_name=repo_name,
        files=files,
        routes=routes,
        models=models,
        frameworks=frameworks,
    )
