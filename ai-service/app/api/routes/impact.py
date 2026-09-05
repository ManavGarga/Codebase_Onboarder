from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.schemas import ImpactAnalysisResult
from app.agents.impact_agent import impact_agent
from app.api.routes.analysis import REPO_GRAPHS

router = APIRouter(prefix="", tags=["Impact Analysis"])


class ImpactRequest(BaseModel):
    repository_id: str
    target_file: str
    target_symbol: Optional[str] = ""
    diff_snippet: Optional[str] = ""


@router.post("/impact", response_model=ImpactAnalysisResult)
def analyze_code_impact(req: ImpactRequest):
    graph = REPO_GRAPHS.get(req.repository_id)
    if not graph:
        raise HTTPException(status_code=404, detail=f"Graph for repo '{req.repository_id}' not found. Run analysis first.")

    return impact_agent.analyze_impact(
        target_file=req.target_file,
        graph_data=graph,
        target_symbol=req.target_symbol or "",
        diff_snippet=req.diff_snippet or "",
    )
