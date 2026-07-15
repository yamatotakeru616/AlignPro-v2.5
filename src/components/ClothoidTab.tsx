/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Sliders, Activity, Info, Table, Copy, Download, Compass, RefreshCw, Layers } from 'lucide-react';
import { calculateClothoidParams, sampleClothoid, getClothoidPoint } from '../utils/clothoid';
import { ClothoidPoint } from '../types';

export function ClothoidTab() {
  // --- 状態管理 ---
  const [A, setA] = useState<number>(100);
  const [R, setR] = useState<number>(120);
  const [L, setL] = useState<number>(83.33); // A^2 = R*L (100^2 = 120 * 83.33)
  
  // 計算入力トリガーモード ('A_R' = AとRからLを計算, 'R_L' = RとLからAを計算, 'A_L' = AとLからRを計算)
  const [calcMode, setCalcMode] = useState<'A_R' | 'R_L' | 'A_L'>('A_R');
  
  // 始点(KA)のグローバル設定
  const [kaX, setKaX] = useState<number>(0);
  const [kaY, setKaY] = useState<number>(0);
  const [kaAngle, setKaAngle] = useState<number>(0); // 始点接線方向角 (度)
  const [isLeftTurn, setIsLeftTurn] = useState<boolean>(true); // 回転方向

  // インタラクティブホバー位置の弧長 s
  const [hoverS, setHoverS] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // コピー＆CSV出力状態
  const [copied, setCopied] = useState<boolean>(false);
  const [csvCopied, setCsvCopied] = useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // --- 動的なパラメータ連動計算 ---
  const params = useMemo(() => {
    let calculatedA = A;
    let calculatedR = R;
    let calculatedL = L;

    if (calcMode === 'A_R') {
      // L = A^2 / R
      calculatedL = R > 0 ? (A * A) / R : 0;
    } else if (calcMode === 'R_L') {
      // A = sqrt(R * L)
      calculatedA = Math.sqrt(R * L);
    } else if (calcMode === 'A_L') {
      // R = A^2 / L
      calculatedR = L > 0 ? (A * A) / L : Infinity;
    }

    return calculateClothoidParams(calculatedA, calculatedR, calculatedL);
  }, [A, R, L, calcMode]);

  // 同期してUI側のStateをアップデート（無限ループ防止のため必要時のみ）
  useEffect(() => {
    if (calcMode === 'A_R') {
      setL(parseFloat(params.L.toFixed(2)));
    } else if (calcMode === 'R_L') {
      setA(parseFloat(params.A.toFixed(2)));
    } else if (calcMode === 'A_L') {
      setR(parseFloat(params.R.toFixed(2)));
    }
  }, [params.A, params.R, params.L, calcMode]);

  // サンプリング点群の生成 (視覚描画およびテーブル用、多めに100点)
  const sampledPoints = useMemo(() => {
    if (params.A <= 0 || params.L <= 0) return [];
    return sampleClothoid(params.A, params.L, 80);
  }, [params.A, params.L]);

  // --- ホバーされた点でのクロソイド幾何状態 ---
  const activeS = hoverS !== null ? hoverS : params.L;
  const activePoint = useMemo(() => {
    return getClothoidPoint(activeS, params.A);
  }, [activeS, params.A]);

  // --- SVG幾何ビューにおけるスケーリングと描画座標計算 ---
  const { pathD, circleCenter, circleRadius, circlePath, boundingBox } = useMemo(() => {
    if (sampledPoints.length === 0) {
      return { pathD: '', circleCenter: { x: 0, y: 0 }, circleRadius: 0, circlePath: '', boundingBox: { minX: 0, maxX: 100, minY: -50, maxY: 50 } };
    }

    // 終端KE以降に、接続円曲線を少し延長して描画するためのデータ
    const circlePoints: { x: number; y: number }[] = [];
    const R_val = params.R;
    const tau = params.tau;
    const xm = params.xm;
    const deltaR = params.deltaR;

    // 接続円の中心： 局所座標系において、
    // X = xm = x0 - R * sin(tau)
    // Y = R + deltaR = y0 + R * cos(tau) (左折基準)
    const cy = R_val + deltaR;
    const cx = xm;

    // 局所クロソイドのKE終点 (x0, y0)
    // 円の円弧を描画
    const startAngle = -Math.PI / 2; // 原点から見て下方向（R方向）
    const endAngle = startAngle + tau; // KEでの角は tau
    
    // 円曲線をさらに30度(約0.52rad)延長して描画する
    const extAngle = tau + 0.6;
    const segments = 30;
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (extAngle * i) / segments;
      const ex = cx + R_val * Math.cos(angle);
      const ey = cy + R_val * Math.sin(angle);
      circlePoints.push({ x: ex, y: ey });
    }

    // すべての点を包含するバウンディングボックスを計算 (余白付き)
    const allPoints = [...sampledPoints, ...circlePoints, { x: cx, y: cy }, { x: cx, y: 0 }];
    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);

    const minX = Math.min(...xs, 0) - 10;
    const maxX = Math.max(...xs, 50) + 15;
    const minY = Math.min(...ys, 0) - 15;
    const maxY = Math.max(...ys, 50) + 15;

    // SVGパスDの構築
    // 1. クロソイド曲線
    let d = `M 0,0`;
    sampledPoints.forEach((p, idx) => {
      if (idx > 0) d += ` L ${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    });

    // 2. 接続円の延長曲線
    let cD = '';
    if (circlePoints.length > 0) {
      cD = `M ${circlePoints[0].x.toFixed(3)},${circlePoints[0].y.toFixed(3)}`;
      for (let i = 1; i < circlePoints.length; i++) {
        cD += ` L ${circlePoints[i].x.toFixed(3)},${circlePoints[i].y.toFixed(3)}`;
      }
    }

    // ホバーされた点での接触円（Osculating Circle: 曲率円）の幾何情報
    let oscRadius = Infinity;
    let oscCenter = { x: 0, y: 0 };
    let oscPath = '';

    if (activePoint.s > 0.1 && activePoint.radius < 5000) {
      oscRadius = activePoint.radius;
      // 局所座標系での接触円の中心
      // 法線方向（X軸正方向の接線から、左方向に90度回転した向き）
      // 接線角 theta に対し、左法線は ( -sin(theta), cos(theta) )
      const nx = -Math.sin(activePoint.theta);
      const ny = Math.cos(activePoint.theta);

      oscCenter = {
        x: activePoint.x + oscRadius * nx,
        y: activePoint.y + oscRadius * ny
      };
    }

    return {
      pathD: d,
      circleCenter: oscCenter,
      circleRadius: oscRadius,
      circlePath: cD,
      boundingBox: { minX, maxX, minY, maxY }
    };
  }, [sampledPoints, params, activePoint]);

  // --- SVG上のマウスホバーから 弧長s へのマッピング ---
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current || sampledPoints.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // SVGのビューボックス座標系への変換
    const viewWidth = boundingBox.maxX - boundingBox.minX;
    const viewHeight = boundingBox.maxY - boundingBox.minY;

    // SVG内での座標（アスペクト比保持を想定）
    // 通常のSVG座標はYが下向き、我々の土木幾何（ローカル）はYが上向きとして計算しているため、反転投影
    const svgX = boundingBox.minX + (clientX / rect.width) * viewWidth;
    const svgY = boundingBox.maxY - (clientY / rect.height) * viewHeight;

    // 最も近いサンプリング点を探す
    let closestPt = sampledPoints[0];
    let minDist = Infinity;

    sampledPoints.forEach(p => {
      const dx = p.x - svgX;
      const dy = p.y - svgY;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        closestPt = p;
      }
    });

    // 曲線からある程度近いときのみホバー情報をアクティブにする (30mの二乗未満)
    if (minDist < 900) {
      setHoverS(closestPt.s);
      setIsHovering(true);
    } else {
      setIsHovering(false);
    }
  };

  const handleSvgMouseLeave = () => {
    setIsHovering(false);
    setHoverS(null);
  };

  // --- コピー＆ダウンロード支援機能 ---
  const handleCopyParams = () => {
    const text = `=== クロソイド緩和曲線設計パラメータ ===
クロソイドパラメータ A : ${params.A.toFixed(4)}
接続円曲線半径 R      : ${params.R.toFixed(4)} m
緩和曲線長 L          : ${params.L.toFixed(4)} m
終点接線偏角 tau      : ${params.tau.toFixed(6)} rad (${(params.tau * 180 / Math.PI).toFixed(4)}°)
終点座標 (x0, y0)     : (${params.x0.toFixed(4)}, ${params.y0.toFixed(4)})
シフト量 deltaR       : ${params.deltaR.toFixed(4)} m
投影中心ズレ xm       : ${params.xm.toFixed(4)} m`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyCsv = () => {
    let csv = "s(m),x(m),y(m),theta(rad),theta(deg),Radius(m),Curvature(1/m)\n";
    sampledPoints.forEach(p => {
      const deg = (p.theta * 180 / Math.PI).toFixed(4);
      const radStr = p.theta.toFixed(6);
      const rStr = p.radius === Infinity ? "Infinity" : p.radius.toFixed(3);
      csv += `${p.s.toFixed(2)},${p.x.toFixed(4)},${p.y.toFixed(4)},${radStr},${deg},${rStr},${p.kappa.toFixed(6)}\n`;
    });

    navigator.clipboard.writeText(csv).then(() => {
      setCsvCopied(true);
      setTimeout(() => setCsvCopied(false), 2000);
    });
  };

  // CSVファイルとしてダウンロード
  const handleDownloadCsv = () => {
    let csv = "s(m),x(m),y(m),theta(rad),theta(deg),Radius(m),Curvature(1/m)\n";
    sampledPoints.forEach(p => {
      const deg = (p.theta * 180 / Math.PI).toFixed(4);
      const radStr = p.theta.toFixed(6);
      const rStr = p.radius === Infinity ? "Infinity" : p.radius.toFixed(3);
      csv += `${p.s.toFixed(2)},${p.x.toFixed(4)},${p.y.toFixed(4)},${radStr},${deg},${rStr},${p.kappa.toFixed(6)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `clothoid_A${params.A.toFixed(0)}_R${params.R.toFixed(0)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- SVG の ViewBox の構築 ---
  // 土木のローカル座標系 (Yが上、Xが右)
  // SVG座標系 (Yが下、Xが右) に反転マッピングするため、viewBox 自体は正数
  const viewWidth = boundingBox.maxX - boundingBox.minX;
  const viewHeight = boundingBox.maxY - boundingBox.minY;
  const viewBoxStr = `${boundingBox.minX} ${-boundingBox.maxY} ${viewWidth} ${viewHeight}`;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full overflow-hidden" id="clothoid-playground-root">
      
      {/* 1. 左側：パラメータ調整パネル */}
      <div className="w-full lg:w-80 shrink-0 flex flex-col gap-5 overflow-y-auto pr-1" id="clothoid-panel-left">
        
        {/* 設計入力モードの選択 */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-xs text-blue-400 uppercase tracking-wider">
            <Compass className="w-4 h-4 animate-spin-slow" />
            幾何演算モード選択
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            道路・鉄道の線形設計では、設計速度に対応する最小曲線半径 $R$ と緩和曲線長 $L$、またはパラメータ $A$ のいずれか2つから残りの数値を算定します。
          </p>
          
          <div className="grid grid-cols-1 gap-1.5 pt-1">
            {[
              { id: 'A_R', label: 'A と R から L (曲線長) を算定' },
              { id: 'R_L', label: 'R と L から A (パラメータ) を算定' },
              { id: 'A_L', label: 'A と L から R (接続円半径) を算定' }
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => setCalcMode(mode.id as any)}
                className={`w-full py-2 px-3 text-[11px] font-bold text-left rounded-lg transition-all border cursor-pointer ${
                  calcMode === mode.id
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.15)]'
                    : 'bg-slate-950/40 hover:bg-slate-800/40 text-slate-400 border-white/5'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* スライダーコントロール */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-4">
          <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider">
            <Sliders className="w-4 h-4" />
            パラメータ設計 (スライダー)
          </div>

          {/* クロソイドパラメータ A */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                パラメータ <span className="font-serif italic font-bold">A</span>
              </span>
              <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px]">
                {params.A.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="300"
              step="1"
              value={A}
              disabled={calcMode === 'R_L'}
              onChange={(e) => setA(parseFloat(e.target.value))}
              className={`w-full accent-emerald-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none ${
                calcMode === 'R_L' ? 'opacity-30 cursor-not-allowed' : ''
              }`}
            />
            <p className="text-[9px] text-slate-500">曲線の「規模・スケール」を表す指標（単位なし）</p>
          </div>

          {/* 接続円の半径 R */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                接続円半径 <span className="font-serif italic font-bold">R</span>
              </span>
              <span className="font-mono text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px]">
                {params.R.toFixed(2)} m
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="500"
              step="5"
              value={R}
              disabled={calcMode === 'A_L'}
              onChange={(e) => setR(parseFloat(e.target.value))}
              className={`w-full accent-blue-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none ${
                calcMode === 'A_L' ? 'opacity-30 cursor-not-allowed' : ''
              }`}
            />
            <p className="text-[9px] text-slate-500">緩和曲線が最終的に接続する円曲線の曲率半径</p>
          </div>

          {/* 緩和曲線長 L */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                緩和曲線長 <span className="font-serif italic font-bold">L</span>
              </span>
              <span className="font-mono text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">
                {params.L.toFixed(2)} m
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="300"
              step="1"
              value={L}
              disabled={calcMode === 'A_R'}
              onChange={(e) => setL(parseFloat(e.target.value))}
              className={`w-full accent-amber-500 opacity-85 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none ${
                calcMode === 'A_R' ? 'opacity-30 cursor-not-allowed' : ''
              }`}
            />
            <p className="text-[9px] text-slate-500">KAからKEまでの緩和曲線区間の実曲線長</p>
          </div>
        </div>

        {/* クイックチェック仕様規定 */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-2 text-[10px] text-slate-400 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-slate-300 text-xs mb-1">
            <Info className="w-4 h-4 text-slate-400" />
            道路構造令の設計基準
          </div>
          <div className="space-y-1">
            <p>• **基本式**: A² = R * L （常に保たれます）</p>
            <p>• **パラメータ制限**: 緩和曲線の設置にあたっては、偏角 τ が大体 29°（約 0.5 rad）を超えない範囲が望ましいとされます。</p>
            <p>• **現在の τ₀**: <span className="font-mono text-amber-400 font-bold">{(params.tau * 180 / Math.PI).toFixed(2)}°</span> ({params.tau.toFixed(4)} rad)</p>
            <p className={`p-1.5 rounded text-[9px] font-semibold ${params.tau < 0.5 ? 'bg-emerald-950/40 text-emerald-400' : 'bg-amber-950/40 text-amber-400'}`}>
              {params.tau < 0.5 
                ? '✓ 基準適合: 偏角が0.5rad以下で、一般的な道路の緩和区間に極めて適しています。' 
                : '⚠ 注意: 偏角が大きく、急カーブ用のクロソイドです。ヘアピンやランプウェイ線形に相当します。'}
            </p>
          </div>
        </div>

      </div>

      {/* 2. 中央：インタラクティブ 2D プレビュー */}
      <div className="flex-1 flex flex-col gap-4 min-w-0" id="clothoid-viewport-center">
        
        {/* ビューポートのヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-blue-500 animate-pulse" />
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">クロソイド局所座標系インタラクティブシミュレータ</h2>
              <p className="text-[10px] text-slate-500">マウスホバーで任意点における曲率半径（接触円）の動的縮小を可視化</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-400 font-mono">
              Xm: {params.xm.toFixed(2)}m
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-400 font-mono">
              ΔR: {params.deltaR.toFixed(2)}m
            </span>
          </div>
        </div>

        {/* SVGグラフィックスキャンバス */}
        <div 
          className="flex-1 min-h-[300px] bg-slate-950 rounded-2xl border border-white/10 relative overflow-hidden group select-none shadow-2xl"
          id="clothoid-svg-container"
        >
          {/* グリッド背景のオーバーレイ */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:32px_32px] opacity-40 pointer-events-none"></div>
          
          {/* SVG 描画コア */}
          <svg
            ref={svgRef}
            viewBox={viewBoxStr}
            className="w-full h-full cursor-crosshair relative z-10"
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={handleSvgMouseLeave}
          >
            {/* 局所座標系の中心軸（十字アシスト線） */}
            <line x1="-1000" y1="0" x2="1000" y2="0" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="0" y1="-1000" x2="0" y2="1000" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />

            {/* 円曲線中心（投影 Xm）の垂線とシフト量 ΔR を表す寸法線 */}
            {/* X = xm の垂直投影線 */}
            <line 
              x1={params.xm} 
              y1="10" 
              x2={params.xm} 
              y2={-(params.R + params.deltaR)} 
              stroke="rgba(148, 163, 184, 0.25)" 
              strokeWidth="0.5" 
              strokeDasharray="3,3" 
            />
            {/* シフト ΔR を示す線 */}
            <line 
              x1={params.xm} 
              y1={-params.R} 
              x2={params.xm} 
              y2={-(params.R + params.deltaR)} 
              stroke="#fbbf24" 
              strokeWidth="1.2" 
            />
            {/* シフト量のテキストラベル */}
            <text
              x={params.xm + 2}
              y={-(params.R + params.deltaR / 2)}
              fill="#fbbf24"
              fontSize="2.5"
              fontFamily="monospace"
              fontWeight="bold"
            >
              ΔR = {params.deltaR.toFixed(2)}m
            </text>

            {/* 円曲線の中心点 (Xm, R + ΔR) */}
            <circle cx={params.xm} cy={-(params.R + params.deltaR)} r="1.5" fill="#f59e0b" />
            <text
              x={params.xm + 3}
              y={-(params.R + params.deltaR) - 1}
              fill="#f59e0b"
              fontSize="2.8"
              fontFamily="monospace"
            >
              円中心 (O)
            </text>

            {/* 接続円曲線の円弧 (KE終点からの円軌道) */}
            {circlePath && (
              <path
                d={circlePath.replace(/ L /g, ' L ').replace(/ M /g, ' M ')} // Y軸反転対応のため、パス内の座標を負数に置換
                fill="none"
                stroke="rgba(59, 130, 246, 0.35)"
                strokeWidth="0.8"
                strokeDasharray="4,4"
              />
            )}

            {/* ピュア・クロソイド曲線（メイン経路） */}
            {pathD && (
              <path
                d={pathD.replace(/L\s*([\d\.-]+),([\d\.-]+)/g, (m, x, y) => `L ${x},${-parseFloat(y)}`)} // Y反転
                fill="none"
                stroke="url(#clothoidGrad)"
                strokeWidth="2.0"
                strokeLinecap="round"
              />
            )}

            {/* 始点 (KA: Kurvenanfang) */}
            <circle cx="0" cy="0" r="1.8" fill="#10b981" className="animate-pulse" />
            <text x="-4" y="4" fill="#10b981" fontSize="3.0" fontWeight="bold">KA (始点)</text>

            {/* 終点 (KE: Kurvenende) */}
            <circle cx={params.x0} cy={-params.y0} r="1.8" fill="#3b82f6" />
            <text x={params.x0 + 3} y={-params.y0 + 2} fill="#3b82f6" fontSize="3.0" fontWeight="bold">KE (終点)</text>

            {/* インタラクティブ：ホバーされた点での接触円（曲率円）の描画 */}
            {isHovering && circleRadius > 0 && circleRadius < 5000 && (
              <>
                {/* 接触円自体 */}
                <circle
                  cx={circleCenter.x}
                  cy={-circleCenter.y}
                  r={circleRadius}
                  fill="none"
                  stroke="rgba(236, 72, 153, 0.25)"
                  strokeWidth="0.8"
                  strokeDasharray="3,3"
                />
                {/* 中心点と曲線上の点を結ぶ半径法線 */}
                <line
                  x1={activePoint.x}
                  y1={-activePoint.y}
                  x2={circleCenter.x}
                  y2={-circleCenter.y}
                  stroke="rgba(236, 72, 153, 0.5)"
                  strokeWidth="0.6"
                  strokeDasharray="2,2"
                />
                {/* 接触円の極点 */}
                <circle cx={circleCenter.x} cy={-circleCenter.y} r="1.0" fill="#ec4899" />
                {/* 接触ポイントのプロット */}
                <circle cx={activePoint.x} cy={-activePoint.y} r="1.5" fill="#ec4899" />
                
                {/* 接触点の接線表示 */}
                <line
                  x1={activePoint.x - 15 * Math.cos(activePoint.theta)}
                  y1={-(activePoint.y - 15 * Math.sin(activePoint.theta))}
                  x2={activePoint.x + 15 * Math.cos(activePoint.theta)}
                  y2={-(activePoint.y + 15 * Math.sin(activePoint.theta))}
                  stroke="#f43f5e"
                  strokeWidth="0.8"
                />
              </>
            )}

            {/* カラーグラデーションとマーカーの定義 */}
            <defs>
              <linearGradient id="clothoidGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#84cc16" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>

          {/* 右下：フローティングスペックHUD */}
          <div className="absolute bottom-4 right-4 bg-slate-950/90 border border-white/10 rounded-xl p-3 backdrop-blur-md text-[10px] space-y-1.5 font-mono text-slate-300 w-48 shadow-xl">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              {isHovering ? '検証点スペック' : 'KE 終端スペック'}
            </div>
            <div>
              弧長 s: <span className="text-amber-400 font-bold">{activePoint.s.toFixed(2)} m</span>
            </div>
            <div>
              座標 X: <span className="text-white">{activePoint.x.toFixed(3)} m</span>
            </div>
            <div>
              座標 Y: <span className="text-white">{activePoint.y.toFixed(3)} m</span>
            </div>
            <div>
              接線角 θ: <span className="text-emerald-400 font-bold">{(activePoint.theta * 180 / Math.PI).toFixed(2)}°</span>
            </div>
            <div>
              曲率半径 R: <span className="text-blue-400 font-bold">
                {activePoint.radius === Infinity ? '∞' : `${activePoint.radius.toFixed(1)} m`}
              </span>
            </div>
            <div>
              曲率 κ: <span className="text-pink-400 font-bold">{activePoint.kappa.toFixed(6)}</span>
            </div>
          </div>

          {/* 左下：凡例 */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-1 text-[9px] font-mono text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-gradient-to-r from-emerald-500 to-blue-500 rounded"></span>
              <span>クロソイド曲線 (KA → KE)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-blue-500/30 border border-dashed border-blue-500 rounded"></span>
              <span>接続円曲線の延長軌道</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-pink-500/10 border border-dashed border-pink-500/30 rounded-full"></span>
              <span>接触円 (曲率円 Osculating Circle)</span>
            </div>
          </div>
        </div>

      </div>

      {/* 3. 右側：計算結果スペック ＆ 測点テーブル */}
      <div className="w-full lg:w-96 shrink-0 flex flex-col gap-4 overflow-y-auto" id="clothoid-spec-right">
        
        {/* 精密幾何計算書（土木スペック） */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-xs text-blue-400 uppercase tracking-wider">
              <Table className="w-4 h-4" />
              精密幾何計算書 (CIM)
            </div>
            <button
              onClick={handleCopyParams}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors"
              title="計算結果をクリップボードにコピー"
            >
              {copied ? (
                <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950 px-1 py-0.5 rounded">コピー済</span>
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {[
              { label: 'クロソイドパラメータ A', val: params.A.toFixed(4), color: 'text-emerald-400' },
              { label: '接続円半径 R (m)', val: params.R.toFixed(4), color: 'text-blue-400' },
              { label: '緩和曲線長 L (m)', val: params.L.toFixed(4), color: 'text-amber-400' },
              { label: '終点接線偏角 τ (rad)', val: params.tau.toFixed(6), color: 'text-indigo-400' },
              { label: '終点接線偏角 τ (度)', val: `${(params.tau * 180 / Math.PI).toFixed(4)}°`, color: 'text-purple-400' },
              { label: '終点座標 X0 (m)', val: params.x0.toFixed(4), color: 'text-slate-300' },
              { label: '終点座標 Y0 (m)', val: params.y0.toFixed(4), color: 'text-slate-300' },
              { label: '内フリ量 (シフト) ΔR (m)', val: params.deltaR.toFixed(4), color: 'text-yellow-500' },
              { label: '投影中心ズレ Xm (m)', val: params.xm.toFixed(4), color: 'text-teal-400' },
              { label: '接線長 Tk (m)', val: params.tk.toFixed(4), color: 'text-rose-400' }
            ].map((item, idx) => (
              <div key={idx} className="p-2 rounded bg-slate-950/40 border border-white/5 flex flex-col justify-between">
                <span className="text-slate-500 text-[9px] leading-tight mb-1">{item.label}</span>
                <span className={`font-bold ${item.color} text-xs`}>{item.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 測点データ（サンプリングテーブル） */}
        <div className="flex-1 min-h-[250px] p-4 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 font-bold text-xs text-amber-400 uppercase tracking-wider">
              <Layers className="w-4 h-4" />
              サンプリング測点リスト
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopyCsv}
                className="p-1 px-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-[9px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="CSV形式のテキストをクリップボードにコピー"
              >
                {csvCopied ? 'CSVコピー済' : 'CSVコピー'}
              </button>
              <button
                onClick={handleDownloadCsv}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="CSVファイルをダウンロード (.csv)"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
              </button>
            </div>
          </div>

          {/* テーブルラッパー */}
          <div className="flex-1 overflow-y-auto rounded bg-slate-950/60 border border-white/5 scrollbar-thin">
            <table className="w-full text-[9px] font-mono text-left border-collapse">
              <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-white/10 z-10">
                <tr>
                  <th className="py-1.5 px-2">s(m)</th>
                  <th className="py-1.5 px-2">X(m)</th>
                  <th className="py-1.5 px-2">Y(m)</th>
                  <th className="py-1.5 px-2">θ(deg)</th>
                  <th className="py-1.5 px-2">R(m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {sampledPoints.filter((_, i) => i % 4 === 0 || i === sampledPoints.length - 1).map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-1.5 px-2 font-bold text-amber-500">{p.s.toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-slate-400">{p.x.toFixed(3)}</td>
                    <td className="py-1.5 px-2 text-slate-400">{p.y.toFixed(3)}</td>
                    <td className="py-1.5 px-2 text-emerald-400">{(p.theta * 180 / Math.PI).toFixed(2)}°</td>
                    <td className="py-1.5 px-2 text-blue-400">
                      {p.radius === Infinity ? '∞' : p.radius.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
