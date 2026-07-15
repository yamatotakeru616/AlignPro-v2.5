/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Sliders, Volume2, TrendingUp, HelpCircle, Layers, Check, RefreshCw, ChevronsUpDown, Eye, EyeOff, Sparkles, Maximize2, Minimize2, Map as MapIcon, Columns, LayoutGrid } from 'lucide-react';
import { ControlPoint, AlignmentPoint, CrossSectionParams, EngineeringData, StationPoint, SectionSegment } from '../types';
import { calculateAlignment, calculateVolumes, interpolateAlignmentAtDistance, xyToLngLat, generateProfileStationRows, getInterpolatedSectionProperties, calculateMultiStageSlope, autoDetectAndApplyTunnelSections, optimizeLongitudinalProfile } from '../utils';
import { RoadNetwork, AlignmentPlan } from '../utils/network';
import MapTab from './MapTab';

interface DrawingsTabProps {
  points: ControlPoint[];
  onPointsChange?: (points: ControlPoint[]) => void;
  crossSection: CrossSectionParams;
  onCrossSectionChange: (params: CrossSectionParams) => void;
  alignment: AlignmentPoint[];
  engineeringData: EngineeringData;
  stations: StationPoint[];
  stationInterval: number;
  setStationInterval: (interval: number) => void;
  selectedStationDist: number;
  setSelectedStationDist: (dist: number) => void;
  layoutMode: 'triple' | 'map' | 'profile' | 'cross' | '3d' | 'export';
  setLayoutMode: (mode: 'triple' | 'map' | 'profile' | 'cross' | '3d' | 'export') => void;
  contourInterval: number;
  setContourInterval: (interval: number) => void;
  sections: SectionSegment[];
  setSections: (sections: SectionSegment[]) => void;
  performanceMode?: 'eco' | 'standard' | 'high';
  roadNetwork?: RoadNetwork;
  activeAlignmentId?: string;
  onSwitchAlignment?: (roadId: string) => void;
  onUpdateRoadMetadata?: (roadId: string, fromMeta: any, toMeta: any) => void;
  onAddAlignment?: (newRoad: AlignmentPlan) => void;
  onDeleteAlignment?: (roadId: string) => void;
  coordinateZone?: number;
}

export default function DrawingsTab({
  points,
  onPointsChange,
  crossSection,
  onCrossSectionChange,
  alignment,
  engineeringData,
  stations,
  stationInterval,
  setStationInterval,
  selectedStationDist,
  setSelectedStationDist,
  layoutMode,
  setLayoutMode,
  contourInterval,
  setContourInterval,
  sections,
  setSections,
  performanceMode = 'standard',
  roadNetwork,
  activeAlignmentId,
  onSwitchAlignment,
  onUpdateRoadMetadata,
  onAddAlignment,
  onDeleteAlignment,
  coordinateZone
}: DrawingsTabProps) {

  // ジオメトリ調整、舗装・路床各層設定、縦断曲線設定、集水桝設定のタブ切り替え状態
  const [activeSubTab, setActiveSubTab] = useState<'geometry' | 'layers' | 'profile' | 'drainage'>('geometry');

  // 集水桝の保存フィードバック＆永続化制御
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // 初回ロード：localStorageから集水桝設計パラメータを自動ロードしてマージ
  useEffect(() => {
    try {
      const savedSpacing = localStorage.getItem('drainage_inletSpacing');
      const savedType = localStorage.getItem('drainage_inletType');
      const savedStandard = localStorage.getItem('drainage_inletCapacityStandard');
      const savedLarge = localStorage.getItem('drainage_inletCapacityLarge');
      const savedGrated = localStorage.getItem('drainage_inletCapacityGrated');
      const savedHigh = localStorage.getItem('drainage_inletCapacityHighCapacity');

      if (savedSpacing || savedType || savedStandard || savedLarge || savedGrated || savedHigh) {
        const updated = { ...crossSection };
        if (savedSpacing) updated.inletSpacing = parseInt(savedSpacing);
        if (savedType) updated.inletType = savedType as any;
        if (savedStandard) updated.inletCapacityStandard = parseFloat(savedStandard);
        if (savedLarge) updated.inletCapacityLarge = parseFloat(savedLarge);
        if (savedGrated) updated.inletCapacityGrated = parseFloat(savedGrated);
        if (savedHigh) updated.inletCapacityHighCapacity = parseFloat(savedHigh);

        onCrossSectionChange(updated);
      }
    } catch (e) {
      console.error('集水桝保存データの初期ロードエラー:', e);
    }
  }, []);

  // 集水桝設定の保存ハンドラ
  const handleSaveDrainageSettings = () => {
    try {
      localStorage.setItem('drainage_inletSpacing', String(crossSection.inletSpacing ?? 25));
      localStorage.setItem('drainage_inletType', crossSection.inletType ?? 'standard');
      localStorage.setItem('drainage_inletCapacityStandard', String(crossSection.inletCapacityStandard ?? 3.0));
      localStorage.setItem('drainage_inletCapacityLarge', String(crossSection.inletCapacityLarge ?? 5.0));
      localStorage.setItem('drainage_inletCapacityGrated', String(crossSection.inletCapacityGrated ?? 7.0));
      localStorage.setItem('drainage_inletCapacityHighCapacity', String(crossSection.inletCapacityHighCapacity ?? 10.0));

      setSaveFeedback('集水桝の配置設計・各タイプ排水能力(L/s)を保存しました！');
      setTimeout(() => setSaveFeedback(null), 3500);
    } catch (e) {
      console.error('集水桝保存エラー:', e);
      setSaveFeedback('保存に失敗しました');
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };


  // 土量ボリューム最適化用ステート
  const [isVolumeOptimizing, setIsVolumeOptimizing] = useState<boolean>(false);
  const [optimizationResult, setOptimizationResult] = useState<{
    log: string[];
    initialVolume: { cut: number; fill: number };
    optimizedVolume: { cut: number; fill: number };
  } | null>(null);

  const handleOptimizeVolumes = () => {
    if (!onPointsChange) return;
    setIsVolumeOptimizing(true);
    setOptimizationResult(null);

    // AI/アルゴリズム計算をリアルタイムに見せるための極小ディレイ演出
    setTimeout(() => {
      try {
        const res = optimizeLongitudinalProfile(points, crossSection, sections);
        onPointsChange(res.optimizedPoints);
        setOptimizationResult(res);
      } catch (err) {
        console.error("土量最適化エラー:", err);
      } finally {
        setIsVolumeOptimizing(false);
      }
    }, 700);
  };

  // 縦断曲線設計用の状態
  const vpiPoints = useMemo(() => {
    return points.slice(1, points.length - 1);
  }, [points]);

  const [selectedVpiId, setSelectedVpiId] = useState<string>('');
  const [designSpeed, setDesignSpeed] = useState<number>(40); // デフォルト40km/h

  // pointsが更新された際に、selectedVpiIdを適切に初期化
  useEffect(() => {
    if (vpiPoints.length > 0 && (!selectedVpiId || !vpiPoints.some(v => v.id === selectedVpiId))) {
      setSelectedVpiId(vpiPoints[0].id);
    }
  }, [vpiPoints, selectedVpiId]);

  const selectedVpiIndex = useMemo(() => {
    return points.findIndex(p => p.id === selectedVpiId);
  }, [points, selectedVpiId]);

  const selectedVpiPoint = useMemo(() => {
    return points[selectedVpiIndex] || null;
  }, [points, selectedVpiIndex]);

  // IP前後の勾配情報などを計算
  const vpiData = useMemo(() => {
    if (selectedVpiIndex <= 0 || selectedVpiIndex >= points.length - 1) return null;
    const prev = points[selectedVpiIndex - 1];
    const curr = points[selectedVpiIndex];
    const next = points[selectedVpiIndex + 1];

    const L1 = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
    const L2 = Math.sqrt((next.x - curr.x) ** 2 + (next.y - curr.y) ** 2);

    const g1 = L1 > 0.1 ? (curr.z - prev.z) / L1 : 0;
    const g2 = L2 > 0.1 ? (next.z - curr.z) / L2 : 0;
    const deltaG = Math.abs(g2 - g1);
    const isSag = (g2 - g1) > 0; // 勾配が増加＝凹、減少＝凸

    return { g1, g2, deltaG, isSag, L1, L2 };
  }, [points, selectedVpiIndex]);

  // 道路構造令基準最小半径
  const minRadius = useMemo(() => {
    if (!vpiData) return 450;
    const rules: Record<number, { crest: number; sag: number }> = {
      20: { crest: 100, sag: 100 },
      30: { crest: 250, sag: 250 },
      40: { crest: 450, sag: 450 },
      50: { crest: 800, sag: 800 },
      60: { crest: 1400, sag: 1000 },
      80: { crest: 3000, sag: 2000 },
    };
    const speedRules = rules[designSpeed] || { crest: 450, sag: 450 };
    return vpiData.isSag ? speedRules.sag : speedRules.crest;
  }, [designSpeed, vpiData]);

  const minVcl = useMemo(() => {
    const rules: Record<number, number> = {
      20: 20, 30: 25, 40: 35, 50: 40, 60: 50, 80: 70
    };
    return rules[designSpeed] || 35;
  }, [designSpeed]);

  // 現在の R（半径）を逆算
  const currentR = useMemo(() => {
    if (!vpiData || vpiData.deltaG < 0.0001 || !selectedVpiPoint) return 0;
    const vcl = selectedVpiPoint.vcl || 0;
    return vcl / vpiData.deltaG;
  }, [vpiData, selectedVpiPoint]);

  // R を変更したときに、親の points 状態を更新する
  const handleRadiusChange = (newR: number) => {
    if (!onPointsChange || !vpiData || !selectedVpiPoint) return;
    const computedVcl = newR * vpiData.deltaG;
    
    // アライメントの最大許容 VCL
    const maxVcl = 2 * Math.min(vpiData.L1 * 0.45, vpiData.L2 * 0.45);
    const finalVcl = Math.max(0, Math.min(maxVcl, computedVcl));

    const updatedPoints = points.map(p => {
      if (p.id === selectedVpiId) {
        return { ...p, vcl: parseFloat(finalVcl.toFixed(2)) };
      }
      return p;
    });
    onPointsChange(updatedPoints);
  };

  // VCL を直接変更したときに、親の points 状態を更新する
  const handleVclChange = (newVcl: number) => {
    if (!onPointsChange || !vpiData) return;
    const maxVcl = 2 * Math.min(vpiData.L1 * 0.45, vpiData.L2 * 0.45);
    const finalVcl = Math.max(0, Math.min(maxVcl, newVcl));

    const updatedPoints = points.map(p => {
      if (p.id === selectedVpiId) {
        return { ...p, vcl: parseFloat(finalVcl.toFixed(2)) };
      }
      return p;
    });
    onPointsChange(updatedPoints);
  };

  // 道路構造令の最小基準を自動適用する
  const handleAutoApplyMin = () => {
    if (!onPointsChange || !vpiData || !selectedVpiPoint) return;
    
    // 最小 R から算出した VCL
    let targetVcl = minRadius * vpiData.deltaG;
    // 最小 VCL 制限も満たす
    if (targetVcl < minVcl) {
      targetVcl = minVcl;
    }

    const maxVcl = 2 * Math.min(vpiData.L1 * 0.45, vpiData.L2 * 0.45);
    const finalVcl = Math.max(0, Math.min(maxVcl, targetVcl));

    const updatedPoints = points.map(p => {
      if (p.id === selectedVpiId) {
        return { ...p, vcl: parseFloat(finalVcl.toFixed(2)) };
      }
      return p;
    });
    onPointsChange(updatedPoints);
  };

  // 現況地形プロファイル（陰影オーバーレイ）の表示状態
  const [showTerrainProfile, setShowTerrainProfile] = useState<boolean>(() => {
    const saved = localStorage.getItem('drawings_showTerrainProfile');
    return saved !== null ? saved === 'true' : true;
  });

  // 切盛高表示線の表示状態
  const [showCutFillLines, setShowCutFillLines] = useState<boolean>(() => {
    const saved = localStorage.getItem('drawings_showCutFillLines');
    return saved !== null ? saved === 'true' : true;
  });

  // ドラッグ中のコントロールポイントID
  const [draggingCpId, setDraggingCpId] = useState<string | null>(null);

  // ズーム・パン機能用のステート
  const [zoomX, setZoomX] = useState<number>(1);
  const [zoomY, setZoomY] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panOffsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ホバーした位置のリアルタイムツールチップ情報用ステート
  const [hoveredInfo, setHoveredInfo] = useState<{
    distance: number;
    z: number;
    groundZ: number;
    x: number;
    y: number;
    yGround: number;
  } | null>(null);

  // 縦断図の表示高さの拡大状態
  const [isHeightExpanded, setIsHeightExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('drawings_isHeightExpanded');
    return saved !== null ? saved === 'true' : true; // デフォルトは拡大(true)
  });

  // 横断面エリアの表示状態
  const [showCrossSectionArea, setShowCrossSectionArea] = useState<boolean>(() => {
    const saved = localStorage.getItem('drawings_showCrossSectionArea');
    return saved !== null ? saved === 'true' : true; // デフォルトは表示(true)
  });

  // AIによる計画高自動最適化（切盛最小化）のステート
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  
  // 3つのAI提案プランを保持するインターフェース＆ステート
  const [optimizePlans, setOptimizePlans] = useState<Array<{
    id: string;
    name: string;
    description: string;
    badge: string;
    badgeColor: string;
    points: ControlPoint[];
    cutVolume: number;
    fillVolume: number;
    totalVolume: number;
    imbalance: number;
    percentSaved: number;
  }> | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [originalPoints, setOriginalPoints] = useState<ControlPoint[] | null>(null);

  // 方眼グリッド線の表示状態
  const [showGrid, setShowGrid] = useState<boolean>(() => {
    const saved = localStorage.getItem('drawings_showGrid');
    return saved !== null ? saved === 'true' : true;
  });

  // 横断設計タブ内の表示モード切り替え（'pattern': 標準断面パターン設計, 'multi': 各測点横断図複数一覧）
  const [crossSectionTabMode, setCrossSectionTabMode] = useState<'pattern' | 'multi'>('pattern');

  // 測点選択時の横断形状ポップアップカードの表示状態
  const [showSectionPopup, setShowSectionPopup] = useState<boolean>(() => {
    const saved = localStorage.getItem('drawings_showSectionPopup');
    return saved !== null ? saved === 'true' : true;
  });

  // 設定を localStorage に保存する
  useEffect(() => {
    localStorage.setItem('drawings_showSectionPopup', String(showSectionPopup));
  }, [showSectionPopup]);

  useEffect(() => {
    localStorage.setItem('drawings_showTerrainProfile', String(showTerrainProfile));
  }, [showTerrainProfile]);

  useEffect(() => {
    localStorage.setItem('drawings_showCutFillLines', String(showCutFillLines));
  }, [showCutFillLines]);

  useEffect(() => {
    localStorage.setItem('drawings_isHeightExpanded', String(isHeightExpanded));
  }, [isHeightExpanded]);

  useEffect(() => {
    localStorage.setItem('drawings_showCrossSectionArea', String(showCrossSectionArea));
  }, [showCrossSectionArea]);

  useEffect(() => {
    localStorage.setItem('drawings_showGrid', String(showGrid));
  }, [showGrid]);

  // 各コントロールポイント(BP, IP, EP)のアライメント上での累積距離をマッピング
  const cpDistances = useMemo(() => {
    return points.map(p => {
      let minDist = Infinity;
      let bestDistance = 0;
      alignment.forEach(a => {
        const d = Math.sqrt((a.x - p.x) ** 2 + (a.y - p.y) ** 2);
        if (d < minDist) {
          minDist = d;
          bestDistance = a.distance;
        }
      });
      return { id: p.id, distance: bestDistance };
    });
  }, [points, alignment]);

  // コントロールポイントのドラッグ開始
  const handleCPDragStart = (id: string, e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation(); // パン操作がトリガーされないようにバブリングを止める
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingCpId(id);
  };

  // ドラッグ中：計画高（Z値）の動的更新
  const handleCPDragMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingCpId || !onPointsChange) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientY = e.clientY - rect.top; // SVG内のローカルY座標
    
    const { minY, maxY } = scaleBounds;
    const baseHeight = chartHeight - padding.top - padding.bottom;
    const centerY = padding.top + baseHeight / 2;
    
    // ズーム・パンに対応した Y座標から標高 Z への逆算
    const normY = centerY + (clientY - panY - centerY) / zoomY;
    const pctY = (chartHeight - padding.bottom - normY) / baseHeight;
    let newZ = minY + pctY * (maxY - minY);
    
    // 10m 〜 90m の安全な範囲にクランプ
    newZ = Math.max(10, Math.min(90, newZ));
    // 0.1m 単位で美しくスナップ
    newZ = Math.round(newZ * 10) / 10;
    
    const updated = points.map(p => p.id === draggingCpId ? { ...p, z: newZ } : p);
    onPointsChange(updated);
  };

  // ドラッグ終了
  const handleCPDragEnd = () => {
    if (draggingCpId) {
      setDraggingCpId(null);
    }
  };

  // パン操作の開始
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setHoveredInfo(null); // ドラッグ・パン開始時は非表示にする
    if (draggingCpId) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return; // 左クリックのみ

    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panOffsetStartRef.current = { x: panX, y: panY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // ポインター移動（パン操作、CPドラッグ、およびリアルタイムツールチップ表示対応）
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingCpId) {
      handleCPDragMove(e);
      setHoveredInfo(null);
      return;
    }

    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;

      setPanX(panOffsetStartRef.current.x + dx);
      setPanY(panOffsetStartRef.current.y + dy);
      setHoveredInfo(null);
      return;
    }

    // ツールチップ表示用のマウス位置から座標とアライメント属性を逆算
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;

    // SVG内のローカル座標に変換 (viewBox="0 0 profileWidth profileHeight" にマッピング)
    const localX = (svgX / rect.width) * profileWidth;
    const localY = (svgY / rect.height) * profileHeight;

    // ズーム・パン後の座標を逆算して実距離と標高を取得
    const { distance } = getCoordsFromSVG(localX, localY);

    if (alignment.length > 0) {
      const minAlignDist = alignment[0].distance;
      const maxAlignDist = alignment[alignment.length - 1].distance;

      // グラフの有効領域内（または少しの外側マージン）に収まる場合のみツールチップを表示
      if (distance >= minAlignDist - 5 && distance <= maxAlignDist + 5) {
        const clampedDist = Math.max(minAlignDist, Math.min(maxAlignDist, distance));
        const interp = interpolateAlignmentAtDistance(alignment, clampedDist);
        if (interp) {
          const designCoords = getProfileCoords(clampedDist, interp.z);
          const groundCoords = getProfileCoords(clampedDist, interp.groundZ);

          setHoveredInfo({
            distance: clampedDist,
            z: interp.z,
            groundZ: interp.groundZ,
            x: designCoords.x,
            y: designCoords.y,
            yGround: groundCoords.y
          });
          return;
        }
      }
    }
    setHoveredInfo(null);
  };

  // ポインターアップ（パン操作およびCPドラッグ両対応）
  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingCpId) {
      handleCPDragEnd();
    } else if (isPanning) {
      setIsPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setHoveredInfo(null);
  };

  // ポインターリーブ（パン操作およびCPドラッグ両対応）
  const handlePointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    handleCPDragEnd();
    if (isPanning) {
      setIsPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setHoveredInfo(null);
  };

  // ホイールによるズーム操作（マウス位置基準）
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setHoveredInfo(null); // ホイールズーム中は一旦ツールチップを非表示に
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = 1.15;
    let nextZoomX = zoomX;
    let nextZoomY = zoomY;

    if (e.deltaY < 0) {
      // ズームイン
      nextZoomX = Math.min(15, zoomX * zoomFactor);
      nextZoomY = Math.min(15, zoomY * zoomFactor);
    } else {
      // ズームアウト
      nextZoomX = Math.max(0.4, zoomX / zoomFactor);
      nextZoomY = Math.max(0.4, zoomY / zoomFactor);
    }

    // マウス位置を中心とした正確なズームを行うためのパン移動量補正
    const baseWidth = profileWidth - padding.left - padding.right;
    const centerX = padding.left + baseWidth / 2;
    const baseHeight = chartHeight - padding.top - padding.bottom;
    const centerY = padding.top + baseHeight / 2;

    const normXMouse = (mouseX - panX - centerX) / zoomX;
    const normYMouse = (mouseY - panY - centerY) / zoomY;

    const nextPanX = mouseX - centerX - normXMouse * nextZoomX;
    const nextPanY = mouseY - centerY - normYMouse * nextZoomY;

    setZoomX(nextZoomX);
    setZoomY(nextZoomY);
    setPanX(nextPanX);
    setPanY(nextPanY);
  };

  // 縦断交点（IP）を任意の測点位置に動的追加
  const handleAddIP = () => {
    if (!onPointsChange || !currentProfilePoint) return;
    
    // 各ポイントのアライメント上での累積距離をマッピング
    const pointsWithDist = points.map(p => {
      let minDist = Infinity;
      let bestDistance = 0;
      alignment.forEach(a => {
        const d = Math.sqrt((a.x - p.x) ** 2 + (a.y - p.y) ** 2);
        if (d < minDist) {
          minDist = d;
          bestDistance = a.distance;
        }
      });
      return { point: p, dist: bestDistance };
    });
    
    const newDist = selectedStationDist;
    const newX = currentProfilePoint.x;
    const newY = currentProfilePoint.y;
    const newZ = currentProfilePoint.z;
    const newLngLat = xyToLngLat(newX, newY);
    
    // 重複を避けるためのユニークな ID
    const newId = `IP-${Date.now()}`;
    const newIP: ControlPoint = {
      id: newId,
      name: `追加交点 (IP.${points.length - 1})`,
      lng: parseFloat(newLngLat.lng.toFixed(6)),
      lat: parseFloat(newLngLat.lat.toFixed(6)),
      x: parseFloat(newX.toFixed(1)),
      y: parseFloat(newY.toFixed(1)),
      z: parseFloat(newZ.toFixed(1)),
      r: 120, // デフォルト半径 120m
      vcl: 40 // デフォルト縦断曲線長 40m
    };
    
    // 累積距離順に正しい位置に挿入
    let inserted = false;
    const newPointsList: ControlPoint[] = [];
    
    for (let i = 0; i < pointsWithDist.length; i++) {
      const current = pointsWithDist[i];
      if (!inserted && newDist < current.dist) {
        newPointsList.push(newIP);
        inserted = true;
      }
      newPointsList.push(current.point);
    }
    
    // 万が一挿入されなかったら、EPの直前に配置 (EPは常に末尾)
    if (!inserted) {
      newPointsList.splice(newPointsList.length - 1, 0, newIP);
    }
    
    // 名前をインデックス順に振り直して美しく保つ
    const renamedList = newPointsList.map((p, index) => {
      if (p.id === 'BP') return p;
      if (p.id === 'EP') return p;
      return {
        ...p,
        name: `追加交点 (IP.${index})`
      };
    });
    
    onPointsChange(renamedList);
    setSelectedVpiId(newId);
  };

  // 選択中の縦断交点（IP）を削除
  const handleDeleteIP = () => {
    if (!onPointsChange || !selectedVpiId) return;
    if (selectedVpiId === 'BP' || selectedVpiId === 'EP') return; // BP, EPは削除禁止
    
    const remainingPoints = points.filter(p => p.id !== selectedVpiId);
    
    // 名前をインデックス順に美しく振り直し
    const renamedList = remainingPoints.map((p, index) => {
      if (p.id === 'BP') return p;
      if (p.id === 'EP') return p;
      return {
        ...p,
        name: `追加交点 (IP.${index})`
      };
    });
    
    onPointsChange(renamedList);
    
    // 選択を別のIPに自動的に切り替える
    const remainingVpis = renamedList.slice(1, renamedList.length - 1);
    if (remainingVpis.length > 0) {
      setSelectedVpiId(remainingVpis[0].id);
    } else {
      setSelectedVpiId('');
    }
  };

  // AIによる切盛土量最小化・縦断計画高自動最適化（3つの異なる勾配案を同時提案）
  const handleOptimizeProfile = () => {
    if (!onPointsChange || points.length === 0) return;

    setIsOptimizing(true);
    setOptimizePlans(null);
    setSelectedPlanId(null);

    // 元の計画高をバックアップ（キャンセル時に復元するため）
    const backupPoints = points.map(p => ({ ...p }));
    setOriginalPoints(backupPoints);

    // AIシミュレーションの遅延演出
    setTimeout(() => {
      // 共通の最適化探索ヘルパー関数（多段階座標降下法）
      const runOptimization = (
        costFn: (pts: ControlPoint[]) => number,
        maxBoundDelta: number,
        maxIntermediateDelta: number
      ) => {
        let optimized = points.map(p => ({ ...p }));
        const bounds = optimized.map((p, idx) => {
          const isBound = idx === 0 || idx === optimized.length - 1;
          const maxDelta = isBound ? maxBoundDelta : maxIntermediateDelta;
          return {
            minZ: Math.max(10, p.z - maxDelta),
            maxZ: Math.min(90, p.z + maxDelta)
          };
        });

        let currentCost = costFn(optimized);
        let step = 6.0;
        const minStep = 0.02;

        while (step >= minStep) {
          let improved = false;
          for (let i = 0; i < optimized.length; i++) {
            const p = optimized[i];
            const b = bounds[i];

            // 標高を上げる方向
            const nextZPlus = Math.min(b.maxZ, p.z + step);
            if (nextZPlus !== p.z) {
              optimized[i].z = nextZPlus;
              const costPlus = costFn(optimized);
              if (costPlus < currentCost - 0.005) {
                currentCost = costPlus;
                improved = true;
                continue;
              }
              optimized[i].z = p.z;
            }

            // 標高を下げる方向
            const nextZMinus = Math.max(b.minZ, p.z - step);
            if (nextZMinus !== p.z) {
              optimized[i].z = nextZMinus;
              const costMinus = costFn(optimized);
              if (costMinus < currentCost - 0.005) {
                currentCost = costMinus;
                improved = true;
                continue;
              }
              optimized[i].z = p.z;
            }
          }

          if (!improved) {
            step *= 0.5;
          }
        }

        return optimized.map(p => ({
          ...p,
          z: parseFloat(p.z.toFixed(2))
        }));
      };

      // 最適化前の体積
      const initialAlign = calculateAlignment(points, crossSection);
      const initialVol = calculateVolumes(initialAlign, crossSection);
      const prevTotal = initialVol.cutVolume + initialVol.fillVolume;

      // ==========================================
      // プランA: 切盛バランス最優先型 (Eco Balance)
      // ==========================================
      const costFnA = (pts: ControlPoint[]) => {
        const tempAlign = calculateAlignment(pts, crossSection);
        const vol = calculateVolumes(tempAlign, crossSection);
        const imbalance = Math.abs(vol.cutVolume - vol.fillVolume);
        const total = vol.cutVolume + vol.fillVolume;
        // 不均衡に非常に重いペナルティを与え、切土と盛土を均等にする
        return total + 18.0 * imbalance;
      };
      const pointsA = runOptimization(costFnA, 2.5, 15.0);
      const alignA = calculateAlignment(pointsA, crossSection);
      const volA = calculateVolumes(alignA, crossSection);
      const totalA = volA.cutVolume + volA.fillVolume;
      const percentSavedA = prevTotal > 0.1 ? ((prevTotal - totalA) / prevTotal) * 100 : 0;

      // ==========================================
      // プランB: 土工総体積最小化型 (Minimum Excavation)
      // ==========================================
      const costFnB = (pts: ControlPoint[]) => {
        const tempAlign = calculateAlignment(pts, crossSection);
        const vol = calculateVolumes(tempAlign, crossSection);
        const imbalance = Math.abs(vol.cutVolume - vol.fillVolume);
        const total = vol.cutVolume + vol.fillVolume;
        // 不均衡ペナルティを最小限にし、掘削・盛土量の絶対総和の最小化を優先
        return total + 0.15 * imbalance;
      };
      const pointsB = runOptimization(costFnB, 1.5, 10.0);
      const alignB = calculateAlignment(pointsB, crossSection);
      const volB = calculateVolumes(alignB, crossSection);
      const totalB = volB.cutVolume + volB.fillVolume;
      const percentSavedB = prevTotal > 0.1 ? ((prevTotal - totalB) / prevTotal) * 100 : 0;

      // ==========================================
      // プランC: スムーズ緩勾配重視型 (Smooth Safety Grade)
      // ==========================================
      const costFnC = (pts: ControlPoint[]) => {
        const tempAlign = calculateAlignment(pts, crossSection);
        const vol = calculateVolumes(tempAlign, crossSection);
        const imbalance = Math.abs(vol.cutVolume - vol.fillVolume);
        const total = vol.cutVolume + vol.fillVolume;

        // 各制御点の平面上での累積距離を導出
        const distances: number[] = [0];
        let acc = 0;
        for (let j = 1; j < pts.length; j++) {
          const dx = pts[j].x - pts[j - 1].x;
          const dy = pts[j].y - pts[j - 1].y;
          acc += Math.sqrt(dx * dx + dy * dy);
          distances.push(acc);
        }

        // 折れ曲がり（縦断勾配の傾き変化）を抑制するためのペナルティ
        let gradePenalty = 0;
        for (let i = 1; i < pts.length - 1; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const next = pts[i + 1];

          const run1 = distances[i] - distances[i - 1];
          const rise1 = curr.z - prev.z;
          const grade1 = run1 > 0 ? rise1 / run1 : 0;

          const run2 = distances[i + 1] - distances[i];
          const rise2 = next.z - curr.z;
          const grade2 = run2 > 0 ? rise2 / run2 : 0;

          gradePenalty += Math.abs(grade2 - grade1);
        }
        return total + 2.0 * imbalance + 8500.0 * gradePenalty;
      };
      const pointsC = runOptimization(costFnC, 1.5, 8.0);
      const alignC = calculateAlignment(pointsC, crossSection);
      const volC = calculateVolumes(alignC, crossSection);
      const totalC = volC.cutVolume + volC.fillVolume;
      const percentSavedC = prevTotal > 0.1 ? ((prevTotal - totalC) / prevTotal) * 100 : 0;

      // 3つのプランを組み立てる
      const plans = [
        {
          id: 'eco-balance',
          name: '切盛バランス最優先型',
          badge: 'ECOバランス',
          badgeColor: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30',
          description: '切土量と盛土量の不均衡を極限まで抑え、外部との土砂搬出入（残土処理・借土）費用をほぼゼロに抑える最も環境負荷の低いプランです。',
          points: pointsA,
          cutVolume: volA.cutVolume,
          fillVolume: volA.fillVolume,
          totalVolume: totalA,
          imbalance: Math.abs(volA.cutVolume - volA.fillVolume),
          percentSaved: parseFloat(percentSavedA.toFixed(1))
        },
        {
          id: 'min-excavation',
          name: '土工総体積最小化型',
          badge: '総掘削・盛土量最小',
          badgeColor: 'bg-cyan-950/80 text-cyan-400 border-cyan-500/30',
          description: '現況地盤に可能な限りアライメントを沿わせ、掘削（切土）と盛土の合計工事規模（総マテリアル移動量）そのものを最小にする合理的なプランです。',
          points: pointsB,
          cutVolume: volB.cutVolume,
          fillVolume: volB.fillVolume,
          totalVolume: totalB,
          imbalance: Math.abs(volB.cutVolume - volB.fillVolume),
          percentSaved: parseFloat(percentSavedB.toFixed(1))
        },
        {
          id: 'smooth-grade',
          name: 'スムーズ緩勾配重視型',
          badge: '快適走行・安全優先',
          badgeColor: 'bg-violet-950/80 text-violet-400 border-violet-500/30',
          description: '縦断勾配の変化（折れ曲がり角）を抑制し、急坂や不連続なアップダウンを排除した、視距の確保や乗り心地・燃費・安全性を最優先したプランです。',
          points: pointsC,
          cutVolume: volC.cutVolume,
          fillVolume: volC.fillVolume,
          totalVolume: totalC,
          imbalance: Math.abs(volC.cutVolume - volC.fillVolume),
          percentSaved: parseFloat(percentSavedC.toFixed(1))
        }
      ];

      setOptimizePlans(plans);
      setSelectedPlanId('eco-balance'); // デフォルトは「切盛バランス最優先型」を選択

      // 一時的にプランAをプレビューとして反映
      onPointsChange(pointsA);
      setIsOptimizing(false);
    }, 950);
  };

  // 選択した最適化案（プレビュー）を切り替える
  const handleSelectPlan = (planId: string) => {
    if (!optimizePlans || !onPointsChange) return;
    const plan = optimizePlans.find(p => p.id === planId);
    if (plan) {
      setSelectedPlanId(planId);
      onPointsChange(plan.points); // プレビューとして即座に図面に反映
    }
  };

  // 最適化案を確定して適用
  const handleApplyPlan = () => {
    setOptimizePlans(null);
    setOriginalPoints(null);
    setSelectedPlanId(null);
  };

  // 断面区間（Section Segment）操作ハンドラー
  const handleAutoTunnelDetect = () => {
    const updated = autoDetectAndApplyTunnelSections(alignment, sections, 8.0);
    setSections(updated);
  };

  const handleSplitSection = () => {
    const dist = selectedStationDist;
    const currentSecIdx = sections.findIndex(s => dist > s.startDist && dist < s.endDist);
    if (currentSecIdx === -1) return;

    const target = sections[currentSecIdx];
    const newSec1: SectionSegment = {
      ...target,
      id: `${target.id}-1`,
      endDist: dist,
    };
    const newSec2: SectionSegment = {
      ...target,
      id: `sec-${Date.now()}`,
      startDist: dist,
    };

    const updated = [
      ...sections.slice(0, currentSecIdx),
      newSec1,
      newSec2,
      ...sections.slice(currentSecIdx + 1),
    ];
    setSections(updated);
  };

  const handleUpdateSectionType = (idx: number, type: 'earthwork' | 'bridge' | 'viaduct' | 'tunnel') => {
    const updated = sections.map((sec, i) => {
      if (i === idx) {
        return {
          ...sec,
          type,
          properties: {
            ...sec.properties,
            type,
            girderDepth: type === 'bridge' ? 1.8 : type === 'viaduct' ? 1.4 : undefined,
            pierHeight: type === 'bridge' ? 12.0 : type === 'viaduct' ? 8.0 : undefined,
            tunnelShape: type === 'tunnel' ? ('arch' as 'arch' | 'box') : undefined,
            liningThickness: type === 'tunnel' ? 0.30 : undefined,
          }
        };
      }
      return sec;
    });
    setSections(updated);
  };

  const handleDeleteSection = (idx: number) => {
    if (sections.length <= 1) return;
    
    const updated = [...sections];
    const removed = updated[idx];
    
    if (idx === 0) {
      updated[1].startDist = 0;
    } else {
      updated[idx - 1].endDist = removed.endDist;
    }
    
    updated.splice(idx, 1);
    setSections(updated);
  };

  const handleUpdateSectionProperty = (idx: number, key: string, val: any) => {
    const updated = sections.map((sec, i) => {
      if (i === idx) {
        return {
          ...sec,
          properties: {
            ...sec.properties,
            [key]: val,
          }
        };
      }
      return sec;
    });
    setSections(updated);
  };

  // 最適化をキャンセルして元に戻す
  const handleCancelOptimization = () => {
    if (originalPoints && onPointsChange) {
      onPointsChange(originalPoints); // 元の状態に復旧
    }
    setOptimizePlans(null);
    setOriginalPoints(null);
    setSelectedPlanId(null);
  };

  // 指定の距離におけるアライメント（計画・現況）情報を補間抽出
  const currentProfilePoint = useMemo(() => {
    if (alignment.length === 0) return null;
    return interpolateAlignmentAtDistance(alignment, selectedStationDist);
  }, [alignment, selectedStationDist]);

  // 現在選択されている測点情報を取得
  const activeStation = useMemo(() => {
    if (!stations || stations.length === 0) return null;
    return stations.find(s => Math.abs(s.distance - selectedStationDist) < 0.1) || stations[0];
  }, [stations, selectedStationDist]);

  // 縦断図のSVGパラメータ
  const profileWidth = 800;
  const chartHeight = showCrossSectionArea 
    ? (isHeightExpanded ? 360 : 220) 
    : (isHeightExpanded ? 540 : 360);
  const bandHeight = 270; // 諸元表（帯）の高さ
  const profileHeight = chartHeight + bandHeight; // SVG全体の高さ
  const padding = { top: 20, right: 30, bottom: 30, left: 50 };

  // 諸元表用のマージ・ソート配列 (ProfileStationRow[]) を動的生成
  const profileStationRows = useMemo(() => {
    return generateProfileStationRows(points, alignment, stations, crossSection, sections);
  }, [points, alignment, stations, crossSection, sections]);

  // 縦断図の最大値・最小値の計算（自動スケーリング）
  const scaleBounds = useMemo(() => {
    if (alignment.length === 0) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const maxX = alignment[alignment.length - 1].distance;
    const minX = 0;
    
    let minY = Infinity;
    let maxY = -Infinity;
    alignment.forEach(p => {
      minY = Math.min(minY, p.z, p.groundZ);
      maxY = Math.max(maxY, p.z, p.groundZ);
    });

    // 余裕を持たせる
    return {
      minX,
      maxX,
      minY: Math.max(0, minY - 10),
      maxY: maxY + 10,
    };
  }, [alignment]);

  // 縦断図座標からSVGピクセル座標への変換（グラフ描画エリア chartHeight を基準にする。ズーム・パンに対応）
  const getProfileCoords = (distance: number, elevation: number) => {
    const { minX, maxX, minY, maxY } = scaleBounds;
    const baseWidth = profileWidth - padding.left - padding.right;
    const baseHeight = chartHeight - padding.top - padding.bottom;
    
    const pctX = (distance - minX) / (maxX - minX);
    const pctY = (elevation - minY) / (maxY - minY);

    const centerX = padding.left + baseWidth / 2;
    const centerY = padding.top + baseHeight / 2;

    const normX = padding.left + pctX * baseWidth;
    const normY = chartHeight - padding.bottom - pctY * baseHeight;

    const x = centerX + (normX - centerX) * zoomX + panX;
    const y = centerY + (normY - centerY) * zoomY + panY;

    return { x, y };
  };

  // SVGピクセル座標から縦断図座標（距離、標高）への逆変換
  const getCoordsFromSVG = (svgX: number, svgY: number) => {
    const { minX, maxX, minY, maxY } = scaleBounds;
    const baseWidth = profileWidth - padding.left - padding.right;
    const baseHeight = chartHeight - padding.top - padding.bottom;

    const centerX = padding.left + baseWidth / 2;
    const centerY = padding.top + baseHeight / 2;

    const normX = centerX + (svgX - panX - centerX) / zoomX;
    const normY = centerY + (svgY - panY - centerY) / zoomY;

    const pctX = (normX - padding.left) / baseWidth;
    const pctY = (chartHeight - padding.bottom - normY) / baseHeight;

    const distance = minX + pctX * (maxX - minX);
    const elevation = minY + pctY * (maxY - minY);

    return { distance, elevation };
  };

  // 縦断図の地盤高ライン (Dashed) & 計画高ライン (Solid)
  const paths = useMemo(() => {
    if (alignment.length === 0) return { groundPath: '', designPath: '', designSegments: [], fillPolygons: [], cutPolygons: [], terrainPoints: '' };

    let groundPath = '';
    let designPath = '';

    // ハッチング領域の分割生成
    // 盛土（計画 > 地盤）、切土（計画 < 地盤）
    // 交点を求める簡易ロジック：各点ごとにポリゴンを作る
    const fillPolygons: string[] = [];
    const cutPolygons: string[] = [];

    alignment.forEach((p, i) => {
      const gCoords = getProfileCoords(p.distance, p.groundZ);
      const dCoords = getProfileCoords(p.distance, p.z);

      if (i === 0) {
        groundPath += `M ${gCoords.x},${gCoords.y}`;
        designPath += `M ${dCoords.x},${dCoords.y}`;
      } else {
        groundPath += ` L ${gCoords.x},${gCoords.y}`;
        designPath += ` L ${dCoords.x},${dCoords.y}`;
      }

      // 隣り合う2点で台形ポリゴンを生成してハッチング
      if (i < alignment.length - 1) {
        const next = alignment[i + 1];
        const p1_g = getProfileCoords(p.distance, p.groundZ);
        const p1_d = getProfileCoords(p.distance, p.z);
        const p2_g = getProfileCoords(next.distance, next.groundZ);
        const p2_d = getProfileCoords(next.distance, next.z);

        const polyStr = `${p1_g.x},${p1_g.y} ${p2_g.x},${p2_g.y} ${p2_d.x},${p2_d.y} ${p1_d.x},${p1_d.y}`;

        // 地盤と計画の平均値で判定
        const avgH = (p.z + next.z) / 2 - (p.groundZ + next.groundZ) / 2;
        if (avgH > 0) {
          fillPolygons.push(polyStr);
        } else {
          cutPolygons.push(polyStr);
        }
      }
    });

    // 計画高線形を直線区間と縦断曲線(放物線)区間に分割するセグメント配列
    const designSegments: { path: string; isVerticalCurve: boolean }[] = [];
    if (alignment.length > 0) {
      let currentPath = '';
      let currentType = alignment[0].isVerticalCurve || false;

      alignment.forEach((p, i) => {
        const dCoords = getProfileCoords(p.distance, p.z);
        if (i === 0) {
          currentPath = `M ${dCoords.x},${dCoords.y}`;
        } else {
          const pPrev = alignment[i - 1];
          const type = p.isVerticalCurve || false;

          if (type !== currentType) {
            // パスの区切り：現在のパスを完了してプッシュ
            designSegments.push({ path: currentPath, isVerticalCurve: currentType });
            // 新しいパスを前の点から接続して開始
            const prevCoords = getProfileCoords(pPrev.distance, pPrev.z);
            currentPath = `M ${prevCoords.x},${prevCoords.y} L ${dCoords.x},${dCoords.y}`;
            currentType = type;
          } else {
            currentPath += ` L ${dCoords.x},${dCoords.y}`;
          }
        }
      });

      if (currentPath) {
        designSegments.push({ path: currentPath, isVerticalCurve: currentType });
      }
    }

    // 簡易的な地形プロファイルの塗りつぶし領域 (Area)
    let terrainPoints = '';
    if (alignment.length > 0) {
      const first = alignment[0];
      const last = alignment[alignment.length - 1];
      const firstBottom = getProfileCoords(first.distance, scaleBounds.minY);
      const lastBottom = getProfileCoords(last.distance, scaleBounds.minY);

      const pts: string[] = [];
      alignment.forEach(p => {
        const coords = getProfileCoords(p.distance, p.groundZ);
        pts.push(`${coords.x},${coords.y}`);
      });
      // 閉じたポリゴンにするために右下、左下を結合
      pts.push(`${lastBottom.x},${lastBottom.y}`);
      pts.push(`${firstBottom.x},${firstBottom.y}`);
      terrainPoints = pts.join(' ');
    }

    return { groundPath, designPath, designSegments, fillPolygons, cutPolygons, terrainPoints };
  }, [alignment, scaleBounds, zoomX, zoomY, panX, panY]);

  const generateCrossSectionData = (dist: number, planZ: number, groundZ: number) => {
    const svgW = 400;
    const svgH = 160;

    const hDiff = planZ - groundZ; // 正＝盛土、負＝切土

    // 断面区間のプロパティ判定 & 線形補間（すり付け）
    const sectionProps = getInterpolatedSectionProperties(dist, sections, crossSection);
    
    const leftWidth = sectionProps.leftLaneWidth;
    const rightWidth = sectionProps.rightLaneWidth;
    const shoulder = sectionProps.shoulderWidth;
    const sectionType = sectionProps.type; // 'earthwork' | 'bridge' | 'viaduct' | 'tunnel'

    const csScale = 14; 
    const cx = svgW / 2;
    // 橋梁や高架橋、トンネルの場合は、構造物が画面に綺麗に収まるように上下位置(基準高)を調整
    const cy = sectionType === 'earthwork' 
      ? svgH / 2 - hDiff * csScale * 0.5 
      : sectionType === 'tunnel'
        ? svgH / 2 + 25 // アーチ上部が収まるように中心高を下げる
        : svgH / 2 - 20;

    const toCSVGPixel = (offsetLX: number, heightLY: number) => {
      return {
        x: cx + offsetLX * csScale,
        y: cy - heightLY * csScale
      };
    };

    // 1. 道路舗装頂点（ローカル高さ：中心が y=0、左右車線端が -0.02 * W）
    const ptCenter = toCSVGPixel(0, 0);
    const ptLeftLane = toCSVGPixel(-leftWidth, -0.02 * leftWidth); // 横断勾配2%
    const ptLeftShoulder = toCSVGPixel(-leftWidth - shoulder, -0.02 * leftWidth - 0.04 * shoulder); // 路肩勾配4%
    const ptRightLane = toCSVGPixel(rightWidth, -0.02 * rightWidth);
    const ptRightShoulder = toCSVGPixel(rightWidth + shoulder, -0.02 * rightWidth - 0.04 * shoulder);

    // 道路構造の各層の物理頂点の計算 (舗装厚、路盤厚、路床厚)
    const tPavement = crossSection.pavementThickness || 0.15;
    const tBase = crossSection.baseThickness || 0.30;
    const tSubgrade = crossSection.subgradeThickness || 1.00;

    const getOffsetPoints = (thickness: number) => {
      return {
        leftShoulder: toCSVGPixel(-leftWidth - shoulder, -0.02 * leftWidth - 0.04 * shoulder - thickness),
        leftLane: toCSVGPixel(-leftWidth, -0.02 * leftWidth - thickness),
        center: toCSVGPixel(0, -thickness),
        rightLane: toCSVGPixel(rightWidth, -0.02 * rightWidth - thickness),
        rightShoulder: toCSVGPixel(rightWidth + shoulder, -0.02 * rightWidth - 0.04 * shoulder - thickness),
      };
    };

    const paveUnder = getOffsetPoints(tPavement);
    const baseUnder = getOffsetPoints(tPavement + tBase);
    const subgradeUnder = getOffsetPoints(tPavement + tBase + tSubgrade);

    // 舗装層ポリゴン (Pavement Polygon)
    const pavePolygonPointsStr = [
      ptLeftShoulder, ptLeftLane, ptCenter, ptRightLane, ptRightShoulder,
      paveUnder.rightShoulder, paveUnder.rightLane, paveUnder.center, paveUnder.leftLane, paveUnder.leftShoulder
    ].map(p => `${p.x},${p.y}`).join(' ');

    // 路盤層ポリゴン (Base/Subbase Polygon)
    const basePolygonPointsStr = [
      paveUnder.leftShoulder, paveUnder.leftLane, paveUnder.center, paveUnder.rightLane, paveUnder.rightShoulder,
      baseUnder.rightShoulder, baseUnder.rightLane, baseUnder.center, baseUnder.leftLane, baseUnder.leftShoulder
    ].map(p => `${p.x},${p.y}`).join(' ');

    // 路床層ポリゴン (Subgrade Polygon)
    const subgradePolygonPointsStr = [
      baseUnder.leftShoulder, baseUnder.leftLane, baseUnder.center, baseUnder.rightLane, baseUnder.rightShoulder,
      subgradeUnder.rightShoulder, subgradeUnder.rightLane, subgradeUnder.center, subgradeUnder.leftLane, subgradeUnder.leftShoulder
    ].map(p => `${p.x},${p.y}`).join(' ');

    // 道路線形計画ライン
    const roadPathStr = `M ${ptLeftShoulder.x},${ptLeftShoulder.y} L ${ptLeftLane.x},${ptLeftLane.y} L ${ptCenter.x},${ptCenter.y} L ${ptRightLane.x},${ptRightLane.y} L ${ptRightShoulder.x},${ptRightShoulder.y}`;

    let leftSlopePathStr = '';
    let rightSlopePathStr = '';
    let hatchPointsStr = '';
    let leftStructurePolyStr = '';
    let rightStructurePolyStr = '';
    let leftStruct = 'none';
    let rightStruct = 'none';

    // 橋梁・高架橋用のSVG構造部
    let bridgeStructureHtml: React.ReactNode = null;

    const isFill = hDiff > 0;
    const slopeS = isFill ? (crossSection.fillSlopeGradient ?? 1.5) : (crossSection.cutSlopeGradient ?? 1.0);
    const leftSlopeDy = -hDiff;
    const rightSlopeDy = -hDiff;

    let maxSlopeX = Math.max(15, Math.abs(hDiff) * slopeS + 5);
    let ptGroundLeft = toCSVGPixel(-leftWidth - shoulder - maxSlopeX, leftSlopeDy);
    let ptGroundRight = toCSVGPixel(rightWidth + shoulder + maxSlopeX, rightSlopeDy);

    // 共通関数用にプロファイルデータをラップ
    const mockedProfilePoint = { z: planZ, groundZ: groundZ };

    if (sectionType === 'earthwork') {
      leftStruct = crossSection.leftSlopeStructure || 'auto';
      rightStruct = crossSection.rightSlopeStructure || 'auto';

      if (leftStruct === 'auto') {
        if (hDiff > 2.5) leftStruct = 'gravity';
        else if (hDiff > 1.2 && hDiff <= 2.5) leftStruct = 'block';
        else leftStruct = 'none';
      }
      if (rightStruct === 'auto') {
        if (hDiff > 2.5) rightStruct = 'gravity';
        else if (hDiff > 1.2 && hDiff <= 2.5) rightStruct = 'block';
        else rightStruct = 'none';
      }

      // 左側のり面頂点（多段小段）
      let leftSlopePixels: { x: number; y: number }[] = [];
      if (leftStruct === 'none') {
        const leftBermPoints = calculateMultiStageSlope(
          leftWidth + shoulder,
          -0.02 * leftWidth - 0.04 * shoulder,
          true,
          mockedProfilePoint as any,
          crossSection,
          crossSection.bermInterval || 5.0,
          crossSection.bermWidth || 1.0
        );
        leftSlopePixels = leftBermPoints.map(bp => toCSVGPixel(-bp.y, bp.z));
        leftSlopePathStr = 'M ' + leftSlopePixels.map(p => `${p.x},${p.y}`).join(' L ');
        
        if (leftSlopePixels.length > 0) {
          const toe = leftSlopePixels[leftSlopePixels.length - 1];
          ptGroundLeft = { x: toe.x - 20, y: toe.y };
        }
      } else {
        const ptToe = toCSVGPixel(-leftWidth - shoulder, leftSlopeDy);
        leftSlopePathStr = `M ${ptLeftShoulder.x},${ptLeftShoulder.y} L ${ptToe.x},${ptToe.y}`;
        ptGroundLeft = { x: ptToe.x - 20, y: ptToe.y };

        if (leftStruct === 'gravity') {
          const hWall = Math.min(hDiff, 4.0);
          const pt1 = ptLeftShoulder;
          const pt2 = { x: ptLeftShoulder.x - 0.5 * csScale, y: ptLeftShoulder.y };
          const pt3 = { x: ptLeftShoulder.x - (0.5 + 0.18 * hWall) * csScale, y: ptLeftShoulder.y + hWall * csScale };
          const pt4 = { x: ptLeftShoulder.x + 0.25 * hWall * csScale, y: ptLeftShoulder.y + hWall * csScale };
          leftStructurePolyStr = [pt1, pt2, pt3, pt4].map(p => `${p.x},${p.y}`).join(' ');
        } else if (leftStruct === 'block') {
          const pt1 = ptLeftShoulder;
          const pt2 = toCSVGPixel(-leftWidth - shoulder - Math.abs(hDiff) * 0.5, leftSlopeDy);
          const len = Math.sqrt(1 + 0.5 * 0.5);
          const nx = -1 / len;
          const ny = -0.5 / len;
          const pt3 = { x: pt2.x + nx * 0.4 * csScale, y: pt2.y - ny * 0.4 * csScale };
          const pt4 = { x: pt1.x + nx * 0.4 * csScale, y: pt1.y - ny * 0.4 * csScale };
          leftStructurePolyStr = [pt1, pt2, pt3, pt4].map(p => `${p.x},${p.y}`).join(' ');
        }
      }

      // 右側のり面頂点（多段小段）
      let rightSlopePixels: { x: number; y: number }[] = [];
      if (rightStruct === 'none') {
        const rightBermPoints = calculateMultiStageSlope(
          rightWidth + shoulder,
          -0.02 * rightWidth - 0.04 * shoulder,
          false,
          mockedProfilePoint as any,
          crossSection,
          crossSection.bermInterval || 5.0,
          crossSection.bermWidth || 1.0
        );
        rightSlopePixels = rightBermPoints.map(bp => toCSVGPixel(bp.y, bp.z));
        rightSlopePathStr = 'M ' + rightSlopePixels.map(p => `${p.x},${p.y}`).join(' L ');

        if (rightSlopePixels.length > 0) {
          const toe = rightSlopePixels[rightSlopePixels.length - 1];
          ptGroundRight = { x: toe.x + 20, y: toe.y };
        }
      } else {
        const ptToe = toCSVGPixel(rightWidth + shoulder, rightSlopeDy);
        rightSlopePathStr = `M ${ptRightShoulder.x},${ptRightShoulder.y} L ${ptToe.x},${ptToe.y}`;
        ptGroundRight = { x: ptToe.x + 20, y: ptToe.y };

        if (rightStruct === 'gravity') {
          const hWall = Math.min(hDiff, 4.0);
          const pt1 = ptRightShoulder;
          const pt2 = { x: ptRightShoulder.x + 0.5 * csScale, y: ptRightShoulder.y };
          const pt3 = { x: ptRightShoulder.x + (0.5 + 0.18 * hWall) * csScale, y: ptRightShoulder.y + hWall * csScale };
          const pt4 = { x: ptRightShoulder.x - 0.25 * hWall * csScale, y: ptRightShoulder.y + hWall * csScale };
          rightStructurePolyStr = [pt1, pt2, pt3, pt4].map(p => `${p.x},${p.y}`).join(' ');
        } else if (rightStruct === 'block') {
          const pt1 = ptRightShoulder;
          const pt2 = toCSVGPixel(rightWidth + shoulder + Math.abs(hDiff) * 0.5, rightSlopeDy);
          const len = Math.sqrt(1 + 0.5 * 0.5);
          const nx = 1 / len;
          const ny = -0.5 / len;
          const pt3 = { x: pt2.x + nx * 0.4 * csScale, y: pt2.y - ny * 0.4 * csScale };
          const pt4 = { x: pt1.x + nx * 0.4 * csScale, y: pt1.y - ny * 0.4 * csScale };
          rightStructurePolyStr = [pt1, pt2, pt3, pt4].map(p => `${p.x},${p.y}`).join(' ');
        }
      }

      // 切土盛土ハッチング領域 (Polygon) のパス構築
      const leftPStr = leftSlopePixels.length > 0 ? leftSlopePixels : [ptLeftShoulder, toCSVGPixel(-leftWidth - shoulder, leftSlopeDy)];
      const rightPStr = rightSlopePixels.length > 0 ? rightSlopePixels : [ptRightShoulder, toCSVGPixel(rightWidth + shoulder, rightSlopeDy)];
      
      const hatchPoints = [
        ...leftPStr.slice().reverse(),
        ptLeftLane,
        ptCenter,
        ptRightLane,
        ...rightPStr,
        ptGroundRight,
        ptGroundLeft
      ];
      hatchPointsStr = hatchPoints.map(p => `${p.x},${p.y}`).join(' ');

    } else if (sectionType === 'tunnel') {
      const lining = sectionProps.liningThickness ?? 0.3;
      const tunnelShape = sectionProps.tunnelShape ?? 'arch';
      const groundDy = -hDiff;
      ptGroundLeft = toCSVGPixel(-leftWidth - shoulder - 15, groundDy);
      ptGroundRight = toCSVGPixel(rightWidth + shoulder + 15, groundDy);

      const innerRadius = (leftWidth + rightWidth + shoulder * 2) * 0.5 + 0.6;
      const outerRadius = innerRadius + lining;
      const centerOffsetX = 0;
      const invertY = -1.5;

      if (tunnelShape === 'box') {
        const hTunnel = 5.2; // トンネル有効高
        const ptBottomLeft = toCSVGPixel(-innerRadius, invertY);
        const ptTopLeft = toCSVGPixel(-innerRadius, invertY + hTunnel);
        const ptTopRight = toCSVGPixel(innerRadius, invertY + hTunnel);
        const ptBottomRight = toCSVGPixel(innerRadius, invertY);

        const outerPtBottomLeft = toCSVGPixel(-innerRadius - lining, invertY - lining);
        const outerPtTopLeft = toCSVGPixel(-innerRadius - lining, invertY + hTunnel + lining);
        const outerPtTopRight = toCSVGPixel(innerRadius + lining, invertY + hTunnel + lining);
        const outerPtBottomRight = toCSVGPixel(innerRadius + lining, invertY - lining);

        const innerBoxStr = [ptBottomLeft, ptTopLeft, ptTopRight, ptBottomRight].map(p => `${p.x},${p.y}`).join(' ');
        const outerBoxStr = [outerPtBottomLeft, outerPtTopLeft, outerPtTopRight, outerPtBottomRight].map(p => `${p.x},${p.y}`).join(' ');

        bridgeStructureHtml = (
          <g>
            <polygon points={outerBoxStr} fill="#334155" stroke="#64748b" strokeWidth="1" />
            <polygon points={innerBoxStr} fill="#020617" />
          </g>
        );
      } else {
        // アーチ
        const centerOffsetY = 1.0; // 道路面から1.0m上を円弧の中心にする
        const innerPoints: {x: number; y: number}[] = [];
        const outerPoints: {x: number; y: number}[] = [];
        const steps = 18;

        // -10° から 190° にかけて滑らかなアーチを描く
        for (let i = 0; i <= steps; i++) {
          const rad = (-10 + (200 / steps) * i) * Math.PI / 180;
          const ix = centerOffsetX + innerRadius * Math.cos(rad);
          const iy = centerOffsetY + innerRadius * Math.sin(rad);
          innerPoints.push(toCSVGPixel(ix, iy));

          const ox = centerOffsetX + outerRadius * Math.cos(rad);
          const oy = centerOffsetY + outerRadius * Math.sin(rad);
          outerPoints.push(toCSVGPixel(ox, oy));
        }

        const liningPolygonPointsStr = [
          ...innerPoints,
          ...outerPoints.slice().reverse()
        ].map(p => `${p.x},${p.y}`).join(' ');

        const ptInvertLeft = toCSVGPixel(-innerRadius, invertY);
        const ptInvertRight = toCSVGPixel(innerRadius, invertY);
        const ptCenterRoad = toCSVGPixel(0, 0);

        bridgeStructureHtml = (
          <g>
            <polygon points={liningPolygonPointsStr} fill="#334155" stroke="#64748b" strokeWidth="1" />
            <polygon points={[...innerPoints, ptInvertRight, ptInvertLeft].map(p => `${p.x},${p.y}`).join(' ')} fill="#020617" />
            <path d={`M ${innerPoints[0].x},${innerPoints[0].y} Q ${ptCenterRoad.x},${toCSVGPixel(0, invertY).y} ${innerPoints[innerPoints.length - 1].x},${innerPoints[innerPoints.length - 1].y}`} fill="none" stroke="#475569" strokeWidth="2" />
          </g>
        );
      }
    } else if (sectionType === 'bridge' || sectionType === 'viaduct') {
      const groundDy = -hDiff;
      ptGroundLeft = toCSVGPixel(-leftWidth - shoulder - 15, groundDy);
      ptGroundRight = toCSVGPixel(rightWidth + shoulder + 15, groundDy);

      const gDepth = sectionProps.girderDepth;

      const leftWallEnd = toCSVGPixel(-leftWidth - shoulder - 0.3, -0.02 * leftWidth - 0.04 * shoulder);
      const rightWallEnd = toCSVGPixel(rightWidth + shoulder + 0.3, -0.02 * rightWidth - 0.04 * shoulder);

      const bottomCenter = toCSVGPixel(0, -gDepth);
      const bottomLeft = toCSVGPixel(-leftWidth - shoulder + 0.5, -gDepth + 0.2);
      const bottomRight = toCSVGPixel(rightWidth + shoulder - 0.5, -gDepth + 0.2);

      const girderPointsStr = [
        ptLeftShoulder, ptLeftLane, ptCenter, ptRightLane, ptRightShoulder,
        rightWallEnd,
        bottomRight,
        bottomCenter,
        bottomLeft,
        leftWallEnd
      ].map(p => `${p.x},${p.y}`).join(' ');

      const pierTop = toCSVGPixel(0, -gDepth);
      const pierBottom = toCSVGPixel(0, groundDy);
      const pierWidth = sectionType === 'bridge' ? 1.6 : 1.2;

      if (sectionType === 'bridge') {
        bridgeStructureHtml = (
          <g>
            <polygon points={girderPointsStr} fill="#334155" stroke="#64748b" strokeWidth="1" />
            <rect x={ptLeftShoulder.x - 0.3 * csScale} y={ptLeftShoulder.y - 0.8 * csScale} width={0.3 * csScale} height={0.8 * csScale} fill="#475569" stroke="#64748b" strokeWidth="0.8" rx="1" />
            <rect x={ptRightShoulder.x} y={ptRightShoulder.y - 0.8 * csScale} width={0.3 * csScale} height={0.8 * csScale} fill="#475569" stroke="#64748b" strokeWidth="0.8" rx="1" />
            
            <rect x={pierTop.x - (pierWidth / 2) * csScale} y={pierTop.y} width={pierWidth * csScale} height={Math.max(10, pierBottom.y - pierTop.y)} fill="#475569" stroke="#94a3b8" strokeWidth="1" />
            <rect x={pierTop.x - (pierWidth * 0.8) * csScale} y={pierTop.y} width={pierWidth * 1.6 * csScale} height={0.4 * csScale} fill="#334155" stroke="#64748b" strokeWidth="0.8" />
          </g>
        );
      } else {
        const pierLeftX = toCSVGPixel(-leftWidth * 0.5, -gDepth);
        const pierRightX = toCSVGPixel(rightWidth * 0.5, -gDepth);

        bridgeStructureHtml = (
          <g>
            <polygon points={girderPointsStr} fill="#1e293b" stroke="#475569" strokeWidth="1" />
            <rect x={ptLeftShoulder.x - 0.3 * csScale} y={ptLeftShoulder.y - 0.8 * csScale} width={0.3 * csScale} height={0.8 * csScale} fill="#334155" stroke="#475569" strokeWidth="0.8" />
            <rect x={ptRightShoulder.x} y={ptRightShoulder.y - 0.8 * csScale} width={0.3 * csScale} height={0.8 * csScale} fill="#334155" stroke="#475569" strokeWidth="0.8" />
            
            <rect x={pierLeftX.x - (pierWidth / 2) * csScale} y={pierLeftX.y} width={pierWidth * csScale} height={Math.max(10, pierBottom.y - pierLeftX.y)} fill="#334155" stroke="#64748b" strokeWidth="1" />
            <rect x={pierRightX.x - (pierWidth / 2) * csScale} y={pierRightX.y} width={pierWidth * csScale} height={Math.max(10, pierBottom.y - pierRightX.y)} fill="#334155" stroke="#64748b" strokeWidth="1" />
            <rect x={ptGroundLeft.x + 5 * csScale} y={pierBottom.y} width={Math.max(20, ptGroundRight.x - ptGroundLeft.x - 10 * csScale)} height={0.8 * csScale} fill="#1e293b" stroke="#475569" strokeWidth="1" />
          </g>
        );
      }
    }

    const groundPathStr = `M ${ptGroundLeft.x},${ptGroundLeft.y} L ${ptGroundRight.x},${ptGroundRight.y}`;

    return {
      roadPathStr,
      leftSlopePathStr,
      rightSlopePathStr,
      groundPathStr,
      hatchPointsStr,
      isFill,
      heightDiffText: `${Math.abs(hDiff).toFixed(2)}m`,
      ptCenter,
      ptLeftShoulder,
      ptRightShoulder,
      pavePolygonPointsStr,
      basePolygonPointsStr,
      subgradePolygonPointsStr,
      leftStruct,
      rightStruct,
      leftStructurePolyStr,
      rightStructurePolyStr,
      leftWidth,
      rightWidth,
      shoulder,
      sectionType,
      bridgeStructureHtml
    };
  };

  const crossSectionSVG = useMemo(() => {
    if (!currentProfilePoint) return null;
    return generateCrossSectionData(selectedStationDist, currentProfilePoint.z, currentProfilePoint.groundZ);
  }, [currentProfilePoint, crossSection, selectedStationDist, sections]);

  const handleSlider = (key: keyof CrossSectionParams, val: number) => {
    onCrossSectionChange({
      ...crossSection,
      [key]: val
    });
  };

  // 縦断図の目盛り（X軸、Y軸）とグリッド（主グリッド・補助グリッド）
  const gridLines = useMemo(() => {
    const { minX, maxX, minY, maxY } = scaleBounds;
    const xMajorLines = [];
    const xMinorLines = [];
    const yMajorLines = [];
    const yMinorLines = [];

    // X軸の主・補助グリッドの決定
    // 主グリッドは 50m または 100m おき
    const xMajorStep = Math.ceil((maxX - minX) / 5 / 50) * 50 || 50;
    // 補助グリッドは 10m または 20m おき（主ステップを5分割）
    const xMinorStep = xMajorStep / 5;

    // X軸 補助グリッド (10m等間隔の細線)
    for (let x = minX; x <= maxX; x += xMinorStep) {
      // 主グリッドと重なる場合はスキップ
      if (Math.abs(x % xMajorStep) < 0.1) continue;
      const coords = getProfileCoords(x, minY);
      xMinorLines.push({ x: coords.x });
    }

    // X軸 主グリッド
    for (let x = minX; x <= maxX; x += xMajorStep) {
      const coords = getProfileCoords(x, minY);
      xMajorLines.push({ value: `${Math.round(x)}m`, x: coords.x });
    }

    // Y軸の主・補助グリッドの決定
    // 主グリッドは 10m おき
    const yMajorStep = 10;
    // 補助グリッドは 2m おき（10mおきの主グリッドを 5分割）
    const yMinorStep = 2;

    const startYMinor = Math.ceil(minY / yMinorStep) * yMinorStep;
    for (let y = startYMinor; y <= maxY; y += yMinorStep) {
      // 主グリッドと重なる場合はスキップ
      if (Math.abs(y % yMajorStep) < 0.1) continue;
      const coords = getProfileCoords(minX, y);
      yMinorLines.push({ y: coords.y });
    }

    const startYMajor = Math.ceil(minY / yMajorStep) * yMajorStep;
    for (let y = startYMajor; y <= maxY; y += yMajorStep) {
      const coords = getProfileCoords(minX, y);
      yMajorLines.push({ value: `${Math.round(y)}m`, y: coords.y });
    }

    return { 
      xMajorLines, 
      xMinorLines, 
      yMajorLines, 
      yMinorLines,
      xLines: xMajorLines, // 互換性維持用
      yLines: yMajorLines  // 互換性維持用
    };
  }, [scaleBounds, zoomX, zoomY, panX, panY]);

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2">
      
      {/* 平面図 (Map View) - 一括表示、または平面個別最大化時 */}
      {(layoutMode === 'triple' || layoutMode === 'map') && (
        <div className={`relative glass-panel rounded-xl overflow-hidden flex flex-col ${
          layoutMode === 'map' ? 'flex-1 min-h-[600px] h-full' : 'h-[340px] shrink-0'
        }`}>
          <div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display flex items-center gap-1.5">
              <MapIcon className="w-3.5 h-3.5 text-emerald-400" />
              平面アライメント設計マップ
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-mono hidden md:inline">
                等高線間隔: {contourInterval}m | BP・IP・EPをドラッグしてアライメントを動的制御
              </span>
              <button
                onClick={() => setLayoutMode(layoutMode === 'map' ? 'triple' : 'map')}
                className="px-2 py-0.5 rounded text-[9px] font-bold border border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1"
                title={layoutMode === 'map' ? "一括分割画面に戻る" : "平面図を最大化する"}
              >
                {layoutMode === 'map' ? <Minimize2 className="w-2.5 h-2.5 text-blue-400" /> : <Maximize2 className="w-2.5 h-2.5 text-blue-400" />}
                <span>{layoutMode === 'map' ? '縮小' : '最大化'}</span>
              </button>
            </div>
          </div>
          <div className="flex-1 relative min-h-0 bg-slate-950/20">
            <MapTab 
              points={points} 
              onPointsChange={onPointsChange} 
              alignment={alignment}
              stations={stations}
              stationInterval={stationInterval}
              setStationInterval={setStationInterval}
              selectedStationDist={selectedStationDist}
              setSelectedStationDist={setSelectedStationDist}
              contourInterval={contourInterval}
              setContourInterval={setContourInterval}
              performanceMode={performanceMode}
              roadNetwork={roadNetwork}
              activeAlignmentId={activeAlignmentId}
              onSwitchAlignment={onSwitchAlignment}
              onUpdateRoadMetadata={onUpdateRoadMetadata}
              onAddAlignment={onAddAlignment}
              onDeleteAlignment={onDeleteAlignment}
              coordinateZone={coordinateZone}
            />
          </div>
        </div>
      )}

      {/* 縦断図 (Profile View) */}
      {(layoutMode === 'triple' || layoutMode === 'profile') && (
        <div className="relative glass-panel rounded-xl overflow-hidden flex flex-col shrink-0">
        {/* AI 3大最適化プラン比較・選択制御パネル */}
        {optimizePlans && selectedPlanId && (
          <div className="absolute top-[42px] right-3 z-50 p-4 bg-slate-950/95 border border-violet-500/40 rounded-xl shadow-2xl backdrop-blur-md w-[400px] max-w-full text-[10px] animate-fade-in flex flex-col gap-3 text-slate-300 pointer-events-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
                <span className="font-bold text-slate-100 text-[11px] tracking-wide">AI 縦断勾配 3大最適化プラン提案</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-[8px] font-bold border border-violet-500/30">
                設計プレビュー中
              </span>
            </div>

            <p className="text-[9px] text-slate-400 leading-relaxed -mt-1">
              ※ 下記の提案プランをクリックすると、すべての図面・横断計算・3D形状が即座に連動して仮更新（プレビュー）されます。
            </p>

            <div className="flex flex-col gap-2 max-h-[190px] overflow-y-auto pr-1">
              {optimizePlans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-violet-950/20 border-violet-500/70 shadow-lg shadow-violet-500/10'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-violet-400 bg-violet-500/30' : 'border-slate-500'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-violet-300" />}
                        </div>
                        <span className={`font-bold text-[10.5px] ${isSelected ? 'text-violet-300' : 'text-slate-200'}`}>
                          {plan.name}
                        </span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${plan.badgeColor}`}>
                        {plan.badge}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 bg-black/40 p-1.5 rounded border border-white/5 font-mono text-[9px] text-slate-400">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-500">総土工量 (C+F)</span>
                        <span className={`font-bold ${isSelected ? 'text-slate-100' : 'text-slate-300'}`}>
                          {plan.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³
                        </span>
                      </div>
                      <div className="flex flex-col border-l border-white/5 pl-1.5">
                        <span className="text-[8px] text-slate-500">不均衡バランス</span>
                        <span className={`font-bold ${plan.imbalance < 15 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {plan.imbalance.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³
                        </span>
                      </div>
                      <div className="flex flex-col border-l border-white/5 pl-1.5">
                        <span className="text-[8px] text-slate-500">総土工削減率</span>
                        <span className="font-extrabold text-emerald-400">
                          {plan.percentSaved > 0 ? `-${plan.percentSaved}% 📉` : 'バランス改善'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 選択プランの詳細な解説 */}
            {(() => {
              const activePlan = optimizePlans.find(p => p.id === selectedPlanId);
              if (!activePlan) return null;
              return (
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-white/5 flex flex-col gap-1">
                  <div className="font-bold text-slate-200 text-[9px] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                    <span>プラン設計方針 & メリット</span>
                  </div>
                  <p className="text-[8.5px] text-slate-400 leading-relaxed">
                    {activePlan.description}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-1 pt-1.5 border-t border-white/5 font-mono text-[8.5px] text-slate-400">
                    <div>切土量 (掘削): <span className="font-bold text-slate-200">{activePlan.cutVolume.toLocaleString(undefined, {maximumFractionDigits:1})} m³</span></div>
                    <div>盛土量 (造成): <span className="font-bold text-slate-200">{activePlan.fillVolume.toLocaleString(undefined, {maximumFractionDigits:1})} m³</span></div>
                  </div>
                </div>
              );
            })()}

            {/* 確定 or キャンセルボタン */}
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
              <button
                onClick={handleCancelOptimization}
                className="py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/15 hover:border-white/25 rounded font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm active:scale-95"
              >
                <RefreshCw className="w-3 h-3 text-slate-400" />
                キャンセル (元に戻す)
              </button>
              <button
                onClick={handleApplyPlan}
                className="py-1.5 bg-violet-600 hover:bg-violet-500 text-white border border-violet-500/40 rounded font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm shadow-violet-500/20 active:scale-95"
              >
                <Check className="w-3 h-3 text-violet-200" />
                この勾配案を適用して確定
              </button>
            </div>
          </div>
        )}

        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">
              縦断図 (Profile View): STA 0+000 - EP
            </span>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* 測点間隔（ピッチ）切り替え */}
            <div className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded border border-white/5 text-[10px]">
              <span className="text-slate-400 text-[9px] mr-1">ピッチ:</span>
              <button
                onClick={() => setStationInterval(20)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  stationInterval === 20 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                20m
              </button>
              <button
                onClick={() => setStationInterval(100)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  stationInterval === 100 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                100m
              </button>
            </div>

            {/* 地形プロファイル（陰影）オーバーレイのON/OFFトグル */}
            <button
              onClick={() => setShowTerrainProfile(!showTerrainProfile)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                showTerrainProfile 
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/30' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5 bg-slate-900/40'
              }`}
              title="現況地形のプロファイル（陰影オーバーレイ）表示を切り替えます"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showTerrainProfile ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></div>
              <span>地形プロファイル: {showTerrainProfile ? 'ON' : 'OFF'}</span>
            </button>

            {/* 切盛高表示線のON/OFFトグル */}
            <button
              onClick={() => setShowCutFillLines(!showCutFillLines)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                showCutFillLines 
                  ? 'bg-rose-950/40 border-rose-500/30 text-rose-400 hover:bg-rose-900/30' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5 bg-slate-900/40'
              }`}
              title="計画高と現況地盤高の差分（切盛高）を垂直な表示線として視覚化します"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showCutFillLines ? 'bg-rose-400 animate-pulse' : 'bg-slate-600'}`}></div>
              <span>切盛高表示線: {showCutFillLines ? 'ON' : 'OFF'}</span>
            </button>

            {/* 方眼グリッドON/OFFトグル */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                showGrid 
                  ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400 hover:bg-indigo-900/30' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5 bg-slate-900/40'
              }`}
              title="計画高や地盤高が読み取りやすいよう、垂直および水平方向の精密方眼グリッド線（方眼レイヤー）の表示を切り替えます"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showGrid ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`}></div>
              <span>方眼グリッド: {showGrid ? 'ON' : 'OFF'}</span>
            </button>

            {/* 縦断図の高さトグル */}
            <button
              onClick={() => setIsHeightExpanded(!isHeightExpanded)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                isHeightExpanded 
                  ? 'bg-blue-950/40 border-blue-500/30 text-blue-400 hover:bg-blue-900/30' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5 bg-slate-900/40'
              }`}
              title="縦断図の高さを拡大/縮小します（全体を確認しやすくなります）"
            >
              <ChevronsUpDown className="w-2.5 h-2.5" />
              <span>表示高さ: {isHeightExpanded ? '拡大' : '標準'} ({profileHeight}px)</span>
            </button>

            {/* 横断面表示 ON/OFF トグル */}
            <button
              onClick={() => setShowCrossSectionArea(!showCrossSectionArea)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                showCrossSectionArea 
                  ? 'bg-amber-950/40 border-amber-500/30 text-amber-400 hover:bg-amber-900/30' 
                  : 'border-white/10 text-slate-400 hover:bg-white/5 bg-slate-900/40'
              }`}
              title="下部の横断面図や設計スライダー・詳細数値エリア全体の表示・非表示を切り替えます"
            >
              {showCrossSectionArea ? (
                <>
                  <Eye className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                  <span>横断面エリア: 表示中</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-2.5 h-2.5 text-slate-400" />
                  <span>横断面エリア: 非表示</span>
                </>
              )}
            </button>

            {/* AI計画高自動最適化（切盛土量最小化）ボタン */}
            <button
              onClick={handleOptimizeProfile}
              disabled={isOptimizing}
              className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-md border ${
                isOptimizing
                  ? 'bg-violet-950/40 border-violet-500/30 text-violet-400 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-500 active:scale-95 text-white border-violet-500/50 hover:shadow-violet-500/20'
              }`}
              title="現在の道路パラメータ・横断幅をベースに、切土量と盛土量の不均衡および総和を最小化するよう各縦断IPの計画高(Z)をAIが全自動で最適提案します。"
            >
              <Sparkles className={`w-3 h-3 ${isOptimizing ? 'animate-spin text-violet-400' : 'text-violet-200 animate-pulse'}`} />
              <span>{isOptimizing ? '最適勾配を計算中...' : 'AI計画高最適化 (切盛最小)'}</span>
            </button>

            {/* 測点ドロップダウンセレクト */}
            <div className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded border border-white/5 text-[10px]">
              <span className="text-slate-400 text-[9px] mr-1">選択測点:</span>
              <select
                value={selectedStationDist}
                onChange={(e) => setSelectedStationDist(parseFloat(e.target.value))}
                className="bg-transparent text-white font-mono text-[10px] focus:outline-none border-none cursor-pointer"
              >
                {stations.map(s => (
                  <option key={s.name} value={s.distance} className="bg-slate-950 text-white">
                    {s.name} ({s.distance.toFixed(1)}m)
                  </option>
                ))}
              </select>
            </div>

            {/* ズーム＆パンリセットボタン */}
            {(zoomX !== 1 || zoomY !== 1 || panX !== 0 || panY !== 0) && (
              <button
                onClick={() => {
                  setZoomX(1);
                  setZoomY(1);
                  setPanX(0);
                  setPanY(0);
                }}
                className="px-2 py-0.5 rounded text-[9px] font-bold border border-blue-500/30 bg-blue-950/40 text-blue-400 hover:bg-blue-900/30 transition-colors cursor-pointer flex items-center gap-1"
                title="縦断面図のズーム・パン（ホイールズーム/ドラッグ移動）を初期表示にリセットします"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>表示リセット</span>
              </button>
            )}

            {/* 縦断図最大化 / 縮小化トグルボタン */}
            <button
              onClick={() => setLayoutMode(layoutMode === 'profile' ? 'triple' : 'profile')}
              className="px-2 py-0.5 rounded text-[9px] font-bold border border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1"
              title={layoutMode === 'profile' ? "一括分割画面に戻る" : "縦断面図を最大化する"}
            >
              {layoutMode === 'profile' ? <Minimize2 className="w-2.5 h-2.5 text-blue-400" /> : <Maximize2 className="w-2.5 h-2.5 text-blue-400" />}
              <span>{layoutMode === 'profile' ? '縮小' : '最大化'}</span>
            </button>

            <div className="flex gap-3 text-[9px]">
              <span className="flex items-center gap-1 font-bold text-slate-400">
                <div className="w-2.5 h-2.5 bg-red-500/20 border border-red-500/40 rounded"></div> 
                盛土
              </span>
              <span className="flex items-center gap-1 font-bold text-slate-400">
                <div className="w-2.5 h-2.5 bg-blue-500/20 border border-blue-500/40 rounded"></div> 
                切土
              </span>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-slate-950/40 flex items-center justify-center">
          <svg 
            className={`w-full max-w-4xl h-auto touch-none select-none ${isPanning ? 'cursor-grabbing' : draggingCpId ? 'cursor-ns-resize' : 'cursor-grab'}`}
            viewBox={`0 0 ${profileWidth} ${profileHeight}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
          >
            {/* バックグラウンドグリッド & 地形グラデーション */}
            <defs>
              <pattern id="profileGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
              </pattern>
              <linearGradient id="terrainOverlayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(100, 116, 139, 0.22)" />
                <stop offset="100%" stopColor="rgba(15, 23, 42, 0.0)" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#profileGrid)" />

            {/* 現況地形プロファイル陰影 (オーバーレイ) */}
            {showTerrainProfile && paths.terrainPoints && (
              <polygon points={paths.terrainPoints} fill="url(#terrainOverlayGrad)" stroke="none" />
            )}

            {/* 精密方眼グリッド線 (方眼レイヤー) */}
            {showGrid && (
              <g id="precision-grid-layer">
                {/* 1. 補助グリッド (薄い点線) */}
                {/* 垂直方向の補助線 (X Minor Lines) */}
                {gridLines.xMinorLines.map((line, idx) => (
                  <line 
                    key={`grid-x-minor-${idx}`}
                    x1={line.x} 
                    y1={padding.top} 
                    x2={line.x} 
                    y2={chartHeight - padding.bottom} 
                    stroke="rgba(255,255,255,0.03)" 
                    strokeWidth="0.8" 
                    strokeDasharray="1 3"
                  />
                ))}

                {/* 水平方向の補助線 (Y Minor Lines) */}
                {gridLines.yMinorLines.map((line, idx) => (
                  <line 
                    key={`grid-y-minor-${idx}`}
                    x1={padding.left} 
                    y1={line.y} 
                    x2={profileWidth - padding.right} 
                    y2={line.y} 
                    stroke="rgba(255,255,255,0.03)" 
                    strokeWidth="0.8" 
                    strokeDasharray="1 3"
                  />
                ))}

                {/* 2. 主グリッド (はっきりした実線) */}
                {/* 垂直方向の主線 (X Major Lines) */}
                {gridLines.xMajorLines.map((line, idx) => (
                  <line 
                    key={`grid-x-major-${idx}`}
                    x1={line.x} 
                    y1={padding.top} 
                    x2={line.x} 
                    y2={chartHeight - padding.bottom} 
                    stroke="rgba(255,255,255,0.12)" 
                    strokeWidth="1" 
                  />
                ))}

                {/* 水平方向の主線 (Y Major Lines) */}
                {gridLines.yMajorLines.map((line, idx) => (
                  <line 
                    key={`grid-y-major-${idx}`}
                    x1={padding.left} 
                    y1={line.y} 
                    x2={profileWidth - padding.right} 
                    y2={line.y} 
                    stroke="rgba(255,255,255,0.12)" 
                    strokeWidth="1" 
                  />
                ))}
              </g>
            )}

            {/* X軸 目盛りラベル */}
            {gridLines.xMajorLines.map((line, idx) => (
              <text 
                key={`x-label-${idx}`}
                x={line.x} 
                y={chartHeight - padding.bottom + 15} 
                fill="rgba(255,255,255,0.4)" 
                fontSize="9" 
                fontFamily="monospace" 
                textAnchor="middle"
              >
                {line.value}
              </text>
            ))}

            {/* Y軸 目盛りラベル */}
            {gridLines.yMajorLines.map((line, idx) => (
              <text 
                key={`y-label-${idx}`}
                x={padding.left - 10} 
                y={line.y + 3} 
                fill="rgba(255,255,255,0.4)" 
                fontSize="9" 
                fontFamily="monospace" 
                textAnchor="end"
              >
                {line.value}
              </text>
            ))}

            {/* 盛土ハッチング（赤） */}
            {paths.fillPolygons.map((poly, idx) => (
              <polygon key={`fill-${idx}`} points={poly} fill="rgba(239, 68, 68, 0.18)" stroke="none" />
            ))}

            {/* 切土ハッチング（青） */}
            {paths.cutPolygons.map((poly, idx) => (
              <polygon key={`cut-${idx}`} points={poly} fill="rgba(59, 130, 246, 0.18)" stroke="none" />
            ))}

            {/* 地盤高ライン (点線) */}
            <path d={paths.groundPath} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />

            {/* 切盛高表示線 (動的に描画) */}
            {showCutFillLines && alignment.filter((_, idx) => idx % 2 === 0).map((p, idx) => {
              const dCoords = getProfileCoords(p.distance, p.z);
              const gCoords = getProfileCoords(p.distance, p.groundZ);
              const hDiff = p.z - p.groundZ;
              const color = hDiff >= 0 ? 'rgba(239, 68, 68, 0.55)' : 'rgba(59, 130, 246, 0.55)';
              return (
                <line
                  key={`cutfill-line-${idx}`}
                  x1={dCoords.x}
                  y1={dCoords.y}
                  x2={gCoords.x}
                  y2={gCoords.y}
                  stroke={color}
                  strokeWidth="1.2"
                />
              );
            })}

            {/* 計画高アライメントライン (太実線) - 直線区間と縦断曲線(放物線)区間を美しく色分け */}
            {paths.designSegments.map((seg, idx) => (
              <path
                key={`design-segment-${idx}`}
                d={seg.path}
                fill="none"
                stroke={seg.isVerticalCurve ? '#ec4899' : '#3b82f6'} // 縦断放物線は鮮やかなピンクマゼンタ、直線はシアンブルー
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all"
              />
            ))}

            {/* 計画高線形の凡例 (直線 vs 縦断曲線) */}
            <g id="profile-legend" transform={`translate(${padding.left + 15}, ${padding.top + 10})`}>
              <rect x="0" y="0" width="220" height="20" rx="4" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
              {/* 直線区間 */}
              <line x1="10" y1="10" x2="24" y2="10" stroke="#3b82f6" strokeWidth="2.8" strokeLinecap="round" />
              <text x="29" y="13" fill="rgba(255, 255, 255, 0.8)" fontSize="8.5" fontFamily="sans-serif">計画高 直線区間</text>

              {/* 縦断曲線 */}
              <line x1="112" y1="10" x2="126" y2="10" stroke="#ec4899" strokeWidth="2.8" strokeLinecap="round" />
              <text x="131" y="13" fill="rgba(255, 255, 255, 0.8)" fontSize="8.5" fontFamily="sans-serif">縦断曲線 (VCL放物線)</text>
            </g>

            {/* 各道路測点 (Guide and Click targets) */}
            {stations.map((s, idx) => {
              const coordsBottom = getProfileCoords(s.distance, scaleBounds.minY);
              const coordsDesign = getProfileCoords(s.distance, s.z);
              const isSelected = Math.abs(s.distance - selectedStationDist) < 0.1;

              return (
                <g 
                  key={`station-line-${idx}`}
                  className="cursor-pointer group"
                  onClick={() => setSelectedStationDist(s.distance)}
                >
                  {/* 測点垂直ライン */}
                  <line
                    x1={coordsBottom.x}
                    y1={padding.top}
                    x2={coordsBottom.x}
                    y2={chartHeight - padding.bottom}
                    stroke={isSelected ? '#eab308' : 'rgba(255,255,255,0.07)'}
                    strokeWidth={isSelected ? '1.8' : '1'}
                    strokeDasharray={isSelected ? 'none' : '3 2'}
                  />

                  {/* 測点と計画アライメント交点 */}
                  <circle
                    cx={coordsBottom.x}
                    cy={coordsDesign.y}
                    r={isSelected ? '4.5' : '2.5'}
                    fill={isSelected ? '#eab308' : 'rgba(255, 255, 255, 0.45)'}
                    stroke="#020617"
                    strokeWidth="1"
                  />

                  {/* 測点ラベル (斜め書き・ミニサイズで美しく) */}
                  <text
                    x={coordsBottom.x}
                    y={chartHeight - padding.bottom + 12}
                    fill={isSelected ? '#eab308' : 'rgba(255,255,255,0.35)'}
                    fontSize="7"
                    fontFamily="monospace"
                    textAnchor="middle"
                    className="font-bold select-none group-hover:fill-white"
                  >
                    {s.name}
                  </text>

                  {/* クリック補助用透明 rect */}
                  <rect
                    x={coordsBottom.x - 10}
                    y={padding.top}
                    width="20"
                    height={chartHeight - padding.top - padding.bottom + 15}
                    fill="transparent"
                  />
                </g>
              );
            })}

            {/* 現在選択中のStationを示す垂直インジケータ */}
            {alignment.length > 0 && (() => {
              const currentX = currentProfilePoint ? currentProfilePoint.distance : 0;
              const screenPos = getProfileCoords(currentX, scaleBounds.minY);
              const designPos = getProfileCoords(currentX, currentProfilePoint?.z || 0);
              const groundPos = getProfileCoords(currentX, currentProfilePoint?.groundZ || 0);
              const hDiff = (currentProfilePoint?.z || 0) - (currentProfilePoint?.groundZ || 0);
              
              // 吹き出し（吹き出しオーバーレイ）の左右配置を切り替える
              const tooltipOnRight = screenPos.x < profileWidth - 140;
              const tooltipX = tooltipOnRight ? screenPos.x + 12 : screenPos.x - 132;
              const tooltipY = Math.min(designPos.y, groundPos.y) - 15;

              return (
                <g>
                  {/* 起点から終点までの垂直スライス線 */}
                  <line 
                    x1={screenPos.x} 
                    y1={padding.top} 
                    x2={screenPos.x} 
                    y2={chartHeight - padding.bottom} 
                    stroke="#10b981" 
                    strokeWidth="1.5" 
                    strokeDasharray="4 2" 
                  />
                  
                  {/* 設計高と地盤高の差を示すバー (現在の設計データと対比可能なライン) */}
                  <line 
                    x1={screenPos.x} 
                    y1={designPos.y} 
                    x2={screenPos.x} 
                    y2={groundPos.y} 
                    stroke={hDiff >= 0 ? '#ef4444' : '#3b82f6'} 
                    strokeWidth="2.5" 
                  />

                  {/* 現在の地盤高プロット (現況地盤高オーバーレイ点) */}
                  <circle 
                    cx={screenPos.x} 
                    cy={groundPos.y} 
                    r="4" 
                    fill="#64748b" 
                    stroke="#ffffff" 
                    strokeWidth="1.2"
                  />

                  {/* 現在の計画高プロット */}
                  <circle 
                    cx={screenPos.x} 
                    cy={designPos.y} 
                    r="5.5" 
                    fill="#10b981" 
                    stroke="#ffffff" 
                    strokeWidth="1.5"
                  />

                  {/* 对比用数値表示ポップアップ吹き出し */}
                  {currentProfilePoint && (
                    <g transform={`translate(${tooltipX}, ${Math.max(10, Math.min(chartHeight - 75, tooltipY))})`}>
                      {/* 背景カード */}
                      <rect 
                        width="120" 
                        height="48" 
                        rx="4" 
                        fill="rgba(15, 23, 42, 0.95)" 
                        stroke="rgba(255,255,255,0.15)" 
                        strokeWidth="1" 
                      />
                      {/* 横ライン */}
                      <line x1="5" y1="16" x2="115" y2="16" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                      
                      {/* 計画高 */}
                      <text x="8" y="11" fill="#10b981" fontSize="8" fontWeight="bold" fontFamily="monospace">
                        計画: {currentProfilePoint.z.toFixed(2)}m
                      </text>
                      
                      {/* 地盤高 */}
                      <text x="8" y="27" fill="#94a3b8" fontSize="8" fontWeight="bold" fontFamily="monospace">
                        地盤: {currentProfilePoint.groundZ.toFixed(2)}m
                      </text>
                      
                      {/* 高低差 */}
                      <text x="8" y="39" fill={hDiff >= 0 ? '#f87171' : '#60a5fa'} fontSize="8" fontWeight="bold" fontFamily="monospace">
                        差: {hDiff >= 0 ? '盛土' : '切土'} {Math.abs(hDiff).toFixed(2)}m
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}

            {/* コントロールポイント (BP, IP, EP) 縦断計画高設定ドラッグハンドル */}
            {points.map((p, idx) => {
              const cpDist = cpDistances.find(d => d.id === p.id);
              if (!cpDist) return null;
              
              const coords = getProfileCoords(cpDist.distance, p.z);
              const isDragging = draggingCpId === p.id;
              
              return (
                <g key={`vpi-drag-${p.id}`} className="group select-none">
                  {/* ドラッグ中の垂直ガイド線 */}
                  {isDragging && (
                    <line
                      x1={coords.x}
                      y1={padding.top}
                      x2={coords.x}
                      y2={chartHeight - padding.bottom}
                      stroke="rgba(245, 158, 11, 0.4)"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                  )}
                  {/* ホバー時の補助用薄丸 */}
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r={isDragging ? "12" : "10"}
                    fill={p.id === 'BP' ? 'rgba(16, 185, 129, 0.15)' : p.id === 'EP' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)'}
                    className="transition-all duration-150 group-hover:scale-125 cursor-ns-resize"
                  />
                  {/* 実体コア丸 */}
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r={isDragging ? "7" : "5.5"}
                    fill={p.id === 'BP' ? '#10b981' : p.id === 'EP' ? '#ef4444' : '#3b82f6'}
                    stroke="#ffffff"
                    strokeWidth={isDragging ? "2" : "1.5"}
                    onPointerDown={(e) => handleCPDragStart(p.id, e)}
                    className="cursor-ns-resize transition-transform duration-150 active:scale-110"
                  >
                    <title>{`${p.name}: ドラッグして計画高(Z)を変更します (現在: ${p.z.toFixed(1)}m)`}</title>
                  </circle>
                  {/* コントロールポイント名ラベル */}
                  <text
                    x={coords.x}
                    y={coords.y - 12}
                    fill={p.id === 'BP' ? '#10b981' : p.id === 'EP' ? '#ef4444' : '#60a5fa'}
                    fontSize="9"
                    fontWeight="extrabold"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    className="pointer-events-none select-none bg-slate-950 p-0.5 rounded shadow-sm opacity-80 group-hover:opacity-100 transition-opacity"
                  >
                    {p.id === 'BP' ? 'BP' : p.id === 'EP' ? 'EP' : `IP.${idx}`}
                  </text>
                  <text
                    x={coords.x}
                    y={coords.y + 18}
                    fill="#ffffff"
                    fontSize="8"
                    fontFamily="monospace"
                    textAnchor="middle"
                    className="pointer-events-none select-none opacity-60 group-hover:opacity-90 transition-opacity"
                  >
                    {p.z.toFixed(1)}m
                  </text>
                </g>
              );
            })}

            {/* ==================== SVG 一体型「縦断諸元帯」 ==================== */}
            <g id="profile-band-group" transform={`translate(0, ${chartHeight})`}>
              {/* 外枠 */}
              <rect 
                x="0" 
                y="0" 
                width={profileWidth} 
                height={bandHeight} 
                fill="rgba(15, 23, 42, 0.9)" 
                stroke="rgba(255, 255, 255, 0.12)" 
                strokeWidth="1.5" 
              />

              {/* 左端境界縦線 */}
              <line 
                x1={padding.left} 
                y1="0" 
                x2={padding.left} 
                y2={bandHeight} 
                stroke="rgba(255, 255, 255, 0.25)" 
                strokeWidth="1.5" 
              />

              {/* 行のタイトル・境界線 */}
              {(() => {
                const rowsDef = [
                  { id: 'slope', label: '勾配 (%)', height: 25 },
                  { id: 'diff', label: '切盛高 (m)', height: 25 },
                  { id: 'planZ', label: '計画高 (m)', height: 25 },
                  { id: 'groundZ', label: '地盤高 (m)', height: 25 },
                  { id: 'cumDist', label: '追加距離 (m)', height: 25 },
                  { id: 'intDist', label: '単距離 (m)', height: 25 },
                  { id: 'station', label: '測点 (No.)', height: 25 },
                  { id: 'intervalCost', label: '区間工事費 (万円)', height: 25 },
                  { id: 'cumulativeCost', label: '累計工事費 (億円)', height: 25 },
                  { id: 'curvature', label: '平面曲率図', height: 45 },
                ];

                let currentY = 0;
                return rowsDef.map((row, rIdx) => {
                  const rowY = currentY;
                  currentY += row.height;

                  return (
                    <g key={`band-title-row-${row.id}`}>
                      {rIdx > 0 && (
                        <line 
                          x1="0" 
                          y1={rowY} 
                          x2={profileWidth} 
                          y2={rowY} 
                          stroke="rgba(255, 255, 255, 0.12)" 
                          strokeWidth="1" 
                        />
                      )}
                      <text 
                        x={padding.left - 8} 
                        y={rowY + row.height / 2 + 3} 
                        fill="rgba(255, 255, 255, 0.6)" 
                        fontSize="8" 
                        fontWeight="bold" 
                        textAnchor="end"
                        fontFamily="sans-serif"
                      >
                        {row.label}
                      </text>
                    </g>
                  );
                });
              })()}

              {/* 各セルのデータ描画 */}
              {profileStationRows.map((row, idx) => {
                const x = getProfileCoords(row.stationDist, 0).x;
                if (x < padding.left - 0.5 || x > profileWidth - padding.right + 0.5) return null;

                const isSelected = Math.abs(row.stationDist - selectedStationDist) < 0.1;

                const ySlope = 0;
                const yDiff = 25;
                const yPlanZ = 50;
                const yGroundZ = 75;
                const yCumDist = 100;
                const yIntDist = 125;
                const yStation = 150;
                const yIntervalCost = 175;
                const yCumulativeCost = 200;
                const yCurvature = 225;

                const curvatureCenterY = yCurvature + 22.5;

                return (
                  <g 
                    key={`band-data-col-${idx}`} 
                    className="cursor-pointer group"
                    onClick={() => setSelectedStationDist(row.stationDist)}
                  >
                    {/* 縦の区切り線 */}
                    <line 
                      x1={x} 
                      y1="0" 
                      x2={x} 
                      y2={bandHeight} 
                      stroke={isSelected ? '#eab308' : 'rgba(255, 255, 255, 0.08)'} 
                      strokeWidth={isSelected ? '1.5' : '0.8'} 
                      strokeDasharray={row.stationDist === 0 || Math.abs(row.stationDist - (engineeringData.totalLength || 0)) < 0.1 ? 'none' : '2 1'}
                    />

                    {/* 1. 勾配 */}
                    <text 
                      x={x} 
                      y={ySlope + 15} 
                      fill="#38bdf8" 
                      fontSize="7.5" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                    >
                      {row.slope.toFixed(1)}%
                    </text>

                    {/* 2. 切盛高 */}
                    <text 
                      x={x} 
                      y={yDiff + 15} 
                      fill={row.diffZ >= 0 ? '#f87171' : '#60a5fa'} 
                      fontSize="7.5" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {row.diffZ >= 0 ? `+${row.diffZ.toFixed(2)}` : row.diffZ.toFixed(2)}
                    </text>

                    {/* 3. 計画高 */}
                    <text 
                      x={x} 
                      y={yPlanZ + 15} 
                      fill="#34d399" 
                      fontSize="7.5" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                    >
                      {row.plannedZ.toFixed(2)}
                    </text>

                    {/* 4. 地盤高 */}
                    <text 
                      x={x} 
                      y={yGroundZ + 15} 
                      fill="#94a3b8" 
                      fontSize="7.5" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                    >
                      {row.groundZ.toFixed(2)}
                    </text>

                    {/* 5. 追加距離 */}
                    <text 
                      x={x} 
                      y={yCumDist + 15} 
                      fill="#e2e8f0" 
                      fontSize="7.5" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                    >
                      {row.stationDist.toFixed(1)}
                    </text>

                    {/* 6. 単距離 */}
                    <text 
                      x={x} 
                      y={yIntDist + 15} 
                      fill="#94a3b8" 
                      fontSize="7.5" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                    >
                      {row.intervalDist.toFixed(1)}
                    </text>

                    {/* 7. 測点名 */}
                    <text 
                      x={x} 
                      y={yStation + 15} 
                      fill={isSelected ? '#eab308' : 'rgba(255, 255, 255, 0.7)'} 
                      fontSize="7.5" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {row.stationName.split(' ')[0]}
                    </text>

                    {/* 8. 区間工事費 (万円) */}
                    <text 
                      x={x} 
                      y={yIntervalCost + 15} 
                      fill="#fb923c" 
                      fontSize="7" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                    >
                      {row.intervalCostYen ? row.intervalCostYen.toLocaleString() : '0'}
                    </text>

                    {/* 9. 累計工事費 (億円) */}
                    <text 
                      x={x} 
                      y={yCumulativeCost + 15} 
                      fill="#f43f5e" 
                      fontSize="7" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {row.cumulativeCostYen ? (row.cumulativeCostYen / 10000).toFixed(3) : '0.000'}
                    </text>

                    {/* 8. 平面曲率図 */}
                    {(() => {
                      const nextRow = profileStationRows[idx + 1];
                      if (!nextRow) return null;
                      const nextX = getProfileCoords(nextRow.stationDist, 0).x;
                      if (nextX <= x) return null;

                      const width = nextX - x;
                      const type = row.curvature.type;
                      const r = row.curvature.r;

                      if (type === 'curve-left') {
                        return (
                          <g>
                            <rect 
                              x={x} 
                              y={curvatureCenterY - 14} 
                              width={width} 
                              height="14" 
                              fill="rgba(59, 130, 246, 0.25)" 
                              stroke="rgba(59, 130, 246, 0.6)" 
                              strokeWidth="1" 
                            />
                            <text 
                              x={x + width / 2} 
                              y={curvatureCenterY - 18} 
                              fill="#60a5fa" 
                              fontSize="7" 
                              fontFamily="monospace" 
                              textAnchor="middle"
                            >
                              L (R={r})
                            </text>
                          </g>
                        );
                      } else if (type === 'curve-right') {
                        return (
                          <g>
                            <rect 
                              x={x} 
                              y={curvatureCenterY} 
                              width={width} 
                              height="14" 
                              fill="rgba(239, 68, 68, 0.25)" 
                              stroke="rgba(239, 68, 68, 0.6)" 
                              strokeWidth="1" 
                            />
                            <text 
                              x={x + width / 2} 
                              y={curvatureCenterY + 24} 
                              fill="#f87171" 
                              fontSize="7" 
                              fontFamily="monospace" 
                              textAnchor="middle"
                            >
                              R (R={r})
                            </text>
                          </g>
                        );
                      } else {
                        return (
                          <line 
                            x1={x} 
                            y1={curvatureCenterY} 
                            x2={nextX} 
                            y2={curvatureCenterY} 
                            stroke="rgba(255, 255, 255, 0.3)" 
                            strokeWidth="1.5" 
                          />
                        );
                      }
                    })()}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* トンネル自動検出＆一括切り替えパネル */}
          <div className="bg-slate-900/60 border border-white/10 rounded-lg p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mt-4 mb-2 animate-fade-in">
            <div>
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-display">
                <span className="text-cyan-400">🚇</span> トンネル標準断面・自動切り替え
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                計画高と現況地形高を自動比較し、切土深さ 8m 以上の区間を自動でトンネル（のり面無効化）に一括切り替えします。
              </div>
            </div>
            <button
              onClick={handleAutoTunnelDetect}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-[10px] rounded transition-all cursor-pointer flex items-center gap-1.5 shadow"
              title="計画アライメントと地形の深さを全スキャンして、切土8m以上の土工区間をトンネルへ自動置換します"
            >
              <Sparkles className="w-3.5 h-3.5" />
              自動切り替えを実行
            </button>
          </div>

          {/* 断面区間セグメントのタイムラインバー */}
          <div className="relative h-10 bg-slate-950 border border-white/5 rounded-lg overflow-hidden flex select-none mt-2">
            {sections.map((sec, idx) => {
              const leftPct = (sec.startDist / (engineeringData.totalLength || 100)) * 100;
              const widthPct = ((sec.endDist - sec.startDist) / (engineeringData.totalLength || 100)) * 100;

              const bgClass = 
                sec.type === 'bridge' 
                  ? 'bg-amber-600/25 hover:bg-amber-600/35 border-amber-500/30 text-amber-300' 
                  : sec.type === 'viaduct' 
                    ? 'bg-indigo-600/25 hover:bg-indigo-600/35 border-indigo-500/30 text-indigo-300' 
                    : sec.type === 'tunnel'
                      ? 'bg-cyan-600/25 hover:bg-cyan-600/35 border-cyan-500/30 text-cyan-300'
                      : 'bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/20 text-emerald-300';

              const label = 
                sec.type === 'bridge' 
                  ? '🌉 橋梁部 (Bridge)' 
                  : sec.type === 'viaduct' 
                    ? '🏢 高架橋 (Viaduct)' 
                    : sec.type === 'tunnel'
                      ? '🚇 トンネル (Tunnel)'
                      : '🚜 標準土工 (Earthwork)';

              const isCurrent = selectedStationDist >= sec.startDist && selectedStationDist <= sec.endDist;

              return (
                <div
                  key={`timeline-sec-${sec.id}-${idx}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  onClick={() => {
                    // 区間の中央位置にジャンプ
                    const mid = (sec.startDist + sec.endDist) / 2;
                    setSelectedStationDist(mid);
                  }}
                  className={`absolute top-0 bottom-0 border-r last:border-r-0 transition-all cursor-pointer flex flex-col justify-center px-2 select-none ${bgClass} ${
                    isCurrent ? 'ring-1 ring-inset ring-cyan-400 font-bold' : ''
                  }`}
                >
                  <span className="text-[9px] truncate tracking-wide">
                    {label}
                  </span>
                  <span className="text-[8px] opacity-75 font-mono truncate">
                    {sec.startDist.toFixed(0)}m - {sec.endDist.toFixed(0)}m
                  </span>
                </div>
              );
            })}

            {/* 現在の selectedStationDist インジケーター針 */}
            <div 
              style={{ left: `${(selectedStationDist / (engineeringData.totalLength || 100)) * 100}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 pointer-events-none shadow-[0_0_8px_rgba(34,211,238,0.8)] z-10"
            >
              <div className="absolute top-0 -translate-x-1/2 w-2 h-2 bg-cyan-400 rotate-45 rounded-sm"></div>
            </div>
          </div>

          {/* アクティブ区間の属性詳細編集ボード */}
          {(() => {
            const activeSecIdx = sections.findIndex(s => selectedStationDist >= s.startDist && selectedStationDist <= s.endDist);
            if (activeSecIdx === -1) return null;
            const activeSec = sections[activeSecIdx];

            return (
              <div className="bg-slate-950/40 border border-white/5 rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-4 items-center animate-fade-in">
                {/* 1. タイプ切り替えスイッチ */}
                <div className="space-y-1.5">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    区間道路横断タイプ (Section Type)
                  </div>
                  <div className="flex rounded-md bg-slate-900 p-0.5 border border-white/5">
                    {(['earthwork', 'bridge', 'viaduct', 'tunnel'] as const).map(t => (
                      <button
                        key={`tab-type-${t}`}
                        onClick={() => handleUpdateSectionType(activeSecIdx, t)}
                        className={`flex-1 py-1 rounded text-[9px] font-bold capitalize transition-all cursor-pointer ${
                          activeSec.type === t 
                            ? 'bg-slate-800 text-white border border-white/5 shadow' 
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {t === 'earthwork' ? '土工' : t === 'bridge' ? '橋梁' : t === 'viaduct' ? '高架' : 'トンネル'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. 構造諸元スライダー（土工以外の場合に表示） */}
                <div className="space-y-1.5">
                  {activeSec.type === 'tunnel' ? (
                    <>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">
                          トンネル覆工厚 (Lining Thickness)
                        </span>
                        <span className="font-mono text-cyan-400 font-bold">
                          {(activeSec.properties.liningThickness ?? 0.30).toFixed(2)}m
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.15"
                        max="0.80"
                        step="0.05"
                        value={activeSec.properties.liningThickness ?? 0.30}
                        onChange={(e) => handleUpdateSectionProperty(activeSecIdx, 'liningThickness', parseFloat(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                      />
                    </>
                  ) : activeSec.type !== 'earthwork' ? (
                    <>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">
                          {activeSec.type === 'bridge' ? '上部工箱桁・床版厚' : 'PCラーメン構造スラブ厚'}
                        </span>
                        <span className="font-mono text-amber-400 font-bold">
                          {(activeSec.properties.girderDepth ?? 1.8).toFixed(2)}m
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="3.0"
                        step="0.05"
                        value={activeSec.properties.girderDepth ?? 1.8}
                        onChange={(e) => handleUpdateSectionProperty(activeSecIdx, 'girderDepth', parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                      />
                    </>
                  ) : (
                    <div className="text-xs text-slate-500 italic py-2 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                      土工区間はのり面勾配スライダーから調整可能です
                    </div>
                  )}
                </div>

                {/* 3. 橋脚高さ or 形状 or アクション */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    {activeSec.type === 'tunnel' ? (
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">トンネル断面形状 (Shape)</span>
                        <select
                          value={activeSec.properties.tunnelShape ?? 'arch'}
                          onChange={(e) => handleUpdateSectionProperty(activeSecIdx, 'tunnelShape', e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-[10px] font-bold text-slate-300 focus:outline-none cursor-pointer"
                        >
                          <option value="arch">馬蹄形アーチ (Arch)</option>
                          <option value="box">矩形ボックス (Box)</option>
                        </select>
                      </div>
                    ) : activeSec.type !== 'earthwork' ? (
                      <>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">橋脚・ピア高さ (H)</span>
                          <span className="font-mono text-indigo-400 font-bold">
                            {(activeSec.properties.pierHeight ?? 12.0).toFixed(1)}m
                          </span>
                        </div>
                        <input
                          type="range"
                          min="4.0"
                          max="25.0"
                          step="0.5"
                          value={activeSec.properties.pierHeight ?? 12.0}
                          onChange={(e) => handleUpdateSectionProperty(activeSecIdx, 'pierHeight', parseFloat(e.target.value))}
                          className="w-full accent-indigo-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                        />
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-400 space-y-1">
                        <div>区間範囲: <span className="font-mono text-slate-200 font-bold">{activeSec.startDist.toFixed(1)}m 〜 {activeSec.endDist.toFixed(1)}m</span></div>
                        <div>区間幅: <span className="font-mono text-slate-200 font-bold">{(activeSec.endDist - activeSec.startDist).toFixed(1)}m</span></div>
                      </div>
                    )}
                  </div>

                  <button
                    disabled={sections.length <= 1}
                    onClick={() => handleDeleteSection(activeSecIdx)}
                    className="px-2.5 py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer text-[10px] font-bold"
                    title="この断面区間を削除し、隣の区間を伸長します"
                  >
                    区間削除
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      )}

      {/* 測点表（帯 / Band）セクション */}
      {(layoutMode === 'triple' || layoutMode === 'profile') && (
        <div className="glass-panel rounded-xl overflow-hidden flex flex-col bg-slate-900/10 shrink-0">
        <div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            縦断設計帯・測点表 (Stations Alignment Band)
          </span>
          <span className="text-[9px] text-slate-500 font-mono">
            全測点数: {stations.length} | 選択測点をクリックして横断面図と連動
          </span>
        </div>
        
        <div className="overflow-x-auto max-h-[190px] overflow-y-auto">
          <table className="w-full text-left border-collapse font-mono text-[10px]">
            <thead>
              <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[9px] border-b border-white/10 sticky top-0 z-10">
                <th className="py-2.5 px-4 font-bold border-r border-white/5 text-center">測点 (No.)</th>
                <th className="py-2.5 px-3 border-r border-white/5 text-right">追加距離 (m)</th>
                <th className="py-2.5 px-3 border-r border-white/5 text-right">単距離 (m)</th>
                <th className="py-2.5 px-3 border-r border-white/5 text-right text-emerald-400 font-bold">計画高 (Z)</th>
                <th className="py-2.5 px-3 border-r border-white/5 text-right text-slate-400">地盤高 (groundZ)</th>
                <th className="py-2.5 px-3 border-r border-white/5 text-center font-bold">切盛高 (切/盛)</th>
                <th className="py-2.5 px-4 text-slate-400 text-center">設計勾配 / 状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stations.map((s, idx) => {
                const isSelected = Math.abs(s.distance - selectedStationDist) < 0.1;
                
                // 単距離 (前の測点からの差分)
                const interval = idx === 0 ? s.distance : s.distance - stations[idx - 1].distance;
                
                // 切盛高
                const diff = s.z - s.groundZ;
                
                // 簡易勾配情報
                let slopeText = "-";
                if (idx > 0) {
                  const prevS = stations[idx - 1];
                  const dD = s.distance - prevS.distance;
                  if (dD > 0.1) {
                    const iPercent = ((s.z - prevS.z) / dD) * 100;
                    slopeText = `${iPercent >= 0 ? '+' : ''}${iPercent.toFixed(2)}%`;
                  }
                }

                return (
                  <tr
                    key={`table-station-${idx}`}
                    onClick={() => setSelectedStationDist(s.distance)}
                    className={`cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-emerald-500/15 text-emerald-300 font-bold border-y-2 border-emerald-500/30' 
                        : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-4 border-r border-white/5 text-center font-bold">
                      <span className={`inline-block px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-emerald-500/30 text-emerald-200' : 'bg-slate-800/50 text-slate-400'
                      }`}>
                        {s.name}
                      </span>
                    </td>
                    <td className="py-2 px-3 border-r border-white/5 text-right font-bold text-white">
                      {s.distance.toFixed(1)}m
                    </td>
                    <td className="py-2 px-3 border-r border-white/5 text-right text-slate-500">
                      {interval.toFixed(1)}m
                    </td>
                    <td className="py-2 px-3 border-r border-white/5 text-right text-emerald-400 font-bold text-xs">
                      {s.z.toFixed(2)}m
                    </td>
                    <td className="py-2 px-3 border-r border-white/5 text-right text-slate-400">
                      {s.groundZ.toFixed(2)}m
                    </td>
                    <td className="py-2 px-3 border-r border-white/5 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                        diff >= 0 
                          ? 'bg-red-500/10 text-red-400' 
                          : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {diff >= 0 ? `盛土 +${diff.toFixed(2)}m` : `切土 ${diff.toFixed(2)}m`}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`font-bold ${
                        slopeText.startsWith('+') ? 'text-amber-400' : slopeText.startsWith('-') ? 'text-teal-400' : 'text-slate-500'
                      }`}>
                        {slopeText !== '-' ? `勾配 ${slopeText}` : '起点 (BP)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 下段：横断図 (Cross-Section) ＋ 詳細数値サイドカード ＋ データ & スライダーグリッド */}
      {(showCrossSectionArea || layoutMode === 'cross') && (layoutMode === 'triple' || layoutMode === 'cross') && (
        <div className="flex flex-col gap-4 shrink-0">
          {/* 横断サブコントロールヘッダー（タブ切り替え） */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-white/10 p-3 rounded-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
                <Columns className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-100 font-display">道路横断面・設計シミュレータ</h3>
                <p className="text-[9px] text-slate-500">標準断面パターンの編集、および全測点での横断配置確認・干渉チェック</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-white/5">
                <button
                  onClick={() => setCrossSectionTabMode('pattern')}
                  className={`px-3 py-1 flex items-center gap-1.5 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                    crossSectionTabMode === 'pattern'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="車線幅やのり面、擁壁、舗装厚をスライダー等で動的設計します"
                >
                  <Sliders className="w-3 h-3" />
                  断面パターン設計
                </button>
                <button
                  onClick={() => setCrossSectionTabMode('multi')}
                  className={`px-3 py-1 flex items-center gap-1.5 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                    crossSectionTabMode === 'multi'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="定義されたすべての測点(Station)の横断図を一括表示して配置・切盛バランスを監視します"
                >
                  <LayoutGrid className="w-3 h-3" />
                  全測点横断図一覧 ({stations.length}測点)
                </button>
              </div>

              {/* 最大化 / 縮小化トグルボタン */}
              <button
                onClick={() => setLayoutMode(layoutMode === 'cross' ? 'triple' : 'cross')}
                className="px-2.5 py-1 rounded text-[9px] font-bold border border-white/10 bg-slate-950 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1"
                title={layoutMode === 'cross' ? "一括分割画面に戻る" : "横断面ビューを最大化する"}
              >
                {layoutMode === 'cross' ? <Minimize2 className="w-3 h-3 text-blue-400" /> : <Maximize2 className="w-3 h-3 text-blue-400" />}
                <span className="hidden sm:inline">{layoutMode === 'cross' ? '縮小' : '最大化'}</span>
              </button>
            </div>
          </div>

          {crossSectionTabMode === 'pattern' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 shrink-0">
        
        {/* 左側：横断図 (Cross Section) */}
        <div className={`lg:col-span-5 glass-panel rounded-xl flex flex-col ${layoutMode === 'cross' ? 'h-[520px]' : 'h-[380px]'}`}>
          <div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              横断図 @ {activeStation ? activeStation.name : 'No.0'} ({selectedStationDist.toFixed(1)}m地点)
            </span>
            <div className="flex items-center gap-2">
              {currentProfilePoint && (
                <span className={`text-[10px] px-2 py-0.5 font-bold rounded ${
                  currentProfilePoint.z >= currentProfilePoint.groundZ 
                  ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
                  : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                }`}>
                  {currentProfilePoint.z >= currentProfilePoint.groundZ ? '盛土 (Fill)' : '切土 (Cut)'}
                </span>
              )}
              {/* 横断面図最大化 / 縮小化トグルボタン */}
              <button
                onClick={() => setLayoutMode(layoutMode === 'cross' ? 'triple' : 'cross')}
                className="px-2 py-0.5 rounded text-[9px] font-bold border border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1"
                title={layoutMode === 'cross' ? "一括分割画面に戻る" : "横断面図を最大化する"}
              >
                {layoutMode === 'cross' ? <Minimize2 className="w-2.5 h-2.5 text-blue-400" /> : <Maximize2 className="w-2.5 h-2.5 text-blue-400" />}
                <span>{layoutMode === 'cross' ? '縮小' : '最大化'}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 bg-slate-950/40 relative">
            {crossSectionSVG ? (
              <svg className={`w-full h-full ${layoutMode === 'cross' ? 'max-h-[440px]' : 'max-h-[290px]'}`} viewBox="0 0 400 160">
                {/* グリッド背景 */}
                <rect width="100%" height="100%" fill="none" />
                
                {crossSectionSVG.sectionType === 'earthwork' ? (
                  <>
                    {/* 盛土・切土ハッチング (最背面) */}
                    <polygon 
                      points={crossSectionSVG.hatchPointsStr} 
                      fill={crossSectionSVG.isFill ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)'} 
                      stroke="none" 
                    />

                    {/* 道路構造：1. 路床層 (Subgrade) */}
                    <polygon 
                      points={crossSectionSVG.subgradePolygonPointsStr} 
                      fill="rgba(120, 113, 108, 0.35)" 
                      stroke="rgba(120, 113, 108, 0.5)" 
                      strokeWidth="0.5" 
                    />

                    {/* 道路構造：2. 路盤層 (Base) */}
                    <polygon 
                      points={crossSectionSVG.basePolygonPointsStr} 
                      fill="rgba(217, 119, 6, 0.18)" 
                      stroke="rgba(217, 119, 6, 0.35)" 
                      strokeWidth="0.5" 
                    />

                    {/* 道路構造：3. 舗装層 (Pavement) */}
                    <polygon 
                      points={crossSectionSVG.pavePolygonPointsStr} 
                      fill="rgba(71, 85, 105, 0.75)" 
                      stroke="rgba(100, 116, 139, 0.6)" 
                      strokeWidth="0.5" 
                    />

                    {/* 法面（Slope）ライン */}
                    <path d={crossSectionSVG.leftSlopePathStr} stroke={crossSectionSVG.isFill ? '#ef4444' : '#3b82f6'} strokeWidth="1.8" />
                    <path d={crossSectionSVG.rightSlopePathStr} stroke={crossSectionSVG.isFill ? '#ef4444' : '#3b82f6'} strokeWidth="1.8" />

                    {/* 左側・右側のり面構造物（擁壁・ブロック積）の描画 */}
                    {crossSectionSVG.leftStructurePolyStr && (
                      <g>
                        <polygon 
                          points={crossSectionSVG.leftStructurePolyStr} 
                          fill={crossSectionSVG.leftStruct === 'gravity' ? '#64748b' : '#475569'} 
                          stroke="#94a3b8" 
                          strokeWidth="1.2" 
                        />
                        <text 
                          x={crossSectionSVG.ptLeftShoulder.x - 12} 
                          y={crossSectionSVG.ptLeftShoulder.y + 12} 
                          fill="#94a3b8" 
                          fontSize="6" 
                          fontFamily="sans-serif"
                          textAnchor="end"
                          fontWeight="bold"
                        >
                          {crossSectionSVG.leftStruct === 'gravity' ? '重力式擁壁' : 'ブロック積'}
                        </text>
                      </g>
                    )}

                    {crossSectionSVG.rightStructurePolyStr && (
                      <g>
                        <polygon 
                          points={crossSectionSVG.rightStructurePolyStr} 
                          fill={crossSectionSVG.rightStruct === 'gravity' ? '#64748b' : '#475569'} 
                          stroke="#94a3b8" 
                          strokeWidth="1.2" 
                        />
                        <text 
                          x={crossSectionSVG.ptRightShoulder.x + 12} 
                          y={crossSectionSVG.ptRightShoulder.y + 12} 
                          fill="#94a3b8" 
                          fontSize="6" 
                          fontFamily="sans-serif"
                          textAnchor="start"
                          fontWeight="bold"
                        >
                          {crossSectionSVG.rightStruct === 'gravity' ? '重力式擁壁' : 'ブロック積'}
                        </text>
                      </g>
                    )}
                  </>
                ) : (
                  /* 橋梁・高架橋の描画（土工層を非表示にしてコンクリート橋梁を描画） */
                  crossSectionSVG.bridgeStructureHtml
                )}

                {/* 計画道路上面構造 (アスファルト面、路肩) (最前面) */}
                <path d={crossSectionSVG.roadPathStr} fill="none" stroke="#ffffff" strokeWidth="2" />
                
                {/* 左・右車線幅の矢印インジケーター */}
                <line x1={crossSectionSVG.ptCenter.x} y1={crossSectionSVG.ptCenter.y - 12} x2={crossSectionSVG.ptLeftShoulder.x} y2={crossSectionSVG.ptLeftShoulder.y - 12} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <line x1={crossSectionSVG.ptCenter.x} y1={crossSectionSVG.ptCenter.y - 12} x2={crossSectionSVG.ptRightShoulder.x} y2={crossSectionSVG.ptRightShoulder.y - 12} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

                {/* 地盤線 */}
                <path d={crossSectionSVG.groundPathStr} fill="none" stroke="#64748b" strokeWidth="1.2" strokeDasharray="3 3" />

                {/* テキストラベリング */}
                <text x="200" y="25" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {crossSectionSVG.sectionType === 'earthwork' ? '土工部' : crossSectionSVG.sectionType === 'bridge' ? '橋梁部' : crossSectionSVG.sectionType === 'viaduct' ? '高架橋部' : 'トンネル部'}: 計画高 FH = {currentProfilePoint?.z.toFixed(2)}m
                </text>
                <text x="200" y="145" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  地盤高 GH = {currentProfilePoint?.groundZ.toFixed(2)}m (高低差: {crossSectionSVG.heightDiffText})
                </text>
              </svg>
            ) : (
              <div className="text-slate-500 text-xs">データ収集中...</div>
            )}
          </div>
        </div>

        {/* 中央：横断構成詳細サイドカード */}
        <div className="lg:col-span-3 glass-panel rounded-xl flex flex-col h-[380px] bg-slate-900/30 overflow-hidden">
          <div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              横断構成数値詳細
            </span>
          </div>

          <div className="flex-1 p-3 flex flex-col justify-between text-[11px] space-y-2 overflow-y-auto">
            {currentProfilePoint ? (
              <>
                {/* 1. 地盤高と設計高の差分 */}
                <div className="bg-slate-950/50 border border-white/5 p-2 rounded">
                  <div className="text-[9px] text-slate-500 font-bold mb-0.5">計画・地盤高差 (切盛)</div>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-mono font-bold ${
                      currentProfilePoint.z >= currentProfilePoint.groundZ ? 'text-red-400' : 'text-blue-400'
                    }`}>
                      {currentProfilePoint.z >= currentProfilePoint.groundZ ? '＋' : '－'}
                      {Math.abs(currentProfilePoint.z - currentProfilePoint.groundZ).toFixed(2)} m
                    </span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold leading-none ${
                      currentProfilePoint.z >= currentProfilePoint.groundZ 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {currentProfilePoint.z >= currentProfilePoint.groundZ ? '盛土 (Fill)' : '切土 (Cut)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1 pt-1 border-t border-white/5 text-[9px] font-mono text-slate-400">
                    <div>計画: {currentProfilePoint.z.toFixed(2)}m</div>
                    <div className="text-right">地盤: {currentProfilePoint.groundZ.toFixed(2)}m</div>
                  </div>
                </div>

                {/* 2. 車線幅 */}
                <div className="bg-slate-950/50 border border-white/5 p-2 rounded">
                  <div className="text-[9px] text-slate-500 font-bold mb-0.5">車線幅員</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-mono font-bold text-slate-200">
                      {(crossSection.leftLaneWidth + crossSection.rightLaneWidth).toFixed(1)} m
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      (総幅: {(crossSection.leftLaneWidth + crossSection.rightLaneWidth + crossSection.shoulderWidth * 2).toFixed(1)}m)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1 pt-1 border-t border-white/5 text-[9px] font-mono text-slate-400">
                    <div>左車線: {crossSection.leftLaneWidth.toFixed(1)}m</div>
                    <div className="text-right">右車線: {crossSection.rightLaneWidth.toFixed(1)}m</div>
                  </div>
                </div>

                {/* 3. 法面勾配・法長 */}
                <div className="bg-slate-950/50 border border-white/5 p-2 rounded">
                  <div className="text-[9px] text-slate-500 font-bold mb-0.5">法面構成 (Slopes)</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-mono font-bold text-slate-300">
                      勾配 1 : {crossSection.slopeGradient.toFixed(1)}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      法長: {(Math.abs(currentProfilePoint.z - currentProfilePoint.groundZ) * Math.sqrt(1 + crossSection.slopeGradient * crossSection.slopeGradient)).toFixed(2)}m
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1 pt-1 border-t border-white/5 text-[9px] font-mono text-slate-400">
                    <div>路肩幅: {crossSection.shoulderWidth.toFixed(1)}m</div>
                    <div className="text-right">横断勾配: 2.0% / 4.0%</div>
                  </div>
                </div>

                {/* 4. 舗装各層・路床構成 */}
                <div className="bg-slate-950/50 border border-white/5 p-2.5 rounded">
                  <div className="text-[9px] text-slate-500 font-bold mb-0.5">舗装各層・路床構造</div>
                  <div className="space-y-1.5 mt-1 text-[9px] font-mono text-slate-300">
                    <div className="flex justify-between items-center border-b border-white/5 pb-0.5">
                      <span className="text-slate-400">舗装層:</span>
                      <span className="font-bold text-slate-200">{(crossSection.pavementThickness || 0.15).toFixed(2)}m</span>
                      <span className="text-[8px] text-slate-500 text-right truncate max-w-[80px]">{crossSection.pavementMaterial || 'As混合物'}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 py-0.5">
                      <span className="text-slate-400">路盤層:</span>
                      <span className="font-bold text-slate-200">{(crossSection.baseThickness || 0.30).toFixed(2)}m</span>
                      <span className="text-[8px] text-slate-500 text-right truncate max-w-[80px]">{crossSection.baseMaterial || '砕石'}</span>
                    </div>
                    <div className="flex justify-between items-center pt-0.5">
                      <span className="text-slate-400">路床層:</span>
                      <span className="font-bold text-slate-200">{(crossSection.subgradeThickness || 1.00).toFixed(2)}m</span>
                      <span className="text-[8px] text-slate-500 text-right truncate max-w-[80px]">{crossSection.subgradeMaterial || '改良土'}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-xs text-center py-10">データがありません</div>
            )}
          </div>
        </div>

        {/* 右側：工学データ & スライダー調整パネル */}
        <div className={`lg:col-span-4 flex flex-col gap-4 ${layoutMode === 'cross' ? 'h-[520px]' : 'h-[380px]'}`}>
          
          {/* 設計数値パネル */}
          <div className="glass-panel rounded-xl p-3 flex flex-col justify-between h-[90px] bg-slate-900/30 shrink-0">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-blue-400" />
              リアルタイム土量算定 (平均断面法)
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              <div className="bg-slate-950/40 border border-white/5 p-1.5 rounded">
                <div className="text-[8px] text-slate-500">切土総量</div>
                <div className="text-xs font-mono font-bold text-blue-400">{engineeringData.cutVolume.toLocaleString()} m³</div>
              </div>
              <div className="bg-slate-950/40 border border-white/5 p-1.5 rounded">
                <div className="text-[8px] text-slate-500">盛土総量</div>
                <div className="text-xs font-mono font-bold text-red-400">{engineeringData.fillVolume.toLocaleString()} m³</div>
              </div>
              <div className="bg-slate-950/40 border border-white/5 p-1.5 rounded">
                <div className="text-[8px] text-slate-500">差引土量</div>
                <div className={`text-xs font-mono font-bold ${engineeringData.netVolume >= 0 ? 'text-emerald-400' : 'text-amber-500'}`}>
                  {engineeringData.netVolume >= 0 ? '+' : ''}{engineeringData.netVolume.toLocaleString()} m³
                </div>
              </div>
            </div>
          </div>

          {/* 土量自動最適化（AI駆動型）パネル */}
          <div className="glass-panel rounded-xl p-3 flex flex-col justify-between bg-slate-900/30 border border-cyan-500/15 shrink-0 transition-all animate-fade-in">
            <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                AI 駆動型 土量ボリューム最適化
              </span>
              {optimizationResult && (
                <button
                  onClick={() => setOptimizationResult(null)}
                  className="text-[8px] text-slate-400 hover:text-white underline cursor-pointer"
                >
                  結果をクリア
                </button>
              )}
            </div>
            
            <div className="flex items-center justify-between gap-3 mt-1.5">
              <div className="text-[9px] text-slate-400 leading-normal max-w-[70%]">
                計画線高と勾配制限(8-10%)を自動スキャンし、切盛土量を極小化・バランスさせます。
              </div>
              <button
                onClick={handleOptimizeVolumes}
                disabled={isVolumeOptimizing}
                className={`px-2.5 py-1.5 shrink-0 rounded text-[9px] font-bold text-white flex items-center gap-1.5 shadow-lg cursor-pointer select-none transition-all ${
                  isVolumeOptimizing
                    ? 'bg-cyan-700/50 cursor-wait'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:from-cyan-700 active:to-blue-700 shadow-cyan-500/10'
                }`}
                title="山登り法アルゴリズムにより、縦断計画高を自動的に微調整し、総土量が最小、かつ切盛比が1:1に近づくアライメントを高速探索します。"
              >
                {isVolumeOptimizing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    探索中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-cyan-300 animate-pulse" />
                    最適化を実行
                  </>
                )}
              </button>
            </div>

            {/* 最適化結果の要約表示 */}
            {optimizationResult && (
              <div className="mt-2 pt-2 border-t border-white/5 animate-fade-in text-[9px]">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950/40 p-1.5 rounded border border-white/5">
                    <div className="text-slate-500 text-[8px] uppercase font-bold font-sans">総土量の変化</div>
                    <div className="font-mono text-[10px] font-bold text-white flex items-center gap-1 mt-0.5">
                      <span className="text-slate-400 line-through text-[8px]">{(optimizationResult.initialVolume.cut + optimizationResult.initialVolume.fill).toLocaleString()}</span>
                      <span className="text-cyan-400">➔</span>
                      <span className="text-emerald-400 font-extrabold">{(optimizationResult.optimizedVolume.cut + optimizationResult.optimizedVolume.fill).toLocaleString()} m³</span>
                    </div>
                    {/* 削減率 */}
                    {(() => {
                      const initTotal = optimizationResult.initialVolume.cut + optimizationResult.initialVolume.fill;
                      const optTotal = optimizationResult.optimizedVolume.cut + optimizationResult.optimizedVolume.fill;
                      if (initTotal > 0) {
                        const reductionPct = ((initTotal - optTotal) / initTotal) * 100;
                        if (reductionPct > 0.1) {
                          return <span className="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.2 rounded mt-1 inline-block">{(reductionPct).toFixed(1)}% 削減！</span>;
                        } else if (reductionPct < -0.1) {
                          return <span className="text-[8px] text-amber-400 font-bold bg-amber-500/10 px-1 py-0.2 rounded mt-1 inline-block">{(Math.abs(reductionPct)).toFixed(1)}% 調整(制約充足)</span>;
                        }
                      }
                      return null;
                    })()}
                  </div>
                  <div className="bg-slate-950/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
                    <div>
                      <div className="text-slate-500 text-[8px] uppercase font-bold font-sans">切盛バランス</div>
                      <div className="font-mono text-[8px] text-slate-300 mt-0.5">
                        切土: <span className="text-blue-400 font-bold">{optimizationResult.optimizedVolume.cut.toLocaleString()} m³</span>
                      </div>
                      <div className="font-mono text-[8px] text-slate-300">
                        盛土: <span className="text-red-400 font-bold">{optimizationResult.optimizedVolume.fill.toLocaleString()} m³</span>
                      </div>
                    </div>
                    {/* バランス評価 */}
                    {(() => {
                      const diff = Math.abs(optimizationResult.optimizedVolume.cut - optimizationResult.optimizedVolume.fill);
                      if (diff < 500) {
                        return <span className="text-[7px] text-cyan-400 font-bold bg-cyan-500/10 px-1 py-0.2 rounded mt-0.5 inline-block text-center">切盛超極小(バランス完璧)</span>;
                      } else if (diff < 2000) {
                        return <span className="text-[7px] text-blue-400 font-bold bg-blue-500/10 px-1 py-0.2 rounded mt-0.5 inline-block text-center">切盛バランス良好</span>;
                      }
                      return null;
                    })()}
                  </div>
                </div>
                
                {/* ログの表示 */}
                <div className="mt-1.5 bg-slate-950/70 rounded p-1.5 border border-white/5 max-h-[50px] overflow-y-auto custom-scrollbar font-mono text-[7px] text-slate-400 space-y-0.5">
                  {optimizationResult.log.map((logLine, idx) => (
                    <div key={idx} className="truncate">{logLine}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 車線幅・路肩・法面 or 各層スライダー（タブ式で切り替え） */}
          <div className="glass-panel rounded-xl p-4 flex-1 flex flex-col justify-between bg-slate-900/30 min-h-[160px] overflow-hidden">
            <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 shrink-0">
              <span className="flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                道路断面設計調整
              </span>
              <div className="flex bg-slate-950 rounded p-0.5 border border-white/5 shrink-0">
                <button
                  onClick={() => setActiveSubTab('geometry')}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                    activeSubTab === 'geometry' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  外形 (ジオメトリ)
                </button>
                <button
                  onClick={() => setActiveSubTab('layers')}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                    activeSubTab === 'layers' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  舗装・路床
                </button>
                <button
                  onClick={() => setActiveSubTab('profile')}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                    activeSubTab === 'profile' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  縦断曲線 (VCL)
                </button>
                <button
                  onClick={() => setActiveSubTab('drainage')}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                    activeSubTab === 'drainage' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="集水桝（排水施設）の配置間隔、タイプ、排水処理能力を編集します"
                >
                  集水桝 (排水)
                </button>
              </div>
            </div>
            
            {activeSubTab === 'geometry' ? (
              <div className="space-y-2.5 mt-2 text-xs flex-1 overflow-y-auto pr-1">
                {/* 左・右車線幅 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-400 font-semibold">左車線幅</span>
                      <span className="font-mono text-blue-400 font-bold">{crossSection.leftLaneWidth.toFixed(2)}m</span>
                    </div>
                    <input
                      type="range"
                      min="2.0"
                      max="5.0"
                      step="0.05"
                      value={crossSection.leftLaneWidth}
                      onChange={(e) => handleSlider('leftLaneWidth', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-400 font-semibold">右車線幅</span>
                      <span className="font-mono text-blue-400 font-bold">{crossSection.rightLaneWidth.toFixed(2)}m</span>
                    </div>
                    <input
                      type="range"
                      min="2.0"
                      max="5.0"
                      step="0.05"
                      value={crossSection.rightLaneWidth}
                      onChange={(e) => handleSlider('rightLaneWidth', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>
                </div>

                {/* 路肩幅・一般法面 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-400 font-semibold">標準路肩幅</span>
                      <span className="font-mono text-blue-400 font-bold">{crossSection.shoulderWidth.toFixed(2)}m</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={crossSection.shoulderWidth}
                      onChange={(e) => handleSlider('shoulderWidth', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-400 font-semibold">標準勾配 (1:S)</span>
                      <span className="font-mono text-slate-300 font-bold">1:{crossSection.slopeGradient.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={crossSection.slopeGradient}
                      onChange={(e) => handleSlider('slopeGradient', parseFloat(e.target.value))}
                      className="w-full accent-slate-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>
                </div>

                {/* 切土・盛土の個別勾配設定 */}
                <div className="bg-slate-950/40 p-2 rounded border border-white/5 space-y-2.5">
                  <div className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">
                    のり面詳細設計 (切盛個別)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px]">
                        <span className="text-slate-400">切土法面勾配</span>
                        <span className="font-mono text-sky-400 font-bold">1:{(crossSection.cutSlopeGradient ?? 1.0).toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={crossSection.cutSlopeGradient ?? 1.0}
                        onChange={(e) => handleSlider('cutSlopeGradient' as any, parseFloat(e.target.value))}
                        className="w-full accent-sky-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px]">
                        <span className="text-slate-400">盛土法面勾配</span>
                        <span className="font-mono text-red-400 font-bold">1:{(crossSection.fillSlopeGradient ?? 1.5).toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="2.5"
                        step="0.1"
                        value={crossSection.fillSlopeGradient ?? 1.5}
                        onChange={(e) => handleSlider('fillSlopeGradient' as any, parseFloat(e.target.value))}
                        className="w-full accent-red-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 多段のり面・小段・U字溝設定 */}
                <div className="bg-slate-950/40 p-2 rounded border border-white/5 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">
                      多段のり面・小段設計
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={crossSection.enableMultiStageSlope ?? true} 
                        onChange={(e) => handleSlider('enableMultiStageSlope' as any, e.target.checked ? 1 : 0)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-600"></div>
                      <span className="ml-1.5 text-[8px] font-bold text-slate-300">有効化</span>
                    </label>
                  </div>

                  {(crossSection.enableMultiStageSlope ?? true) && (
                    <div className="space-y-2 pt-1 border-t border-white/5 animate-fade-in">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-slate-400">小段設置間隔 (高)</span>
                            <span className="font-mono text-amber-500 font-bold">{(crossSection.bermInterval ?? 5.0).toFixed(1)}m</span>
                          </div>
                          <input
                            type="range"
                            min="2.0"
                            max="8.0"
                            step="0.5"
                            value={crossSection.bermInterval ?? 5.0}
                            onChange={(e) => handleSlider('bermInterval' as any, parseFloat(e.target.value))}
                            className="w-full accent-amber-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-slate-400">小段幅 (水平)</span>
                            <span className="font-mono text-amber-500 font-bold">{(crossSection.bermWidth ?? 1.0).toFixed(1)}m</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="3.0"
                            step="0.1"
                            value={crossSection.bermWidth ?? 1.0}
                            onChange={(e) => handleSlider('bermWidth' as any, parseFloat(e.target.value))}
                            className="w-full accent-amber-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center p-1.5 rounded bg-slate-900/60 border border-white/5 text-[9px]">
                        <span className="text-slate-400 font-semibold">小段排水溝 (U字側溝) の自動配置</span>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={crossSection.enableBermDitch ?? true} 
                            onChange={(e) => handleSlider('enableBermDitch' as any, e.target.checked ? 1 : 0)}
                            className="sr-only peer"
                          />
                          <div className="w-7 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeSubTab === 'layers' ? (
              <div className="space-y-2.5 mt-2 text-xs flex-1 overflow-y-auto pr-1">
                {/* 舗装層 (Pavement) */}
                <div className="space-y-1 bg-slate-950/40 p-1.5 rounded border border-white/5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-300 font-semibold flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full"></div>
                      舗装層 (Pavement) 厚
                    </span>
                    <span className="font-mono text-slate-200 font-bold">{(crossSection.pavementThickness || 0.15).toFixed(2)}m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.05"
                      max="0.30"
                      step="0.01"
                      value={crossSection.pavementThickness || 0.15}
                      onChange={(e) => handleSlider('pavementThickness', parseFloat(e.target.value))}
                      className="flex-1 accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                    <select
                      value={crossSection.pavementMaterial || 'アスファルト混合物 (As)'}
                      onChange={(e) => handleSlider('pavementMaterial' as any, e.target.value as any)}
                      className="bg-slate-950 border border-white/10 rounded px-1 py-0.5 text-[9px] text-slate-300 w-24 focus:outline-none cursor-pointer"
                    >
                      <option value="アスファルト混合物 (As)">As混合物</option>
                      <option value="密粒度アスコン">密粒アスコン</option>
                      <option value="改質アスコン">改質アスコン</option>
                      <option value="セメントコンクリート">コンクリート</option>
                    </select>
                  </div>
                </div>

                {/* 路盤層 (Base) */}
                <div className="space-y-1 bg-slate-950/40 p-1.5 rounded border border-white/5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-300 font-semibold flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-amber-600 rounded-full"></div>
                      路盤層 (Base) 厚
                    </span>
                    <span className="font-mono text-slate-200 font-bold">{(crossSection.baseThickness || 0.30).toFixed(2)}m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.10"
                      max="0.60"
                      step="0.02"
                      value={crossSection.baseThickness || 0.30}
                      onChange={(e) => handleSlider('baseThickness', parseFloat(e.target.value))}
                      className="flex-1 accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                    <select
                      value={crossSection.baseMaterial || '粒度調整砕石 (M-40)'}
                      onChange={(e) => handleSlider('baseMaterial' as any, e.target.value as any)}
                      className="bg-slate-950 border border-white/10 rounded px-1 py-0.5 text-[9px] text-slate-300 w-24 focus:outline-none cursor-pointer"
                    >
                      <option value="粒度調整砕石 (M-40)">粒調砕石</option>
                      <option value="クラッシャラン (C-40)">クラッシャ</option>
                      <option value="セメント安定処理">セメント処理</option>
                      <option value="高炉徐冷スラグ">高炉スラグ</option>
                    </select>
                  </div>
                </div>

                {/* 路床層 (Subgrade) */}
                <div className="space-y-1 bg-slate-950/40 p-1.5 rounded border border-white/5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-300 font-semibold flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-yellow-900 rounded-full"></div>
                      路床層 (Subgrade) 厚
                    </span>
                    <span className="font-mono text-slate-200 font-bold">{(crossSection.subgradeThickness || 1.00).toFixed(2)}m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.50"
                      max="2.00"
                      step="0.05"
                      value={crossSection.subgradeThickness || 1.00}
                      onChange={(e) => handleSlider('subgradeThickness', parseFloat(e.target.value))}
                      className="flex-1 accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                    <select
                      value={crossSection.subgradeMaterial || '改良土・路床土'}
                      onChange={(e) => handleSlider('subgradeMaterial' as any, e.target.value as any)}
                      className="bg-slate-950 border border-white/10 rounded px-1 py-0.5 text-[9px] text-slate-300 w-24 focus:outline-none cursor-pointer"
                    >
                      <option value="改良土・路床土">改良土</option>
                      <option value="砂質土 (良質路床)">砂質土</option>
                      <option value="現地盤土 (掘削土)">現地盤土</option>
                      <option value="山砂 (購入土)">山砂</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : activeSubTab === 'profile' ? (
              // 縦断曲線 (VCL) タブ
              <div className="space-y-2 mt-1 text-[11px] flex-1 overflow-y-auto pr-1">
                {/* 縦断IPの動的追加・削除コントロールバー */}
                <div className="flex flex-col gap-1.5 shrink-0 pb-1.5 border-b border-white/5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleAddIP}
                      className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                      title="現在選択されている測点(Station)の位置に、新しい縦断IP(交点)を挿入します"
                    >
                      <Sliders className="w-3 h-3" />
                      IP追加 (@{activeStation ? activeStation.name : '現在地'})
                    </button>
                    <button
                      onClick={handleDeleteIP}
                      disabled={!selectedVpiId || selectedVpiId === 'BP' || selectedVpiId === 'EP'}
                      className="py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-[10px] rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                      title="現在選択されている中間IP(縦断交点)を削除します (BP/EPは削除不可)"
                    >
                      <RefreshCw className="w-3 h-3" />
                      選択IPを削除
                    </button>
                  </div>

                  {/* AI自動最適化ボタン (VCLサブタブ用) */}
                  <button
                    onClick={handleOptimizeProfile}
                    disabled={isOptimizing}
                    className={`py-1.5 rounded text-[10px] font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
                      isOptimizing
                        ? 'bg-violet-950/40 border-violet-500/30 text-violet-400 cursor-not-allowed'
                        : 'bg-violet-600 hover:bg-violet-500 active:scale-95 text-white border-violet-500/50 hover:shadow-violet-500/20'
                    }`}
                    title="切土・盛土量の絶対値を最小にしつつ、土量バランス（切盛の均等性）が最適となるようにAIがすべての縦断計画高(Z)を一括自動最適化します。"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin text-violet-400' : 'text-violet-200 animate-pulse'}`} />
                    <span>{isOptimizing ? 'AIが最適な勾配を提案中...' : 'AI勾配提案・計画高自動最適化'}</span>
                  </button>
                </div>

                {vpiPoints.length === 0 ? (
                  <div className="text-slate-500 text-center py-6 text-xs flex flex-col items-center gap-2">
                    <span>中間IP（縦断変化点）が定義されていません。</span>
                    <span className="text-[10px] text-slate-600">上の「IP追加」ボタンをクリックすると、現在測点位置に新規追加できます。</span>
                  </div>
                ) : (
                  <>
                    {/* 対象IP選択 & 設計速度 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5 bg-slate-950/40 p-1.5 rounded border border-white/5">
                        <span className="text-[9px] text-slate-500 font-semibold block">対象の縦断IP</span>
                        <select
                          value={selectedVpiId}
                          onChange={(e) => setSelectedVpiId(e.target.value)}
                          className="bg-transparent text-white font-bold text-[10px] focus:outline-none border-none cursor-pointer w-full"
                        >
                          {vpiPoints.map((v, index) => (
                            <option key={v.id} value={v.id} className="bg-slate-950">
                              IP.{index + 1} ({v.name})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-0.5 bg-slate-950/40 p-1.5 rounded border border-white/5">
                        <span className="text-[9px] text-slate-500 font-semibold block">設計速度 (Speed)</span>
                        <select
                          value={designSpeed}
                          onChange={(e) => setDesignSpeed(parseInt(e.target.value))}
                          className="bg-transparent text-white font-bold text-[10px] focus:outline-none border-none cursor-pointer w-full"
                        >
                          {[20, 30, 40, 50, 60, 80].map(speed => (
                            <option key={speed} value={speed} className="bg-slate-950">
                              {speed} km/h
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 勾配 & 道路構造令基準情報 */}
                    {vpiData && (
                      <div className="bg-slate-950/60 p-2 rounded border border-white/5 space-y-1 font-sans">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500 font-bold">縦断形状:</span>
                          <span className={`font-bold ${vpiData.isSag ? 'text-blue-400' : 'text-amber-400'}`}>
                            {vpiData.isSag ? '凹型 (サグ・底部)' : '凸型 (サミット・頂部)'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-slate-400 pt-0.5 border-t border-white/5">
                          <div>流入勾配: {(vpiData.g1 * 100).toFixed(2)}%</div>
                          <div className="text-right">流出勾配: {(vpiData.g2 * 100).toFixed(2)}%</div>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono border-t border-white/5 pt-1 mt-0.5">
                          <span className="text-slate-500">構造令 最小R:</span>
                          <span className="text-emerald-400 font-bold">{minRadius} m</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-slate-500">構造令 最小VCL:</span>
                          <span className="text-emerald-400 font-bold">{minVcl} m</span>
                        </div>
                      </div>
                    )}

                    {/* R / VCL 調整 */}
                    {vpiData && selectedVpiPoint && (
                      <div className="space-y-2 pt-1 border-t border-white/5">
                        <div className="space-y-1 bg-slate-950/40 p-1.5 rounded border border-white/5">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-300 font-semibold">曲線半径 R (最小: {minRadius}m)</span>
                            <span className={`font-mono font-bold ${currentR >= minRadius ? 'text-emerald-400' : 'text-red-400'}`}>
                              {currentR > 0 ? `${Math.round(currentR)}m` : '直線'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="range"
                              min="50"
                              max="3000"
                              step="50"
                              value={currentR || 50}
                              onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
                              className="flex-1 accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                              disabled={vpiData.deltaG < 0.0001}
                            />
                            <span className="text-[9px] text-slate-500 min-w-[12px] text-right font-mono">R</span>
                          </div>
                        </div>

                        <div className="space-y-1 bg-slate-950/40 p-1.5 rounded border border-white/5">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-300 font-semibold">曲線長 VCL (最小: {minVcl}m)</span>
                            <span className={`font-mono font-bold ${(selectedVpiPoint.vcl || 0) >= minVcl ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {(selectedVpiPoint.vcl || 0).toFixed(1)}m
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="range"
                              min="0"
                              max="150"
                              step="5"
                              value={selectedVpiPoint.vcl || 0}
                              onChange={(e) => handleVclChange(parseFloat(e.target.value))}
                              className="flex-1 accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                            />
                            <span className="text-[9px] text-slate-500 min-w-[12px] text-right font-mono">L</span>
                          </div>
                        </div>

                        {/* 適合検証 */}
                        <div className="flex items-center justify-between p-1 rounded bg-slate-950/30 text-[9px] font-semibold border border-white/5">
                          <span className="text-slate-400">構造令 適合検証:</span>
                          {currentR >= minRadius && (selectedVpiPoint.vcl || 0) >= minVcl ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-bold">
                              ✓ 基準適合
                            </span>
                          ) : (
                            <span className="text-amber-400 flex items-center gap-1 font-bold animate-pulse">
                              ⚠ R/VCL不足
                            </span>
                          )}
                        </div>

                        {/* 自動適用ボタン */}
                        <button
                          onClick={handleAutoApplyMin}
                          className="w-full py-1 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[10px] rounded transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-blue-500/10"
                          title="設計速度に応じた最小曲線半径(R)と最小VCL長を自動適用します"
                        >
                          <RefreshCw className="w-2.5 h-2.5 text-blue-100" />
                          基準最小値を自動挿入
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              // 集水桝（排水施設）高度設計セクション
              <div className="space-y-3 mt-2 text-xs flex-1 overflow-y-auto pr-1">
                
                {/* 保存完了アラート（トースト風フィードバック） */}
                {saveFeedback && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2 rounded-lg flex items-center gap-2 animate-fade-in text-[10px] font-bold">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{saveFeedback}</span>
                  </div>
                )}

                {/* 配置間隔の調整 */}
                <div className="space-y-2 bg-slate-950/40 p-2.5 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5 text-[10px]">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      集水桝 配置間隔 (Spacing)
                    </span>
                    <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-white/5">
                      <input
                        type="number"
                        min="10"
                        max="100"
                        step="1"
                        value={crossSection.inletSpacing ?? 25}
                        onChange={(e) => {
                          const val = Math.max(10, Math.min(100, parseInt(e.target.value) || 25));
                          handleSlider('inletSpacing', val);
                        }}
                        className="w-8 bg-transparent text-right font-mono text-blue-400 font-bold focus:outline-none text-[10px]"
                      />
                      <span className="text-[8px] text-slate-500">m</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={crossSection.inletSpacing ?? 25}
                      onChange={(e) => handleSlider('inletSpacing', parseInt(e.target.value))}
                      className="flex-1 accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>
                  <p className="text-[8px] text-slate-500 leading-normal">
                    アライメントに沿い左右両側に設置。縦断サグ部(凹部)には確実に自動配置されます。
                  </p>
                </div>

                {/* 集水桝タイプ（種別）の選択 - タイル型リッチセレクター */}
                <div className="space-y-2 bg-slate-950/40 p-2.5 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5 text-[10px]">
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      標準配置する集水桝タイプ
                    </span>
                    <span className="text-[8px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 font-bold rounded">
                      選択中
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'standard', name: '標準桝', desc: '一般的なコンクリート製' },
                      { id: 'large', name: '大型桝', desc: '堆砂容量が大きく大雨対応' },
                      { id: 'grated', name: 'グレーチング', desc: '表面流の吸込に特化' },
                      { id: 'high_capacity', name: '高吸込型', desc: '特殊格子で超高容量処理' }
                    ].map((t) => {
                      const isSelected = (crossSection.inletType ?? 'standard') === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSlider('inletType' as any, t.id as any)}
                          className={`p-2 rounded-lg border text-left cursor-pointer transition-all min-h-[44px] flex flex-col justify-center select-none ${
                            isSelected
                              ? 'bg-blue-950/20 border-blue-500/70 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                              : 'bg-slate-900/30 border-white/5 hover:bg-slate-800/40 hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}>
                              {t.name}
                            </span>
                            {isSelected && <Check className="w-3 h-3 text-blue-400" />}
                          </div>
                          <span className="text-[8px] text-slate-500 truncate mt-0.5">{t.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 各タイプの排水能力 (L/s) 設定 */}
                <div className="space-y-2 bg-slate-950/40 p-2.5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-semibold text-slate-300 block pb-1 border-b border-white/5">
                    タイプ別 排水処理能力設計 (Capacity)
                  </span>

                  {/* 1. 標準桝 */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                        ① 標準桝 (Standard)
                      </span>
                      <div className="flex items-center gap-0.5 bg-slate-950 px-1 py-0.2 rounded border border-white/5">
                        <input
                          type="number"
                          min="1.0"
                          max="10.0"
                          step="0.1"
                          value={crossSection.inletCapacityStandard ?? 3.0}
                          onChange={(e) => {
                            const val = Math.max(1.0, Math.min(10.0, parseFloat(e.target.value) || 3.0));
                            handleSlider('inletCapacityStandard', val);
                          }}
                          className="w-7 bg-transparent text-right font-mono font-bold text-slate-200 focus:outline-none text-[9px]"
                        />
                        <span className="text-[8px] text-slate-500">L/s</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.1"
                      value={crossSection.inletCapacityStandard ?? 3.0}
                      onChange={(e) => handleSlider('inletCapacityStandard', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>

                  {/* 2. 大型桝 */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        ② 大型桝 (Large)
                      </span>
                      <div className="flex items-center gap-0.5 bg-slate-950 px-1 py-0.2 rounded border border-white/5">
                        <input
                          type="number"
                          min="2.0"
                          max="15.0"
                          step="0.1"
                          value={crossSection.inletCapacityLarge ?? 5.0}
                          onChange={(e) => {
                            const val = Math.max(2.0, Math.min(15.0, parseFloat(e.target.value) || 5.0));
                            handleSlider('inletCapacityLarge', val);
                          }}
                          className="w-7 bg-transparent text-right font-mono font-bold text-slate-200 focus:outline-none text-[9px]"
                        />
                        <span className="text-[8px] text-slate-500">L/s</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="2.0"
                      max="15.0"
                      step="0.1"
                      value={crossSection.inletCapacityLarge ?? 5.0}
                      onChange={(e) => handleSlider('inletCapacityLarge', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>

                  {/* 3. グレーチング桝 */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        ③ グレーチング (Grated)
                      </span>
                      <div className="flex items-center gap-0.5 bg-slate-950 px-1 py-0.2 rounded border border-white/5">
                        <input
                          type="number"
                          min="3.0"
                          max="20.0"
                          step="0.1"
                          value={crossSection.inletCapacityGrated ?? 7.0}
                          onChange={(e) => {
                            const val = Math.max(3.0, Math.min(20.0, parseFloat(e.target.value) || 7.0));
                            handleSlider('inletCapacityGrated', val);
                          }}
                          className="w-7 bg-transparent text-right font-mono font-bold text-slate-200 focus:outline-none text-[9px]"
                        />
                        <span className="text-[8px] text-slate-500">L/s</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="3.0"
                      max="20.0"
                      step="0.1"
                      value={crossSection.inletCapacityGrated ?? 7.0}
                      onChange={(e) => handleSlider('inletCapacityGrated', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>

                  {/* 4. 高吸込型桝 */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                        ④ 高吸込型 (High Capacity)
                      </span>
                      <div className="flex items-center gap-0.5 bg-slate-950 px-1 py-0.2 rounded border border-white/5">
                        <input
                          type="number"
                          min="5.0"
                          max="30.0"
                          step="0.5"
                          value={crossSection.inletCapacityHighCapacity ?? 10.0}
                          onChange={(e) => {
                            const val = Math.max(5.0, Math.min(30.0, parseFloat(e.target.value) || 10.0));
                            handleSlider('inletCapacityHighCapacity', val);
                          }}
                          className="w-7 bg-transparent text-right font-mono font-bold text-slate-200 focus:outline-none text-[9px]"
                        />
                        <span className="text-[8px] text-slate-500">L/s</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="5.0"
                      max="30.0"
                      step="0.5"
                      value={crossSection.inletCapacityHighCapacity ?? 10.0}
                      onChange={(e) => handleSlider('inletCapacityHighCapacity', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded appearance-none"
                    />
                  </div>
                </div>

                {/* 💾 設定保存アクションボタン */}
                <button
                  type="button"
                  onClick={handleSaveDrainageSettings}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all text-white font-extrabold text-[10px] rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/10 cursor-pointer min-h-[44px]"
                  title="現在の集水桝配置間隔および各タイプの排水処理能力（L/s）設計値をブラウザに保存します"
                >
                  <Check className="w-3.5 h-3.5 text-blue-200" />
                  集水桝の排水能力・配置設定を保存
                </button>

              </div>
            )}
          </div>

        </div>

      </div>
      ) : (
        /* 新機能：各測点複数の横断図を配置確認できるグリッドビュー */
        <div className={`glass-panel rounded-xl p-5 flex flex-col ${layoutMode === 'cross' ? 'flex-1 min-h-[520px]' : 'h-[380px]'} overflow-hidden bg-slate-950/20 border border-white/10`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                全測点一括横断配置ビューア (複数横断図の確認・比較)
              </span>
            </div>
            <span className="text-[9px] text-slate-500 font-mono">
              ※ 各測点カードをクリックすると、その測点を中心とした「断面パターン設計」に即座に切り替わります
            </span>
          </div>

          {/* グリッド本体（スクロール可能） */}
          <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 min-h-0">
            {stations.map((s, idx) => {
              // 各測点の個別横断データを算出
              const sData = generateCrossSectionData(s.distance, s.z, s.groundZ);
              if (!sData) return null;

              const isCurrent = Math.abs(s.distance - selectedStationDist) < 0.1;
              const diff = s.z - s.groundZ; // 計画高 - 地盤高

              return (
                <div
                  key={`multi-cross-${idx}`}
                  onClick={() => {
                    setSelectedStationDist(s.distance);
                    setCrossSectionTabMode('pattern');
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2.5 ${
                    isCurrent
                      ? 'bg-blue-950/20 border-blue-500/80 shadow-lg shadow-blue-500/10'
                      : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/60 hover:border-white/10'
                  }`}
                >
                  {/* カードヘッダー */}
                  <div className="flex items-center justify-between shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 font-extrabold rounded font-mono ${
                      isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {s.name}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      単距離: {s.distance.toFixed(1)}m
                    </span>
                  </div>

                  {/* SVGミニプレビュー */}
                  <div className="bg-slate-950/70 rounded-lg p-2 flex items-center justify-center relative border border-white/5 h-[110px] shrink-0">
                    <svg className="w-full h-full" viewBox="0 0 400 160">
                      {sData.sectionType === 'earthwork' ? (
                        <>
                          {/* 盛土・切土ハッチング */}
                          <polygon 
                            points={sData.hatchPointsStr} 
                            fill={sData.isFill ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)'} 
                            stroke="none" 
                          />

                          {/* 道路構造：舗装、路盤、路床 */}
                          <polygon points={sData.subgradePolygonPointsStr} fill="rgba(120, 113, 108, 0.2)" stroke="rgba(120, 113, 108, 0.3)" strokeWidth="0.5" />
                          <polygon points={sData.basePolygonPointsStr} fill="rgba(217, 119, 6, 0.1)" stroke="rgba(217, 119, 6, 0.2)" strokeWidth="0.5" />
                          <polygon points={sData.pavePolygonPointsStr} fill="rgba(71, 85, 105, 0.6)" stroke="rgba(100, 116, 139, 0.4)" strokeWidth="0.5" />

                          {/* 法面（Slope） */}
                          <path d={sData.leftSlopePathStr} stroke={sData.isFill ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" />
                          <path d={sData.rightSlopePathStr} stroke={sData.isFill ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" />

                          {/* 擁壁（存在する場合） */}
                          {sData.leftStructurePolyStr && (
                            <polygon points={sData.leftStructurePolyStr} fill={sData.leftStruct === 'gravity' ? '#475569' : '#334155'} />
                          )}
                          {sData.rightStructurePolyStr && (
                            <polygon points={sData.rightStructurePolyStr} fill={sData.rightStruct === 'gravity' ? '#475569' : '#334155'} />
                          )}
                        </>
                      ) : (
                        sData.bridgeStructureHtml
                      )}

                      {/* 道路面ライン */}
                      <path d={sData.roadPathStr} fill="none" stroke="#ffffff" strokeWidth="1.5" />

                      {/* 地盤線 */}
                      <path d={sData.groundPathStr} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
                    </svg>

                    {/* ミニバッジ */}
                    <div className="absolute bottom-1 right-1 flex gap-1">
                      <span className={`text-[8px] font-bold px-1 py-0.2 rounded-sm font-mono ${
                        sData.isFill ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>
                        {sData.isFill ? '盛土' : '切土'}
                      </span>
                      <span className="text-[8px] bg-slate-900/80 text-slate-400 font-bold px-1 py-0.2 rounded-sm font-mono">
                        {sData.sectionType === 'earthwork' ? '土工' : sData.sectionType === 'bridge' ? '橋梁' : sData.sectionType === 'viaduct' ? '高架' : 'トンネル'}
                      </span>
                    </div>
                  </div>

                  {/* 数値諸元表 */}
                  <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono border-t border-white/5 pt-1.5 mt-0.5 shrink-0">
                    <div className="flex justify-between">
                      <span className="text-slate-500">計画高FH:</span>
                      <span className="text-emerald-400 font-bold">{s.z.toFixed(2)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">地盤高GH:</span>
                      <span className="text-slate-400 font-bold">{s.groundZ.toFixed(2)}m</span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-slate-500">切盛高低差:</span>
                      <span className={`font-bold ${diff >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                        {diff >= 0 ? `盛土 +${diff.toFixed(2)}m` : `切土 ${diff.toFixed(2)}m`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  )}

      {/* 🪟 横断形状クイック可視化ポップアップカード */}
      {showSectionPopup && crossSectionSVG && currentProfilePoint && (
        <div className="fixed md:absolute bottom-6 right-6 z-50 w-[90%] max-w-[340px] bg-slate-950/95 backdrop-blur-md border border-emerald-500/40 p-4 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.15)] flex flex-col gap-3 animate-fade-in text-slate-200">
          {/* ヘッダー */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold font-sans tracking-wide">
                測点断面クイックプレビュー
              </span>
            </div>
            <button 
              onClick={() => setShowSectionPopup(false)}
              className="p-1 hover:bg-white/10 rounded-md transition-colors text-slate-400 hover:text-white"
              title="プレビューを閉じる"
            >
              <span className="text-xs font-mono font-bold">✕</span>
            </button>
          </div>

          {/* 基本諸元バッジ等 */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-extrabold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/20">
              {activeStation ? activeStation.name : 'No.0'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              追加距離: {selectedStationDist.toFixed(1)}m
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-sans ${
              crossSectionSVG.isFill ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'
            }`}>
              {crossSectionSVG.isFill ? '盛土 (Fill)' : '切土 (Cut)'}
            </span>
          </div>

          {/* SVG簡易可視化 */}
          <div className="bg-slate-900/80 rounded-lg p-2 flex items-center justify-center relative border border-white/5 h-[120px] select-none">
            <svg className="w-full h-full" viewBox="0 0 400 160">
              {crossSectionSVG.sectionType === 'earthwork' ? (
                <>
                  {/* 盛土・切土ハッチング */}
                  <polygon 
                    points={crossSectionSVG.hatchPointsStr} 
                    fill={crossSectionSVG.isFill ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)'} 
                    stroke="none" 
                  />

                  {/* 道路構造：舗装、路盤、路床 */}
                  <polygon points={crossSectionSVG.subgradePolygonPointsStr} fill="rgba(120, 113, 108, 0.2)" stroke="rgba(120, 113, 108, 0.3)" strokeWidth="0.5" />
                  <polygon points={crossSectionSVG.basePolygonPointsStr} fill="rgba(217, 119, 6, 0.1)" stroke="rgba(217, 119, 6, 0.2)" strokeWidth="0.5" />
                  <polygon points={crossSectionSVG.pavePolygonPointsStr} fill="rgba(71, 85, 105, 0.6)" stroke="rgba(100, 116, 139, 0.4)" strokeWidth="0.5" />

                  {/* 法面（Slope） */}
                  <path d={crossSectionSVG.leftSlopePathStr} stroke={crossSectionSVG.isFill ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" />
                  <path d={crossSectionSVG.rightSlopePathStr} stroke={crossSectionSVG.isFill ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" />

                  {/* 擁壁（存在する場合） */}
                  {crossSectionSVG.leftStructurePolyStr && (
                    <polygon points={crossSectionSVG.leftStructurePolyStr} fill={crossSectionSVG.leftStruct === 'gravity' ? '#475569' : '#334155'} />
                  )}
                  {crossSectionSVG.rightStructurePolyStr && (
                    <polygon points={crossSectionSVG.rightStructurePolyStr} fill={crossSectionSVG.rightStruct === 'gravity' ? '#475569' : '#334155'} />
                  )}
                </>
              ) : (
                crossSectionSVG.bridgeStructureHtml
              )}

              {/* 道路面ライン */}
              <path d={crossSectionSVG.roadPathStr} fill="none" stroke="#ffffff" strokeWidth="1.5" />

              {/* 地盤線 */}
              <path d={crossSectionSVG.groundPathStr} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
            </svg>
            
            {/* 構造バッジ */}
            <div className="absolute bottom-1 right-1">
              <span className="text-[8px] bg-slate-950/80 border border-white/10 text-slate-400 font-bold px-1.5 py-0.5 rounded font-mono">
                {crossSectionSVG.sectionType === 'earthwork' ? '土工断面' : crossSectionSVG.sectionType === 'bridge' ? '橋梁構造' : crossSectionSVG.sectionType === 'viaduct' ? '高架橋構造' : 'トンネル覆工'}
              </span>
            </div>
          </div>

          {/* 断面詳細データ */}
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono border-t border-white/5 pt-2">
            <div className="flex flex-col gap-0.5 bg-slate-900/40 p-1.5 rounded border border-white/5">
              <span className="text-slate-500 font-semibold text-[8px] uppercase tracking-wider">計画高 (FH)</span>
              <span className="text-slate-200 font-bold text-xs">{currentProfilePoint.z.toFixed(2)}m</span>
            </div>
            <div className="flex flex-col gap-0.5 bg-slate-900/40 p-1.5 rounded border border-white/5">
              <span className="text-slate-500 font-semibold text-[8px] uppercase tracking-wider">地盤高 (GH)</span>
              <span className="text-slate-200 font-bold text-xs">{currentProfilePoint.groundZ.toFixed(2)}m</span>
            </div>
            <div className="col-span-2 flex justify-between items-center bg-slate-900/60 p-2 rounded border border-white/5">
              <span className="text-slate-400 font-semibold text-[9px]">切盛差高:</span>
              <span className={`font-bold text-xs ${crossSectionSVG.isFill ? 'text-red-400' : 'text-blue-400'}`}>
                {crossSectionSVG.isFill ? `盛土 +${crossSectionSVG.heightDiffText}` : `切土 -${crossSectionSVG.heightDiffText}`}
              </span>
            </div>
          </div>

          {/* 舗装・のり面等構成スペック */}
          <div className="text-[9px] text-slate-400 font-sans border-t border-white/5 pt-2 flex flex-col gap-1">
            <div className="flex justify-between">
              <span>舗装構成:</span>
              <span className="font-mono text-slate-300">表層 {(crossSection.pavementThickness || 0.15) * 100}cm / 路盤 {(crossSection.baseThickness || 0.30) * 100}cm</span>
            </div>
            <div className="flex justify-between">
              <span>のり面勾配:</span>
              <span className="font-mono text-slate-300">1 : {crossSectionSVG.isFill ? (crossSection.fillSlopeGradient ?? 1.5).toFixed(1) : (crossSection.cutSlopeGradient ?? 1.0).toFixed(1)}</span>
            </div>
            {crossSectionSVG.sectionType === 'earthwork' && (
              <div className="flex justify-between">
                <span>構造物 (左/右):</span>
                <span className="font-mono text-slate-300">
                  {crossSectionSVG.leftStruct === 'gravity' ? '重力擁壁' : crossSectionSVG.leftStruct === 'block' ? 'ブロック積' : 'のり面'} / {crossSectionSVG.rightStruct === 'gravity' ? '重力擁壁' : crossSectionSVG.rightStruct === 'block' ? 'ブロック積' : 'のり面'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 閉じた時の再表示ボタン */}
      {!showSectionPopup && (
        <button
          onClick={() => setShowSectionPopup(true)}
          className="fixed md:absolute bottom-6 right-6 z-50 p-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:scale-105 transition-all cursor-pointer flex items-center gap-1.5"
          title="横断形状プレビューを開く"
        >
          <Layers className="w-4 h-4 animate-pulse" />
          <span className="text-[10px] font-bold tracking-wider uppercase pr-1">断面プレビュー</span>
        </button>
      )}

    </div>
  );
}
