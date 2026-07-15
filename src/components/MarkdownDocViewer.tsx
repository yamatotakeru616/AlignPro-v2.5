import React, { useState, useMemo } from 'react';
import { FileText, X, ChevronRight, BookOpen, Search, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 静的にマークダウンファイルを raw テキストとしてインポート（404読込エラーやネットワーク遅延を完全に排除）
import featuresMd from '../../機能一覧書.md?raw';
import designMd from '../../デザイン.md?raw';
import codingDetailsMd from '../../コーディング詳細設計書.md?raw';
import harnessMd from '../../ハーネス.md?raw';
import loopAgentMd from '../../ループエージェント.md?raw';
import agentSkillMd from '../../Agent SKILL.md?raw';
import agentsMd from '../../AGENTS.md?raw';

interface MarkdownDocViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOC_FILES = [
  { id: 'features', label: '機能一覧書 (Features)', content: featuresMd },
  { id: 'design', label: 'デザイン定義書 (UI/Design & Performance)', content: designMd },
  { id: 'coding', label: '詳細設計書 (Architecture)', content: codingDetailsMd },
  { id: 'harness', label: 'ハーネス (Testing/Harness)', content: harnessMd },
  { id: 'loop', label: 'ループ設計書 (Loop Agent)', content: loopAgentMd },
  { id: 'skill', label: 'エージェントスキル (Agent Skill)', content: agentSkillMd },
  { id: 'agents', label: 'プロジェクト開発ルール (AGENTS.md)', content: agentsMd }
];

export default function MarkdownDocViewer({ isOpen, onClose }: MarkdownDocViewerProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>(DOC_FILES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // 現在選択されているドキュメントオブジェクト
  const selectedDoc = useMemo(() => {
    return DOC_FILES.find(doc => doc.id === selectedDocId) || DOC_FILES[0];
  }, [selectedDocId]);

  // 検索クエリに基づいて、ドキュメント一覧をフィルタリング、またはマッチ状況を表示
  const filteredDocs = useMemo(() => {
    if (!searchQuery) return DOC_FILES;
    const query = searchQuery.toLowerCase();
    return DOC_FILES.map(doc => {
      const matchCount = (doc.content.toLowerCase().split(query).length - 1);
      return {
        ...doc,
        matchCount
      };
    });
  }, [searchQuery]);

  // クリップボードにコピー
  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(selectedDoc.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  if (!isOpen) return null;

  // ReactMarkdown用のカスタムレンダラー (100% Tailwind CSS を適用した超高精度レンダリング)
  const markdownComponents: any = {
    h1: ({ children, ...props }: any) => (
      <h1 className="text-sm font-extrabold text-white border-b border-white/10 pb-2 mt-6 mb-3 font-display tracking-tight" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2 className="text-[11px] font-bold text-cyan-400 mt-5 mb-2 flex items-center gap-1.5" {...props}>
        <span className="inline-block w-1.5 h-3.5 bg-cyan-500 rounded-sm shadow-[0_0_8px_rgba(6,182,212,0.4)]"></span>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3 className="text-[10px] font-bold text-slate-200 mt-4 mb-1.5 uppercase tracking-wide" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }: any) => (
      <p className="text-[11px] text-slate-400 leading-relaxed my-1.5 font-sans" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }: any) => (
      <ul className="list-disc list-inside ml-3 my-2 text-[11px] text-slate-300 space-y-1" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol className="list-decimal list-inside ml-3 my-2 text-[11px] text-slate-300 space-y-1" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: any) => (
      <li className="text-[11px] text-slate-300 leading-relaxed ml-1" {...props}>
        {children}
      </li>
    ),
    blockquote: ({ children, ...props }: any) => (
      <blockquote className="border-l-2 border-slate-500 bg-slate-950/40 px-3 py-1 text-[10px] text-slate-400 italic my-2 rounded-r" {...props}>
        {children}
      </blockquote>
    ),
    pre: ({ children, ...props }: any) => (
      <pre className="bg-slate-950 border border-white/5 p-3 rounded font-mono text-[10px] text-slate-300 my-2 overflow-x-auto leading-relaxed select-text shadow-inner" {...props}>
        {children}
      </pre>
    ),
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = inline !== undefined ? inline : (!match && typeof children === 'string' && !children.includes('\n'));
      return isInline ? (
        <code className="bg-slate-950/80 px-1.5 py-0.5 rounded font-mono text-[10px] text-cyan-300 border border-white/5 mx-0.5" {...props}>
          {children}
        </code>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    table: ({ children, ...props }: any) => (
      <div className="overflow-x-auto my-3 border border-white/10 rounded-lg">
        <table className="min-w-full divide-y divide-white/10 border-collapse" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }: any) => (
      <thead className="bg-slate-950/50" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }: any) => (
      <tbody className="divide-y divide-white/5" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ children, ...props }: any) => (
      <tr className="hover:bg-white/[0.02] transition-colors" {...props}>
        {children}
      </tr>
    ),
    th: ({ children, ...props }: any) => (
      <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-300 uppercase tracking-wider font-mono border-b border-white/10" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td className="px-3 py-1.5 text-[10px] text-slate-400 font-sans" {...props}>
        {children}
      </td>
    ),
    hr: ({ ...props }: any) => (
      <hr className="border-white/10 my-4" {...props} />
    ),
    a: ({ children, ...props }: any) => (
      <a className="text-cyan-400 hover:text-cyan-300 underline font-medium" target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    input: ({ type, checked, disabled, ...props }: any) => {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="mt-0.5 mr-1.5 h-3.5 w-3.5 rounded border-white/15 bg-slate-950 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900 accent-cyan-500 cursor-default"
            {...props}
          />
        );
      }
      return <input type={type} checked={checked} disabled={disabled} {...props} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 animate-fade-in">
      {/* 背景クリックで閉じる */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>

      {/* ドキュメントビューア（全画面拡大表示） */}
      <div className="relative z-10 w-full h-full max-w-7xl bg-slate-900 border border-white/15 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* 1. ヘッダー */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-600/15 text-cyan-400 rounded-lg">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                AlignPro ドキュメントビューア
              </h2>
              <p className="text-[9px] text-slate-500">
                作成された各種設計書・機能定義書をリアルタイムで同期表示します (オフライン・ミリ秒瞬時ロード)
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5">
            {/* コピーボタン */}
            <button
              onClick={handleCopyContent}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-lg text-[9px] font-bold text-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
              title="選択中のドキュメントのMarkdownソースをコピー"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  コピー完了
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  MDをコピー
                </>
              )}
            </button>

            {/* 閉じる */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. メインパネル */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* 左サイドバー: 検索 ＆ ドキュメント一覧 */}
          <div className="w-64 border-r border-white/5 bg-slate-950/25 p-3 flex flex-col gap-3 shrink-0">
            {/* 検索バー */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="ドキュメントを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[10px] text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2 mb-2">
                ドキュメント一覧
              </div>
              
              {filteredDocs.map((doc) => {
                const isSelected = selectedDoc.id === doc.id;
                const hasMatches = searchQuery && ('matchCount' in doc) && ((doc as any).matchCount || 0) > 0;
                
                return (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`w-full text-left p-2 rounded-lg text-[11px] font-medium transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                      <span className="truncate">{doc.label}</span>
                    </div>
                    {hasMatches ? (
                      <span className="text-[8px] bg-cyan-950 border border-cyan-500/30 text-cyan-400 px-1 py-0.2 rounded font-mono">
                        {(doc as any).matchCount}件
                      </span>
                    ) : (
                      isSelected && <ChevronRight className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右メインエリア: Markdownの高精度表示 */}
          <div className="flex-1 bg-slate-950/15 p-6 overflow-y-auto selection:bg-cyan-500/30 selection:text-white">
            <div className="prose prose-invert max-w-none text-left select-text markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {selectedDoc.content}
              </ReactMarkdown>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
