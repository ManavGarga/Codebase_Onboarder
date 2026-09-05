from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class SymbolKind(str, Enum):
    FUNCTION = "function"
    METHOD = "method"
    CLASS = "class"
    INTERFACE = "interface"
    TYPE_ALIAS = "type_alias"
    VARIABLE = "variable"
    ROUTE = "route"
    MODEL = "model"
    MODULE = "module"


class SymbolDefinition(BaseModel):
    id: str
    name: str
    kind: SymbolKind
    file_path: str
    start_line: int
    end_line: int
    start_col: int = 0
    end_col: int = 0
    signature: Optional[str] = None
    docstring: Optional[str] = None
    parent_symbol: Optional[str] = None
    parameters: List[str] = Field(default_factory=list)
    return_type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RouteDefinition(BaseModel):
    id: str
    http_method: str  # GET, POST, PUT, DELETE, PATCH, etc.
    path: str
    handler_name: str
    file_path: str
    start_line: int
    end_line: int
    parameters: List[str] = Field(default_factory=list)
    framework: str  # express, fastapi, flask, etc.
    docstring: Optional[str] = None


class ModelField(BaseModel):
    name: str
    type_name: str
    required: bool = True
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references: Optional[str] = None


class DatabaseModelDefinition(BaseModel):
    id: str
    model_name: str
    table_name: Optional[str] = None
    file_path: str
    start_line: int
    end_line: int
    orm_type: str  # mongoose, prisma, sqlalchemy, typeorm
    fields: List[ModelField] = Field(default_factory=list)
    relationships: List[Dict[str, Any]] = Field(default_factory=list)


class ImportRelationship(BaseModel):
    source_file: str
    imported_module: str
    imported_symbols: List[str] = Field(default_factory=list)
    is_relative: bool = False
    resolved_target_file: Optional[str] = None
    line_number: int


class GraphNodeType(str, Enum):
    FILE = "file"
    CLASS = "class"
    FUNCTION = "function"
    ROUTE = "route"
    MODEL = "model"
    PACKAGE = "package"
    SERVICE = "service"


class GraphNode(BaseModel):
    id: str
    label: str
    type: GraphNodeType
    file_path: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None  # IMPORTS, CALLS, DEFINES, HANDLES, QUERIES
    type: Optional[str] = "smoothstep"
    animated: bool = False
    data: Dict[str, Any] = Field(default_factory=dict)


class KnowledgeGraphData(BaseModel):
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class CodeChunk(BaseModel):
    id: str
    user_id: str
    repository_id: str
    file_path: str
    language: str
    symbol_name: Optional[str] = None
    node_type: str  # function, class, file_block
    start_line: int
    end_line: int
    content: str
    signature: Optional[str] = None
    scope: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Citation(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    snippet: Optional[str] = None
    relevance: Optional[float] = None


class GroundedAnswerResponse(BaseModel):
    query: str
    answer: str
    citations: List[Citation] = Field(default_factory=list)
    referenced_symbols: List[str] = Field(default_factory=list)
    confidence: float = 1.0


class RoadmapMilestone(BaseModel):
    phase: str  # "Day 1: Setup & Architecture", "Week 1: Core Domain", "Week 2: First Contribution"
    title: str
    description: str
    key_files: List[str] = Field(default_factory=list)
    prerequisites: List[str] = Field(default_factory=list)
    action_items: List[str] = Field(default_factory=list)
    suggested_starter_tasks: List[str] = Field(default_factory=list)


class OnboardingRoadmap(BaseModel):
    repository_id: str
    repository_name: str
    summary: str
    tech_stack: List[str] = Field(default_factory=list)
    milestones: List[RoadmapMilestone] = Field(default_factory=list)
    reading_order: List[str] = Field(default_factory=list)


class GraphDerivedFacts(BaseModel):
    direct_dependents_count: int = 0
    indirect_dependents_count: int = 0
    affected_apis_count: int = 0
    affected_components_count: int = 0
    direct_dependents: List[Dict[str, Any]] = Field(default_factory=list)
    indirect_dependents: List[Dict[str, Any]] = Field(default_factory=list)
    affected_routes: List[Dict[str, Any]] = Field(default_factory=list)
    affected_components: List[Dict[str, Any]] = Field(default_factory=list)
    affected_models: List[Dict[str, Any]] = Field(default_factory=list)
    affected_files: List[str] = Field(default_factory=list)
    caller_chains: List[List[str]] = Field(default_factory=list)
    blast_tree_nodes: List[Dict[str, Any]] = Field(default_factory=list)
    blast_tree_edges: List[Dict[str, Any]] = Field(default_factory=list)
    is_graph_derived: bool = True


class LLMInterpretation(BaseModel):
    summary: str = ""
    architectural_assessment: str = ""
    recommendations: List[str] = Field(default_factory=list)
    risk_analysis: str = ""
    is_ai_generated: bool = True
    disclaimer: str = (
        "Architectural interpretation synthesized by LLM based strictly on deterministic AST graph facts. "
        "The LLM is never permitted to invent or alter dependencies."
    )


class ImpactAnalysisResult(BaseModel):
    target: str
    target_type: str  # "file" or "symbol"
    risk_level: str  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    blast_radius_score: float  # 0.0 to 100.0
    summary: str
    affected_routes: List[Dict[str, Any]] = Field(default_factory=list)
    affected_models: List[Dict[str, Any]] = Field(default_factory=list)
    affected_files: List[str] = Field(default_factory=list)
    caller_chain: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    graph_derived_facts: Optional[GraphDerivedFacts] = None
    llm_interpretation: Optional[LLMInterpretation] = None


class PRAnalysisResult(BaseModel):
    pr_title: Optional[str] = None
    summary: str
    risk_level: str  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    breaking_changes: List[str] = Field(default_factory=list)
    impacted_endpoints: List[str] = Field(default_factory=list)
    impacted_models: List[str] = Field(default_factory=list)
    suggested_tests: List[str] = Field(default_factory=list)
    architectural_notes: List[str] = Field(default_factory=list)


class IngestionRequest(BaseModel):
    user_id: str = "default_user"
    repository_id: str
    repo_path: str
    repo_url: Optional[str] = None
    branch: str = "main"
    commit_sha: Optional[str] = None
    previous_commit_sha: Optional[str] = None
    is_incremental: bool = False
    changed_files: Optional[List[str]] = None
    added_files: Optional[List[str]] = None
    deleted_files: Optional[List[str]] = None


class IngestionResponse(BaseModel):
    success: bool
    repository_id: str
    total_files_analyzed: int
    total_symbols_extracted: int
    total_routes_detected: int
    total_models_detected: int
    total_chunks_indexed: int
    languages_detected: Dict[str, int]
    frameworks_detected: List[str]
    processing_time_sec: float
    # Incremental Indexing Metrics
    is_incremental: bool = False
    total_files: int = 0
    changed_files: int = 0
    added_files: int = 0
    deleted_files: int = 0
    skipped_files: int = 0
    embeddings_regenerated: int = 0
    commit_sha: Optional[str] = None
    affected_downstream_files: List[str] = Field(default_factory=list)


class ExecutionFlowStep(BaseModel):
    step_number: int
    layer: str  # "UI_COMPONENT", "API_ROUTE", "ROUTE_HANDLER", "CONTROLLER", "SERVICE", "DATA_MODEL", "DATABASE"
    name: str
    file: str
    symbol: str
    line_start: int
    line_end: int
    relationship_type: str  # "SUBMITS_TO", "ROUTES_TO", "DISPATCHES_TO", "INVOKES", "PERSISTS_VIA", "STORES_IN"
    code_snippet: Optional[str] = None
    description: str


class ExecutionFlowTraceRequest(BaseModel):
    repository_id: str
    query: str
    entrypoint: Optional[str] = None


class ExecutionFlowTraceResponse(BaseModel):
    query: str
    entrypoint: str
    steps: List[ExecutionFlowStep] = Field(default_factory=list)
    summary: str
    is_graph_derived: bool = True


