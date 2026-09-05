from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.schemas import PRAnalysisResult
from app.agents.pr_agent import pr_agent

router = APIRouter(prefix="", tags=["PR Review"])


class PRReviewRequest(BaseModel):
    pr_diff: str
    pr_title: Optional[str] = None


@router.post("/pr-review", response_model=PRAnalysisResult)
def review_pull_request(req: PRReviewRequest):
    if not req.pr_diff.strip():
        raise HTTPException(status_code=400, detail="PR diff cannot be empty.")

    return pr_agent.analyze_pr_diff(
        pr_diff=req.pr_diff,
        pr_title=req.pr_title,
    )
