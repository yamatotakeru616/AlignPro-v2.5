/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  GitCompare, 
  Cpu, 
  TrendingUp, 
  MapPin, 
  Coins, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  RefreshCw, 
  Eye, 
  Info,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  Cell,
  PieChart,
  Pie
} from 'recharts';

import { ControlPoint, AlignmentPoint, CrossSectionParams, SectionSegment, EngineeringData } from '../types';
import { calculateAlignment, calculateVolumes, optimizeLongitudinalProfile } from '../utils';
import { AddAlignmentCommand } from '../utils/command';
import { RoadNetwork, AlignmentPlan, LODLevel } from '../utils/network';
import Preview3DTab from './Preview3DTab';

interface CompareTabProps {
  roadNetwork: RoadNetwork;
  executeCommand: (command: any) => void;
  performanceMode: 'eco' | 'standard' | 'high';
}

// 単位工事費の設定 (プロ仕様の概算積算単価)
const COST_UNIT = {
  cut: 3200,          // 切土: 3,200円 / m3
  fill: 4100,         // 盛土: 4,100円 / m3
  bridge: 1600000,    // 橋梁: 1,600,000円 / m
  viaduct: 1100000,   // 高架橋: 1,100,000円 / m
  tunnel: 3800000,    // トンネル: 3,800,000円 / m
  pavement: 12000,    // 舗装: 12,000円 / m2 (層全体の積算)
  slope: 8500,        // のり面保護工・擁壁: 8,500円 / m2
};

export default function CompareTab({ roadNetwork, executeCommand, performanceMode }: CompareTabProps) {
  // 比較対象にするアライメント案の選択ステート
  const [selectedRoadIds, setSelectedRoadIds] = useState<string[]>(() => {
    // デフォルトでは存在するすべての路線を比較対象にする
    return Object.keys(roadNetwork.alignments);
  });

  // AI最適化の実行状態
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optTargetId, setOptTargetId] = useState<string>('main-road');
  const [optLogs, setOptLogs] = useState<string[]>([]);

  // 3Dプレビューに表示するフォーカス路線
  const [focusRoadId, setFocusRoadId] = useState<string>(() => {
    return roadNetwork.activeAlignmentId || Object.keys(roadNetwork.alignments)[0] || '';
  });

  // 選択路線リストの同期（路線が削除された場合などの安全対策）
  const validSelectedIds = useMemo(() => {
    return selectedRoadIds.filter(id => roadNetwork.alignments[id]);
  }, [selectedRoadIds, roadNetwork.alignments]);

  // アライメント選択のトグル
  const toggleRoadSelection = (id: string) => {
    if (validSelectedIds.includes(id)) {
      if (validSelectedIds.length > 1) {
        setSelectedRoadIds(validSelectedIds.filter(x => x !== id));
        if (focusRoadId === id) {
          const nextFocus = validSelectedIds.find(x => x !== id);
          if (nextFocus) setFocusRoadId(nextFocus);
        }
      }
    } else {
      setSelectedRoadIds([...validSelectedIds, id]);
    }
  };

  // 各路線の詳細なアライメント計算＆土量・延長・コスト算出
  const comparisonData = useMemo(() => {
    return Object.keys(roadNetwork.alignments).map(id => {
      const plan = roadNetwork.alignments[id];
      const pts = plan.points;
      const cs = plan.crossSection;
      const segs = plan.segments;

      // 60点サンプリングで高精度にアライメントを補間
      const alignPoints = calculateAlignment(pts, cs, 60);
      const vols = calculateVolumes(alignPoints, cs, segs);

      // 各構造物タイプの総延長を計算
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

      // 道路総延長
      const totalLength = alignPoints.length > 0 ? alignPoints[alignPoints.length - 1].distance : 0;
      
      // 未定義区間がある場合は土工とする
      const sumStructures = bridgeLen + viaductLen + tunnelLen;
      earthworkLen = Math.max(0, totalLength - sumStructures);

      // 舗装幅員と舗装面積の算出
      const roadWidth = cs.leftLaneWidth + cs.rightLaneWidth + cs.shoulderWidth * 2;
      const pavementArea = totalLength * roadWidth;

      // のり面面積の算出 (土工区間において高低差に応じた傾斜面積を積算)
      let sumSlopeArea = 0;
      let maxSlopeVal = 0; // 最大勾配 (%)
      let minRadius = 9999; // 最小曲線半径 (R)

      alignPoints.forEach((p, i) => {
        // 勾配チェック
        if (i < alignPoints.length - 1) {
          const p2 = alignPoints[i + 1];
          const segmentLen = p2.distance - p.distance;
          if (segmentLen > 0.1) {
            const slope = Math.abs((p2.z - p.z) / segmentLen) * 100;
            if (slope > maxSlopeVal) maxSlopeVal = slope;
          }
        }

        // 土工区間ののり面
        const isStructure = segs.some(seg => 
          p.distance >= seg.startDist && 
          p.distance <= seg.endDist && 
          seg.type !== 'earthwork'
        );

        if (!isStructure) {
          const heightDiff = Math.abs(p.z - p.groundZ);
          if (heightDiff > 0.5) {
            const slopeGrad = heightDiff > 0 ? cs.fillSlopeGradient : cs.cutSlopeGradient;
            // のり傾斜長 = h * sqrt(1 + m^2)
            const slopeLen = heightDiff * Math.sqrt(1 + slopeGrad * slopeGrad);
            // 簡易的に測点ピッチ（例: 道路延長/60）をかけて面積を算出
            const dDist = totalLength / 60;
            sumSlopeArea += slopeLen * dDist * 2; // 左右両側
          }
        }
      });

      // 平面曲線半径の最小値をIP点から取得
      pts.forEach(p => {
        if (p.r > 0 && p.r < minRadius) {
          minRadius = p.r;
        }
      });
      if (minRadius === 9999) minRadius = 0;

      // 各工種の概算費用を計算
      const costCut = vols.cutVolume * COST_UNIT.cut;
      const costFill = vols.fillVolume * COST_UNIT.fill;
      const costBridge = bridgeLen * COST_UNIT.bridge;
      const costViaduct = viaductLen * COST_UNIT.viaduct;
      const costTunnel = tunnelLen * COST_UNIT.tunnel;
      const costPavement = pavementArea * COST_UNIT.pavement;
      const costSlope = sumSlopeArea * COST_UNIT.slope;

      const totalCost = costCut + costFill + costBridge + costViaduct + costTunnel + costPavement + costSlope;

      // 道路構造令の適合度判定
      let gradeScore = 100;
      const violations: string[] = [];

      if (maxSlopeVal > 6.0) {
        gradeScore -= 15;
        violations.push(`最大勾配が 6.0% を超過 (${maxSlopeVal.toFixed(1)}%)`);
      }
      if (maxSlopeVal > 8.0) {
        gradeScore -= 20;
        violations.push(`極限勾配 8.0% を超過。道路構造令違反のおそれ`);
      }
      if (minRadius > 0 && minRadius < 150) {
        gradeScore -= 15;
        violations.push(`曲線半径が JGD2011 推奨150mを下回る (R=${minRadius}m)`);
      }
      if (minRadius > 0 && minRadius < 80) {
        gradeScore -= 25;
        violations.push(`極小曲線半径 80m を下回る。設計速度の著しい低下`);
      }
      
      const balanceRatio = vols.cutVolume > 0 && vols.fillVolume > 0 
        ? Math.min(vols.cutVolume, vols.fillVolume) / Math.max(vols.cutVolume, vols.fillVolume)
        : 0;
        
      if (balanceRatio < 0.3) {
        gradeScore -= 10;
        violations.push(`切盛バランスの不均衡 (比率 ${(balanceRatio * 100).toFixed(0)}%)`);
      }

      return {
        id,
        name: plan.name,
        vols,
        totalLength,
        bridgeLen,
        viaductLen,
        tunnelLen,
        earthworkLen,
        pavementArea,
        slopeArea: sumSlopeArea,
        maxSlope: maxSlopeVal,
        minRadius,
        costBreakdown: {
          cut: Math.round(costCut / 10000) / 100, // 億円単位
          fill: Math.round(costFill / 10000) / 100,
          bridge: Math.round(costBridge / 10000) / 100,
          viaduct: Math.round(costViaduct / 10000) / 100,
          tunnel: Math.round(costTunnel / 10000) / 100,
          pavement: Math.round(costPavement / 10000) / 100,
          slope: Math.round(costSlope / 10000) / 100,
        },
        totalCostOverage: totalCost,
        totalCostYen: Math.round(totalCost / 10000), // 万単位
        totalCostOverageOku: totalCost / 100000000, // 億円単位
        gradeScore: Math.max(10, gradeScore),
        violations,
        plan
      };
    });
  }, [roadNetwork.alignments]);

  // 選択されているアライメントのみフィルタリング
  const activeComparisonData = useMemo(() => {
    return comparisonData.filter(d => validSelectedIds.includes(d.id));
  }, [comparisonData, validSelectedIds]);

  // Recharts 用の工事費比較データソースの変換
  const costChartData = useMemo(() => {
    return activeComparisonData.map(d => ({
      name: d.name,
      '切土工': d.costBreakdown.cut,
      '盛土工': d.costBreakdown.fill,
      '橋梁工': d.costBreakdown.bridge,
      '高架工': d.costBreakdown.viaduct,
      'トンネル工': d.costBreakdown.tunnel,
      '舗装工': d.costBreakdown.pavement,
      'のり面工': d.costBreakdown.slope,
      '総工事費': d.totalCostOverageOku
    }));
  }, [activeComparisonData]);

  // Recharts 用の土量バランス比較データソースの変換
  const volumeChartData = useMemo(() => {
    return activeComparisonData.map(d => ({
      name: d.name,
      '切土量 (m³)': d.vols.cutVolume,
      '盛土量 (m³)': -d.vols.fillVolume, // 盛土は下に伸ばす
      '差引土量 (m³)': d.vols.netVolume
    }));
  }, [activeComparisonData]);

  // AI 勾配最適化による新線形案（AI提案プラン）の自動追加
  const handleRunAiOptimization = () => {
    const targetPlan = roadNetwork.alignments[optTargetId];
    if (!targetPlan) return;

    setIsOptimizing(true);
    setOptLogs(['CIM AI Optimizing Engine Booted...', 'Analyzing longitudinal elevations and ground levels...']);

    // ユーザーに超高速であることを感じさせる適度なディレイ演出 (700ms)
    setTimeout(() => {
      try {
        const result = optimizeLongitudinalProfile(
          targetPlan.points,
          targetPlan.crossSection,
          targetPlan.segments
        );

        const newId = `ai-opt-${Date.now().toString(36).substring(2, 6)}`;
        
        // 土量削減率の計算
        const oldTotal = result.initialVolume.cut + result.initialVolume.fill;
        const newTotal = result.optimizedVolume.cut + result.optimizedVolume.fill;
        const savingsPct = oldTotal > 0 ? ((oldTotal - newTotal) / oldTotal * 100) : 0;

        // ログの保存
        setOptLogs([
          ...result.log,
          `✨ Optimization complete! Total Earthwork reduced by ${savingsPct.toFixed(1)}%!`,
          `Saved Option created with ID: [${newId}]`
        ]);

        const newPlan: AlignmentPlan = {
          ...targetPlan,
          id: newId,
          name: `AI最適化案 (${targetPlan.name.split(' (')[0]})`,
          points: result.optimizedPoints,
          visible: true,
          lodLevel: LODLevel.HIGH,
          heightOffset: targetPlan.heightOffset // 高さを維持
        };

        // コマンド実行してアライメントを追加
        executeCommand(new AddAlignmentCommand(
          `AIによる勾配最適化案「${newPlan.name}」の自動生成と追加`,
          newPlan
        ));

        // 比較対象リストに新路線を自動的に追加
        setSelectedRoadIds(prev => [...prev, newId]);
        setFocusRoadId(newId);

      } catch (err) {
        console.error("AI最適化比較プラン生成エラー:", err);
        setOptLogs(prev => [...prev, '❌ Optimization failed due to calculations constraint.']);
      } finally {
        setIsOptimizing(false);
      }
    }, 800);
  };

  // フォーカス路線のアライメントポイント
  const focusAlignmentPoints = useMemo(() => {
    const p = roadNetwork.alignments[focusRoadId];
    if (!p) return [];
    return calculateAlignment(p.points, p.crossSection, 60);
  }, [roadNetwork.alignments, focusRoadId]);

  // フォーカス路線の断面パラメータ
  const focusCrossSection = useMemo(() => {
    return roadNetwork.alignments[focusRoadId]?.crossSection || null;
  }, [roadNetwork.alignments, focusRoadId]);

  return (
    <div className="flex flex-col xl:flex-row h-full w-full bg-[#030305] text-slate-200 overflow-hidden" id="compare-tab-root">
      
      {/* 左サイドバー: 路線管理・AI駆動最適化トリガー */}
      <div className="w-full xl:w-96 shrink-0 border-b xl:border-b-0 xl:border-r border-white/10 bg-slate-950/60 backdrop-blur-md p-5 flex flex-col gap-5 overflow-y-auto max-h-[40vh] xl:max-h-full">
        
        {/* タイトル */}
        <div className="flex items-center gap-2 border-b border-white/5 pb-3">
          <GitCompare className="w-5 h-5 text-blue-400 animate-pulse" />
          <div>
            <h2 className="text-sm font-bold text-slate-100">マルチアライメント並列比較</h2>
            <p className="text-[10px] text-slate-500">同一区間で最大3つの線形案を一括シミュレーション</p>
          </div>
        </div>

        {/* 1. アライメント選択リスト */}
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold text-slate-400 tracking-wide flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            比較対象アライメントの選択 ({validSelectedIds.length})
          </h3>
          <div className="flex flex-col gap-2">
            {comparisonData.map((d) => {
              const isSelected = validSelectedIds.includes(d.id);
              const isFocus = focusRoadId === d.id;
              
              return (
                <div 
                  key={d.id}
                  className={`p-3 rounded-lg border transition-all ${
                    isFocus 
                      ? 'bg-blue-950/20 border-blue-500/40' 
                      : 'bg-slate-900/30 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none grow">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRoadSelection(d.id)}
                        className="w-3.5 h-3.5 rounded border-white/10 text-blue-600 focus:ring-blue-500/30 bg-slate-950"
                      />
                      <span className="text-xs font-bold text-slate-200 truncate max-w-[180px]" title={d.name}>
                        {d.name}
                      </span>
                    </label>

                    {/* 3Dフォーカス切替ボタン */}
                    <button
                      onClick={() => setFocusRoadId(d.id)}
                      className={`px-2 py-1 rounded text-[9px] font-bold tracking-wider flex items-center gap-1 transition-all ${
                        isFocus
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400'
                      }`}
                      title="この路線をアクティブ表示して3D、詳細をプレビュー"
                    >
                      <Eye className="w-2.5 h-2.5" />
                      {isFocus ? 'ACTIVE' : 'FOCUS'}
                    </button>
                  </div>

                  {/* 簡易サマリー表示 */}
                  <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-mono">L={Math.round(d.totalLength)}m</span>
                    <span className="font-bold text-emerald-400">¥{d.totalCostOverageOku.toFixed(2)} 億円</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. AI 勾配最適化アライメントの自動追加パネル */}
        <div className="p-4 rounded-xl border border-blue-500/10 bg-gradient-to-br from-blue-950/10 to-indigo-950/10 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-bold text-slate-200">AI駆動型・土量一括最適化案の作成</h4>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            選択した路線の現在の縦断計画高（Z値）を元に、切盛土量を極限まで自動削減する「山登り最適化アライメント」をその場で自動生成し、比較対象に加えます。
          </p>

          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[10px] text-slate-500">最適化のベース路線を選択</label>
            <select
              value={optTargetId}
              onChange={(e) => setOptTargetId(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
            >
              {comparisonData.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRunAiOptimization}
            disabled={isOptimizing}
            className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50"
          >
            {isOptimizing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>AIによる勾配演算中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-blue-200 animate-bounce" />
                <span>AI最適化アライメントを作成</span>
              </>
            )}
          </button>

          {/* ログ出力 */}
          {optLogs.length > 0 && (
            <div className="mt-2 bg-slate-950/90 border border-white/5 rounded-lg p-2 font-mono text-[9px] text-blue-400 max-h-24 overflow-y-auto leading-relaxed scrollbar-thin">
              {optLogs.map((log, idx) => (
                <div key={idx} className={log.startsWith('✨') ? 'text-emerald-400 font-bold' : ''}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* コスト積算単価の表記 */}
        <div className="mt-auto border-t border-white/5 pt-3 flex flex-col gap-1 text-[10px] text-slate-500">
          <div className="flex items-center gap-1 font-semibold text-slate-400 mb-1">
            <Info className="w-3 h-3 text-slate-400" />
            <span>概算コスト計算単価 (プロ仕様CIMモデル)</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 font-mono">
            <span>切土工: ¥3,200/m³</span>
            <span>盛土工: ¥4,100/m³</span>
            <span>橋梁工: ¥1.6M/m</span>
            <span>高架工: ¥1.1M/m</span>
            <span>トンネル: ¥3.8M/m</span>
            <span>舗装工: ¥12,000/m²</span>
          </div>
        </div>

      </div>

      {/* 右メインエリア: 3Dビュー（上） & 比較ボード（下）のCIM統合マルチレイアウト */}
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        
        {/* 上半分: 3D重ね合わせシミュレーター */}
        <div className="h-[40vh] md:h-[45vh] relative shrink-0 border-b border-white/10 bg-slate-950">
          <div className="absolute top-3 left-3 z-10 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 shadow-lg flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-slate-200">
              重ね合わせ 3D ビュー: <span className="text-blue-400 font-extrabold font-mono">「{roadNetwork.alignments[focusRoadId]?.name || '未選択'}」</span> を主軸表示中
            </span>
          </div>

          <div className="absolute top-3 right-3 z-10 bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-md border border-white/5 text-[10px] text-slate-400">
            ※ 選択されたすべての案が3D空間上に同時描画され、形状のズレを視覚的に比較できます
          </div>

          {focusAlignmentPoints.length > 0 && focusCrossSection && (
            <Preview3DTab
              alignment={focusAlignmentPoints}
              crossSection={focusCrossSection}
              isActive={true}
              stations={[]} // 簡易的に空にする
              selectedStationDist={0}
              setSelectedStationDist={() => {}}
              setLayoutMode={() => {}}
              contourInterval={10}
              setContourInterval={() => {}}
              performanceMode={performanceMode}
              roadNetwork={{
                ...roadNetwork,
                alignments: Object.keys(roadNetwork.alignments).reduce((acc, id) => {
                  acc[id] = {
                    ...roadNetwork.alignments[id],
                    // 選択されたアライメントのみを 3D 描画する
                    visible: validSelectedIds.includes(id),
                    // 重ね合わせ時、重くなりすぎないようLODレベルを調整
                    lodLevel: id === focusRoadId ? LODLevel.HIGH : LODLevel.MEDIUM
                  };
                  return acc;
                }, {} as Record<string, AlignmentPlan>),
                activeAlignmentId: focusRoadId
              }}
            />
          )}
        </div>

        {/* 下半分: グラフ・Bento Grid並列詳細比較パネル */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-slate-950/40 flex flex-col gap-6">
          
          {/* A. グラフエリア（横並び） */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* 1. 工事費見積比較グラフ */}
            <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  概算工事費のブレイクダウン比較 (単位: 億円)
                </h3>
              </div>
              <div className="h-64 w-full text-xs font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costChartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tickFormatter={(v) => v.split(' (')[0]} />
                    <YAxis stroke="rgba(255,255,255,0.4)" label={{ value: '億円', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 10 }} />
                    <Bar dataKey="切土工" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="盛土工" stackId="a" fill="#10b981" />
                    <Bar dataKey="橋梁工" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="高架工" stackId="a" fill="#ec4899" />
                    <Bar dataKey="トンネル工" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="舗装工" stackId="a" fill="#64748b" />
                    <Bar dataKey="のり面工" stackId="a" fill="#14b8a6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. 土量バランス比較グラフ */}
            <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                切土量・盛土量 ＆ 土量収支バランス (m³)
              </h3>
              <div className="h-64 w-full text-xs font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeChartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tickFormatter={(v) => v.split(' (')[0]} />
                    <YAxis stroke="rgba(255,255,255,0.4)" label={{ value: 'm³', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 10 }} />
                    <Bar dataKey="切土量 (m³)" fill="#3b82f6" />
                    <Bar dataKey="盛土量 (m³)" fill="#10b981" />
                    <Bar dataKey="差引土量 (m³)" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* B. Bento Grid 比較カード */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wide flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              アライメント設計案ごとの比較詳細カード (並列Bento Grid)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {activeComparisonData.map((d) => {
                const isFocus = focusRoadId === d.id;
                
                return (
                  <div 
                    key={d.id}
                    className={`bg-slate-900/40 rounded-xl border p-5 flex flex-col gap-4.5 transition-all relative overflow-hidden ${
                      isFocus 
                        ? 'border-blue-500/50 bg-gradient-to-b from-blue-950/5 to-slate-900/40 shadow-lg shadow-blue-500/5' 
                        : 'border-white/5'
                    }`}
                  >
                    {isFocus && (
                      <div className="absolute top-0 right-0 bg-blue-600 text-white font-extrabold text-[8px] tracking-widest px-3 py-1 rounded-bl-lg shadow-md uppercase">
                        Active Plan
                      </div>
                    )}

                    {/* アライメント名 */}
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-100 line-clamp-1">{d.name}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5">延長: {Math.round(d.totalLength).toLocaleString()} m</span>
                    </div>

                    {/* 工事費サマリー */}
                    <div className="bg-slate-950/80 border border-white/5 rounded-lg p-3.5 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">概算工事コスト</span>
                        <span className="text-lg font-black text-amber-400 mt-1 font-mono">
                          ¥{d.totalCostOverageOku.toFixed(2)}<span className="text-xs font-bold ml-1 text-amber-500">億円</span>
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] text-slate-500">平米単価換算</span>
                        <span className="text-xs font-bold text-slate-300 mt-1 font-mono">
                          ¥{Math.round(d.totalCostOverage / d.pavementArea).toLocaleString()}/m²
                        </span>
                      </div>
                    </div>

                    {/* 道路構造令の適合度チェック */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-400">道路構造令適合スコア</span>
                        <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                          d.gradeScore >= 90 ? 'text-emerald-400 bg-emerald-500/10' :
                          d.gradeScore >= 70 ? 'text-amber-400 bg-amber-500/10' :
                          'text-red-400 bg-red-500/10'
                        }`}>
                          {d.gradeScore} / 100
                        </span>
                      </div>
                      
                      {d.violations.length === 0 ? (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/90 font-medium">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>道路構造令の設計適合検証をクリア</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {d.violations.map((v, vIdx) => (
                            <div key={vIdx} className="flex items-start gap-1.5 text-[10px] text-amber-400/90 font-medium leading-normal">
                              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                              <span>{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 構造物内訳 */}
                    <div className="border-t border-white/5 pt-3 flex flex-col gap-2">
                      <span className="text-[10px] font-semibold text-slate-500">工種延長内訳</span>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-mono">
                        <div className="flex justify-between border-b border-white/5 pb-1 text-slate-400">
                          <span>土工区間:</span>
                          <span className="text-slate-200 font-bold">{Math.round(d.earthworkLen)}m</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1 text-slate-400">
                          <span>橋梁区間:</span>
                          <span className="text-slate-200 font-bold">{Math.round(d.bridgeLen)}m</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1 text-slate-400">
                          <span>高架区間:</span>
                          <span className="text-slate-200 font-bold">{Math.round(d.viaductLen)}m</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1 text-slate-400">
                          <span>トンネル:</span>
                          <span className="text-slate-200 font-bold">{Math.round(d.tunnelLen)}m</span>
                        </div>
                      </div>
                    </div>

                    {/* 幾何パラメータ */}
                    <div className="border-t border-white/5 pt-3 flex flex-col gap-2">
                      <span className="text-[10px] font-semibold text-slate-500">最大縦断勾配 ＆ 最小平面曲線半径</span>
                      <div className="flex items-center gap-4 text-[10px] font-mono">
                        <div className="flex-1 bg-slate-950/60 p-2 rounded border border-white/5 flex flex-col">
                          <span className="text-slate-500 text-[8px] uppercase tracking-wider">最大縦断勾配</span>
                          <span className="text-xs font-bold text-slate-300 mt-0.5">{d.maxSlope.toFixed(2)}%</span>
                        </div>
                        <div className="flex-1 bg-slate-950/60 p-2 rounded border border-white/5 flex flex-col">
                          <span className="text-slate-500 text-[8px] uppercase tracking-wider">最小曲線半径</span>
                          <span className="text-xs font-bold text-slate-300 mt-0.5">
                            {d.minRadius > 0 ? `R = ${d.minRadius} m` : '直線のみ'}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
