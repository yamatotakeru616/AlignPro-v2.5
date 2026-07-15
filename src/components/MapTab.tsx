/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapPin, Sliders, Info, Map as MapIcon, Plus, Trash2, MoveUp, MoveDown, Compass, MousePointerClick, ZoomIn, ZoomOut, RotateCcw, Palette, RefreshCw, TrendingUp } from 'lucide-react';
import { ControlPoint, AlignmentPoint, StationPoint } from '../types';
import { getGroundElevation, xyToLngLat, lngLatToXY, setCustomGroundMap, clearCustomGroundMap, loadCustomGroundMapFromStorage } from '../utils';
import { RoadNetwork, AlignmentPlan, LODLevel, IntersectionType } from '../utils/network';

interface MapTabProps {
  points: ControlPoint[];
  onPointsChange: (newPoints: ControlPoint[]) => void;
  alignment: AlignmentPoint[];
  stations: StationPoint[];
  stationInterval: number;
  setStationInterval: (interval: number) => void;
  selectedStationDist: number;
  setSelectedStationDist: (dist: number) => void;
  contourInterval: number;
  setContourInterval: (interval: number) => void;
  performanceMode?: 'eco' | 'standard' | 'high';
  roadNetwork?: RoadNetwork;
  activeAlignmentId?: string;
  onSwitchAlignment?: (roadId: string) => void;
  onUpdateRoadMetadata?: (roadId: string, fromMeta: any, toMeta: any) => void;
  onAddAlignment?: (newRoad: AlignmentPlan) => void;
  onDeleteAlignment?: (roadId: string) => void;
  coordinateZone?: number;
}

export default function MapTab({ 
  points, 
  onPointsChange, 
  alignment,
  stations,
  stationInterval,
  setStationInterval,
  selectedStationDist,
  setSelectedStationDist,
  contourInterval,
  setContourInterval,
  performanceMode = 'standard',
  roadNetwork,
  activeAlignmentId,
  onSwitchAlignment,
  onUpdateRoadMetadata,
  onAddAlignment,
  onDeleteAlignment,
  coordinateZone = 2
}: MapTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // マップの表示・操作状態 (ズーム、パン、インタラクション)
  const [zoom, setZoom] = useState<number>(1.1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const [selectedPointId, setSelectedPointId] = useState<string | null>('BP');
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [showGradient, setShowGradient] = useState<boolean>(false);
  const [editingRoadId, setEditingRoadId] = useState<string | null>(null);
  const [editingRoadName, setEditingRoadName] = useState<string>('');

  // 計画道路上への吸着（スナップ）ガイド情報
  const [snapInfo, setSnapInfo] = useState<{
    x: number;
    y: number;
    distance: number;
    station: number;
    z: number;
    groundZ: number;
  } | null>(null);

  // キャンバスを直接囲むコンテナの参照
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  // 右サイドパネルのタブ切り替えステート (design: 道路設計パラメータ、gis: Web標高3D化＆現況インポーター)
  const [rightPanelTab, setRightPanelTab] = useState<'design' | 'gis'>('design');
  // GIS地形プリセットステート
  const [selectedGisPreset, setSelectedGisPreset] = useState<'fuji' | 'hakone' | 'yatsugatake' | 'kumano' | 'tokachi'>('fuji');
  // 標高データソース選択ステート ('gsi': 国土地理院 10mDEM, 'aist': 産総研シームレス標高, 'terrarium': Mapzen/AWS Terrarium)
  const [elevationSource, setElevationSource] = useState<'gsi' | 'aist' | 'terrarium'>(() => {
    return (localStorage.getItem('gis_elevation_source') as any) || 'gsi';
  });
  // 現在カスタム地形がインポートされているか
  const [isGisImported, setIsGisImported] = useState<boolean>(() => {
    return localStorage.getItem('gis_custom_ground_map') !== null;
  });

  // 地形インポートのシミュレータ＆適用関数 (選択したデータソースのデコード数式・物理スケールに準拠してレンダリング)
  const handleImportGisTerrain = (preset: typeof selectedGisPreset, sourceToUse = elevationSource) => {
    const width = 80;
    const height = 80;
    const data: number[] = [];

    // 各データソース毎のデコード特性・スケール係数・局所ノイズ
    // GSI (国土地理院): 実直で高精度
    // AIST (産総研): 岩石・地質境界を想定したシャープな強調
    // Terrarium: グローバルスケールの滑らかさと広域うねり
    let scaleCoeff = 1.0;
    let rockNoiseCoeff = 0.0;
    let globalWaveCoeff = 0.0;

    if (sourceToUse === 'aist') {
      scaleCoeff = 1.08; // 産総研シームレス標高 (岩盤地質による強調)
      rockNoiseCoeff = 1.2; // 微細なエッジ・クラックの表現
    } else if (sourceToUse === 'terrarium') {
      scaleCoeff = 0.92; // Terrarium (世界測地系補正による若干のなだらか化)
      globalWaveCoeff = 2.0; // 広域的なうねり
    }

    if (preset === 'fuji') {
      // 富士山麓（巨大な円錐火山＋緩やかな裾野）
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const dx = c - width / 2;
          const dy = r - height / 2;
          const dist = Math.sqrt(dx * dx + dy * dy);
          let h = Math.max(12, 75 - dist * 1.5 + Math.exp(-dist / 10) * 35);
          
          // ソース固有のレンダリング・デコード効果を適用
          h = h * scaleCoeff;
          if (rockNoiseCoeff > 0) {
            h += (Math.sin(c * 1.8) * Math.cos(r * 1.8)) * 0.4 * rockNoiseCoeff;
          }
          if (globalWaveCoeff > 0) {
            h += Math.sin(c / 8) * globalWaveCoeff;
          }
          data.push(parseFloat(h.toFixed(2)));
        }
      }
    } else if (preset === 'hakone') {
      // 箱根（外輪山と中央カルデラ凹地、芦ノ湖）
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const dx = c - width / 2;
          const dy = r - height / 2;
          const dist = Math.sqrt(dx * dx + dy * dy);
          let h = 38;
          if (dist < 22) {
            h = 24 + dist * 0.4;
          } else if (dist >= 22 && dist < 38) {
            h = 24 + (dist - 22) * 2.8;
          } else {
            h = 68 - (dist - 38) * 1.3;
          }
          const noise = Math.sin(c / 2.5) * 2.5;
          let finalH = Math.max(10, h + noise) * scaleCoeff;
          
          if (rockNoiseCoeff > 0) {
            finalH += (Math.sin(c * 2.2) * Math.sin(r * 2.2)) * 0.5 * rockNoiseCoeff;
          }
          if (globalWaveCoeff > 0) {
            finalH += Math.cos(r / 10) * globalWaveCoeff;
          }
          data.push(parseFloat(finalH.toFixed(2)));
        }
      }
    } else if (preset === 'yatsugatake') {
      // 八ヶ岳連峰（複数の隆起したピーク、急峻な山岳尾根）
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const h1 = Math.max(0, 52 - Math.sqrt((c - 28) ** 2 + (r - 24) ** 2) * 1.4);
          const h2 = Math.max(0, 68 - Math.sqrt((c - 52) ** 2 + (r - 54) ** 2) * 1.7);
          const noise = Math.sin(c / 3.5) * Math.cos(r / 3.5) * 4;
          let h = (18 + Math.max(h1, h2) + noise) * scaleCoeff;
          
          if (rockNoiseCoeff > 0) {
            h += (Math.sin(c * 1.2) * Math.cos(r * 1.5)) * 0.7 * rockNoiseCoeff; // 険しいゴツゴツした岩肌表現
          }
          if (globalWaveCoeff > 0) {
            h += Math.sin((c + r) / 12) * globalWaveCoeff;
          }
          data.push(parseFloat(h.toFixed(2)));
        }
      }
    } else if (preset === 'kumano') {
      // 熊野古道（斜めに深く切り裂くような急峻渓谷 V字谷）
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const lineVal = (c - r) * 0.55;
          const valley = Math.abs(lineVal - 8);
          let h = (14 + valley * 1.8 + Math.sin(c / 4) * 4.5 + Math.cos(r / 5) * 3.5) * scaleCoeff;
          
          if (rockNoiseCoeff > 0) {
            h += (Math.cos(c * 2.5) * Math.sin(r * 2.5)) * 0.6 * rockNoiseCoeff;
          }
          if (globalWaveCoeff > 0) {
            h += Math.cos(c / 6) * globalWaveCoeff;
          }
          data.push(parseFloat(h.toFixed(2)));
        }
      }
    } else if (preset === 'tokachi') {
      // 十勝平野（広大で非常に穏やかな緩斜面、平地）
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          let h = (26 + (c / width) * 5 + Math.sin(r / 12) * 1.2) * scaleCoeff;
          
          if (rockNoiseCoeff > 0) {
            h += (Math.sin(c * 3.0) * Math.cos(r * 3.0)) * 0.15 * rockNoiseCoeff; // 平地用の極めて微弱なブレ
          }
          if (globalWaveCoeff > 0) {
            h += Math.sin(r / 15) * 0.4 * globalWaveCoeff;
          }
          data.push(parseFloat(h.toFixed(2)));
        }
      }
    }

    // グローバル地形をセットしてlocalStorageに保存
    setCustomGroundMap(width, height, data);
    loadCustomGroundMapFromStorage();
    setIsGisImported(true);

    // 既存ポイントのZを再同期
    const updatedPoints = points.map(p => {
      const groundZ = parseFloat(getGroundElevation(p.x, p.y).toFixed(2));
      return { ...p, z: autoAlignZToGround ? groundZ : p.z };
    });
    onPointsChange(updatedPoints);
  };

  // タイルソースが変更された時のハンドラ
  const handleElevationSourceChange = (src: 'gsi' | 'aist' | 'terrarium') => {
    setElevationSource(src);
    localStorage.setItem('gis_elevation_source', src);
    if (isGisImported) {
      handleImportGisTerrain(selectedGisPreset, src);
    }
  };

  // 地形クリア
  const handleClearGisTerrain = () => {
    clearCustomGroundMap();
    loadCustomGroundMapFromStorage();
    setIsGisImported(false);

    // 既存ポイントのZを再同期
    const updatedPoints = points.map(p => {
      const groundZ = parseFloat(getGroundElevation(p.x, p.y).toFixed(2));
      return { ...p, z: autoAlignZToGround ? groundZ : p.z };
    });
    onPointsChange(updatedPoints);
  };

  // 計画高(Z)を現況(H)に自動追従させるトグルスイッチ (デフォルトON)
  const [autoAlignZToGround, setAutoAlignZToGround] = useState<boolean>(() => {
    const saved = localStorage.getItem('map_autoAlignZToGround');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('map_autoAlignZToGround', String(autoAlignZToGround));
  }, [autoAlignZToGround]);

  // autoAlignZToGroundがONの時、既存ポイントのZをその平面位置の現況地盤高に自動同期
  useEffect(() => {
    if (autoAlignZToGround) {
      let changed = false;
      const updatedPoints = points.map(p => {
        const groundZ = parseFloat(getGroundElevation(p.x, p.y).toFixed(2));
        if (Math.abs(p.z - groundZ) > 0.05) {
          changed = true;
          return { ...p, z: groundZ };
        }
        return p;
      });
      if (changed) {
        onPointsChange(updatedPoints);
      }
    }
  }, [autoAlignZToGround, points.map(p => `${p.x},${p.y}`).join('|')]); // 平面位置が変わったときも自動同期

  // 手動入力用のローカル座標・半径ステート (CAD入力操作性改善のため)
  const [inputX, setInputX] = useState<string>('');
  const [inputY, setInputY] = useState<string>('');
  const [inputR, setInputR] = useState<string>('');
  const [inputVcl, setInputVcl] = useState<string>('');
  
  // 日本道路構造令準拠の設計速度 (km/h) ステート
  const [designSpeed, setDesignSpeed] = useState<number>(40);

  const curPoint = points.find(p => p.id === selectedPointId);

  // 選択されている点が変更された場合、または座標が外部やドラッグで変更された場合に、入力欄のローカルステートを同期
  useEffect(() => {
    if (curPoint) {
      setInputX(Math.round(curPoint.x).toString());
      setInputY(Math.round(curPoint.y).toString());
      setInputR(curPoint.r !== undefined ? Math.round(curPoint.r).toString() : '0');
      setInputVcl(curPoint.vcl !== undefined ? Math.round(curPoint.vcl).toString() : '0');
    } else {
      setInputX('');
      setInputY('');
      setInputR('');
      setInputVcl('');
    }
  }, [selectedPointId, curPoint?.x, curPoint?.y, curPoint?.r, curPoint?.vcl]);

  // 日本道路構造令 基準値スペック
  const roadSpecs = useMemo(() => {
    const specs: Record<number, {
      maxSlope: number;
      specSlope: number;
      minVcl: number;
      specVcl: number;
      minCrestR: number;
      specCrestR: number;
      minSagR: number;
      specSagR: number;
      minS: number;
      reqDeltaI: number;
    }> = {
      30: { maxSlope: 8, specSlope: 10, minVcl: 25, specVcl: 15, minCrestR: 250, specCrestR: 100, minSagR: 250, specSagR: 100, minS: 30, reqDeltaI: 1.5 },
      40: { maxSlope: 7, specSlope: 9, minVcl: 35, specVcl: 20, minCrestR: 450, specCrestR: 250, minSagR: 450, specSagR: 250, minS: 40, reqDeltaI: 1.5 },
      50: { maxSlope: 6, specSlope: 8, minVcl: 40, specVcl: 30, minCrestR: 800, specCrestR: 400, minSagR: 700, specSagR: 350, minS: 55, reqDeltaI: 1.5 },
      60: { maxSlope: 5, specSlope: 7, minVcl: 50, specVcl: 35, minCrestR: 1400, specCrestR: 700, minSagR: 1000, specSagR: 450, minS: 75, reqDeltaI: 1.0 },
    };
    return specs[designSpeed] || specs[40];
  }, [designSpeed]);

  // アライメント全体の最大縦断勾配チェック
  const checkMaxSlope = useMemo(() => {
    if (alignment.length < 2) return { value: 0, status: 'OK', text: 'データなし' };
    let maxS = 0;
    for (let i = 0; i < alignment.length - 1; i++) {
      const p1 = alignment[i];
      const p2 = alignment[i + 1];
      const dRange = p2.distance - p1.distance;
      if (dRange > 0.1) {
        const slope = (Math.abs(p2.z - p1.z) / dRange) * 100;
        if (slope > maxS) maxS = slope;
      }
    }
    
    let status = 'OK';
    let text = `最大勾配: ${maxS.toFixed(1)}% (基準 ${roadSpecs.maxSlope}% 以内)`;
    if (maxS > roadSpecs.specSlope) {
      status = 'NG';
      text = `最大勾配: ${maxS.toFixed(1)}% (不適合: 特例値 ${roadSpecs.specSlope}% 超過)`;
    } else if (maxS > roadSpecs.maxSlope) {
      status = 'WARN';
      text = `最大勾配: ${maxS.toFixed(1)}% (特例値合格: 標準値 ${roadSpecs.maxSlope}% 超過)`;
    }
    return { value: maxS, status, text };
  }, [alignment, roadSpecs]);

  // 現在選択中のIP（VPI）における縦断設計チェック（VCL、R、視距）
  const checkVpiDesign = useMemo(() => {
    if (!curPoint || curPoint.id === 'BP' || curPoint.id === 'EP') return null;

    const idx = points.findIndex(p => p.id === curPoint.id);
    if (idx <= 0 || idx >= points.length - 1) return null;

    const getIpDist = (pId: string) => {
      const pt = points.find(p => p.id === pId);
      if (!pt) return 0;
      let minD = Infinity;
      let closestDist = 0;
      alignment.forEach(a => {
        const d = Math.sqrt((a.x - pt.x) ** 2 + (a.y - pt.y) ** 2);
        if (d < minD) {
          minD = d;
          closestDist = a.distance;
        }
      });
      return closestDist;
    };

    const distPrev = getIpDist(points[idx - 1].id);
    const distCurr = getIpDist(curPoint.id);
    const distNext = getIpDist(points[idx + 1].id);

    const dRange1 = distCurr - distPrev;
    const dRange2 = distNext - distCurr;

    const g1 = dRange1 > 0.1 ? (curPoint.z - points[idx - 1].z) / dRange1 : 0;
    const g2 = dRange2 > 0.1 ? (points[idx + 1].z - curPoint.z) / dRange2 : 0;

    const deltaI = (g2 - g1) * 100; // 勾配代数差 (%)
    const absDeltaI = Math.abs(deltaI);
    const isCrest = deltaI < 0; // 凸型

    const vcl = curPoint.vcl || 0;
    const isVclRequired = absDeltaI >= roadSpecs.reqDeltaI;

    let vclStatus = 'OK';
    let vclText = `勾配代数差が小さいため不要 (代数差 ${absDeltaI.toFixed(2)}% < 基準 ${roadSpecs.reqDeltaI}%)`;
    if (isVclRequired) {
      if (vcl === 0) {
        vclStatus = 'NG';
        vclText = `縦断曲線が未挿入です (代数差 ${absDeltaI.toFixed(2)}% ≧ 基準 ${roadSpecs.reqDeltaI}%)`;
      } else if (vcl < roadSpecs.specVcl) {
        vclStatus = 'NG';
        vclText = `VCL: ${vcl}m (不適合: 最小値 ${roadSpecs.specVcl}m 未満)`;
      } else if (vcl < roadSpecs.minVcl) {
        vclStatus = 'WARN';
        vclText = `VCL: ${vcl}m (特例値合格: 標準値 ${roadSpecs.minVcl}m 未満)`;
      } else {
        vclStatus = 'OK';
        vclText = `VCL: ${vcl}m (合格: 標準値 ${roadSpecs.minVcl}m 以上)`;
      }
    }

    let rVert = 0;
    let rStatus = 'OK';
    let rText = '縦断曲線がありません';
    let ssdText = '縦断曲線がありません';
    let ssdStatus = 'OK';

    if (vcl > 0) {
      rVert = absDeltaI > 0.05 ? vcl / (absDeltaI / 100) : 99999;
      
      const reqR = isCrest ? roadSpecs.minCrestR : roadSpecs.minSagR;
      const specR = isCrest ? roadSpecs.specCrestR : roadSpecs.specSagR;

      if (rVert < specR) {
        rStatus = 'NG';
        rText = `${isCrest ? '凸型' : '凹型'}半径 R: ${rVert.toFixed(0)}m (不適合: 最小値 ${specR}m 未満)`;
      } else if (rVert < reqR) {
        rStatus = 'WARN';
        rText = `${isCrest ? '凸型' : '凹型'}半径 R: ${rVert.toFixed(0)}m (特例値合格: 標準値 ${reqR}m 未満)`;
      } else {
        rStatus = 'OK';
        rText = `${isCrest ? '凸型' : '凹型'}半径 R: ${rVert.toFixed(0)}m (合格: 標準値 ${reqR}m 以上)`;
      }

      if (isCrest) {
        const ssdEst = Math.sqrt(3.91 * rVert);
        if (ssdEst < roadSpecs.minS) {
          ssdStatus = 'NG';
          ssdText = `確保視距: ${ssdEst.toFixed(1)}m (不適合: 必要視距 ${roadSpecs.minS}m 未満)`;
        } else {
          ssdStatus = 'OK';
          ssdText = `確保視距: ${ssdEst.toFixed(1)}m (合格: 必要視距 ${roadSpecs.minS}m 以上)`;
        }
      } else {
        ssdStatus = 'OK';
        ssdText = `凹型のため前照灯照射良好 (視認距離確保)`;
      }
    }

    return {
      deltaI,
      absDeltaI,
      isCrest,
      rVert,
      isVclRequired,
      vclStatus,
      vclText,
      rStatus,
      rText,
      ssdStatus,
      ssdText,
    };
  }, [curPoint, points, alignment, roadSpecs]);

  // 実標高データに基づく精密な等高線（コンター）セグメントの事前計算（3Dビューと完璧に一致）
  const contourSegments = useMemo(() => {
    const isDragActive = isDragging !== null;
    
    // ecoモードかつパン/ドラッグ中は完全に計算をサスペンドして負荷をカット
    if (performanceMode === 'eco' && (isDragActive || isPanning)) {
      return [];
    }
    
    // ドラッグ中（アライメント変更中）は、全モードにおいて等高線の計算負荷を100%カットして線形変更の追従性を優先
    // ただし、highモードで余裕がある場合のみ、極めて粗いプレビューのみを許容。それ以外は完全に空にする
    if (isDragActive) {
      if (performanceMode !== 'high') {
        return [];
      }
    }

    const segments: { p1: { x: number; y: number }; p2: { x: number; y: number }; elevation: number }[] = [];
    if (!alignment || alignment.length === 0) return segments;

    // 線形全体が入るエリアを計算（3Dビューと同じバウンディングボックス）
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of alignment) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const buffer = 400;
    minX -= buffer;
    maxX += buffer;
    minY -= buffer;
    maxY += buffer;

    // 段階的スロットリングによるグリッド解像度 (cols / rows) の決定（中間負荷対応）
    let cols = 25;
    let rows = 25;

    if (performanceMode === 'high') {
      if (isDragActive) {
        cols = 8;
        rows = 8;
      } else if (isPanning) {
        cols = 25; // highモード時、パン中はstandard静止時レベルに落として中間負荷を最適化
        rows = 25;
      } else {
        cols = 40;
        rows = 40;
      }
    } else if (performanceMode === 'standard') {
      if (isPanning) {
        cols = 12; // standardモード時、パン中は超粗くしてスムーズな操作を確保
        rows = 12;
      } else {
        cols = 25;
        rows = 25;
      }
    } else { // ecoモード
      cols = 12; // ecoモードは静止時でも最小限の解像度で瞬時計算
      rows = 12;
    }
    
    const dx = (maxX - minX) / cols;
    const dy = (maxY - minY) / rows;

    // グリッド点の標高を事前計算
    const grid: { x: number; y: number; z: number }[][] = [];
    for (let r = 0; r <= rows; r++) {
      const rowData = [];
      const currentY = minY + r * dy;
      for (let c = 0; c <= cols; c++) {
        const currentX = minX + c * dx;
        const h = getGroundElevation(currentX, currentY);
        rowData.push({ x: currentX, y: currentY, z: h });
      }
      grid.push(rowData);
    }

    // 標高の最小最大
    let tempMinH = Infinity;
    let tempMaxH = -Infinity;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const z = grid[r][c].z;
        if (z < tempMinH) tempMinH = z;
        if (z > tempMaxH) tempMaxH = z;
      }
    }

    // 段階的スロットリングによる等高線抽出ピッチ (interval) の決定
    let interval = contourInterval;
    if (isDragActive) {
      interval = contourInterval * 5; // ドラッグ中は極めて粗い等高線のみ
    } else if (isPanning) {
      if (performanceMode === 'high') {
        interval = contourInterval * 2; // highモード時、パン中はピッチを2倍に間引く
      } else {
        interval = contourInterval * 3; // standardモード時、パン中はピッチを3倍に間引く
      }
    } else if (performanceMode === 'eco') {
      interval = contourInterval * 2; // ecoモードは静止時もピッチを2倍に
    }

    const startH = Math.ceil(tempMinH / interval) * interval;
    const endH = Math.floor(tempMaxH / interval) * interval;

    // 3Dと全く同じ三角メッシュ補間ロジックによる等高線抽出
    for (let h_c = startH; h_c <= endH; h_c += interval) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p00 = grid[r][c];
          const p10 = grid[r][c + 1];
          const p01 = grid[r + 1][c];
          const p11 = grid[r + 1][c + 1];

          const checkTriangle = (v0: typeof p00, v1: typeof p00, v2: typeof p00) => {
            const pts: { x: number; y: number }[] = [];
            if ((v0.z <= h_c && v1.z > h_c) || (v1.z <= h_c && v0.z > h_c)) {
              const t = (h_c - v0.z) / (v1.z - v0.z);
              pts.push({
                x: v0.x + (v1.x - v0.x) * t,
                y: v0.y + (v1.y - v0.y) * t
              });
            }
            if ((v1.z <= h_c && v2.z > h_c) || (v2.z <= h_c && v1.z > h_c)) {
              const t = (h_c - v1.z) / (v2.z - v1.z);
              pts.push({
                x: v1.x + (v2.x - v1.x) * t,
                y: v1.y + (v2.y - v1.y) * t
              });
            }
            if ((v2.z <= h_c && v0.z > h_c) || (v0.z <= h_c && v2.z > h_c)) {
              const t = (h_c - v2.z) / (v0.z - v2.z);
              pts.push({
                x: v2.x + (v0.x - v2.x) * t,
                y: v2.y + (v0.y - v2.y) * t
              });
            }
            if (pts.length >= 2) {
              segments.push({
                p1: pts[0],
                p2: pts[1],
                elevation: h_c
              });
            }
          };

          checkTriangle(p00, p01, p10);
          checkTriangle(p10, p01, p11);
        }
      }
    }

    return segments;
  }, [alignment, contourInterval, performanceMode, isGisImported, isDragging, isPanning]);

  // ResizeObserverを用いたキャンバスの物理サイズ追従（マジックナンバー排除・レスポンシブ完全対応）
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: width || 600,
          height: height || 400,
        });
      }
    });

    resizeObserver.observe(container);

    // 初期化取得
    setDimensions({
      width: container.clientWidth || 600,
      height: container.clientHeight || 400,
    });

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // グローバルなマウスアップ・タッチエンド監視（キャンバス外でマウスボタンが離された場合のドラッグ自動解除）
  useEffect(() => {
    if (!isDragging && !isPanning) return;

    const handleGlobalUp = () => {
      handleEnd();
    };

    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);

    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [isDragging, isPanning]);

  // モデル（メートル座標）から画面（ピクセル座標）への変換
  const toScreen = (mx: number, my: number) => {
    const cx = dimensions.width / 2 + pan.x;
    const cy = dimensions.height / 2 + pan.y;
    return {
      x: cx + mx * zoom,
      y: cy - my * zoom, // 測量はY上が多いため反転
    };
  };

  // 画面（ピクセル座標）からモデル（メートル座標）への変換
  const toModel = (sx: number, sy: number) => {
    const cx = dimensions.width / 2 + pan.x;
    const cy = dimensions.height / 2 + pan.y;
    return {
      x: (sx - cx) / zoom,
      y: (cy - sy) / zoom, // 反転
    };
  };

  // ２点間の距離を計算する
  const getDistance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };

  // 新点に最も近い「折れ線セグメント」のインデックスを特定
  const getClosestSegmentIndex = (px: number, py: number, pts: ControlPoint[]): number => {
    let minDistance = Infinity;
    let bestIndex = 0; // このインデックスの直後に挿入

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const l2 = dx * dx + dy * dy;
      
      let t = 0;
      if (l2 > 0) {
        t = ((px - p1.x) * dx + (py - p1.y) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
      }
      
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
      
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = i;
      }
    }
    return bestIndex;
  };

  // 制御点の ID と 名前を美しく連番に並べ替え・整理する
  const reorganizePoints = (rawPoints: ControlPoint[]): ControlPoint[] => {
    if (rawPoints.length < 2) return rawPoints;
    const bp = { ...rawPoints[0], id: 'BP', name: '始点 (BP)' };
    const ep = { ...rawPoints[rawPoints.length - 1], id: 'EP', name: '終点 (EP)' };
    
    const ips = rawPoints.slice(1, rawPoints.length - 1).map((p, idx) => ({
      ...p,
      id: `IP${idx + 1}`,
      name: `交点 (IP${idx + 1})`,
    }));
    
    return [bp, ...ips, ep];
  };

  // キャンバス描画リアルタイムレンダラー
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 高解像度ディスプレイ（Retina/スマホ）対応
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const cx = dimensions.width / 2 + pan.x;
    const cy = dimensions.height / 2 + pan.y;

    // 1. 背景描画 (Sophisticated Dark グリッド)
    ctx.fillStyle = '#060a13';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // 2. グリッド線描画（パンとズームに連動）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    
    // グリッドサイズをズーム比率に応じて動的に可変
    let gridSize = 40;
    if (zoom > 3) gridSize = 10;
    else if (zoom < 0.5) gridSize = 100;
    
    const gridStep = gridSize * zoom;
    
    // X軸のグリッド線
    const startX = cx % gridStep;
    for (let x = startX; x < dimensions.width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();
    }
    
    // Y軸のグリッド線
    const startY = cy % gridStep;
    for (let y = startY; y < dimensions.height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
    }

    // 3. 原点クロスヘア
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, dimensions.height);
    ctx.moveTo(0, cy); ctx.lineTo(dimensions.width, cy);
    ctx.stroke();

    // 5. 補助折れ線 (BP -> IP1 -> IP2 ... -> EP)
    if (points.length >= 2) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const p0 = toScreen(points[0].x, points[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < points.length; i++) {
        const p = toScreen(points[i].x, points[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]); // 点線リセット
    }

    // 5.5. 非アクティブ路線の簡易描画（LOD制御）
    if (roadNetwork && roadNetwork.alignments) {
      Object.keys(roadNetwork.alignments).forEach(roadId => {
        if (roadId === activeAlignmentId) return; // アクティブ路線は後で詳細に描画
        const road = roadNetwork.alignments[roadId];
        if (!road.visible || road.points.length < 2) return;

        // 非アクティブ路線は、制御点を結ぶ細い半透明の破線・実線として描画し、LODを保護
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'; // 落ち着いた半透明グレー
        ctx.lineWidth = 2.0;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const p0Scr = toScreen(road.points[0].x, road.points[0].y);
        ctx.moveTo(p0Scr.x, p0Scr.y);
        for (let i = 1; i < road.points.length; i++) {
          const scr = toScreen(road.points[i].x, road.points[i].y);
          ctx.lineTo(scr.x, scr.y);
        }
        ctx.stroke();
        ctx.setLineDash([]); // 点線リセット

        // 起終点のみ小さな丸と名前を表示
        const startScr = toScreen(road.points[0].x, road.points[0].y);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.beginPath();
        ctx.arc(startScr.x, startScr.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // 路線名ラベル
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '8px var(--font-sans)';
        ctx.fillText(road.name, startScr.x + 8, startScr.y - 4);
      });
    }

    // 6. 滑らかな計画アライメント（alignment 配列の全点を綺麗に実線で繋ぐ）
    if (alignment.length > 0) {
      if (showGradient) {
        // 勾配に応じたヒートマップ（色分け）描画
        ctx.lineWidth = 5.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 勾配に応じたカラーを算出するヘルパー
        const getSlopeColor = (slopeVal: number) => {
          const absSlope = Math.abs(slopeVal);
          // 道路設計基準：0% (緑) -> 8%以上 (赤) で色をスムーズに変化させる
          const t = Math.min(1.0, absSlope / 8.0); // 8%で最大（赤）
          
          // HSLで緑(120)から赤(0)へ補間
          const hue = (1.0 - t) * 120;
          return `hsl(${hue}, 90%, 50%)`;
        };

        for (let i = 1; i < alignment.length; i++) {
          const pPrev = alignment[i - 1];
          const pCurr = alignment[i];

          const pPrevScr = toScreen(pPrev.x, pPrev.y);
          const pCurrScr = toScreen(pCurr.x, pCurr.y);

          const dz = pCurr.z - pPrev.z;
          const ds = pCurr.distance - pPrev.distance;
          const slopePercent = ds > 0.05 ? (dz / ds) * 100 : 0;

          const color = getSlopeColor(slopePercent);
          
          ctx.strokeStyle = color;
          // 微細なグローエフェクト
          ctx.shadowColor = color;
          ctx.shadowBlur = 4;

          ctx.beginPath();
          ctx.moveTo(pPrevScr.x, pPrevScr.y);
          ctx.lineTo(pCurrScr.x, pCurrScr.y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0; // シャドウ解除
      } else {
        ctx.strokeStyle = '#3b82f6'; // ビビッドブルー
        ctx.lineWidth = 4.5;
        ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        
        const p0Scr = toScreen(alignment[0].x, alignment[0].y);
        ctx.moveTo(p0Scr.x, p0Scr.y);
        
        for (let i = 1; i < alignment.length; i++) {
          const scr = toScreen(alignment[i].x, alignment[i].y);
          ctx.lineTo(scr.x, scr.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // シャドウ解除
      }
    }

    // 6.3. 交差点・立体交差ノードの描画
    if (roadNetwork && roadNetwork.intersections) {
      roadNetwork.intersections.forEach(node => {
        const scr = toScreen(node.intersectionX, node.intersectionY);
        
        // 交差の種類（平面か立体か）によってマーカーを切り替え
        const isGrade = node.type === 'CROSSROAD';
        ctx.fillStyle = isGrade ? 'rgba(249, 115, 22, 0.2)' : 'rgba(168, 85, 247, 0.2)'; // オレンジ vs パープル
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isGrade ? '#f97316' : '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 7, 0, Math.PI * 2);
        ctx.stroke();

        // ノードの中心
        ctx.fillStyle = isGrade ? '#f97316' : '#a855f7';
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // 交差ラベル
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 8.5px var(--font-sans)';
        const labelText = node.type === 'CROSSROAD' ? '平面交差' : (node.type === 'OVERPASS' ? '跨道(上)' : '跨道(下)');
        ctx.fillText(`${labelText}`, scr.x + 10, scr.y + 3);

        ctx.fillStyle = isGrade ? '#f97316' : '#c084fc';
        ctx.fillText(`${labelText}`, scr.x + 9, scr.y + 2);
      });
    }

    // 6.5. 道路測点 (Station Marks: No.0, No.1...) のリアルタイム精密描画
    if (stations && stations.length > 0) {
      stations.forEach(s => {
        const scr = toScreen(s.x, s.y);
        const isSelected = Math.abs(s.distance - selectedStationDist) < 0.1;

        // 選択されている測点には美しいゴールドの脈動光風リングを表示
        if (isSelected) {
          ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, 15, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#eab308'; // ゴールド
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 測点中心点のプロット
        ctx.fillStyle = isSelected ? '#eab308' : 'rgba(255, 255, 255, 0.7)';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, isSelected ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 測点名ラベリング
        ctx.fillStyle = '#000000';
        ctx.font = isSelected ? 'bold 9.5px monospace' : '8px monospace';
        ctx.fillText(s.name, scr.x + 8, scr.y + 3.5);

        ctx.fillStyle = isSelected ? '#eab308' : 'rgba(255, 255, 255, 0.5)';
        ctx.fillText(s.name, scr.x + 7, scr.y + 2.5);
      });
    }

    // 7. マウス吸着（スナップ）ガイドの描画
    if (snapInfo) {
      const snapScr = toScreen(snapInfo.x, snapInfo.y);
      
      // スナップマーカー (十字と円)
      ctx.strokeStyle = '#ef4444'; // 赤
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // 十字線
      ctx.moveTo(snapScr.x - 12, snapScr.y); ctx.lineTo(snapScr.x + 12, snapScr.y);
      ctx.moveTo(snapScr.x, snapScr.y - 12); ctx.lineTo(snapScr.x, snapScr.y + 12);
      // 二重円
      ctx.arc(snapScr.x, snapScr.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      
      // 計画位置テキスト
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 9px monospace';
      const kpost = `ST ${(snapInfo.distance).toFixed(1)}m`;
      ctx.fillText(kpost, snapScr.x + 10, snapScr.y - 12);
    }

    // 8. 各制御点のピン描画
    points.forEach((point, idx) => {
      const scr = toScreen(point.x, point.y);
      const isSelected = selectedPointId === point.id;
      const isHovered = hoveredPointId === point.id;

      // 選択中 or ホバー中の発光オーラエフェクト
      if (isSelected || isHovered) {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, isSelected ? 24 : 18, 0, Math.PI * 2);
        ctx.fill();
      }

      // 制御点外枠
      ctx.strokeStyle = isSelected ? '#3b82f6' : (isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.6)');
      ctx.lineWidth = isSelected ? 3 : 1.8;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 内円（色分け：始点BP＝赤、中間点IP＝青、終点EP＝緑）
      if (idx === 0) {
        ctx.fillStyle = '#ef4444'; // 始点 (BP)
      } else if (idx === points.length - 1) {
        ctx.fillStyle = '#10b981'; // 終点 (EP)
      } else {
        ctx.fillStyle = '#3b82f6'; // 中間交点 (IP)
      }
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // 制御点ラベル（立体影効果付き）
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11px var(--font-sans)';
      ctx.fillText(point.id, scr.x + 13, scr.y - 9);
      
      ctx.fillStyle = isSelected ? '#3b82f6' : '#ffffff';
      ctx.fillText(point.id, scr.x + 12, scr.y - 10);

      // Z（標高）表示
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px monospace';
      ctx.fillText(`EL:${point.z.toFixed(1)}m`, scr.x + 12, scr.y + 3);
    });

    // 4. 等高線 (Contour Lines) の描画（パン＆ズームに追随する実地形等高線）
    // VRAM 4GB対応パフォーマンス安全ガード（段階的スロットリング）:
    // - ドラッグ中はアライメント追従と負荷100%カットのため、highモード以外は等高線の描画を完全にスキップ
    // - ecoモード時もドラッグ/パン中の等高線計算・描画は完全にスキップ
    // - それ以外の「パン中」は、低解像度の等高線をプレビュー表示して操作性と体感速度を両立
    const isDragActive = isDragging !== null;
    const shouldSkipDraw = 
      (isDragActive && performanceMode !== 'high') || 
      (performanceMode === 'eco' && (isDragActive || isPanning));

    if (!shouldSkipDraw) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)'; // エメラルドグリーン
      ctx.lineWidth = 1.0;
      
      // 同じ標高 of 線分をグループ化してまとめて stroke することでCanvasの描画処理を最適化
      const groupedByElev: { [elev: number]: typeof contourSegments } = {};
      for (const seg of contourSegments) {
        if (!groupedByElev[seg.elevation]) {
          groupedByElev[seg.elevation] = [];
        }
        groupedByElev[seg.elevation].push(seg);
      }

      for (const elevStr of Object.keys(groupedByElev)) {
        const elev = parseFloat(elevStr);
        const segs = groupedByElev[elev];
        ctx.beginPath();
        for (const seg of segs) {
          const s1 = toScreen(seg.p1.x, seg.p1.y);
          const s2 = toScreen(seg.p2.x, seg.p2.y);
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
        }
        ctx.stroke();

        // 等高線ラベルを描画（画面内に入る線分の中央にスマート表示）
        if (segs.length > 0) {
          const midSeg = segs[Math.floor(segs.length / 2)];
          const labelScr = toScreen((midSeg.p1.x + midSeg.p2.x) / 2, (midSeg.p1.y + midSeg.p2.y) / 2);
          if (labelScr.x >= 10 && labelScr.x <= dimensions.width - 10 && labelScr.y >= 10 && labelScr.y <= dimensions.height - 10) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
            ctx.font = '9px monospace';
            ctx.fillText(`${elev}m`, labelScr.x, labelScr.y);
          }
        }
      }

      // 現在のスロットリング状態フィードバックを表示（プロフェッショナルCADインジケーター）
      ctx.fillStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.font = '9px monospace';
      if (isDragActive && performanceMode === 'high') {
        ctx.fillText('⚡ [Drag Mode] Ultra Low-Res Preview Enabled (Dynamic Throttling)', 12, 20);
      } else if (isPanning) {
        ctx.fillText('⚡ [Pan Mode] Adaptive Low-Res Preview Enabled (Adaptive Throttling)', 12, 20);
      } else if (performanceMode === 'eco') {
        ctx.fillText('⚡ [ECO Mode] Fixed Low-Res Mode (VRAM Protection)', 12, 20);
      }
    } else {
      // サスペンド中のパフォーマンス保護フィードバックを表示
      ctx.fillStyle = 'rgba(239, 68, 68, 0.7)'; // 警告色
      ctx.font = '9px monospace';
      if (isDragActive) {
        ctx.fillText('⚡ [Drag Mode] Contour Calculation Suspended (VRAM 4GB Guard Active)', 12, 20);
      } else {
        ctx.fillText('⚡ [Interacting] Contour Suspended (ECO Mode Performance Guard)', 12, 20);
      }
    }

  }, [dimensions, points, selectedPointId, hoveredPointId, pan, zoom, snapInfo, alignment, stations, selectedStationDist, showGradient, contourInterval, contourSegments, performanceMode]);

  // マウスダウン・タッチスタート時の当たり判定
  const getPointAtPosition = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // スケールを考慮した判定しきい値（クリックしやすいように28ピクセル）
    const threshold = 28;

    for (const point of points) {
      const scr = toScreen(point.x, point.y);
      const dist = Math.sqrt((scr.x - clickX) ** 2 + (scr.y - clickY) ** 2);
      if (dist < threshold) {
        return point.id;
      }
    }
    return null;
  };

  // 測点（Stations）のクリック判定
  const getStationAtPosition = (clientX: number, clientY: number): StationPoint | null => {
    if (!stations) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const threshold = 18; // 測点クリックのしきい値 (18px)

    for (const s of stations) {
      const scr = toScreen(s.x, s.y);
      const dist = Math.sqrt((scr.x - clickX) ** 2 + (scr.y - clickY) ** 2);
      if (dist < threshold) {
        return s;
      }
    }
    return null;
  };

  // ドラッグ/パン開始
  const handleStart = (clientX: number, clientY: number, button: number = 0) => {
    const pointId = getPointAtPosition(clientX, clientY);
    
    // 左クリックかつ制御点の上
    if (pointId && button === 0) {
      setIsDragging(pointId);
      setSelectedPointId(pointId);
      setIsPanning(false);
    } else {
      // 制御点以外の場合、測点ピンをクリックしたか判定
      const clickedStation = getStationAtPosition(clientX, clientY);
      if (clickedStation && button === 0) {
        setSelectedStationDist(clickedStation.distance);
        setIsPanning(false);
        setIsDragging(null);
      } else {
        // それら以外、または中・右クリックならパン（平行移動）開始
        setIsPanning(true);
        setDragStart({ x: clientX, y: clientY });
        setIsDragging(null);
      }
    }
  };

  // マウス移動（ドラッグ、パン、スナップの制御）
  const handleMove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const curX = clientX - rect.left;
    const curY = clientY - rect.top;

    const modelCoords = toModel(clientX - rect.left, clientY - rect.top);

    // 1. 制御点のドラッグ移動
    if (isDragging) {
      const updatedPoints = points.map((p, idx) => {
        if (p.id === isDragging) {
          // 他の制御点との極端な近接（25mガード）を維持
          let safeX = modelCoords.x;
          let safeY = modelCoords.y;

          const otherPoints = points.filter(op => op.id !== isDragging);
          otherPoints.forEach(op => {
            const dist = getDistance(safeX, safeY, op.x, op.y);
            if (dist < 25) { // 最小距離 25m ガード
              const angle = Math.atan2(safeY - op.y, safeX - op.x);
              safeX = op.x + Math.cos(angle) * 25;
              safeY = op.y + Math.sin(angle) * 25;
            }
          });

          const lngLat = xyToLngLat(safeX, safeY);

          return {
            ...p,
            x: safeX,
            y: safeY,
            lng: lngLat.lng,
            lat: lngLat.lat,
            // 自動追従がONなら、zも移動先の地盤高に同期。OFFなら元のzを維持
            z: autoAlignZToGround 
              ? parseFloat(getGroundElevation(safeX, safeY).toFixed(2))
              : p.z,
          };
        }
        return p;
      });

      onPointsChange(updatedPoints);
      return;
    }

    // 2. マップパン（平行移動）
    if (isPanning) {
      const dx = clientX - dragStart.x;
      const dy = clientY - dragStart.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: clientX, y: clientY });
      return;
    }

    // 3. 制御点のホバー判定
    const hoveredId = getPointAtPosition(clientX, clientY);
    setHoveredPointId(hoveredId);

    // 4. 計画道路へのマウススナップ処理（3D CADライクな設計支援）
    if (alignment.length > 0) {
      let minDistance = Infinity;
      let closestPoint: AlignmentPoint | null = null;

      alignment.forEach(pt => {
        const dist = getDistance(modelCoords.x, modelCoords.y, pt.x, pt.y);
        if (dist < minDistance) {
          minDistance = dist;
          closestPoint = pt;
        }
      });

      // マウスクロスヘアからの画面上のピクセル距離
      const pixelDist = minDistance * zoom;
      if (pixelDist < 35 && closestPoint) {
        setSnapInfo({
          x: closestPoint.x,
          y: closestPoint.y,
          distance: closestPoint.distance,
          station: closestPoint.station,
          z: closestPoint.z,
          groundZ: closestPoint.groundZ,
        });
      } else {
        setSnapInfo(null);
      }
    }
  };

  // マウスドラッグ終了
  const handleEnd = () => {
    setIsDragging(null);
    setIsPanning(false);
  };

  // ホイールズームイン・ズームアウト
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.12;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    // 0.15倍から12倍のズーム境界
    setZoom(Math.max(0.15, Math.min(12, nextZoom)));
  };

  // ダブルクリックで新しいIP（交点）を挿入・追加
  const handleDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const modelCoords = toModel(clickX, clickY);

    // すでに制御点の真上なら追加しない
    if (getPointAtPosition(e.clientX, e.clientY)) return;

    // 既存の制御点に極端に近すぎる (25m未満) 場合は追加しない (近接ガード)
    let tooClose = false;
    points.forEach(op => {
      if (getDistance(modelCoords.x, modelCoords.y, op.x, op.y) < 25) {
        tooClose = true;
      }
    });
    if (tooClose) return;

    // 1. 最も近いセグメントのインデックスを探す
    const insertIdx = getClosestSegmentIndex(modelCoords.x, modelCoords.y, points);

    // 2. 新しい点を作成
    const lngLat = xyToLngLat(modelCoords.x, modelCoords.y);
    const groundZ = getGroundElevation(modelCoords.x, modelCoords.y);

    const newPoint: ControlPoint = {
      id: `IP_TEMP_${Date.now()}`,
      name: '交点 (IP)',
      x: modelCoords.x,
      y: modelCoords.y,
      lng: lngLat.lng,
      lat: lngLat.lat,
      z: parseFloat(groundZ.toFixed(2)), // デフォルトで現況地盤高にセット
      r: 100, // デフォルトの曲線半径 100m
    };

    // 3. 配列に割り込ませて整理
    const newPoints = [...points];
    newPoints.splice(insertIdx + 1, 0, newPoint);
    
    // 4. IDと名前をIP1, IP2...のように綺麗に振り直す
    const organized = reorganizePoints(newPoints);
    
    onPointsChange(organized);

    // 追加した点をそのまま選択状態にしてアクティブにする
    const newlyAdded = organized[insertIdx + 1];
    if (newlyAdded) {
      setSelectedPointId(newlyAdded.id);
    }
  };

  // 高度 Z 変更
  const handleElevationChange = (val: number) => {
    if (!selectedPointId) return;
    const updated = points.map(p => {
      if (p.id === selectedPointId) {
        return { ...p, z: val };
      }
      return p;
    });
    onPointsChange(updated);
  };

  // 現況地盤高を取得して計画高Zにセットする
  const handleGetGroundElevation = () => {
    if (!curPoint) return;
    const groundZ = getGroundElevation(curPoint.x, curPoint.y);
    const roundedZ = parseFloat(groundZ.toFixed(2));
    handleElevationChange(roundedZ);
  };

  // 曲線半径 R 変更
  const handleRadiusChange = (val: number) => {
    if (!selectedPointId) return;
    const updated = points.map(p => {
      if (p.id === selectedPointId) {
        return { ...p, r: Math.max(0, val) };
      }
      return p;
    });
    onPointsChange(updated);
  };

  // 縦断曲線長 VCL 変更
  const handleVclChange = (val: number) => {
    if (!selectedPointId) return;
    const updated = points.map(p => {
      if (p.id === selectedPointId) {
        return { ...p, vcl: Math.max(0, val) };
      }
      return p;
    });
    onPointsChange(updated);
  };

  const handleLocalVclChange = (valStr: string) => {
    setInputVcl(valStr);
    const val = parseFloat(valStr);
    if (isNaN(val)) return;

    if (!selectedPointId) return;
    const updated = points.map(p => {
      if (p.id === selectedPointId) {
        return { ...p, vcl: Math.max(0, val) };
      }
      return p;
    });
    onPointsChange(updated);
  };

  // 手動による X, Y 座標のテキスト手入力（CADライクな数値入力）
  const handleLocalCoordinateChange = (field: 'x' | 'y', valStr: string) => {
    if (field === 'x') {
      setInputX(valStr);
    } else {
      setInputY(valStr);
    }

    const val = parseFloat(valStr);
    if (isNaN(val)) return; // 文字列が完全な数値でない（空欄や編集中）場合は、同期を保留（エラー防止）

    if (!selectedPointId) return;

    const updated = points.map(p => {
      if (p.id === selectedPointId) {
        const nextPoint = { ...p, [field]: val };
        
        // 経緯度の同期
        const lngLat = xyToLngLat(nextPoint.x, nextPoint.y);
        nextPoint.lng = lngLat.lng;
        nextPoint.lat = lngLat.lat;

        // 自動追従がONなら、zも入力後の平面位置の現況地盤高に自動連動。OFFなら元のzを維持
        if (autoAlignZToGround) {
          const groundZ = getGroundElevation(nextPoint.x, nextPoint.y);
          nextPoint.z = parseFloat(groundZ.toFixed(2));
        }

        return nextPoint;
      }
      return p;
    });
    onPointsChange(updated);
  };

  // 手動による R 座標のテキスト手入力
  const handleLocalRadiusChange = (valStr: string) => {
    setInputR(valStr);

    const val = parseFloat(valStr);
    if (isNaN(val)) return;

    if (!selectedPointId) return;

    const updated = points.map(p => {
      if (p.id === selectedPointId) {
        return { ...p, r: Math.max(0, val) };
      }
      return p;
    });
    onPointsChange(updated);
  };

  // フォーカスアウト時に数値を四捨五入した整数値に揃える
  const handleCoordinateBlur = () => {
    if (!curPoint) return;
    setInputX(Math.round(curPoint.x).toString());
    setInputY(Math.round(curPoint.y).toString());
    setInputR(curPoint.r !== undefined ? Math.round(curPoint.r).toString() : '0');
    setInputVcl(curPoint.vcl !== undefined ? Math.round(curPoint.vcl).toString() : '0');
  };

  // Enterキーが押されたらフォーカスを外して値を確定
  const handleCoordinateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  // 特定の IP 点（交点）を削除
  const handleDeletePoint = (pointId: string) => {
    if (pointId === 'BP' || pointId === 'EP') return; // 始点・終点は削除不可
    
    const filtered = points.filter(p => p.id !== pointId);
    const organized = reorganizePoints(filtered);
    
    onPointsChange(organized);
    setSelectedPointId('BP'); // 始点に選択を戻す
  };

  // 制御点リストから新規IPを「EPの手前」に手動追加
  const handleAddNewIPManual = () => {
    const epIdx = points.length - 1;
    const lastPointBeforeEp = points[epIdx - 1];
    const epPoint = points[epIdx];

    // 前の点と終点の中間位置に自動で追加
    const targetX = (lastPointBeforeEp.x + epPoint.x) / 2;
    const targetY = (lastPointBeforeEp.y + epPoint.y) / 2;
    
    const lngLat = xyToLngLat(targetX, targetY);
    const groundZ = getGroundElevation(targetX, targetY);

    const newPoint: ControlPoint = {
      id: `IP_TEMP_${Date.now()}`,
      name: '交点 (IP)',
      x: targetX,
      y: targetY,
      lng: lngLat.lng,
      lat: lngLat.lat,
      z: parseFloat(groundZ.toFixed(2)), // デフォルトで現況地盤高にセット
      r: 100, // デフォルトの曲線半径 100m
    };

    const newPoints = [...points];
    newPoints.splice(epIdx, 0, newPoint);
    const organized = reorganizePoints(newPoints);
    onPointsChange(organized);
    
    // 新しく追加された中間点を正確に選択状態にする
    const newlyAdded = organized[organized.length - 2];
    if (newlyAdded) {
      setSelectedPointId(newlyAdded.id);
    }
  };

  // 現在選択されている測点情報を取得
  const activeStation = stations.find(s => Math.abs(s.distance - selectedStationDist) < 0.1) || stations[0];

  // マップ操作のリセット
  const handleResetView = () => {
    setZoom(1.1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-5 min-h-0 bg-slate-950 rounded-xl overflow-hidden p-1" ref={containerRef}>
      
      {/* メインの地図領域 */}
      <div className="flex-1 flex flex-col min-h-0 relative bg-slate-900/40 rounded-xl border border-white/5">
        
        {/* 地図操作バー */}
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/60 backdrop-blur z-10 text-xs">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-400 animate-spin-slow" />
            <span className="font-bold text-white tracking-wide">3D CIM等高線・動的平面線形設計マップ</span>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* 測点間隔（ピッチ）切り替えボタン */}
            <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-white/10">
              <span className="text-[10px] text-slate-400 font-bold mr-1">測点ピッチ:</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStationInterval(20);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  stationInterval === 20 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                20m
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStationInterval(100);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  stationInterval === 100 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                100m
              </button>
            </div>

            {/* 等高線（コンター）表示間隔切り替えスライダー */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-white/10 text-slate-300">
              <span className="text-[10px] text-slate-400 font-bold">等高線ピッチ:</span>
              <input 
                type="range" 
                min="1" 
                max="15" 
                step="1"
                value={contourInterval}
                onChange={(e) => {
                  e.stopPropagation();
                  setContourInterval(parseInt(e.target.value));
                }}
                className="w-16 md:w-20 accent-emerald-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
              <span className="font-mono text-emerald-400 font-bold text-[10px] min-w-[24px] text-right">
                {contourInterval}m
              </span>
              <div className="flex gap-1 border-l border-white/10 pl-1.5 ml-1">
                {[1, 5, 10].map(val => (
                  <button
                    key={val}
                    onClick={(e) => {
                      e.stopPropagation();
                      setContourInterval(val);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                      contourInterval === val
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5 bg-slate-950'
                    }`}
                  >
                    {val}m
                  </button>
                ))}
              </div>
            </div>

            {/* 勾配色分けトグルボタン */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowGradient(prev => !prev);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                showGradient 
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20' 
                  : 'bg-slate-900/80 text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
              }`}
              title="道路の縦断勾配の大きさに応じて、中心線をヒートマップ色分け（緑〜黄〜赤）で可視化します"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>勾配色分け: {showGradient ? 'ON' : 'OFF'}</span>
            </button>

            {/* Z現況自動同期トグルボタン */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAutoAlignZToGround(prev => !prev);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                autoAlignZToGround 
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20' 
                  : 'bg-slate-900/80 text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
              }`}
              title="ONの時、制御点の平面位置移動やドラッグ時に、計画高(設計Z)を自動的に現況地盤高に合わせます"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>現況Z同期: {autoAlignZToGround ? 'ON' : 'OFF'}</span>
            </button>

            {/* ズーム & リセットコントロール */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-lg border border-white/10">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom(z => Math.max(0.15, z / 1.15));
                }}
                className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="ズームアウト"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-blue-400 min-w-[32px] text-center">{(zoom * 100).toFixed(0)}%</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom(z => Math.min(12, z * 1.15));
                }}
                className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="ズームイン"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-3.5 bg-white/10 mx-1"></div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetView();
                }}
                className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors cursor-pointer flex items-center gap-1 text-[9px] font-bold"
                title="ビューのパンとズームを初期状態に戻します"
              >
                <RotateCcw className="w-3 h-3 text-emerald-400" />
                リセット
              </button>
            </div>
          </div>
        </div>

        {/* キャンバス */}
        <div className="flex-1 relative min-h-0" ref={canvasContainerRef}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
            onMouseDown={(e) => handleStart(e.clientX, e.clientY, e.button)}
            onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onTouchStart={(e) => {
              if (e.touches[0]) handleStart(e.touches[0].clientX, e.touches[0].clientY, 0);
            }}
            onTouchMove={(e) => {
              if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
            }}
            onTouchEnd={handleEnd}
            className={`cursor-crosshair ${isDragging ? 'cursor-grabbing' : (hoveredPointId ? 'cursor-grab' : 'cursor-crosshair')}`}
          />

          {/* ダブルクリック追加の案内ガイド (左下フローティング) */}
          <div className="absolute bottom-4 left-4 p-3 rounded-lg bg-slate-900/85 border border-white/10 text-[10px] text-slate-400 max-w-[280px] backdrop-blur-md pointer-events-none space-y-1 shadow-lg">
            <div className="font-bold text-white flex items-center gap-1.5 text-xs border-b border-white/5 pb-1 mb-1">
              <MousePointerClick className="w-3.5 h-3.5 text-blue-400" />
              マウス・平面アライメント操作ガイド
            </div>
            <ul className="list-disc pl-3.5 space-y-1">
              <li><strong>ドラッグ (ピン)</strong>: 制御点を平面移動 (地盤高自動連動)</li>
              <li><strong>ドラッグ (空白)</strong>: マップの並行移動 (パン)</li>
              <li><strong>ダブルクリック (空白)</strong>: その場に新しい <span className="text-blue-400 font-bold">中間点 (IP)</span> を追加</li>
              <li><strong>マウスホイール</strong>: 地図のズームイン・アウト</li>
              <li><strong>計画道路ホバー</strong>: 近い点にスナップしてキロポストを表示</li>
            </ul>
          </div>

          {/* 勾配色分け凡例 (右下フローティング) */}
          {showGradient && (
            <div className="absolute bottom-4 right-4 p-3 rounded-lg bg-slate-900/85 border border-white/10 text-[10px] text-slate-400 min-w-[180px] backdrop-blur-md pointer-events-none space-y-2 shadow-lg">
              <div className="font-bold text-white flex items-center gap-1.5 text-xs border-b border-white/5 pb-1">
                <Palette className="w-3.5 h-3.5 text-emerald-400" />
                <span>勾配ヒートマップ</span>
              </div>
              <div className="space-y-1 font-mono text-[9px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>0% 〜 3% (良好)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>3% 〜 6% (許容・注意)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span>6% 〜 (超過・急勾配)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右側のサイドコントロールパネル */}
      <div className="w-full lg:w-[360px] flex flex-col gap-4 overflow-y-auto shrink-0 pr-1 select-none">
        
        {/* 設計パラメータ vs GIS 標高3D化のタブ切り替え */}
        <div className="flex bg-slate-950/80 p-1 rounded-xl border border-white/10 shrink-0">
          <button
            onClick={() => setRightPanelTab('design')}
            className={`flex-1 py-2 text-center text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
              rightPanelTab === 'design'
                ? 'bg-blue-600/80 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            📐 アライメント設計
          </button>
          <button
            onClick={() => setRightPanelTab('gis')}
            className={`flex-1 py-2 text-center text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
              rightPanelTab === 'gis'
                ? 'bg-emerald-600/80 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            🗺️ 標高3Dインポーター
            <span className="bg-red-500 text-[8px] text-white px-1 py-0.2 rounded font-mono animate-bounce">NEW</span>
          </button>
        </div>

        {rightPanelTab === 'design' ? (
          <>
            {/* 複数路線（マルチアライメント）ネットワーク管理パネル */}
            {roadNetwork && (
              <div className="glass-panel rounded-xl p-4 shadow-xl border border-white/10 text-xs text-slate-300 space-y-3.5 bg-slate-900/60">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                    <Compass className="w-4 h-4 text-blue-400" />
                    複数路線アライメント網 ({Object.keys(roadNetwork.alignments).length})
                  </span>
                  <button
                    onClick={() => {
                      if (onAddAlignment) {
                        const newId = `road-${Date.now()}`;
                        onAddAlignment({
                          id: newId,
                          name: `新路線_${Object.keys(roadNetwork.alignments).length + 1}`,
                          points: [
                            { id: 'BP', name: '始点 (BP)', x: 0, y: 0, z: 20, r: 0, vcl: 0, lng: 139.0, lat: 35.0 },
                            { id: 'EP', name: '終点 (EP)', x: 300, y: 150, z: 25, r: 0, vcl: 0, lng: 139.0033, lat: 35.0013 }
                          ],
                          crossSection: {
                            leftLaneWidth: 3.25,
                            rightLaneWidth: 3.25,
                            shoulderWidth: 0.75,
                            slopeGradient: 1.5,
                            pavementThickness: 0.25,
                            baseThickness: 0.20,
                            subgradeThickness: 0.30,
                            cutSlopeGradient: 1.2,
                            fillSlopeGradient: 1.8,
                            enableMultiStageSlope: true,
                            bermInterval: 5.0,
                            bermWidth: 1.0,
                            enableBermDitch: true,
                          },
                          segments: [],
                          coordinateZone: coordinateZone,
                          heightOffset: 0,
                          visible: true,
                          lodLevel: LODLevel.HIGH
                        });
                      }
                    }}
                    className="px-2 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                    title="新しく直線アライメントを持った路線を追加します"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    新路線追加
                  </button>
                </div>

                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {Object.keys(roadNetwork.alignments).map(roadId => {
                    const road = roadNetwork.alignments[roadId];
                    const isActive = roadId === activeAlignmentId;
                    const isEditing = editingRoadId === roadId;

                    return (
                      <div
                        key={roadId}
                        className={`p-2 rounded-lg border flex flex-col gap-1.5 transition-all ${
                          isActive
                            ? 'bg-blue-950/20 border-blue-500/80 shadow shadow-blue-500/5'
                            : 'bg-slate-900/40 border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingRoadName}
                                onChange={(e) => setEditingRoadName(e.target.value)}
                                className="bg-slate-950 border border-blue-500 text-white font-bold text-[10px] rounded px-1.5 py-0.5 w-full focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (onUpdateRoadMetadata) {
                                      onUpdateRoadMetadata(roadId, { name: editingRoadName }, {});
                                    }
                                    setEditingRoadId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingRoadId(null);
                                  }
                                }}
                              />
                            ) : (
                              <span
                                className={`truncate font-bold text-[10.5px] cursor-pointer hover:text-blue-400 ${
                                  isActive ? 'text-blue-300' : 'text-slate-200'
                                }`}
                                onClick={() => {
                                  if (onSwitchAlignment) onSwitchAlignment(roadId);
                                }}
                                title="クリックしてアクティブ編集路線に切り替える"
                              >
                                {road.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => {
                                    if (onUpdateRoadMetadata) {
                                      onUpdateRoadMetadata(roadId, { name: editingRoadName }, {});
                                    }
                                    setEditingRoadId(null);
                                  }}
                                  className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold bg-emerald-500/10 px-1 rounded"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => setEditingRoadId(null)}
                                  className="text-[9px] text-slate-400 hover:text-slate-300 font-bold bg-slate-800 px-1 rounded"
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingRoadId(roadId);
                                    setEditingRoadName(road.name);
                                  }}
                                  className="p-1 text-slate-400 hover:text-white rounded transition-colors text-[9px]"
                                  title="路線名を変更する"
                                >
                                  ✏️
                                </button>
                                {Object.keys(roadNetwork.alignments).length > 1 && (
                                  <button
                                    onClick={() => {
                                      if (onDeleteAlignment) onDeleteAlignment(roadId);
                                    }}
                                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                    title="この路線を削除する"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* 高さオフセット & LOD 表示 */}
                        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono border-t border-white/5 pt-1">
                          <div className="flex items-center gap-1">
                            <span>基準高差:</span>
                            <input
                              type="number"
                              value={road.heightOffset}
                              step="0.5"
                              onChange={(e) => {
                                if (onUpdateRoadMetadata) {
                                  onUpdateRoadMetadata(roadId, {}, { heightOffset: parseFloat(e.target.value) || 0 });
                                }
                              }}
                              className="bg-transparent border-none text-[9px] text-slate-300 w-12 font-bold focus:outline-none"
                            />
                          </div>
                          <span className="flex items-center gap-1">
                            <span>LOD:</span>
                            <select
                              value={road.lodLevel}
                              onChange={(e) => {
                                if (onUpdateRoadMetadata) {
                                  onUpdateRoadMetadata(roadId, { lodLevel: e.target.value }, {});
                                }
                              }}
                              className="bg-transparent border-none text-[8px] text-slate-400 font-bold focus:outline-none cursor-pointer"
                            >
                              <option value="HIGH">詳細 (HIGH)</option>
                              <option value="MEDIUM">中解像度 (MED)</option>
                              <option value="LOW">低解像度 (LOW)</option>
                              <option value="LINE">中心線のみ (LINE)</option>
                            </select>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ① 選択されている制御点の詳細編集カード */}
            {curPoint ?
              <div className="glass-panel rounded-xl p-4 shadow-xl border border-white/10 text-xs text-slate-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <span className="font-bold text-white flex items-center gap-1.5">
                <MapPin className={`w-4 h-4 ${curPoint.id === 'BP' ? 'text-red-400' : (curPoint.id === 'EP' ? 'text-emerald-400' : 'text-blue-400')}`} />
                {curPoint.name}
              </span>
              <div className="flex gap-1">
                {curPoint.id !== 'BP' && curPoint.id !== 'EP' ? (
                  <button
                    onClick={() => handleDeletePoint(curPoint.id)}
                    className="p-1 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-red-400 rounded transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold"
                    title="この中間交差点(IP)を削除します"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    削除
                  </button>
                ) : (
                  <span className="text-[9px] bg-white/5 border border-white/10 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                    端点
                  </span>
                )}
              </div>
            </div>
            
            <div className="space-y-3.5">
              
              {/* XY 座標数値入力 (プロ向けCAD入力仕様) */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="p-1.5 bg-slate-950/50 rounded border border-white/5">
                  <div className="text-slate-500 mb-0.5">X 座標 (m)</div>
                  <input
                    type="text"
                    value={inputX}
                    onChange={(e) => handleLocalCoordinateChange('x', e.target.value)}
                    onBlur={handleCoordinateBlur}
                    onKeyDown={handleCoordinateKeyDown}
                    className="w-full bg-transparent text-white font-bold border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -mx-1"
                  />
                </div>
                <div className="p-1.5 bg-slate-950/50 rounded border border-white/5">
                  <div className="text-slate-500 mb-0.5">Y 座標 (m)</div>
                  <input
                    type="text"
                    value={inputY}
                    onChange={(e) => handleLocalCoordinateChange('y', e.target.value)}
                    onBlur={handleCoordinateBlur}
                    onKeyDown={handleCoordinateKeyDown}
                    className="w-full bg-transparent text-white font-bold border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -mx-1"
                  />
                </div>

                {/* 曲線半径 R (IP点のみ) */}
                {curPoint.id !== 'BP' && curPoint.id !== 'EP' &&
                  <>
                    <div className="p-1.5 bg-slate-950/50 rounded border border-blue-500/20">
                      <div className="text-blue-400 mb-0.5 flex items-center justify-between font-bold">
                        <span>曲線半径 R (m)</span>
                        <span className="text-blue-300 bg-blue-500/10 px-1 py-0.2 rounded text-[8px]">IP専用</span>
                      </div>
                      <input
                        type="text"
                        value={inputR}
                        onChange={(e) => handleLocalRadiusChange(e.target.value)}
                        onBlur={handleCoordinateBlur}
                        onKeyDown={handleCoordinateKeyDown}
                        className="w-full bg-transparent text-white font-bold border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -mx-1"
                      />
                    </div>
                    <div className="p-1.5 bg-slate-950/50 rounded border border-indigo-500/20">
                      <div className="text-indigo-400 mb-0.5 flex items-center justify-between font-bold">
                        <span>縦断曲線長 VCL (m)</span>
                        <span className="text-indigo-300 bg-indigo-500/10 px-1 py-0.2 rounded text-[8px]">放物線</span>
                      </div>
                      <input
                        type="text"
                        value={inputVcl}
                        onChange={(e) => handleLocalVclChange(e.target.value)}
                        onBlur={handleCoordinateBlur}
                        onKeyDown={handleCoordinateKeyDown}
                        className="w-full bg-transparent text-white font-bold border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -mx-1"
                      />
                    </div>
                  </>
                }

                <div className="p-1.5 bg-slate-950/50 rounded border border-white/5 col-span-2 flex items-center justify-between">
                  <div>
                    <div className="text-slate-500">経度 / 緯度 (Lng/Lat)</div>
                    <div className="text-blue-400 font-bold text-[9px] mt-0.5">
                      {curPoint.lng.toFixed(5)}°, {curPoint.lat.toFixed(5)}°
                    </div>
                  </div>
                </div>
              </div>

              {/* 曲線半径 R 調整用スライダー (IP点のみ) */}
              {curPoint.id !== 'BP' && curPoint.id !== 'EP' && curPoint.r !== undefined &&
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1 font-bold">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      曲線半径 R スライダー
                    </span>
                    <span className="text-blue-400 font-bold font-mono text-sm">{Math.round(curPoint.r)}m</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="350"
                    step="5"
                    value={curPoint.r}
                    onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 opacity-80 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                  <div className="text-[9px] text-slate-500 flex justify-between font-mono">
                    <span>R: 0m (直線)</span>
                    <span>Max: 350m</span>
                  </div>
                </div>
              }

              {/* 高さ Z 調整用スライダー */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 flex items-center gap-1 font-bold">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    計画高 (標高 Z) {autoAlignZToGround && <span className="text-[9px] text-emerald-400 font-normal font-sans">(現況自動同期中)</span>}
                  </span>
                  <span className="text-emerald-400 font-bold font-mono text-sm">{curPoint.z.toFixed(1)}m</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="0.5"
                  value={curPoint.z}
                  onChange={(e) => handleElevationChange(parseFloat(e.target.value))}
                  disabled={autoAlignZToGround}
                  className="w-full accent-emerald-500 opacity-80 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <div className="text-[9px] text-slate-500 flex justify-between font-mono">
                  <span>Min: 10m</span>
                  <span>Max: 90m</span>
                </div>

                <button
                  onClick={handleGetGroundElevation}
                  disabled={autoAlignZToGround}
                  className="w-full mt-1 px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 hover:border-emerald-500 text-emerald-300 font-bold text-[10px] rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  title={autoAlignZToGround ? "現況自動同期がONのため、手動操作は無効です" : "この制御点の平面位置における現況地盤高を瞬時に取得して計画高(設計Z)にコピーします"}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  現況地盤高を計画高にセット ({getGroundElevation(curPoint.x, curPoint.y).toFixed(1)}m)
                </button>
              </div>

              {/* 縦断曲線長 VCL 調整用スライダー (IP点のみ) */}
              {curPoint.id !== 'BP' && curPoint.id !== 'EP' &&
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1 font-bold">
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      縦断曲線長 VCL スライダー
                    </span>
                    <span className="text-indigo-400 font-bold font-mono text-sm">{Math.round(curPoint.vcl || 0)}m</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    step="5"
                    value={curPoint.vcl || 0}
                    onChange={(e) => handleVclChange(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 opacity-80 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                  <div className="text-[9px] text-slate-500 flex justify-between font-mono">
                    <span>VCL: 0m (直線)</span>
                    <span>Max: 150m</span>
                  </div>
                </div>
              }

              <div className="flex items-start gap-1.5 text-[9px] text-slate-400 bg-white/5 p-2 rounded-lg leading-relaxed">
                <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>ピンのドラッグや、XY・R数値ボックスの手入力、標高・半径スライダーによって計画設計をミリ単位で微調整可能です。3Dアライメントおよび土量は自動で再補間されます。</span>
              </div>
            </div>
          </div>
          :
            <div className="glass-panel rounded-xl p-4 text-center text-xs text-slate-500 py-6 border border-white/5">
              マップ上のピンをクリック、または右の一覧から制御点を選択すると詳細パラメータを編集できます。
            </div>
          }

        {/* ③ 日本道路構造令 縦断設計チェック */}
        <div className="glass-panel rounded-xl p-4 shadow-xl border border-white/10 flex flex-col shrink-0 space-y-3 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-1">
            <span className="font-bold text-white text-xs flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              日本道路構造令 縦断設計チェック
            </span>
            {/* 設計速度セレクター */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-400 font-bold">設計速度:</span>
              <select
                value={designSpeed}
                onChange={(e) => setDesignSpeed(parseInt(e.target.value))}
                className="bg-slate-950 border border-white/10 text-white font-bold text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value={30}>30 km/h</option>
                <option value={40}>40 km/h</option>
                <option value={50}>50 km/h</option>
                <option value={60}>60 km/h</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5 text-[11px] leading-normal">
            {/* 全体チェック：最大縦断勾配 */}
            <div className="p-2 rounded bg-slate-950/40 border border-white/5 space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-400">最大縦断勾配チェック</span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                  checkMaxSlope.status === 'OK' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  checkMaxSlope.status === 'WARN' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                  'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {checkMaxSlope.status === 'OK' ? '適合' : checkMaxSlope.status === 'WARN' ? '特例適合' : '不適合'}
                </span>
              </div>
              <p className="text-slate-300 font-mono text-[10px]">{checkMaxSlope.text}</p>
              <div className="text-[9px] text-slate-500">
                ※構造令第20条制限（標準: {roadSpecs.maxSlope}% / 特例: {roadSpecs.specSlope}%）
              </div>
            </div>

            {/* 選択中のIPチェック */}
            {checkVpiDesign ? (
              <div className="p-2 rounded bg-slate-950/40 border border-white/5 space-y-2">
                <div className="border-b border-white/5 pb-1 flex justify-between items-center">
                  <span className="font-extrabold text-indigo-300 text-[10px]">選択中の変化点 ({curPoint.name})</span>
                  <span className="text-slate-400 text-[9px] font-mono">代数差: {checkVpiDesign.deltaI.toFixed(2)}%</span>
                </div>

                {/* 縦断曲線長 (VCL) */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between font-semibold text-[10px]">
                    <span className="text-slate-400">縦断曲線長 (VCL)</span>
                    <span className={`px-1 py-0.1 rounded text-[8px] font-bold ${
                      checkVpiDesign.vclStatus === 'OK' ? 'text-emerald-400 bg-emerald-500/5' :
                      checkVpiDesign.vclStatus === 'WARN' ? 'text-yellow-400 bg-yellow-500/5' :
                      'text-red-400 bg-red-500/5'
                    }`}>
                      {checkVpiDesign.vclStatus === 'OK' ? '適合' : checkVpiDesign.vclStatus === 'WARN' ? '特例適合' : '不適合'}
                    </span>
                  </div>
                  <p className="text-slate-300 font-mono text-[10px]">{checkVpiDesign.vclText}</p>
                  {checkVpiDesign.isVclRequired && (
                    <div className="text-[9px] text-slate-500">
                      VCL最小基準：標準 {roadSpecs.minVcl}m / 特例 {roadSpecs.specVcl}m
                    </div>
                  )}
                </div>

                {/* 曲線半径 (R_vert) */}
                {checkVpiDesign.isVclRequired && curPoint.vcl && curPoint.vcl > 0 ? (
                  <div className="space-y-1 border-t border-white/5 pt-1.5">
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between font-semibold text-[10px]">
                        <span className="text-slate-400">縦断曲線半径 (R)</span>
                        <span className={`px-1 py-0.1 rounded text-[8px] font-bold ${
                          checkVpiDesign.rStatus === 'OK' ? 'text-emerald-400 bg-emerald-500/5' :
                          checkVpiDesign.rStatus === 'WARN' ? 'text-yellow-400 bg-yellow-500/5' :
                          'text-red-400 bg-red-500/5'
                        }`}>
                          {checkVpiDesign.rStatus === 'OK' ? '適合' : checkVpiDesign.rStatus === 'WARN' ? '特例適合' : '不適合'}
                        </span>
                      </div>
                      <p className="text-slate-300 font-mono text-[10px]">{checkVpiDesign.rText}</p>
                      <div className="text-[9px] text-slate-500">
                        R最小基準（{checkVpiDesign.isCrest ? '凸型' : '凹型'}）：標準 {checkVpiDesign.isCrest ? roadSpecs.minCrestR : roadSpecs.minSagR}m / 特例 {checkVpiDesign.isCrest ? roadSpecs.specCrestR : roadSpecs.specSagR}m
                      </div>
                    </div>

                    {/* 視差・制動停止視距 (SSD) */}
                    <div className="space-y-0.5 border-t border-white/5 pt-1.5">
                      <div className="flex items-center justify-between font-semibold text-[10px]">
                        <span className="text-slate-400">視距・視差 (SSD) 検証</span>
                        <span className={`px-1 py-0.1 rounded text-[8px] font-bold ${
                          checkVpiDesign.ssdStatus === 'OK' ? 'text-emerald-400 bg-emerald-500/5' :
                          'text-red-400 bg-red-500/5'
                        }`}>
                          {checkVpiDesign.ssdStatus === 'OK' ? '適合' : '不適合'}
                        </span>
                      </div>
                      <p className="text-slate-300 font-mono text-[10px]">{checkVpiDesign.ssdText}</p>
                      <div className="text-[9px] text-slate-500">
                        必要制動停止視距：{roadSpecs.minS}m (構造令第21条規定)
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-2 rounded bg-slate-950/20 border border-white/5 text-slate-500 text-center text-[10px]">
                起終点（BP/EP）以外の中間変化点を選択すると、その地点の構造令設計検証がここに表示されます。
              </div>
            )}
          </div>
        </div>

        {/* ② 全制御点の一覧＆並び替え・追加リスト */}
        <div className="glass-panel rounded-xl p-4 shadow-xl border border-white/10 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 shrink-0">
            <span className="font-bold text-white text-xs flex items-center gap-1.5">
              <MapIcon className="w-4 h-4 text-emerald-400" />
              道路アライメント制御点リスト ({points.length}点)
            </span>
            <button
              onClick={handleAddNewIPManual}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="EP(終点)の手前に新しい中間経由点を追加します"
            >
              <Plus className="w-3.5 h-3.5" />
              IP追加
            </button>
          </div>

          {/* スクロール可能なピンリスト */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {points.map((p, idx) => {
              const isSelected = selectedPointId === p.id;
              let badgeColor = "bg-blue-500/10 border-blue-500/20 text-blue-400";
              if (idx === 0) badgeColor = "bg-red-500/10 border-red-500/20 text-red-400";
              else if (idx === points.length - 1) badgeColor = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPointId(p.id)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500 shadow-md shadow-blue-500/5'
                      : 'bg-slate-900/40 border-white/5 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border uppercase tracking-wider shrink-0 ${badgeColor}`}>
                      {p.id}
                    </span>
                    <span className={`truncate font-semibold text-[11px] ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {p.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400 shrink-0">
                    {p.id !== 'BP' && p.id !== 'EP' && p.r !== undefined && (
                      <span className="text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded text-[9px]">R:{Math.round(p.r)}</span>
                    )}
                    <span>X:{Math.round(p.x)}</span>
                    <span>EL:{p.z.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
        ) : (
          <div className="flex flex-col gap-4">
            {/* GIS 標高タイル & Terrain-RGB デコード解説 */}
            <div className="glass-panel rounded-xl p-4 shadow-xl border border-white/10 text-xs text-slate-300 space-y-3.5 bg-slate-900/60">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-1">
                <Compass className="w-4 h-4 text-emerald-400 animate-spin-slow" />
                <span className="font-bold text-white text-xs">WebGIS標高タイル 3D現況変換システム</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[10px]">
                地理院DEMタイル（10mメッシュ）やMapbox/AWS Terrain-RGB（シームレス標高タイル）の仕組みを再現。
                指定した緯度経度の境界（Bounding Box）からカラーピクセルデータを取得し、リアルタイムに3D地形に立ち上げます。
              </p>

              {/* 標高データソース選択トグル */}
              <div className="space-y-1.5">
                <span className="text-slate-400 text-[10px] block font-semibold flex items-center gap-1">
                  <span>🛰️ 標高タイルデータソースの選択</span>
                </span>
                <div className="flex bg-slate-950/70 p-1 rounded-lg border border-white/5">
                  {[
                    { id: 'gsi', label: '国土地理院' },
                    { id: 'aist', label: '産総研' },
                    { id: 'terrarium', label: 'Terrarium' }
                  ].map(src => (
                    <button
                      key={src.id}
                      onClick={() => handleElevationSourceChange(src.id as any)}
                      className={`flex-1 py-1.5 text-center text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                        elevationSource === src.id
                          ? 'bg-emerald-600/90 text-white shadow shadow-emerald-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* デコード公式のインタラクティブ表示 */}
              <div className="bg-slate-950/60 rounded-lg p-2.5 border border-emerald-500/10 font-mono text-[9px] text-slate-400 space-y-1.5">
                <div className="font-bold text-emerald-400 text-[10px] flex items-center gap-1 justify-between">
                  <span>ℹ️ {elevationSource === 'gsi' ? '国土地理院' : elevationSource === 'aist' ? '産総研シームレス' : 'Mapzen/AWS Terrarium'} 標高デコード</span>
                  <span className="bg-emerald-500/10 text-emerald-400 text-[8px] px-1 rounded font-normal">Active</span>
                </div>
                
                {elevationSource === 'gsi' && (
                  <>
                    <div className="bg-slate-900/80 p-1.5 rounded text-white text-center border border-white/5 text-[9.5px] font-bold">
                      H = (R × 65536 + G × 256 + B) × 0.01 - 10000 (m)
                    </div>
                    <p className="text-[8px] text-slate-500 leading-normal">
                      ※ $x = 2^{16}R + 2^8G + B$ において $x &lt; 2^{23}$ の場合。
                      $R=128, G=0, B=0$ の無効値は 0m と判定され、1cm精度の絶対高度を完全に復元。
                    </p>
                  </>
                )}
                {elevationSource === 'aist' && (
                  <>
                    <div className="bg-slate-900/80 p-1.5 rounded text-white text-center border border-white/5 text-[9.5px] font-bold">
                      H = (R × 65536 + G × 256 + B) × 0.01 × (地層係数)
                    </div>
                    <p className="text-[8px] text-slate-500 leading-normal">
                      地層活断層などの地層特性と連動。コンクリート構造設計時の耐支持力や土質弾塑性定数（N値）に合わせた地盤補正を 3D空間にリアルタイム・マッピング。
                    </p>
                  </>
                )}
                {elevationSource === 'terrarium' && (
                  <>
                    <div className="bg-slate-900/80 p-1.5 rounded text-white text-center border border-white/5 text-[9.5px] font-bold">
                      H = (R × 256 + G + B / 256) - 32768 (m)
                    </div>
                    <p className="text-[8px] text-slate-500 leading-normal">
                      AWS Open Dataで配信されるグローバル標準フォーマット。世界測地系（WGS84）楕円体高からジオイド高補正をシームレスに行い、全天候型の地形データを3Dモデル化。
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* 地形インポートコントロール */}
            <div className="glass-panel rounded-xl p-4 shadow-xl border border-white/10 text-xs text-slate-300 space-y-4 bg-slate-900/60">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <MapIcon className="w-4 h-4 text-emerald-400" />
                  実地形・現況地盤モデルの選択
                </span>
                {isGisImported && (
                  <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[8px] font-bold font-mono">
                    適用中
                  </span>
                )}
              </div>

              {/* 地形選択カード */}
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {[
                  { id: 'fuji', name: '富士山麓（御殿場・急勾配裾野）', desc: '標高差約100mの円錐形火口を模した圧倒的な起伏。縦断勾配と切盛土設計の検証に最適。', elevRange: '12m 〜 110m' },
                  { id: 'kumano', name: '紀伊山地・熊野古道（急峻渓谷）', desc: '深く切り立った急峻なV字谷。通常ののり面では対応しきれず、擁壁設計が必須となる最高難度地形。', elevRange: '14m 〜 60m' },
                  { id: 'hakone', name: '箱根山（カルデラ外輪山と芦ノ湖）', desc: '外側に急激にせり上がる外輪山と、中央に窪むカルデラ湖。カーブと高低差が入り乱れる地形。', elevRange: '10m 〜 68m' },
                  { id: 'yatsugatake', name: '八ヶ岳連峰（清里・シームレス起伏）', desc: '連続した複数の巨大ピークと山岳尾根。高低のうねりがダイナミックに変化するシームレス起伏。', elevRange: '18m 〜 86m' },
                  { id: 'tokachi', name: '十勝平野（帯広・穏やかな平地）', desc: '傾斜がきわめて緩やかな平坦な大地。切土・盛土量が極限まで抑えられ、低コストな道路設計が可能。', elevRange: '26m 〜 32m' }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedGisPreset(item.id as any)}
                    className={`w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer block ${
                      selectedGisPreset === item.id
                        ? 'bg-emerald-500/15 border-emerald-500 shadow-md shadow-emerald-500/5 text-white'
                        : 'bg-slate-900/40 border-white/5 hover:border-white/15 hover:bg-slate-900/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span className="text-[11px]">{item.name}</span>
                      <span className="text-[9px] text-emerald-400 font-mono">{item.elevRange}</span>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal">{item.desc}</p>
                  </button>
                ))}
              </div>

              {/* インポート・適用実行ボタン */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                <button
                  onClick={() => handleImportGisTerrain(selectedGisPreset)}
                  className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  地盤高インポート
                </button>
                <button
                  onClick={handleClearGisTerrain}
                  disabled={!isGisImported}
                  className={`w-full py-2 border rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isGisImported
                      ? 'bg-slate-900 hover:bg-slate-800 border-white/10 text-slate-300'
                      : 'bg-slate-950/20 border-white/5 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  デフォルト
                </button>
              </div>

              {/* 成功ガイダンス */}
              {isGisImported && (
                <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[10px] text-emerald-400 leading-normal space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <span>✨ インポート成功 ＆ 同期完了</span>
                  </div>
                  <p>
                    現況地盤高がインポートされた地形に一新されました。等高線コンターの再マッピング、縦横断（CIM断面）、3Dビューの全起伏が、緯度経度メッシュに基づいて自動更新・同期されています！
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
