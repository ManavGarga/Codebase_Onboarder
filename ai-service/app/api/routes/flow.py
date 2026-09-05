from fastapi import APIRouter
from app.models.schemas import ExecutionFlowTraceRequest, ExecutionFlowTraceResponse, KnowledgeGraphData
from app.api.routes.analysis import REPO_GRAPHS
from app.graph.execution_flow_engine import execution_flow_engine

router = APIRouter(prefix="", tags=["Execution Flow"])


@router.post("/flow/trace", response_model=ExecutionFlowTraceResponse)
def trace_execution_flow(req: ExecutionFlowTraceRequest):
    graph = REPO_GRAPHS.get(req.repository_id)
    if not graph:
        # Graceful fallback to default knowledge graph for tracing query patterns
        graph = KnowledgeGraphData(nodes=[], edges=[], stats={})

    return execution_flow_engine.trace_flow(
        repository_id=req.repository_id,
        query=req.query,
        graph_data=graph,
        entrypoint=req.entrypoint,
    )
