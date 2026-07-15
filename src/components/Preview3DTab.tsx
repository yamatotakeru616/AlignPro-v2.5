/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Layers, Rotate3d, Maximize2, AlertTriangle, Play, Pause, HelpCircle, Eye, EyeOff, RefreshCw, Move, Settings, Sun, Moon, Sunrise, Sunset, CloudFog, Car, Compass, Gauge, PlayCircle, PauseCircle, FastForward, Square, RotateCcw, TrendingUp, Download, Trash2, Circle, Database, GripHorizontal, X, Droplets, BookOpen } from 'lucide-react';
import { AlignmentPoint, CrossSectionParams, StationPoint, SectionSegment, DrainageInletData, GutterDrainageSegment, PileDesignResult, NoiseSegmentResult, HydroplaneSegmentResult } from '../types';
import { getGroundElevation, getInterpolatedSectionProperties, calculateMultiStageSlope, SlopePoint } from '../utils';

interface Preview3DTabProps {
  alignment: AlignmentPoint[];
  crossSection: CrossSectionParams;
  isActive: boolean; // このタブが表示されているか
  stations: StationPoint[];
  selectedStationDist: number;
  setSelectedStationDist: (dist: number) => void;
  setLayoutMode: (mode: 'triple' | 'map' | 'profile' | 'cross' | '3d' | 'export') => void;
  contourInterval: number;
  setContourInterval: (interval: number) => void;
  sections?: SectionSegment[];
  performanceMode?: 'eco' | 'standard' | 'high';
  roadNetwork?: any; // 複数路線のデータ
  onShowMarkdownList?: () => void;
}

export default function Preview3DTab({ 
  alignment, 
  crossSection, 
  isActive,
  stations,
  selectedStationDist,
  setSelectedStationDist,
  setLayoutMode,
  contourInterval,
  setContourInterval,
  sections = [],
  performanceMode = 'standard',
  roadNetwork,
  onShowMarkdownList
}: Preview3DTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [webGlSupported, setWebGlSupported] = useState<boolean>(true);
  const [isRotating, setIsRotating] = useState<boolean>(false); // 自動回転フラグ (デフォルトOFFに変更)

  // 雨水排水シミュレーション用の状態
  const [showDrainageSimulation, setShowDrainageSimulation] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showDrainageSimulation');
    return saved !== null ? saved === 'true' : false;
  });
  const [isDrainageSimulating, setIsDrainageSimulating] = useState<boolean>(true); // デフォルトで流れる
  const [detectedSags, setDetectedSags] = useState<any[]>([]);
  const [selectedSagIndex, setSelectedSagIndex] = useState<number | null>(null);
  const [drainagePanelPos, setDrainagePanelPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_drainagePanelPos');
    return saved ? JSON.parse(saved) : { x: 20, y: 120 };
  });

  // 道路排水計画用の状態（L型街渠・集水桝・吸込能力）
  const [rainfallIntensity, setRainfallIntensity] = useState<number>(50); // 降雨強度 mm/h
  const [cloggingFactor, setCloggingFactor] = useState<number>(10); // 集水桝ゴミ詰まり率 % (0 - 100)
  const [showGutterModel, setShowGutterModel] = useState<boolean>(true); // L型街渠の3Dモデル表示
  const [showInletModel, setShowInletModel] = useState<boolean>(true); // 集水桝の3Dモデル表示
  const [inletsData, setInletsData] = useState<DrainageInletData[]>([]); // 3D配置された集水桝の吸込・溢水演算データ
  const [guttersData, setGuttersData] = useState<GutterDrainageSegment[]>([]); // 側溝セグメントの排水演算データ
  const [qBaseNormal, setQBaseNormal] = useState<number>(() => {
    const saved = localStorage.getItem('3d_qBaseNormal');
    return saved !== null ? Number(saved) : 3.0;
  });
  const [qBaseSag, setQBaseSag] = useState<number>(() => {
    const saved = localStorage.getItem('3d_qBaseSag');
    return saved !== null ? Number(saved) : 5.0;
  });
  const [inletOverrides, setInletOverrides] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('3d_inletOverrides');
    return saved !== null ? JSON.parse(saved) : {};
  });
  const qBaseNormalRef = useRef<number>(3.0);
  const qBaseSagRef = useRef<number>(5.0);
  const inletOverridesRef = useRef<Record<string, number>>({});
  const [drainageSubTab, setDrainageSubTab] = useState<'sags' | 'inlets' | 'gutters'>('inlets'); // 排水HUDのサブタブ選択 ('sags' | 'inlets' | 'gutters')
  const [showWireframe, setShowWireframe] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showWireframe');
    return saved !== null ? saved === 'true' : false;
  });
  const [showTerrainMesh, setShowTerrainMesh] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showTerrainMesh');
    return saved !== null ? saved === 'true' : true;
  });
  const [showTerrainContour, setShowTerrainContour] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showTerrainContour');
    return saved !== null ? saved === 'true' : true;
  });
  const [show3DSectionMesh, setShow3DSectionMesh] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_show3DSectionMesh');
    return saved !== null ? saved === 'true' : true;
  });

  // 自動非表示と表示ON/OFF制御用の追加状態
  const [isUiVisible, setIsUiVisible] = useState<boolean>(true);
  const [autoHideEnabled, setAutoHideEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_autoHideEnabled');
    return saved !== null ? saved === 'true' : false; // デフォルトを不意に消えないよう false に改善
  });
  const [showLayerBar, setShowLayerBar] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showLayerBar');
    return saved !== null ? saved === 'true' : true;
  });
  const [showCameraBar, setShowCameraBar] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showCameraBar');
    return saved !== null ? saved === 'true' : true;
  });
  const [showHelpCard, setShowHelpCard] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showHelpCard');
    return saved !== null ? saved === 'true' : true;
  });
  const [showSettingsDropdown, setShowSettingsDropdown] = useState<boolean>(false); // 設定パネルの開閉
  const [showCrossSectionPanel, setShowCrossSectionPanel] = useState<boolean>(true); // 横断個別確認ウインドウの表示
  const [showCrossSectionWindow, setShowCrossSectionWindow] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showCrossSectionWindow');
    return saved !== null ? saved === 'true' : true;
  });
  const [showStationIndicator, setShowStationIndicator] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showStationIndicator');
    return saved !== null ? saved === 'true' : true;
  });
  const [showEnvBar, setShowEnvBar] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showEnvBar');
    return saved !== null ? saved === 'true' : true;
  });

  // 新規追加機能用の状態変数
  const [showPilePanel, setShowPilePanel] = useState<boolean>(false);
  const [pilePanelPos, setPilePanelPos] = useState<{ x: number; y: number }>({ x: 20, y: 350 });
  const [pilesData, setPilesData] = useState<PileDesignResult[]>([]);

  const [showNoisePanel, setShowNoisePanel] = useState<boolean>(false);
  const [noisePanelPos, setNoisePanelPos] = useState<{ x: number; y: number }>({ x: 20, y: 550 });
  const [noiseData, setNoiseData] = useState<NoiseSegmentResult[]>([]);
  const [noiseTrafficVolume, setNoiseTrafficVolume] = useState<number>(1500); // 交通量 台/時

  const [showLccPanel, setShowLccPanel] = useState<boolean>(false);
  const [lccPanelPos, setLccPanelPos] = useState<{ x: number; y: number }>({ x: 300, y: 120 });
  const [simulationYear, setSimulationYear] = useState<number>(0);
  const [repairStrategy, setRepairStrategy] = useState<'none' | 'surface' | 'section'>('none');

  const [dvrCameraActive, setDvrCameraActive] = useState<boolean>(false);
  const [hydroData, setHydroData] = useState<HydroplaneSegmentResult[]>([]);
  const [stormRainIntensity, setStormRainIntensity] = useState<number>(80); // 豪雨の降雨強度 mm/h

  const [slopeProtectionType, setSlopeProtectionType] = useState<'grid_green' | 'grass' | 'concrete' | 'standard'>(() => {
    const saved = localStorage.getItem('3d_slopeProtectionType');
    return (saved as any) || 'grid_green';
  });
  const [enableBermMesh, setEnableBermMesh] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_enableBermMesh');
    return saved !== null ? saved === 'true' : true;
  });

  // 各フローティングUIのドラッグ位置状態
  const [layerBarPos, setLayerBarPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_layerBarPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [cameraBarPos, setCameraBarPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_cameraBarPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [envBarPos, setEnvBarPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_envBarPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [pierPanelPos, setPierPanelPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_pierPanelPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [helpCardPos, setHelpCardPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_helpCardPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [crossSectionPanelPos, setCrossSectionPanelPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_crossSectionPanelPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [drivePanelPos, setDrivePanelPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_drivePanelPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [settingsPanelPos, setSettingsPanelPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_settingsPanelPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const [stationIndicatorPos, setStationIndicatorPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('3d_stationIndicatorPos');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });

  // ドラッグ処理用の汎用イベントハンドラ (requestAnimationFrame ＆ ポインターキャンセル保証付き、VRAM4GB・低CPU最適化)
  const startUiDrag = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    pos: { x: number; y: number },
    setPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>,
    storageKey: string
  ) => {
    e.stopPropagation();
    
    const isTouch = 'touches' in e;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const startX = clientX - pos.x;
    const startY = clientY - pos.y;

    let ticking = false;

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      const isTouchMove = 'touches' in moveEvent;
      if (isTouchMove) {
        if (moveEvent.cancelable) {
          moveEvent.preventDefault();
        }
      }
      const currentX = isTouchMove ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = isTouchMove ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setPos({
            x: currentX - startX,
            y: currentY - startY
          });
          ticking = false;
        });
        ticking = true;
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
      document.removeEventListener('touchcancel', handleMouseUp);
      
      // 位置のローカルストレージ永続化
      setPos(currentPos => {
        localStorage.setItem(storageKey, JSON.stringify(currentPos));
        return currentPos;
      });
    };

    // イベントリスナーの登録（低遅延かつ高安定なドラッグ）
    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('touchmove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
    document.addEventListener('touchcancel', handleMouseUp);
  };

  // 全てのUI位置をリセット
  const resetAllUiPositions = () => {
    const origin = { x: 0, y: 0 };
    setLayerBarPos(origin);
    setCameraBarPos(origin);
    setEnvBarPos(origin);
    setPierPanelPos(origin);
    setHelpCardPos(origin);
    setCrossSectionPanelPos(origin);
    setDrivePanelPos(origin);
    setSettingsPanelPos(origin);
    setStationIndicatorPos(origin);
    setPilePanelPos({ x: 20, y: 350 });
    setNoisePanelPos({ x: 20, y: 550 });
    setLccPanelPos({ x: 300, y: 120 });

    localStorage.removeItem('3d_layerBarPos');
    localStorage.removeItem('3d_cameraBarPos');
    localStorage.removeItem('3d_envBarPos');
    localStorage.removeItem('3d_pierPanelPos');
    localStorage.removeItem('3d_helpCardPos');
    localStorage.removeItem('3d_crossSectionPanelPos');
    localStorage.removeItem('3d_drivePanelPos');
    localStorage.removeItem('3d_settingsPanelPos');
    localStorage.removeItem('3d_stationIndicatorPos');
  };

  const [pierInterval, setPierInterval] = useState<number>(() => {
    const saved = localStorage.getItem('3d_pierInterval');
    return saved !== null ? Number(saved) : 20;
  });
  const [individualPierAngles, setIndividualPierAngles] = useState<Record<number, number>>(() => {
    const saved = localStorage.getItem('3d_individualPierAngles');
    return saved !== null ? JSON.parse(saved) : {};
  });
  const [showPierSettingsPanel, setShowPierSettingsPanel] = useState<boolean>(true);

  const [timeOfDay, setTimeOfDay] = useState<number>(() => {
    const saved = localStorage.getItem('3d_timeOfDay');
    return saved !== null ? Number(saved) : 12; // デフォルト 12:00
  });

  const [fogDensity, setFogDensity] = useState<number>(() => {
    const saved = localStorage.getItem('3d_fogDensity');
    return saved !== null ? Number(saved) : 0.0015; // デフォルト 0.0015
  });

  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLight1Ref = useRef<THREE.DirectionalLight | null>(null);
  const dirLight2Ref = useRef<THREE.DirectionalLight | null>(null);

  // カラー補間用のヘルパー
  const lerpColor = (color1: string, color2: string, factor: number): string => {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);

    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);

    const r = Math.round(r1 + factor * (r2 - r1));
    const g = Math.round(g1 + factor * (g2 - g1));
    const b = Math.round(b1 + factor * (b2 - b1));

    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  };

  useEffect(() => {
    localStorage.setItem('3d_timeOfDay', String(timeOfDay));
  }, [timeOfDay]);

  useEffect(() => {
    localStorage.setItem('3d_fogDensity', String(fogDensity));
  }, [fogDensity]);

  useEffect(() => {
    localStorage.setItem('3d_showCrossSectionWindow', String(showCrossSectionWindow));
  }, [showCrossSectionWindow]);

  useEffect(() => {
    localStorage.setItem('3d_showStationIndicator', String(showStationIndicator));
  }, [showStationIndicator]);

  useEffect(() => {
    localStorage.setItem('3d_showEnvBar', String(showEnvBar));
  }, [showEnvBar]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const t = timeOfDay;

    // 24時間の日照サイクルを補間するためのキーカラー・ライティング設定
    const stops = [
      { t: 0, bg: '#020208', ambient: '#0f172a', ambIntensity: 0.15, sun: '#38bdf8', sunIntensity: 0.25, sunPos: new THREE.Vector3(-100, 150, -100), aux: '#090d16', auxIntensity: 0.05 },
      { t: 5, bg: '#040412', ambient: '#0f172a', ambIntensity: 0.15, sun: '#38bdf8', sunIntensity: 0.25, sunPos: new THREE.Vector3(-120, 100, -80), aux: '#090d16', auxIntensity: 0.05 },
      { t: 6.5, bg: '#3b0764', ambient: '#312e81', ambIntensity: 0.25, sun: '#fb923c', sunIntensity: 0.55, sunPos: new THREE.Vector3(-150, 40, 50), aux: '#1e1b4b', auxIntensity: 0.1 },
      { t: 8, bg: '#bae6fd', ambient: '#e2e8f0', ambIntensity: 0.55, sun: '#ffedd5', sunIntensity: 0.9, sunPos: new THREE.Vector3(-120, 160, 60), aux: '#38bdf8', auxIntensity: 0.35 },
      { t: 12, bg: '#e0f2fe', ambient: '#ffffff', ambIntensity: 0.65, sun: '#ffffff', sunIntensity: 1.1, sunPos: new THREE.Vector3(10, 240, 40), aux: '#93c5fd', auxIntensity: 0.45 },
      { t: 15, bg: '#bae6fd', ambient: '#ffffff', ambIntensity: 0.65, sun: '#fef3c7', sunIntensity: 1.05, sunPos: new THREE.Vector3(120, 180, -40), aux: '#93c5fd', auxIntensity: 0.4 },
      { t: 17, bg: '#f97316', ambient: '#fed7aa', ambIntensity: 0.45, sun: '#ea580c', sunIntensity: 0.8, sunPos: new THREE.Vector3(150, 50, -80), aux: '#4c1d95', auxIntensity: 0.2 },
      { t: 18.5, bg: '#4c1d95', ambient: '#1e1b4b', ambIntensity: 0.3, sun: '#c084fc', sunIntensity: 0.45, sunPos: new THREE.Vector3(140, 10, -90), aux: '#0f172a', auxIntensity: 0.1 },
      { t: 21, bg: '#050515', ambient: '#0f172a', ambIntensity: 0.15, sun: '#38bdf8', sunIntensity: 0.25, sunPos: new THREE.Vector3(-60, 120, -110), aux: '#090d16', auxIntensity: 0.05 },
      { t: 24, bg: '#020208', ambient: '#0f172a', ambIntensity: 0.15, sun: '#38bdf8', sunIntensity: 0.25, sunPos: new THREE.Vector3(-100, 150, -100), aux: '#090d16', auxIntensity: 0.05 },
    ];

    // 現在時刻を包含するストップ（i, i+1）を見つける
    let i = 0;
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k].t && t <= stops[k + 1].t) {
        i = k;
        break;
      }
    }

    const s1 = stops[i];
    const s2 = stops[i + 1];
    const range = s2.t - s1.t;
    const ratio = range > 0 ? (t - s1.t) / range : 0;

    // 線形補間
    const bgStr = lerpColor(s1.bg, s2.bg, ratio);
    const fogStr = bgStr;
    const ambientStr = lerpColor(s1.ambient, s2.ambient, ratio);
    const ambientIntensity = s1.ambIntensity + ratio * (s2.ambIntensity - s1.ambIntensity);
    const sunStr = lerpColor(s1.sun, s2.sun, ratio);
    const sunIntensity = s1.sunIntensity + ratio * (s2.sunIntensity - s1.sunIntensity);
    const sunPos = new THREE.Vector3().copy(s1.sunPos).lerp(s2.sunPos, ratio);
    const auxStr = lerpColor(s1.aux, s2.aux, ratio);
    const auxIntensity = s1.auxIntensity + ratio * (s2.auxIntensity - s1.auxIntensity);

    // Three.js シーンに適用
    scene.background = new THREE.Color(bgStr);
    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(fogStr);
      scene.fog.density = fogDensity;
    }

    if (ambientLightRef.current) {
      ambientLightRef.current.color.set(ambientStr);
      ambientLightRef.current.intensity = ambientIntensity;
    }

    if (dirLight1Ref.current) {
      dirLight1Ref.current.color.set(sunStr);
      dirLight1Ref.current.intensity = sunIntensity;
      dirLight1Ref.current.position.copy(sunPos);
    }

    if (dirLight2Ref.current) {
      dirLight2Ref.current.color.set(auxStr);
      dirLight2Ref.current.intensity = auxIntensity;
    }
  }, [timeOfDay, fogDensity]);

  // 橋脚のリスト（UIでの表示および操作用）をリアルタイムに算出
  const getPiersList = () => {
    const list: Array<{ index: number; distance: number; type: 'bridge' | 'viaduct'; originalAngle: number }> = [];
    if (alignment.length === 0) return list;
    
    let lastDist = -999;
    let pierIndex = 0;
    
    for (let i = 0; i < alignment.length; i++) {
      const pt = alignment[i];
      const secProps = getInterpolatedSectionProperties(pt.distance, sections, crossSection);
      const isStructure = secProps.type === 'bridge' || secProps.type === 'viaduct';
      
      if (isStructure) {
        const shouldPlace = i > 0 && i < alignment.length - 1 && (
          lastDist === -999 || (pt.distance - lastDist) >= pierInterval
        );
        
        if (shouldPlace) {
          // 地盤高との差
          const cy = pt.z;
          const groundZ = pt.groundZ;
          const depth = secProps.girderDepth ?? (secProps.type === 'bridge' ? 1.8 : 1.4);
          const pierH = cy - groundZ;
          
          if (pierH > 3.0) {
            const dx = pt.tangentX;
            const dz = -pt.tangentY;
            const basicAngle = Math.atan2(dx, dz);
            
            list.push({
              index: pierIndex,
              distance: pt.distance,
              type: secProps.type as 'bridge' | 'viaduct',
              originalAngle: basicAngle
            });
            lastDist = pt.distance;
            pierIndex++;
          }
        }
      } else {
        lastDist = -999;
      }
    }
    return list;
  };

  const piers = getPiersList();

  // 3Dプレビュー用の断面データ生成関数（DrawingsTabのものと同様、ピュアに計算して返す）
  const generateCrossSectionData = (dist: number, planZ: number, groundZ: number) => {
    const svgW = 400;
    const svgH = 160;

    const hDiff = planZ - groundZ; // 正＝盛土、負＝切土

    const sectionProps = getInterpolatedSectionProperties(dist, sections, crossSection);
    
    const leftWidth = sectionProps.leftLaneWidth;
    const rightWidth = sectionProps.rightLaneWidth;
    const shoulder = sectionProps.shoulderWidth;
    const sectionType = sectionProps.type; // 'earthwork' | 'bridge' | 'viaduct'

    const csScale = 14; 
    const cx = svgW / 2;
    const cy = sectionType === 'earthwork' 
      ? svgH / 2 - hDiff * csScale * 0.5 
      : svgH / 2 - 20;

    const toCSVGPixel = (offsetLX: number, heightLY: number) => {
      return {
        x: cx + offsetLX * csScale,
        y: cy - heightLY * csScale
      };
    };

    const ptCenter = toCSVGPixel(0, 0);
    const ptLeftLane = toCSVGPixel(-leftWidth, -0.02 * leftWidth);
    const ptLeftShoulder = toCSVGPixel(-leftWidth - shoulder, -0.02 * leftWidth - 0.04 * shoulder);
    const ptRightLane = toCSVGPixel(rightWidth, -0.02 * rightWidth);
    const ptRightShoulder = toCSVGPixel(rightWidth + shoulder, -0.02 * rightWidth - 0.04 * shoulder);

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

    const pavePolygonPointsStr = [
      ptLeftShoulder, ptLeftLane, ptCenter, ptRightLane, ptRightShoulder,
      paveUnder.rightShoulder, paveUnder.rightLane, paveUnder.center, paveUnder.leftLane, paveUnder.leftShoulder
    ].map(p => `${p.x},${p.y}`).join(' ');

    const basePolygonPointsStr = [
      paveUnder.leftShoulder, paveUnder.leftLane, paveUnder.center, paveUnder.rightLane, paveUnder.rightShoulder,
      baseUnder.rightShoulder, baseUnder.rightLane, baseUnder.center, baseUnder.leftLane, baseUnder.leftShoulder
    ].map(p => `${p.x},${p.y}`).join(' ');

    const subgradePolygonPointsStr = [
      baseUnder.leftShoulder, baseUnder.leftLane, baseUnder.center, baseUnder.rightLane, baseUnder.rightShoulder,
      subgradeUnder.rightShoulder, subgradeUnder.rightLane, subgradeUnder.center, subgradeUnder.leftLane, subgradeUnder.leftShoulder
    ].map(p => `${p.x},${p.y}`).join(' ');

    const roadPathStr = `M ${ptLeftShoulder.x},${ptLeftShoulder.y} L ${ptLeftLane.x},${ptLeftLane.y} L ${ptCenter.x},${ptCenter.y} L ${ptRightLane.x},${ptRightLane.y} L ${ptRightShoulder.x},${ptRightShoulder.y}`;

    let leftSlopePathStr = '';
    let rightSlopePathStr = '';
    let hatchPointsStr = '';
    let leftStructurePolyStr = '';
    let rightStructurePolyStr = '';
    let leftStruct = 'none';
    let rightStruct = 'none';

    let bridgeStructureHtml: React.ReactNode = null;

    const isFill = hDiff > 0;
    const slopeS = isFill ? (crossSection.fillSlopeGradient ?? 1.5) : (crossSection.cutSlopeGradient ?? 1.0);
    const leftSlopeDy = -hDiff;
    const rightSlopeDy = -hDiff;

    let maxSlopeX = Math.max(15, Math.abs(hDiff) * slopeS + 5);
    let ptGroundLeft = toCSVGPixel(-leftWidth - shoulder - maxSlopeX, leftSlopeDy);
    let ptGroundRight = toCSVGPixel(rightWidth + shoulder + maxSlopeX, rightSlopeDy);

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

  const autoHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringUiRef = useRef<boolean>(false); // 各種コントロールをホバーしている間は自動非表示を抑止

  // 3D表示・UI設定を localStorage に保存する副作用
  useEffect(() => {
    localStorage.setItem('3d_showWireframe', String(showWireframe));
  }, [showWireframe]);

  useEffect(() => {
    localStorage.setItem('3d_showTerrainMesh', String(showTerrainMesh));
  }, [showTerrainMesh]);
  useEffect(() => {
    localStorage.setItem('3d_show3DSectionMesh', String(show3DSectionMesh));
  }, [show3DSectionMesh]);

  useEffect(() => {
    localStorage.setItem('3d_showTerrainContour', String(showTerrainContour));
  }, [showTerrainContour]);

  useEffect(() => {
    localStorage.setItem('3d_autoHideEnabled', String(autoHideEnabled));
  }, [autoHideEnabled]);

  useEffect(() => {
    localStorage.setItem('3d_showLayerBar', String(showLayerBar));
  }, [showLayerBar]);

  useEffect(() => {
    localStorage.setItem('3d_showCameraBar', String(showCameraBar));
  }, [showCameraBar]);

  useEffect(() => {
    localStorage.setItem('3d_showHelpCard', String(showHelpCard));
  }, [showHelpCard]);

  useEffect(() => {
    localStorage.setItem('3d_showDrainageSimulation', String(showDrainageSimulation));
  }, [showDrainageSimulation]);

  useEffect(() => {
    localStorage.setItem('3d_drainagePanelPos', JSON.stringify(drainagePanelPos));
  }, [drainagePanelPos]);

  // UIを一時的に再表示させ、自動ハイドタイマーをリセットする
  const triggerUiVisibility = () => {
    setIsUiVisible(true);
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
    }
    // 自動非表示が有効、かつUIホバー中でない場合、一定時間後に非表示にする
    if (autoHideEnabled && !isHoveringUiRef.current) {
      autoHideTimerRef.current = setTimeout(() => {
        setIsUiVisible(false);
      }, 3500); // 3.5秒無操作で自動フェードアウト
    }
  };

  // 自動非表示のON/OFFやホバー状態が切り替わったときにタイマーを動的制御
  useEffect(() => {
    if (!autoHideEnabled) {
      setIsUiVisible(true);
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    } else {
      triggerUiVisibility();
    }
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, [autoHideEnabled]);

  // 走行シミュレーション（ドライブモード）状態
  const [isDriving, setIsDriving] = useState<boolean>(false);
  const [driveDistance, setDriveDistance] = useState<number>(() => {
    const saved = localStorage.getItem('3d_driveDistance');
    return saved !== null ? Number(saved) : 0;
  });
  const [driveSpeed, setDriveSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('3d_driveSpeed');
    return saved !== null ? Number(saved) : 60;
  }); // km/h
  const [driveTimeScale, setDriveTimeScale] = useState<number>(() => {
    const saved = localStorage.getItem('3d_driveTimeScale');
    return saved !== null ? Number(saved) : 1.0;
  }); // タイムスケール（倍率）
  const [driveCameraMode, setDriveCameraMode] = useState<'free' | 'chase' | 'driver' | 'birdseye' | 'diagonal'>(() => {
    const saved = localStorage.getItem('3d_driveCameraMode');
    return (saved as any) || 'diagonal';
  });
  const [showDrivePanel, setShowDrivePanel] = useState<boolean>(false);
  const [driveDirection, setDriveDirection] = useState<'forward' | 'backward'>(() => {
    const saved = localStorage.getItem('3d_driveDirection');
    return (saved as any) || 'forward';
  });
  const [showOncomingTraffic, setShowOncomingTraffic] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showOncomingTraffic');
    return saved !== null ? saved === 'true' : true;
  });
  const [showDriveMinimap, setShowDriveMinimap] = useState<boolean>(() => {
    const saved = localStorage.getItem('3d_showDriveMinimap');
    return saved !== null ? saved === 'true' : false; // デフォルト非表示で超スリム！
  });
  const [driveTrafficSide, setDriveTrafficSide] = useState<'left' | 'right'>(() => {
    const saved = localStorage.getItem('3d_driveTrafficSide');
    return (saved as 'left' | 'right') || 'left'; // デフォルト左側通行！
  });
  const [driveStats, setDriveStats] = useState({
    distance: 0,
    gradient: 0,
    curvatureType: 'straight' as 'straight' | 'curve-left' | 'curve-right',
    curvatureR: 0,
    stationName: 'No.0'
  });

  // 走行ログ記録機能の状態
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [logCount, setLogCount] = useState<number>(0);

  // レンダーループ内から最新値を読み書きするためのRefs
  const isDrivingRef = useRef<boolean>(false);
  const driveDistanceRef = useRef<number>(0);
  const driveSpeedRef = useRef<number>(60);
  const driveTimeScaleRef = useRef<number>(1.0);
  const driveCameraModeRef = useRef<'free' | 'chase' | 'driver' | 'birdseye' | 'diagonal'>('diagonal');
  const showDrivePanelRef = useRef<boolean>(false);
  
  const isRecordingRef = useRef<boolean>(false);
  const driveLogRef = useRef<any[]>([]);
  const lastLogTimeRef = useRef<number>(0);

  const showDrainageSimulationRef = useRef<boolean>(false);
  const isDrainageSimulatingRef = useRef<boolean>(true);
  const rainfallIntensityRef = useRef<number>(50);
  const cloggingFactorRef = useRef<number>(10);
  const showGutterModelRef = useRef<boolean>(true);
  const showInletModelRef = useRef<boolean>(true);

  // 側溝・集水桝の3Dメッシュ管理用Refs
  const gutterMeshesRef = useRef<THREE.Mesh[]>([]);
  const inletMeshesRef = useRef<THREE.Group[]>([]);
  const inletWaterEffectsRef = useRef<THREE.Mesh[]>([]); // 溢水警告エフェクト
  const gutterWaterEffectsRef = useRef<THREE.Mesh[]>([]); // 側溝溢水警告オーバーレイエフェクト

  const oncomingCarRef = useRef<THREE.Group | null>(null);
  const oncomingDistanceRef = useRef<number>(100);
  const driveDirectionRef = useRef<'forward' | 'backward'>('forward');
  const showOncomingTrafficRef = useRef<boolean>(true);
  const driveTrafficSideRef = useRef<'left' | 'right'>('left');

  // AR/ジャイロ連動状態
  const [gyroEnabled, setGyroEnabled] = useState<boolean>(false);
  const gyroEnabledRef = useRef<boolean>(false);
  const gyroAlphaRef = useRef<number | null>(null);
  const gyroBetaRef = useRef<number | null>(null);
  const gyroGammaRef = useRef<number | null>(null);
  const gyroOffsetRef = useRef<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 0, gamma: 0 });
  const [gyroPermissionStatus, setGyroPermissionStatus] = useState<'default' | 'granted' | 'denied'>('default');

  const requestGyroPermission = async () => {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setGyroPermissionStatus('granted');
          return true;
        } else {
          setGyroPermissionStatus('denied');
          return false;
        }
      } catch (e) {
        console.error('Error requesting device orientation permission:', e);
        return false;
      }
    } else {
      setGyroPermissionStatus('granted');
      return true;
    }
  };

  useEffect(() => {
    gyroEnabledRef.current = gyroEnabled;
    if (!gyroEnabled) {
      gyroAlphaRef.current = null;
      gyroBetaRef.current = null;
      gyroGammaRef.current = null;
      gyroOffsetRef.current = { alpha: 0, beta: 0, gamma: 0 };
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) gyroAlphaRef.current = e.alpha;
      if (e.beta !== null) gyroBetaRef.current = e.beta;
      if (e.gamma !== null) gyroGammaRef.current = e.gamma;
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [gyroEnabled]);

  useEffect(() => { isDrivingRef.current = isDriving; }, [isDriving]);
  useEffect(() => { driveDistanceRef.current = driveDistance; }, [driveDistance]);
  useEffect(() => { driveSpeedRef.current = driveSpeed; }, [driveSpeed]);
  useEffect(() => { driveTimeScaleRef.current = driveTimeScale; }, [driveTimeScale]);
  useEffect(() => { driveCameraModeRef.current = driveCameraMode; }, [driveCameraMode]);
  useEffect(() => { showDrivePanelRef.current = showDrivePanel; }, [showDrivePanel]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { driveDirectionRef.current = driveDirection; }, [driveDirection]);
  useEffect(() => { showOncomingTrafficRef.current = showOncomingTraffic; }, [showOncomingTraffic]);
  useEffect(() => { driveTrafficSideRef.current = driveTrafficSide; }, [driveTrafficSide]);

  useEffect(() => {
    showDrainageSimulationRef.current = showDrainageSimulation;
    showGutterModelRef.current = showGutterModel;
    showInletModelRef.current = showInletModel;
    if (drainageGroupRef.current) {
      drainageGroupRef.current.visible = showDrainageSimulation;
    }
    if (showDrainageSimulation && roadGridRef.current.length > 0) {
      initDrainageParticles(roadGridRef.current.length);
      const sags = detectSags();
      setDetectedSags(sags);
      rebuildSagWarnings(sags);
      rebuildDrainageStructures(sags);
    } else {
      clearDrainageStructures();
    }
  }, [showDrainageSimulation, showGutterModel, showInletModel]);

  useEffect(() => {
    isDrainageSimulatingRef.current = isDrainageSimulating;
  }, [isDrainageSimulating]);

  useEffect(() => {
    rainfallIntensityRef.current = rainfallIntensity;
    if (showDrainageSimulation) {
      updateInletsCalculations();
    }
  }, [rainfallIntensity, showDrainageSimulation]);

  useEffect(() => {
    cloggingFactorRef.current = cloggingFactor;
    if (showDrainageSimulation) {
      updateInletsCalculations();
    }
  }, [cloggingFactor, showDrainageSimulation]);

  useEffect(() => {
    qBaseNormalRef.current = qBaseNormal;
    localStorage.setItem('3d_qBaseNormal', String(qBaseNormal));
    if (showDrainageSimulation) {
      updateInletsCalculations();
    }
  }, [qBaseNormal, showDrainageSimulation]);

  useEffect(() => {
    qBaseSagRef.current = qBaseSag;
    localStorage.setItem('3d_qBaseSag', String(qBaseSag));
    if (showDrainageSimulation) {
      updateInletsCalculations();
    }
  }, [qBaseSag, showDrainageSimulation]);

  useEffect(() => {
    inletOverridesRef.current = inletOverrides;
    localStorage.setItem('3d_inletOverrides', JSON.stringify(inletOverrides));
    if (showDrainageSimulation) {
      updateInletsCalculations();
    }
  }, [inletOverrides, showDrainageSimulation]);

  useEffect(() => {
    localStorage.setItem('3d_driveDirection', driveDirection);
  }, [driveDirection]);
  useEffect(() => {
    localStorage.setItem('3d_showOncomingTraffic', String(showOncomingTraffic));
  }, [showOncomingTraffic]);
  useEffect(() => {
    localStorage.setItem('3d_showDriveMinimap', String(showDriveMinimap));
  }, [showDriveMinimap]);
  useEffect(() => {
    localStorage.setItem('3d_driveTrafficSide', driveTrafficSide);
  }, [driveTrafficSide]);
  useEffect(() => {
    localStorage.setItem('3d_driveDistance', String(driveDistance));
  }, [driveDistance]);
  useEffect(() => {
    localStorage.setItem('3d_driveSpeed', String(driveSpeed));
  }, [driveSpeed]);
  useEffect(() => {
    localStorage.setItem('3d_driveTimeScale', String(driveTimeScale));
  }, [driveTimeScale]);
  useEffect(() => {
    localStorage.setItem('3d_driveCameraMode', driveCameraMode);
  }, [driveCameraMode]);

  // アライメントデータの範囲に走行距離を安全にクランプする
  useEffect(() => {
    if (alignment.length > 0) {
      const totalLength = alignment[alignment.length - 1].distance;
      if (driveDistance > totalLength) {
        setDriveDistance(totalLength);
      } else if (driveDistance < 0) {
        setDriveDistance(0);
      }
    }
  }, [alignment]);

  // アライメント点の間を線形補間する関数
  const getInterpolatedAlignmentPoint = (d: number): AlignmentPoint | null => {
    if (alignment.length === 0) return null;
    const totalLength = alignment[alignment.length - 1].distance;
    const clampedD = Math.max(0, Math.min(totalLength, d));

    // 二分探索で該当セグメントを探索
    let low = 0;
    let high = alignment.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (alignment[mid].distance < clampedD) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const idx2 = low;
    if (idx2 === 0) {
      return alignment[0];
    }
    const idx1 = idx2 - 1;
    const p1 = alignment[idx1];
    const p2 = alignment[idx2];
    
    const denom = p2.distance - p1.distance;
    const ratio = denom > 0 ? (clampedD - p1.distance) / denom : 0;

    return {
      station: p1.station + ratio * (p2.station - p1.station),
      distance: clampedD,
      x: p1.x + ratio * (p2.x - p1.x),
      y: p1.y + ratio * (p2.y - p1.y),
      z: p1.z + ratio * (p2.z - p1.z),
      groundZ: p1.groundZ + ratio * (p2.groundZ - p1.groundZ),
      tangentX: p1.tangentX + ratio * (p2.tangentX - p1.tangentX),
      tangentY: p1.tangentY + ratio * (p2.tangentY - p1.tangentY),
      normalX: p1.normalX + ratio * (p2.normalX - p1.normalX),
      normalY: p1.normalY + ratio * (p2.normalY - p1.normalY),
    };
  };

  // 縦断勾配 (%) を計算
  const getRoadSlopeAtDistance = (d: number): number => {
    const p1 = getInterpolatedAlignmentPoint(d - 0.5);
    const p2 = getInterpolatedAlignmentPoint(d + 0.5);
    if (!p1 || !p2) return 0;
    const distDiff = p2.distance - p1.distance;
    if (distDiff <= 0.01) return 0;
    return ((p2.z - p1.z) / distDiff) * 100;
  };

  // 最寄りの測点名を取得
  const getClosestStationAtDistance = (d: number): string => {
    if (stations.length === 0) return 'No.0';
    let closest = stations[0];
    let minDiff = Math.abs(stations[0].distance - d);
    for (const s of stations) {
      const diff = Math.abs(s.distance - d);
      if (diff < minDiff) {
        minDiff = diff;
        closest = s;
      }
    }
    const offset = d - closest.distance;
    const sign = offset >= 0 ? '+' : '-';
    return `${closest.name}${sign}${Math.abs(offset).toFixed(1)}m`;
  };

  // 平面曲率を動的に計算 (3点の差分ベクトルから)
  const getRoadCurvatureAtDistance = (d: number): { type: 'straight' | 'curve-left' | 'curve-right'; r: number } => {
    const p1 = getInterpolatedAlignmentPoint(d - 1.0);
    const p2 = getInterpolatedAlignmentPoint(d);
    const p3 = getInterpolatedAlignmentPoint(d + 1.0);
    if (!p1 || !p2 || !p3) return { type: 'straight', r: 0 };

    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;

    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (len1 < 0.01 || len2 < 0.01) return { type: 'straight', r: 0 };

    const n1x = v1x / len1;
    const n1y = v1y / len1;
    const n2x = v2x / len2;
    const n2y = v2y / len2;

    const cross = n1x * n2y - n1y * n2x;
    const dot = n1x * n2x + n1y * n2y;
    const angle = Math.atan2(cross, dot);

    if (Math.abs(angle) < 0.001) {
      return { type: 'straight', r: 0 };
    }

    const r = 2.0 / Math.abs(angle);
    return {
      type: angle > 0 ? 'curve-left' : 'curve-right',
      r: Math.round(r > 1000 ? 0 : r)
    };
  };

  // 統合された統計情報の取得
  const getDriveStatsAtDistance = (d: number) => {
    const p = getInterpolatedAlignmentPoint(d);
    if (!p) {
      return {
        distance: 0,
        gradient: 0,
        curvatureType: 'straight' as const,
        curvatureR: 0,
        stationName: 'No.0'
      };
    }

    const slope = getRoadSlopeAtDistance(d);
    const curve = getRoadCurvatureAtDistance(d);
    const stationName = getClosestStationAtDistance(d);

    return {
      distance: d,
      gradient: slope,
      curvatureType: curve.type,
      curvatureR: curve.r,
      stationName
    };
  };

  // 3D 自動車モデルの生成
  const createCarModel = (color: string = '#06b6d4'): THREE.Group => {
    const car = new THREE.Group();

    // 1. 車体ベース (Chassis) - 指定色
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.45, 3.8);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.8,
      roughness: 0.2,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.35;
    car.add(chassis);

    // 2. キャビン (Cabin) - スモークガラス調
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.55, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.8, -0.2);
    car.add(cabin);

    // 3. 車輪 (Wheels) - 4基
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: '#090d16',
      roughness: 0.8,
    });

    const wheelPositions = [
      { x: -0.95, y: 0.35, z: 1.1 },  // 前左
      { x: 0.95, y: 0.35, z: 1.1 },   // 前右
      { x: -0.95, y: 0.35, z: -1.1 }, // 後左
      { x: 0.95, y: 0.35, z: -1.1 },  // 後右
    ];

    wheelPositions.forEach((pos) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(pos.x, pos.y, pos.z);
      car.add(w);
    });

    // 4. ヘッドライト (Glowing Headlights)
    const lightGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });
    
    const leftHL = new THREE.Mesh(lightGeo, lightMat);
    leftHL.position.set(-0.6, 0.4, 1.91);
    car.add(leftHL);

    const rightHL = new THREE.Mesh(lightGeo, lightMat);
    rightHL.position.set(0.6, 0.4, 1.91);
    car.add(rightHL);

    // 5. テールライト (Red Taillights)
    const tailLightMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
    const leftTL = new THREE.Mesh(lightGeo, tailLightMat);
    leftTL.position.set(-0.6, 0.4, -1.91);
    car.add(leftTL);

    const rightTL = new THREE.Mesh(lightGeo, tailLightMat);
    rightTL.position.set(0.6, 0.4, -1.91);
    car.add(rightTL);

    // 6. 前方を照らす実体ライト (SpotLights) - 夜間に作動
    const spotLeft = new THREE.SpotLight('#ffffff', 0, 45, Math.PI / 6, 0.5, 1);
    spotLeft.position.set(-0.6, 0.4, 1.9);
    const targetLeft = new THREE.Object3D();
    targetLeft.position.set(-0.6, 0.4, 10.0);
    car.add(targetLeft);
    spotLeft.target = targetLeft;
    car.add(spotLeft);

    const spotRight = new THREE.SpotLight('#ffffff', 0, 45, Math.PI / 6, 0.5, 1);
    spotRight.position.set(0.6, 0.4, 1.9);
    const targetRight = new THREE.Object3D();
    targetRight.position.set(0.6, 0.4, 10.0);
    car.add(targetRight);
    spotRight.target = targetRight;
    car.add(spotRight);

    (car as any).headlights = [spotLeft, spotRight];

    return car;
  };

  // Three.js のインスタンスを保持するRefs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const carRef = useRef<THREE.Group | null>(null);

  const frameCountRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  // 動的な道路メッシュ・グループの保持
  const roadGroupRef = useRef<THREE.Group | null>(null);
  // 動的な地盤メッシュ・等高線グループの保持
  const terrainGroupRef = useRef<THREE.Group | null>(null);
  // 動的な断面メッシュ・グループの保持
  const crossSectionGroupRef = useRef<THREE.Group | null>(null);

  // 雨水排水シミュレーション用のRefs
  const drainageGroupRef = useRef<THREE.Group | null>(null);
  const roadGridRef = useRef<THREE.Vector3[][]>([]);
  const drainageParticlesRef = useRef<Array<{
    s: number;
    u: number;
    life: number;
    speed: number;
  }>>([]);
  const drainageParticleSystemRef = useRef<THREE.Points | null>(null);
  const sagMeshesRef = useRef<THREE.Mesh[]>([]);

  // アライメント全体の中心と最適ズーム半径を保持
  const alignmentCenter = useRef({ x: 0, y: 10, z: 0 });
  const alignmentRadius = useRef(240);

  // インタラクティブカメラ制御状態 (自作軽量 OrbitControls 代替)
  const cameraAngles = useRef({ theta: 0, phi: 0.01, radius: 240 });
  const cameraTarget = useRef({ x: 0, y: 10, z: 0 }); // 3Dカメラの可変注視点（パン可能）
  
  // プリセット視点へのスムーズなトランジション（Lerpアニメーション用）
  const presetTarget = useRef({
    theta: 0,
    phi: 0.01,
    radius: 240,
    targetX: 0,
    targetY: 10,
    targetZ: 0,
    active: false,
  });

  const mouseState = useRef({ isDown: false, button: 0, x: 0, y: 0 });
  const touchState = useRef({
    initialDist: 0,
    initialRadius: 100,
    initialX: 0,
    initialY: 0,
    isPanning: false,
  });

  // ==================== 🌧️ 雨水流路＆サグ自動検知シミュレータのアルゴリズム ====================
  
  // 双線形補間（Bilinear Interpolation）を用いて、グリッド座標 (s, u) から3D座標を取得する
  const getInterpolatedGridPosition = (s: number, u: number): THREE.Vector3 => {
    const grid = roadGridRef.current;
    if (!grid || grid.length === 0) return new THREE.Vector3();
    
    const sMax = grid.length - 1;
    const s0 = Math.max(0, Math.min(sMax - 1, Math.floor(s)));
    const s1 = s0 + 1;
    const u0 = Math.max(0, Math.min(3, Math.floor(u)));
    const u1 = u0 + 1;
    
    const fs = s - s0;
    const fu = u - u0;
    
    const p00 = grid[s0][u0];
    const p01 = grid[s0][u1];
    const p10 = grid[s1][u0];
    const p11 = grid[s1][u1];
    
    if (!p00 || !p01 || !p10 || !p11) return new THREE.Vector3();
    
    const p0 = p00.clone().lerp(p01, fu);
    const p1 = p10.clone().lerp(p11, fu);
    return p0.clone().lerp(p1, fs);
  };

  // 雨水粒子の初期化
  const initDrainageParticles = (segmentsCount: number) => {
    const group = drainageGroupRef.current;
    if (!group) return;
    
    // 既存のパーティクルシステムがあれば削除
    if (drainageParticleSystemRef.current) {
      group.remove(drainageParticleSystemRef.current);
      drainageParticleSystemRef.current.geometry.dispose();
      if (Array.isArray(drainageParticleSystemRef.current.material)) {
        drainageParticleSystemRef.current.material.forEach((m: any) => m.dispose());
      } else {
        drainageParticleSystemRef.current.material.dispose();
      }
      drainageParticleSystemRef.current = null;
    }
    
    const particleCount = 250; // 美しい流体表現に最適な密度
    const particles: Array<{ s: number; u: number; life: number; speed: number }> = [];
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        s: Math.random() * (segmentsCount - 1),
        u: Math.random() * 4,
        life: Math.random() * 8.0,
        speed: 1.0 + Math.random() * 1.5
      });
    }
    
    drainageParticlesRef.current = particles;
    
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // ソフトな丸いパーティクルテクスチャを canvas で動的生成
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(56, 189, 248, 0.8)'); // sky-400
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 16);
    }
    const tex = new THREE.CanvasTexture(canvas);
    
    const mat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      map: tex,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const pointSystem = new THREE.Points(geo, mat);
    group.add(pointSystem);
    drainageParticleSystemRef.current = pointSystem;
  };

  // 最急降下法を用いた雨水粒子の流動更新
  const updateDrainageParticles = (deltaTime: number) => {
    const grid = roadGridRef.current;
    if (!grid || grid.length === 0) return;
    const segmentsCount = grid.length;
    
    const particles = drainageParticlesRef.current;
    if (particles.length === 0) return;
    
    const positions: number[] = [];
    const colors: number[] = [];
    
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      
      p.life -= deltaTime;
      if (p.life <= 0) {
        // 寿命が来たら、ランダムな位置に再配置
        p.s = Math.random() * (segmentsCount - 1);
        p.u = Math.random() * 4;
        p.life = 4.0 + Math.random() * 4.0;
      }
      
      // ポテンシャル（標高）の勾配を有限差分で算出（最急降下法: v = -grad H）
      const ds = 0.05;
      const du = 0.05;
      
      const h0 = getInterpolatedGridPosition(p.s, p.u).y;
      const h_s = getInterpolatedGridPosition(Math.max(0, Math.min(segmentsCount - 1, p.s + ds)), p.u).y;
      const h_u = getInterpolatedGridPosition(p.s, Math.max(0, Math.min(4, p.u + du))).y;
      
      const grad_s = (h_s - h0) / ds;
      const grad_u = (h_u - h0) / du;
      
      // 流速の調整 (下り坂ほど速く、勾配のマイナス方向へ流す)
      const flowSpeed = 2.0;
      p.s -= grad_s * flowSpeed * deltaTime;
      p.u -= grad_u * flowSpeed * deltaTime;
      
      // 範囲外に出た場合は再配置
      if (p.s < 0 || p.s >= segmentsCount - 1 || p.u < 0 || p.u > 4) {
        p.s = Math.random() * (segmentsCount - 1);
        p.u = Math.random() * 4;
        p.life = 4.0 + Math.random() * 4.0;
      }
      
      // 3D空間上の座標を取得
      let pos3D = getInterpolatedGridPosition(p.s, p.u);
      
      // --- 🌊 集水桝（集水ます）吸い込み・バイパス動的シミュレーション ---
      let suckedIn = false;
      if (inletsData.length > 0 && showInletModelRef.current) {
        for (let inlet of inletsData) {
          const distToInlet = pos3D.distanceTo(inlet.position);
          if (distToInlet < 2.0) {
            // 溢水状態の場合の吸い込み抵抗
            const isFull = inlet.isOverflow;
            const suckChance = isFull ? Math.max(0.0, 1.0 - inlet.overflowRate) : 1.0;

            if (Math.random() < suckChance) {
              if (distToInlet < 0.4) {
                // 吸い込み成功、粒子消滅 ＆ 寿命リセット
                p.life = 0; // 次のフレームで再配置
                suckedIn = true;
                break;
              } else {
                // 引き寄せられる（引力）
                const pullForce = (2.0 - distToInlet) * 0.4;
                const dirToInlet = inlet.position.clone().sub(pos3D).normalize();
                pos3D.addScaledVector(dirToInlet, pullForce * deltaTime * 3);
              }
            } else if (isFull) {
              // 溢水時は、桝から噴出するような挙動を極小プラス
              pos3D.y += 0.15 * Math.sin(p.life * 5.0) * inlet.overflowRate;
            }
          }
        }
      }

      if (!suckedIn) {
        // 路面のアスファルトと z-fighting しないように極小オフセット (8cm) 上げる
        pos3D.y += 0.08;
      }
      
      positions.push(pos3D.x, pos3D.y, pos3D.z);
      
      // 綺麗な青いグラデーション
      colors.push(0.2, 0.55, 1.0);
    }
    
    const points = drainageParticleSystemRef.current;
    if (points) {
      const geo = points.geometry;
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  };

  // サグ（縦断凹部・ローカルミニマム）の自動検知
  const detectSags = (): any[] => {
    const grid = roadGridRef.current;
    if (!grid || grid.length < 5) return [];
    
    const sagsList: any[] = [];
    
    // 中心線 (u = 2) の高低を前後のステーションと比較
    for (let i = 2; i < grid.length - 2; i++) {
      const hPrev = grid[i - 1][2].y;
      const hCurr = grid[i][2].y;
      const hNext = grid[i + 1][2].y;
      
      // ローカルミニマム（谷）
      if (hCurr < hPrev && hCurr < hNext) {
        const pt = alignment[i];
        if (!pt) continue;
        
        // 重複や近接した点をまとめる
        const isDuplicate = sagsList.some(s => Math.abs(s.stationDist - pt.distance) < 15.0);
        if (!isDuplicate) {
          const depth = Math.min(hPrev - hCurr, hNext - hCurr);
          sagsList.push({
            index: i,
            stationDist: pt.distance,
            position: grid[i][2].clone(),
            depth: depth,
            risk: depth > 0.04 ? 'high' : 'medium'
          });
        }
      }
    }
    return sagsList;
  };

  // サグ警告（縦型レーザー＆路面脈動レッドサークル）の生成
  const rebuildSagWarnings = (sags: any[]) => {
    const group = drainageGroupRef.current;
    if (!group) return;
    
    // 既存の警告メッシュをすべて消去
    sagMeshesRef.current.forEach(m => {
      group.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat: any) => mat.dispose());
      } else if (m.material) {
        m.material.dispose();
      }
    });
    sagMeshesRef.current = [];
    
    sags.forEach((sag, idx) => {
      const pos = sag.position;
      
      // 1. 縦型レーザービーコン (天を衝く赤い半透明のシリンダー)
      const beaconHeight = 25.0;
      const beaconGeo = new THREE.CylinderGeometry(0.2, 0.2, beaconHeight, 6);
      beaconGeo.translate(0, beaconHeight / 2, 0); // 下部を路面に揃える
      
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0xff3b30, // iOS風のビビッドレッド
        transparent: true,
        opacity: 0.4,
        wireframe: true
      });
      
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(pos.x, pos.y, pos.z);
      group.add(beacon);
      sagMeshesRef.current.push(beacon);
      
      // 2. 道路表面の赤いサークル（脈動パドルエフェクト）
      const puddleGeo = new THREE.RingGeometry(0.1, 4.2, 16);
      puddleGeo.rotateX(-Math.PI / 2); // 水平に倒す
      
      const puddleMat = new THREE.MeshBasicMaterial({
        color: 0xff3b30,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      
      const puddle = new THREE.Mesh(puddleGeo, puddleMat);
      puddle.position.set(pos.x, pos.y + 0.12, pos.z); // z-fighting 防止
      (puddle as any).isPulsating = true;
      (puddle as any).baseOpacity = 0.3;
      (puddle as any).pulseSpeed = 1.8 + idx * 0.15;
      
      group.add(puddle);
      sagMeshesRef.current.push(puddle);
    });
  };

  // ==================== 🌧️ L型街渠（側溝）＆ 集水桝 3D配置と吸込能力シミュレータ ====================

  // 排水構造物のクリア
  const clearDrainageStructures = () => {
    const group = drainageGroupRef.current;
    if (!group) return;

    // L型街渠のクリア
    gutterMeshesRef.current.forEach(m => {
      group.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat: any) => mat.dispose());
      } else if (m.material) {
        m.material.dispose();
      }
    });
    gutterMeshesRef.current = [];

    // 集水桝のクリア
    inletMeshesRef.current.forEach(g => {
      group.remove(g);
      g.traverse((child: any) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => mat.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
    });
    inletMeshesRef.current = [];

    // 溢水警告エフェクトのクリア
    inletWaterEffectsRef.current.forEach(m => {
      group.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat: any) => mat.dispose());
      } else if (m.material) {
        m.material.dispose();
      }
    });
    inletWaterEffectsRef.current = [];

    // 側溝警告オーバーレイエフェクトのクリア
    gutterWaterEffectsRef.current.forEach(m => {
      group.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat: any) => mat.dispose());
      } else if (m.material) {
        m.material.dispose();
      }
    });
    gutterWaterEffectsRef.current = [];
  };

  // 排水構造物の再構築
  const rebuildDrainageStructures = (sags: any[]) => {
    clearDrainageStructures();

    const group = drainageGroupRef.current;
    const grid = roadGridRef.current;
    if (!group || !grid || grid.length < 3) return;

    const segmentsCount = grid.length;

    // パフォーマンス安全ガード：低スペック（ECO）モードではポリゴン数や描画を抑制
    const isEco = performanceMode === 'eco';
    const isHigh = performanceMode === 'high';
    const step = isEco ? 2 : 1; // ECOモードでは側溝セグメントを間引く

    // 1. L型街渠（側溝）の3D生成
    const tempGuttersList: GutterDrainageSegment[] = [];
    if (showGutterModelRef.current) {
      const gutterMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a8a8a, // コンクリートグレー
        roughness: 0.8,
        metalness: 0.1,
      });

      // 左側 (u = 0) と右側 (u = 4) の側溝を生成
      for (let side of [0, 4]) {
        const sideLabel = side === 0 ? '左側' : '右側';
        for (let i = 0; i < segmentsCount - 1; i += step) {
          const nextIdx = Math.min(segmentsCount - 1, i + step);
          const p1 = grid[i][side];
          const p2 = grid[nextIdx][side];
          if (!p1 || !p2) continue;

          // 2点間の距離と角度を計算
          const dir = p2.clone().sub(p1);
          const length = dir.length();
          const midPoint = p1.clone().add(dir.clone().multiplyScalar(0.5));

          // 側溝ブロック形状 (幅 0.35m, 高さ 0.15m)
          const gutterGeo = new THREE.BoxGeometry(0.35, 0.15, length);
          const segMat = gutterMaterial.clone();
          const mesh = new THREE.Mesh(gutterGeo, segMat);

          // 道路の外側に少しずらし、高さを合わせる
          const offsetSign = side === 0 ? -1 : 1;
          mesh.position.copy(midPoint);
          // 道路の法線・接線方向に合わせて回転
          mesh.lookAt(p2);
          // lookAtでZ軸がp2を向くので、X方向に少しシフト
          mesh.translateOnAxis(new THREE.Vector3(1, 0, 0), offsetSign * 0.18);
          // 道路表面から極小オフセット下げる（段差）
          mesh.position.y -= 0.02;

          // メタデータ付与
          const currentGutterIdx = tempGuttersList.length;
          (mesh as any).isGutter = true;
          (mesh as any).gutterIndex = currentGutterIdx;

          group.add(mesh);
          gutterMeshesRef.current.push(mesh);

          // 側溝警告オーバーレイ (幅 0.38m, 高さ 0.02m) を少し浮かせて配置
          const gutterOverlayGeo = new THREE.BoxGeometry(0.38, 0.02, length);
          const overlayMat = new THREE.MeshBasicMaterial({
            color: 0x3b82f6, // 初期色は青
            transparent: true,
            opacity: 0, // 初期不透明度は0（安全時は非表示）
            depthWrite: false, // 描画のチラつきを防止
          });
          const overlayMesh = new THREE.Mesh(gutterOverlayGeo, overlayMat);
          overlayMesh.position.copy(mesh.position);
          overlayMesh.rotation.copy(mesh.rotation);
          overlayMesh.position.y += 0.08; // 側溝のすぐ上に浮かべる
          
          (overlayMesh as any).isGutterOverlay = true;
          (overlayMesh as any).gutterIndex = currentGutterIdx;
          
          group.add(overlayMesh);
          gutterWaterEffectsRef.current.push(overlayMesh);

          // 縦断勾配 (%) の算出
          const dist1 = alignment[i]?.distance || 0;
          const dist2 = alignment[nextIdx]?.distance || (dist1 + length);
          const deltaDist = dist2 - dist1;
          const slope = deltaDist > 0 ? ((p2.y - p1.y) / deltaDist) * 100 : 0;

          tempGuttersList.push({
            id: `gutter-${side === 0 ? 'L' : 'R'}-${i}`,
            startDist: dist1,
            endDist: dist2,
            side: sideLabel,
            slope: slope,
            capacity: 0,
            runoff: 0,
            isFull: false,
            riskLevel: 'safe',
            waterDepth: 0,
            positions: [p1.clone(), p2.clone()]
          });
        }
      }
    }

    // 2. 集水桝の3D配置とデータ構築
    if (showInletModelRef.current) {
      // 配置間隔 (ユーザ設定を優先、無ければパフォーマンス設定に応じたデフォルト値)
      const pitch = crossSection.inletSpacing !== undefined ? crossSection.inletSpacing : (isEco ? 40 : (isHigh ? 20 : 25));
      const roadWidth = 7.0; // 道路総幅員
      const halfWidth = roadWidth / 2;

      const tempInletsList: any[] = [];

      // 側溝の左側・右側
      for (let side of [0, 4]) {
        const sideLabel = side === 0 ? '左側' : '右側';
        const offsetSign = side === 0 ? -1 : 1;

        for (let i = 0; i < segmentsCount; i++) {
          const pt = alignment[i];
          if (!pt) continue;

          const dist = pt.distance;
          // ピッチ位置、またはサグに極めて近い(5m以内)の測点に集水桝を配置
          const isAtPitch = Math.floor(dist) % pitch < 1.5;
          const isAtSag = sags.some(s => Math.abs(s.stationDist - dist) < 5.0);

          // サグ部には必ず強制配置（設計セーフティガード）
          if (isAtPitch || isAtSag) {
            const pos = grid[i][side].clone();
            
            // 縦断勾配 (%) の計算
            let slope = 0;
            if (i < segmentsCount - 1) {
              const pNext = grid[i + 1][side];
              const distNext = alignment[i + 1]?.distance || (dist + 1);
              slope = ((pNext.y - pos.y) / (distNext - dist)) * 100;
            } else if (i > 0) {
              const pPrev = grid[i - 1][side];
              const distPrev = alignment[i - 1]?.distance || (dist - 1);
              slope = ((pos.y - pPrev.y) / (dist - distPrev)) * 100;
            }

            // 集水桝タイプに応じた形状寸法・マテリアル色設定
            const typeSelected = crossSection.inletType || 'standard';
            let boxWidth = 0.5;
            let boxLength = 0.5;
            let boxHeight = 0.7;
            let boxColor = 0x9c9c9c;
            let grateWidth = 0.48;
            let grateLength = 0.48;
            let grateHeight = 0.04;
            let grateColor = 0x424242;

            if (typeSelected === 'large') {
              boxWidth = 0.7;
              boxLength = 0.7;
              boxHeight = 0.9;
              boxColor = 0x808080;
              grateWidth = 0.66;
              grateLength = 0.66;
            } else if (typeSelected === 'grated') {
              boxWidth = 0.55;
              boxLength = 0.55;
              boxHeight = 0.75;
              boxColor = 0x888888;
              grateWidth = 0.53;
              grateLength = 0.53;
              grateHeight = 0.05;
              grateColor = 0x1a1a1a;
            } else if (typeSelected === 'high_capacity') {
              boxWidth = 0.5;
              boxLength = 0.8; // 長手方向に長い
              boxHeight = 0.8;
              boxColor = 0xaaaaaa;
              grateWidth = 0.46;
              grateLength = 0.76;
              grateColor = 0x242424;
            }

            // 3Dモデル（桝本体＋グレーチング）
            const inletGroup = new THREE.Group();
            inletGroup.position.copy(pos);
            
            // 向きを調整
            if (i < segmentsCount - 1) {
              inletGroup.lookAt(grid[i + 1][side]);
            }
            inletGroup.translateOnAxis(new THREE.Vector3(1, 0, 0), offsetSign * 0.18);
            inletGroup.position.y -= (boxHeight / 2); // 深さに応じて埋める

            // コンクリート製桝本体
            const boxGeo = new THREE.BoxGeometry(boxWidth, boxHeight, boxLength);
            const boxMat = new THREE.MeshStandardMaterial({
              color: boxColor,
              roughness: 0.9,
              metalness: 0.05
            });
            const boxMesh = new THREE.Mesh(boxGeo, boxMat);
            inletGroup.add(boxMesh);

            // 鉄製グレーチング蓋（上部）
            const grateGeo = new THREE.BoxGeometry(grateWidth, grateHeight, grateLength);
            const grateMat = new THREE.MeshStandardMaterial({
              color: grateColor,
              roughness: 0.5,
              metalness: 0.8
            });
            const grateMesh = new THREE.Mesh(grateGeo, grateMat);
            grateMesh.position.y = (boxHeight / 2) + (grateHeight / 2); // 桝の直上
            inletGroup.add(grateMesh);

            group.add(inletGroup);
            inletMeshesRef.current.push(inletGroup);

            // 3. 溢水警告エフェクト用のリングを配置
            const effectGeo = new THREE.RingGeometry(0.1, 1.8, 16);
            effectGeo.rotateX(-Math.PI / 2); // 水平にする
            const effectMat = new THREE.MeshBasicMaterial({
              color: 0x3b82f6, // 青
              transparent: true,
              opacity: 0, // 初期状態は非表示
              side: THREE.DoubleSide
            });
            const effectMesh = new THREE.Mesh(effectGeo, effectMat);
            effectMesh.position.set(pos.x, pos.y + 0.05, pos.z);
            // 外側シフトも同期
            const shiftVec = new THREE.Vector3(1, 0, 0).applyQuaternion(inletGroup.quaternion).multiplyScalar(offsetSign * 0.18);
            effectMesh.position.add(shiftVec);
            (effectMesh as any).isWaterEffect = true;
            (effectMesh as any).inletIndex = tempInletsList.length;

            group.add(effectMesh);
            inletWaterEffectsRef.current.push(effectMesh);

            // 水理計算の受け持ち面積 (㎡)
            // サグにある桝は、周囲から水が集まりやすいため面積を1.8倍に設計（工学的セーフティ）
            const tributaryArea = pitch * halfWidth * (isAtSag ? 1.8 : 1.0);

            tempInletsList.push({
              id: `inlet-${side === 0 ? 'L' : 'R'}-${i}`,
              stationName: `No.${Math.floor(dist / 20)}`,
              stationDist: dist,
              side: sideLabel,
              slope: slope,
              area: tributaryArea,
              position: pos.clone().add(shiftVec),
              isSag: isAtSag,
              qIn: 0,
              qCap: 0,
              isOverflow: false,
              overflowRate: 0,
            });

            // 重複配置を避けるためにアライメントピッチ分スキップ
            i += Math.max(1, Math.floor(pitch / 5));
          }
        }
      }

      // inletsData の更新と、現在の降雨強度に応じた水理演算の実行
      setTimeout(() => {
        setInletsData(tempInletsList);
        setGuttersData(tempGuttersList);
        executeInletsHydraulics(tempInletsList, tempGuttersList);
      }, 0);
    }
  };

  // 側溝および集水桝の水理計算
  const executeInletsHydraulics = (inlets: DrainageInletData[], gutters?: GutterDrainageSegment[]) => {
    const intensity = rainfallIntensityRef.current;
    const clogging = cloggingFactorRef.current;
    const C = 0.9; // アスファルト舗装の流出係数
    const n = 0.015; // コンクリート粗度係数
    const roadWidth = 7.0; // 道路総幅員
    const halfWidth = roadWidth / 2;

    // 1. 集水桝の水理計算
    const updatedInlets = inlets.map(inlet => {
      // 流入雨水量 Q_in (L/s) = C * I * A / 360
      const qIn = (C * intensity * inlet.area) / 360;

      // 桝の基本吸込能力 Q_base (L/s)
      const overrides = inletOverridesRef.current || {};
      
      // ユーザー設定された集水桝タイプと各タイプ別の能力値を取得
      const selectedType = crossSection.inletType || 'standard';
      let userConfiguredCapacity = 3.0;
      if (selectedType === 'standard') {
        userConfiguredCapacity = crossSection.inletCapacityStandard ?? 3.0;
      } else if (selectedType === 'large') {
        userConfiguredCapacity = crossSection.inletCapacityLarge ?? 5.0;
      } else if (selectedType === 'grated') {
        userConfiguredCapacity = crossSection.inletCapacityGrated ?? 7.0;
      } else if (selectedType === 'high_capacity') {
        userConfiguredCapacity = crossSection.inletCapacityHighCapacity ?? 10.0;
      }

      // サグ部用の1.67倍の能力割増（設計安全配慮）
      const baseNormalVal = userConfiguredCapacity;
      const baseSagVal = userConfiguredCapacity * 1.67;

      const qBase = overrides[inlet.id] !== undefined
        ? overrides[inlet.id]
        : (inlet.isSag ? baseSagVal : baseNormalVal);
      
      // 勾配バイパス効果：勾配1%につき4%吸込能力低下
      const slopeFactor = Math.max(0.2, 1.0 - 0.04 * Math.abs(inlet.slope));
      
      // ゴミ詰まり（Clogging）による能力低下
      const cloggingFactorSec = 1.0 - clogging / 100;

      // 実際の吸込能力 Q_cap (L/s)
      const qCap = qBase * slopeFactor * cloggingFactorSec;

      // 溢水判定
      const isOverflow = qIn > qCap;
      const overflowRate = isOverflow ? (qIn - qCap) / qCap : 0;

      return {
        ...inlet,
        qIn,
        qCap,
        isOverflow,
        overflowRate
      };
    });

    setInletsData(updatedInlets);

    // 2. 側溝（L型街渠）自体の排水・吸込通水能力計算
    const activeGutters = gutters || guttersData;
    const updatedGutters = activeGutters.map(gutter => {
      const length = gutter.endDist - gutter.startDist;
      // 集水面積: 長さ * 幅員半分 (m2)
      const catchArea = length * halfWidth;
      
      // 流入雨水量 Q_in (L/s) = C * I * A / 360
      let runoff = (C * intensity * catchArea) / 360;

      // 緩勾配（0.3%未満）では滞水・流れの停滞が発生するため、見かけの流入負荷を割増（工学的リスク表現）
      const isLowSlope = Math.abs(gutter.slope) < 0.3;
      if (isLowSlope) {
        runoff *= 1.35;
      }

      // 側溝の断面寸法（幅 0.35m, 深さ 0.15m）
      // 満水断面積 A = 0.0525 m2, 満水潤辺 P = 0.65m, 径深 R = 0.0808m, R^(2/3) = 0.187
      const A_gutter = 0.0525;
      const R_23 = 0.187;
      
      // 勾配の最低安全ガード (マニング式用に 0.08% 確保。勾配ゼロや逆勾配の停滞を表現)
      const calculatedSlope = Math.max(0.08, Math.abs(gutter.slope));
      const I_slope = calculatedSlope / 100;
      
      // マニング公式による最大許容通水量 Q_cap (L/s)
      let capacity = (1.0 / n) * A_gutter * R_23 * Math.sqrt(I_slope) * 1000;

      // ゴミ蓄積（Clogging）は側溝の底面断面積を減少させるため通水容量を減衰
      const gutterCloggingFactor = 1.0 - (clogging / 100) * 0.45;
      capacity *= gutterCloggingFactor;

      // 溢れ出しリスク判定
      const ratio = runoff / capacity;
      const isFull = ratio > 1.0;
      
      let riskLevel: 'safe' | 'warning' | 'danger' = 'safe';
      if (ratio > 1.0) {
        riskLevel = 'danger';
      } else if (ratio > 0.6) {
        riskLevel = 'warning';
      }

      // 推定水深 (cm) (マニングの水深-流量関係曲線をべき乗で簡易補間)
      const waterDepth = Math.max(0.1, Math.min(15.0, Math.pow(Math.min(1.5, ratio), 3/8) * 15));

      return {
        ...gutter,
        capacity,
        runoff,
        isFull,
        riskLevel,
        waterDepth
      };
    });

    setGuttersData(updatedGutters);

    // 3Dシーン上の側溝（L型街渠）メッシュカラーをリアルタイム更新
    gutterMeshesRef.current.forEach(mesh => {
      const idx = (mesh as any).gutterIndex;
      const data = updatedGutters[idx];
      if (data && mesh.material) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (data.riskLevel === 'danger') {
          mat.color.setHex(0xf43f5e); // 危険: 鮮烈な赤（Rose-500）
          mat.roughness = 0.3;
          mat.metalness = 0.4; // 冠水して反射しているコンクリートを表現
        } else if (data.riskLevel === 'warning') {
          mat.color.setHex(0xeab308); // 警戒: 鮮烈な黄色（Yellow-500）
          mat.roughness = 0.5;
          mat.metalness = 0.2;
        } else {
          mat.color.setHex(0x8a8a8a); // 安全: コンクリートグレー
          mat.roughness = 0.8;
          mat.metalness = 0.1;
        }
      }
    });

    // 側溝警告オーバーレイエフェクトのリアルタイム更新
    gutterWaterEffectsRef.current.forEach(overlay => {
      const idx = (overlay as any).gutterIndex;
      const data = updatedGutters[idx];
      if (data && overlay.material) {
        const mat = overlay.material as THREE.MeshBasicMaterial;
        if (data.riskLevel === 'danger') {
          mat.color.setHex(0xef4444); // 危険: 鮮烈な赤
          mat.opacity = 0.5;
          (overlay as any).pulseSpeed = 4.0; // 高速明滅
          (overlay as any).baseOpacity = 0.35;
        } else if (data.riskLevel === 'warning') {
          mat.color.setHex(0xeab308); // 警戒: 鮮烈な黄
          mat.opacity = 0.3;
          (overlay as any).pulseSpeed = 2.0; // 中速明滅
          (overlay as any).baseOpacity = 0.18;
        } else {
          mat.color.setHex(0x3b82f6);
          mat.opacity = 0.0; // 通常時は非表示
          (overlay as any).pulseSpeed = 0;
          (overlay as any).baseOpacity = 0;
        }
      }
    });

    // 3D警告エフェクト（脈動リング）の可視化パラメータの同期
    inletWaterEffectsRef.current.forEach(mesh => {
      const idx = (mesh as any).inletIndex;
      const data = updatedInlets[idx];
      if (data && mesh.material) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const ratio = data.qIn / Math.max(0.001, data.qCap);

        if (data.isOverflow) {
          mat.color.setHex(0xef4444); // 溢水・危険: 鮮烈な赤（Rose-500）
          mat.opacity = 0.4 + Math.min(0.4, data.overflowRate * 0.1);
          (mesh as any).pulseSpeed = 2.8 + data.overflowRate * 0.5;
          (mesh as any).baseOpacity = 0.45;
        } else if (ratio > 0.70) {
          mat.color.setHex(0xeab308); // 吸込逼迫・警戒: 鮮烈な黄
          mat.opacity = 0.3;
          (mesh as any).pulseSpeed = 1.8;
          (mesh as any).baseOpacity = 0.28;
        } else {
          mat.color.setHex(0x3b82f6); // 通常・良好: 青
          mat.opacity = 0.15;
          (mesh as any).pulseSpeed = 1.1;
          (mesh as any).baseOpacity = 0.15;
        }
      }
    });
  };

  // 外部から降雨強度などが変更された際、3D構築をせず水理計算データのみを更新
  const updateInletsCalculations = () => {
    if (inletsData.length === 0) return;
    executeInletsHydraulics(inletsData, guttersData);
  };

  // 1. WebGL サポート判定および初期化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGL サポート判定 (別ダミーキャンバスで判定することで本キャンバスのコンテキスト重複・競合を完全に防止)
    try {
      const dummyCanvas = document.createElement('canvas');
      const gl = dummyCanvas.getContext('webgl2') || dummyCanvas.getContext('webgl') || dummyCanvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGlSupported(false);
        return;
      }
    } catch (e) {
      setWebGlSupported(false);
      return;
    }

    // シーン作成
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030712'); // 深い宇宙・ダークモード
    sceneRef.current = scene;

    // フォグをかけて奥をなじませる
    scene.fog = new THREE.FogExp2('#030712', fogDensity);

    // カメラ
    const camera = new THREE.PerspectiveCamera(
      45,
      canvas.clientWidth / canvas.clientHeight,
      1,
      1000
    );
    cameraRef.current = camera;

    // レンダー (エラーハンドリング付きで安全に生成)
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: performanceMode !== 'eco',
        alpha: false,
        powerPreference: "high-performance"
      });
    } catch (err) {
      console.error("Three.js renderer creation failed:", err);
      setWebGlSupported(false);
      return;
    }
    renderer.setPixelRatio(performanceMode === 'eco' ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    
    // 高品質モードの場合は影を有効化
    if (performanceMode === 'high') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } else {
      renderer.shadowMap.enabled = false;
    }
    rendererRef.current = renderer;

    // 環境光
    const ambientLight = new THREE.AmbientLight('#ffffff', performanceMode === 'eco' ? 0.6 : 0.4);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    // ディレクショナルライト (太陽光、平行光源)
    const dirLight1 = new THREE.DirectionalLight('#ffffff', performanceMode === 'high' ? 1.1 : 0.8);
    dirLight1.position.set(100, 200, 100);
    if (performanceMode === 'high') {
      dirLight1.castShadow = true;
      dirLight1.shadow.mapSize.width = 1024;
      dirLight1.shadow.mapSize.height = 1024;
      dirLight1.shadow.camera.near = 0.5;
      dirLight1.shadow.camera.far = 500;
      const d = 150;
      dirLight1.shadow.camera.left = -d;
      dirLight1.shadow.camera.right = d;
      dirLight1.shadow.camera.top = d;
      dirLight1.shadow.camera.bottom = -d;
    }
    scene.add(dirLight1);
    dirLight1Ref.current = dirLight1;

    const dirLight2 = new THREE.DirectionalLight('#3b82f6', performanceMode === 'eco' ? 0.15 : 0.3); // 補助光 (青みがかった照り返し)
    dirLight2.position.set(-100, -50, -100);
    scene.add(dirLight2);
    dirLight2Ref.current = dirLight2;

    // 道路メッシュを乗せるグループを作成
    const roadGroup = new THREE.Group();
    scene.add(roadGroup);
    roadGroupRef.current = roadGroup;

    // 地盤メッシュ・等高線を乗せるグループを作成
    const terrainGroup = new THREE.Group();
    scene.add(terrainGroup);
    terrainGroupRef.current = terrainGroup;

    // 断面メッシュを乗せるグループを作成
    const crossSectionGroup = new THREE.Group();
    scene.add(crossSectionGroup);
    crossSectionGroupRef.current = crossSectionGroup;

    // 雨水排水シミュレーショングループを作成
    const drainageGroup = new THREE.Group();
    scene.add(drainageGroup);
    drainageGroupRef.current = drainageGroup;

    // 自動車モデルの生成とシーン追加
    const carModel = createCarModel('#06b6d4'); // 自車はシアン
    carModel.visible = false;
    scene.add(carModel);
    carRef.current = carModel;

    // 対向車モデルの生成とシーン追加
    const oncomingCarModel = createCarModel('#f59e0b'); // 対向車はオレンジ/ゴールド
    oncomingCarModel.visible = false;
    scene.add(oncomingCarModel);
    oncomingCarRef.current = oncomingCarModel;

    // リサイズ監視
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = Math.max(300, containerRef.current.clientHeight);

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();

      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (carModel) {
        scene.remove(carModel);
      }
      if (oncomingCarModel) {
        scene.remove(oncomingCarModel);
      }
      renderer.dispose();
    };
  }, [performanceMode]);

  // 1.5. 計画アライメントデータの変更に伴う、カメラ注視点（ターゲット）とカメラ高度（半径）の動的最適化
  // 常に「平面（真上から）」ビューで、線形全体がきれいに収まる高度（デフォルト）に自動設定します。
  useEffect(() => {
    if (alignment.length === 0) return;

    // 起点BPを原点とする相対座標系
    const offset = {
      x: alignment[0].x,
      y: alignment[0].y,
    };

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity; // Three.js Z
    let minZ = Infinity, maxZ = -Infinity; // Three.js Y (高さ)

    alignment.forEach(p => {
      const tx = p.x - offset.x;
      const tz = -(p.y - offset.y);
      const ty = p.z;

      if (tx < minX) minX = tx;
      if (tx > maxX) maxX = tx;
      if (tz < minY) minY = tz;
      if (tz > maxY) maxY = tz;
      if (ty < minZ) minZ = ty;
      if (ty > maxZ) maxZ = ty;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minZ + maxZ) / 2;
    const centerZ = (minY + maxY) / 2;

    const width = maxX - minX;
    const depth = maxY - minY;
    const maxDim = Math.max(width, depth);

    // 平面全体が最適に収まるカメラズーム半径 (45度視野角で、余裕マージンを考慮して1.25倍)
    const calculatedRadius = Math.max(120, Math.min(450, maxDim * 1.25));

    // 中心と半径の基準値を退避
    alignmentCenter.current = { x: centerX, y: centerY, z: centerZ };
    alignmentRadius.current = calculatedRadius;

    // カメラアングルを「平面ビュー（真上、theta=0, phi=0.01）」、高度を最適計算値に設定
    cameraAngles.current = { theta: 0, phi: 0.01, radius: calculatedRadius };
    cameraTarget.current = { x: centerX, y: centerY, z: centerZ };

    // プリセット自動補間のターゲット状態も同期
    presetTarget.current = {
      theta: 0,
      phi: 0.01,
      radius: calculatedRadius,
      targetX: centerX,
      targetY: centerY,
      targetZ: centerZ,
      active: false
    };
  }, [alignment]);

  // 2. 計画アライメント座標または断面パラメータの変更に伴う 3D 道路メッシュの動的再生成
  useEffect(() => {
    const roadGroup = roadGroupRef.current;
    if (!roadGroup || alignment.length === 0) return;

    // 既存のメッシュを完全にクリア
    while (roadGroup.children.length > 0) {
      const obj = roadGroup.children[0];
      roadGroup.remove(obj);
    }

    // メッシュを自作 BufferGeometry で構築する
    const segments = alignment.length;
    const laneL = crossSection.leftLaneWidth;
    const laneR = crossSection.rightLaneWidth;
    const shld = crossSection.shoulderWidth;
    const slopeS = crossSection.slopeGradient;

    // 頂点配列、インデックス配列
    // V0: 左法尻/法肩, V1: 左路肩端, V2: 左車線端, V3: 中心, V4: 右車線端, V5: 右路肩端, V6: 右法尻/法肩
    const vertices: number[] = [];
    const colors: number[] = [];
    const tempGrid: THREE.Vector3[][] = [];

    // マテリアルカラー定義
    const colorAsphalt = new THREE.Color('#1e293b'); // アスファルト
    const colorShoulder = new THREE.Color('#475569'); // 路肩グレー
    const colorCenterLine = new THREE.Color('#f59e0b'); // センターライン（黄）
    const colorFill = new THREE.Color('#ef4444'); // 盛土法面（赤）
    const colorCut = new THREE.Color('#3b82f6'); // 切土法面（青）

    // 中心座標を補正（Three.js 空間は原点中心に配置する方が扱いやすいため、BPの位置を基準にする）
    const offset = {
      x: alignment[0].x,
      y: alignment[0].y,
      z: 0
    };

    // 橋梁・高架橋の箱桁（Girder）用、および橋脚（Pier）用のデータを収集する配列
    const girderVertices: number[] = [];
    const pierPlacements: Array<{ 
      cx: number; 
      cy: number; 
      cz: number; 
      groundZ: number; 
      height: number; 
      type: 'bridge' | 'viaduct';
      angle: number;
      index: number;
      distance: number;
    }> = [];

    let lastPierDist = -999;

    // 1. 各 Station の頂点を生成
    for (let i = 0; i < segments; i++) {
      const pt = alignment[i];

      // 各 Station での断面プロパティを補間取得
      const secProps = getInterpolatedSectionProperties(pt.distance, sections, crossSection);
      const isBridge = secProps.type === 'bridge';
      const isViaduct = secProps.type === 'viaduct';
      const isStructure = isBridge || isViaduct;

      // 平面法線
      const nx = pt.normalX;
      const ny = pt.normalY;

      const planZ = pt.z;
      const groundZ = pt.groundZ;
      const hDiff = planZ - groundZ;
      const isFill = hDiff > 0;

      // 各断面点
      // V3 (Center)
      const cx = pt.x - offset.x;
      const cz = -(pt.y - offset.y); // Three.js Y軸とGIS Y軸をマッピング
      const cy = pt.z;

      // V2 (Left Lane End)
      const v2_x = cx + nx * laneL;
      const v2_z = cz - ny * laneL;
      const v2_y = cy - 0.02 * laneL; // 2% 傾斜

      // V1 (Left Shoulder End)
      const v1_x = v2_x + nx * shld;
      const v1_z = v2_z - ny * shld;
      const v1_y = v2_y - 0.04 * shld; // 4% 傾斜

      // 擁壁構造タイプの判定 (個別断面図と完全に一致する自動・手動判定)
      let leftStruct = crossSection.leftSlopeStructure || 'auto';
      let rightStruct = crossSection.rightSlopeStructure || 'auto';

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

      // 擁壁や構造の種類に応じた法幅（slopeDx）の計算
      let leftSlopeDx = 0;
      if (!isStructure) {
        if (leftStruct === 'gravity') {
          const hWall = Math.min(hDiff, 4.0);
          leftSlopeDx = 0.5 + 0.18 * hWall;
        } else if (leftStruct === 'block') {
          leftSlopeDx = Math.abs(hDiff) * 0.5;
        } else {
          // 通常のり面
          leftSlopeDx = Math.abs(hDiff) * slopeS + 1.5;
        }
      }

      let rightSlopeDx = 0;
      if (!isStructure) {
        if (rightStruct === 'gravity') {
          const hWall = Math.min(hDiff, 4.0);
          rightSlopeDx = 0.5 + 0.18 * hWall;
        } else if (rightStruct === 'block') {
          rightSlopeDx = Math.abs(hDiff) * 0.5;
        } else {
          // 通常のり面
          rightSlopeDx = Math.abs(hDiff) * slopeS + 1.5;
        }
      }

      // V0 (Left Slope Bottom/Top)
      const v0_x = isStructure ? v1_x : (v1_x + nx * leftSlopeDx);
      const v0_z = isStructure ? v1_z : (v1_z - ny * leftSlopeDx);
      const v0_y = isStructure ? v1_y : groundZ; // 法尻は地盤高

      // V4 (Right Lane End)
      const v4_x = cx - nx * laneR;
      const v4_z = cz + ny * laneR;
      const v4_y = cy - 0.02 * laneR;

      // V5 (Right Shoulder End)
      const v5_x = v4_x - nx * shld;
      const v5_z = v4_z + ny * shld;
      const v5_y = v4_y - 0.04 * shld;

      // V6 (Right Slope Bottom/Top)
      const v6_x = isStructure ? v5_x : (v5_x - nx * rightSlopeDx);
      const v6_z = isStructure ? v5_z : (v5_z + ny * rightSlopeDx);
      const v6_y = isStructure ? v5_y : groundZ;

      // 頂点バッファへ追加 (X, Y, Z の順)
      // Section 1断面あたり 7頂点
      const secVertices = [
        v0_x, v0_y, v0_z, // 0: L_Slope
        v1_x, v1_y, v1_z, // 1: L_Shoulder
        v2_x, v2_y, v2_z, // 2: L_Lane
        cx,   cy,   cz,   // 3: Center
        v4_x, v4_y, v4_z, // 4: R_Lane
        v5_x, v5_y, v5_z, // 5: R_Shoulder
        v6_x, v6_y, v6_z  // 6: R_Slope
      ];
      vertices.push(...secVertices);

      // グリッド用に道路表面の5点を保存 (u = 1, 2, 3, 4, 5)
      tempGrid.push([
        new THREE.Vector3(v1_x, v1_y, v1_z), // 1: L_Shoulder (u=1)
        new THREE.Vector3(v2_x, v2_y, v2_z), // 2: L_Lane (u=2)
        new THREE.Vector3(cx, cy, cz),       // 3: Center (u=3)
        new THREE.Vector3(v4_x, v4_y, v4_z), // 4: R_Lane (u=4)
        new THREE.Vector3(v5_x, v5_y, v5_z)  // 5: R_Shoulder (u=5)
      ]);

      // 橋梁・高架橋の場合、下部に箱桁（Girder）用ポリゴン頂点を追加
      if (isStructure) {
        const depth = secProps.girderDepth ?? (isBridge ? 1.8 : 1.4);
        
        // 橋桁の4点（V1, V5, V1の下、V5の下）
        // 左上、右上、左下、右下
        girderVertices.push(
          v1_x, v1_y, v1_z,          // 0: 左上
          v5_x, v5_y, v5_z,          // 1: 右上
          v1_x, v1_y - depth, v1_z,  // 2: 左下
          v5_x, v5_y - depth, v5_z   // 3: 右下
        );

        // 橋脚を pierInterval (施工ピッチ) ごとに自動配置
        const currentDist = pt.distance;
        
        // 構造物区間に入ったばかり、または前回の配置から指定された間隔（pierInterval）以上離れた場合
        const shouldPlacePier = i > 0 && i < segments - 1 && (
          lastPierDist === -999 || (currentDist - lastPierDist) >= pierInterval
        );

        if (shouldPlacePier) {
          const pierH = cy - groundZ;
          if (pierH > 3.0) { // 地盤から3m以上の高さがある場合に橋脚を作る
            // 接線方向の角度 (Y軸回転)
            // alignmentのtangentX, tangentYはGIS平面座標系での接線。
            // Three.js 空間ではGISのYが-Zにマップされているので、
            // 方向ベクトルは (dx, dz) = (pt.tangentX, -pt.tangentY)
            const dx = pt.tangentX;
            const dz = -pt.tangentY;
            const basicAngle = Math.atan2(dx, dz); // ラジアン単位

            // 個別回転オフセットを取得（キーは橋脚の連番インデックス。度数からラジアンへ変換）
            const pIdx = pierPlacements.length;
            const customOffsetDeg = individualPierAngles[pIdx] || 0;
            const customOffsetRad = (customOffsetDeg * Math.PI) / 180;

            pierPlacements.push({
              cx,
              cy: cy - depth, // 桁の下から
              cz,
              groundZ,
              height: pierH - depth,
              type: secProps.type as 'bridge' | 'viaduct',
              angle: basicAngle + customOffsetRad,
              index: pIdx,
              distance: currentDist
            });
            lastPierDist = currentDist;
          }
        }
      } else {
        // 構造物以外はダミー（桁を繋げないように空を入れる）
        girderVertices.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        // 構造物区間が途切れたら、次の構造物区間のために lastPierDist をリセット
        lastPierDist = -999;
      }
    }

    // 2. 三角形ポリゴン（インデックス）の生成
    const indices: number[] = [];
    const geometry = new THREE.BufferGeometry();

    for (let i = 0; i < segments - 1; i++) {
      const currRow = i * 7;
      const nextRow = (i + 1) * 7;

      // 1断面あたりのストリップを繋ぐ (左右対称の全6ストリップ)
      // 各ストリップは四角形（三角形2つ）で構成
      for (let s = 0; s < 6; s++) {
        const c0 = currRow + s;
        const c1 = currRow + s + 1;
        const n0 = nextRow + s;
        const n1 = nextRow + s + 1;

        // 三角形1
        indices.push(c0, n0, n1);
        // 三角形2
        indices.push(c0, n1, c1);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // 3. 各ストリップ（車線、路肩、法面）に異なるマテリアルカラーを適用するため、
    // THREE.Group や、部分マテリアルを使用することもできるが、
    // シンプルかつ堅牢に、パーツごとに複数の BufferGeometry メッシュを作ると完全にマテリアルを分離できる。
    // これにより美しい舗装、路肩、赤盛土・青切土が完璧に表現される。

    const createPartMesh = (colIdxStart: number, colIdxEnd: number, material: THREE.Material) => {
      const partGeo = new THREE.BufferGeometry();
      const partVerts: number[] = [];
      const partIndices: number[] = [];

      for (let i = 0; i < segments; i++) {
        const base = i * 7;
        for (let s = colIdxStart; s <= colIdxEnd; s++) {
          const idx = base + s;
          partVerts.push(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
        }
      }

      // 断面幅 (頂点数)
      const partW = colIdxEnd - colIdxStart + 1;
      for (let i = 0; i < segments - 1; i++) {
        const currR = i * partW;
        const nextR = (i + 1) * partW;
        for (let s = 0; s < partW - 1; s++) {
          const c0 = currR + s;
          const c1 = currR + s + 1;
          const n0 = nextR + s;
          const n1 = nextR + s + 1;
          partIndices.push(c0, n0, n1);
          partIndices.push(c0, n1, c1);
        }
      }

      partGeo.setAttribute('position', new THREE.Float32BufferAttribute(partVerts, 3));
      partGeo.setIndex(partIndices);
      partGeo.computeVertexNormals();

      const mesh = new THREE.Mesh(partGeo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      roadGroup.add(mesh);
    };

    // マテリアル定義 (PBR風でガラス光沢調に調整してテーマを極める)
    const matLeftSlope = new THREE.MeshStandardMaterial({
      color: colorCut,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
      wireframe: showWireframe
    });
    const matRightSlope = new THREE.MeshStandardMaterial({
      color: colorFill,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
      wireframe: showWireframe
    });
    const matAsphalt = new THREE.MeshStandardMaterial({
      color: colorAsphalt,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
      wireframe: showWireframe
    });
    const matShoulder = new THREE.MeshStandardMaterial({
      color: colorShoulder,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
      wireframe: showWireframe
    });
    const matConcreteWall = new THREE.MeshStandardMaterial({
      color: '#94a3b8', // コンクリートグレー (Slate 400)
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
      wireframe: showWireframe
    });

    // のり面保護工（質感）テクスチャ生成関数（軽量な128x128キャンバスを使用しドローコール・メモリ最適化）
    const createGrassTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#4ade80'; // 明るい緑
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 1500; i++) {
          const x = Math.random() * 128;
          const y = Math.random() * 128;
          const w = Math.random() * 1.5 + 0.5;
          ctx.fillStyle = Math.random() > 0.5 ? '#15803d' : '#22c55e'; // 濃い〜普通の緑
          ctx.fillRect(x, y, w, w);
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 6);
      return texture;
    };

    const createGridGreenTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#22c55e'; // ベースの緑
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 1000; i++) {
          const x = Math.random() * 128;
          const y = Math.random() * 128;
          ctx.fillStyle = Math.random() > 0.5 ? '#166534' : '#86efac';
          ctx.fillRect(x, y, 1, 1);
        }
        // コンクリート格子を描画
        ctx.strokeStyle = '#cbd5e1'; // 明るいコンクリートグレー
        ctx.lineWidth = 12;
        ctx.strokeRect(0, 0, 128, 128);
        ctx.beginPath();
        ctx.moveTo(64, 0);
        ctx.lineTo(64, 128);
        ctx.moveTo(0, 64);
        ctx.lineTo(128, 64);
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(3, 8);
      return texture;
    };

    const texGrass = createGrassTexture();
    const texGridGreen = createGridGreenTexture();

    // ユーザー選択に基づくのり面保護工マテリアルの構築
    let matLeftSlopeProtection: THREE.Material;
    let matRightSlopeProtection: THREE.Material;

    if (slopeProtectionType === 'grid_green') {
      matLeftSlopeProtection = new THREE.MeshStandardMaterial({
        map: texGridGreen,
        roughness: 0.85,
        metalness: 0.1,
        side: THREE.DoubleSide,
        wireframe: showWireframe
      });
      matRightSlopeProtection = new THREE.MeshStandardMaterial({
        map: texGridGreen,
        roughness: 0.85,
        metalness: 0.1,
        side: THREE.DoubleSide,
        wireframe: showWireframe
      });
    } else if (slopeProtectionType === 'grass') {
      matLeftSlopeProtection = new THREE.MeshStandardMaterial({
        map: texGrass,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
        wireframe: showWireframe
      });
      matRightSlopeProtection = new THREE.MeshStandardMaterial({
        map: texGrass,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
        wireframe: showWireframe
      });
    } else if (slopeProtectionType === 'concrete') {
      matLeftSlopeProtection = new THREE.MeshStandardMaterial({
        color: '#94a3b8', // コンクリートグレー
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide,
        wireframe: showWireframe
      });
      matRightSlopeProtection = new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide,
        wireframe: showWireframe
      });
    } else {
      // standard (カラーコードによる切盛の明確な視覚分離)
      matLeftSlopeProtection = matLeftSlope;
      matRightSlopeProtection = matRightSlope;
    }

    const matConcreteBerm = new THREE.MeshStandardMaterial({
      color: '#94a3b8', // 小段コンクリート (slate-400)
      roughness: 0.75,
      metalness: 0.15,
      side: THREE.DoubleSide,
      wireframe: showWireframe
    });

    // 詳細のり面（小段・保護工）の立体生成（ドローコール削減のため、セグメント全体を1つのマテリアルにバッチング）
    const createDetailedSlopeMesh = (isLeft: boolean) => {
      const grassVerts: number[] = [];
      const grassUvs: number[] = [];
      const grassIndices: number[] = [];
      
      const concreteVerts: number[] = [];
      const concreteIndices: number[] = [];

      for (let i = 0; i < segments - 1; i++) {
        const ptA = alignment[i];
        const ptB = alignment[i + 1];
        
        const secPropsA = getInterpolatedSectionProperties(ptA.distance, sections, crossSection);
        const secPropsB = getInterpolatedSectionProperties(ptB.distance, sections, crossSection);
        
        const isStructure = secPropsA.type === 'bridge' || secPropsA.type === 'viaduct' || secPropsA.type === 'tunnel' ||
                            secPropsB.type === 'bridge' || secPropsB.type === 'viaduct' || secPropsB.type === 'tunnel';
        if (isStructure) continue;

        const planZA = ptA.z;
        const groundZA = ptA.groundZ;
        const hDiffA = planZA - groundZA;

        const planZB = ptB.z;
        const groundZB = ptB.groundZ;
        const hDiffB = planZB - groundZB;

        // 擁壁構造タイプの判定
        let structA = isLeft 
          ? (crossSection.leftSlopeStructure || 'auto')
          : (crossSection.rightSlopeStructure || 'auto');
        let structB = isLeft 
          ? (crossSection.leftSlopeStructure || 'auto')
          : (crossSection.rightSlopeStructure || 'auto');

        if (structA === 'auto') {
          if (hDiffA > 2.5) structA = 'gravity';
          else if (hDiffA > 1.2 && hDiffA <= 2.5) structA = 'block';
          else structA = 'none';
        }
        if (structB === 'auto') {
          if (hDiffB > 2.5) structB = 'gravity';
          else if (hDiffB > 1.2 && hDiffB <= 2.5) structB = 'block';
          else structB = 'none';
        }

        const isConcreteWall = structA === 'gravity' || structA === 'block' || structB === 'gravity' || structB === 'block';

        if (isConcreteWall) {
          // コンクリート擁壁は一枚平面でシンプルに描画
          const baseCurr = i * 7;
          const baseNext = (i + 1) * 7;
          const colIdxStart = isLeft ? 0 : 5;
          const colIdxEnd = isLeft ? 1 : 6;

          const v0_idx = baseCurr + colIdxStart;
          const v1_idx = baseCurr + colIdxEnd;
          const v2_idx = baseNext + colIdxStart;
          const v3_idx = baseNext + colIdxEnd;

          const localVerts = [
            vertices[v0_idx * 3], vertices[v0_idx * 3 + 1], vertices[v0_idx * 3 + 2],
            vertices[v1_idx * 3], vertices[v1_idx * 3 + 1], vertices[v1_idx * 3 + 2],
            vertices[v2_idx * 3], vertices[v2_idx * 3 + 1], vertices[v2_idx * 3 + 2],
            vertices[v3_idx * 3], vertices[v3_idx * 3 + 1], vertices[v3_idx * 3 + 2]
          ];

          // 擁壁を concreteVerts にマージ
          const baseIdx = concreteVerts.length / 3;
          concreteVerts.push(...localVerts);
          concreteIndices.push(
            baseIdx + 0, baseIdx + 2, baseIdx + 3,
            baseIdx + 0, baseIdx + 3, baseIdx + 1
          );
          continue;
        }

        // 擁壁なし（通常のり面）
        const yStartA = isLeft ? (crossSection.leftLaneWidth + crossSection.shoulderWidth) : (crossSection.rightLaneWidth + crossSection.shoulderWidth);
        const yStartB = isLeft ? (crossSection.leftLaneWidth + crossSection.shoulderWidth) : (crossSection.rightLaneWidth + crossSection.shoulderWidth);

        // 路肩端の正確なY位置（Three.js空間での高さ）
        const zStartA = vertices[(i * 7 + (isLeft ? 1 : 5)) * 3 + 1];
        const zStartB = vertices[((i + 1) * 7 + (isLeft ? 1 : 5)) * 3 + 1];

        const bInterval = crossSection.bermInterval ?? 5.0;
        const bWidth = crossSection.bermWidth ?? 1.0;

        const ptsA = calculateMultiStageSlope(yStartA, zStartA, isLeft, ptA, crossSection, bInterval, bWidth);
        const ptsB = calculateMultiStageSlope(yStartB, zStartB, isLeft, ptB, crossSection, bInterval, bWidth);

        // --- 地盤標高へののり先のり肩すり付け境界自動生成（二分法） ---
        const isSlopeFitting = crossSection.enableSlopeFitting !== false;
        if (isSlopeFitting && ptsA.length > 1) {
          const lastIdx = ptsA.length - 1;
          const spStart = ptsA[0];
          const spLast = ptsA[lastIdx];
          const isCut = (spStart.z - ptA.groundZ) < 0;
          const sGrad = isCut ? (crossSection.cutSlopeGradient ?? 1.0) : (crossSection.fillSlopeGradient ?? 1.5);

          let minT = 0;
          let maxT = 60;
          let finalY = spLast.y;
          let finalZ = spLast.z;

          for (let step = 0; step < 6; step++) {
            const midT = (minT + maxT) / 2;
            const curY = spStart.y + midT;
            const curZ = isCut 
              ? spStart.z + (midT / sGrad)
              : spStart.z - (midT / sGrad);

            const nx = ptA.normalX;
            const ny = ptA.normalY;
            const cx = ptA.x;
            const cy = ptA.y;
            
            const actualX = isLeft ? (cx + nx * curY) : (cx - nx * curY);
            const actualY = isLeft ? (cy - ny * curY) : (cy + ny * curY);

            const groundZ = getGroundElevation(actualX, actualY);
            const error = curZ - groundZ;

            finalY = curY;
            finalZ = curZ;

            if (Math.abs(error) < 0.01) break;

            if (isCut) {
              if (error > 0) maxT = midT;
              else minT = midT;
            } else {
              if (error > 0) minT = midT;
              else maxT = midT;
            }
          }
          ptsA[lastIdx] = { ...spLast, y: finalY, z: finalZ };
        }

        if (isSlopeFitting && ptsB.length > 1) {
          const lastIdx = ptsB.length - 1;
          const spStart = ptsB[0];
          const spLast = ptsB[lastIdx];
          const isCut = (spStart.z - ptB.groundZ) < 0;
          const sGrad = isCut ? (crossSection.cutSlopeGradient ?? 1.0) : (crossSection.fillSlopeGradient ?? 1.5);

          let minT = 0;
          let maxT = 60;
          let finalY = spLast.y;let finalZ = spLast.z;

          for (let step = 0; step < 6; step++) {
            const midT = (minT + maxT) / 2;
            const curY = spStart.y + midT;
            const curZ = isCut 
              ? spStart.z + (midT / sGrad)
              : spStart.z - (midT / sGrad);

            const nx = ptB.normalX;
            const ny = ptB.normalY;
            const cx = ptB.x;
            const cy = ptB.y;
            
            const actualX = isLeft ? (cx + nx * curY) : (cx - nx * curY);
            const actualY = isLeft ? (cy - ny * curY) : (cy + ny * curY);

            const groundZ = getGroundElevation(actualX, actualY);
            const error = curZ - groundZ;

            finalY = curY;
            finalZ = curZ;

            if (Math.abs(error) < 0.01) break;

            if (isCut) {
              if (error > 0) maxT = midT;
              else minT = midT;
            } else {
              if (error > 0) minT = midT;
              else maxT = midT;
            }
          }
          ptsB[lastIdx] = { ...spLast, y: finalY, z: finalZ };
        }

        const maxNum = Math.max(ptsA.length, ptsB.length);
        const alignedA: SlopePoint[] = [...ptsA];
        const alignedB: SlopePoint[] = [...ptsB];

        while (alignedA.length < maxNum) alignedA.push(ptsA[ptsA.length - 1]);
        while (alignedB.length < maxNum) alignedB.push(ptsB[ptsB.length - 1]);

        // 3D座標変換ヘルパー
        const to3D = (sp: SlopePoint, pt: AlignmentPoint) => {
          const nx = pt.normalX;
          const ny = pt.normalY;
          const cx = pt.x - offset.x;
          const cz = -(pt.y - offset.y);
          const py = sp.z;

          if (isLeft) {
            return new THREE.Vector3(cx + nx * sp.y, py, cz - ny * sp.y);
          } else {
            return new THREE.Vector3(cx - nx * sp.y, py, cz + ny * sp.y);
          }
        };

        for (let k = 0; k < maxNum - 1; k++) {
          const spA1 = alignedA[k];
          const spA2 = alignedA[k + 1];
          const spB1 = alignedB[k];
          const spB2 = alignedB[k + 1];

          const vA1 = to3D(spA1, ptA);
          const vA2 = to3D(spA2, ptA);
          const vB1 = to3D(spB1, ptB);
          const vB2 = to3D(spB2, ptB);

          const isBermA = Math.abs(spA1.z - spA2.z) < 0.08 || spA1.type.includes('berm') || spA1.type.includes('ditch') || spA2.type.includes('ditch');
          const isBermB = Math.abs(spB1.z - spB2.z) < 0.08 || spB1.type.includes('berm') || spB1.type.includes('ditch') || spB2.type.includes('ditch');
          
          const isBerm = (isBermA || isBermB) && enableBermMesh;

          const localVerts = [
            vA1.x, vA1.y, vA1.z, // 0: A1
            vA2.x, vA2.y, vA2.z, // 1: A2
            vB1.x, vB1.y, vB1.z, // 2: B1
            vB2.x, vB2.y, vB2.z  // 3: B2
          ];

          if (isBerm) {
            const baseIdx = concreteVerts.length / 3;
            concreteVerts.push(...localVerts);
            concreteIndices.push(
              baseIdx + 0, baseIdx + 2, baseIdx + 3,
              baseIdx + 0, baseIdx + 3, baseIdx + 1
            );
          } else {
            const baseIdx = grassVerts.length / 3;
            grassVerts.push(...localVerts);
            grassIndices.push(
              baseIdx + 0, baseIdx + 2, baseIdx + 3,
              baseIdx + 0, baseIdx + 3, baseIdx + 1
            );
            
            const uStart = i / (segments - 1);
            const uEnd = (i + 1) / (segments - 1);
            const vStart = k / (maxNum - 1);
            const vEnd = (k + 1) / (maxNum - 1);

            grassUvs.push(
              uStart * 30, vStart * 10,
              uStart * 30, vEnd * 10,
              uEnd * 30, vStart * 10,
              uEnd * 30, vEnd * 10
            );
          }
        }
      }

      if (grassVerts.length > 0) {
        const grassGeo = new THREE.BufferGeometry();
        grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(grassVerts, 3));
        grassGeo.setAttribute('uv', new THREE.Float32BufferAttribute(grassUvs, 2));
        grassGeo.setIndex(grassIndices);
        grassGeo.computeVertexNormals();

        const matSlope = isLeft ? matLeftSlopeProtection : matRightSlopeProtection;
        const grassMesh = new THREE.Mesh(grassGeo, matSlope);
        grassMesh.castShadow = true;
        grassMesh.receiveShadow = true;
        roadGroup.add(grassMesh);
      }

      if (concreteVerts.length > 0) {
        const concreteGeo = new THREE.BufferGeometry();
        concreteGeo.setAttribute('position', new THREE.Float32BufferAttribute(concreteVerts, 3));
        concreteGeo.setIndex(concreteIndices);
        concreteGeo.computeVertexNormals();

        const concreteMesh = new THREE.Mesh(concreteGeo, matConcreteBerm);
        concreteMesh.castShadow = true;
        concreteMesh.receiveShadow = true;
        roadGroup.add(concreteMesh);
      }
    };

    // パーツ作成
    // 1. 左詳細法面
    createDetailedSlopeMesh(true);

    // 2. 左路肩 (V1 - V2)
    createPartMesh(1, 2, matShoulder);

    // 3. 車線部 (V2 - V4) (アスファルト)
    createPartMesh(2, 4, matAsphalt);

    // 4. 右路肩 (V4 - V5)
    createPartMesh(4, 5, matShoulder);

    // 5. 右詳細法面
    createDetailedSlopeMesh(false);

    // センターラインのアクセントとして、中心線に沿った細い立体チューブまたは線を重ねる
    const centerLinePoints: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i++) {
      const idx = i * 7 + 3; // Center
      // アスファルトよりわずかに上に配置してzファインティングを防止
      centerLinePoints.push(new THREE.Vector3(vertices[idx * 3], vertices[idx * 3 + 1] + 0.1, vertices[idx * 3 + 2]));
    }
    const centerCurve = new THREE.CatmullRomCurve3(centerLinePoints);
    const centerGeo = new THREE.TubeGeometry(centerCurve, segments, 0.3, 4, false);
    const centerMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', wireframe: showWireframe });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    roadGroup.add(centerMesh);

    // 7. 橋梁・高架橋（構造物）の 3D 描画
    if (girderVertices.length > 0) {
      // 橋桁メッシュ（側面2面、下面1面の合計3つのストリップ）
      // 1断面あたり4頂点
      const girderGeo = new THREE.BufferGeometry();
      const gVerts: number[] = [];
      const gIndices: number[] = [];

      for (let i = 0; i < segments; i++) {
        const base = i * 4;
        gVerts.push(
          girderVertices[base * 3],     girderVertices[base * 3 + 1],     girderVertices[base * 3 + 2],     // 0: 左上
          girderVertices[base * 3 + 3], girderVertices[base * 3 + 4],     girderVertices[base * 3 + 5],     // 1: 右上
          girderVertices[base * 3 + 6], girderVertices[base * 3 + 7],     girderVertices[base * 3 + 8],     // 2: 左下
          girderVertices[base * 3 + 9], girderVertices[base * 3 + 10],    girderVertices[base * 3 + 11]     // 3: 右下
        );
      }

      // 橋梁・高架橋の区間のみ、ポリゴンインデックスを生成（x, y, zがすべて0のダミー部分はスキップ）
      for (let i = 0; i < segments - 1; i++) {
        const curr = i * 4;
        const next = (i + 1) * 4;

        // Xが 0 ではない（＝橋梁・高架橋区間）か確認
        const isStrCurr = Math.abs(gVerts[curr * 3]) > 0.001;
        const isStrNext = Math.abs(gVerts[next * 3]) > 0.001;

        if (isStrCurr && isStrNext) {
          // 左側面 (0, 2)
          gIndices.push(curr + 0, next + 0, next + 2);
          gIndices.push(curr + 0, next + 2, curr + 2);

          // 右側面 (1, 3)
          gIndices.push(curr + 1, next + 3, next + 1);
          gIndices.push(curr + 1, curr + 3, next + 3);

          // 底面 (2, 3)
          gIndices.push(curr + 2, next + 2, next + 3);
          gIndices.push(curr + 2, next + 3, curr + 3);
        }
      }

      if (gIndices.length > 0) {
        girderGeo.setAttribute('position', new THREE.Float32BufferAttribute(gVerts, 3));
        girderGeo.setIndex(gIndices);
        girderGeo.computeVertexNormals();

        const matGirder = new THREE.MeshStandardMaterial({
          color: '#cbd5e1', // 明るいコンクリートグレー
          roughness: 0.4,
          metalness: 0.2,
          side: THREE.DoubleSide,
          wireframe: showWireframe
        });

        const girderMesh = new THREE.Mesh(girderGeo, matGirder);
        girderMesh.castShadow = true;
        girderMesh.receiveShadow = true;
        roadGroup.add(girderMesh);
      }
    }

    // 橋脚の 3D 描画と杭基礎・LCC・中性化タイムシミュレーションの適用
    const tempPilesList: PileDesignResult[] = [];
    if (pierPlacements.length > 0) {
      pierPlacements.forEach(pier => {
        // --- ① コンクリート中性化・劣化度 ＆ 3D変色のリアルタイム演算 ---
        const D_cover = 40.0; // かぶり厚 40mm
        let C_coef = 2.2; // 中性化速度係数
        
        // 補修戦略による中性化抑制効果
        if (repairStrategy === 'surface') {
          C_coef = 2.2 * 0.30; // 表面保護により速度を30%に抑制
        }
        
        let t_eff = simulationYear;
        if (repairStrategy === 'section' && simulationYear >= 40) {
          // 40年目に断面修復（リセット）
          t_eff = Math.max(0, simulationYear - 40);
        }
        
        const carbonationDepth = C_coef * Math.sqrt(t_eff); // 中性化深さ (mm)
        const degradationRatio = Math.min(1.0, carbonationDepth / D_cover);
        
        // 劣化に伴う3Dカラーブレンド（健全：#94a3b8、中性化・鉄筋露出：#475559に錆び色のブレンド）
        const normalColor = new THREE.Color('#94a3b8');
        const damagedColor = new THREE.Color('#3f4b5c').clone().lerp(new THREE.Color('#9a3412'), 0.25 * degradationRatio);
        const pierColor = normalColor.clone().lerp(damagedColor, degradationRatio);
        
        const matPier = new THREE.MeshStandardMaterial({
          color: pierColor,
          roughness: 0.5 + 0.4 * degradationRatio, // 劣化したコンクリートのザラザラ感を表現
          metalness: 0.1,
          wireframe: showWireframe
        });

        const pierW = pier.type === 'bridge' ? 4.5 : 3.0;
        const pierD = pier.type === 'bridge' ? 1.8 : 1.4;
        const pierGeo = new THREE.BoxGeometry(pierW, pier.height, pierD);
        const pierMesh = new THREE.Mesh(pierGeo, matPier);
        
        const py = pier.cy - pier.height / 2;
        pierMesh.position.set(pier.cx, py, pier.cz);
        pierMesh.rotation.y = pier.angle;
        pierMesh.castShadow = true;
        pierMesh.receiveShadow = true;
        (pierMesh as any).isPier = true; // 間引き用フラグ
        roadGroup.add(pierMesh);

        // --- ② 地盤支持力・基礎杭（Piles）の自動構造設計 ---
        const estN = Math.floor(15 + Math.sin(pier.distance * 0.04) * 10 + (pier.groundZ < 5 ? 15 : 0));
        const pDiam = crossSection.pileDiameter ?? 1.2;
        const pLen = crossSection.pileLength ?? 15.0;
        const pCount = crossSection.pileCountPerPier ?? 4;

        // 極限支持力算定公式：Ru = 40 * N * Ap + 10 * N * U * Ls
        const Ap = (Math.PI * pDiam * pDiam) / 4; // 先端面積
        const U = Math.PI * pDiam; // 周長
        const Ru = 40 * estN * Ap + 10 * estN * U * pLen; // 極限支持力 (kN)
        const Fs = 3.0; // 常時安全率
        const Ra = Ru / Fs; // 許容支持力 (kN)

        const appliedLoad = 1200 + pier.height * 110 + (pier.type === 'bridge' ? 800 : 300);
        const reqCount = Math.ceil(appliedLoad / Ra);
        const isBearingOk = pCount >= reqCount;
        const safetyFactor = (Ra * pCount) / appliedLoad;

        tempPilesList.push({
          pierIndex: pier.index,
          stationName: `No.${Math.floor(pier.distance / 20)}`,
          stationDist: pier.distance,
          groundElevation: pier.groundZ,
          pierHeight: pier.height,
          estNValue: estN,
          pileDiameter: pDiam,
          pileLength: pLen,
          requiredPilesCount: reqCount,
          ultimateBearingCap: Ru,
          allowableBearingCap: Ra,
          appliedLoad: appliedLoad,
          safetyFactor: safetyFactor,
          isBearingOk: isBearingOk
        });

        // --- ③ 基礎杭（Piles）とフーチングの 3D オブジェクト動的配置 ---
        const footingW = pierW + 1.2;
        const footingD = pierD + 1.2;
        const footingH = 1.2;
        const footingGeo = new THREE.BoxGeometry(footingW, footingH, footingD);
        const footingMat = new THREE.MeshStandardMaterial({
          color: pierColor.clone().multiplyScalar(0.85),
          roughness: 0.6,
          metalness: 0.1,
          wireframe: showWireframe
        });
        const footingMesh = new THREE.Mesh(footingGeo, footingMat);
        footingMesh.position.set(pier.cx, pier.groundZ - footingH / 2, pier.cz);
        footingMesh.rotation.y = pier.angle;
        footingMesh.castShadow = true;
        footingMesh.receiveShadow = true;
        (footingMesh as any).isPile = true;
        roadGroup.add(footingMesh);

        const pileMat = new THREE.MeshStandardMaterial({
          color: '#334155',
          roughness: 0.8,
          metalness: 0.2,
          wireframe: showWireframe
        });

        const cols = pCount <= 3 ? pCount : 2;
        const rows = Math.ceil(pCount / cols);
        const dx_spacing = footingW / (cols + 1);
        const dz_spacing = footingD / (rows + 1);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (r * cols + c >= pCount) break;

            const pileGeo = new THREE.CylinderGeometry(pDiam / 2, pDiam / 2, pLen, 8);
            const pileMesh = new THREE.Mesh(pileGeo, pileMat);
            
            const localX = -footingW / 2 + dx_spacing * (c + 1);
            const localZ = -footingD / 2 + dz_spacing * (r + 1);

            const rotX = localX * Math.cos(pier.angle) - localZ * Math.sin(pier.angle);
            const rotZ = localX * Math.sin(pier.angle) + localZ * Math.cos(pier.angle);

            const pileY = pier.groundZ - footingH - pLen / 2;
            pileMesh.position.set(pier.cx + rotX, pileY, pier.cz + rotZ);
            pileMesh.castShadow = true;
            pileMesh.receiveShadow = true;
            (pileMesh as any).isPile = true;

            roadGroup.add(pileMesh);
          }
        }
      });
      requestAnimationFrame(() => setPilesData(tempPilesList));
    }

    // --- 新機能②: 道路交通騒音3Dシミュレーション (ASJ RTN-Model 2018簡易) ＆ 防音壁配置 ---
    const noiseResults: NoiseSegmentResult[] = [];
    const simulatedVolume = noiseTrafficVolume ?? 1500; // 台/時
    const bHeight = crossSection.noiseBarrierHeight ?? 2.0;

    // --- 新機能③: 豪雨路面冠水・ハイドロプレーニング予測 ＆ 集水桝配置 ---
    const hydroplaneResults: HydroplaneSegmentResult[] = [];
    const isStorm = stormRainIntensity > 0;
    const rainIntensity = stormRainIntensity; // mm/h

    // 道路全セグメントにわたる物理評価
    if (stations && stations.length > 1) {
      for (let i = 0; i < stations.length - 1; i++) {
        const sCurr = stations[i];
        const sNext = stations[i + 1];

        const dist = sCurr.distance;
        const midX = (sCurr.x + sNext.x) / 2;
        const midY = (sCurr.y + sNext.y) / 2;
        const midZ = (sCurr.z + sNext.z) / 2;

        const px = midX - offset.x;
        const pz = -(midY - offset.y);
        const py = midZ;

        // 線形勾配の計算
        const ds = sNext.distance - sCurr.distance;
        const longitudinalSlope = ds > 0 ? (sNext.z - sCurr.z) / ds : 0;
        const crossSlope = crossSection.crossSlope ?? 0.02; // 横断勾配 (例: 2%)

        // --- ① 騒音計算 ---
        // 自動車音響出力レベル Lw の推計 (大型車混入率 20%, 速度 80km/h)
        const vSpeed = 80; // km/h
        const lw = 83 + 10 * Math.log10(simulatedVolume) + 20 * Math.log10(vSpeed / 80);
        
        // 受音点 (道路左右 20m, 地盤高 +1.2m)
        const d_distance = 20.0;
        let laeq_raw = lw - 8 - 20 * Math.log10(d_distance); // 遮音壁なしの騒音

        // 遮音壁の回折減衰（フレネル数 N_f の簡易計算）
        let deltaL = 0;
        const isBarrierEnabled = crossSection.enableNoiseBarrier !== false;
        if (isBarrierEnabled && bHeight > 0) {
          // 簡易フレネル回折減衰量
          const pathDifference = Math.sqrt(d_distance * d_distance + bHeight * bHeight) - d_distance;
          const lambda = 0.34; // 代表周波数 1000Hz の波長
          const Nf = (2 * pathDifference) / lambda;
          deltaL = Nf > 0 ? - (5 + 10 * Math.log10(Nf + 0.1)) : 0;
          deltaL = Math.max(-20, Math.min(0, deltaL)); // 最大20dB減衰
        }

        const laeq = laeq_raw + deltaL;
        const noiseLimit = 60.0; // 環境基準
        const isNoiseOk = laeq <= noiseLimit;

        noiseResults.push({
          stationName: `No.${Math.floor(dist / 20)}`,
          stationDist: dist,
          noiseLevelRaw: laeq_raw,
          noiseLevelWithBarrier: laeq,
          barrierHeight: bHeight,
          attenuationDb: deltaL,
          isLimitOk: isNoiseOk
        });

        // 3D防音壁の配置 (騒音超過エリア、または防音壁有効時に描画)
        if (isBarrierEnabled && bHeight > 0) {
          const barrierMat = new THREE.MeshStandardMaterial({
            color: isNoiseOk ? '#10b981' : '#f97316', // 基準値内：半透明緑、超過：オレンジ
            transparent: true,
            opacity: 0.65,
            roughness: 0.2,
            metalness: 0.8,
            side: THREE.DoubleSide
          });

          // 道路法線に直交させて配置
          const dx = sNext.x - sCurr.x;
          const dy = sNext.y - sCurr.y;
          const angle = Math.atan2(dy, dx);

          // 左右両側に防音壁を配置
          const halfWidth = (crossSection.leftLaneWidth + crossSection.rightLaneWidth) / 2 + 0.5;
          const leftX = px - halfWidth * Math.sin(angle);
          const leftZ = pz - halfWidth * Math.cos(angle);
          const rightX = px + halfWidth * Math.sin(angle);
          const rightZ = pz + halfWidth * Math.cos(angle);

          const barrierW = ds;
          const barrierD = 0.12; // 厚み 12cm
          const bGeo = new THREE.BoxGeometry(barrierW, bHeight, barrierD);

          // 左防音壁
          const leftB = new THREE.Mesh(bGeo, barrierMat);
          leftB.position.set(leftX, py + bHeight / 2, leftZ);
          leftB.rotation.y = angle;
          (leftB as any).isNoiseBarrier = true;
          roadGroup.add(leftB);

          // 右防音壁
          const rightB = new THREE.Mesh(bGeo, barrierMat);
          rightB.position.set(rightX, py + bHeight / 2, rightZ);
          rightB.rotation.y = angle;
          (rightB as any).isNoiseBarrier = true;
          roadGroup.add(rightB);
        }

        // --- ② 路面冠水・ハイドロプレーニング予測 ---
        const syntheticSlope = Math.sqrt(longitudinalSlope * longitudinalSlope + crossSlope * crossSlope);
        const drainageLength = (crossSection.leftLaneWidth + crossSection.rightLaneWidth) / 2; // 車線幅の半分を流れる

        // 降雨時の水膜厚 Hw (Gallaway公式の簡易モデル)
        // Hw = 0.046 * (I^0.5) * (L_D^0.5) * (i_S^-0.2)
        const hw_mm = isStorm 
          ? 0.046 * Math.pow(rainIntensity, 0.5) * Math.pow(drainageLength, 0.5) * Math.pow(Math.max(0.001, syntheticSlope), -0.2)
          : 0.0;

        // 限界ハイドロプレーニング速度 Vcrit = 10.5 * Hw^-0.5 + 25 (km/h)
        const vCrit = hw_mm > 0.1 
          ? 10.5 * Math.pow(hw_mm, -0.5) + 25.0
          : 120.0;

        // 冠水リスク評価：水膜厚4mm以上、または制限速度(80km/h) > 限界速度の場合危険
        const isHydroRisk = hw_mm >= 4.0 || vCrit <= 80;

        hydroplaneResults.push({
          stationName: `No.${Math.floor(dist / 20)}`,
          stationDist: dist,
          syntheticSlope: syntheticSlope,
          waterFilmDepth: hw_mm,
          criticalSpeed: vCrit,
          isHydroWarning: isHydroRisk
        });

        // 3D路面冠水表現（危険区域に青白い動的な水膜ポリゴンをオーバーレイ）
        if (isStorm && hw_mm > 1.5) {
          const waterWidth = crossSection.leftLaneWidth + crossSection.rightLaneWidth;
          const waterGeo = new THREE.PlaneGeometry(ds, waterWidth);
          const waterMat = new THREE.MeshStandardMaterial({
            color: '#38bdf8',
            transparent: true,
            opacity: isHydroRisk ? 0.75 : 0.4, // リスク有りは不透明度高め
            roughness: 0.01,
            metalness: 0.9,
            side: THREE.DoubleSide
          });
          const waterMesh = new THREE.Mesh(waterGeo, waterMat);
          waterMesh.position.set(px, py + 0.05, pz); // 路面より僅かに上に配置

          const dx = sNext.x - sCurr.x;
          const dy = sNext.y - sCurr.y;
          const angle = Math.atan2(dy, dx);
          waterMesh.rotation.y = angle;
          waterMesh.rotation.x = -Math.PI / 2;
          (waterMesh as any).isWaterPlane = true;
          roadGroup.add(waterMesh);
        }

        // 凹部（サグ）やハイドロリスクの高い箇所への「大型集水桝」自動追加配置＆ビジュアルエフェクト
        const isSagSection = i > 0 && i < stations.length - 2 
          ? (stations[i].z < stations[i - 1].z && stations[i].z < stations[i + 1].z)
          : false;

        const needsDrainUpgrade = isHydroRisk || isSagSection;
        // 20m間隔、またはサグ部/冠水リスク部に大型集水桝
        if (needsDrainUpgrade || i % 4 === 0) {
          const drainBoxW = needsDrainUpgrade ? 1.6 : 0.9;
          const drainBoxH = needsDrainUpgrade ? 1.4 : 0.8;
          const drainBoxD = needsDrainUpgrade ? 1.2 : 0.8;

          const drainGeo = new THREE.BoxGeometry(drainBoxW, drainBoxH, drainBoxD);
          const drainMat = new THREE.MeshStandardMaterial({
            color: needsDrainUpgrade ? '#1e293b' : '#475569', // 大型集水桝はダークスチール
            roughness: 0.4,
            metalness: 0.85,
            wireframe: showWireframe
          });

          // 道路の路肩端に配置
          const roadWidth = (crossSection.leftLaneWidth + crossSection.rightLaneWidth) / 2 + 0.2;
          const dx = sNext.x - sCurr.x;
          const dy = sNext.y - sCurr.y;
          const angle = Math.atan2(dy, dx);

          // 左右路肩に桝を配置
          const drainLX = px - roadWidth * Math.sin(angle);
          const drainLZ = pz - roadWidth * Math.cos(angle);
          const drainRX = px + roadWidth * Math.sin(angle);
          const drainRZ = pz + roadWidth * Math.cos(angle);

          const leftDrain = new THREE.Mesh(drainGeo, drainMat);
          leftDrain.position.set(drainLX, py - drainBoxH / 2 + 0.1, drainLZ);
          leftDrain.rotation.y = angle;
          (leftDrain as any).isDrainage = true;
          roadGroup.add(leftDrain);

          const rightDrain = new THREE.Mesh(drainGeo, drainMat);
          rightDrain.position.set(drainRX, py - drainBoxH / 2 + 0.1, drainRZ);
          rightDrain.rotation.y = angle;
          (rightDrain as any).isDrainage = true;
          roadGroup.add(rightDrain);

          // 豪雨の際、吸い込まれる水の回転渦エフェクト（3Dワイヤーフレームサークル）
          if (isStorm && needsDrainUpgrade) {
            const swirlGeo = new THREE.RingGeometry(0.1, 0.8, 16);
            const swirlMat = new THREE.MeshBasicMaterial({
              color: '#60a5fa',
              transparent: true,
              opacity: 0.7,
              side: THREE.DoubleSide,
              wireframe: true
            });
            
            const swirlL = new THREE.Mesh(swirlGeo, swirlMat);
            swirlL.position.set(drainLX, py + 0.15, drainLZ);
            swirlL.rotation.x = -Math.PI / 2;
            (swirlL as any).isWaterSwirl = true; // 回転アニメーション用
            roadGroup.add(swirlL);

            const swirlR = new THREE.Mesh(swirlGeo, swirlMat);
            swirlR.position.set(drainRX, py + 0.15, drainRZ);
            swirlR.rotation.x = -Math.PI / 2;
            (swirlR as any).isWaterSwirl = true;
            roadGroup.add(swirlR);
          }
        }
      }
    }

    // 計算データを React の State にバインド
    requestAnimationFrame(() => {
      setNoiseData(noiseResults);
      setHydroData(hydroplaneResults);
    });

    // 6. 各道路測点 (Stations: No.0, No.1...) に対応する 3D ピン/ポールの精密な動的配置
    if (stations && stations.length > 0) {
      stations.forEach(s => {
        const isSelected = Math.abs(s.distance - selectedStationDist) < 0.1;

        // 起点BPからの相対座標 (offset を使用)
        const px = s.x - offset.x;
        const pz = -(s.y - offset.y);
        const py = s.z;

        // ① ポール部 (円柱)
        const poleHeight = isSelected ? 18 : 10;
        const poleRadius = isSelected ? 0.45 : 0.22;
        const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 6);
        const poleMat = new THREE.MeshBasicMaterial({ 
          color: isSelected ? '#eab308' : 'rgba(100, 116, 139, 0.85)',
          transparent: true,
          opacity: 0.9
        });
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.set(px, py + poleHeight / 2 + 0.15, pz);
        roadGroup.add(poleMesh);

        // ② ピン球部 (金属光沢球)
        const sphereRadius = isSelected ? 2.0 : 1.1;
        const sphereGeo = new THREE.SphereGeometry(sphereRadius, 8, 8);
        const sphereMat = new THREE.MeshStandardMaterial({ 
          color: isSelected ? '#eab308' : '#94a3b8',
          roughness: 0.35,
          metalness: 0.6,
          wireframe: showWireframe
        });
        const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
        sphereMesh.position.set(px, py + poleHeight + sphereRadius / 2, pz);
        roadGroup.add(sphereMesh);
      });
    }

    // --- 複数路線 (非アクティブ路線) の LOD 3D描画エンジンの追加 ---
    if (roadNetwork && roadNetwork.alignments) {
      Object.keys(roadNetwork.alignments).forEach((roadId) => {
        if (roadId === roadNetwork.activeAlignmentId) return;

        const otherPlan = roadNetwork.alignments[roadId];
        if (!otherPlan || !otherPlan.visible) return;

        // 制御点の3D座標リストを作成
        const curvePoints: THREE.Vector3[] = [];
        otherPlan.points.forEach((p: any) => {
          curvePoints.push(new THREE.Vector3(
            p.x - offset.x,
            p.z + otherPlan.heightOffset,
            -(p.y - offset.y)
          ));
        });

        if (curvePoints.length < 2) return;

        // 滑らかな曲線補間
        const curve = new THREE.CatmullRomCurve3(curvePoints);
        // LODレベル判定 (LINEか、簡易メッシュか)
        const isLineOnly = otherPlan.lodLevel === 'LINE' || otherPlan.lodLevel === 'LOW';
        const sampleCount = otherPlan.lodLevel === 'HIGH' ? 100 : (otherPlan.lodLevel === 'MEDIUM' ? 40 : 20);
        const pathPoints = curve.getPoints(sampleCount);

        if (isLineOnly) {
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pathPoints);
          const lineMat = new THREE.LineBasicMaterial({
            color: roadId.includes('bypass') || roadId.includes('sub') ? '#06b6d4' : '#3b82f6',
            linewidth: 3
          });
          const otherLine = new THREE.Line(lineGeo, lineMat);
          roadGroup.add(otherLine);

          // 簡易的な支柱
          for (let k = 0; k < pathPoints.length; k += 6) {
            const p = pathPoints[k];
            const pHeight = p.y;
            if (pHeight > 1.0) {
              const pierGeo = new THREE.CylinderGeometry(0.4, 0.4, pHeight, 6);
              const pierMat = new THREE.MeshBasicMaterial({ color: '#475569', opacity: 0.8, transparent: true });
              const pierMesh = new THREE.Mesh(pierGeo, pierMat);
              pierMesh.position.set(p.x, pHeight / 2, p.z);
              roadGroup.add(pierMesh);
            }
          }
        } else {
          // 簡易3Dロードメッシュ (合流クリッピング ＆ ステッチ縫合)
          const roadWidth = (otherPlan.crossSection.leftLaneWidth + otherPlan.crossSection.rightLaneWidth) || 6.5;
          const otherVertices: number[] = [];
          const otherIndices: number[] = [];
          const pointsClipped: boolean[] = [];

          // 1. 各ポイントが本線と重複・近接しているか判定 (12m基準)
          for (let k = 0; k < pathPoints.length; k++) {
            const curr = pathPoints[k];
            let minDist = Infinity;
            for (let idx = 0; idx < alignment.length; idx++) {
              const actPt = alignment[idx];
              const actX = actPt.x - offset.x;
              const actZ = -(actPt.y - offset.y);
              const dist = Math.sqrt((curr.x - actX) * (curr.x - actX) + (curr.z - actZ) * (curr.z - actZ));
              if (dist < minDist) minDist = dist;
            }
            pointsClipped.push(minDist < 12.0);
          }

          // 2. 頂点データ生成
          for (let k = 0; k < pathPoints.length; k++) {
            const curr = pathPoints[k];
            let tangent = new THREE.Vector3();
            if (k < pathPoints.length - 1) {
              tangent.subVectors(pathPoints[k+1], curr).normalize();
            } else {
              tangent.subVectors(curr, pathPoints[k-1]).normalize();
            }
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            // 重複区間の場合は本線の高さをブレンドして Z-fighting を完全に避ける
            let finalY = curr.y;
            if (pointsClipped[k]) {
              // 最も近い本線の高さを参照
              let nearestZ = curr.y;
              let nearestDist = Infinity;
              for (let idx = 0; idx < alignment.length; idx++) {
                const actPt = alignment[idx];
                const actX = actPt.x - offset.x;
                const actZ = -(actPt.y - offset.y);
                const dist = Math.sqrt((curr.x - actX) * (curr.x - actX) + (curr.z - actZ) * (curr.z - actZ));
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearestZ = actPt.z;
                }
              }
              finalY = nearestZ; // 高さを本線に一致させる
            }

            const leftPt = new THREE.Vector3(curr.x, finalY, curr.z).add(normal.clone().multiplyScalar(roadWidth / 2));
            const rightPt = new THREE.Vector3(curr.x, finalY, curr.z).add(normal.clone().multiplyScalar(-roadWidth / 2));

            otherVertices.push(leftPt.x, leftPt.y, leftPt.z);
            otherVertices.push(rightPt.x, rightPt.y, rightPt.z);
          }

          // 3. インデックス生成 (重複区間は面を張らない = 自動クリップ)
          for (let k = 0; k < pathPoints.length - 1; k++) {
            if (pointsClipped[k] && pointsClipped[k+1]) {
              // 両端とも重複していれば描画クリップ（スキップ）して Z-fighting を完璧に防止
              continue;
            }
            const vIdx = k * 2;
            otherIndices.push(vIdx, vIdx + 1, vIdx + 2);
            otherIndices.push(vIdx + 1, vIdx + 3, vIdx + 2);
          }

          const otherRoadGeo = new THREE.BufferGeometry();
          otherRoadGeo.setAttribute('position', new THREE.Float32BufferAttribute(otherVertices, 3));
          if (otherIndices.length > 0) {
            otherRoadGeo.setIndex(otherIndices);
          }
          otherRoadGeo.computeVertexNormals();

          const otherRoadMat = new THREE.MeshStandardMaterial({
            color: roadId.includes('bypass') || roadId.includes('sub') ? '#0891b2' : '#2563eb',
            roughness: 0.6,
            metalness: 0.2,
            side: THREE.DoubleSide,
            wireframe: showWireframe
          });

          const otherRoadMesh = new THREE.Mesh(otherRoadGeo, otherRoadMat);
          roadGroup.add(otherRoadMesh);

          // 4. 合流・分岐の「つなぎ目（ステッチ縫合）」面生成
          for (let k = 1; k < pathPoints.length; k++) {
            if (pointsClipped[k] !== pointsClipped[k-1]) {
              const transitionIdx = k;
              const curr = pathPoints[transitionIdx];
              
              let nearestIdx = 0;
              let nearestDist = Infinity;
              for (let idx = 0; idx < alignment.length; idx++) {
                const actPt = alignment[idx];
                const actX = actPt.x - offset.x;
                const actZ = -(actPt.y - offset.y);
                const dist = Math.sqrt((curr.x - actX) * (curr.x - actX) + (curr.z - actZ) * (curr.z - actZ));
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearestIdx = idx;
                }
              }

              const actPt = alignment[nearestIdx];
              const mainLeftEdge = new THREE.Vector3(
                actPt.x - offset.x + actPt.normalX * (crossSection.leftLaneWidth + crossSection.shoulderWidth),
                actPt.z,
                -(actPt.y - offset.y) - actPt.normalY * (crossSection.leftLaneWidth + crossSection.shoulderWidth)
              );
              const mainRightEdge = new THREE.Vector3(
                actPt.x - offset.x - actPt.normalX * (crossSection.rightLaneWidth + crossSection.shoulderWidth),
                actPt.z,
                -(actPt.y - offset.y) + actPt.normalY * (crossSection.rightLaneWidth + crossSection.shoulderWidth)
              );

              const otherVIdx = transitionIdx * 2;
              const otherLeft = new THREE.Vector3(otherVertices[otherVIdx*3], otherVertices[otherVIdx*3+1], otherVertices[otherVIdx*3+2]);
              const otherRight = new THREE.Vector3(otherVertices[(otherVIdx+1)*3], otherVertices[(otherVIdx+1)*3+1], otherVertices[(otherVIdx+1)*3+2]);

              const stitchGeo = new THREE.BufferGeometry();
              const stitchVerts: number[] = [
                mainLeftEdge.x, mainLeftEdge.y, mainLeftEdge.z,
                otherLeft.x, otherLeft.y, otherLeft.z,
                otherRight.x, otherRight.y, otherRight.z,
                
                mainRightEdge.x, mainRightEdge.y, mainRightEdge.z,
                otherRight.x, otherRight.y, otherRight.z,
                mainLeftEdge.x, mainLeftEdge.y, mainLeftEdge.z
              ];
              stitchGeo.setAttribute('position', new THREE.Float32BufferAttribute(stitchVerts, 3));
              stitchGeo.computeVertexNormals();

              const stitchMat = new THREE.MeshStandardMaterial({
                color: '#334155', // アスファルト縫合色
                roughness: 0.7,
                metalness: 0.1,
                side: THREE.DoubleSide,
                wireframe: showWireframe
              });
              const stitchMesh = new THREE.Mesh(stitchGeo, stitchMat);
              roadGroup.add(stitchMesh);
            }
          }

          // 簡易橋脚 (30m程度の間隔)
          for (let k = 0; k < pathPoints.length; k += 10) {
            const p = pathPoints[k];
            const pHeight = p.y;
            if (pHeight > 1.0) {
              const pierGeo = new THREE.CylinderGeometry(1.0, 1.0, pHeight, 8);
              const pierMat = new THREE.MeshStandardMaterial({
                color: '#64748b',
                roughness: 0.7,
                wireframe: showWireframe
              });
              const pierMesh = new THREE.Mesh(pierGeo, pierMat);
              pierMesh.position.set(p.x, pHeight / 2, p.z);
              roadGroup.add(pierMesh);
            }
          }
        }
      });
    }

    roadGridRef.current = tempGrid;

    // 雨水排水シミュレーションがアクティブな場合、サグ検出と警告メッシュを再構築する
    if (showDrainageSimulation) {
      setTimeout(() => {
        initDrainageParticles(segments);
        const sags = detectSags();
        setDetectedSags(sags);
        rebuildSagWarnings(sags);
      }, 50);
    }

    // 動的生成したテクスチャの明示的クリーンアップ
    return () => {
      texGrass.dispose();
      texGridGreen.dispose();
    };

  }, [alignment, crossSection, showWireframe, stations, selectedStationDist, pierInterval, individualPierAngles, slopeProtectionType, enableBermMesh, roadNetwork]);

  // 2.5. 現況地盤メッシュおよび等高線コンターの動的生成
  useEffect(() => {
    const terrainGroup = terrainGroupRef.current;
    if (!terrainGroup || alignment.length === 0) return;

    // 既存のメッシュを完全にクリア
    while (terrainGroup.children.length > 0) {
      const obj = terrainGroup.children[0];
      terrainGroup.remove(obj);
    }

    // 1. alignment 基準のバウンディングボックスの計算
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    alignment.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    if (minX === Infinity) {
      minX = 0; maxX = 500;
      minY = 0; maxY = 500;
    }

    // 周辺 250m をカバーして豊かなスケール感を出す
    const margin = 250;
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    const offset = {
      x: alignment[0].x,
      y: alignment[0].y,
    };

    // 格子サンプリング（パフォーマンス・モードに応じてメッシュ解像度を自動調節）
    const cols = performanceMode === 'eco' ? 16 : (performanceMode === 'high' ? 50 : 32);
    const rows = performanceMode === 'eco' ? 16 : (performanceMode === 'high' ? 50 : 32);
    const dx = (maxX - minX) / cols;
    const dy = (maxY - minY) / rows;

    const gridPoints: THREE.Vector3[][] = [];
    let tempMinH = Infinity;
    let tempMaxH = -Infinity;

    for (let r = 0; r <= rows; r++) {
      gridPoints[r] = [];
      const currentY = minY + r * dy;
      for (let c = 0; c <= cols; c++) {
        const currentX = minX + c * dx;
        const h = getGroundElevation(currentX, currentY);

        if (h < tempMinH) tempMinH = h;
        if (h > tempMaxH) tempMaxH = h;

        // Three.js の Z 軸は GIS の -Y 軸
        const tx = currentX - offset.x;
        const tz = -(currentY - offset.y);
        const ty = h;

        gridPoints[r].push(new THREE.Vector3(tx, ty, tz));
      }
    }

    // (A) 現況地盤メッシュ
    if (showTerrainMesh) {
      const terrainGeo = new THREE.BufferGeometry();
      const vertices: number[] = [];
      const indices: number[] = [];

      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          const pt = gridPoints[r][c];
          vertices.push(pt.x, pt.y, pt.z);
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i00 = r * (cols + 1) + c;
          const i10 = r * (cols + 1) + (c + 1);
          const i01 = (r + 1) * (cols + 1) + c;
          const i11 = (r + 1) * (cols + 1) + (c + 1);

          indices.push(i00, i01, i10);
          indices.push(i10, i01, i11);
        }
      }

      terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      terrainGeo.setIndex(indices);
      terrainGeo.computeVertexNormals();

      const terrainMat = new THREE.MeshStandardMaterial({
        color: '#0f172a', 
        emissive: '#080c14',
        roughness: 0.9,
        metalness: 0.1,
        transparent: true,
        opacity: 0.70,
        side: THREE.DoubleSide,
      });

      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
      terrainMesh.receiveShadow = true;
      terrainGroup.add(terrainMesh);

      // ワイヤーフレームグリッドを極めてうっすら重ねる
      const wireMat = new THREE.MeshBasicMaterial({
        color: '#334155',
        wireframe: true,
        transparent: true,
        opacity: 0.10,
      });
      const terrainWire = new THREE.Mesh(terrainGeo, wireMat);
      terrainGroup.add(terrainWire);
    }

    // (B) 現況等高線（コンター）
    if (showTerrainContour) {
      const contourLines: number[] = [];
      // 指定された間隔の等高線
      const interval = contourInterval;
      const startH = Math.ceil(tempMinH / interval) * interval;
      const endH = Math.floor(tempMaxH / interval) * interval;

      for (let h_c = startH; h_c <= endH; h_c += interval) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const p00 = gridPoints[r][c];
            const p10 = gridPoints[r][c + 1];
            const p01 = gridPoints[r + 1][c];
            const p11 = gridPoints[r + 1][c + 1];

            // 三角形ごとの等高線セグメント計算
            const checkTriangle = (v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3) => {
              const pts: THREE.Vector3[] = [];
              if ((v0.y <= h_c && v1.y > h_c) || (v1.y <= h_c && v0.y > h_c)) {
                const t = (h_c - v0.y) / (v1.y - v0.y);
                pts.push(new THREE.Vector3().lerpVectors(v0, v1, t));
              }
              if ((v1.y <= h_c && v2.y > h_c) || (v2.y <= h_c && v1.y > h_c)) {
                const t = (h_c - v1.y) / (v2.y - v1.y);
                pts.push(new THREE.Vector3().lerpVectors(v1, v2, t));
              }
              if ((v2.y <= h_c && v0.y > h_c) || (v0.y <= h_c && v2.y > h_c)) {
                const t = (h_c - v2.y) / (v0.y - v2.y);
                pts.push(new THREE.Vector3().lerpVectors(v2, v0, t));
              }
              if (pts.length >= 2) {
                // 等高線が地盤メッシュに埋まらないようにわずかに(0.15m)浮かす
                contourLines.push(pts[0].x, pts[0].y + 0.15, pts[0].z);
                contourLines.push(pts[1].x, pts[1].y + 0.15, pts[1].z);
              }
            };

            checkTriangle(p00, p01, p10);
            checkTriangle(p10, p01, p11);
          }
        }
      }

      if (contourLines.length > 0) {
        const contourGeo = new THREE.BufferGeometry();
        contourGeo.setAttribute('position', new THREE.Float32BufferAttribute(contourLines, 3));
        const contourMat = new THREE.LineBasicMaterial({
          color: '#10b981', // エメラルドグリーン
          transparent: true,
          opacity: 0.65,
        });
        const segments = new THREE.LineSegments(contourGeo, contourMat);
        terrainGroup.add(segments);
      }
    }

  }, [alignment, showTerrainMesh, showTerrainContour, contourInterval, performanceMode]);

  // 2.7. 選択中の測点（または走行中の自車位置）における詳細3D断面メッシュのリアルタイム生成
  useEffect(() => {
    const crossSectionGroup = crossSectionGroupRef.current;
    if (!crossSectionGroup || alignment.length === 0) return;

    // 既存の断面メッシュを完全にクリア
    while (crossSectionGroup.children.length > 0) {
      const obj = crossSectionGroup.children[0];
      crossSectionGroup.remove(obj);
    }

    if (!show3DSectionMesh) return;

    // ターゲット距離（走行中なら自車位置、停止中なら選択測点）
    const d = isDriving ? driveDistance : selectedStationDist;
    const pt = getInterpolatedAlignmentPoint(d);
    if (!pt) return;

    const secProps = getInterpolatedSectionProperties(d, sections, crossSection);
    const leftWidth = secProps.leftLaneWidth;
    const rightWidth = secProps.rightLaneWidth;
    const shoulder = secProps.shoulderWidth;
    const sectionType = secProps.type;

    // 起点BPからの相対座標系
    const offset = {
      x: alignment[0].x,
      y: alignment[0].y
    };

    const cx = pt.x - offset.x;
    const cz = -(pt.y - offset.y);
    const cy = pt.z;

    const nx = pt.normalX;
    const ny = pt.normalY;

    // 進行方向（接線）ベクトル
    const tx = pt.tangentX;
    const tz = -pt.tangentY;
    // 3D接線ベクトルを正規化
    const lenT = Math.sqrt(tx * tx + tz * tz);
    const tVec = new THREE.Vector3(tx / (lenT || 1), 0, tz / (lenT || 1));

    // 法線ベクトル（横方向）
    const nVec = new THREE.Vector3(nx, 0, -ny);

    // 2Dローカル断面座標 (u, v) から 3D空間座標 (X, Y, Z) へのマッピング関数
    // u: 横方向 (左が負、右が正)
    // v: 高さ方向 (計画高cyからの相対高)
    // w: 厚み方向 (アライメント進行方向w = -width/2 から +width/2)
    const to3D = (u: number, v: number, w: number) => {
      const x = cx + nVec.x * u + tVec.x * w;
      const y = cy + v;
      const z = cz + nVec.z * u + tVec.z * w;
      return new THREE.Vector3(x, y, z);
    };

    // 断面ブロックの厚み (押し出し幅)
    const sliceWidth = 1.0; // 1m の押し出し厚

    // 舗装レイヤーの厚み
    const tPave = crossSection.pavementThickness || 0.15;
    const tBase = crossSection.baseThickness || 0.30;
    const tSub = crossSection.subgradeThickness || 1.00;

    // 上部形状のu座標（左路肩端、左車線端、中心、右車線端、右路肩端）
    const uCoords = [
      -(leftWidth + shoulder),
      -leftWidth,
      0,
      rightWidth,
      rightWidth + shoulder
    ];

    // 上部形状の計画高からの相対y座標（横断勾配2%、路肩4%）
    const yPaveUpper = [
      -0.02 * leftWidth - 0.04 * shoulder,
      -0.02 * leftWidth,
      0,
      -0.02 * rightWidth,
      -0.02 * rightWidth - 0.04 * shoulder
    ];

    // 各層の下面の相対y座標
    const yPaveLower = yPaveUpper.map(y => y - tPave);
    const yBaseLower = yPaveLower.map(y => y - tBase);
    const ySubLower = yBaseLower.map(y => y - tSub);

    // 舗装各層の3D立体をBufferGeometryで構築するヘルパー
    const buildLayerGeometry = (upperY: number[], lowerY: number[]) => {
      const geo = new THREE.BufferGeometry();
      const vertices: number[] = [];
      const indices: number[] = [];

      // 頂点生成（合計20点）
      // 手前 (w = -sliceWidth/2): 上面5点 (0..4), 下面5点 (5..9)
      // 奥   (w =  sliceWidth/2): 上面5点 (10..14), 下面5点 (15..19)
      const wHalf = sliceWidth / 2;

      // 手前
      for (let i = 0; i < 5; i++) {
        const p = to3D(uCoords[i], upperY[i], -wHalf);
        vertices.push(p.x, p.y, p.z);
      }
      for (let i = 0; i < 5; i++) {
        const p = to3D(uCoords[i], lowerY[i], -wHalf);
        vertices.push(p.x, p.y, p.z);
      }
      // 奥
      for (let i = 0; i < 5; i++) {
        const p = to3D(uCoords[i], upperY[i], wHalf);
        vertices.push(p.x, p.y, p.z);
      }
      for (let i = 0; i < 5; i++) {
        const p = to3D(uCoords[i], lowerY[i], wHalf);
        vertices.push(p.x, p.y, p.z);
      }

      // インデックス生成
      // 1. 手前蓋 (w = -wHalf) の四角形パッチ (4つ)
      for (let i = 0; i < 4; i++) {
        indices.push(i, i + 6, i + 1);
        indices.push(i, i + 5, i + 6);
      }

      // 2. 奥蓋 (w = wHalf) の四角形パッチ (4つ)
      for (let i = 0; i < 4; i++) {
        indices.push(i + 10, i + 11, i + 16);
        indices.push(i + 10, i + 16, i + 15);
      }

      // 3. 上面 (upper) の四角形パッチ (4つ)
      for (let i = 0; i < 4; i++) {
        indices.push(i, i + 11, i + 10);
        indices.push(i, i + 1, i + 11);
      }

      // 4. 下面 (lower) の四角形パッチ (4つ)
      for (let i = 0; i < 4; i++) {
        indices.push(i + 5, i + 16, i + 6);
        indices.push(i + 5, i + 15, i + 16);
      }

      // 5. 左端面
      indices.push(0, 10, 15);
      indices.push(0, 15, 5);

      // 6. 右端面
      indices.push(4, 19, 14);
      indices.push(4, 9, 19);

      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    // レイヤー用マテリアル定義
    const matPave = new THREE.MeshStandardMaterial({
      color: '#1e293b', // アスファルト
      roughness: 0.6,
      metalness: 0.2,
      wireframe: showWireframe,
      side: THREE.DoubleSide
    });
    const matBase = new THREE.MeshStandardMaterial({
      color: '#475569', // 上層路盤グレー
      roughness: 0.7,
      metalness: 0.1,
      wireframe: showWireframe,
      side: THREE.DoubleSide
    });
    const matSub = new THREE.MeshStandardMaterial({
      color: '#b45309', // 下層路盤・路床（暖かみのある土色）
      roughness: 0.9,
      metalness: 0.1,
      wireframe: showWireframe,
      side: THREE.DoubleSide
    });

    // 各舗装層のメッシュを追加
    const mPave = new THREE.Mesh(buildLayerGeometry(yPaveUpper, yPaveLower), matPave);
    mPave.castShadow = true;
    mPave.receiveShadow = true;
    crossSectionGroup.add(mPave);

    const mBase = new THREE.Mesh(buildLayerGeometry(yPaveLower, yBaseLower), matBase);
    mBase.castShadow = true;
    mBase.receiveShadow = true;
    crossSectionGroup.add(mBase);

    const mSub = new THREE.Mesh(buildLayerGeometry(yBaseLower, ySubLower), matSub);
    mSub.castShadow = true;
    mSub.receiveShadow = true;
    crossSectionGroup.add(mSub);

    // 土工(一般土木)区間の場合は、切土・盛土の法面も詳細3Dメッシュとして描画
    if (sectionType === 'earthwork') {
      const hDiff = cy - pt.groundZ; // 計画高 - 地盤高
      const isFill = hDiff > 0;

      // 小段・法面サンプリング
      const mockedProfilePoint = { z: cy, groundZ: pt.groundZ };
      const leftBermPoints = calculateMultiStageSlope(
        leftWidth + shoulder,
        yPaveUpper[0],
        true,
        mockedProfilePoint as any,
        crossSection,
        crossSection.bermInterval || 5.0,
        crossSection.bermWidth || 1.0
      );

      const rightBermPoints = calculateMultiStageSlope(
        rightWidth + shoulder,
        yPaveUpper[4],
        false,
        mockedProfilePoint as any,
        crossSection,
        crossSection.bermInterval || 5.0,
        crossSection.bermWidth || 1.0
      );

      // 法面メッシュを構築するヘルパー
      const buildSlopeGeometry = (bermPts: any[], isLeft: boolean) => {
        const geo = new THREE.BufferGeometry();
        const vertices: number[] = [];
        const indices: number[] = [];
        const wHalf = sliceWidth / 2;

        const numPts = bermPts.length;
        if (numPts < 2) return null;

        const thick = 1.0; // のり面の裏込め厚み

        // 頂点生成
        // 1. 手前の上面
        for (let i = 0; i < numPts; i++) {
          const bp = bermPts[i];
          const u = isLeft ? -bp.y : bp.y;
          const v = bp.z - cy;
          const p = to3D(u, v, -wHalf);
          vertices.push(p.x, p.y, p.z);
        }
        // 2. 手前の下面
        for (let i = 0; i < numPts; i++) {
          const bp = bermPts[i];
          const u = isLeft ? -bp.y : bp.y;
          const v = (bp.z - cy) - thick;
          const p = to3D(u, v, -wHalf);
          vertices.push(p.x, p.y, p.z);
        }
        // 3. 奥の上面
        for (let i = 0; i < numPts; i++) {
          const bp = bermPts[i];
          const u = isLeft ? -bp.y : bp.y;
          const v = bp.z - cy;
          const p = to3D(u, v, wHalf);
          vertices.push(p.x, p.y, p.z);
        }
        // 4. 奥の下面
        for (let i = 0; i < numPts; i++) {
          const bp = bermPts[i];
          const u = isLeft ? -bp.y : bp.y;
          const v = (bp.z - cy) - thick;
          const p = to3D(u, v, wHalf);
          vertices.push(p.x, p.y, p.z);
        }

        // インデックス
        const offsetUpperFore = 0;
        const offsetLowerFore = numPts;
        const offsetUpperAft = numPts * 2;
        const offsetLowerAft = numPts * 3;

        for (let i = 0; i < numPts - 1; i++) {
          // 手前蓋
          indices.push(offsetUpperFore + i, offsetUpperFore + i + 1, offsetLowerFore + i + 1);
          indices.push(offsetUpperFore + i, offsetLowerFore + i + 1, offsetLowerFore + i);

          // 奥蓋
          indices.push(offsetUpperAft + i, offsetLowerAft + i + 1, offsetUpperAft + i + 1);
          indices.push(offsetUpperAft + i, offsetLowerAft + i, offsetLowerAft + i + 1);

          // 上面
          indices.push(offsetUpperFore + i, offsetUpperAft + i + 1, offsetUpperAft + i);
          indices.push(offsetUpperFore + i, offsetUpperFore + i + 1, offsetUpperAft + i + 1);

          // 下面
          indices.push(offsetLowerFore + i, offsetLowerAft + i, offsetLowerAft + i + 1);
          indices.push(offsetLowerFore + i, offsetLowerAft + i + 1, offsetLowerFore + i + 1);
        }

        // 端面の蓋
        indices.push(offsetUpperFore, offsetUpperAft, offsetLowerAft);
        indices.push(offsetUpperFore, offsetLowerAft, offsetLowerFore);

        const last = numPts - 1;
        indices.push(offsetUpperFore + last, offsetLowerFore + last, offsetLowerAft + last);
        indices.push(offsetUpperFore + last, offsetLowerAft + last, offsetUpperAft + last);

        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
      };

      const matSlopeFill = new THREE.MeshStandardMaterial({
        color: '#b91c1c', // 盛土法面（赤）
        roughness: 0.9,
        metalness: 0.1,
        wireframe: showWireframe,
        side: THREE.DoubleSide
      });
      const matSlopeCut = new THREE.MeshStandardMaterial({
        color: '#1d4ed8', // 切土法面（青）
        roughness: 0.8,
        metalness: 0.1,
        wireframe: showWireframe,
        side: THREE.DoubleSide
      });

      const activeSlopeMat = isFill ? matSlopeFill : matSlopeCut;

      if (leftBermPoints.length >= 2) {
        const leftSlopeGeo = buildSlopeGeometry(leftBermPoints, true);
        if (leftSlopeGeo) {
          const mLeftSlope = new THREE.Mesh(leftSlopeGeo, activeSlopeMat);
          mLeftSlope.castShadow = true;
          mLeftSlope.receiveShadow = true;
          crossSectionGroup.add(mLeftSlope);
        }
      }

      if (rightBermPoints.length >= 2) {
        const rightSlopeGeo = buildSlopeGeometry(rightBermPoints, false);
        if (rightSlopeGeo) {
          const mRightSlope = new THREE.Mesh(rightSlopeGeo, activeSlopeMat);
          mRightSlope.castShadow = true;
          mRightSlope.receiveShadow = true;
          crossSectionGroup.add(mRightSlope);
        }
      }
    }

  }, [alignment, crossSection, sections, selectedStationDist, driveDistance, isDriving, show3DSectionMesh, showWireframe]);

  // 3. アニメーションレンダリングループの起動 & 停止 (VRAM 4GB、GPUに配慮した最適化)
  useEffect(() => {
    // タブがアクティブでない場合は描画ループを一切回さない！
    if (!isActive || !rendererRef.current || !sceneRef.current || !cameraRef.current) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      return;
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    const renderLoop = () => {
      const now = performance.now();
      const deltaTime = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      // 走行シミュレーションの更新
      const carModel = carRef.current;
      const oncomingCarModel = oncomingCarRef.current;

      if (carModel && alignment.length > 0) {
        const totalLength = alignment[alignment.length - 1].distance;
        const bpOffset = { x: alignment[0].x, y: alignment[0].y };

        if (showDrivePanelRef.current) {
          carModel.visible = true;

          // 1. 自車（シミュレーター）の走行移動（順方向・逆方向対応）
          if (isDrivingRef.current) {
            const speedMPS = driveSpeedRef.current / 3.6; // km/h to m/s
            const isForward = driveDirectionRef.current === 'forward';
            
            let newDist = driveDistanceRef.current;
            if (isForward) {
              newDist += speedMPS * deltaTime * driveTimeScaleRef.current;
              if (newDist >= totalLength) {
                newDist = 0; // 起点ループ
              }
            } else {
              newDist -= speedMPS * deltaTime * driveTimeScaleRef.current;
              if (newDist <= 0) {
                newDist = totalLength; // 終点ループ
              }
            }
            driveDistanceRef.current = newDist;

            // 5フレーム毎にReactステートをバッチ更新
            frameCountRef.current++;
            if (frameCountRef.current % 5 === 0) {
              const stats = getDriveStatsAtDistance(newDist);
              setDriveDistance(newDist);
              setDriveStats(stats);
            }
          }

          // 2. 対向車の走行移動 & スポーン制御
          if (oncomingCarModel) {
            if (showOncomingTrafficRef.current && isDrivingRef.current) {
              oncomingCarModel.visible = true;
              
              const oncomingSpeedMPS = (driveSpeedRef.current * 0.95) / 3.6; // 対向車は自車の95%の速度で走行
              const isForward = driveDirectionRef.current === 'forward';
              
              let oDist = oncomingDistanceRef.current;
              
              if (isForward) {
                // 自車は前進、対向車は後退
                oDist -= oncomingSpeedMPS * deltaTime * driveTimeScaleRef.current;
                
                // 自車の50m以上後方に達したか、あるいは 0 以下になったら、自車の前方180m先にリスポーン
                const isBehind = oDist < driveDistanceRef.current - 50;
                if (isBehind || oDist <= 0) {
                  oDist = Math.min(totalLength, driveDistanceRef.current + 180);
                }
              } else {
                // 自車は後退、対向車は前進
                oDist += oncomingSpeedMPS * deltaTime * driveTimeScaleRef.current;
                
                // 自車の50m以上後方（距離が大きい方）に達したか、あるいは totalLength を超えたら、自車の前方180m手前にリスポーン
                const isBehind = oDist > driveDistanceRef.current + 50;
                if (isBehind || oDist >= totalLength) {
                  oDist = Math.max(0, driveDistanceRef.current - 180);
                }
              }
              oncomingDistanceRef.current = oDist;
              
              // 対向車の座標計算
              const oPt = getInterpolatedAlignmentPoint(oDist);
              if (oPt) {
                // 対向車の進行方向目標
                const oDeltaDist = isForward ? -1.0 : 1.0; // 自車と逆
                let oTargetDist = oDist + oDeltaDist;
                if (oTargetDist < 0) oTargetDist = 0;
                if (oTargetDist > totalLength) oTargetDist = totalLength;
                
                const oTargetPt = getInterpolatedAlignmentPoint(oTargetDist);
                if (oTargetPt) {
                  const opx = oPt.x - bpOffset.x;
                  const opy = oPt.z;
                  const opz = -(oPt.y - bpOffset.y);
                  
                  const otpx = oTargetPt.x - bpOffset.x;
                  const otpy = oTargetPt.z;
                  const otpz = -(oTargetPt.y - bpOffset.y);
                  
                  // 対向車の進行方向ベクトル
                  const odx = otpx - opx;
                  const odz = otpz - opz;
                  const olen = Math.sqrt(odx * odx + odz * odz);
                  
                  let ofx = 0;
                  let ofz = -1;
                  if (olen > 0.0001) {
                    ofx = odx / olen;
                    ofz = odz / olen;
                  }
                  
                  // 左方向ベクトル (fz, 0, -fx)
                  const olx = ofz;
                  const olz = -ofx;
                  
                  // 通行区分に応じた対向車オフセット（左側通行なら対向車線（右車線、対向車から見れば左車線: 1.65m）、右側通行なら対向車線（左車線、対向車から見れば右車線: -1.65m））
                  const oLaneOffset = driveTrafficSideRef.current === 'left' ? 1.65 : -1.65;
                  const oFinalX = opx + olx * oLaneOffset;
                  const oFinalZ = opz + olz * oLaneOffset;
                  
                  oncomingCarModel.position.set(oFinalX, opy + 0.05, oFinalZ);
                  
                  const oTargetX = otpx + olx * oLaneOffset;
                  const oTargetZ = otpz + olz * oLaneOffset;
                  oncomingCarModel.lookAt(new THREE.Vector3(oTargetX, otpy + 0.05, oTargetZ));
                }
              }
            } else {
              oncomingCarModel.visible = false;
            }
          }

          // 3. 自車の座標設定 & 左側通行
          const pt = getInterpolatedAlignmentPoint(driveDistanceRef.current);
          if (pt) {
            const px = pt.x - bpOffset.x;
            const py = pt.z;
            const pz = -(pt.y - bpOffset.y);

            // 自車の進行方向に応じた前方目標距離
            const isForward = driveDirectionRef.current === 'forward';
            const deltaDist = isForward ? 1.0 : -1.0;
            let targetDist = driveDistanceRef.current + deltaDist;
            if (targetDist < 0) targetDist = 0;
            if (targetDist > totalLength) targetDist = totalLength;

            const targetPt = getInterpolatedAlignmentPoint(targetDist);
            if (targetPt) {
              const tpx = targetPt.x - bpOffset.x;
              const tpy = targetPt.z;
              const tpz = -(targetPt.y - bpOffset.y);

              // 進行方向の水平ベクトル
              const dx = tpx - px;
              const dz = tpz - pz;
              const len = Math.sqrt(dx * dx + dz * dz);
              
              let fx = 0;
              let fz = -1;
              if (len > 0.0001) {
                fx = dx / len;
                fz = dz / len;
              }

              // 進行方向に対して左側のベクトル (fz, 0, -fx)
              const lx = fz;
              const lz = -fx;

              // 通行区分に応じた自車オフセット（左側通行なら左車線: 1.65m、右側通行なら右車線: -1.65m）
              const laneOffset = driveTrafficSideRef.current === 'left' ? 1.65 : -1.65;
              const finalX = px + lx * laneOffset;
              const finalZ = pz + lz * laneOffset;

              carModel.position.set(finalX, py + 0.05, finalZ);

              // 車の向き
              const carTargetX = tpx + lx * laneOffset;
              const carTargetZ = tpz + lz * laneOffset;
              carModel.lookAt(new THREE.Vector3(carTargetX, tpy + 0.05, carTargetZ));
            }

            // 夜間ヘッドライト制御
            if ((carModel as any).headlights) {
              const lightsOn = timeOfDay < 6.5 || timeOfDay > 18.0;
              (carModel as any).headlights.forEach((light: THREE.SpotLight) => {
                light.intensity = lightsOn ? 4.0 : 0.0;
              });
            }
            if (oncomingCarModel && (oncomingCarModel as any).headlights) {
              const lightsOn = timeOfDay < 6.5 || timeOfDay > 18.0;
              (oncomingCarModel as any).headlights.forEach((light: THREE.SpotLight) => {
                light.intensity = (lightsOn && showOncomingTrafficRef.current) ? 4.0 : 0.0;
              });
            }

            // カメラ追従制御（球面線形補間 Slerp ローリングフィルターによるガタつき完全除去）
            const camMode = driveCameraModeRef.current;
            if (camMode === 'driver') {
              // 車内視点 (よりドライバーらしい位置)
              const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carModel.quaternion);
              const camPos = new THREE.Vector3()
                .copy(carModel.position)
                .addScaledVector(forward, 0.25)
                .add(new THREE.Vector3(0, 0.9, 0));

              camera.position.copy(camPos);

              let lookTarget = new THREE.Vector3()
                .copy(camPos)
                .addScaledVector(forward, 25.0);

              if (gyroEnabledRef.current && gyroAlphaRef.current !== null && gyroBetaRef.current !== null) {
                // 初回に基準オフセットをキャリブレーション
                if (gyroOffsetRef.current.alpha === 0 && gyroOffsetRef.current.beta === 0) {
                  gyroOffsetRef.current = {
                    alpha: gyroAlphaRef.current,
                    beta: gyroBetaRef.current,
                    gamma: gyroGammaRef.current || 0
                  };
                }

                // 角度差分の計算 (360度ラッピング考慮)
                let diffAlpha = gyroAlphaRef.current - gyroOffsetRef.current.alpha;
                if (diffAlpha > 180) diffAlpha -= 360;
                if (diffAlpha < -180) diffAlpha += 360;

                let diffBeta = gyroBetaRef.current - gyroOffsetRef.current.beta;
                if (diffBeta > 180) diffBeta -= 360;
                if (diffBeta < -180) diffBeta += 360;

                const isLandscape = window.innerWidth > window.innerHeight;
                const yawFactor = isLandscape ? -1.2 : -1.0;
                const pitchFactor = isLandscape ? -1.0 : -1.0;

                const yaw = diffAlpha * (Math.PI / 180) * yawFactor;
                const pitch = diffBeta * (Math.PI / 180) * pitchFactor;

                const lookDir = forward.clone().normalize();
                const worldUp = new THREE.Vector3(0, 1, 0);

                lookDir.applyAxisAngle(worldUp, yaw);
                const rightAxis = new THREE.Vector3().crossVectors(lookDir, worldUp).normalize();
                lookDir.applyAxisAngle(rightAxis, pitch);

                lookTarget.copy(camPos).addScaledVector(lookDir, 25.0);
              }

              // 球面線形補間 (Slerp) を用いたローリングフィルター
              const targetMatrix = new THREE.Matrix4();
              targetMatrix.lookAt(camera.position, lookTarget, camera.up);
              const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
              camera.quaternion.slerp(targetQuat, 0.22); // 車内は追従感優先で0.22

              cameraTarget.current = { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z };
              const offsetVec = new THREE.Vector3().subVectors(camera.position, lookTarget);
              const radius = offsetVec.length();
              const theta = Math.atan2(offsetVec.x, offsetVec.z);
              const phi = Math.acos(Math.max(-1, Math.min(1, offsetVec.y / radius)));
              cameraAngles.current = { theta, phi, radius };

            } else if (camMode === 'birdseye') {
              // 鳥瞰視点 (上空24mから進行方向を少し見下ろす)
              const camPos = new THREE.Vector3()
                .copy(carModel.position)
                .add(new THREE.Vector3(0, 24.0, 0));

              camera.position.copy(camPos);

              const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carModel.quaternion);
              const lookTarget = new THREE.Vector3()
                .copy(carModel.position)
                .addScaledVector(forward, 6.0); // 6m先を見下ろす

              // 球面線形補間 (Slerp) を用いたローリングフィルター
              const targetMatrix = new THREE.Matrix4();
              targetMatrix.lookAt(camera.position, lookTarget, camera.up);
              const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
              camera.quaternion.slerp(targetQuat, 0.15); // 鳥瞰はスムーズな追従

              cameraTarget.current = { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z };
              const offsetVec = new THREE.Vector3().subVectors(camera.position, lookTarget);
              const radius = offsetVec.length();
              const theta = Math.atan2(offsetVec.x, offsetVec.z);
              const phi = Math.acos(Math.max(-1, Math.min(1, offsetVec.y / radius)));
              cameraAngles.current = { theta, phi, radius };

            } else if (camMode === 'diagonal') {
              // 後方斜め視点 (スタイリッシュな後方斜め45度追従)
              const backward = new THREE.Vector3(0, 0, -1).applyQuaternion(carModel.quaternion);
              backward.y = 0;
              backward.normalize();

              const right = new THREE.Vector3(1, 0, 0).applyQuaternion(carModel.quaternion);
              right.y = 0;
              right.normalize();

              const camPos = new THREE.Vector3()
                .copy(carModel.position)
                .addScaledVector(backward, 9.5)
                .addScaledVector(right, 3.5)
                .add(new THREE.Vector3(0, 4.0, 0));

              // カメラポジション自体のスムージング（Jitter Free 位置フィルター）
              camera.position.lerp(camPos, 0.12);

              const lookTarget = new THREE.Vector3().copy(carModel.position).add(new THREE.Vector3(0, 0.8, 0));
              
              // 球面線形補間 (Slerp) を用いたローリングフィルター
              const targetMatrix = new THREE.Matrix4();
              targetMatrix.lookAt(camera.position, lookTarget, camera.up);
              const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
              camera.quaternion.slerp(targetQuat, 0.12);

              cameraTarget.current = { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z };
              const offsetVec = new THREE.Vector3().subVectors(camera.position, lookTarget);
              const radius = offsetVec.length();
              const theta = Math.atan2(offsetVec.x, offsetVec.z);
              const phi = Math.acos(Math.max(-1, Math.min(1, offsetVec.y / radius)));
              cameraAngles.current = { theta, phi, radius };

            } else if (camMode === 'chase') {
              // 従来の車両後方
              const backward = new THREE.Vector3(0, 0, -1).applyQuaternion(carModel.quaternion);
              backward.y = 0;
              backward.normalize();

              const camPos = new THREE.Vector3()
                .copy(carModel.position)
                .addScaledVector(backward, 11.0)
                .add(new THREE.Vector3(0, 4.0, 0));

              // 位置のスムーズ補間
              camera.position.lerp(camPos, 0.12);
              const lookTarget = new THREE.Vector3().copy(carModel.position).add(new THREE.Vector3(0, 1.0, 0));

              // 球面線形補間 (Slerp)
              const targetMatrix = new THREE.Matrix4();
              targetMatrix.lookAt(camera.position, lookTarget, camera.up);
              const targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
              camera.quaternion.slerp(targetQuat, 0.12);

              cameraTarget.current = { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z };
              const offsetVec = new THREE.Vector3().subVectors(camera.position, lookTarget);
              const radius = offsetVec.length();
              const theta = Math.atan2(offsetVec.x, offsetVec.z);
              const phi = Math.acos(Math.max(-1, Math.min(1, offsetVec.y / radius)));
              cameraAngles.current = { theta, phi, radius };
            }
          }
        } else {
          carModel.visible = false;
          if (oncomingCarModel) oncomingCarModel.visible = false;
        }
      }

      // プリセット視点へのスムーズな補間 (通常のカメラ制御、フリーカメラモード時のみ有効)
      const inSpecialCameraMode = showDrivePanelRef.current && (
        driveCameraModeRef.current === 'chase' || 
        driveCameraModeRef.current === 'driver' ||
        driveCameraModeRef.current === 'birdseye' ||
        driveCameraModeRef.current === 'diagonal'
      );
      
      if (!inSpecialCameraMode) {
        if (presetTarget.current.active) {
          const p = presetTarget.current;
          const ease = 0.08;

          let diffTheta = p.theta - cameraAngles.current.theta;
          diffTheta = Math.atan2(Math.sin(diffTheta), Math.cos(diffTheta));
          cameraAngles.current.theta += diffTheta * ease;

          cameraAngles.current.phi += (p.phi - cameraAngles.current.phi) * ease;
          cameraAngles.current.radius += (p.radius - cameraAngles.current.radius) * ease;

          cameraTarget.current.x += (p.targetX - cameraTarget.current.x) * ease;
          cameraTarget.current.y += (p.targetY - cameraTarget.current.y) * ease;
          cameraTarget.current.z += (p.targetZ - cameraTarget.current.z) * ease;

          const dist = Math.abs(diffTheta) +
                       Math.abs(p.phi - cameraAngles.current.phi) +
                       Math.abs(p.radius - cameraAngles.current.radius) +
                       Math.abs(p.targetX - cameraTarget.current.x) +
                       Math.abs(p.targetY - cameraTarget.current.y) +
                       Math.abs(p.targetZ - cameraTarget.current.z);
          if (dist < 0.005) {
            presetTarget.current.active = false;
          }
        } else if (isRotating) {
          cameraAngles.current.theta += 0.0025;
        }

        const theta = cameraAngles.current.theta;
        const phi = cameraAngles.current.phi;
        const radius = cameraAngles.current.radius;

        camera.position.x = cameraTarget.current.x + radius * Math.sin(phi) * Math.sin(theta);
        camera.position.z = cameraTarget.current.z + radius * Math.sin(phi) * Math.cos(theta);
        camera.position.y = cameraTarget.current.y + radius * Math.cos(phi);

        camera.lookAt(cameraTarget.current.x, cameraTarget.current.y, cameraTarget.current.z);
      }

      // 雨水排水シミュレーションの更新 & 警告脈動アニメーション
      if (showDrainageSimulationRef.current) {
        if (isDrainageSimulatingRef.current) {
          updateDrainageParticles(deltaTime);
        }
        const elapsed = now / 1000;
        sagMeshesRef.current.forEach(m => {
          if ((m as any).isPulsating) {
            const speed = (m as any).pulseSpeed || 2.0;
            const baseOp = (m as any).baseOpacity || 0.3;
            const scale = 1.0 + 0.15 * Math.sin(elapsed * speed);
            m.scale.set(scale, 1.0, scale);
            if (m.material) {
              if (Array.isArray(m.material)) {
                m.material.forEach((mat: any) => {
                  mat.opacity = baseOp + 0.1 * Math.sin(elapsed * speed);
                });
              } else {
                (m.material as any).opacity = baseOp + 0.1 * Math.sin(elapsed * speed);
              }
            }
          }
        });

        // 側溝・集水桝の警告エフェクト脈動アニメーション
        inletWaterEffectsRef.current.forEach(m => {
          if ((m as any).isWaterEffect) {
            const speed = (m as any).pulseSpeed || 1.2;
            const baseOp = (m as any).baseOpacity || 0.15;
            const scale = 1.0 + 0.25 * Math.sin(elapsed * speed);
            m.scale.set(scale, 1.0, scale);
            if (m.material) {
              const mat = m.material as any;
              mat.opacity = Math.max(0.02, baseOp + 0.08 * Math.sin(elapsed * speed * 1.3));
            }
          }
        });

        // 側溝オーバーレイ警告エフェクトのアニメーション
        gutterWaterEffectsRef.current.forEach(m => {
          if ((m as any).isGutterOverlay) {
            const speed = (m as any).pulseSpeed || 0;
            const baseOp = (m as any).baseOpacity || 0;
            if (speed > 0) {
              if (m.material) {
                const mat = m.material as any;
                mat.opacity = Math.max(0.05, baseOp + 0.12 * Math.sin(elapsed * speed * 1.5));
              }
              // 高さの極小の脈動変化を加えて警告感を引き出す
              m.scale.set(1.0, 1.0 + 0.35 * Math.sin(elapsed * speed), 1.0);
            } else {
              if (m.material) {
                const mat = m.material as any;
                mat.opacity = 0;
              }
              m.scale.set(1.0, 1.0, 1.0);
            }
          }
        });
      }

      // マルチカメラDVRシステム (3分割ビューポート描画) ＆ メインレンダー
      if (dvrCameraActive && showDrivePanelRef.current && carModel) {
        const width = window.innerWidth;
        const height = window.innerHeight;

        renderer.setScissorTest(true);

        // 1. メイン画面 (車内/車両後方追従など) をメインビューポートに描画
        renderer.setViewport(0, 0, width, height);
        renderer.setScissor(0, 0, width, height);
        renderer.render(scene, camera);

        // サブカメラA: バックミラー (後方ビュー)
        // ビューポート: 画面上部中央 (幅 320px, 高さ 100px)
        const rearCam = new THREE.PerspectiveCamera(60, 320 / 100, 0.1, 1000);
        const rearPos = new THREE.Vector3()
          .copy(carModel.position)
          .addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(carModel.quaternion), 0.5)
          .add(new THREE.Vector3(0, 1.2, 0));
        const rearLook = new THREE.Vector3()
          .copy(carModel.position)
          .addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(carModel.quaternion), 30.0)
          .add(new THREE.Vector3(0, 1.0, 0));
        rearCam.position.copy(rearPos);
        rearCam.lookAt(rearLook);

        const subW = Math.min(320, width * 0.35);
        const subH = Math.min(110, height * 0.2);
        
        renderer.setViewport((width - subW) / 2, height - subH - 15, subW, subH);
        renderer.setScissor((width - subW) / 2, height - subH - 15, subW, subH);
        renderer.render(scene, rearCam);

        // サブカメラB: 左サイドミラー
        // ビューポート: 画面左上 (幅 150px, 高さ 100px)
        const leftCam = new THREE.PerspectiveCamera(50, 150 / 100, 0.1, 500);
        const leftPos = new THREE.Vector3()
          .copy(carModel.position)
          .addScaledVector(new THREE.Vector3(-1.2, 0.9, 0.2).applyQuaternion(carModel.quaternion), 1.0);
        const leftLook = new THREE.Vector3()
          .copy(carModel.position)
          .addScaledVector(new THREE.Vector3(-3.0, 0.4, -12.0).applyQuaternion(carModel.quaternion), 1.0);
        leftCam.position.copy(leftPos);
        leftCam.lookAt(leftLook);

        renderer.setViewport(15, height - 100 - 15, 150, 100);
        renderer.setScissor(15, height - 100 - 15, 150, 100);
        renderer.render(scene, leftCam);

        // サブカメラC: ヘリコプター追従空撮ドローン
        // ビューポート: 画面右上 (幅 180px, 高さ 120px)
        const heliCam = new THREE.PerspectiveCamera(45, 180 / 120, 0.1, 1000);
        const heliPos = new THREE.Vector3()
          .copy(carModel.position)
          .addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(carModel.quaternion), 35.0)
          .add(new THREE.Vector3(12.0, 22.0, 0));
        const heliLook = new THREE.Vector3().copy(carModel.position);
        heliCam.position.copy(heliPos);
        heliCam.lookAt(heliLook);

        renderer.setViewport(width - 180 - 15, height - 120 - 15, 180, 120);
        renderer.setScissor(width - 180 - 15, height - 120 - 15, 180, 120);
        renderer.render(scene, heliCam);

        renderer.setScissorTest(false);
      } else {
        renderer.render(scene, camera);
      }

      // --- 🚗 走行ログ記録機能 ---
      if (showDrivePanelRef.current && isRecordingRef.current) {
        const timeSinceLastLog = now - lastLogTimeRef.current;
        if (timeSinceLastLog >= 250) { // 250ms毎に記録 (4Hz)
          lastLogTimeRef.current = now;
          
          const carModel = carRef.current;
          const carPos = carModel ? { x: carModel.position.x, y: carModel.position.y, z: carModel.position.z } : { x: 0, y: 0, z: 0 };
          const camPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
          const stats = getDriveStatsAtDistance(driveDistanceRef.current);
          
          const elapsed = driveLogRef.current.length > 0 
            ? driveLogRef.current[driveLogRef.current.length - 1].elapsed + (timeSinceLastLog / 1000)
            : 0;
            
          driveLogRef.current.push({
            id: driveLogRef.current.length + 1,
            time: new Date().toLocaleTimeString(),
            elapsed: parseFloat(elapsed.toFixed(2)),
            distance: parseFloat(driveDistanceRef.current.toFixed(2)),
            speed: isDrivingRef.current ? driveSpeedRef.current : 0,
            station: stats.stationName,
            gradient: parseFloat(stats.gradient.toFixed(2)),
            curvatureR: stats.curvatureR,
            curvatureType: stats.curvatureType,
            carPosition: {
              x: parseFloat(carPos.x.toFixed(2)),
              y: parseFloat(carPos.y.toFixed(2)),
              z: parseFloat(carPos.z.toFixed(2))
            },
            cameraPosition: {
              x: parseFloat(camPos.x.toFixed(2)),
              y: parseFloat(camPos.y.toFixed(2)),
              z: parseFloat(camPos.z.toFixed(2))
            },
            cameraMode: driveCameraModeRef.current
          });
          
          setLogCount(driveLogRef.current.length);
        }
      }

      // --- 各測点の上空に HTML ラベルを動的投影 ---
      if (stations && stations.length > 0 && canvasRef.current && alignment && alignment.length > 0) {
        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;
        const bpOffset = { x: alignment[0].x, y: alignment[0].y };

        stations.forEach((s, idx) => {
          const el = document.getElementById(`overlay-label-${idx}`);
          if (!el) return;

          const isSelected = Math.abs(s.distance - selectedStationDist) < 0.1;
          const poleHeight = isSelected ? 18 : 10;
          const sphereRadius = isSelected ? 2.0 : 1.1;

          // 3D座標（3Dオブジェクト配置と完全一致）
          const px = s.x - bpOffset.x;
          const py = s.z;
          const pz = -(s.y - bpOffset.y);

          const labelY = py + poleHeight + sphereRadius + 2.0; // 球体の少し上空

          const vector = new THREE.Vector3(px, labelY, pz);
          vector.project(camera);

          // カメラの背面にある場合は非表示
          const isBehindCamera = vector.z > 1;

          if (isBehindCamera) {
            el.style.display = 'none';
          } else {
            // NDC [-1, 1] からスクリーンピクセル座標へ変換
            const sx = (vector.x * 0.5 + 0.5) * width;
            const sy = (-(vector.y * 0.5) + 0.5) * height;

            // 画面外にはみ出ている、または極端に端にある場合は非表示
            if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) {
              el.style.display = 'none';
            } else {
              el.style.display = 'block';
              el.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
            }
          }
        });
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    // レンダリングループ開始
    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [isActive, isRotating]);

  // 4. マウス・タッチジェスチャーによるカメラ手動操作 (パン、スムーズズーム、マルチタッチ対応)
  const handleMouseDown = (e: React.MouseEvent) => {
    presetTarget.current.active = false; // 手動操作開始時にプリセット遷移をキャンセル
    mouseState.current.isDown = true;
    mouseState.current.button = e.button;
    mouseState.current.x = e.clientX;
    mouseState.current.y = e.clientY;
    setIsRotating(false); // 手動操作が入ったら自動回転を解除

    if (showDrivePanelRef.current && driveCameraModeRef.current !== 'free') {
      setDriveCameraMode('free');
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseState.current.isDown) return;
    presetTarget.current.active = false;
    const dx = e.clientX - mouseState.current.x;
    const dy = e.clientY - mouseState.current.y;

    // パン（平行移動）モード判定: 
    // 右クリックドラッグ (button === 2) 
    // または Shift + 左クリックドラッグ (button === 0 && Shiftキー) 
    // または ホイールクリックドラッグ (button === 1)
    const isPanning = mouseState.current.button === 2 || mouseState.current.button === 1 || (mouseState.current.button === 0 && e.shiftKey);

    if (isPanning) {
      const camera = cameraRef.current;
      if (camera) {
        // カメラの現在のローカルX軸（右方向）とY軸（上方向）をクォータニオンから取得
        const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

        // カメラとの距離に比例した平行移動量ファクターを算出
        const factor = cameraAngles.current.radius * 0.0012;

        // 直感的に、ドラッグした方向と連動するように注視点を並行移動
        cameraTarget.current.x -= (rightVec.x * dx - upVec.x * dy) * factor;
        cameraTarget.current.y -= (rightVec.y * dx - upVec.y * dy) * factor;
        cameraTarget.current.z -= (rightVec.z * dx - upVec.z * dy) * factor;
      }
    } else {
      // 通常の3D角度回転（左ドラッグ）
      cameraAngles.current.theta -= dx * 0.007;
      cameraAngles.current.phi = Math.max(
        0.05,
        Math.min(Math.PI / 2 - 0.01, cameraAngles.current.phi - dy * 0.007) // 地面の下への回り込み制限
      );
    }

    mouseState.current.x = e.clientX;
    mouseState.current.y = e.clientY;
  };

  const handleMouseUp = () => {
    mouseState.current.isDown = false;
  };

  // タッチデバイス（Android等）対応のマルチタッチジェスチャー（1本指回転、2本指ズーム＆パン）
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsRotating(false);
    presetTarget.current.active = false; // 手動タッチ時にプリセット遷移をキャンセル
    
    if (showDrivePanelRef.current && driveCameraModeRef.current !== 'free') {
      setDriveCameraMode('free');
    }

    if (e.touches.length === 1) {
      mouseState.current.isDown = true;
      mouseState.current.x = e.touches[0].clientX;
      mouseState.current.y = e.touches[0].clientY;
      touchState.current.isPanning = false;
    } else if (e.touches.length === 2) {
      mouseState.current.isDown = true;
      touchState.current.isPanning = true;

      // 2本の指の距離初期値
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.current.initialDist = Math.sqrt(dx * dx + dy * dy);
      touchState.current.initialRadius = cameraAngles.current.radius;

      // 2本の指の中心座標初期値
      touchState.current.initialX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      touchState.current.initialY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!mouseState.current.isDown) return;
    presetTarget.current.active = false;

    if (e.touches.length === 1 && !touchState.current.isPanning) {
      // 1本指での回転
      const dx = e.touches[0].clientX - mouseState.current.x;
      const dy = e.touches[0].clientY - mouseState.current.y;

      cameraAngles.current.theta -= dx * 0.009;
      cameraAngles.current.phi = Math.max(
        0.05,
        Math.min(Math.PI / 2 - 0.01, cameraAngles.current.phi - dy * 0.009)
      );

      mouseState.current.x = e.touches[0].clientX;
      mouseState.current.y = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      // 2本指でのズームとパンの同時制御
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // (A) ピンチイン・アウトによるズーム
      if (touchState.current.initialDist > 0) {
        const ratio = touchState.current.initialDist / dist;
        cameraAngles.current.radius = Math.max(
          15,
          Math.min(450, touchState.current.initialRadius * ratio)
        );
      }

      // (B) 2本指スワイプによるパン（平行移動）
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const pdx = centerX - touchState.current.initialX;
      const pdy = centerY - touchState.current.initialY;

      const camera = cameraRef.current;
      if (camera) {
        const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const factor = cameraAngles.current.radius * 0.0012;

        cameraTarget.current.x -= (rightVec.x * pdx - upVec.x * pdy) * factor;
        cameraTarget.current.y -= (rightVec.y * pdx - upVec.y * pdy) * factor;
        cameraTarget.current.z -= (rightVec.z * pdx - upVec.z * pdy) * factor;
      }

      touchState.current.initialX = centerX;
      touchState.current.initialY = centerY;
    }
  };

  // ホイールによるカメラズーム（乗算型のスムーズなズームに変更）
  const handleWheel = (e: React.WheelEvent) => {
    presetTarget.current.active = false; // ホイール時にプリセット遷移をキャンセル
    // 遠くでは早く、近くではじっくりズーム。現在の半径に対する割合をズーム速度にする
    const zoomSpeed = 0.0008;
    cameraAngles.current.radius = Math.max(
      15, // 限界まで近づけるよう大幅に改善 (40 -> 15)
      Math.min(450, cameraAngles.current.radius * (1 + e.deltaY * zoomSpeed)) // 広大な現況地盤を見渡せるよう拡張 (300 -> 450)
    );
  };

  // プリセット視点の切り替えをスムーズに行う
  const handleApplyPreset = (theta: number, phi: number, radius: number, tx: number, ty: number, tz: number) => {
    presetTarget.current = {
      theta,
      phi,
      radius,
      targetX: tx,
      targetY: ty,
      targetZ: tz,
      active: true,
    };
    setIsRotating(false); // プリセット選択時は自動回転を一時無効に
  };

  // 視点と注視点（パン）を初期位置にリセットする（スムーズにリセットされるよう変更）
  const handleResetCamera = () => {
    handleApplyPreset(0, 0.01, alignmentRadius.current, alignmentCenter.current.x, alignmentCenter.current.y, alignmentCenter.current.z);
  };

  if (!webGlSupported) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 text-center border border-white/5 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
        <h3 className="text-base font-bold text-white mb-2">WebGL が無効か非対応です</h3>
        <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
          3Dプレビューを表示するには、WebGLに対応したブラウザとグラフィックカードが必要です。ブラウザの設定でWebGLを有効にするか、別のブラウザでお試しください。
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-all"
        >
          ブラウザを再読み込み
        </button>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 flex flex-col min-h-0 bg-slate-950 rounded-xl overflow-hidden relative" 
      ref={containerRef}
      onMouseMove={triggerUiVisibility}
      onTouchStart={triggerUiVisibility}
      onClick={triggerUiVisibility}
    >
      {/* ==================== ☀️ 日照＆霧コントロールパネル (上部中央、ドラッグ可能) ==================== */}
      <div 
        style={{ transform: `translate(calc(-50% + ${envBarPos.x}px), ${envBarPos.y}px)` }}
        className={`absolute top-4 left-1/2 z-20 flex flex-col md:flex-row items-center gap-4 bg-slate-950/90 backdrop-blur-md border border-amber-500/30 px-4 py-2 rounded-xl text-xs text-slate-300 shadow-[0_0_20px_rgba(245,158,11,0.15)] select-none pointer-events-auto transition-opacity duration-500 ${
          showEnvBar && isUiVisible 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
        onMouseEnter={() => {
          isHoveringUiRef.current = true;
          triggerUiVisibility();
        }}
        onMouseLeave={() => {
          isHoveringUiRef.current = false;
          triggerUiVisibility();
        }}
      >
        {/* ドラッグハンドル */}
        <div 
          onMouseDown={(e) => startUiDrag(e, envBarPos, setEnvBarPos, '3d_envBarPos')}
          onTouchStart={(e) => startUiDrag(e, envBarPos, setEnvBarPos, '3d_envBarPos')}
          className="flex items-center gap-1 cursor-move select-none border-r border-white/10 pr-2.5 mr-0.5 py-1 text-slate-400 hover:text-white"
          title="ドラッグしてこの環境操作バーを自由に移動できます"
        >
          <GripHorizontal className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          <span className="font-bold text-white text-[10px] tracking-wider uppercase ml-1">Environment</span>
        </div>

        {/* ① 日照設定 */}
        <div className="flex items-center gap-2">
          {timeOfDay >= 5 && timeOfDay < 8 ? (
            <Sunrise className="w-4 h-4 text-amber-500 animate-pulse" />
          ) : timeOfDay >= 8 && timeOfDay < 16 ? (
            <Sun className="w-4 h-4 text-yellow-400" />
          ) : timeOfDay >= 16 && timeOfDay < 19 ? (
            <Sunset className="w-4 h-4 text-orange-500 animate-pulse" />
          ) : (
            <Moon className="w-4 h-4 text-sky-400" />
          )}
          
          <div className="flex flex-col">
            <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider">3D Sun Light Control</span>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min="0"
                max="23"
                step="1"
                value={Math.floor(timeOfDay)}
                onChange={(e) => {
                  e.stopPropagation();
                  setTimeOfDay(parseInt(e.target.value));
                  triggerUiVisibility();
                }}
                className="w-20 md:w-28 accent-amber-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none hover:bg-slate-700 transition-colors"
                title="スライダーで時刻を変更して日照状況を切り替えます"
              />
              <span className="font-mono text-amber-400 font-extrabold text-[11px] min-w-[34px] text-right">
                {String(Math.floor(timeOfDay)).padStart(2, '0')}:00
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-l border-white/10 pl-2">
          {[
            { label: '朝', val: 6 },
            { label: '昼', val: 12 },
            { label: '夕', val: 17 },
            { label: '夜', val: 22 }
          ].map(item => (
            <button
              key={item.label}
              onClick={(e) => {
                e.stopPropagation();
                setTimeOfDay(item.val);
                triggerUiVisibility();
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold transition-all cursor-pointer ${
                Math.abs(timeOfDay - item.val) < 0.5
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 bg-slate-900/60 border border-white/5'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* ② 霧（フォグ）設定 (仕切り線の右側) */}
        <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l border-white/10 pt-2 md:pt-0 md:pl-3 w-full md:w-auto">
          <CloudFog className="w-4 h-4 text-blue-400" />
          
          <div className="flex flex-col w-full md:w-auto">
            <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider">3D Fog Control</span>
            <div className="flex items-center gap-1.5 w-full md:w-auto">
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={Math.round(fogDensity * 10000)}
                onChange={(e) => {
                  e.stopPropagation();
                  setFogDensity(parseFloat(e.target.value) / 10000);
                  triggerUiVisibility();
                }}
                className="w-20 md:w-28 accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none hover:bg-slate-700 transition-colors"
                title="スライダーで3Dシーンの霧（フォグ）の濃さを調整します（0%〜100%相当）"
              />
              <span className="font-mono text-blue-400 font-extrabold text-[11px] min-w-[34px] text-right">
                {Math.round(fogDensity * 20000)}%
              </span>
            </div>
          </div>

          {/* クイック切り替えボタン (晴、靄、霧) */}
          <div className="flex gap-1 border-l border-white/10 pl-2">
            {[
              { label: '晴', val: 0.0001 },
              { label: '靄', val: 0.0015 },
              { label: '霧', val: 0.0035 }
            ].map(item => (
              <button
                key={item.label}
                onClick={(e) => {
                  e.stopPropagation();
                  setFogDensity(item.val);
                  triggerUiVisibility();
                }}
                className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold transition-all cursor-pointer ${
                  Math.abs(fogDensity - item.val) < 0.0005
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 bg-slate-900/60 border border-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 閉じるボタン */}
        <button
          onClick={() => setShowEnvBar(false)}
          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors ml-1 cursor-pointer shrink-0"
          title="この日照・霧調整バーを閉じます（設定メニューからいつでも再表示できます）"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3D 投影 HTML ラベル (絶対配置オーバーレイ) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10">
        {stations.map((s, idx) => (
          <button
            key={`overlay-label-${idx}`}
            id={`overlay-label-${idx}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedStationDist(s.distance);
            }}
            className="absolute left-0 top-0 pointer-events-auto -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 cursor-pointer group active:scale-95 transition-transform"
            style={{ display: 'none' }}
          >
            {/* 測点名バルーン */}
            <div className={`px-2 py-1 rounded text-[10px] font-extrabold shadow-lg transition-all border flex items-center gap-1.5 ${
              Math.abs(s.distance - selectedStationDist) < 0.1
                ? 'bg-yellow-500 border-yellow-400 text-slate-950 scale-110 shadow-yellow-500/30'
                : 'bg-slate-950/90 hover:bg-slate-900 border-white/20 text-slate-200 group-hover:border-blue-400 group-hover:text-blue-400'
            }`}>
              <span className="font-mono">{s.name}</span>
            </div>
            {/* 下向きの小さな矢印 */}
            <div className={`w-1.5 h-1.5 rotate-45 border-r border-b transition-all ${
              Math.abs(s.distance - selectedStationDist) < 0.1
                ? 'bg-yellow-500 border-yellow-400 -mt-1'
                : 'bg-slate-950/90 border-white/20 -mt-1 group-hover:border-blue-400 group-hover:bg-slate-900'
            }`} />
          </button>
        ))}
      </div>

      {/* 3D キャンバスエリア（最背面に100%表示） */}
      <div className="absolute inset-0 z-0">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          onMouseDown={(e) => {
            triggerUiVisibility();
            handleMouseDown(e);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()} // 右クリックメニューを無効化してパン操作を快適に
          onTouchStart={(e) => {
            triggerUiVisibility();
            handleTouchStart(e);
          }}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          onWheel={(e) => {
            triggerUiVisibility();
            handleWheel(e);
          }}
          className="cursor-grab active:cursor-grabbing w-full h-full"
        />
      </div>

      {/* ==================== ① 表示レイヤー制御バー (上部左側) ==================== */}
      <div 
        onMouseEnter={() => {
          isHoveringUiRef.current = true;
          triggerUiVisibility();
        }}
        onMouseLeave={() => {
          isHoveringUiRef.current = false;
          triggerUiVisibility();
        }}
        style={{ transform: `translate(${layerBarPos.x}px, ${layerBarPos.y}px)` }}
        className={`absolute top-4 left-4 z-10 flex flex-col md:flex-row items-start md:items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-white/10 px-3 py-2 rounded-xl text-xs text-slate-300 shadow-2xl transition-opacity duration-500 transform ${
          showLayerBar && isUiVisible 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* ドラッグハンドル */}
        <div 
          onMouseDown={(e) => startUiDrag(e, layerBarPos, setLayerBarPos, '3d_layerBarPos')}
          onTouchStart={(e) => startUiDrag(e, layerBarPos, setLayerBarPos, '3d_layerBarPos')}
          className="flex items-center gap-1 cursor-move select-none border-r border-white/10 pr-2.5 mr-0.5 py-1 text-slate-400 hover:text-white"
          title="ドラッグしてこのバーを自由に移動できます"
        >
          <GripHorizontal className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          <Rotate3d className="w-4 h-4 text-blue-400 animate-spin-slow" />
          <span className="font-bold text-white text-[10px] tracking-wider uppercase ml-1">Layers</span>
        </div>

        {/* 現況地盤メッシュトグル */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowTerrainMesh(!showTerrainMesh);
          }}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
            showTerrainMesh 
              ? 'bg-slate-800 border-slate-700 text-slate-200' 
              : 'border-white/5 text-slate-500 hover:bg-white/5 bg-slate-950/40'
          }`}
          title="現況地形の3Dメッシュ表示を切り替えます"
        >
          {showTerrainMesh ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3" />}
          <span>地盤メッシュ: {showTerrainMesh ? 'ON' : 'OFF'}</span>
        </button>

        {/* 現況等高線（コンター）トグル */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowTerrainContour(!showTerrainContour);
          }}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
            showTerrainContour 
              ? 'bg-slate-800 border-slate-700 text-slate-200' 
              : 'border-white/5 text-slate-500 hover:bg-white/5 bg-slate-950/40'
          }`}
          title={`${contourInterval}m間隔の現況等高線表示を切り替えます`}
        >
          {showTerrainContour ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3" />}
          <span>等高線: {showTerrainContour ? 'ON' : 'OFF'}</span>
        </button>

        {/* 等高線（コンター）表示間隔切り替えスライダー */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-lg border border-white/5 text-slate-300">
          <span className="text-[10px] text-slate-400 font-bold">ピッチ:</span>
          <input 
            type="range" 
            min="1" 
            max="15" 
            step="1"
            value={contourInterval}
            onChange={(e) => {
              e.stopPropagation();
              setContourInterval(parseInt(e.target.value));
              triggerUiVisibility();
            }}
            className="w-12 md:w-16 accent-emerald-500 opacity-85 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
          />
          <span className="font-mono text-emerald-400 font-bold text-[10px] min-w-[20px] text-right">
            {contourInterval}m
          </span>
          <div className="flex gap-1 border-l border-white/10 pl-1.5 ml-1">
            {[1, 5, 10].map(val => (
              <button
                key={val}
                onClick={(e) => {
                  e.stopPropagation();
                  setContourInterval(val);
                  triggerUiVisibility();
                }}
                className={`px-1 py-0.5 rounded text-[8px] font-bold transition-all cursor-pointer ${
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

        {/* ワイヤーフレームトグル */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowWireframe(!showWireframe);
          }}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
            showWireframe 
              ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 bg-slate-800' 
              : 'border-white/5 hover:bg-white/5 bg-slate-950/40 text-slate-400'
          }`}
        >
          WIRE FRAME
        </button>

        {/* 3D詳細断面メッシュトグル */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShow3DSectionMesh(!show3DSectionMesh);
          }}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
            show3DSectionMesh 
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 bg-slate-800' 
              : 'border-white/5 hover:bg-white/5 bg-slate-950/40 text-slate-400'
          }`}
          title="選択位置における舗装多層構造や法面の3D断面スライス表示を切り替えます"
        >
          {show3DSectionMesh ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3" />}
          <span>3D断面メッシュ: {show3DSectionMesh ? 'ON' : 'OFF'}</span>
        </button>

        {/* 雨水排水シミュレーショントグル */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowDrainageSimulation(!showDrainageSimulation);
          }}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
            showDrainageSimulation 
              ? 'bg-blue-600/30 border-blue-500/50 text-blue-400 bg-slate-800' 
              : 'border-white/5 hover:bg-white/5 bg-slate-950/40 text-slate-400'
          }`}
          title="道路中心線および横断面の標高データから最急降下法を用いて雨水の流路ベクトルを算出し、3Dシーン上で青い流体パーティクルを表示し、サグ（凹部）を検出して赤いエフェクトで警告表示するシミュレータ"
        >
          <Droplets className={`w-3.5 h-3.5 ${showDrainageSimulation ? 'text-blue-400 animate-bounce' : 'text-slate-500'}`} />
          <span>排水シミュレータ: {showDrainageSimulation ? 'ON' : 'OFF'}</span>
        </button>

        {/* 閉じるボタン */}
        <button
          onClick={() => setShowLayerBar(false)}
          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors ml-1 cursor-pointer shrink-0"
          title="このレイヤーバーを閉じます（設定メニューからいつでも再表示できます）"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ==================== ①.5 橋脚・施工ピッチ＆偏角個別調整パネル (左側中段) ==================== */}
      {showPierSettingsPanel && (
        <div 
          onMouseEnter={() => {
            isHoveringUiRef.current = true;
            triggerUiVisibility();
          }}
          onMouseLeave={() => {
            isHoveringUiRef.current = false;
            triggerUiVisibility();
          }}
          style={{ transform: `translate(${pierPanelPos.x}px, ${pierPanelPos.y}px)` }}
          className={`absolute left-4 top-16 z-10 w-80 md:w-90 rounded-xl bg-slate-950/95 backdrop-blur-md border border-white/10 shadow-2xl transition-opacity duration-500 max-h-[350px] flex flex-col overflow-hidden ${
            isUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* ヘッダー */}
          <div 
            onMouseDown={(e) => startUiDrag(e, pierPanelPos, setPierPanelPos, '3d_pierPanelPos')}
            onTouchStart={(e) => startUiDrag(e, pierPanelPos, setPierPanelPos, '3d_pierPanelPos')}
            className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-white/5 select-none shrink-0 cursor-move"
            title="ドラッグしてこのウインドウを移動できます"
          >
            <div className="flex items-center gap-1.5 select-none">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-[11px] font-extrabold text-white">橋脚ピッチ＆偏角調整</span>
            </div>
            <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  setIndividualPierAngles({});
                  localStorage.removeItem('3d_individualPierAngles');
                }}
                className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-white/10 text-slate-400 hover:text-white text-[9px] font-bold transition-all cursor-pointer"
                title="すべての橋脚の個別回転角をリセットして基本（直角）に戻します"
              >
                全リセット
              </button>
              <button
                onClick={() => setShowPierSettingsPanel(false)}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors"
                title="このパネルを閉じます"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* コンテンツ（スクロール可能） */}
          <div className="p-3 space-y-3.5 overflow-y-auto custom-scrollbar flex-1">
            {/* 施工ピッチ（間隔）コントロール */}
            <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-lg border border-white/5">
              <div className="flex justify-between items-center text-[11px] font-bold">
                <span className="text-slate-300">橋脚施工ピッチ（間隔）</span>
                <span className="font-mono text-emerald-400 font-extrabold">{pierInterval.toFixed(1)}m</span>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="range" 
                  min="5" 
                  max="50" 
                  step="1"
                  value={pierInterval}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setPierInterval(val);
                    localStorage.setItem('3d_pierInterval', String(val));
                    triggerUiVisibility();
                  }}
                  className="flex-1 accent-emerald-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 min-w-[24px] text-right">
                  (5-50)
                </span>
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed">
                ※構造物（橋梁・高架橋）区間内で、橋脚を自動配置するスパン（間隔）を指定します。
              </p>
            </div>

            {/* 個別偏角（回転角）調整リスト */}
            <div className="space-y-2">
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider pb-1 border-b border-white/5 flex items-center justify-between">
                <span>個別偏角（回転角）調整</span>
                <span className="text-[9px] text-slate-500">（線形直角が基本: 0°）</span>
              </div>

              {piers.length === 0 ? (
                <div className="text-center py-4 bg-slate-900/20 rounded-lg border border-white/5 border-dashed">
                  <p className="text-[10px] text-slate-500">現在、構造物区間に配置される橋脚はありません</p>
                  <p className="text-[9px] text-slate-600 mt-0.5">※横断設定で橋梁または高架橋を設定してください</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {piers.map((pier) => {
                    const currentAngle = individualPierAngles[pier.index] || 0;
                    return (
                      <div 
                        key={`pier-setting-${pier.index}`}
                        className={`p-2 rounded-lg border transition-all ${
                          Math.abs(currentAngle) > 0.1 
                            ? 'bg-blue-950/25 border-blue-500/25' 
                            : 'bg-slate-900/40 border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] mb-1">
                          <span className="font-bold text-slate-200">
                            橋脚 P{pier.index + 1} <span className="text-slate-400 font-mono">({pier.distance.toFixed(1)}m地点)</span>
                          </span>
                          <span className={`font-mono font-bold ${Math.abs(currentAngle) > 0.1 ? 'text-blue-400' : 'text-slate-400'}`}>
                            {currentAngle > 0 ? '+' : ''}{currentAngle}°
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="range" 
                            min="-90" 
                            max="90" 
                            step="5"
                            value={currentAngle}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const updated = { ...individualPierAngles, [pier.index]: val };
                              setIndividualPierAngles(updated);
                              localStorage.setItem('3d_individualPierAngles', JSON.stringify(updated));
                              triggerUiVisibility();
                            }}
                            className="flex-1 accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                          <button
                            onClick={() => {
                              const updated = { ...individualPierAngles };
                              delete updated[pier.index];
                              setIndividualPierAngles(updated);
                              localStorage.setItem('3d_individualPierAngles', JSON.stringify(updated));
                              triggerUiVisibility();
                            }}
                            disabled={currentAngle === 0}
                            className={`px-1 rounded text-[8px] font-extrabold cursor-pointer transition-colors ${
                              currentAngle === 0 
                                ? 'text-slate-600 bg-slate-950/20' 
                                : 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
                            }`}
                          >
                            0°
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== ①.6 橋脚杭基礎自動構造設計パネル ==================== */}
      {showPilePanel && (
        <div 
          onMouseEnter={() => {
            isHoveringUiRef.current = true;
            triggerUiVisibility();
          }}
          onMouseLeave={() => {
            isHoveringUiRef.current = false;
            triggerUiVisibility();
          }}
          style={{ transform: `translate(${pilePanelPos.x}px, ${pilePanelPos.y}px)` }}
          className={`absolute left-4 top-24 z-10 w-96 rounded-xl bg-slate-950/95 backdrop-blur-md border border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.15)] transition-opacity duration-500 max-h-[400px] flex flex-col overflow-hidden ${
            isUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* ヘッダー */}
          <div 
            onMouseDown={(e) => startUiDrag(e, pilePanelPos, setPilePanelPos, '3d_pilePanelPos')}
            onTouchStart={(e) => startUiDrag(e, pilePanelPos, setPilePanelPos, '3d_pilePanelPos')}
            className="flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-white/5 shrink-0 cursor-move"
          >
            <div className="flex items-center gap-1.5 select-none">
              <Database className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-extrabold text-white">橋脚杭基礎 自動構造設計 (道示準拠)</span>
            </div>
            <button
              onClick={() => setShowPilePanel(false)}
              className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* コンテンツ */}
          <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1 text-slate-300 text-[11px]">
            <div className="bg-slate-900/60 p-2 rounded-lg border border-white/5 space-y-1">
              <div className="flex justify-between">
                <span>設計用定数 (極限先端抵抗力 q_d):</span>
                <span className="font-mono text-emerald-400 font-extrabold">3,000 kN/m²</span>
              </div>
              <div className="flex justify-between">
                <span>杭仕様:</span>
                <span className="font-mono text-slate-300 font-bold">
                  Φ{((crossSection.pileDiameter ?? 1.2) * 1000).toFixed(0)}mm × L{(crossSection.pileLength ?? 15).toFixed(1)}m (実配 {crossSection.pileCountPerPier ?? 4}本)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="py-1">橋脚</th>
                    <th className="py-1 text-right">作用力</th>
                    <th className="py-1 text-right">許容支持力</th>
                    <th className="py-1 text-right">要求本数</th>
                    <th className="py-1 text-center">判定</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {pilesData.map((pile, idx) => {
                    const loadPerPile = (pile.appliedLoad ?? 0) / (crossSection.pileCountPerPier ?? 4);
                    return (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="py-1.5 text-slate-300 font-bold">P{pile.pierIndex}</td>
                        <td className="py-1.5 text-right text-slate-300">{loadPerPile.toFixed(0)} <span className="text-[8px] text-slate-500">kN</span></td>
                        <td className="py-1.5 text-right text-emerald-400">{(pile.allowableBearingCap ?? 0).toFixed(0)} <span className="text-[8px] text-slate-500">kN</span></td>
                        <td className="py-1.5 text-right text-slate-300 font-bold">
                          {pile.requiredPilesCount ?? 0} 本
                        </td>
                        <td className="py-1.5 text-center">
                          <span className={`px-1 py-0.5 rounded text-[9px] font-extrabold ${
                            pile.isBearingOk 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse'
                          }`}>
                            {pile.isBearingOk ? '安全' : 'NG'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              ※道路橋示方書に準拠し、極限先端支持力（N値=35相当）および周辺摩擦力から杭1本当たりの許容支持力 Ra を自動算出。安全率 Fs = 3.0（常時）を適用。
            </p>
          </div>
        </div>
      )}

      {/* ==================== ①.7 沿道交通騒音モデル (ASJ RTN-Model 2018) パネル ==================== */}
      {showNoisePanel && (
        <div 
          onMouseEnter={() => {
            isHoveringUiRef.current = true;
            triggerUiVisibility();
          }}
          onMouseLeave={() => {
            isHoveringUiRef.current = false;
            triggerUiVisibility();
          }}
          style={{ transform: `translate(${noisePanelPos.x}px, ${noisePanelPos.y}px)` }}
          className={`absolute left-4 top-32 z-10 w-96 rounded-xl bg-slate-950/95 backdrop-blur-md border border-rose-500/30 shadow-[0_0_25px_rgba(239,68,68,0.15)] transition-opacity duration-500 max-h-[400px] flex flex-col overflow-hidden ${
            isUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* ヘッダー */}
          <div 
            onMouseDown={(e) => startUiDrag(e, noisePanelPos, setNoisePanelPos, '3d_noisePanelPos')}
            onTouchStart={(e) => startUiDrag(e, noisePanelPos, setNoisePanelPos, '3d_noisePanelPos')}
            className="flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-white/5 shrink-0 cursor-move"
          >
            <div className="flex items-center gap-1.5 select-none">
              <TrendingUp className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-[11px] font-extrabold text-white">道路交通騒音予測 (ASJ RTN-Model 2018)</span>
            </div>
            <button
              onClick={() => setShowNoisePanel(false)}
              className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* コンテンツ */}
          <div className="p-3 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 text-slate-300 text-[11px]">
            {/* 交通量コントロール */}
            <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-lg border border-white/5">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-300">予測用断面交通量 (昼間)</span>
                <span className="font-mono text-rose-400 font-extrabold">{noiseTrafficVolume.toLocaleString()} 台/時</span>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="range" 
                  min="100" 
                  max="5000" 
                  step="100"
                  value={noiseTrafficVolume}
                  onChange={(e) => {
                    setNoiseTrafficVolume(Number(e.target.value));
                    triggerUiVisibility();
                  }}
                  className="flex-1 accent-rose-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[9px] font-mono text-slate-400 min-w-[34px] text-right">
                  (100-5K)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="py-1">測点</th>
                    <th className="py-1 text-right">壁なし騒音</th>
                    <th className="py-1 text-right">壁あり騒音</th>
                    <th className="py-1 text-right">防音壁高</th>
                    <th className="py-1 text-center">判定</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {noiseData.slice(0, 15).map((noise, idx) => (
                    <tr key={idx} className="hover:bg-white/5">
                      <td className="py-1 text-slate-300 font-bold">{noise.stationName}</td>
                      <td className="py-1 text-right text-slate-400">{(noise.noiseLevelRaw ?? 0).toFixed(1)} <span className="text-[8px]">dB</span></td>
                      <td className="py-1 text-right text-rose-400 font-bold">{(noise.noiseLevelWithBarrier ?? 0).toFixed(1)} <span className="text-[8px] text-slate-500">dB</span></td>
                      <td className="py-1 text-right text-slate-300">{(noise.barrierHeight ?? 0).toFixed(1)}m</td>
                      <td className="py-1 text-center">
                        <span className={`px-1 py-0.5 rounded text-[9px] font-extrabold ${
                          noise.isLimitOk 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse'
                        }`}>
                          {noise.isLimitOk ? '基準内' : '超過'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              ※受音点：道路端より水平20m、地上高1.2m。環境基準目標：等価騒音レベル LAeq ≦ 60.0 dB。3D上の防音壁は判定結果により自動着色されます（緑：合格、橙：超過）。
            </p>
          </div>
        </div>
      )}

      {/* ==================== ①.8 コンクリート中性化劣化LCCタイムシミュレータパネル ==================== */}
      {showLccPanel && (
        <div 
          onMouseEnter={() => {
            isHoveringUiRef.current = true;
            triggerUiVisibility();
          }}
          onMouseLeave={() => {
            isHoveringUiRef.current = false;
            triggerUiVisibility();
          }}
          style={{ transform: `translate(${lccPanelPos.x}px, ${lccPanelPos.y}px)` }}
          className={`absolute left-4 top-40 z-10 w-96 rounded-xl bg-slate-950/95 backdrop-blur-md border border-violet-500/30 shadow-[0_0_25px_rgba(139,92,246,0.15)] transition-opacity duration-500 max-h-[400px] flex flex-col overflow-hidden ${
            isUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* ヘッダー */}
          <div 
            onMouseDown={(e) => startUiDrag(e, lccPanelPos, setLccPanelPos, '3d_lccPanelPos')}
            onTouchStart={(e) => startUiDrag(e, lccPanelPos, setLccPanelPos, '3d_lccPanelPos')}
            className="flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-white/5 shrink-0 cursor-move"
          >
            <div className="flex items-center gap-1.5 select-none">
              <RotateCcw className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="text-[11px] font-extrabold text-white">コンクリート中性化劣化 ＆ LCCシミュレータ</span>
            </div>
            <button
              onClick={() => setShowLccPanel(false)}
              className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* コンテンツ */}
          <div className="p-3 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 text-slate-300 text-[11px]">
            {/* 経過年数コントロール */}
            <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-lg border border-white/5">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-300">劣化経過年数</span>
                <span className="font-mono text-violet-400 font-extrabold">{simulationYear} 年経過</span>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="5"
                  value={simulationYear}
                  onChange={(e) => {
                    setSimulationYear(Number(e.target.value));
                    triggerUiVisibility();
                  }}
                  className="flex-1 accent-violet-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[9px] font-mono text-slate-400 min-w-[34px] text-right">
                  (0-100年)
                </span>
              </div>
            </div>

            {/* 補修戦略 */}
            <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-lg border border-white/5">
              <span className="font-bold text-slate-300">維持管理・補修補強戦略</span>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { id: 'none', name: '補修なし', desc: '事後放置' },
                  { id: 'surface', name: '予防保全', desc: '表面シールド' },
                  { id: 'section', name: '断面修復', desc: '鉄筋防錆・修復' }
                ].map(strat => (
                  <button
                    key={strat.id}
                    onClick={() => setRepairStrategy(strat.id as any)}
                    className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                      repairStrategy === strat.id
                        ? 'bg-violet-600/25 border-violet-500 text-white font-extrabold'
                        : 'border-white/5 bg-slate-900 text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="text-[10px] font-extrabold">{strat.name}</div>
                    <div className="text-[8px] text-slate-400 mt-0.5">{strat.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 演算結果の可視化 */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/5 space-y-1">
              <div className="flex justify-between">
                <span>平均中性化深さ y:</span>
                <span className="font-mono text-violet-400 font-extrabold">
                  {simulationYear === 0 ? '0.0' : (1.8 * Math.sqrt(simulationYear) * (repairStrategy === 'surface' ? 0.35 : 1.0)).toFixed(1)} mm
                </span>
              </div>
              <div className="flex justify-between">
                <span>鉄筋かぶり厚に達する年数 (想定寿命):</span>
                <span className="font-mono text-slate-300 font-bold">
                  {repairStrategy === 'surface' ? '120年以上 (長寿命化)' : '約 62 年'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>累計LCC維持管理費用:</span>
                <span className="font-mono text-amber-400 font-extrabold">
                  {repairStrategy === 'none' 
                    ? `${(simulationYear > 60 ? (simulationYear - 60) * 1.5 + 2.0 : 0).toFixed(1)} 百万円/脚`
                    : repairStrategy === 'surface'
                      ? `${(simulationYear >= 30 ? 1.2 : 0).toFixed(1)} 百万円/脚`
                      : `${(simulationYear > 60 ? 5.0 : 0).toFixed(1)} 百万円/脚`}
                </span>
              </div>
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              ※中性化進行モデル： y = C √t。タイムスライダーを動かすと、3D上のコンクリートが中性化の進行度に応じて健全（コンクリート色）⇒白化（中性化）⇒赤茶（剥離・錆露出）に変色します。
            </p>
          </div>
        </div>
      )}

      {/* ==================== ② 視点・カメラ操作バー (上部右側、設定の左側) ==================== */}
      <div 
        onMouseEnter={() => {
          isHoveringUiRef.current = true;
          triggerUiVisibility();
        }}
        onMouseLeave={() => {
          isHoveringUiRef.current = false;
          triggerUiVisibility();
        }}
        style={{ transform: `translate(${cameraBarPos.x}px, ${cameraBarPos.y}px)` }}
        className={`absolute top-4 right-16 z-20 flex flex-col md:flex-row items-start md:items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-white/10 px-3 py-2 rounded-xl text-xs text-slate-300 shadow-2xl transition-opacity duration-500 transform ${
          showCameraBar && isUiVisible 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* ドラッグハンドル */}
        <div 
          onMouseDown={(e) => startUiDrag(e, cameraBarPos, setCameraBarPos, '3d_cameraBarPos')}
          onTouchStart={(e) => startUiDrag(e, cameraBarPos, setCameraBarPos, '3d_cameraBarPos')}
          className="flex items-center gap-1 cursor-move select-none border-r border-white/10 pr-2.5 mr-0.5 py-1 text-slate-400 hover:text-white"
          title="ドラッグしてこのバーを自由に移動できます"
        >
          <GripHorizontal className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          <span className="font-bold text-white text-[10px] tracking-wider uppercase ml-1">Camera</span>
        </div>

        {/* 視点ビュー プリセット選択 */}
        <div className="flex items-center gap-1 bg-slate-900/80 px-1.5 py-0.5 rounded-lg border border-white/5 text-slate-300">
          <span className="text-[10px] text-slate-400 font-bold px-1">視点:</span>
          <button
            onClick={() => handleApplyPreset(0.8, 1.1, alignmentRadius.current * 0.75, alignmentCenter.current.x, alignmentCenter.current.y, alignmentCenter.current.z)}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-950 hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="初期状態の斜め鳥瞰（俯瞰）ビューにスムーズに切り替えます"
          >
            鳥瞰
          </button>
          <button
            onClick={() => handleApplyPreset(0, 0.01, alignmentRadius.current, alignmentCenter.current.x, alignmentCenter.current.y, alignmentCenter.current.z)}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-950 hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="真上からの平面ビューにスムーズに切り替えます"
          >
            平面
          </button>
          <button
            onClick={() => handleApplyPreset(0, 1.3, alignmentRadius.current * 0.75, alignmentCenter.current.x, alignmentCenter.current.y, alignmentCenter.current.z)}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-950 hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="アライメント進行方向を向いた正面ビューにスムーズに切り替えます"
          >
            正面
          </button>
          <button
            onClick={() => handleApplyPreset(Math.PI / 2, 1.3, alignmentRadius.current * 0.75, alignmentCenter.current.x, alignmentCenter.current.y, alignmentCenter.current.z)}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-950 hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="道路の横断方向（カーブ側面）から見る側面ビューにスムーズに切り替えます"
          >
            側面
          </button>
        </div>

        {/* 自動回転トグル */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setIsRotating(!isRotating);
          }}
          className="p-1 rounded-lg border border-white/5 bg-slate-900/60 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold text-slate-300"
          title="自動でカメラを回転させるかどうか切り替えます"
        >
          {isRotating ? (
            <>
              <Pause className="w-3.5 h-3.5 text-amber-500 animate-spin-slow" />
              <span className="hidden sm:inline">一時停止</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">自動回転</span>
            </>
          )}
        </button>

        {/* 視点リセットボタン */}
        <button
          onClick={handleResetCamera}
          className="p-1 rounded-lg border border-white/5 hover:bg-white/5 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold bg-slate-900 text-slate-300 shrink-0 animate-fade-in"
          title="カメラの回転位置・パン位置（注視点）を初期状態にリセットします"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
          <span>リセット</span>
        </button>

        {/* 走行シミュレーショントグルボタン */}
        <button
          onClick={() => {
            triggerUiVisibility();
            const nextShow = !showDrivePanel;
            setShowDrivePanel(nextShow);
            if (nextShow) {
              setIsDriving(true);
              setDriveCameraMode('diagonal');
              // アニメーション中の回転はオフにする
              setIsRotating(false);
            } else {
              setIsDriving(false);
            }
          }}
          className={`p-1 px-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 text-[10px] font-bold shrink-0 ${
            showDrivePanel
              ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold shadow-lg shadow-amber-500/25 scale-105'
              : 'border-white/5 bg-slate-900 text-slate-300 hover:bg-white/5'
          }`}
          title="道路を自動車で走る走行シミュレーション画面を表示します"
        >
          <Car className={`w-3.5 h-3.5 ${showDrivePanel ? 'animate-pulse' : 'text-amber-400'}`} />
          <span>走行シミュレーション</span>
        </button>

        {/* 雨水排水シミュレーショントグルボタン */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowDrainageSimulation(!showDrainageSimulation);
          }}
          className={`p-1 px-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 text-[10px] font-bold shrink-0 ${
            showDrainageSimulation
              ? 'bg-blue-600 border-blue-500 text-white font-extrabold shadow-lg shadow-blue-500/25 scale-105'
              : 'border-white/5 bg-slate-900 text-slate-300 hover:bg-white/5'
          }`}
          title="道路中心線および横断面の標高データから最急降下法を用いて雨水の流路ベクトルを算出し、3D上でシミュレーションします"
        >
          <Droplets className={`w-3.5 h-3.5 ${showDrainageSimulation ? 'animate-bounce text-white' : 'text-blue-400'}`} />
          <span>雨水排水シミュレータ</span>
        </button>

        {/* 杭基礎構造計算トグルボタン */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowPilePanel(!showPilePanel);
          }}
          className={`p-1 px-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 text-[10px] font-bold shrink-0 ${
            showPilePanel
              ? 'bg-emerald-600 border-emerald-500 text-white font-extrabold shadow-lg shadow-emerald-500/25 scale-105'
              : 'border-white/5 bg-slate-900 text-slate-300 hover:bg-white/5'
          }`}
          title="各橋脚に対する極限支持力、許容支持力、及び必要杭本数の力学的自動設計結果を表示します"
        >
          <Database className={`w-3.5 h-3.5 ${showPilePanel ? 'text-white' : 'text-emerald-400'}`} />
          <span>杭基礎構造設計</span>
        </button>

        {/* 道路交通騒音3Dトグルボタン */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowNoisePanel(!showNoisePanel);
          }}
          className={`p-1 px-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 text-[10px] font-bold shrink-0 ${
            showNoisePanel
              ? 'bg-rose-600 border-rose-500 text-white font-extrabold shadow-lg shadow-rose-500/25 scale-105'
              : 'border-white/5 bg-slate-900 text-slate-300 hover:bg-white/5'
          }`}
          title="ASJ RTN-Model 2018（日本音響学会道路交通騒音予測モデル）に準拠した3D騒音影響評価と防音壁のリアルタイム設計機能を表示します"
        >
          <TrendingUp className={`w-3.5 h-3.5 ${showNoisePanel ? 'text-white font-extrabold' : 'text-rose-400'}`} />
          <span>沿道騒音評価</span>
        </button>

        {/* コンクリート中性化LCCトグルボタン */}
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowLccPanel(!showLccPanel);
          }}
          className={`p-1 px-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 text-[10px] font-bold shrink-0 ${
            showLccPanel
              ? 'bg-violet-600 border-violet-500 text-white font-extrabold shadow-lg shadow-violet-500/25 scale-105'
              : 'border-white/5 bg-slate-900 text-slate-300 hover:bg-white/5'
          }`}
          title="100年間におけるコンクリート橋脚の中性化進行とライフサイクルコスト（LCC）、予防保全効果をシミュレーションします"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${showLccPanel ? 'text-white font-extrabold animate-spin-slow' : 'text-violet-400'}`} />
          <span>劣化LCCタイムシミュレータ</span>
        </button>

        {/* 閉じるボタン */}
        <button
          onClick={() => setShowCameraBar(false)}
          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors ml-1 cursor-pointer shrink-0"
          title="このカメラ操作バーを閉じます（設定メニューからいつでも再表示できます）"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ==================== ③ 画面右上端固定: UI表示設定パネル (常時表示ハブ) ==================== */}
      <div 
        className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2"
        onMouseEnter={() => triggerUiVisibility()}
      >
        <button
          onClick={() => {
            triggerUiVisibility();
            setShowSettingsDropdown(!showSettingsDropdown);
          }}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xl backdrop-blur-md ${
            showSettingsDropdown
              ? 'bg-blue-600 border-blue-500 text-white animate-spin-once'
              : 'bg-slate-950/90 border-white/10 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
          title="3D UI表示・自動非表示オプションを開きます"
        >
          <Settings className="w-4 h-4" />
        </button>

        {onShowMarkdownList && (
          <button
            onClick={() => {
              triggerUiVisibility();
              onShowMarkdownList();
            }}
            className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center transition-all cursor-pointer shadow-2xl backdrop-blur-md bg-slate-950/90 text-slate-400 hover:text-amber-400 hover:bg-slate-900"
            title="プロジェクト内の各種 Markdown ドキュメントを一覧・閲覧します"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        )}

        {/* 設定ドロップダウンメニュー */}
        <div 
          className={`w-56 rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-md p-3.5 shadow-2xl transition-all duration-300 origin-top-right transform ${
            showSettingsDropdown
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-95 pointer-events-none'
          }`}
          onMouseEnter={() => {
            isHoveringUiRef.current = true;
          }}
          onMouseLeave={() => {
            isHoveringUiRef.current = false;
          }}
        >
          <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-2.5 pb-1 border-b border-white/5">
            3D UI 表示カスタマイズ
          </div>
          
          <div className="space-y-2.5 text-xs text-slate-300">
            {/* オートハイド切り替え */}
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="font-semibold group-hover:text-white transition-colors">自動的に隠す (Auto)</span>
              <input 
                type="checkbox" 
                checked={autoHideEnabled}
                onChange={() => {
                  setAutoHideEnabled(!autoHideEnabled);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <div className="border-t border-white/5 my-2"></div>

            {/* 各パーツの表示トグル */}
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">① 表示レイヤー制御バー</span>
              <input 
                type="checkbox" 
                checked={showLayerBar}
                onChange={() => {
                  setShowLayerBar(!showLayerBar);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">② 視点・カメラ操作バー</span>
              <input 
                type="checkbox" 
                checked={showCameraBar}
                onChange={() => {
                  setShowCameraBar(!showCameraBar);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">③ 操作方法ヘルプカード</span>
              <input 
                type="checkbox" 
                checked={showHelpCard}
                onChange={() => {
                  setShowHelpCard(!showHelpCard);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">④ 橋脚・偏角調整パネル</span>
              <input 
                type="checkbox" 
                checked={showPierSettingsPanel}
                onChange={() => {
                  setShowPierSettingsPanel(!showPierSettingsPanel);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑤ 縦断・横断図ウインドウ</span>
              <input 
                type="checkbox" 
                checked={showCrossSectionWindow}
                onChange={() => {
                  setShowCrossSectionWindow(!showCrossSectionWindow);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑥ 側点（Station）案内板</span>
              <input 
                type="checkbox" 
                checked={showStationIndicator}
                onChange={() => {
                  setShowStationIndicator(!showStationIndicator);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑦ 日照・霧調整バー</span>
              <input 
                type="checkbox" 
                checked={showEnvBar}
                onChange={() => {
                  setShowEnvBar(!showEnvBar);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑧ 雨水排水シミュレータ</span>
              <input 
                type="checkbox" 
                checked={showDrainageSimulation}
                onChange={() => {
                  setShowDrainageSimulation(!showDrainageSimulation);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑨ 橋脚杭基礎構造計算</span>
              <input 
                type="checkbox" 
                checked={showPilePanel}
                onChange={() => {
                  setShowPilePanel(!showPilePanel);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑩ 沿道交通騒音評価</span>
              <input 
                type="checkbox" 
                checked={showNoisePanel}
                onChange={() => {
                  setShowNoisePanel(!showNoisePanel);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑪ 劣化LCCシミュレータ</span>
              <input 
                type="checkbox" 
                checked={showLccPanel}
                onChange={() => {
                  setShowLccPanel(!showLccPanel);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">⑫ 走行マルチカメラDVR</span>
              <input 
                type="checkbox" 
                checked={dvrCameraActive}
                onChange={() => {
                  setDvrCameraActive(!dvrCameraActive);
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <div className="border-t border-white/5 my-2"></div>
            
            <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
              のり面保護工・小段設定
            </div>

            <label className="flex flex-col gap-1 cursor-pointer group">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">のり面保護工（質感）</span>
              <select
                value={slopeProtectionType}
                onChange={(e) => {
                  setSlopeProtectionType(e.target.value as any);
                  localStorage.setItem('3d_slopeProtectionType', e.target.value);
                }}
                className="w-full text-[10px] px-2 py-1.5 rounded bg-slate-900 border border-white/10 text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="grid_green">植生・法枠工 (格子)</option>
                <option value="grass">芝生 (全面植生)</option>
                <option value="concrete">モルタル吹付</option>
                <option value="standard">標準カラー (切土青/盛土赤)</option>
              </select>
            </label>

            <label className="flex items-center justify-between cursor-pointer group pt-1">
              <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">小段（多段法面）を表示</span>
              <input 
                type="checkbox" 
                checked={enableBermMesh}
                onChange={() => {
                  setEnableBermMesh(!enableBermMesh);
                  localStorage.setItem('3d_enableBermMesh', String(!enableBermMesh));
                  triggerUiVisibility();
                }}
                className="w-3.5 h-3.5 rounded border-white/10 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <div className="border-t border-white/5 my-2.5"></div>

            <button
              onClick={() => {
                resetAllUiPositions();
                triggerUiVisibility();
              }}
              className="w-full py-1.5 rounded-lg bg-red-600/10 border border-red-500/30 hover:bg-red-600 hover:text-white text-red-400 hover:border-red-500 text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1"
              title="移動させたウィンドウの配置をすべて初期設定位置へ復元します"
            >
              <RefreshCw className="w-3 h-3" />
              <span>UI配置を初期化</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================== ④ 3D 操作用クイックガイダンス (左下フローティング) ==================== */}
      <div 
        onMouseEnter={() => {
          isHoveringUiRef.current = true;
          triggerUiVisibility();
        }}
        onMouseLeave={() => {
          isHoveringUiRef.current = false;
          triggerUiVisibility();
        }}
        style={{ transform: `translate(${helpCardPos.x}px, ${helpCardPos.y}px)` }}
        className={`absolute bottom-4 left-4 p-3 rounded-xl bg-slate-900/95 border border-white/10 text-[10px] text-slate-300 max-w-[250px] backdrop-blur-md shadow-2xl space-y-1.5 transition-opacity duration-500 transform ${
          showHelpCard && isUiVisible 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* ドラッグハンドル兼ヘッダー */}
        <div 
          onMouseDown={(e) => startUiDrag(e, helpCardPos, setHelpCardPos, '3d_helpCardPos')}
          onTouchStart={(e) => startUiDrag(e, helpCardPos, setHelpCardPos, '3d_helpCardPos')}
          className="font-bold text-white flex items-center justify-between border-b border-white/10 pb-1 cursor-move select-none"
          title="ドラッグしてこのヘルプカードを移動できます"
        >
          <div className="flex items-center gap-1">
            <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <Move className="w-3.5 h-3.5 text-blue-400" />
            <span>3Dビュー操作方法</span>
          </div>
          <button
            onClick={() => setShowHelpCard(false)}
            className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            title="ヘルプを非表示にします"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <ul className="list-disc pl-4 space-y-1 text-slate-400 select-none">
          <li><strong>左ドラッグ / 1本指スワイプ</strong>:<br />カメラを自由に回転</li>
          <li><strong>右ドラッグ / Shift+左ドラッグ</strong>:<br />画面の平行移動（パン）</li>
          <li><strong>中ボタン(ホイール)ドラッグ</strong>:<br />画面の平行移動（パン）</li>
          <li><strong>スクロール / ピンチ</strong>:<br />スムーズな拡大・縮小（ズーム）</li>
          <li><strong>2本指スワイプ</strong>:<br />マルチタッチでのズーム＆パン移動</li>
        </ul>
        <div className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 select-none">
          ※パンで迷子になった場合は、カメラ操作バーの<strong>「リセット」</strong>ボタンでいつでも中央に戻せます。
        </div>
      </div>

      {/* ==================== ⑥ フローティング横断面個別確認ウインドウ (右側中段) ==================== */}
      {showCrossSectionWindow && stations && stations.length > 0 && (() => {
        const activeStation = stations.find(s => Math.abs(s.distance - selectedStationDist) < 0.1) || stations[0];
        if (!activeStation) return null;

        // 横断面データを計算
        const csData = generateCrossSectionData(activeStation.distance, activeStation.z, activeStation.groundZ);

        return (
          <div 
            onMouseEnter={() => {
              isHoveringUiRef.current = true;
              triggerUiVisibility();
            }}
            onMouseLeave={() => {
              isHoveringUiRef.current = false;
              triggerUiVisibility();
            }}
            style={{ transform: `translate(${crossSectionPanelPos.x}px, ${crossSectionPanelPos.y}px)` }}
            className={`absolute right-4 top-24 z-10 w-80 md:w-96 rounded-xl bg-slate-950/95 backdrop-blur-md border border-white/10 shadow-2xl transition-opacity duration-500 overflow-hidden ${
              isUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* ヘッダー */}
            <div 
              onMouseDown={(e) => startUiDrag(e, crossSectionPanelPos, setCrossSectionPanelPos, '3d_crossSectionPanelPos')}
              onTouchStart={(e) => startUiDrag(e, crossSectionPanelPos, setCrossSectionPanelPos, '3d_crossSectionPanelPos')}
              className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-white/5 select-none cursor-move"
              title="ドラッグしてこのウインドウを移動できます"
            >
              <div className="flex items-center gap-1.5 select-none">
                <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-xs font-bold text-white">横断面図: {activeStation.name}</span>
                <span className="text-[10px] font-mono text-slate-400">({activeStation.distance.toFixed(1)}m)</span>
              </div>
              <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
                {/* 最小化・折りたたみボタン */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCrossSectionPanel(!showCrossSectionPanel);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer text-[9px] font-bold"
                  title="横断面図の表示を切り替えます"
                >
                  {showCrossSectionPanel ? '隠す' : '表示'}
                </button>
                <button
                  onClick={() => setShowCrossSectionWindow(false)}
                  className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors"
                  title="横断面図ウインドウを閉じます"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* コンテンツ */}
            {showCrossSectionPanel && (
              <div className="p-3 space-y-2.5 bg-slate-950/40">
                {/* SVG 横断面図 */}
                <div className="w-full bg-slate-900/60 border border-white/5 rounded-lg overflow-hidden flex items-center justify-center p-1 relative h-36 md:h-44">
                  {/* 地盤高・計画高・高低差などのテキストオーバーレイ */}
                  <div className="absolute top-2 left-2 flex flex-col gap-0.5 text-[9px] font-mono font-semibold text-slate-400 bg-slate-950/90 px-1.5 py-0.5 rounded border border-white/10 backdrop-blur-md">
                    <div>計画高 (FH): <span className="text-blue-400 font-bold">{activeStation.z.toFixed(2)}m</span></div>
                    <div>地盤高 (GH): <span className="text-emerald-400 font-bold">{activeStation.groundZ.toFixed(2)}m</span></div>
                    <div>高低差 (H): <span className={csData.isFill ? "text-amber-400 font-bold" : "text-rose-400 font-bold"}>
                      {(activeStation.z - activeStation.groundZ).toFixed(2)}m ({csData.isFill ? "盛土" : "切土"})
                    </span></div>
                  </div>

                  <svg 
                    viewBox="0 0 400 160" 
                    className="w-full h-full text-slate-300 font-sans"
                    style={{ background: 'transparent' }}
                  >
                    {/* 格子背景（Grid） */}
                    <g stroke="rgba(255,255,255,0.03)" strokeWidth="0.5">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <line key={`lh-${i}`} x1="0" y1={20 * i} x2="400" y2={20 * i} />
                      ))}
                      {Array.from({ length: 11 }).map((_, i) => (
                        <line key={`lv-${i}`} x1={40 * i} y1="0" x2={40 * i} y2="160" />
                      ))}
                    </g>

                    {/* 中心線（Center Line） */}
                    <line x1="200" y1="0" x2="200" y2="160" stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1" strokeDasharray="3 3" />
                    
                    {/* 地盤線 */}
                    <path d={csData.groundPathStr} fill="none" stroke="#10b981" strokeWidth="1.2" strokeDasharray="4 2" />

                    {/* 切土・盛土ハッチング領域 */}
                    {csData.hatchPointsStr && (
                      <polygon 
                        points={csData.hatchPointsStr} 
                        fill={csData.isFill ? "rgba(245, 158, 11, 0.08)" : "rgba(239, 68, 68, 0.08)"} 
                        stroke="none" 
                      />
                    )}

                    {/* のり面構造 */}
                    {csData.sectionType === 'earthwork' ? (
                      <g>
                        {/* 道路のり面 */}
                        <path d={csData.leftSlopePathStr} fill="none" stroke={csData.isFill ? "#f59e0b" : "#ef4444"} strokeWidth="1.2" />
                        <path d={csData.rightSlopePathStr} fill="none" stroke={csData.isFill ? "#f59e0b" : "#ef4444"} strokeWidth="1.2" />

                        {/* のり面構造物 (重力式擁壁やブロック積) */}
                        {csData.leftStructurePolyStr && (
                          <polygon points={csData.leftStructurePolyStr} fill="#475569" stroke="#64748b" strokeWidth="0.8" />
                        )}
                        {csData.rightStructurePolyStr && (
                          <polygon points={csData.rightStructurePolyStr} fill="#475569" stroke="#64748b" strokeWidth="0.8" />
                        )}
                      </g>
                    ) : (
                      // 橋梁・高架橋
                      csData.bridgeStructureHtml
                    )}

                    {/* 道路舗装層構造 */}
                    {csData.sectionType === 'earthwork' && (
                      <g>
                        {/* 路床層 */}
                        <polygon points={csData.subgradePolygonPointsStr} fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
                        {/* 路盤層 */}
                        <polygon points={csData.basePolygonPointsStr} fill="#334155" stroke="#475569" strokeWidth="0.5" />
                        {/* 舗装層 */}
                        <polygon points={csData.pavePolygonPointsStr} fill="#475569" stroke="#64748b" strokeWidth="0.5" />
                      </g>
                    )}

                    {/* 道路設計ライン */}
                    <path d={csData.roadPathStr} fill="none" stroke="#3b82f6" strokeWidth="2.5" />

                    {/* 中心点マーク */}
                    <circle cx={csData.ptCenter.x} cy={csData.ptCenter.y} r="3" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />

                    {/* 道路端・路肩端の引き出し線用補助サークル */}
                    <circle cx={csData.ptLeftShoulder.x} cy={csData.ptLeftShoulder.y} r="2" fill="#3b82f6" />
                    <circle cx={csData.ptRightShoulder.x} cy={csData.ptRightShoulder.y} r="2" fill="#3b82f6" />
                  </svg>
                </div>

                {/* 舗装多層構造 ＆ 土工スペック情報 */}
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono border-t border-b border-white/5 py-2">
                  <div className="space-y-1 bg-slate-900/40 p-1.5 rounded border border-white/5">
                    <div className="text-blue-400 font-extrabold text-[8px] uppercase tracking-wider mb-1">■ 舗装多層構造</div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>・表層 (Pavement)</span>
                      <span className="text-amber-400 font-bold">{(crossSection.pavementThickness || 0.15).toFixed(2)}m</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>・上層路盤 (Base)</span>
                      <span className="text-amber-400 font-bold">{(crossSection.baseThickness || 0.30).toFixed(2)}m</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>・下層路盤・路床</span>
                      <span className="text-amber-400 font-bold">{(crossSection.subgradeThickness || 1.00).toFixed(2)}m</span>
                    </div>
                  </div>
                  
                  <div className="space-y-1 bg-slate-900/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
                    <div>
                      <div className="text-emerald-400 font-extrabold text-[8px] uppercase tracking-wider mb-1">■ 道路・法面諸元</div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>・車線幅 (L/R)</span>
                        <span className="font-bold">{csData.leftWidth.toFixed(1)}m / {csData.rightWidth.toFixed(1)}m</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>・路肩幅 (S)</span>
                        <span className="font-bold">{csData.shoulder.toFixed(1)}m</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>・法勾配 (S)</span>
                        <span className="font-bold">1 : {(csData.sectionType === 'earthwork' ? (csData.isFill ? (crossSection.fillSlopeGradient ?? 1.5) : (crossSection.cutSlopeGradient ?? 1.0)) : 0).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 操作パネル・遷移ボタン */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setLayoutMode('cross');
                    }}
                    className="flex-1 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white transition-all text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <span>大画面で横断を設計・確認する</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ==================== ⑤ 選択測点インジケータ (右下フローティング) ==================== */}
      {stations && stations.length > 0 && (() => {
        const activeStation = stations.find(s => Math.abs(s.distance - selectedStationDist) < 0.1) || stations[0];
        return activeStation ? (
          <div 
            className={`absolute bottom-4 right-4 z-10 flex items-center gap-1.5 bg-yellow-500/15 backdrop-blur-md border border-yellow-500/25 px-3 py-1.5 rounded-lg text-[10px] font-bold text-yellow-400 shadow-2xl transition-all duration-500 ${
              isUiVisible && !showDrivePanel ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-ping"></span>
            選択測点: {activeStation.name} ({selectedStationDist.toFixed(1)}m)
          </div>
        ) : null;
      })()}

      {/* ==================== 🚗 走行シミュレーション専用操作パネル ==================== */}
      {showDrivePanel && (
        <div
          onMouseEnter={() => {
            isHoveringUiRef.current = true;
            triggerUiVisibility();
          }}
          onMouseLeave={() => {
            isHoveringUiRef.current = false;
            triggerUiVisibility();
          }}
          style={{ transform: `translate(calc(-50% + ${drivePanelPos.x}px), ${drivePanelPos.y}px)` }}
          className={`absolute bottom-4 left-1/2 z-20 w-[95%] max-w-[460px] bg-slate-950/95 backdrop-blur-md border border-amber-500/40 p-3 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.2)] transition-opacity duration-500 transform flex flex-col gap-2.5 ${
            isUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* ヘッダー・クローズボタン */}
          <div 
            onMouseDown={(e) => startUiDrag(e, drivePanelPos, setDrivePanelPos, '3d_drivePanelPos')}
            onTouchStart={(e) => startUiDrag(e, drivePanelPos, setDrivePanelPos, '3d_drivePanelPos')}
            className="flex items-center justify-between border-b border-white/10 pb-1.5 cursor-move select-none"
            title="ドラッグしてこのパネルを自由に移動できます"
          >
            <div className="flex items-center gap-1.5">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <Car className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="text-[11px] font-extrabold text-white">走行シミュレーター</span>
            </div>
            <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
              {/* ミニマップトグル */}
              <button
                onClick={() => {
                  setShowDriveMinimap(!showDriveMinimap);
                  triggerUiVisibility();
                }}
                className={`text-[9px] px-2 py-0.5 rounded-md border transition-all cursor-pointer font-bold ${
                  showDriveMinimap 
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' 
                    : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                }`}
                title="ミニマップの表示/非表示を切り替えます"
              >
                マップ{showDriveMinimap ? '隠す' : '表示'}
              </button>
              <button
                onClick={() => {
                  setShowDrivePanel(false);
                  setIsDriving(false);
                }}
                className="text-slate-400 hover:text-rose-400 bg-white/5 hover:bg-white/10 p-1 rounded-md transition-colors text-[9px] px-1.5 font-bold cursor-pointer flex items-center gap-0.5"
              >
                <X className="w-2.5 h-2.5" />
                <span>閉じる</span>
              </button>
            </div>
          </div>

          {/* 🗺️ ミニマップ・アライメント計算 & レイアウトの開始 */}
          {(() => {
            const mapXList = alignment.map(p => p.x);
            const mapYList = alignment.map(p => p.y);
            const mapMinX = mapXList.length > 0 ? Math.min(...mapXList) : 0;
            const mapMaxX = mapXList.length > 0 ? Math.max(...mapXList) : 100;
            const mapMinY = mapYList.length > 0 ? Math.min(...mapYList) : 0;
            const mapMaxY = mapYList.length > 0 ? Math.max(...mapYList) : 100;

            const mapWidthX = mapMaxX - mapMinX || 1;
            const mapHeightY = mapMaxY - mapMinY || 1;

            const minimapSize = 90;
            const minimapPad = 8;
            const minimapScale = Math.min(minimapSize / mapWidthX, minimapSize / mapHeightY);

            const getMinimapX = (x: number) => minimapPad + (x - mapMinX) * minimapScale + (minimapSize - mapWidthX * minimapScale) / 2;
            const getMinimapY = (y: number) => minimapPad + (minimapSize - (y - mapMinY) * minimapScale) - (minimapSize - mapHeightY * minimapScale) / 2;

            const minimapPathStr = alignment.map((p, idx) => {
              const mx = getMinimapX(p.x);
              const my = getMinimapY(p.y);
              return `${idx === 0 ? 'M' : 'L'} ${mx.toFixed(1)} ${my.toFixed(1)}`;
            }).join(' ');

            const currentPt = getInterpolatedAlignmentPoint(driveDistance);
            const trackerX = currentPt ? getMinimapX(currentPt.x) : 0;
            const trackerY = currentPt ? getMinimapY(currentPt.y) : 0;

            const bpPt = alignment[0];
            const epPt = alignment[alignment.length - 1];
            const bpX = bpPt ? getMinimapX(bpPt.x) : 0;
            const bpY = bpPt ? getMinimapY(bpPt.y) : 0;
            const epX = epPt ? getMinimapX(epPt.x) : 0;
            const epY = epPt ? getMinimapY(epPt.y) : 0;

            return (
              <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                {/* 🗺️ 左側：HUD ミニマップ (トグル表示) */}
                {showDriveMinimap && (
                  <div className="w-full sm:w-[110px] h-[110px] sm:h-auto flex shrink-0 items-center justify-center bg-slate-900/85 border border-white/10 rounded-lg overflow-hidden relative select-none">
                    <svg viewBox="0 0 110 110" className="w-full h-full text-white p-1">
                      <g stroke="rgba(255,255,255,0.03)" strokeWidth="0.5">
                        <line x1="27.5" y1="0" x2="27.5" y2="110" />
                        <line x1="55" y1="0" x2="55" y2="110" />
                        <line x1="82.5" y1="0" x2="82.5" y2="110" />
                        <line x1="0" y1="27.5" x2="110" y2="27.5" />
                        <line x1="0" y1="55" x2="110" y2="55" />
                        <line x1="0" y1="82.5" x2="110" y2="82.5" />
                      </g>

                      <path
                        d={minimapPathStr}
                        fill="none"
                        stroke="rgba(0,0,0,0.5)"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={minimapPathStr}
                        fill="none"
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={minimapPathStr}
                        fill="none"
                        stroke="rgba(59, 130, 246, 0.65)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {bpPt && (
                        <g>
                          <circle cx={bpX} cy={bpY} r="2.5" fill="#10b981" stroke="#ffffff" strokeWidth="0.5" />
                          <text x={bpX} y={bpY - 4} fontSize="6" fill="#10b981" fontWeight="extrabold" textAnchor="middle" className="font-sans tracking-tighter select-none drop-shadow-md">BP</text>
                        </g>
                      )}

                      {epPt && (
                        <g>
                          <circle cx={epX} cy={epY} r="2.5" fill="#ef4444" stroke="#ffffff" strokeWidth="0.5" />
                          <text x={epX} y={epY - 4} fontSize="6" fill="#ef4444" fontWeight="extrabold" textAnchor="middle" className="font-sans tracking-tighter select-none drop-shadow-md">EP</text>
                        </g>
                      )}

                      {currentPt && (
                        <g>
                          <circle cx={trackerX} cy={trackerY} r="6" fill="#f59e0b" opacity="0.4">
                            <animate attributeName="r" values="3;8;3" dur="1.6s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.8;0;0.8" dur="1.6s" repeatCount="indefinite" />
                          </circle>
                          <circle cx={trackerX} cy={trackerY} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="0.8" className="drop-shadow-lg" />
                          <circle cx={trackerX} cy={trackerY} r="1" fill="#ffffff" />
                        </g>
                      )}
                    </svg>
                    
                    <span className="absolute bottom-1 right-1 px-1 py-0.2 bg-slate-950/80 border border-white/5 rounded text-[7px] text-slate-400 font-bold tracking-wider uppercase scale-90">
                      MAP
                    </span>
                  </div>
                )}

                {/* ⚙️ 右側：コントロール部 */}
                <div className="flex-1 flex flex-col gap-2">
                  {/* 計器類・ステータス表示 */}
                  <div className="grid grid-cols-3 gap-1.5 text-center select-none">
                    {/* 速度計 */}
                    <div className="bg-slate-900/60 border border-white/5 p-1.5 rounded-lg flex flex-col justify-center">
                      <div className="flex items-center justify-center gap-1 text-[8px] text-slate-400 font-bold uppercase">
                        <Gauge className="w-2.5 h-2.5 text-amber-500" />
                        <span>Speed</span>
                      </div>
                      <div className="text-sm font-extrabold text-white mt-0.5 font-mono">
                        {isDriving ? Math.round(driveSpeed) : 0} <span className="text-[8px] text-slate-400">km/h</span>
                      </div>
                    </div>

                    {/* 進捗・走行距離 */}
                    <div className="bg-slate-900/60 border border-white/5 p-1.5 rounded-lg flex flex-col justify-center">
                      <div className="flex items-center justify-center gap-1 text-[8px] text-slate-400 font-bold uppercase">
                        <Compass className="w-2.5 h-2.5 text-blue-400" />
                        <span>Station</span>
                      </div>
                      <div className="text-[11px] font-extrabold text-blue-400 mt-0.5 font-mono leading-tight">
                        No.{Math.floor(driveDistance / 20)}<br />
                        <span className="text-[8px] text-slate-400">({Math.round(driveDistance)}m)</span>
                      </div>
                    </div>

                    {/* 縦断勾配・平面曲率 */}
                    <div className="bg-slate-900/60 border border-white/5 p-1.5 rounded-lg flex flex-col justify-center">
                      <div className="flex items-center justify-center gap-1 text-[8px] text-slate-400 font-bold uppercase">
                        <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                        <span>Grad / Curv</span>
                      </div>
                      <div className="text-[9px] font-extrabold mt-0.5 font-mono flex flex-col leading-tight">
                        <span className={driveStats.gradient >= 0 ? "text-amber-400" : "text-rose-400"}>
                          i={driveStats.gradient.toFixed(1)}%
                        </span>
                        <span className="text-slate-400 text-[8px]">
                          R={driveStats.curvatureType === 'straight' ? "∞" : Math.abs(Math.round(driveStats.curvatureR))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 走行進捗スライダー ＆ 起点終点ジャンプボタン */}
                  <div className="space-y-1 bg-slate-900/40 p-2 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-300">
                      <span>アライメント位置調整</span>
                      <span className="font-mono text-slate-400">
                        {Math.round(driveDistance)}m / {alignment.length > 0 ? Math.round(alignment[alignment.length - 1].distance) : 0}m
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setDriveDistance(0);
                          triggerUiVisibility();
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/5 text-[8px] font-bold cursor-pointer shrink-0 animate-none"
                        title="始点 (BP) へジャンプします"
                      >
                        BP
                      </button>
                      <input
                        type="range"
                        min="0"
                        max={alignment.length > 0 ? alignment[alignment.length - 1].distance : 0}
                        step="1"
                        value={Math.round(driveDistance)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setDriveDistance(val);
                          const stats = getDriveStatsAtDistance(val);
                          setDriveStats(stats);
                          triggerUiVisibility();
                        }}
                        className="flex-1 accent-amber-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none hover:bg-slate-700 transition-colors"
                      />
                      <button
                        onClick={() => {
                          if (alignment.length > 0) {
                            setDriveDistance(alignment[alignment.length - 1].distance);
                          }
                          triggerUiVisibility();
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/5 text-[8px] font-bold cursor-pointer shrink-0 animate-none"
                        title="終点 (EP) へジャンプします"
                      >
                        EP
                      </button>
                    </div>
                  </div>

                  {/* 速度調整スライダー・コントローラー */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-900/40 p-2 rounded-lg border border-white/5">
                    {/* 再生/一時停止 */}
                    <div className="flex items-center gap-1.5 w-full sm:w-auto justify-center">
                      <button
                        onClick={() => {
                          setIsDriving(!isDriving);
                          triggerUiVisibility();
                        }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                          isDriving
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                        title={isDriving ? "走行を一時停止します" : "走行を開始します"}
                      >
                        {isDriving ? <Pause className="w-4 h-4 stroke-[2.5]" /> : <Play className="w-4 h-4 ml-0.5 stroke-[2.5]" />}
                      </button>

                      <div className="flex flex-col text-left">
                        <span className="text-[8px] text-slate-500 font-extrabold uppercase leading-none">Drive</span>
                        <span className="text-[10px] font-bold text-white leading-tight">
                          {isDriving ? "走行中" : "一時停止"}
                        </span>
                      </div>
                    </div>

                    {/* 速度スライダー */}
                    <div className="flex items-center gap-2 flex-1 w-full">
                      <span className="text-[9px] text-slate-400 font-bold shrink-0">速度:</span>
                      <input
                        type="range"
                        min="10"
                        max="120"
                        step="10"
                        value={driveSpeed}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setDriveSpeed(val);
                          triggerUiVisibility();
                        }}
                        className="flex-1 accent-amber-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                      />
                      <span className="font-mono text-amber-400 font-extrabold text-[10px] min-w-[42px] text-right">
                        {driveSpeed} km/h
                      </span>
                    </div>
                  </div>

                  {/* 進行方向・通行区分・対向車トグルコントロール */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* 進行方向切り替え */}
                    <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded-lg border border-white/5">
                      <span className="text-[9px] text-slate-400 font-bold">自車方向:</span>
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => {
                            setDriveDirection('forward');
                            triggerUiVisibility();
                          }}
                          className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                            driveDirection === 'forward'
                              ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold'
                              : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                          }`}
                          title="始点BPから終点EPへ進みます"
                        >
                          順 (BP➔EP)
                        </button>
                        <button
                          onClick={() => {
                            setDriveDirection('backward');
                            triggerUiVisibility();
                          }}
                          className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                            driveDirection === 'backward'
                              ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold'
                              : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                          }`}
                          title="終点EPから始点BPへ戻ります"
                        >
                          逆 (EP➔BP)
                        </button>
                      </div>
                    </div>

                    {/* 通行区分切り替え (左側/右側通行) */}
                    <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded-lg border border-white/5">
                      <span className="text-[9px] text-slate-400 font-bold">通行区分:</span>
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => {
                            setDriveTrafficSide('left');
                            triggerUiVisibility();
                          }}
                          className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                            driveTrafficSide === 'left'
                              ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold'
                              : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                          }`}
                          title="左側通行（日本国内仕様：デフォルト）に設定します"
                        >
                          左 (LHT)
                        </button>
                        <button
                          onClick={() => {
                            setDriveTrafficSide('right');
                            triggerUiVisibility();
                          }}
                          className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                            driveTrafficSide === 'right'
                              ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold'
                              : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                          }`}
                          title="右側通行（欧米仕様等）に設定します"
                        >
                          右 (RHT)
                        </button>
                      </div>
                    </div>

                    {/* 对向車表示切り替え */}
                    <div className="col-span-2 flex items-center justify-between bg-slate-900/40 p-2 rounded-lg border border-white/5">
                      <span className="text-[9px] text-slate-400 font-bold">対向車（交通流シミュレーション）:</span>
                      <button
                        onClick={() => {
                          setShowOncomingTraffic(!showOncomingTraffic);
                          triggerUiVisibility();
                        }}
                        className={`px-3 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                          showOncomingTraffic
                            ? 'bg-teal-500 border-teal-400 text-slate-950 font-extrabold'
                            : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                        }`}
                        title="対向車の表示/非表示を切り替えます"
                      >
                        {showOncomingTraffic ? 'ON (表示中)' : 'OFF (非表示)'}
                      </button>
                    </div>
                  </div>

                  {/* 走行設定 (再生速度 ＆ カメラ追従) */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* 再生速度選択 */}
                    <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded-lg border border-white/5">
                      <span className="text-[9px] text-slate-400 font-bold">再生速度:</span>
                      <div className="flex gap-0.5">
                        {[0.5, 1.0, 2.0, 5.0].map((ts) => (
                          <button
                            key={ts}
                            onClick={() => {
                              setDriveTimeScale(ts);
                              triggerUiVisibility();
                            }}
                            className={`px-1 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                              driveTimeScale === ts
                                ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold'
                                : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                            }`}
                          >
                            {ts}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* カメラモード選択 */}
                    <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded-lg border border-white/5">
                      <span className="text-[9px] text-slate-400 font-bold">視点:</span>
                      <div className="flex gap-0.5">
                        {[
                          { id: 'driver', label: '車内' },
                          { id: 'birdseye', label: '鳥瞰' },
                          { id: 'diagonal', label: '斜め' },
                          { id: 'free', label: 'ﾌﾘｰ' },
                        ].map((mode) => (
                          <button
                            key={mode.id}
                            onClick={() => {
                              setDriveCameraMode(mode.id as any);
                              triggerUiVisibility();
                            }}
                            className={`px-1 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                              driveCameraMode === mode.id
                                ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold'
                                : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ジャイロ・AR連動 */}
                    <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded-lg border border-white/5 select-none">
                      <div className="flex flex-col text-left">
                        <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                          <Compass className={`w-2.5 h-2.5 text-amber-500 ${gyroEnabled ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
                          AR・ジャイロ連動
                        </span>
                        <span className="text-[7px] text-slate-500 leading-tight">スマホを傾けて車内を見回す</span>
                      </div>
                      <div className="flex gap-1">
                        {gyroEnabled && (
                          <button
                            onClick={() => {
                              gyroOffsetRef.current = {
                                alpha: gyroAlphaRef.current || 0,
                                beta: gyroBetaRef.current || 0,
                                gamma: gyroGammaRef.current || 0
                              };
                            }}
                            className="px-1 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border border-teal-500/30 text-teal-400 hover:text-white bg-teal-950/40"
                            title="現在の向きを正面にリセットします"
                          >
                            補正
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!gyroEnabled) {
                              const granted = await requestGyroPermission();
                              if (granted) {
                                setGyroEnabled(true);
                                // 自動的に車内視点に変更してあげる親切設計
                                setDriveCameraMode('driver');
                              } else {
                                alert("ジャイロセンサーのアクセスが拒否されたか、非対応デバイスです。iOSの場合はSafari設定等で動作と向きのアクセスを許可してください。");
                              }
                            } else {
                              setGyroEnabled(false);
                            }
                            triggerUiVisibility();
                          }}
                          className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                            gyroEnabled
                              ? 'bg-amber-500 border-amber-400 text-slate-950 font-extrabold'
                              : 'border-white/5 text-slate-400 hover:text-white bg-slate-950/60'
                          }`}
                        >
                          {gyroEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 走行ログ記録コントロール */}
                  <div className="flex items-center justify-between bg-slate-900/40 p-1.5 rounded-lg border border-white/5 gap-2 select-none text-[9px]">
                    <div className="flex flex-col text-left">
                      <span className="text-[8px] text-slate-500 font-extrabold uppercase flex items-center gap-0.5 leading-none">
                        <Database className="w-2 h-2 text-blue-400" />
                        <span>Log</span>
                      </span>
                      <span className="text-[9px] font-bold text-white flex items-center gap-1 mt-0.5">
                        {isRecording ? (
                          <span className="flex items-center gap-0.5 text-rose-400">
                            <span className="w-1 h-1 bg-rose-500 rounded-full animate-pulse"></span>
                            記録中
                          </span>
                        ) : (
                          <span className="text-slate-400">停止中</span>
                        )}
                        <span className="font-mono bg-slate-950 px-1 py-0.2 rounded text-[8px] text-blue-400 font-extrabold border border-white/5">
                          {logCount} pts
                        </span>
                      </span>
                    </div>

                    <div className="flex gap-1">
                      {/* 記録開始/一時停止 */}
                      <button
                        onClick={() => {
                          setIsRecording(!isRecording);
                          triggerUiVisibility();
                        }}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border flex items-center gap-0.5 ${
                          isRecording
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                      >
                        <Circle className={`w-1.5 h-1.5 ${isRecording ? 'fill-rose-500 text-rose-500' : 'fill-emerald-500 text-emerald-500'}`} />
                        <span>{isRecording ? '一時停止' : '記録'}</span>
                      </button>

                      {/* ログをクリア */}
                      <button
                        onClick={() => {
                          if (confirm('記録された走行ログをリセットしますか？')) {
                            driveLogRef.current = [];
                            setLogCount(0);
                            setIsRecording(false);
                          }
                          triggerUiVisibility();
                        }}
                        disabled={logCount === 0}
                        className="px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border border-white/5 text-slate-400 hover:text-white bg-slate-950/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
                      >
                        <Trash2 className="w-2 h-2" />
                        <span>消去</span>
                      </button>

                      {/* JSONエクスポート */}
                      <button
                        onClick={() => {
                          if (driveLogRef.current.length === 0) return;
                          
                          const alignmentMeta = alignment.length > 0 ? {
                            start: alignment[0],
                            end: alignment[alignment.length - 1],
                            totalLength: alignment[alignment.length - 1].distance
                          } : null;
                          
                          const exportObj = {
                            appName: "Grill-me Align Road Simulation Log",
                            exportedAt: new Date().toISOString(),
                            metadata: {
                              totalPoints: driveLogRef.current.length,
                              alignmentSummary: alignmentMeta,
                            },
                            logs: driveLogRef.current
                          };

                          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
                          const downloadAnchor = document.createElement('a');
                          downloadAnchor.setAttribute("href", dataStr);
                          downloadAnchor.setAttribute("download", `road_driving_log_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
                          document.body.appendChild(downloadAnchor);
                          downloadAnchor.click();
                          downloadAnchor.remove();
                          triggerUiVisibility();
                        }}
                        disabled={logCount === 0}
                        className="px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border border-amber-500/40 text-amber-400 hover:text-amber-300 bg-amber-500/10 disabled:opacity-40 disabled:border-white/5 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center gap-0.5"
                      >
                        <Download className="w-2 h-2" />
                        <span>JSON</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ==================== 🌧️ 雨水排水シミュレータ専用操作HUDパネル ==================== */}
      {showDrainageSimulation && (
        <div
          onMouseEnter={() => {
            isHoveringUiRef.current = true;
            triggerUiVisibility();
          }}
          onMouseLeave={() => {
            isHoveringUiRef.current = false;
            triggerUiVisibility();
          }}
          style={{ transform: `translate(${drainagePanelPos.x}px, ${drainagePanelPos.y}px)` }}
          className={`absolute bottom-4 left-4 z-20 w-[350px] bg-slate-950/95 backdrop-blur-md border border-blue-500/40 p-3 rounded-xl shadow-[0_0_30px_rgba(30,144,255,0.25)] transition-opacity duration-500 transform flex flex-col gap-2 ${
            isUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* ドラッグ用ヘッダー */}
          <div 
            onMouseDown={(e) => startUiDrag(e, drainagePanelPos, setDrainagePanelPos, '3d_drainagePanelPos')}
            onTouchStart={(e) => startUiDrag(e, drainagePanelPos, setDrainagePanelPos, '3d_drainagePanelPos')}
            className="flex items-center justify-between cursor-move select-none border-b border-white/10 pb-2 text-slate-300"
          >
            <div className="flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-blue-400 animate-pulse" />
              <span className="font-extrabold text-white text-[11px] tracking-wide">雨水流路＆側溝・集水桝排水</span>
            </div>
            <div className="flex items-center gap-1">
              {/* シミュレーション一時停止/再開ボタン */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDrainageSimulating(!isDrainageSimulating);
                  triggerUiVisibility();
                }}
                className={`p-1 rounded text-[9px] font-bold transition-all cursor-pointer border ${
                  isDrainageSimulating
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30'
                    : 'bg-slate-900 border-white/5 text-slate-500 hover:text-white'
                }`}
                title={isDrainageSimulating ? "粒子流動を一時停止します" : "粒子流動を再開します"}
              >
                {isDrainageSimulating ? <Pause className="w-2.5 h-2.5 inline mr-1" /> : <Play className="w-2.5 h-2.5 inline mr-1" />}
                {isDrainageSimulating ? 'SIMULATING' : 'PAUSED'}
              </button>
              {/* クローズボタン */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDrainageSimulation(false);
                  triggerUiVisibility();
                }}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white cursor-pointer ml-1"
                title="シミュレータを終了します"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* サブタブ切り替え */}
          <div className="grid grid-cols-3 gap-0.5 bg-slate-900 p-0.5 rounded-lg border border-white/5">
            <button
              onClick={() => {
                setDrainageSubTab('inlets');
                triggerUiVisibility();
              }}
              className={`py-1 text-[9px] font-extrabold rounded-md cursor-pointer transition-all flex flex-col items-center justify-center ${
                drainageSubTab === 'inlets'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Droplets className="w-3 h-3 mb-0.5" />
              集水桝排水
            </button>
            <button
              onClick={() => {
                setDrainageSubTab('gutters');
                triggerUiVisibility();
              }}
              className={`py-1 text-[9px] font-extrabold rounded-md cursor-pointer transition-all flex flex-col items-center justify-center ${
                drainageSubTab === 'gutters'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3 h-3 mb-0.5" />
              側溝通水検証
            </button>
            <button
              onClick={() => {
                setDrainageSubTab('sags');
                triggerUiVisibility();
              }}
              className={`py-1 text-[9px] font-extrabold rounded-md cursor-pointer transition-all flex flex-col items-center justify-center ${
                drainageSubTab === 'sags'
                  ? 'bg-rose-700 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3 h-3 mb-0.5" />
              サグ凹部({detectedSags.length})
            </button>
          </div>

          {/* サブタブ別コンテンツ */}
          {drainageSubTab === 'inlets' ? (
            <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-0.5 custom-scrollbar">
              {/* 表示モデルトグル */}
              <div className="flex items-center justify-between gap-2 bg-slate-900/40 p-1.5 rounded-lg border border-white/5">
                <span className="text-[9px] text-slate-400 font-bold">3D構造物表示:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setShowGutterModel(!showGutterModel);
                      triggerUiVisibility();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                      showGutterModel
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'border-white/5 text-slate-500 bg-slate-950/60'
                    }`}
                  >
                    L型街渠 (側溝)
                  </button>
                  <button
                    onClick={() => {
                      setShowInletModel(!showInletModel);
                      triggerUiVisibility();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold transition-all cursor-pointer border ${
                      showInletModel
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'border-white/5 text-slate-500 bg-slate-950/60'
                    }`}
                  >
                    集水桝 (スチール蓋)
                  </button>
                </div>
              </div>

              {/* 降雨強度スライダー */}
              <div className="bg-slate-900/40 p-2 rounded-lg border border-white/5 space-y-1">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-400 font-bold">設計降雨強度 (I):</span>
                  <span className="font-mono text-blue-400 font-extrabold">
                    {rainfallIntensity} mm/h
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="150"
                  step="10"
                  value={rainfallIntensity}
                  onChange={(e) => {
                    setRainfallIntensity(Number(e.target.value));
                    triggerUiVisibility();
                  }}
                  className="w-full accent-blue-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[7px] font-bold text-slate-500 leading-none">
                  <span>10 (小雨)</span>
                  <span className={rainfallIntensity >= 30 ? "text-amber-500" : ""}>30 (激しい)</span>
                  <span className={rainfallIntensity >= 50 ? "text-orange-500" : ""}>50 (非常に激しい)</span>
                  <span className={rainfallIntensity >= 80 ? "text-rose-500 animate-pulse" : ""}>80+ (土砂災害級)</span>
                </div>
              </div>

              {/* ゴミ詰まり率スライダー */}
              <div className="bg-slate-900/40 p-2 rounded-lg border border-white/5 space-y-1">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-400 font-bold">集水桝ゴミ閉塞・詰まり率:</span>
                  <span className={`font-mono font-extrabold ${cloggingFactor >= 50 ? "text-rose-400" : "text-amber-400"}`}>
                    {cloggingFactor} %
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={cloggingFactor}
                  onChange={(e) => {
                    setCloggingFactor(Number(e.target.value));
                    triggerUiVisibility();
                  }}
                  className="w-full accent-amber-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[7px] font-bold text-slate-500 leading-none">
                  <span>0% (完全清掃)</span>
                  <span>30% (砂塵蓄積)</span>
                  <span className={cloggingFactor >= 60 ? "text-rose-500 animate-pulse" : ""}>70%+ (豪雨閉塞危険)</span>
                </div>
              </div>

              {/* 吸込能力基準設定パネル */}
              <div className="bg-slate-900/40 p-2 rounded-lg border border-white/5 space-y-1.5">
                <div className="text-[9px] text-slate-300 font-bold flex items-center gap-1 border-b border-white/5 pb-1 select-none">
                  <Settings className="w-2.5 h-2.5 text-cyan-400" />
                  <span>桝吸込基準能力設定 (Q_base)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400">
                      <span>通常部桝:</span>
                      <span className="font-mono text-cyan-400 font-extrabold">{qBaseNormal.toFixed(1)} L/s</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      value={qBaseNormal}
                      onChange={(e) => {
                        setQBaseNormal(Number(e.target.value));
                        triggerUiVisibility();
                      }}
                      className="w-full accent-cyan-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400">
                      <span>サグ凹部桝:</span>
                      <span className="font-mono text-rose-400 font-extrabold">{qBaseSag.toFixed(1)} L/s</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="15.0"
                      step="0.5"
                      value={qBaseSag}
                      onChange={(e) => {
                        setQBaseSag(Number(e.target.value));
                        triggerUiVisibility();
                      }}
                      className="w-full accent-rose-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                    />
                  </div>
                </div>
              </div>

              {/* パフォーマンス＆工学セーフティガードインジケーター */}
              <div className="flex items-center justify-between bg-blue-950/20 border border-blue-500/20 p-1.5 rounded-lg text-[8px] text-blue-400 leading-tight">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  <span>VRAM 4GB & LOD安全保護ガード: ACTIVE</span>
                </div>
                {performanceMode === 'eco' ? (
                  <span className="text-emerald-400 font-bold uppercase tracking-wider">ECOモード (側溝50%間引き)</span>
                ) : (
                  <span className="text-blue-300 font-bold uppercase tracking-wider">標準密度</span>
                )}
              </div>

              {/* 集水桝一覧リスト */}
              <div className="space-y-1.5">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 flex justify-between">
                  <span>排水管集水桝リスト (水理計算)</span>
                  <span className="text-[8px] text-slate-500">
                    溢水: <span className="text-rose-400 font-bold">{inletsData.filter(i => i.isOverflow).length}</span> / {inletsData.length}
                  </span>
                </div>
                
                {inletsData.length === 0 ? (
                  <div className="text-center py-4 text-[10px] text-slate-500 border border-dashed border-white/5 rounded-lg select-none">
                    集水桝モデルが配置されていません（表示トグルをONにしてください）
                  </div>
                ) : (
                  inletsData.map((inlet, idx) => {
                    const ratio = inlet.qIn / Math.max(0.001, inlet.qCap);
                    const isDanger = inlet.isOverflow;
                    const isWarning = !isDanger && ratio > 0.70;

                    return (
                      <div 
                        key={inlet.id} 
                        className={`p-2 rounded-lg border text-[10px] flex items-center justify-between transition-all ${
                          isDanger 
                            ? 'bg-rose-950/40 border-rose-500/30 text-rose-200 shadow-[0_0_8px_rgba(239,68,68,0.1)]' 
                            : isWarning
                            ? 'bg-amber-950/30 border-amber-500/20 text-amber-200 shadow-[0_0_6px_rgba(230,180,10,0.05)]'
                            : 'bg-slate-900/60 border-white/5 text-slate-300'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isDanger ? 'bg-rose-500 animate-pulse' : isWarning ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}></span>
                            <span className="font-extrabold">{inlet.stationName} ({inlet.side})</span>
                            {inlet.isSag && (
                              <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1 py-0.2 rounded text-[7px] font-black uppercase">SAG</span>
                            )}
                          </div>
                          <div className="text-[9px] text-slate-400 flex flex-wrap gap-x-2">
                            <span>流入: <span className="font-mono font-bold text-white">{inlet.qIn.toFixed(2)} L/s</span></span>
                            <span>吸込限: <span className="font-mono font-bold text-white">{inlet.qCap.toFixed(2)} L/s</span></span>
                          </div>
                          {/* 個別吸込能力調整スライダー */}
                          <div 
                            onMouseDown={(e) => e.stopPropagation()} 
                            onTouchStart={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-[8px] text-slate-400 bg-black/40 px-1.5 py-1 rounded border border-white/5 mt-1"
                          >
                            <span className="font-bold whitespace-nowrap text-slate-300">吸込限界:</span>
                            <input
                              type="range"
                              min="0.5"
                              max="15.0"
                              step="0.5"
                              value={inletOverrides[inlet.id] !== undefined ? inletOverrides[inlet.id] : (inlet.isSag ? qBaseSag : qBaseNormal)}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setInletOverrides(prev => ({
                                  ...prev,
                                  [inlet.id]: val
                                }));
                                triggerUiVisibility();
                              }}
                              className="w-[70px] accent-cyan-400 h-1 cursor-pointer bg-slate-800 rounded appearance-none"
                            />
                            <span className="font-mono font-bold text-cyan-400 min-w-[28px]">
                              {(inletOverrides[inlet.id] !== undefined ? inletOverrides[inlet.id] : (inlet.isSag ? qBaseSag : qBaseNormal)).toFixed(1)}
                            </span>
                            {inletOverrides[inlet.id] !== undefined && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInletOverrides(prev => {
                                    const next = { ...prev };
                                    delete next[inlet.id];
                                    return next;
                                  });
                                  triggerUiVisibility();
                                }}
                                className="text-slate-500 hover:text-rose-400 transition-colors ml-1 p-0.5 cursor-pointer bg-slate-950 rounded"
                                title="個別設定をリセットし全体基準に戻します"
                              >
                                <X className="w-2 h-2" />
                              </button>
                            )}
                          </div>
                          <div className="text-[8px] text-slate-500 mt-1">
                            {isDanger ? (
                              <span className="text-rose-400 font-extrabold">⚠️ 側溝溢水 (溢水率 +{(inlet.overflowRate * 100).toFixed(0)}%)</span>
                            ) : isWarning ? (
                              <span className="text-amber-400 font-bold">⚠️ 吸込限界逼迫 (容量比 {(ratio * 100).toFixed(0)}%)</span>
                            ) : (
                              <span className="text-emerald-400 font-bold">✓ 排水計画良好</span>
                            )}
                          </div>
                        </div>
                        
                        {/* 視点ジャンプ */}
                        <button
                          onClick={() => {
                            cameraTarget.current = { x: inlet.position.x, y: inlet.position.y + 2, z: inlet.position.z };
                            triggerUiVisibility();
                          }}
                          className={`px-1.5 py-1 rounded text-[8px] font-extrabold transition-all cursor-pointer border flex items-center gap-0.5 ${
                            isDanger
                              ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500'
                              : isWarning
                              ? 'bg-amber-600 border-amber-500 text-white hover:bg-amber-500'
                              : 'bg-slate-800 border-white/10 text-slate-300 hover:text-white'
                          }`}
                          title="この集水桝の位置へカメラ視点を移動します"
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>ジャンプ</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : drainageSubTab === 'gutters' ? (
            <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-0.5 custom-scrollbar">
              <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/40 p-2 rounded-lg border border-white/5">
                マニング公式（<span className="font-mono text-amber-400 font-bold">Q = A·v</span>）に基づく側溝排水検証。縦断勾配が緩すぎると排水能力が低下し溢水リスクが高まります。3Dビューで危険箇所をハイライトします。
              </div>

              {/* 側溝危険度統計 */}
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="bg-slate-900/60 border border-emerald-500/10 p-1 rounded">
                  <div className="text-[7px] text-slate-500 font-bold uppercase">安全区間</div>
                  <div className="text-xs font-extrabold text-emerald-400 font-mono mt-0.5">
                    {guttersData.filter(g => g.riskLevel === 'safe').length} <span className="text-[7px] text-slate-500">区間</span>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-amber-500/10 p-1 rounded">
                  <div className="text-[7px] text-slate-500 font-bold uppercase">警戒区間</div>
                  <div className="text-xs font-extrabold text-amber-400 font-mono mt-0.5">
                    {guttersData.filter(g => g.riskLevel === 'warning').length} <span className="text-[7px] text-slate-500">区間</span>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-rose-500/10 p-1 rounded">
                  <div className="text-[7px] text-slate-500 font-bold uppercase">溢れ出し危険</div>
                  <div className="text-xs font-extrabold text-rose-400 font-mono mt-0.5">
                    {guttersData.filter(g => g.riskLevel === 'danger').length} <span className="text-[7px] text-slate-500">区間</span>
                  </div>
                </div>
              </div>

              {/* 側溝一覧リスト */}
              <div className="space-y-1.5">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 flex justify-between">
                  <span>側溝溢水危険度 (マニング検証)</span>
                  <span className="text-[8px] text-slate-500">
                    危険: <span className="text-rose-400 font-bold">{guttersData.filter(g => g.riskLevel === 'danger').length}</span> / {guttersData.length}
                  </span>
                </div>
                
                {guttersData.length === 0 ? (
                  <div className="text-center py-4 text-[10px] text-slate-500 border border-dashed border-white/5 rounded-lg select-none">
                    側溝データがありません（表示トグルをONにしてください）
                  </div>
                ) : (
                  guttersData.map((gutter) => {
                    const isDanger = gutter.riskLevel === 'danger';
                    const isWarning = gutter.riskLevel === 'warning';
                    
                    return (
                      <div 
                        key={gutter.id} 
                        className={`p-2 rounded-lg border text-[10px] flex items-center justify-between transition-all ${
                          isDanger 
                            ? 'bg-rose-950/40 border-rose-500/30 text-rose-200 shadow-[0_0_8px_rgba(239,68,68,0.1)]' 
                            : isWarning
                            ? 'bg-amber-950/30 border-amber-500/20 text-amber-200'
                            : 'bg-slate-900/60 border-white/5 text-slate-300'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isDanger ? 'bg-rose-500 animate-pulse' : isWarning ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}></span>
                            <span className="font-extrabold">{gutter.side} No.{Math.floor(gutter.startDist / 20)} 付近</span>
                            <span className="text-[8px] text-slate-400 font-mono">({gutter.startDist.toFixed(0)}m〜{gutter.endDist.toFixed(0)}m)</span>
                          </div>
                          <div className="text-[9px] text-slate-400 flex flex-wrap gap-x-2">
                            <span>勾配: <span className="font-mono font-bold text-white">{gutter.slope.toFixed(2)}%</span></span>
                            <span>流入: <span className="font-mono font-bold text-white">{gutter.runoff.toFixed(2)} L/s</span></span>
                            <span>許容: <span className="font-mono font-bold text-white">{gutter.capacity.toFixed(2)} L/s</span></span>
                          </div>
                          <div className="text-[8px] flex items-center gap-2">
                            <span>水深: <span className="font-mono text-slate-300 font-bold">{gutter.waterDepth.toFixed(1)} cm</span></span>
                            {isDanger ? (
                              <span className="text-rose-400 font-extrabold">⚠️ 側溝溢れ出し危険</span>
                            ) : isWarning ? (
                              <span className="text-amber-400 font-bold">⚠️ 水位警戒 (容量逼迫)</span>
                            ) : (
                              <span className="text-emerald-400 font-bold">✓ 流通良好</span>
                            )}
                          </div>
                        </div>
                        
                        {/* 視点ジャンプ */}
                        <button
                          onClick={() => {
                            const midPos = gutter.positions[0].clone().add(gutter.positions[1]).multiplyScalar(0.5);
                            cameraTarget.current = { x: midPos.x, y: midPos.y + 3, z: midPos.z };
                            triggerUiVisibility();
                          }}
                          className={`px-1.5 py-1 rounded text-[8px] font-extrabold transition-all cursor-pointer border flex items-center gap-0.5 ${
                            isDanger
                              ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500'
                              : isWarning
                              ? 'bg-amber-600 border-amber-500 text-white hover:bg-amber-500'
                              : 'bg-slate-800 border-white/10 text-slate-300 hover:text-white'
                          }`}
                          title="この側溝区間へカメラ視点を移動します"
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>ジャンプ</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-0.5 custom-scrollbar">
              {/* シミュレータ解説＆最急降下法インジケータ */}
              <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/40 p-2 rounded-lg border border-white/5">
                最急降下法（<span className="font-mono text-blue-400 font-bold">v = -∇H</span>）を用い、道路中心線および横断面の標高勾配から流路ベクトルを算出し、雨水の排水シミュレーションを3Dで可視化しています。
              </div>

              {/* 計器類・ステータス表示 */}
              <div className="grid grid-cols-2 gap-2 text-center">
                {/* 粒子数 */}
                <div className="bg-slate-900/60 border border-white/5 p-1.5 rounded-lg">
                  <div className="text-[8px] text-slate-500 font-bold uppercase">Rain Particles</div>
                  <div className="text-sm font-extrabold text-blue-400 mt-0.5 font-mono">
                    {isDrainageSimulating ? '250' : '0'} <span className="text-[8px] text-slate-400">pts</span>
                  </div>
                </div>

                {/* サグ（凹部）検知数 */}
                <div className={`bg-slate-900/60 border p-1.5 rounded-lg transition-colors ${
                  detectedSags.length > 0 ? 'border-rose-500/30 bg-rose-500/5' : 'border-white/5'
                }`}>
                  <div className="text-[8px] text-slate-500 font-bold uppercase">Detected Sags</div>
                  <div className={`text-sm font-extrabold mt-0.5 font-mono flex items-center justify-center gap-1 ${
                    detectedSags.length > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-400'
                  }`}>
                    {detectedSags.length > 0 && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>}
                    {detectedSags.length} <span className="text-[8px] text-slate-400">箇所</span>
                  </div>
                </div>
              </div>

              {/* サグ（凹部）詳細リスト */}
              <div className="space-y-1.5">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  サグ（縦断凹部）警告一覧
                </div>
                
                {detectedSags.length === 0 ? (
                  <div className="text-center py-4 text-[10px] text-slate-500 border border-dashed border-white/5 rounded-lg select-none">
                    道路中心線上における凹部（サグ）は検出されませんでした。縦断排水計画は良好です。
                  </div>
                ) : (
                  detectedSags.map((sag, sIdx) => (
                    <div 
                      key={sIdx} 
                      className={`p-2 rounded-lg border text-[10px] flex items-center justify-between transition-all ${
                        sag.risk === 'high' 
                          ? 'bg-rose-950/40 border-rose-500/30 text-rose-200' 
                          : 'bg-amber-950/30 border-amber-500/20 text-amber-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${sag.risk === 'high' ? 'bg-rose-500 animate-ping' : 'bg-amber-400'}`}></span>
                          <span className="font-extrabold">測点: No.{Math.floor(sag.stationDist / 20)}</span>
                          <span className="text-[8px] text-slate-400 font-mono">({sag.stationDist.toFixed(1)}m)</span>
                        </div>
                        <div className="text-[9px] text-slate-400">
                          凹部深さ: <span className="font-mono font-bold text-white">{sag.depth.toFixed(3)}m</span>
                          {sag.risk === 'high' ? (
                            <span className="text-rose-400 font-bold ml-1.5 uppercase tracking-wide">⚠️ 水没危険 (High)</span>
                          ) : (
                            <span className="text-amber-400 font-bold ml-1.5 uppercase tracking-wide">⚠️ 冠水注意 (Med)</span>
                          )}
                        </div>
                      </div>
                      
                      {/* 視点ジャンプ */}
                      <button
                        onClick={() => {
                          cameraTarget.current = { x: sag.position.x, y: sag.position.y, z: sag.position.z };
                          triggerUiVisibility();
                        }}
                        className={`px-1.5 py-1 rounded text-[8px] font-extrabold transition-all cursor-pointer border flex items-center gap-0.5 ${
                          sag.risk === 'high'
                            ? 'bg-rose-500 border-rose-400 text-white hover:bg-rose-400'
                            : 'bg-amber-500 border-amber-400 text-slate-950 hover:bg-amber-400'
                        }`}
                        title="このサグの位置へカメラ視点を瞬時に移動します"
                      >
                        <Eye className="w-2.5 h-2.5" />
                        <span>ジャンプ</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
