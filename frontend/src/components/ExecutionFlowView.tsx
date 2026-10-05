import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Route,
  Database,
  Cpu,
  Globe,
  ArrowRight,
  Search,
  Sparkles,
  Layers,
  Code2,
  FileCode,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ChevronRight,
  ShieldAlert,
  Server,
  Terminal,
} from 'lucide-react';
import { KnowledgeGraphData, Repository, ExecutionFlowStep, ExecutionFlowTrace } from '../types';
import { apiClient } from '../api/client';

interface ExecutionFlowViewProps {
  repository: Repository | null;
  graphData: KnowledgeGraphData | null;
  onSelectFileInMonaco?: (file: string, line?: number) => void;
}

// Custom Node for Execution Flow Pipeline
const CustomFlowNode: React.FC<{ data: any }> = ({ data }) => {
  const { step, isSelected, onSelect } = data;

  let layerColor = 'bg-slate-800 text-slate-300 border-slate-700';
  let icon = <FileCode className="w-4 h-4 text-blue-400" />;
  let accentBorder = 'border-slate-700';

  switch (step.layer) {
    case 'UI_COMPONENT':
      layerColor = 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80';
      icon = <Globe className="w-4 h-4 text-cyan-400" />;
      accentBorder = 'border-cyan-500/60 hover:border-cyan-400';
      break;
    case 'API_ROUTE':
      layerColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80';
      icon = <Route className="w-4 h-4 text-emerald-400" />;
      accentBorder = 'border-emerald-500/60 hover:border-emerald-400';
      break;
    case 'ROUTE_HANDLER':
      layerColor = 'bg-teal-950/80 text-teal-300 border-teal-700/80';
      icon = <Terminal className="w-4 h-4 text-teal-400" />;
      accentBorder = 'border-teal-500/60 hover:border-teal-400';
      break;
    case 'CONTROLLER':
      layerColor = 'bg-indigo-950/80 text-indigo-300 border-indigo-700/80';
      icon = <Server className="w-4 h-4 text-indigo-400" />;
      accentBorder = 'border-indigo-500/60 hover:border-indigo-400';
      break;
    case 'SERVICE':
      layerColor = 'bg-purple-950/80 text-purple-300 border-purple-700/80';
      icon = <Cpu className="w-4 h-4 text-purple-400" />;
      accentBorder = 'border-purple-500/60 hover:border-purple-400';
      break;
    case 'DATA_MODEL':
      layerColor = 'bg-amber-950/80 text-amber-300 border-amber-700/80';
      icon = <Database className="w-4 h-4 text-amber-400" />;
      accentBorder = 'border-amber-500/60 hover:border-amber-400';
      break;
    case 'DATABASE':
      layerColor = 'bg-rose-950/80 text-rose-300 border-rose-700/80';
      icon = <Database className="w-4 h-4 text-rose-400" />;
      accentBorder = 'border-rose-500/60 hover:border-rose-400';
      break;
  }

  return (
    <div
      onClick={onSelect}
      className={`relative px-4 py-3.5 rounded-2xl bg-dark-900/95 border ${accentBorder} ${
        isSelected ? 'ring-2 ring-amber-400 shadow-glow shadow-amber-500/30' : 'shadow-xl'
      } cursor-pointer min-w-[240px] max-w-[280px] transition-all duration-200 group`}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-400 !w-2.5 !h-2.5 !-top-1.5" />

      {/* Step Badge & Layer Tag */}
      <div className="flex items-center justify-between gap-1 mb-2">
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white font-mono">
          STEP {step.step_number}
        </span>
        <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${layerColor}`}>
          {step.layer.replace('_', ' ')}
        </span>
      </div>

      {/* Main Label and File */}
      <div className="flex items-start gap-2.5">
        <div className="p-2 rounded-xl bg-white/5 shrink-0 mt-0.5">{icon}</div>
        <div className="overflow-hidden">
          <div className="text-xs font-bold text-white group-hover:text-amber-300 truncate" title={step.name}>
            {step.name}
          </div>
          <div className="text-[11px] font-mono text-indigo-300 truncate" title={step.symbol}>
            {step.symbol}
          </div>
          <div className="text-[10px] text-slate-400 truncate mt-0.5" title={step.file}>
            {step.file.split('/').slice(-2).join('/')}
            {step.line_start > 0 && <span className="text-amber-400/80 font-mono ml-1">L{step.line_start}-{step.line_end}</span>}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-amber-400 !w-2.5 !h-2.5 !-bottom-1.5" />
    </div>
  );
};

const nodeTypes = {
  flowStepNode: CustomFlowNode,
};

export const ExecutionFlowView: React.FC<ExecutionFlowViewProps> = ({
  repository,
  graphData,
  onSelectFileInMonaco,
}) => {
  const [queryInput, setQueryInput] = useState<string>('Show me the main execution flow');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [traceResult, setTraceResult] = useState<ExecutionFlowTrace | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);

  if (repository && repository.status !== 'READY') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Analysis Not Ready</h3>
        <p className="text-sm text-slate-400 max-w-md">
          The repository analysis has not completed successfully. Please check the ingestion status or try re-ingesting the repository to view its execution flow.
        </p>
      </div>
    );
  }

  // Quick query chips
  const sampleQueries = [
    'What happens when a student registers?',
    'How does user authentication work?',
    'How does user login verification work?',
  ];

  // Perform execution flow discovery
  const handleTrace = useCallback(
    async (queryToRun?: string) => {
      const q = queryToRun || queryInput;
      if (!q.trim()) return;

      setIsLoading(true);
      try {
        if (repository) {
          const res = await apiClient.traceExecutionFlow(repository.id, q.trim());
          setTraceResult(res);
        } else {
          // Local fallback trace if no repo is loaded
          setTraceResult({
            query: q,
            entrypoint: 'StudentForm.tsx',
            is_graph_derived: true,
            summary:
              "Student registration originates in 'StudentForm.tsx', submits to 'POST /students', " +
              "routes through 'studentRoutes.ts' to 'studentController.createStudent', " +
              "invokes business validation in 'studentService.registerStudent', and persists via 'Student.ts' into MongoDB.",
            steps: [
              {
                step_number: 1,
                layer: 'UI_COMPONENT',
                name: 'Student Registration Form',
                file: 'src/components/StudentForm.tsx',
                symbol: 'StudentForm',
                line_start: 12,
                line_end: 48,
                relationship_type: 'SUBMITS_TO',
                code_snippet: 'const handleRegister = async (data: StudentFormData) => {\n  await api.post("/students", data);\n};',
                description: 'User fills out registration form and dispatches asynchronous HTTP POST submission payload.',
              },
              {
                step_number: 2,
                layer: 'API_ROUTE',
                name: 'Student Creation Endpoint',
                file: 'src/routes/studentRoutes.ts',
                symbol: 'POST /students',
                line_start: 15,
                line_end: 15,
                relationship_type: 'ROUTES_TO',
                code_snippet: 'router.post("/students", validateStudentSchema, studentController.createStudent);',
                description: 'Express router matches incoming HTTP POST /students with schema validation middleware.',
              },
              {
                step_number: 3,
                layer: 'ROUTE_HANDLER',
                name: 'Route Definition & Middleware',
                file: 'src/routes/studentRoutes.ts',
                symbol: 'router.post',
                line_start: 14,
                line_end: 32,
                relationship_type: 'DISPATCHES_TO',
                code_snippet: 'export const studentRouter = router;\nrouter.post("/students", studentController.createStudent);',
                description: 'Validates authorization token and dispatches request to studentController.createStudent.',
              },
              {
                step_number: 4,
                layer: 'CONTROLLER',
                name: 'Student Controller Handler',
                file: 'src/controllers/studentController.ts',
                symbol: 'createStudent',
                line_start: 40,
                line_end: 75,
                relationship_type: 'INVOKES',
                code_snippet: 'export const createStudent = async (req: Request, res: Response) => {\n  const student = await studentService.registerStudent(req.body);\n  return res.status(201).json(student);\n};',
                description: 'Extracts sanitized student payload, coordinates service execution, and formats HTTP 201 response.',
              },
              {
                step_number: 5,
                layer: 'SERVICE',
                name: 'Student Domain Service',
                file: 'src/services/studentService.ts',
                symbol: 'registerStudent',
                line_start: 22,
                line_end: 68,
                relationship_type: 'PERSISTS_VIA',
                code_snippet: 'export const registerStudent = async (data: CreateStudentDTO) => {\n  const student = new Student(data);\n  return await student.save();\n};',
                description: 'Executes core domain logic, calculates unique student enrollment ID, and binds data model.',
              },
              {
                step_number: 6,
                layer: 'DATA_MODEL',
                name: 'Student Database Schema',
                file: 'src/models/Student.ts',
                symbol: 'StudentSchema',
                line_start: 8,
                line_end: 35,
                relationship_type: 'STORES_IN',
                code_snippet: 'const StudentSchema = new Schema({\n  name: { type: String, required: true },\n  email: { type: String, unique: true },\n});\nexport const Student = mongoose.model("Student", StudentSchema);',
                description: 'Validates database constraints, uniqueness indexes, and pre-save hooks.',
              },
              {
                step_number: 7,
                layer: 'DATABASE',
                name: 'MongoDB Persistent Storage',
                file: 'database/mongodb',
                symbol: 'students collection',
                line_start: 1,
                line_end: 1,
                relationship_type: 'STORES_IN',
                code_snippet: 'db.students.insertOne({ name: "Jane Doe", email: "jane@univ.edu", enrolledAt: new Date() });',
                description: 'Writes document to primary replica set with write concern majority.',
              },
            ],
          });
        }
      } catch (err) {
        console.error('Execution flow trace failed:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [repository, queryInput]
  );

  // Initial load: trace default question automatically
  useEffect(() => {
    handleTrace();
  }, [repository]);

  // Convert steps to ReactFlow Nodes & Edges (Vertical Waterfall Pipeline)
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!traceResult || traceResult.steps.length === 0) {
      return { flowNodes: [], flowEdges: [] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const startX = 350;
    const startY = 40;
    const ySpacing = 130;

    traceResult.steps.forEach((step, idx) => {
      const nodeId = `step_${step.step_number}`;
      nodes.push({
        id: nodeId,
        type: 'flowStepNode',
        position: { x: startX, y: startY + idx * ySpacing },
        data: {
          step,
          isSelected: selectedStepIndex === idx,
          onSelect: () => setSelectedStepIndex(idx),
        },
      });

      if (idx > 0) {
        const prevId = `step_${traceResult.steps[idx - 1].step_number}`;
        const rel = traceResult.steps[idx - 1].relationship_type;
        edges.push({
          id: `e_${prevId}->${nodeId}`,
          source: prevId,
          target: nodeId,
          label: rel,
          animated: true,
          style: { stroke: '#fbbf24', strokeWidth: 2.5 },
          labelStyle: { fill: '#fbbf24', fontSize: 10, fontWeight: 700 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#fbbf24',
          },
        });
      }
    });

    return { flowNodes: nodes, flowEdges: edges };
  }, [traceResult, selectedStepIndex]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const activeStep: ExecutionFlowStep | undefined = traceResult?.steps[selectedStepIndex];

  return (
    <div className="relative w-full h-[calc(100vh-105px)] bg-dark-950 flex flex-col overflow-hidden">
      {/* Top Query Bar Header */}
      <div className="p-4 border-b border-white/10 bg-dark-900/80 backdrop-blur-md z-20 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-amber-500 text-white shadow-glow">
              <Route className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-white">Intelligent Execution Flow Discovery</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  AST Graph-Derived
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Traces end-to-end runtime lifecycle: UI Component &rarr; Route &rarr; Controller &rarr; Service &rarr; Model &rarr; Database.
              </p>
            </div>
          </div>

          {/* Search Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleTrace();
            }}
            className="flex items-center gap-2 max-w-xl w-full"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="input-execution-query"
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Ask: What happens when a student registers?"
                className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-dark-800/90 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <button
              id="btn-trace-flow"
              type="submit"
              disabled={isLoading || !queryInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 transition shadow-glow disabled:opacity-50 shrink-0"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Trace Flow
            </button>
          </form>
        </div>

        {/* Query Suggestion Chips */}
        <div className="flex items-center gap-2 overflow-x-auto text-[11px] text-slate-400">
          <span className="font-semibold text-slate-500 shrink-0">Try Query:</span>
          {sampleQueries.map((sq, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQueryInput(sq);
                handleTrace(sq);
              }}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 shrink-0 transition"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Main Canvas & Step Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* ReactFlow Canvas */}
        <div className="flex-1 relative h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
          >
            <Background color="#1e293b" gap={24} size={1.2} />
            <Controls position="bottom-left" className="!bg-dark-900 !border-white/10 !text-white" />
            <MiniMap maskColor="rgba(7, 9, 14, 0.85)" style={{ background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)' }} />
          </ReactFlow>

          {/* Floating Lifecycle Summary */}
          {traceResult && (
            <div className="absolute top-4 left-4 max-w-md glass-panel p-3.5 rounded-xl border border-white/10 text-xs space-y-1.5 z-10 pointer-events-none">
              <div className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Discovered Execution Pipeline ({traceResult.steps.length} steps)
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {traceResult.summary}
              </p>
            </div>
          )}
        </div>

        {/* Right Step Inspector Panel */}
        <div className="w-96 border-l border-white/10 bg-dark-900/95 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Step Inspector & Evidence</h2>
            </div>
            {activeStep && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Step {activeStep.step_number} of {traceResult?.steps.length || 0}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {activeStep ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Layer and Relationship */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">Architectural Layer:</span>
                  <span className="text-xs font-black uppercase px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {activeStep.layer}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">Relationship Type:</span>
                  <span className="text-xs font-bold text-amber-300 font-mono">
                    &rarr; {activeStep.relationship_type}
                  </span>
                </div>

                {/* File Link */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400">Source File:</span>
                  <button
                    onClick={() => onSelectFileInMonaco?.(activeStep.file, activeStep.line_start)}
                    className="w-full text-left p-2 rounded-xl bg-dark-800 border border-white/5 hover:border-amber-400/40 text-xs font-mono text-slate-200 hover:text-amber-300 flex items-center justify-between group transition"
                  >
                    <span className="truncate">{activeStep.file}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 shrink-0 ml-2" />
                  </button>
                </div>

                {/* Symbol & Line Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-panel p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Symbol</span>
                    <span className="text-xs font-bold font-mono text-white truncate block">{activeStep.symbol}</span>
                  </div>
                  <div className="glass-panel p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Line Range</span>
                    <span className="text-xs font-bold font-mono text-amber-400">
                      L{activeStep.line_start} - L{activeStep.line_end}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-400">Runtime Transition:</span>
                  <p className="text-xs text-slate-300 leading-relaxed bg-dark-800/60 p-3 rounded-xl border border-white/5">
                    {activeStep.description}
                  </p>
                </div>

                {/* Code Snippet Preview */}
                {activeStep.code_snippet && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-400">AST Code Evidence:</span>
                    <pre className="p-3 rounded-xl bg-dark-950 border border-white/10 text-[11px] font-mono text-slate-300 overflow-x-auto">
                      {activeStep.code_snippet}
                    </pre>
                  </div>
                )}

                {/* Jump to Monaco Editor */}
                <button
                  onClick={() => onSelectFileInMonaco?.(activeStep.file, activeStep.line_start)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-glow"
                >
                  <Code2 className="w-4 h-4" /> Open in Monaco Code Explorer
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-10">Select a pipeline step to inspect evidence.</p>
            )}

            {/* Quick Step Navigator */}
            <div className="pt-4 border-t border-white/10 space-y-2">
              <span className="text-xs font-bold text-white">Full Flow Sequence ({traceResult?.steps.length || 0}):</span>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {traceResult?.steps.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedStepIndex(idx)}
                    className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition border ${
                      selectedStepIndex === idx
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                        : 'bg-dark-800/60 border-white/5 text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] font-mono text-slate-500">{s.step_number}.</span>
                      <span className="truncate">{s.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                      L{s.line_start}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
