import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  Code2,
  Copy,
  Check,
  Search,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { FileTreeNode, Repository, SymbolItem } from '../types';

interface CodeExplorerViewProps {
  repository: Repository | null;
  activeFilePath?: string | null;
  targetLine?: number | null;
}

export const CodeExplorerView: React.FC<CodeExplorerViewProps> = ({
  repository,
  activeFilePath: initialFilePath,
  targetLine: initialTargetLine,
}) => {
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(initialFilePath || null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['src', 'app']));
  const [copied, setCopied] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const editorRef = useRef<any>(null);

  // Sample demo files
  const sampleFiles: Record<string, string> = {
    'src/controllers/studentController.ts': `import { Request, Response } from 'express';
import { studentService } from '../services/studentService';
import { CreateStudentDTO } from '../types/student';

export class StudentController {
  /**
   * Handles student registration HTTP requests.
   * Dispatches payload to student service.
   */
  async createStudent(req: Request, res: Response): Promise<Response> {
    try {
      const payload: CreateStudentDTO = req.body;
      const newStudent = await studentService.registerStudent(payload);
      return res.status(201).json({ success: true, data: newStudent });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  async getStudentById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const student = await studentService.findStudentById(id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    return res.json({ success: true, data: student });
  }
}

export const studentController = new StudentController();`,
    'src/routes/studentRoutes.ts': `import { Router } from 'express';
import { studentController } from '../controllers/studentController';
import { validateStudentSchema } from '../middleware/validationMiddleware';

const router = Router();

// Student Registration & Lifecycle Routes
router.post('/students', validateStudentSchema, studentController.createStudent);
router.get('/students/:id', studentController.getStudentById);

export default router;`,
    'src/services/studentService.ts': `import { Student } from '../models/Student';
import { CreateStudentDTO } from '../types/student';

export class StudentService {
  async registerStudent(dto: CreateStudentDTO) {
    const student = new Student({
      ...dto,
      enrolledAt: new Date(),
      status: 'ACTIVE'
    });
    return await student.save();
  }

  async findStudentById(id: string) {
    return await Student.findById(id);
  }
}

export const studentService = new StudentService();`,
  };

  // Load File Tree
  useEffect(() => {
    if (repository) {
      apiClient.getFileTree(repository.id).then((tree) => {
        setFileTree(tree);
        if (!selectedPath && tree.length > 0) {
          const findFirstFile = (nodes: FileTreeNode[]): string | null => {
            for (const n of nodes) {
              if (n.type === 'file') return n.path;
              if (n.children) {
                const sub = findFirstFile(n.children);
                if (sub) return sub;
              }
            }
            return null;
          };
          const first = findFirstFile(tree);
          if (first) setSelectedPath(first);
        }
      });
      apiClient.getSymbols(repository.id).then(setSymbols);
    } else {
      // Demo file tree
      const demoTree: FileTreeNode[] = [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: [
            {
              name: 'controllers',
              path: 'src/controllers',
              type: 'directory',
              children: [
                { name: 'studentController.ts', path: 'src/controllers/studentController.ts', type: 'file' },
              ],
            },
            {
              name: 'routes',
              path: 'src/routes',
              type: 'directory',
              children: [
                { name: 'studentRoutes.ts', path: 'src/routes/studentRoutes.ts', type: 'file' },
              ],
            },
            {
              name: 'services',
              path: 'src/services',
              type: 'directory',
              children: [
                { name: 'studentService.ts', path: 'src/services/studentService.ts', type: 'file' },
              ],
            },
          ],
        },
      ];
      setFileTree(demoTree);
      if (!selectedPath) setSelectedPath('src/controllers/studentController.ts');
      setSymbols([
        { id: 'sym-1', name: 'createStudent', kind: 'method', file_path: 'src/controllers/studentController.ts', start_line: 10, end_line: 18 },
        { id: 'sym-2', name: 'getStudentById', kind: 'method', file_path: 'src/controllers/studentController.ts', start_line: 20, end_line: 25 },
        { id: 'sym-3', name: 'StudentController', kind: 'class', file_path: 'src/controllers/studentController.ts', start_line: 5, end_line: 26 },
      ]);
    }
  }, [repository]);

  // Handle external prop changes (e.g. clicked citation badge)
  useEffect(() => {
    if (initialFilePath) {
      setSelectedPath(initialFilePath);
    }
  }, [initialFilePath]);

  // Load File Content when selectedPath changes
  useEffect(() => {
    if (!selectedPath) return;

    if (repository) {
      setIsLoadingContent(true);
      apiClient
        .getFileContent(repository.id, selectedPath)
        .then((res) => {
          setFileContent(res.content);
          setIsLoadingContent(false);
        })
        .catch((err) => {
          setFileContent(`// Error loading file: ${err.message}`);
          setIsLoadingContent(false);
        });
    } else {
      setFileContent(sampleFiles[selectedPath] || `// File content for ${selectedPath}\nexport const demo = true;`);
    }
  }, [repository, selectedPath]);

  // Jump to line when targetLine is provided or changes
  useEffect(() => {
    if (editorRef.current && initialTargetLine) {
      setTimeout(() => {
        editorRef.current.revealLineInCenter(initialTargetLine);
        editorRef.current.setPosition({ lineNumber: initialTargetLine, column: 1 });
      }, 200);
    }
  }, [initialTargetLine, selectedPath]);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
    if (initialTargetLine) {
      editor.revealLineInCenter(initialTargetLine);
      editor.setPosition({ lineNumber: initialTargetLine, column: 1 });
    }
  };

  const toggleDirectory = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  // Determine Monaco language mode from file extension
  const getLanguageMode = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      default:
        return 'plaintext';
    }
  };

  // Symbols in current open file
  const currentFileSymbols = symbols.filter((s) => s.file_path === selectedPath);

  const copyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render tree node recursively
  const renderTree = (nodes: FileTreeNode[]) => {
    return nodes.map((node) => {
      if (searchFilter && !node.path.toLowerCase().includes(searchFilter.toLowerCase())) {
        if (node.type === 'file') return null;
      }

      if (node.type === 'directory') {
        const isExpanded = expandedDirs.has(node.path);
        return (
          <div key={node.path} className="select-none">
            <div
              onClick={() => toggleDirectory(node.path)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer transition"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
              {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> : <Folder className="w-3.5 h-3.5 text-amber-400" />}
              <span className="font-medium truncate">{node.name}</span>
            </div>
            {isExpanded && node.children && <div className="pl-4 border-l border-white/5 ml-2">{renderTree(node.children)}</div>}
          </div>
        );
      }

      const isSelected = selectedPath === node.path;
      return (
        <div
          key={node.path}
          onClick={() => setSelectedPath(node.path)}
          className={`flex items-center gap-2 px-2 py-1 text-xs rounded-lg cursor-pointer transition truncate ${
            isSelected
              ? 'bg-brand-600/30 text-brand-300 font-semibold border border-brand-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title={node.path}
        >
          <FileCode className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-brand-400' : 'text-slate-500'}`} />
          <span className="truncate">{node.name}</span>
        </div>
      );
    });
  };

  return (
    <div className="flex w-full h-[calc(100vh-105px)] bg-dark-950 overflow-hidden border-t border-white/5">
      {/* Left Sidebar: File Tree */}
      <div className="w-64 border-r border-white/10 bg-dark-900/70 flex flex-col shrink-0">
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter files..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="glass-input pl-8 pr-2.5 py-1.5 rounded-lg text-xs w-full text-white placeholder-slate-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {fileTree.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">Loading file tree...</div>
          ) : (
            renderTree(fileTree)
          )}
        </div>
      </div>

      {/* Center: Monaco Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
        {/* Editor Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-dark-900 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs">
            <FileText className="w-4 h-4 text-brand-400" />
            <span className="font-mono text-slate-200 font-medium truncate">
              {selectedPath || 'Select a file'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyCode}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
              title="Copy Code"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Monaco Canvas */}
        <div className="flex-1 relative">
          {isLoadingContent ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
              Loading file content...
            </div>
          ) : (
            <Editor
              height="100%"
              language={selectedPath ? getLanguageMode(selectedPath) : 'plaintext'}
              theme="vs-dark"
              value={fileContent}
              onMount={handleEditorDidMount}
              options={{
                readOnly: true,
                fontSize: 13,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                automaticLayout: true,
                wordWrap: 'on',
              }}
            />
          )}
        </div>
      </div>

      {/* Right Sidebar: AST Symbol Outline */}
      <div className="w-72 border-l border-white/10 bg-dark-900/60 hidden lg:flex flex-col shrink-0">
        <div className="p-3 border-b border-white/5 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-brand-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">AST Symbol Outline</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {currentFileSymbols.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">
              No exported symbols extracted in this file.
            </p>
          ) : (
            currentFileSymbols.map((sym) => (
              <div
                key={sym.id}
                onClick={() => {
                  if (editorRef.current) {
                    editorRef.current.revealLineInCenter(sym.start_line);
                    editorRef.current.setPosition({ lineNumber: sym.start_line, column: 1 });
                  }
                }}
                className="p-2.5 rounded-xl bg-dark-950/70 border border-white/5 hover:border-brand-500/40 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-brand-500/20 text-brand-300">
                    {sym.kind}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-300">
                    L:{sym.start_line}-{sym.end_line}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white truncate" title={sym.name}>
                  {sym.name}
                </div>
                {sym.signature && (
                  <div className="text-[10px] font-mono text-emerald-400/80 truncate mt-0.5" title={sym.signature}>
                    {sym.signature}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
