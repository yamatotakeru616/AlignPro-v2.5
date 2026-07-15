/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GitCompare, 
  History, 
  Clock, 
  ArrowRight, 
  ChevronRight, 
  RotateCcw, 
  Check, 
  Plus, 
  Minus, 
  AlertCircle, 
  X, 
  Activity,
  MapPin,
  TrendingUp,
  Columns,
  Sparkles,
  Layers,
  CornerDownRight,
  ChevronLeft,
  Coins
} from 'lucide-react';
import { AppState, Command } from '../utils/command';
import { calculateAlignment, calculateVolumes } from '../utils';
import { ControlPoint, CrossSectionParams, SectionSegment } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  initialState: AppState;
  commandHistory: {
    undo: { id: string; type: string; description: string; timestamp: number; stateSnapshot?: AppState }[];
    redo: { id: string; type: string; description: string; timestamp: number; stateSnapshot?: AppState }[];
  };
  onRestoreState: (state: AppState, description: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// 単位工事費の設定 (CompareTab.tsxと完全に同期)
const COST_UNIT = {
  cut: 3200,          // 切土: 3,200円 / m3
  fill: 4100,         // 盛土: 4,100円 / m3
  bridge: 1600000,    // 橋梁: 1,600,000円 / m
  viaduct: 1100000,   // 高架橋: 1,100,000円 / m
  tunnel: 3800000,    // トンネル: 3,800,000円 / m
  pavement: 12000,    // 舗装: 12,000円 / m2
  slope: 8500,        // のり面保護工: 8,500円 / m2
};

export default function HistoryDrawer({
  isOpen,
  onClose,
  appState,
  initialState,
  commandHistory,
  onRestoreState,
  undo,
  redo,
  canUndo,
  canRedo
}: HistoryDrawerProps) {
  // 比較対象ノードの選択用ステート
  // 'initial' = 初期状態
  // コマンドID = 各履歴ノード
  // 'current' = 現在の最新状態
  const [selectedIdA, setSelectedIdA] = useState<string>('initial');
  const [selectedIdB, setSelectedIdB] = useState<string>('current');
  const [activeTab, setActiveTab] = useState<'costs' | 'horizontal' | 'vertical'>('costs');

  // 直列の全歴史タイムラインを作成
  const timelineNodes = useMemo(() => {
    const nodes: {
      id: string;
      type: 'initial' | 'undo' | 'redo' | 'current';
      label: string;
      description: string;
      timestamp: number;
      state: AppState;
      isActive: boolean;
    }[] = [];

    // 1. 初期状態
    nodes.push({
      id: 'initial',
      type: 'initial',
      label: '起点',
      description: '設計開始時の初期アライメント案',
      timestamp: Date.now() - 3600000, // 簡易的な過去時間
      state: initialState,
      isActive: commandHistory.undo.length === 0,
    });

    // 2. 実行済み（Undoスタック）
    commandHistory.undo.forEach((c, idx) => {
      const isLastUndo = idx === commandHistory.undo.length - 1;
      nodes.push({
        id: c.id,
        type: 'undo',
        label: `設計履歴 #${idx + 1}`,
        description: c.description,
        timestamp: c.timestamp,
        state: c.stateSnapshot || appState,
        isActive: isLastUndo,
      });
    });

    // 3. 未来予測（Redoスタック、半透明・適用候補）
    commandHistory.redo.forEach((c, idx) => {
      nodes.push({
        id: c.id,
        type: 'redo',
        label: `やり直し候補 #${idx + 1}`,
        description: c.description,
        timestamp: c.timestamp,
        state: c.stateSnapshot || appState,
        isActive: false,
      });
    });

    return nodes;
  }, [initialState, commandHistory, appState]);

  // 現在適用されているアクティブノードを取得
  const activeNode = useMemo(() => {
    return timelineNodes.find(n => n.isActive) || timelineNodes[0];
  }, [timelineNodes]);

  // 選択された A, B の AppState を解決する
  const stateA = useMemo(() => {
    if (selectedIdA === 'initial') return initialState;
    if (selectedIdA === 'current') return appState;
    const found = timelineNodes.find(n => n.id === selectedIdA);
    return found ? found.state : initialState;
  }, [selectedIdA, initialState, appState, timelineNodes]);

  const stateB = useMemo(() => {
    if (selectedIdB === 'initial') return initialState;
    if (selectedIdB === 'current') return appState;
    const found = timelineNodes.find(n => n.id === selectedIdB);
    return found ? found.state : appState;
  }, [selectedIdB, initialState, appState, timelineNodes]);

  // 1つの AppState から、土量・延長・コストを含む積算データを計算するヘルパー
  const calculateStateStats = (state: AppState) => {
    const activeRoadId = state.network.activeAlignmentId;
    const plan = state.network.alignments[activeRoadId] || Object.values(state.network.alignments)[0];
    if (!plan) {
      return {
        points: [],
        vols: { cutVolume: 0, fillVolume: 0, netVolume: 0, avgSlope: 0, totalLength: 0 },
        totalLength: 0,
        bridgeLen: 0,
        viaductLen: 0,
        tunnelLen: 0,
        earthworkLen: 0,
        pavementArea: 0,
        slopeArea: 0,
        totalCostOku: 0,
        maxSlope: 0,
        crossSection: plan?.crossSection || initialState.network.alignments['main-road'].crossSection
      };
    }

    const pts = plan.points;
    const cs = plan.crossSection;
    const segs = plan.segments;

    const alignPoints = calculateAlignment(pts, cs, 60);
    const vols = calculateVolumes(alignPoints, cs, segs);

    let bridgeLen = 0;
    let viaductLen = 0;
    let tunnelLen = 0;
    let earthworkLen = 0;

    segs.forEach(seg => {
      const len = Math.max(0, seg.endDist - seg.startDist);
      if (seg.type === 'bridge') bridgeLen += len;
      else if (seg.type === 'viaduct') viaductLen += len;
      else if (seg.type === 'tunnel') tunnelLen += len;
      else earthworkLen += len;
    });

    const totalLength = alignPoints.length > 0 ? alignPoints[alignPoints.length - 1].distance : 0;
    const sumStructures = bridgeLen + viaductLen + tunnelLen;
    earthworkLen = Math.max(0, totalLength - sumStructures);

    const roadWidth = cs.leftLaneWidth + cs.rightLaneWidth + cs.shoulderWidth * 2;
    const pavementArea = totalLength * roadWidth;

    let sumSlopeArea = 0;
    let maxSlopeVal = 0;

    alignPoints.forEach((p, i) => {
      if (i < alignPoints.length - 1) {
        const p2 = alignPoints[i + 1];
        const segmentLen = p2.distance - p.distance;
        if (segmentLen > 0.1) {
          const slope = Math.abs((p2.z - p.z) / segmentLen) * 100;
          if (slope > maxSlopeVal) maxSlopeVal = slope;
        }
      }

      const isStructure = segs.some(seg => 
        p.distance >= seg.startDist && 
        p.distance <= seg.endDist && 
        seg.type !== 'earthwork'
      );

      if (!isStructure) {
        const heightDiff = Math.abs(p.z - p.groundZ);
        if (heightDiff > 0.5) {
          const slopeGrad = heightDiff > 0 ? cs.fillSlopeGradient : cs.cutSlopeGradient;
          const slopeLen = heightDiff * Math.sqrt(1 + (slopeGrad || 1.5) * (slopeGrad || 1.5));
          const dDist = totalLength / 60;
          sumSlopeArea += slopeLen * dDist * 2;
        }
      }
    });

    const costCut = vols.cutVolume * COST_UNIT.cut;
    const costFill = vols.fillVolume * COST_UNIT.fill;
    const costBridge = bridgeLen * COST_UNIT.bridge;
    const costViaduct = viaductLen * COST_UNIT.viaduct;
    const costTunnel = tunnelLen * COST_UNIT.tunnel;
    const costPavement = pavementArea * COST_UNIT.pavement;
    const costSlope = sumSlopeArea * COST_UNIT.slope;

    const totalCost = costCut + costFill + costBridge + costViaduct + costTunnel + costPavement + costSlope;

    return {
      points: pts,
      vols,
      totalLength,
      bridgeLen,
      viaductLen,
      tunnelLen,
      earthworkLen,
      pavementArea,
      slopeArea: sumSlopeArea,
      totalCostOku: totalCost / 100000000,
      maxSlope: maxSlopeVal,
      crossSection: cs,
    };
  };

  const statsA = useMemo(() => calculateStateStats(stateA), [stateA]);
  const statsB = useMemo(() => calculateStateStats(stateB), [stateB]);

  // A案とB案の差分の計算
  const delta = useMemo(() => {
    return {
      costOku: statsB.totalCostOku - statsA.totalCostOku,
      cutVolume: statsB.vols.cutVolume - statsA.vols.cutVolume,
      fillVolume: statsB.vols.fillVolume - statsA.vols.fillVolume,
      totalLength: statsB.totalLength - statsA.totalLength,
      pavementArea: statsB.pavementArea - statsA.pavementArea,
      slopeArea: statsB.slopeArea - statsA.slopeArea,
      bridgeLen: statsB.bridgeLen - statsA.bridgeLen,
      viaductLen: statsB.viaductLen - statsA.viaductLen,
      tunnelLen: statsB.tunnelLen - statsA.tunnelLen,
    };
  }, [statsA, statsB]);

  // 平面線形（IP）の対比
  const ipDeltaList = useMemo(() => {
    const list: {
      index: number;
      name: string;
      a?: ControlPoint;
      b?: ControlPoint;
      distShift: number; // 位置ずれ(m)
      rDiff?: number;    // 半径差分(m)
    }[] = [];

    const maxPoints = Math.max(statsA.points.length, statsB.points.length);
    for (let i = 0; i < maxPoints; i++) {
      const ptA = statsA.points[i];
      const ptB = statsB.points[i];

      let distShift = 0;
      if (ptA && ptB) {
        distShift = Math.sqrt(Math.pow(ptB.x - ptA.x, 2) + Math.pow(ptB.y - ptA.y, 2));
      }

      list.push({
        index: i,
        name: ptB?.name || ptA?.name || `IP ${i}`,
        a: ptA,
        b: ptB,
        distShift,
        rDiff: (ptA && ptB && ptA.r !== undefined && ptB.r !== undefined) ? (ptB.r - ptA.r) : undefined,
      });
    }

    return list;
  }, [statsA.points, statsB.points]);

  // 縦断面（計画高）の対比
  const verticalDeltaList = useMemo(() => {
    const list: {
      index: number;
      name: string;
      a?: ControlPoint;
      b?: ControlPoint;
      zDiff?: number;
      vclDiff?: number;
    }[] = [];

    const maxPoints = Math.max(statsA.points.length, statsB.points.length);
    for (let i = 0; i < maxPoints; i++) {
      const ptA = statsA.points[i];
      const ptB = statsB.points[i];

      list.push({
        index: i,
        name: ptB?.name || ptA?.name || `IP ${i}`,
        a: ptA,
        b: ptB,
        zDiff: (ptA && ptB) ? (ptB.z - ptA.z) : undefined,
        vclDiff: (ptA && ptB && ptA.vcl !== undefined && ptB.vcl !== undefined) ? (ptB.vcl - ptA.vcl) : undefined,
      });
    }

    return list;
  }, [statsA.points, statsB.points]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
        {/* 背景のブラックアウト */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black backdrop-blur-sm"
        />

        {/* ドロワー本体 */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-4xl h-full bg-[#0c0d14] border-l border-white/10 flex flex-col shadow-2xl z-10"
        >
          {/* ヘッダー部 */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/60 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-400 animate-pulse" />
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">設計変更履歴 ＆ 差分比較ビューアー</h2>
                <p className="text-[10px] text-slate-400 leading-tight">直列のUndo/Redoスナップショットから、2案の線形・工事費の変化を可視化</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* コンテンツ部（左右2カラム構成） */}
          <div className="flex-1 flex overflow-hidden">
            {/* 左カラム：直列履歴タイムライン（ツリー） */}
            <div className="w-1/3 border-r border-white/5 bg-slate-950/40 flex flex-col">
              <div className="p-3 border-b border-white/5 bg-slate-950/30 flex items-center justify-between select-none">
                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  時系列設計ツリー
                </span>
                <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1 py-0.5 rounded font-mono font-bold">
                  {timelineNodes.length} ノード
                </span>
              </div>

              {/* クイック Undo / Redo */}
              <div className="p-2 border-b border-white/5 bg-slate-950/20 flex gap-1">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className={`flex-1 py-1 text-[9px] font-extrabold flex items-center justify-center gap-1 border rounded transition-all ${
                    canUndo
                      ? 'bg-slate-900 border-white/10 hover:bg-slate-800 text-slate-200 cursor-pointer'
                      : 'bg-transparent border-transparent text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <ChevronLeft className="w-3 h-3 text-blue-500" />
                  Undo
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className={`flex-1 py-1 text-[9px] font-extrabold flex items-center justify-center gap-1 border rounded transition-all ${
                    canRedo
                      ? 'bg-slate-900 border-white/10 hover:bg-slate-800 text-slate-200 cursor-pointer'
                      : 'bg-transparent border-transparent text-slate-600 cursor-not-allowed'
                  }`}
                >
                  Redo
                  <ChevronRight className="w-3 h-3 text-indigo-500" />
                </button>
              </div>

              {/* タイムラインリスト */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4 relative">
                {/* 縦の接続線 */}
                <div className="absolute left-[25px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-600/30 via-indigo-600/30 to-purple-600/10 pointer-events-none" />

                {timelineNodes.map((node, index) => {
                  const isCurrent = node.isActive;
                  const isA = selectedIdA === node.id;
                  const isB = selectedIdB === node.id;

                  return (
                    <div 
                      key={`${node.type}-${node.id}-${index}`} 
                      className={`relative flex gap-3 group transition-all p-2 rounded-lg border ${
                        isCurrent 
                          ? 'bg-blue-950/20 border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.05)]' 
                          : 'border-transparent hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* インジケータピン */}
                      <div className="relative z-10 flex flex-col items-center">
                        <button
                          onClick={() => {
                            if (selectedIdA === node.id) return;
                            setSelectedIdA(node.id);
                          }}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border shadow ${
                            isCurrent
                              ? 'bg-blue-600 border-blue-400 text-white shadow-blue-500/20'
                              : node.type === 'redo'
                              ? 'bg-slate-900 border-white/5 text-slate-500'
                              : 'bg-slate-900 border-white/10 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {index}
                        </button>

                        {/* クイック選択バッジ */}
                        <div className="flex gap-1 mt-1.5">
                          <button
                            onClick={() => setSelectedIdA(node.id)}
                            className={`px-1 py-0.5 rounded text-[8px] font-black tracking-wide border transition-all cursor-pointer ${
                              isA
                                ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-extrabold'
                                : 'bg-slate-950/40 border-white/5 text-slate-500 hover:text-slate-300'
                            }`}
                            title="比較対象 A 案(基準案)として設定"
                          >
                            A
                          </button>
                          <button
                            onClick={() => setSelectedIdB(node.id)}
                            className={`px-1 py-0.5 rounded text-[8px] font-black tracking-wide border transition-all cursor-pointer ${
                              isB
                                ? 'bg-rose-500/20 border-rose-500 text-rose-400 font-extrabold'
                                : 'bg-slate-950/40 border-white/5 text-slate-500 hover:text-slate-300'
                            }`}
                            title="比較対象 B 案(変更後案)として設定"
                          >
                            B
                          </button>
                        </div>
                      </div>

                      {/* ノード詳細情報 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={`text-[10px] font-bold truncate ${isCurrent ? 'text-blue-400' : 'text-slate-300'}`}>
                            {node.description}
                          </span>
                          {isCurrent && (
                            <span className="shrink-0 text-[7px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-1 py-0.5 rounded font-black">
                              適用中
                            </span>
                          )}
                        </div>
                        <p className="text-[8px] text-slate-500 leading-normal mt-0.5">
                          {node.label} • {new Date(node.timestamp).toLocaleTimeString()}
                        </p>

                        {/* この時点に復元するボタン */}
                        <button
                          onClick={() => onRestoreState(node.state, `設計履歴「${node.description}」の復元`)}
                          className="mt-1.5 px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded text-[8px] text-slate-400 hover:text-white flex items-center gap-1 transition-all cursor-pointer font-bold"
                          title="この時点の設計データを現在のアライメントにロードし、新規コマンドとして適用します"
                        >
                          <RotateCcw className="w-2 h-2 text-amber-500" />
                          この時点に復元
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右カラム：差分解析（Delta Viewer） */}
            <div className="w-2/3 flex flex-col bg-[#08090f]/90">
              {/* 対比ヘッダー */}
              <div className="p-3 border-b border-white/5 bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <GitCompare className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-400">リアルタイム差分検証</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                    <span className="text-amber-500 font-extrabold">A案:</span>
                    <span className="text-white truncate max-w-[100px]" title={timelineNodes.find(n => n.id === selectedIdA)?.description || '初期状態'}>
                      {selectedIdA === 'initial' ? '初期状態' : selectedIdA === 'current' ? '最新状態' : timelineNodes.find(n => n.id === selectedIdA)?.description || '選択案'}
                    </span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                    <span className="text-rose-500 font-extrabold">B案:</span>
                    <span className="text-white truncate max-w-[100px]" title={timelineNodes.find(n => n.id === selectedIdB)?.description || '最新状態'}>
                      {selectedIdB === 'initial' ? '初期状態' : selectedIdB === 'current' ? '最新状態' : timelineNodes.find(n => n.id === selectedIdB)?.description || '選択案'}
                    </span>
                  </div>
                </div>
              </div>

              {/* サブタブ選択 */}
              <div className="flex border-b border-white/5 bg-slate-950/20 p-1">
                {[
                  { id: 'costs', label: 'コスト＆土工総括', icon: Coins },
                  { id: 'horizontal', label: '平面線形 (IP)', icon: MapPin },
                  { id: 'vertical', label: '縦断面・計画高', icon: TrendingUp }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-extrabold transition-all border cursor-pointer rounded-md ${
                        isActive
                          ? 'bg-slate-900 border-white/10 text-white shadow'
                          : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* 差分表示領域 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* 1. コスト＆土工総括タブ */}
                {activeTab === 'costs' && (
                  <div className="space-y-3.5">
                    
                    {/* 工事費比較カード */}
                    <div className="bg-slate-950/40 border border-white/5 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-rose-400" />
                          総工事費・土量バランス
                        </span>
                        <span className="text-[8px] text-slate-500">※各単価テーブル基準</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-900/60 p-2 rounded border border-white/5">
                          <p className="text-[8px] text-slate-500">A案 総工事費</p>
                          <p className="text-xs font-black text-amber-400 mt-0.5">¥{statsA.totalCostOku.toFixed(3)} <span className="text-[8px]">億円</span></p>
                        </div>
                        <div className="bg-slate-900/60 p-2 rounded border border-white/5">
                          <p className="text-[8px] text-slate-500">B案 総工事費</p>
                          <p className="text-xs font-black text-rose-400 mt-0.5">¥{statsB.totalCostOku.toFixed(3)} <span className="text-[8px]">億円</span></p>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded border border-white/10 flex flex-col justify-center">
                          <p className="text-[8px] text-slate-400 font-extrabold">工事費差分 (B - A)</p>
                          <div className={`text-xs font-extrabold flex items-center justify-center gap-0.5 mt-0.5 ${
                            delta.costOku < 0 ? 'text-emerald-400' : delta.costOku > 0 ? 'text-rose-500' : 'text-slate-400'
                          }`}>
                            {delta.costOku < 0 ? <Minus className="w-3 h-3" /> : delta.costOku > 0 ? <Plus className="w-3 h-3" /> : null}
                            ¥{Math.abs(delta.costOku).toFixed(3)} 億円
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 工事費コスト・土工詳細対比テーブル */}
                    <div className="border border-white/5 rounded-lg overflow-hidden bg-slate-950/20">
                      <table className="w-full text-left border-collapse select-none">
                        <thead>
                          <tr className="bg-slate-950/60 text-[9px] text-slate-400 border-b border-white/5">
                            <th className="p-2 font-bold">評価指標 / 工種</th>
                            <th className="p-2 font-bold text-right">A案 (基準)</th>
                            <th className="p-2 font-bold text-right">B案 (変更)</th>
                            <th className="p-2 font-bold text-right">差分 (B - A)</th>
                          </tr>
                        </thead>
                        <tbody className="text-[9px] divide-y divide-white/5">
                          <tr>
                            <td className="p-2 text-slate-300 font-medium">道路総延長 (m)</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsA.totalLength)} m</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsB.totalLength)} m</td>
                            <td className={`p-2 text-right font-extrabold ${delta.totalLength < 0 ? 'text-emerald-400' : delta.totalLength > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {delta.totalLength > 0 ? '+' : ''}{Math.round(delta.totalLength)} m
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 text-slate-300 font-medium">総切土土工量 (m³)</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsA.vols.cutVolume).toLocaleString()} m³</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsB.vols.cutVolume).toLocaleString()} m³</td>
                            <td className={`p-2 text-right font-extrabold ${delta.cutVolume < 0 ? 'text-emerald-400' : delta.cutVolume > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {delta.cutVolume > 0 ? '+' : ''}{Math.round(delta.cutVolume).toLocaleString()} m³
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 text-slate-300 font-medium">総盛土土工量 (m³)</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsA.vols.fillVolume).toLocaleString()} m³</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsB.vols.fillVolume).toLocaleString()} m³</td>
                            <td className={`p-2 text-right font-extrabold ${delta.fillVolume < 0 ? 'text-emerald-400' : delta.fillVolume > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {delta.fillVolume > 0 ? '+' : ''}{Math.round(delta.fillVolume).toLocaleString()} m³
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 text-slate-300 font-medium">橋梁部総延長 (m)</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsA.bridgeLen)} m</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsB.bridgeLen)} m</td>
                            <td className={`p-2 text-right font-extrabold ${delta.bridgeLen < 0 ? 'text-emerald-400' : delta.bridgeLen > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {delta.bridgeLen > 0 ? '+' : ''}{Math.round(delta.bridgeLen)} m
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 text-slate-300 font-medium">高架橋部延長 (m)</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsA.viaductLen)} m</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsB.viaductLen)} m</td>
                            <td className={`p-2 text-right font-extrabold ${delta.viaductLen < 0 ? 'text-emerald-400' : delta.viaductLen > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {delta.viaductLen > 0 ? '+' : ''}{Math.round(delta.viaductLen)} m
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 text-slate-300 font-medium">トンネル部延長 (m)</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsA.tunnelLen)} m</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsB.tunnelLen)} m</td>
                            <td className={`p-2 text-right font-extrabold ${delta.tunnelLen < 0 ? 'text-emerald-400' : delta.tunnelLen > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {delta.tunnelLen > 0 ? '+' : ''}{Math.round(delta.tunnelLen)} m
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 text-slate-300 font-medium">法面保護工・擁壁面積 (m²)</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsA.slopeArea).toLocaleString()} m²</td>
                            <td className="p-2 text-right text-slate-400">{Math.round(statsB.slopeArea).toLocaleString()} m²</td>
                            <td className={`p-2 text-right font-extrabold ${delta.slopeArea < 0 ? 'text-emerald-400' : delta.slopeArea > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {delta.slopeArea > 0 ? '+' : ''}{Math.round(delta.slopeArea).toLocaleString()} m²
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* 工事費単価について */}
                    <div className="p-2 rounded-lg bg-slate-900/30 border border-white/5 flex gap-2">
                      <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      <p className="text-[8px] text-slate-500 leading-normal">
                        概算コストは道路構造令適合判定に伴う盛土、切土、舗装、トンネル、橋梁、擁壁、及びのり面面積からリアルタイム積算しています。土木CIMとしての概略意思決定用データです。
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. 平面線形 (IP) タブ */}
                {activeTab === 'horizontal' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-400" />
                        平面交点(IP)対比テーブル
                      </span>
                      <span className="text-[8px] text-slate-500">※A案・B案の各同位点のズレを計算</span>
                    </div>

                    <div className="border border-white/5 rounded-lg overflow-hidden bg-slate-950/20">
                      <table className="w-full text-left border-collapse select-none">
                        <thead>
                          <tr className="bg-slate-950/60 text-[9px] text-slate-400 border-b border-white/5">
                            <th className="p-2 font-bold">交点名</th>
                            <th className="p-2 font-bold text-center">A案 (X, Y) / 半径R</th>
                            <th className="p-2 font-bold text-center">B案 (X, Y) / 半径R</th>
                            <th className="p-2 font-bold text-right">平面位置ズレ / R差</th>
                          </tr>
                        </thead>
                        <tbody className="text-[9px] divide-y divide-white/5">
                          {ipDeltaList.map(item => (
                            <tr key={item.index}>
                              <td className="p-2 font-bold text-slate-300 flex items-center gap-1">
                                <CornerDownRight className="w-3 h-3 text-slate-600" />
                                {item.name}
                              </td>
                              <td className="p-2 text-center text-slate-400">
                                {item.a ? (
                                  <>
                                    ({Math.round(item.a.x)}, {Math.round(item.a.y)})<br/>
                                    <span className="text-amber-500 font-mono font-bold">R={item.a.r ? `${item.a.r}m` : '0m (直線)'}</span>
                                  </>
                                ) : '無し'}
                              </td>
                              <td className="p-2 text-center text-slate-400">
                                {item.b ? (
                                  <>
                                    ({Math.round(item.b.x)}, {Math.round(item.b.y)})<br/>
                                    <span className="text-rose-500 font-mono font-bold">R={item.b.r ? `${item.b.r}m` : '0m (直線)'}</span>
                                  </>
                                ) : '無し'}
                              </td>
                              <td className="p-2 text-right">
                                {item.a && item.b ? (
                                  <>
                                    <span className={`font-extrabold ${item.distShift > 0.1 ? 'text-amber-400' : 'text-slate-500'}`}>
                                      ズレ: {item.distShift.toFixed(2)} m
                                    </span>
                                    <br/>
                                    {item.rDiff !== undefined && (
                                      <span className={`font-mono font-bold ${item.rDiff === 0 ? 'text-slate-500' : item.rDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        R: {item.rDiff > 0 ? `+${item.rDiff}` : item.rDiff} m
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-amber-400 font-bold">交点数不一致</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. 縦断面・計画高タブ */}
                {activeTab === 'vertical' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                        縦断勾配・計画高(Z) ＆ 縦断曲線長(VCL) 対比テーブル
                      </span>
                    </div>

                    <div className="border border-white/5 rounded-lg overflow-hidden bg-slate-950/20">
                      <table className="w-full text-left border-collapse select-none">
                        <thead>
                          <tr className="bg-slate-950/60 text-[9px] text-slate-400 border-b border-white/5">
                            <th className="p-2 font-bold">交点名</th>
                            <th className="p-2 font-bold text-center">A案 Z値 / VCL</th>
                            <th className="p-2 font-bold text-center">B案 Z値 / VCL</th>
                            <th className="p-2 font-bold text-right">計画高差 / VCL差</th>
                          </tr>
                        </thead>
                        <tbody className="text-[9px] divide-y divide-white/5">
                          {verticalDeltaList.map(item => (
                            <tr key={item.index}>
                              <td className="p-2 font-bold text-slate-300 flex items-center gap-1">
                                <CornerDownRight className="w-3 h-3 text-slate-600" />
                                {item.name}
                              </td>
                              <td className="p-2 text-center text-slate-400">
                                {item.a ? (
                                  <>
                                    Z: {item.a.z.toFixed(2)} m<br/>
                                    <span className="text-amber-500 font-mono">VCL={item.a.vcl ? `${item.a.vcl}m` : '0m'}</span>
                                  </>
                                ) : '無し'}
                              </td>
                              <td className="p-2 text-center text-slate-400">
                                {item.b ? (
                                  <>
                                    Z: {item.b.z.toFixed(2)} m<br/>
                                    <span className="text-rose-500 font-mono">VCL={item.b.vcl ? `${item.b.vcl}m` : '0m'}</span>
                                  </>
                                ) : '無し'}
                              </td>
                              <td className="p-2 text-right">
                                {item.a && item.b ? (
                                  <>
                                    <span className={`font-extrabold ${item.zDiff !== undefined && item.zDiff === 0 ? 'text-slate-500' : (item.zDiff || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      計画高差: {item.zDiff !== undefined ? (item.zDiff > 0 ? `+${item.zDiff.toFixed(2)}` : item.zDiff.toFixed(2)) : '0.00'} m
                                    </span>
                                    <br/>
                                    {item.vclDiff !== undefined && (
                                      <span className={`font-mono font-bold ${item.vclDiff === 0 ? 'text-slate-500' : item.vclDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        VCL差: {item.vclDiff > 0 ? `+${item.vclDiff}` : item.vclDiff} m
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-amber-400 font-bold">交点数不一致</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
