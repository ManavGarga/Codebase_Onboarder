export type IngestionStatus =
  | 'QUEUED'
  | 'CLONING'
  | 'PARSING_AST'
  | 'BUILDING_GRAPH'
  | 'CHUNKING'
  | 'EMBEDDING'
  | 'INDEXING'
  | 'READY'
  | 'FAILED';

export interface Repository {
  id: string;
  userId: string;
  name: string;
  owner: string;
  url: string;
  branch: string;
  status: IngestionStatus;
  progress: number;
  stageMessage: string;
  localPath: string;
  languages: Record<string, number>;
  frameworks: string[];
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalRoutes: number;
    totalModels: number;
    totalChunks: number;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

export interface SymbolItem {
  id: string;
  name: string;
  kind: 'function' | 'method' | 'class' | 'interface' | 'type_alias' | 'variable' | 'route' | 'model';
  file_path: string;
  start_line: int;
  end_line: int;
  signature?: string;
  docstring?: string;
  parent_symbol?: string;
}

export interface RouteItem {
  id: string;
  http_method: string;
  path: string;
  handler_name: string;
  file_path: string;
  start_line: number;
  end_line: number;
  framework: string;
}

export interface ModelItem {
  id: string;
  model_name: string;
  table_name?: string;
  file_path: string;
  start_line: number;
  end_line: number;
  orm_type: string;
  fields: Array<{ name: string; type_name: string; is_primary_key?: boolean }>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'file' | 'class' | 'function' | 'route' | 'model' | 'package' | 'service';
  file_path?: string;
  data: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  animated?: boolean;
  data?: Record<string, any>;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: Record<string, any>;
}

export interface Citation {
  file_path: string;
  start_line: number;
  end_line: number;
  snippet?: string;
}

export interface GroundedAnswer {
  query: string;
  answer: string;
  citations: Citation[];
  referenced_symbols: string[];
  confidence: number;
}

export interface RoadmapMilestone {
  phase: string;
  title: string;
  description: string;
  key_files: string[];
  prerequisites: string[];
  action_items: string[];
  suggested_starter_tasks: string[];
}

export interface OnboardingRoadmap {
  repository_id: string;
  repository_name: string;
  summary: string;
  tech_stack: string[];
  milestones: RoadmapMilestone[];
  reading_order: string[];
}

export interface GraphDerivedFacts {
  direct_dependents_count: number;
  indirect_dependents_count: number;
  affected_apis_count: number;
  affected_components_count: number;
  direct_dependents: Array<{
    id: string;
    label: string;
    type: string;
    file_path: string;
    depth: number;
  }>;
  indirect_dependents: Array<{
    id: string;
    label: string;
    type: string;
    file_path: string;
    depth: number;
    parent_id?: string;
  }>;
  affected_routes: any[];
  affected_components: Array<{
    id: string;
    label: string;
    type: string;
    file_path: string;
    depth: number;
  }>;
  affected_models: any[];
  affected_files: string[];
  caller_chains: string[][];
  blast_tree_nodes?: any[];
  blast_tree_edges?: any[];
  is_graph_derived: boolean;
}

export interface LLMInterpretation {
  summary: string;
  architectural_assessment: string;
  recommendations: string[];
  risk_analysis: string;
  is_ai_generated: boolean;
  disclaimer: string;
}

export interface ImpactResult {
  target: string;
  target_type: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blast_radius_score: number;
  summary: string;
  affected_routes: any[];
  affected_models: any[];
  affected_files: string[];
  caller_chain: string[];
  recommendations: string[];
  graph_derived_facts?: GraphDerivedFacts;
  llm_interpretation?: LLMInterpretation;
}

export interface PRReviewResult {
  pr_title?: string;
  summary: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  breaking_changes: string[];
  impacted_endpoints: string[];
  suggested_tests: string[];
  architectural_notes: string[];
}

export interface ExecutionFlowStep {
  step_number: number;
  layer: 'UI_COMPONENT' | 'API_ROUTE' | 'ROUTE_HANDLER' | 'CONTROLLER' | 'SERVICE' | 'DATA_MODEL' | 'DATABASE';
  name: string;
  file: string;
  symbol: string;
  line_start: number;
  line_end: number;
  relationship_type: 'SUBMITS_TO' | 'ROUTES_TO' | 'DISPATCHES_TO' | 'INVOKES' | 'PERSISTS_VIA' | 'STORES_IN';
  code_snippet?: string;
  description: string;
}

export interface ExecutionFlowTrace {
  query: string;
  entrypoint: string;
  steps: ExecutionFlowStep[];
  summary: string;
  is_graph_derived: boolean;
}

export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  total_private_repos?: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
}

export type int = number;

