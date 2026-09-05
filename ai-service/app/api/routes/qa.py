from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.schemas import GroundedAnswerResponse
from app.agents.code_qa_graph import code_qa_agent

router = APIRouter(prefix="", tags=["Code QA & Retrieval"])


class QueryRequest(BaseModel):
    user_id: str = "default_user"
    repository_id: str
    query: str


@router.post("/qa", response_model=GroundedAnswerResponse)
def grounded_code_qa(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    return code_qa_agent.run(
        user_id=req.user_id,
        repository_id=req.repository_id,
        query=req.query,
    )
