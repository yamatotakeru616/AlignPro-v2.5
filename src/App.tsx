/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Map as MapIcon, 
  Layers, 
  Rotate3d, 
  FileCode, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Copy, 
  Check, 
  Cpu, 
  Sliders, 
  Volume2, 
  Info,
  LayoutGrid,
  TrendingUp,
  Columns,
  Maximize2,
  Minimize2,
  Compass,
  Undo2,
  Redo2,
  Plus,
  Trash,
  Settings as SettingsIcon,
  Activity,
  Eye,
  EyeOff,
  GitCompare,
  History,
  FileText,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

import { ControlPoint, CrossSectionParams, StationPoint } from './types';
import { calculateAlignment, calculateVolumes, xyToLngLat, generateStations, COORDINATE_ZONES, setGlobalCoordinateSystem, getGlobalBaseCoords } from './utils';
import { 
  useRoadCommands, 
  UpdateControlPointsCommand, 
  UpdateCrossSectionCommand, 
  UpdateSegmentsCommand, 
  UpdateCoordinateZoneCommand, 
  AddAlignmentCommand, 
  DeleteAlignmentCommand, 
  SwitchActiveAlignmentCommand, 
  UpdateRoadMetadataCommand,
  ReplaceAllStateCommand
} from './utils/command';
import { RoadNetwork, AlignmentPlan, LODLevel, detectRoadIntersections } from './utils/network';

import MapTab from './components/MapTab';
import DrawingsTab from './components/DrawingsTab';
import Preview3DTab from './components/Preview3DTab';
import ExportTab from './components/ExportTab';
import SpecsDialog from './components/SpecsDialog';
import WorkspaceCloudManager from './components/WorkspaceCloudManager';
import MarkdownDocViewer from './components/MarkdownDocViewer';
import HistoryDrawer from './components/HistoryDrawer';
import { ClothoidTab } from './components/ClothoidTab';
import CompareTab from './components/CompareTab';

// 複数路線（道路ネットワーク）の初期設定
const initialNetwork: RoadNetwork = {
  alignments: {
    'main-road': {
      id: 'main-road',
      name: '主要地方道 1号線 (本線)',
      points: [
        { id: 'BP', name: '始点 (BP)', lng: 130.997143, lat: 32.999, x: -266, y: -111, z: 32.5, r: 0 },
        { id: 'IP', name: '交点 (IP)', lng: 131.0, lat: 33.001, x: 0, y: 111, z: 45.0, r: 120 },
        { id: 'EP', name: '終点 (EP)', lng: 131.002857, lat: 33.0, x: 266, y: 0, z: 38.0, r: 0 },
      ],
      crossSection: {
        leftLaneWidth: 3.25,
        rightLaneWidth: 3.25,
        shoulderWidth: 1.00,
        slopeGradient: 1.5,
        pavementThickness: 0.15,
        pavementMaterial: 'アスファルト混合物 (As)',
        baseThickness: 0.30,
        baseMaterial: '粒度調整砕石 (M-40)',
        subgradeThickness: 1.00,
        subgradeMaterial: '改良土・路床土',
        cutSlopeGradient: 1.0,
        fillSlopeGradient: 1.5,
        enableMultiStageSlope: true,
        bermInterval: 5.0,
        bermWidth: 1.0,
        enableBermDitch: true,
        inletSpacing: 25.0,
        inletType: 'standard',
        inletCapacityStandard: 3.0,
        inletCapacityLarge: 5.0,
        inletCapacityGrated: 7.0,
        inletCapacityHighCapacity: 10.0,
        rainfallIntensity: 50.0,
        speedKmH: 60.0,
        trafficVolumePerHour: 500,
        yearsElapsed: 0,
        pileDiameter: 1.2,
        pileLength: 15.0,
        pileCountPerPier: 4,
        showTripleView: false,
        smoothCamera: true,
        enablePrismoidal: true,
        enableSlopeFitting: true,
      },
      segments: [
        { id: 'seg-m1', startDist: 0.0, endDist: 150.0, type: 'earthwork', properties: { leftLaneWidth: 3.25, rightLaneWidth: 3.25, shoulderWidth: 1.00 } },
        { id: 'seg-m2', startDist: 150.0, endDist: 280.0, type: 'bridge', properties: { leftLaneWidth: 3.25, rightLaneWidth: 3.25, shoulderWidth: 0.75, girderDepth: 1.8, pierHeight: 12.0 } },
        { id: 'seg-m3', startDist: 280.0, endDist: 400.0, type: 'viaduct', properties: { leftLaneWidth: 3.25, rightLaneWidth: 3.25, shoulderWidth: 0.75, girderDepth: 1.5, pierHeight: 10.0 } },
        { id: 'seg-m4', startDist: 400.0, endDist: 600.0, type: 'earthwork', properties: { leftLaneWidth: 3.25, rightLaneWidth: 3.50, shoulderWidth: 1.00 } }
      ],
      coordinateZone: 2,
      heightOffset: 0.0,
      visible: true,
      lodLevel: LODLevel.HIGH,
    },
    'sub-bypass': {
      id: 'sub-bypass',
      name: 'バイパス高架 2号線 (立体交差)',
      points: [
        { id: 'BP', name: '始点 (BP)', lng: 130.998389, lat: 32.998198, x: -150, y: -200, z: 35.0, r: 0 },
        { id: 'IP', name: '交点 (IP)', lng: 131.0, lat: 33.0, x: 0, y: 0, z: 42.0, r: 80 },
        { id: 'EP', name: '終点 (EP)', lng: 131.001611, lat: 33.001802, x: 150, y: 200, z: 38.0, r: 0 },
      ],
      crossSection: {
        leftLaneWidth: 3.00,
        rightLaneWidth: 3.00,
        shoulderWidth: 0.75,
        slopeGradient: 1.5,
        pavementThickness: 0.15,
        pavementMaterial: 'アスファルト混合物 (As)',
        baseThickness: 0.30,
        baseMaterial: '粒度調整砕石 (M-40)',
        subgradeThickness: 1.00,
        subgradeMaterial: '改良土・路床土',
        cutSlopeGradient: 1.0,
        fillSlopeGradient: 1.5,
        enableMultiStageSlope: true,
        bermInterval: 5.0,
        bermWidth: 1.0,
        enableBermDitch: true,
        inletSpacing: 25.0,
        inletType: 'standard',
        inletCapacityStandard: 3.0,
        inletCapacityLarge: 5.0,
        inletCapacityGrated: 7.0,
        inletCapacityHighCapacity: 10.0,
        rainfallIntensity: 50.0,
        speedKmH: 60.0,
        trafficVolumePerHour: 500,
        yearsElapsed: 0,
        pileDiameter: 1.2,
        pileLength: 15.0,
        pileCountPerPier: 4,
        showTripleView: false,
        smoothCamera: true,
        enablePrismoidal: true,
        enableSlopeFitting: true,
      },
      segments: [
        { id: 'seg-s1', startDist: 0.0, endDist: 100.0, type: 'earthwork', properties: { leftLaneWidth: 3.00, rightLaneWidth: 3.00, shoulderWidth: 0.75 } },
        { id: 'seg-s2', startDist: 100.0, endDist: 350.0, type: 'bridge', properties: { leftLaneWidth: 3.00, rightLaneWidth: 3.00, shoulderWidth: 0.75, girderDepth: 1.6, pierHeight: 14.0 } },
        { id: 'seg-s3', startDist: 350.0, endDist: 500.0, type: 'earthwork', properties: { leftLaneWidth: 3.00, rightLaneWidth: 3.00, shoulderWidth: 0.75 } }
      ],
      coordinateZone: 2,
      heightOffset: 12.0, // 高�export default function App() {
  // 1. useRoadCommandsカスタムフックによる一元的な道路ネットワーク状態管理（Undo/Redo＆複数路線対応）
  const {
    state: appState,
    executeCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    history: commandHistory,
    setStateDirectly,
    initialState
  } = useRoadCommands({ network: initialNetwork });

  const activeId = appState.network.activeAlignmentId;
  const activePlan = appState.network.alignments[activeId] || appState.network.alignments['main-road'];
  
  // 各タブコンポーネントが依存している変数群をアクティブ路線から抽出
  const points = activePlan.points;
  const crossSection = activePlan.crossSection;
  const sections = activePlan.segments;
  const coordinateZone = activePlan.coordinateZone;

  // 座標系(JGD2011)が変更された時に、経緯度を自動再計算して同期する useEffect
  useEffect(() => {
    const baseCoords = getGlobalBaseCoords();
    const updatedPoints = points.map(p => {
      const newLngLat = xyToLngLat(p.x, p.y, baseCoords.baseLng, baseCoords.baseLat);
      return {
        ...p,
        lng: newLngLat.lng,
        lat: newLngLat.lat
      };
    });

    const hasChanged = updatedPoints.some((up, idx) => {
      const op = points[idx];
      return !op || Math.abs(up.lng - op.lng) > 1e-6 || Math.abs(up.lat - op.lat) > 1e-6;
    });

    if (hasChanged) {
      setStateDirectly(prev => {
        const activeRoadId = prev.network.activeAlignmentId;
        const currentRoad = prev.network.alignments[activeRoadId];
        if (!currentRoad) return prev;
        
        return {
          ...prev,
          network: {
            ...prev.network,
            alignments: {
              ...prev.network.alignments,
              [activeRoadId]: {
                ...currentRoad,
                points: updatedPoints
              }
            }
          }
        };
      });
    }
  }, [coordinateZone, points, setStateDirectly]);

  // UI 制御用の状態 (一括、平面、縦断、横断、立体、成果物、クロソイド幾何、比較)
  const [layoutMode, setLayoutMode] = useState<'triple' | 'map' | 'profile' | 'cross' | '3d' | 'export' | 'clothoid' | 'compare'>('triple');
  const [showMarkdownViewer, setShowMarkdownViewer] = useState(false);

  // CIM道路設計シーケンシャル・ステップ定義
  const STEPS = useMemo(() => [
    { id: 'map', num: 1, label: '平面アライメント', desc: '基準座標・IP配置設計', icon: MapIcon, tip: '【STEP 1: 平面アライメント】道路の中心線（IP点：交点）を平面上に配置し、大まかなルート設計を策定します。' },
    { id: 'clothoid', num: 2, label: 'クロソイド幾何', desc: '幾何・走行安全性', icon: Compass, tip: '【STEP 2: クロソイド幾何】IP点の接続部に、自動車が安全に曲がれるように緩和曲線（クロソイド曲線）を挿入・設計します。' },
    { id: 'profile', num: 3, label: '縦断勾配計画', desc: 'VPI配置・VCL放物線', icon: TrendingUp, tip: '【STEP 3: 縦断勾配計画】道路の起伏（縦断勾配・VPI点）や、サグ（凹部）の縦断緩和曲線（VCL放物線）を調整し、高低差計画を策定します。' },
    { id: 'cross', num: 4, label: '横断舗装・のり面', desc: '構成層・安定のり面幅', icon: Columns, tip: '【STEP 4: 横断舗装・のり面】車線・路肩の構成層や舗装厚、切土・盛土の安定のり面勾配や小段構造を定義します。' },
    { id: 'compare', num: 5, label: '多案並列比較', desc: '計画線形・コスト比較', icon: GitCompare, tip: '【STEP 5: 多案並列比較】作成した異なる計画路線（アライメント）の間で、土工量（切土・盛土）、構造物延長、コストを並列して比較評価します。' },
    { id: '3d', num: 6, label: '3D環境・排水シミュレーション', desc: '雨水・騒音・基礎耐力', icon: Rotate3d, tip: '【STEP 6: 3D環境・排水シミュレーション】雨水の吸い込み挙動、遮音壁による騒音低減、橋脚 of 杭基礎などを3Dシミュレーションします。' },
    { id: 'export', num: 7, label: '成果物エクスポート', desc: 'CAD諸元・BIM出力', icon: FileCode, tip: '【STEP 7: 成果物エクスポート】設計成果物として、中心線三次元座標テキスト、BIM/CIM標準形式(CIM XML)などを書き出します。' }
  ], []);

  // 現在選択されているステップのインデックスを取得（もし 'triple' の場合は前回のステップ、または0）
  const getCurrentStepIndex = () => {
    const idx = STEPS.findIndex(s => s.id === layoutMode);
    return idx === -1 ? 0 : idx;
  };

  // ステップ間のナビゲーション
  const handleStepNavigate = (direction: number) => {
    const currentIndex = getCurrentStepIndex();
    const nextIndex = Math.max(0, Math.min(6, currentIndex + direction));
    setLayoutMode(STEPS[nextIndex].id as any);
  };

  // 3. 単一状態からアライメント計算群を動的構築 (Single Source of Truth)的構築 (Single Source of Truth)ayoutMode);
    return idx === -1 ? 0 : idx;
  };

  // ステップ間のナビゲーション
  const handleStepNavigate = (direction: number) => {
    const currentIndex = getCurrentStepIndex();
    const nextIndex = Math.max(0, Math.min(6, currentIndex + direction));
    setLayoutMode(STEPS[nextIndex].id as any);
  };

  // 3. 単一状態からアライメント計算群を動的構築 (Single Source of Truth)0 : idx;
  };

  // ステップ間のナビゲーション
  const handleStepNavigate = (direction: number) => {
    const currentIndex = getCurrentStepIndex();
    const nextIndex = Math.max(0, Math.min(6, currentIndex + direction));
    setLayoutMode(STEPS[nextIndex].id as any);
  };

  // 3. 単一状態からアライメント計算群を動的構築 (Single Source of Truth)す。' },
    { id: 'profile', num: 3, label: '縦断勾配計画', desc: 'VPI配置・VCL放物線', icon: TrendingUp, tip: '【STEP 3: 縦断勾配計画】道路の起伏（縦断勾配・VPI点）や、サグ（凹部）の縦断緩和曲線（VCL放物線）を調整し、スムーズな高低差計画を策定します。' },
    { id: 'cross', num: 4, label: '横断舗装・のり面', desc: '構成層・安定のり面幅', icon: Columns, tip: '【STEP 4: 横断舗装・のり面】車線・路肩の構成層やアスファルト・路床等の舗装多層厚、切土・盛土の安定のり面勾配（1:S）や小段構造を定義します。' },
    { id: 'compare', num: 5, label: '多案並列比較', desc: '計画線形・コスト比較', icon: GitCompare, tip: '【STEP 5: 多案並列比較】作成した異なる計画路線（アライメント）の間で、土工量（切土・盛土）、構造物延長、および概算工事コストを瞬時に並列して比較評価します。' },
    { id: '3d', num: 6, label: '3D環境・排水シミュレーション', desc: '雨水・騒音・基礎耐力', icon: Rotate3d, tip: '【STEP 6: 3D環境・排水シミュレーション】雨水の吸い込み挙動や冠水リスク、遮音壁による道路交通騒音の低減、橋脚の杭基礎の支持力などを3D空間上でシミュレーションします。' },
    { id: 'export', num: 7, label: '成果物エクスポート', desc: 'CAD諸元・BIM出力', icon: FileCode, tip: '【STEP 7: 成果物エクスポート】設計成果物として、中心線三次元座標テキスト、BIM/CIM標準形式(CIM XML)ファ�  // 3. 単一状態からアライメント計算群を動的構築 (Single Source of Truth)
  const alignment = useMemo(() => {
    return calculateAlignment(points, crossSection, 60);
  }, [points, crossSection]);

  const engineeringData = useMemo(() => {
    return calculateVolumes(alignment, crossSection, sections);
  }, [alignment, crossSection, sections]);

  // アライメントから測点一覧を生成
  const stations = useMemo(() => {
    return generateStations(alignment, stationInterval);
  }, [alignment, stationInterval]);

  // アライメント形状変更時に、選択されている測点距離を最も近い新しい測点の距離に自動追従・補正する
  useEffect(() => {
    if (stations.length === 0) return;

    // 現在の選択距離に最も近い新しい測点を探す
    let closestStation = stations[0];
    let minDiff = Infinity;

    stations.forEach(s => {
      const diff = Math.abs(s.distance - selectedStationDist);
      if (diff < minDiff) {
        minDiff = diff;
        closestStation = s;
      }
    });

    if (closestStation && Math.abs(closestStation.distance - selectedStationDist) > 0.01) {
      setSelectedStationDist(closestStation.distance);
    }
  }, [stations, selectedStationDist]);

  // クイックコピー機能
  const handleQuickCopy = async () => {
    const configData = {
      points,
      crossSection,
      engineeringData,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(configData, null, 2));
      setCopiedParams(true);
      setTimeout(() => setCopiedParams(false), 2000);
    } catch (err) {
      console.error("Failed to copy params: ", err);
    }
  };

  const handlePointsChange = (newPoints: ControlPoint[]) => {
    executeCommand(new UpdateControlPointsCommand(
      '平面制御点の変更',
      points,
      newPoints
    ));
  };

  const handleCrossSectionChange = (newParams: CrossSectionParams) => {
    executeCommand(new UpdateCrossSectionCommand(
      '道路断面パラメータの変更',
      crossSection,
      newParams
    ));
  };

  const handleSectionsChange = (newSections: any[]) => {
    executeCommand(new UpdateSegmentsCommand(
      '道路断面区間セグメントの更新',
      sections,
      newSections
    ));
  };

  const currentStation = alignment[Math.round(alignment.length / 2)] || points[1];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#050508] text-slate-200 overflow-hidden font-sans">
      
      {/* 1. アプリヘッダー (Header Navigation) */}
      <header className="h-16 shrink-0 flex items-center justify-between px-6 bg-slate-950/80 border-b border-white/10 backdrop-blur-md z-30 shadow-lg">
        
        {/* ロゴ・バージョン */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="font-extrabold text-white text-sm tracking-tight">CIM</span>
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold tracking-tight text-white flex items-center gap-1.5 font-display">
              AlignPro CIM <span className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono">v2.5</span>
            </h1>
            <p className="text-[10px] text-slate-500 hidden md:block">3D道路アライメント設計シミュレーション・プロトタイプ</p>
          </div>
        </div>

        {/* ワークフローモード表示 */}
        <div className="hidden lg:flex items-center gap-2 bg-blue-950/20 border border-blue-500/15 rounded-full px-4 py-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
          <span className="text-[10px] font-extrabold text-blue-300 tracking-widest uppercase font-mono">BIM/CIM Progressive Workflow Mode</span>
        </div>

        {/* 設計書閲覧 / パラメータコピー / クラウド / MD一覧 ツール */}
        <div className="flex items-center gap-2">
          
          {/* Undo / Redo 履歴管理グループ */}
          <div className="flex items-center gap-0.5 bg-slate-950 border border-white/10 p-1 rounded-lg">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 transition-all border rounded ${
                canUndo
                  ? 'bg-slate-900/90 border-white/10 hover:bg-slate-800 text-slate-200 cursor-pointer hover:border-blue-500/30'
                  : 'bg-transparent border-transparent text-slate-600 cursor-not-allowed'
              }`}
              title="元に戻す (Undo)"
            >
              <Undo2 className="w-3 h-3 text-blue-500" />
              <span className="hidden lg:inline">元に戻す</span>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 transition-all border rounded ${
                canRedo
                  ? 'bg-slate-900/90 border-white/10 hover:bg-slate-800 text-slate-200 cursor-pointer hover:border-indigo-500/30'
                  : 'bg-transparent border-transparent text-slate-600 cursor-not-allowed'
              }`}
              title="やり直す (Redo)"
            >
              <Redo2 className="w-3 h-3 text-indigo-500" />
              <span className="hidden lg:inline">やり直す</span>
            </button>
          </div>

          {/* 履歴・差分ドロワー起動ボタン */}
          <button
            onClick={() => setShowHistoryDrawer(true)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-blue-500/30 text-[11px] font-bold text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="操作履歴を時系列ツリーで表示し、2案間の線形・コスト差分を検証します"
          >
            <History className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span className="hidden sm:inline font-bold">履歴・差分</span>
            {commandHistory.undo.length > 0 && (
              <span className="bg-blue-500/20 text-blue-400 text-[9px] px-1.5 py-0.5 rounded-full font-mono border border-blue-500/30">
                {commandHistory.undo.length}
              </span>
            )}
          </button>

          {/* 詳細設計書表示ボタン */}
          <button
            onClick={() => setShowSpecs(true)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-blue-500/30 text-[11px] font-bold text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="国交省準拠の道路設計詳細スペックを閲覧します"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline font-bold">詳細設計書</span>
          </button>

          {/* 統合パフォーマンス一括制御トグル */}
          <div className="flex items-center gap-1 bg-slate-950 border border-white/10 p-1 rounded-lg">
            <span className="text-[9px] font-bold text-slate-500 uppercase px-1.5 flex items-center gap-1 select-none">
              <Cpu className="w-3 h-3 text-slate-400" />
              <span className="hidden lg:inline">Performance</span>
            </span>
            <div className="flex items-center gap-0.5">
              {[
                { id: 'eco', label: '超軽量', tooltip: 'VRAMエコモード (影OFF、アンチエイリアスOFF、超軽量描画)', color: 'text-emerald-400', activeBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300' },
                { id: 'standard', label: '標準', tooltip: 'バランスモード (適度な3D/2D詳細度、標準レンダリング)', color: 'text-blue-400', activeBg: 'bg-blue-950/80 border-blue-500/40 text-blue-300' },
                { id: 'high', label: '高品質', tooltip: 'フル3Dモード (高解像度、リアルタイム影ON、ライティング最大)', color: 'text-amber-400', activeBg: 'bg-amber-950/80 border-amber-500/40 text-amber-300' }
              ].map(mode => {
                const isActive = performanceMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setPerformanceMode(mode.id as any)}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-all border cursor-pointer ${
                      isActive 
                        ? `${mode.activeBg} shadow-[0_0_8px_rgba(255,255,255,0.05)]` 
                        : 'bg-transparent border-transparent hover:bg-slate-900 text-slate-500 hover:text-slate-300'
                    }`}
                    title={mode.tooltip}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Googleスプレッドシート＆ドライブ クラウド連携 */}
          <WorkspaceCloudManager 
            controlPoints={points}
            crossSection={crossSection}
            sections={sections}
            onLoadPlan={({ controlPoints: cp, crossSection: cs, sections: sec }) => {
              const activeRoadId = appState.network.activeAlignmentId;
              const currentRoad = appState.network.alignments[activeRoadId];
              if (!currentRoad) return;

              const nextRoad: AlignmentPlan = {
                ...currentRoad,
                points: cp,
                crossSection: cs,
                segments: sec
              };

              const nextNetwork: RoadNetwork = {
                ...appState.network,
                alignments: {
                  ...appState.network.alignments,
                  [activeRoadId]: nextRoad
                }
              };

              nextNetwork.intersections = detectRoadIntersections(nextNetwork);

              const nextState = {
                ...appState,
                network: nextNetwork
              };

              executeCommand(new ReplaceAllStateCommand(
                "クラウドからの設計プランの読込",
                appState,
                nextState
              ));
            }}
          />

          {/* コピーボタン */}
          <button
            onClick={handleQuickCopy}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-[11px] font-bold text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="現在のリアルタイム設計パラメータ(JSON)をコピーします"
          >
            {copiedParams ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                コピー完了
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-blue-400" />
                パラメータコピー
              </>
            )}
          </button>

          {/* MD一覧ボタン */}
          <button
            onClick={() => setShowMarkdownViewer(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-[11px] font-extrabold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
            title="プロジェクトの要件、設計、スキル、仕様書など、すべてのMarkdownドキュメントを切り替えて閲覧できます"
          >
            <BookOpen className="w-3.5 h-3.5" />
            MD一覧
          </button>

        </div>
      </header>

      {/* 1.5. CIM道路設計シーケンシャル・パイプライン (CIM Design Pipeline) */}
      <div className="h-14 shrink-0 bg-slate-950/40 border-b border-white/5 px-6 flex items-center justify-between gap-4 backdrop-blur-md z-20">
        
        {/* 左側：進捗・シーケンシャルコントロール */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1 bg-slate-900 border border-white/5 rounded-lg p-1">
            <button
              onClick={() => handleStepNavigate(-1)}
              disabled={getCurrentStepIndex() === 0}
              className={`p-1 rounded-md flex items-center justify-center transition-all ${
                getCurrentStepIndex() > 0
                  ? 'hover:bg-slate-800 text-slate-300 cursor-pointer active:scale-90'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="前の設計ステップへ戻る"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="text-[9px] font-extrabold px-1 text-slate-400 font-mono">
              STEP <span className="text-blue-400 text-xs">{getCurrentStepIndex() + 1}</span> / 7
            </div>
            <button
              onClick={() => handleStepNavigate(1)}
              disabled={getCurrentStepIndex() === 6}
              className={`p-1 rounded-md flex items-center justify-center transition-all ${
                getCurrentStepIndex() < 6
                  ? 'hover:bg-slate-800 text-slate-300 cursor-pointer active:scale-90'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="次の設計ステップへ進む"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* 3分割統合ビューとの切り替えトグル */}
          <button
            onClick={() => setLayoutMode(layoutMode === 'triple' ? 'map' : 'triple')}
            className={`px-3 py-1.5 text-[10px] font-extrabold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 ${
              layoutMode === 'triple'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-400 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-900/60 hover:bg-slate-800/80 border-white/10 text-slate-300'
            }`}
            title="全ての図面を同期表示する3分割一括ビューと個別の設計ステップを切り替えます"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>統合コックピット (3分割)</span>
          </button>
        </div>

        {/* 中央：プログレッシブステップ表示 */}
        <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {STEPS.map((step, idx) => {
            const isActive = layoutMode === step.id;
            const isCompleted = getCurrentStepIndex() > idx;
            return (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <div className="flex items-center mx-0.5">
                    <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
                  </div>
                )}
                <button
                  onClick={() => setLayoutMode(step.id as any)}
                  className={`px-3 py-1 rounded-full flex items-center gap-2 text-left cursor-pointer transition-all shrink-0 select-none ${
                    isActive
                      ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                      : isCompleted
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-slate-900/40'
                      : 'bg-transparent border border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                  title={step.tip}
                >
                  <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-extrabold ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-500'
                  }`}>
                    {isCompleted ? <Check className="w-2.5 h-2.5" /> : step.num}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold tracking-wide leading-tight">{step.label}</span>
                    <span className="text-[7.5px] text-slate-500 leading-none mt-0.5 hidden xl:inline">{step.desc}</span>
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* 右側：ステップ固有 of AIアドバイスまたは説明 */}
        <div className="flex items-center gap-2 bg-slate-950/60 border border-white/5 rounded-xl px-3 py-1 max-w-[280px] md:max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-pulse" />
          <span className="text-[9px] font-medium text-slate-400 leading-tight truncate">
            {STEPS[getCurrentStepIndex()]?.tip || 'CIM道路アライメント設計フロー：平面設計から順番に進めることができます。'}
          </span>
        </div>

      </div>

      {/* 2. メインワークスペース (CIM Workflow Workspace) */}
      <main className="h-[calc(100vh-64px-56px-32px)] flex overflow-hidden relative">
        
        {/* 左側：コントロールパラメータパネル（トグルで開閉） */}
        {layoutMode !== 'clothoid' && (
          <aside 
            className={`shrink-0 border-r border-white/10 bg-slate-950/40 backdrop-blur-md p-5 flex flex-col gap-6 transition-all duration-300 relative z-20 overflow-y-auto ${
              panelCollapsed ? 'w-0 -translate-x-full p-0 border-r-0' : 'w-72'
            }`}
          >

          {/* AI設計ガイド & 進捗アシスタント */}
          <div className="bg-gradient-to-b from-blue-950/20 to-slate-950/30 border border-blue-500/20 p-3.5 rounded-xl space-y-2.5 relative overflow-hidden shadow-lg shrink-0">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
              <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span>AI 設計アシスタント</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-[10px] font-extrabold text-white uppercase tracking-wider">
                {layoutMode === 'triple' ? '統合コックピット (一括ビュー)' : STEPS[getCurrentStepIndex()]?.label}
              </h4>
              <p className="text-[9px] text-slate-400 leading-relaxed font-medium">
                {layoutMode === 'triple' 
                  ? '全ての図面（平面・縦断・横断）が同期した統合CIM空間です。俯瞰しながらの設計調整に最適です。'
                  : STEPS[getCurrentStepIndex()]?.tip}
              </p>
            </div>
            
            {/* 設計進捗度インジケーター */}
            <div className="space-y-1 pt-1.5 border-t border-white/5">
              <div className="flex justify-between text-[8px] font-extrabold uppercase tracking-wide text-slate-500 font-mono">
                <span>設計進捗 (Workflow)</span>
                <span className="text-blue-400">{( (getCurrentStepIndex() + 1) * 14.28 ).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(getCurrentStepIndex() + 1) * 14.28}%` }}
                ></div>
              </div>
            </div>
          </div>          </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* 右側：ステップ固有のAIアドバイスまたは説明 */}
        <div className="flex items-center gap-2 bg-slate-950/60 border border-white/5 rounded-xl px-3 py-1 max-w-[280px] md:max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-pulse" />
          <span className="text-[9px] font-medium text-slate-400 leading-tight truncate">
            {STEPS[getCurrentStepIndex()]?.tip || 'CIM道路アライメント設計フロー：平面設計から順番に進めることができます。'}
          </span>
        </div>

      </div>

      {/* 2. メインワークスペース (CIM Workflow Workspace) */}
      <main className="h-[calc(100vh-64px-56px-32px)] flex overflow-hidden relative">
        
        {/* 左側：コントロールパラメータパネル（トグルで開閉） */}
        {layoutMode !== 'clothoid' && (
          <aside 
            className={`shrink-0 border-r border-white/10 bg-slate-950/40 backdrop-blur-md p-5 flex flex-col gap-6 transition-all duration-300 relative z-20 overflow-y-auto ${
              panelCollapsed ? 'w-0 -translate-x-full p-0 border-r-0' : 'w-72'
            }`}
          >

          {/* AI設計ガイド & 進捗アシスタント */}
          <div className="bg-gradient-to-b from-blue-950/20 to-slate-950/30 border border-blue-500/20 p-3.5 rounded-xl space-y-2.5 relative overflow-hidden shadow-lg shrink-0">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
              <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span>AI 設計アシスタント</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-[10px] font-extrabold text-white uppercase tracking-wider">
                {layoutMode === 'triple' ? '統合コックピット (一括ビュー)' : STEPS[getCurrentStepIndex()]?.label}
              </h4>
              <p className="text-[9px] text-slate-400 leading-relaxed font-medium">
                {layoutMode === 'triple' 
                  ? '全ての図面（平面・縦断・横断）が同期した統合CIM空間です。俯瞰しながらの設計調整に最適です。'
                  : STEPS[getCurrentStepIndex()]?.tip}
              </p>
            </div>
            
            {/* 設計進捗度インジケーター */}
            <div className="space-y-1 pt-1.5 border-t border-white/5">
              <div className="flex justify-between text-[8px] font-extrabold uppercase tracking-wide text-slate-500 font-mono">
                <span>設計進捗 (Workflow)</span>
                <span className="text-blue-400">{( (getCurrentStepIndex() + 1) * 14.28 ).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(getCurrentStepIndex() + 1) * 14.28}%` }}
                ></div>
              </div>
            </div>
          </div>
          
          {/* 複数路線 (Multi-Route) ＆ 道路ネットワーク管理セクション */}
          <div className="border-b border-white/5 pb-4">

          {/* Googleスプレッドシート＆ドライブ クラウド連携 */}
          <WorkspaceCloudManager 
            controlPoints={points}
            crossSection={crossSection}
            sections={sections}
            onLoadPlan={({ controlPoints: cp, crossSection: cs, sections: sec }) => {
              const activeRoadId = appState.network.activeAlignmentId;
              const currentRoad = appState.network.alignments[activeRoadId];
              if (!currentRoad) return;

              const nextRoad: AlignmentPlan = {
                ...currentRoad,
                points: cp,
                crossSection: cs,
                segments: sec
              };

              const nextNetwork: RoadNetwork = {
                ...appState.network,
                alignments: {
                  ...appState.network.alignments,
                  [activeRoadId]: nextRoad
                }
              };

              nextNetwork.intersections = detectRoadIntersections(nextNetwork);

              const nextState = {
                ...appState,
                network: nextNetwork
              };

              executeCommand(new ReplaceAllStateCommand(
                "クラウドからの設計プランの読込",
                appState,
                nextState
              ));
            }}
          />

          {/* コピーボタン */}
          <button
            onClick={handleQuickCopy}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-[11px] font-bold text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="現在のリアルタイム設計パラメータ(JSON)をコピーします"
          >
            {copiedParams ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                コピー完了
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-blue-400" />
                パラメータコピー
              </>
            )}
          </button>

          {/* MD一覧ボタン */}
          <button
            onClick={() => setShowMarkdownViewer(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-[11px] font-extrabold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
            title="プロジェクトの要件、設計、スキル、仕様書など、すべてのMarkdownドキュメントを切り替えて閲覧できます"
          >
            <BookOpen className="w-3.5 h-3.5" />
            MD一覧
          </button>

        </div>
      </header>

      {/* 2. メインワークスペース */}
      <main className="h-[calc(100vh-64px-32px)] flex overflow-hidden relative">
        
        {/* 左側：コントロールパラメータパネル（トグルで開閉） */}
        {layoutMode !== 'clothoid' && (
          <aside 
            className={`shrink-0 border-r border-white/10 bg-slate-950/40 backdrop-blur-md p-5 flex flex-col gap-6 transition-all duration-300 relative z-20 overflow-y-auto ${
              panelCollapsed ? 'w-0 -translate-x-full p-0 border-r-0' : 'w-72'
            }`}
          >
          
          {/* 複数路線 (Multi-Route) ＆ 道路ネットワーク管理セクション */}
          <div className="border-b border-white/5 pb-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-display tracking-wider">
                <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                道路ネットワーク設計
              </span>
              <button
                onClick={() => {
                  const newId = `road-${Date.now()}`;
                  const index = Object.keys(appState.network.alignments).length + 1;
                  const newRoad: AlignmentPlan = {
                    id: newId,
                    name: `計画路線 ${index}号線`,
                    points: [
                      { id: 'BP', name: '始点 (BP)', lng: 139.764, lat: 35.680, x: -200, y: -50, z: 30.0, r: 0 },
                      { id: 'IP', name: '交点 (IP)', lng: 139.767, lat: 35.682, x: 0, y: 50, z: 35.0, r: 100 },
                      { id: 'EP', name: '終点 (EP)', lng: 139.770, lat: 35.681, x: 200, y: -50, z: 32.0, r: 0 },
                    ],
                    crossSection: { ...crossSection, leftLaneWidth: 3.0, rightLaneWidth: 3.0 },
                    segments: [
                      { id: `seg-${newId}-1`, startDist: 0.0, endDist: 500.0, type: 'earthwork', properties: { leftLaneWidth: 3.0, rightLaneWidth: 3.0, shoulderWidth: 0.75 } }
                    ],
                    coordinateZone: coordinateZone,
                    heightOffset: 6.0, // デフォルトで少し高くして重なりを作る
                    visible: true,
                    lodLevel: LODLevel.HIGH
                  };
                  executeCommand(new AddAlignmentCommand(`路線「計画路線 ${index}号線」の追加`, newRoad));
                }}
                className="px-1.5 py-0.5 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/30 text-cyan-400 text-[9px] font-extrabold rounded flex items-center gap-0.5 cursor-pointer transition-colors"
                title="新しい道路アライメント設計計画を追加します"
              >
                <Plus className="w-3 h-3" />
                追加
              </button>
            </h3>

            <div className="space-y-2">
              {Object.values(appState.network.alignments).map((road: AlignmentPlan) => {
                const isActive = road.id === activeId;
                return (
                  <div 
                    key={road.id}
                    className={`p-2.5 rounded-lg border transition-all ${
                      isActive 
                        ? 'bg-slate-900/90 border-cyan-500/40 shadow-md shadow-cyan-500/5' 
                        : 'bg-slate-950/20 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      {editingRoadId === road.id ? (
                        <input
                          type="text"
                          value={editingRoadName}
                          onChange={(e) => setEditingRoadName(e.target.value)}
                          onBlur={() => {
                            if (editingRoadName.trim() && editingRoadName.trim() !== road.name) {
                              executeCommand(new UpdateRoadMetadataCommand(
                                `路線名を「${road.name}」から「${editingRoadName.trim()}」に変更`,
                                road.id,
                                { name: road.name },
                                { name: editingRoadName.trim() }
                              ));
                            }
                            setEditingRoadId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingRoadName.trim() && editingRoadName.trim() !== road.name) {
                                executeCommand(new UpdateRoadMetadataCommand(
                                  `路線名を「${road.name}」から「${editingRoadName.trim()}」に変更`,
                                  road.id,
                                  { name: road.name },
                                  { name: editingRoadName.trim() }
                                ));
                              }
                              setEditingRoadId(null);
                            } else if (e.key === 'Escape') {
                              setEditingRoadId(null);
                            }
                          }}
                          autoFocus
                          className="bg-slate-950 border border-cyan-500/50 rounded px-1.5 py-0.5 text-xs text-white font-bold w-full focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      ) : (
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              if (!isActive) {
                                executeCommand(new SwitchActiveAlignmentCommand(
                                  `編集路線を「${road.name}」に切り替え`,
                                  activeId,
                                  road.id
                                ));
                              }
                            }}
                            onDoubleClick={() => {
                              setEditingRoadId(road.id);
                              setEditingRoadName(road.name);
                            }}
                            className={`text-left font-bold text-xs truncate flex-1 cursor-pointer transition-colors ${
                              isActive ? 'text-white hover:text-cyan-300' : 'text-slate-400 hover:text-slate-200'
                            }`}
                            title="ダブルクリック、または右の編集アイコンでリネームできます"
                          >
                            {road.name}
                          </button>
                          {/* 名前編集ボタン */}
                          <button
                            onClick={() => {
                              setEditingRoadId(road.id);
                              setEditingRoadName(road.name);
                            }}
                            className="text-slate-500 hover:text-cyan-400 p-0.5 transition-colors cursor-pointer"
                            title="路線名を変更 (Rename)"
                          >
                            <Sliders className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1">
                        {/* 複製ボタン */}
                        <button
                          onClick={() => {
                            const newId = `road-${Date.now()}`;
                            const clonedRoad: AlignmentPlan = {
                              ...road,
                              id: newId,
                              name: `${road.name} (複製)`,
                              points: road.points.map(p => ({ ...p })),
                              segments: road.segments.map(seg => ({
                                ...seg,
                                id: `seg-${newId}-${Math.random().toString(36).substring(2, 7)}`,
                                properties: { ...seg.properties }
                              })),
                              crossSection: { ...road.crossSection }
                            };
                            executeCommand(new AddAlignmentCommand(
                              `路線「${road.name}」を複製して「${clonedRoad.name}」を作成`,
                              clonedRoad
                            ));
                          }}
                          className="p-0.5 rounded text-slate-500 hover:text-cyan-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="この路線を丸ごと複製"
                        >
                          <Copy className="w-3 h-3" />
                        </button>

                        {/* 可視性トグル */}
                        <button
                          onClick={() => {
                            executeCommand(new UpdateRoadMetadataCommand(
                              `路線「${road.name}」の可視性切り替え`,
                              road.id,
                              { visible: road.visible },
                              { visible: !road.visible }
                            ));
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer ${
                            road.visible ? 'text-slate-300' : 'text-slate-600'
                          }`}
                          title={road.visible ? "非表示にする" : "表示する"}
                        >
                          {road.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>

                        {/* 削除ボタン */}
                        <button
                          disabled={Object.keys(appState.network.alignments).length <= 1}
                          onClick={() => {
                            if (window.confirm(`路線「${road.name}」を本当に削除しますか？`)) {
                              executeCommand(new DeleteAlignmentCommand(
                                `路線「${road.name}」の削除`,
                                road.id,
                                appState
                              ));
                            }
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 transition-colors ${
                            Object.keys(appState.network.alignments).length <= 1
                              ? 'text-slate-700 cursor-not-allowed'
                              : 'text-rose-500 cursor-pointer'
                          }`}
                          title="路線を削除"
                        >
                          <Trash className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* 詳細展開 (アクティブ時、またはLOD調整用) */}
                    <div className="space-y-2 text-[10px] text-slate-400 pt-1.5 border-t border-white/5 font-medium leading-relaxed">
                      <div className="flex items-center justify-between">
                        <span>LOD詳細度:</span>
                        <div className="flex gap-0.5">
                          {(['HIGH', 'MEDIUM', 'LOW', 'LINE'] as LODLevel[]).map(lvl => {
                            const isLvlActive = road.lodLevel === lvl;
                            return (
                              <button
                                key={lvl}
                                onClick={() => {
                                  executeCommand(new UpdateRoadMetadataCommand(
                                    `路線「${road.name}」のLOD詳細度を${lvl}に更新`,
                                    road.id,
                                    { lodLevel: road.lodLevel },
                                    { lodLevel: lvl }
                                  ));
                                }}
                                className={`px-1 py-0.5 text-[8px] font-bold rounded cursor-pointer border transition-all ${
                                  isLvlActive
                                    ? 'bg-cyan-950 border-cyan-500/50 text-cyan-300'
                                    : 'bg-transparent border-transparent hover:bg-slate-800 text-slate-500'
                                }`}
                                title={`LOD: ${lvl}`}
                              >
                                {lvl.substring(0, 3)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>高さオフセット (Z値):</span>
                          <span className="font-mono text-cyan-400 font-bold">{(road.heightOffset || 0.0).toFixed(1)}m</span>
                        </div>
                        <input
                          type="range"
                          min="-15.0"
                          max="25.0"
                          step="0.5"
                          value={road.heightOffset || 0}
                          onChange={(e) => {
                            executeCommand(new UpdateRoadMetadataCommand(
                              `路線「${road.name}」の標高オフセットを ${parseFloat(e.target.value).toFixed(1)}m に設定`,
                              road.id,
                              { heightOffset: road.heightOffset },
                              { heightOffset: parseFloat(e.target.value) }
                            ));
                          }}
                          className="w-full accent-cyan-500 opacity-80 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 立体交差（アンダーパス・オーバーパス）スキャン結果 */}
            {appState.network.intersections.length > 0 && (
              <div className="mt-4 p-2.5 rounded-lg bg-slate-900/60 border border-cyan-500/20">
                <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <SettingsIcon className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
                  交差スキャン検出: {appState.network.intersections.length}件
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {appState.network.intersections.map((node, index) => (
                    <div key={`${node.id}-${index}`} className="p-2 rounded bg-slate-950/40 border border-white/5 space-y-1 text-[9px]">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-200">
                          {node.type === 'OVERPASS' ? '🌉 立体交差 (オーバーパス)' : '🚥 平面交差'}
                        </span>
                        <span className={`px-1 rounded text-[8px] font-bold ${
                          node.type === 'OVERPASS' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-500/20' : 'bg-rose-950/60 text-rose-400 border border-rose-500/20'
                        }`}>
                          {node.type}
                        </span>
                      </div>
                      <div className="text-slate-400 leading-relaxed font-mono">
                        <div>交点: X={node.intersectionX.toFixed(0)}, Y={node.intersectionY.toFixed(0)}</div>
                        <div className="flex justify-between">
                          <span>標高差: {Math.abs(node.elevationDifference).toFixed(1)}m</span>
                          <span className="text-slate-500">
                            {node.primaryRoadId.substring(0, 5)} ⇔ {node.secondaryRoadId.substring(0, 5)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* JGD2011 系統（座標系）設定セクション */}
          <div className="border-b border-white/5 pb-1">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              測地基準系・JGD2011系統
            </h3>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">適用平面直交座標系 (1〜19系)</label>
                <select
                  value={coordinateZone}
                  onChange={(e) => handleZoneChange(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900/90 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
                >
                  {COORDINATE_ZONES.map(z => (
                    <option key={z.zone} value={z.zone}>
                      {z.name} (系 {z.zone})
                    </option>
                  ))}
                </select>
              </div>

              {/* 現在の系統の簡単な情報表示 */}
              <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5 space-y-1 text-[9px] text-slate-400 leading-relaxed">
                <div>
                  <span className="font-semibold text-slate-300">適用地域:</span> {COORDINATE_ZONES.find(z => z.zone === coordinateZone)?.region}
                </div>
                <div className="flex justify-between font-mono text-[8px] text-slate-500 border-t border-white/5 pt-1">
                  <span>EPSG: {COORDINATE_ZONES.find(z => z.zone === coordinateZone)?.epsg}</span>
                  <span>原点: {COORDINATE_ZONES.find(z => z.zone === coordinateZone)?.lng.toFixed(2)}°E, {COORDINATE_ZONES.find(z => z.zone === coordinateZone)?.lat.toFixed(1)}°N</span>
                </div>
              </div>
            </div>
          </div>

          {/* ジオメトリ制約セクション */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              道路断面ジオメトリ制約
            </h3>
            
            <div className="space-y-4">
              
              {/* 左車線幅 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">左車線幅</span>
                  <span className="font-mono text-blue-400">{crossSection.leftLaneWidth.toFixed(2)}m</span>
                </div>
                <input 
                  type="range" 
                  min="2.00" 
                  max="5.00" 
                  step="0.05"
                  value={crossSection.leftLaneWidth}
                  onChange={(e) => handleCrossSectionChange({ ...crossSection, leftLaneWidth: parseFloat(e.target.value) })}
                  className="w-full accent-blue-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
              </div>

              {/* 右車線幅 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">右車線幅</span>
                  <span className="font-mono text-blue-400">{crossSection.rightLaneWidth.toFixed(2)}m</span>
                </div>
                <input 
                  type="range" 
                  min="2.00" 
                  max="5.00" 
                  step="0.05"
                  value={crossSection.rightLaneWidth}
                  onChange={(e) => handleCrossSectionChange({ ...crossSection, rightLaneWidth: parseFloat(e.target.value) })}
                  className="w-full accent-blue-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
              </div>

              {/* 路肩幅 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">路肩幅</span>
                  <span className="font-mono text-blue-400">{crossSection.shoulderWidth.toFixed(2)}m</span>
                </div>
                <input 
                  type="range" 
                  min="0.50" 
                  max="2.50" 
                  step="0.05"
                  value={crossSection.shoulderWidth}
                  onChange={(e) => handleCrossSectionChange({ ...crossSection, shoulderWidth: parseFloat(e.target.value) })}
                  className="w-full accent-blue-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
              </div>

              {/* 法面勾配 S */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">法面勾配 (1:S)</span>
                  <span className="font-mono text-emerald-400">1:{crossSection.slopeGradient.toFixed(1)}</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="3.0" 
                  step="0.1"
                  value={crossSection.slopeGradient}
                  onChange={(e) => handleCrossSectionChange({ ...crossSection, slopeGradient: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
              </div>

            </div>
          </div>

          {/* 切土盛土リアルタイム集計セクション */}
          <div className="border-t border-white/10 pt-5 mt-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-blue-400" />
              土量ボリューム総計
            </h3>
            
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center p-2 rounded bg-blue-500/5 border border-blue-500/10">
                <span className="text-slate-400 text-[10px]">切土量 (Cut)</span>
                <span className="text-blue-400 font-bold">{engineeringData.cutVolume.toLocaleString()} m³</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-red-500/5 border border-red-500/10">
                <span className="text-slate-400 text-[10px]">盛土量 (Fill)</span>
                <span className="text-red-400 font-bold">{engineeringData.fillVolume.toLocaleString()} m³</span>
              </div>
              <div className={`flex justify-between items-center p-2 rounded border ${
                engineeringData.netVolume >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-amber-500/5 border-amber-500/10'
              }`}>
                <span className="text-slate-400 text-[10px]">差引土量</span>
                <span className={`font-bold ${engineeringData.netVolume >= 0 ? 'text-emerald-400' : 'text-amber-500'}`}>
                  {engineeringData.netVolume >= 0 ? '+' : ''}{engineeringData.netVolume.toLocaleString()} m³
                </span>
              </div>
            </div>
          </div>

          {/* クイック統計 */}
          <div className="mt-auto p-3.5 rounded-xl bg-slate-900/60 border border-white/5 text-[10px] leading-relaxed text-slate-400">
            <div className="flex items-center gap-1 font-bold text-slate-300 mb-1">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              線形幾何データ
            </div>
            <div>道路総延長: <span className="font-mono text-white font-bold">{engineeringData.totalLength} m</span></div>
            <div>平均縦断勾配: <span className="font-mono text-white font-bold">{engineeringData.avgSlope}%</span></div>
            <div>分割断面数: <span className="font-mono text-white font-bold">60 断面</span></div>
          </div>

        </aside>
        )}

        {/* コントロールパネルの開閉ハンドルボタン */}
        {layoutMode !== 'clothoid' && (
          <button
            onClick={() => setPanelCollapsed(!panelCollapsed)}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-16 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white rounded-r-lg flex items-center justify-center border-y border-r border-white/10 z-30 cursor-pointer shadow-lg shadow-black/50"
            title={panelCollapsed ? "パラメータパネルを展開" : "パラメータパネルを最小化"}
          >
            {panelCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* コンテンツ描画エリア */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden min-w-0 bg-[radial-gradient(circle_at_center,_rgba(30,58,138,0.06)_0%,_transparent_75%)]">
          {(layoutMode === 'triple' || layoutMode === 'map' || layoutMode === 'profile' || layoutMode === 'cross') && (
            <DrawingsTab 
              points={points} 
              onPointsChange={handlePointsChange}
              crossSection={crossSection} 
              onCrossSectionChange={handleCrossSectionChange}
              alignment={alignment}
              engineeringData={engineeringData}
              stations={stations}
              stationInterval={stationInterval}
              setStationInterval={setStationInterval}
              selectedStationDist={selectedStationDist}
              setSelectedStationDist={setSelectedStationDist}
              layoutMode={layoutMode}
              setLayoutMode={setLayoutMode}
              contourInterval={contourInterval}
              setContourInterval={setContourInterval}
              sections={sections}
              setSections={handleSectionsChange}
              performanceMode={performanceMode}
              roadNetwork={appState.network}
              activeAlignmentId={activeId}
              onSwitchAlignment={(roadId: string) => {
                executeCommand(new SwitchActiveAlignmentCommand(
                  `編集路線を「${appState.network.alignments[roadId]?.name || roadId}」に切り替え`,
                  activeId,
                  roadId
                ));
              }}
              onUpdateRoadMetadata={(roadId: string, fromMeta: any, toMeta: any) => {
                executeCommand(new UpdateRoadMetadataCommand(
                  `路線「${appState.network.alignments[roadId]?.name || roadId}」のパラメータ更新`,
                  roadId,
                  fromMeta,
                  toMeta
                ));
              }}
              onAddAlignment={(newRoad: AlignmentPlan) => {
                executeCommand(new AddAlignmentCommand(`路線「${newRoad.name}」の追加`, newRoad));
              }}
              onDeleteAlignment={(roadId: string) => {
                const roadName = appState.network.alignments[roadId]?.name || roadId;
                executeCommand(new DeleteAlignmentCommand(`路線「${roadName}」の削除`, roadId, appState));
              }}
              coordinateZone={coordinateZone}
            />
          )}
          {layoutMode === '3d' && (
            <Preview3DTab 
              alignment={alignment} 
              crossSection={crossSection} 
              isActive={layoutMode === '3d'}
              stations={stations}
              selectedStationDist={selectedStationDist}
              setSelectedStationDist={setSelectedStationDist}
              setLayoutMode={setLayoutMode}
              contourInterval={contourInterval}
              setContourInterval={setContourInterval}
              sections={sections}
              performanceMode={performanceMode}
              roadNetwork={appState.network}
              onShowMarkdownList={() => setShowMarkdownViewer(true)}
            />
          )}
          {layoutMode === 'export' && (
            <ExportTab 
              points={points} 
              crossSection={crossSection} 
              alignment={alignment} 
              engineeringData={engineeringData}
              coordinateZone={coordinateZone}
            />
          )}
          {layoutMode === 'clothoid' && (
            <ClothoidTab />
          )}
          {layoutMode === 'compare' && (
            <CompareTab
              roadNetwork={appState.network}
              executeCommand={executeCommand}
              performanceMode={performanceMode}
            />
          )}
        </div>

      </main>

      {/* 3. ステータスバー（Footer） */}
      <footer className="h-8 shrink-0 bg-slate-950/90 border-t border-white/10 px-6 flex items-center justify-between text-[10px] text-slate-500 z-30 font-mono">
        <div className="flex gap-6">
          <span>測地座標 (BP): <span className="text-slate-300">Lat:{points[0].lat.toFixed(4)}°, Lng:{points[0].lng.toFixed(4)}°</span></span>
          <span className="hidden md:inline">道路中心座標 (IP): <span className="text-slate-300">X:{Math.round(currentStation.x)}m, Y:{Math.round(currentStation.y)}m, Z:{currentStation.z.toFixed(1)}m</span></span>
        </div>
        <div className="flex gap-4 uppercase items-center">
          <span className="text-blue-500 font-bold">JGD2011 /平面直交座標{COORDINATE_ZONES.find(z => z.zone === coordinateZone)?.name} (系{coordinateZone})</span>
          <span>•</span>
          <span className="text-slate-400 italic">Rendering Core: Three.js/WebGL & SVG</span>
        </div>
      </footer>

      {/* 4. 詳細設計書 / パラメータビューアダイアログ */}
      <SpecsDialog 
        isOpen={showSpecs} 
        onClose={() => setShowSpecs(false)} 
        points={points} 
        crossSection={crossSection}
      />

      {/* 5. プロジェクト内 Markdown 一覧ビューア (ドロワー) */}
      <MarkdownDocViewer 
        isOpen={showMarkdownViewer}
        onClose={() => setShowMarkdownViewer(false)}
      />

      {/* 6. 設計変更履歴 ＆ 差分比較ビューアー */}
      <HistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        appState={appState}
        initialState={initialState}
        commandHistory={commandHistory}
        onRestoreState={(restoredState, description) => {
          executeCommand(new ReplaceAllStateCommand(
            description,
            appState,
            restoredState
          ));
        }}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

    </div>
  );
}
