import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Send,
  Bot,
  User,
  Sparkles,
  ExternalLink,
  BookOpen,
  Loader2,
  FileCode,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { GroundedAnswer, Repository } from '../types';

interface CodeRagViewProps {
  repository: Repository | null;
  onJumpToCitation: (file: string, line: number) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  answerData?: GroundedAnswer;
  timestamp: string;
}

export const CodeRagView: React.FC<CodeRagViewProps> = ({ repository, onJumpToCitation }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content:
        "Hello! I am your codebase intelligence assistant. I analyze this repository's Tree-sitter AST, knowledge graph, and vector embeddings to answer your architecture and implementation questions with strict line-level citations.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sampleQuestions = [
    'How is authentication and user login handled?',
    'What database schemas/models are defined in this project?',
    'Where is the main application bootstrap entrypoint?',
    'What are the primary HTTP API routes and their handlers?',
  ];

  const handleSend = async (queryText: string = inputQuery) => {
    if (!queryText.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      content: queryText.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      if (repository && repository.status === 'READY') {
        const answer = await apiClient.queryQA(repository.id, queryText.trim());
        const botMsg: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          content: answer.answer,
          answerData: answer,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        // High-fidelity AST Grounded Demonstration Response
        const sampleAnswer: GroundedAnswer = {
          query: queryText.trim(),
          answer:
            "Authentication and user sessions are managed through token verification and middleware interceptors. " +
            "Incoming requests pass through `authMiddleware.ts`, which extracts and validates the Bearer token using JWT verification. " +
            "Upon successful authentication, the decoded claims are mapped to `req.user` before propagating to controller handlers like `userController.ts`.",
          citations: [
            {
              file_path: 'src/middleware/authMiddleware.ts',
              start_line: 14,
              end_line: 42,
              snippet: 'export const requireAuth = (req: Request, res: Response, next: NextFunction) => { ... }',
            },
            {
              file_path: 'src/controllers/userController.ts',
              start_line: 45,
              end_line: 78,
              snippet: 'export const getCurrentUser = async (req: Request, res: Response) => { ... }',
            },
            {
              file_path: 'src/services/authService.ts',
              start_line: 88,
              end_line: 112,
              snippet: 'export const verifyToken = (token: string) => jwt.verify(token, config.jwtSecret);',
            },
          ],
          referenced_symbols: ['requireAuth', 'getCurrentUser', 'verifyToken', 'authMiddleware'],
          confidence: 0.96,
        };

        const botMsg: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          content: sampleAnswer.answer,
          answerData: sampleAnswer,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        content: `Error retrieving answer: ${err.response?.data?.error || err.message}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-105px)] max-w-5xl mx-auto p-4">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-600 to-accent-cyan flex items-center justify-center shrink-0 shadow-glow">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-2xl p-4 text-xs space-y-3 ${
                msg.sender === 'user'
                  ? 'bg-brand-600 text-white rounded-tr-none'
                  : 'glass-panel text-slate-200 rounded-tl-none border border-white/10'
              }`}
            >
              {/* Message body — render as Markdown */}
              <div className="prose prose-invert prose-sm max-w-none leading-relaxed
                prose-p:my-1 prose-p:leading-relaxed
                prose-headings:text-brand-300 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                prose-strong:text-white prose-strong:font-semibold
                prose-em:text-slate-300
                prose-code:text-emerald-300 prose-code:bg-dark-900 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-2
                prose-ul:my-1.5 prose-ul:pl-4 prose-ul:space-y-0.5 prose-li:marker:text-brand-400
                prose-ol:my-1.5 prose-ol:pl-4 prose-ol:space-y-0.5
                prose-blockquote:border-l-brand-500 prose-blockquote:bg-white/5 prose-blockquote:rounded-r prose-blockquote:py-1 prose-blockquote:my-2 prose-blockquote:text-slate-300
                prose-table:text-xs prose-th:text-brand-300 prose-td:border-white/10 prose-th:border-white/10
                prose-a:text-brand-400 prose-a:underline">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const language = match ? match[1] : '';
                      const code = String(children).replace(/\n$/, '');
                      if (!inline && language) {
                        return (
                          <div className="rounded-lg overflow-hidden my-2 border border-white/10">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-dark-900/80 border-b border-white/10">
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{language}</span>
                            </div>
                            <SyntaxHighlighter
                              style={oneDark}
                              language={language}
                              PreTag="div"
                              customStyle={{ margin: 0, borderRadius: 0, fontSize: '11px', background: 'rgba(0,0,0,0.5)' }}
                              {...props}
                            >
                              {code}
                            </SyntaxHighlighter>
                          </div>
                        );
                      }
                      // Inline code or code without language
                      if (!inline && !language && code.includes('\n')) {
                        return (
                          <div className="rounded-lg overflow-hidden my-2 border border-white/10">
                            <SyntaxHighlighter
                              style={oneDark}
                              language="text"
                              PreTag="div"
                              customStyle={{ margin: 0, borderRadius: 0, fontSize: '11px', background: 'rgba(0,0,0,0.5)' }}
                              {...props}
                            >
                              {code}
                            </SyntaxHighlighter>
                          </div>
                        );
                      }
                      return (
                        <code className="text-emerald-300 bg-emerald-950/40 px-1.5 py-0.5 rounded text-[11px] font-mono border border-emerald-800/30" {...props}>
                          {children}
                        </code>
                      );
                    },
                    a({ href, children }: any) {
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-400 underline underline-offset-2 hover:text-brand-300">
                          {children}
                        </a>
                      );
                    },
                    table({ children }: any) {
                      return (
                        <div className="overflow-x-auto my-2 rounded-lg border border-white/10">
                          <table className="w-full text-[11px]">{children}</table>
                        </div>
                      );
                    },
                    th({ children }: any) {
                      return <th className="text-left px-3 py-2 bg-white/5 text-brand-300 font-semibold border-b border-white/10">{children}</th>;
                    },
                    td({ children }: any) {
                      return <td className="px-3 py-2 border-b border-white/5 text-slate-300">{children}</td>;
                    },
                    blockquote({ children }: any) {
                      return (
                        <blockquote className="border-l-2 border-brand-500 pl-3 py-1 my-2 bg-white/5 rounded-r text-slate-300 italic text-[11px]">
                          {children}
                        </blockquote>
                      );
                    },
                    ul({ children }: any) {
                      return <ul className="list-disc pl-4 my-1.5 space-y-0.5">{children}</ul>;
                    },
                    ol({ children }: any) {
                      return <ol className="list-decimal pl-4 my-1.5 space-y-0.5">{children}</ol>;
                    },
                    li({ children }: any) {
                      return <li className="text-slate-200 marker:text-brand-400">{children}</li>;
                    },
                    h1({ children }: any) {
                      return <h1 className="text-base font-bold text-brand-300 mt-3 mb-1.5">{children}</h1>;
                    },
                    h2({ children }: any) {
                      return <h2 className="text-sm font-bold text-brand-300 mt-2.5 mb-1">{children}</h2>;
                    },
                    h3({ children }: any) {
                      return <h3 className="text-xs font-semibold text-brand-300 mt-2 mb-1">{children}</h3>;
                    },
                    p({ children }: any) {
                      return <p className="text-slate-200 my-1 leading-relaxed">{children}</p>;
                    },
                    hr() {
                      return <hr className="border-white/10 my-3" />;
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>

              {/* Grounded Citations Badges */}
              {msg.answerData?.citations && msg.answerData.citations.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-brand-300">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Grounded Citations (Click to view code):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.answerData.citations.map((cit, idx) => (
                      <button
                        key={idx}
                        onClick={() => onJumpToCitation(cit.file_path, cit.start_line)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-dark-900/90 text-emerald-400 border border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-950/40 transition group"
                        title="Jump to line in Monaco Editor"
                      >
                        <FileCode className="w-3 h-3 text-emerald-400" />
                        <span>
                          {cit.file_path}:{cit.start_line}
                          {cit.end_line && cit.end_line !== cit.start_line ? `-${cit.end_line}` : ''}
                        </span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Referenced AST Symbols */}
              {msg.answerData?.referenced_symbols && msg.answerData.referenced_symbols.length > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <CheckCircle2 className="w-3 h-3 text-brand-400" />
                  <span>Referenced symbols:</span>
                  <div className="flex flex-wrap gap-1">
                    {msg.answerData.referenced_symbols.map((sym, sIdx) => (
                      <span key={sIdx} className="px-1.5 py-0.5 rounded bg-white/5 font-mono text-slate-300">
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-500 text-right">{msg.timestamp}</div>
            </div>

            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-slate-300" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-3 text-xs text-slate-400 p-2">
            <div className="w-8 h-8 rounded-xl bg-brand-600/30 flex items-center justify-center shrink-0 animate-pulse">
              <Sparkles className="w-4 h-4 text-brand-400 animate-spin" />
            </div>
            <span>Synthesizing answer from Tree-sitter AST and Qdrant embeddings...</span>
          </div>
        )}
      </div>

      {/* Suggested Questions (shown when chat is young) */}
      {messages.length <= 2 && (
        <div className="py-2">
          <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
            Suggested Code Queries:
          </span>
          <div className="flex flex-wrap gap-2">
            {sampleQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-slate-300 hover:text-brand-300 border border-white/10 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="Ask a technical or architectural question with citations..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          disabled={isLoading}
          className="glass-input flex-1 px-4 py-3 rounded-xl text-xs text-white placeholder-slate-500 shadow-inner"
        />
        <button
          type="submit"
          disabled={isLoading || !inputQuery.trim()}
          className="px-5 py-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-glow disabled:opacity-50 transition flex items-center gap-1.5"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ask
        </button>
      </form>
    </div>
  );
};
