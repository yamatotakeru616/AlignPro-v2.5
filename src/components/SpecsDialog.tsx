/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  X, 
  Copy, 
  Check, 
  FileText, 
  Book, 
  RefreshCcw, 
  Layers, 
  Zap, 
  GraduationCap, 
  FileCode,
  Eye
} from 'lucide-react';
import { ControlPoint, CrossSectionParams } from '../types';

// Vite の ?raw ローダーを利用してルートにあるマークダウンファイルを文字列としてインポート
// @ts-ignore
import kinoList from '@/機能一覧書.md?raw';
// @ts-ignore
import codingSpec from '@/コーディング詳細設計書.md?raw';
// @ts-ignore
import loopAgent from '@/ループエージェント.md?raw';
// @ts-ignore
import harness from '@/ハーネス.md?raw';
// @ts-ignore
import agentsRule from '@/AGENTS.md?raw';
// @ts-ignore
import agentSkill from '@/Agent SKILL.md?raw';

interface SpecsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  points: ControlPoint[];
  crossSection: CrossSectionParams;
}

export default function SpecsDialog({ isOpen, onClose, points, crossSection }: SpecsDialogProps) {
  const [copied, setCopied] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string>('kino');

  if (!isOpen) return null;

  // インポートしたドキュメントデータの一覧
  const DOCS = [
    { id: 'kino', title: '機能一覧書.md', displayTitle: '📋 機能一覧書', content: kinoList, icon: FileText },
    { id: 'spec', title: 'コーディング詳細設計書.md', displayTitle: '📐 コーディング詳細設計書', content: codingSpec, icon: Book },
    { id: 'loop', title: 'ループエージェント.md', displayTitle: '🔄 ループエージェント解説', content: loopAgent, icon: RefreshCcw },
    { id: 'harness', title: 'ハーネス.md', displayTitle: '🛠️ テストハーネス設計', content: harness, icon: Layers },
    { id: 'rule', title: 'AGENTS.md', displayTitle: '⚖️ プロジェクト開発ルール', content: agentsRule, icon: Zap },
    { id: 'skill', title: 'Agent SKILL.md', displayTitle: '🎓 エージェントスキル', content: agentSkill, icon: GraduationCap },
  ];

  const activeDoc = DOCS.find(d => d.id === activeDocId) || DOCS[0];

  // 現在のパラメータ状態をコピー用テキストにフォーマット
  const getParamsText = () => {
    return JSON.stringify({
      projectName: "3D_Road_Alignment_Project",
      timestamp: new Date().toISOString(),
      controlPoints: points.map(p => ({
        id: p.id,
        name: p.name,
        lng: parseFloat(p.lng.toFixed(6)),
        lat: parseFloat(p.lat.toFixed(6)),
        x: Math.round(p.x),
        y: Math.round(p.y),
        z: parseFloat(p.z.toFixed(2))
      })),
      crossSectionParams: crossSection
    }, null, 2);
  };

  const handleCopyParams = async () => {
    try {
      await navigator.clipboard.writeText(getParamsText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy params: ", err);
    }
  };

  // ReactMarkdown 用のカスタムテーマスタイリングコンポーネント
  const markdownComponents = {
    h1: ({ children, ...props }: any) => (
      <h1 className="text-lg md:text-xl font-bold text-white mt-6 mb-4 font-display border-b border-white/10 pb-2 flex items-center gap-2" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2 className="text-base md:text-lg font-bold text-slate-100 mt-6 mb-3 font-display border-b border-white/5 pb-1" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3 className="text-sm md:text-base font-bold text-blue-400 mt-5 mb-2" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }: any) => (
      <p className="text-slate-300 text-xs md:text-sm leading-relaxed mb-3" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }: any) => (
      <ul className="list-disc pl-5 mb-4 space-y-1 text-slate-300 text-xs md:text-sm" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol className="list-decimal pl-5 mb-4 space-y-1 text-slate-300 text-xs md:text-sm" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: any) => (
      <li className="leading-relaxed" {...props}>
        {children}
      </li>
    ),
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = inline !== undefined ? inline : (!match && typeof children === 'string' && !children.includes('\n'));
      return isInline ? (
        <code className="bg-slate-900 text-blue-400 font-mono text-[10px] md:text-xs px-1.5 py-0.5 rounded border border-white/5" {...props}>
          {children}
        </code>
      ) : (
        <span className="block bg-slate-950/90 p-3.5 rounded-xl border border-white/10 overflow-x-auto font-mono text-[10px] md:text-[11px] text-emerald-400 leading-relaxed my-3 select-all whitespace-pre">
          <code className={className} {...props}>
            {children}
          </code>
        </span>
      );
    },
    table: ({ children, ...props }: any) => (
      <div className="overflow-x-auto my-4 border border-white/10 rounded-xl">
        <table className="w-full border-collapse text-xs md:text-sm text-left" {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }: any) => (
      <th className="bg-slate-900/95 px-3 py-2 text-white font-semibold border-b border-white/10" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td className="px-3 py-2 border-b border-white/5 text-slate-300 bg-slate-950/40" {...props}>
        {children}
      </td>
    ),
    blockquote: ({ children, ...props }: any) => (
      <blockquote className="border-l-4 border-blue-500 bg-blue-500/5 px-4 py-2 rounded-r-lg my-3 italic text-slate-400 text-xs md:text-sm" {...props}>
        {children}
      </blockquote>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-6xl h-[85vh] flex flex-col glass-panel rounded-2xl shadow-2xl overflow-hidden border border-white/10">
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5 text-blue-400">
            <Eye className="w-5 h-5 text-blue-400 animate-pulse" />
            <div>
              <h2 className="text-sm md:text-base font-extrabold tracking-tight text-white font-display">
                CIMドキュメント ＆ 詳細設計書ビュアー
              </h2>
              <p className="text-[10px] text-slate-400 hidden sm:block">本アプリケーションに関連するマークダウン資料をリアルタイムにフォーマット描画します</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* メインエリア：2カラム（左サイドバー、右プレビュー） */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* 左サイドバー：ファイル一覧（スマホ時は横スクロールリスト） */}
          <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/10 bg-slate-950/35 shrink-0 flex flex-col min-h-0">
            <div className="p-3 bg-white/5 border-b border-white/5 text-[10px] font-bold text-slate-400 tracking-wider hidden md:block">
              DOCUMENTS IN-APP
            </div>
            
            {/* ナビゲーションリスト */}
            <nav className="flex md:flex-col overflow-x-auto md:overflow-y-auto p-2.5 gap-1.5 scrollbar-thin shrink-0 md:shrink">
              {DOCS.map(doc => {
                const Icon = doc.icon;
                const isActive = doc.id === activeDocId;
                return (
                  <button
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer w-auto md:w-full ${
                      isActive 
                      ? 'bg-blue-600/15 border border-blue-500/35 text-white shadow-lg shadow-blue-600/5' 
                      : 'border border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <div className="font-bold">{doc.displayTitle}</div>
                      <div className="text-[9px] text-slate-500 hidden md:block font-mono mt-0.5">{doc.title}</div>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* 開発者用クイックコピー（サイドバー下部、デスクトップのみ） */}
            <div className="mt-auto p-4 border-t border-white/10 bg-slate-950/60 space-y-3 hidden md:block">
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-blue-400">LIVE GEOMETRY DATA</div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  現在の全設計パラメータ（座標・断面制約）をJSON形式でクリップボードへ保存。
                </p>
              </div>
              <button
                onClick={handleCopyParams}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-white/10 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    パラメータコピー完了！
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-blue-400" />
                    パラメータ(JSON)をコピー
                  </>
                )}
              </button>
            </div>
          </aside>

          {/* 右コンテンツ：マークダウンビュアー */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#030712]">
            
            {/* ビュアーヘッダー */}
            <div className="px-4 py-2 border-b border-white/5 bg-white/2 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-slate-400 text-[10px]">{activeDoc.title}</span>
              </div>
              <div className="text-[10px] text-slate-500">
                Viewer Engine: react-markdown + remark-gfm
              </div>
            </div>

            {/* マークダウンレンダーコンテナ */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin">
              <div className="markdown-body max-w-4xl mx-auto">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]} 
                  components={markdownComponents}
                >
                  {activeDoc.content || `*ファイル "${activeDoc.title}" の読み込みに失敗したか、中身が空です。*`}
                </ReactMarkdown>
              </div>
            </div>

            {/* スマホ時のみ表示される下部クイックコピー */}
            <div className="p-3 bg-slate-950/90 border-t border-white/10 flex items-center justify-between md:hidden shrink-0">
              <span className="text-[9px] text-slate-500">LIVE GEOMETRY:</span>
              <button
                onClick={handleCopyParams}
                className="px-3 py-1.5 bg-slate-900 border border-white/10 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    コピー完了
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-blue-400" />
                    JSONコピー
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

        {/* フッター */}
        <div className="px-6 py-3 border-t border-white/10 bg-slate-950/80 flex justify-between text-[10px] text-slate-500 font-mono shrink-0">
          <span>AlignPro Document Hub v2.4</span>
          <span className="text-slate-400 italic">Sophisticated Client-Side MD Engine</span>
        </div>
      </div>
    </div>
  );
}
