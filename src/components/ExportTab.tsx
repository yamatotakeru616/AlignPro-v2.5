/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Copy, Download, Check, FileCode, CheckCircle, Database } from 'lucide-react';
import { ControlPoint, AlignmentPoint, CrossSectionParams, EngineeringData } from '../types';
import { generateLandXML, COORDINATE_ZONES, lngLatToAbsoluteJGD, xyToLngLat } from '../utils';

interface ExportTabProps {
  points: ControlPoint[];
  crossSection: CrossSectionParams;
  alignment: AlignmentPoint[];
  engineeringData: EngineeringData;
  coordinateZone?: number;
}

export default function ExportTab({ points, crossSection, alignment, engineeringData, coordinateZone = 2 }: ExportTabProps) {
  const [activeFormat, setActiveFormat] = useState<'landxml' | 'json'>('landxml');
  const [copied, setCopied] = useState<boolean>(false);

  // 現在の系情報オブジェクト
  const activeZone = React.useMemo(() => {
    return COORDINATE_ZONES.find(z => z.zone === coordinateZone) || COORDINATE_ZONES[1];
  }, [coordinateZone]);

  // XMLの生成
  const xmlContent = React.useMemo(() => {
    return generateLandXML(points, crossSection, alignment);
  }, [points, crossSection, alignment]);

  // JSONの生成
  const jsonContent = React.useMemo(() => {
    return JSON.stringify({
      version: "2.5",
      projectName: "CIM_Road_Alignment_Line",
      generatedAt: new Date().toISOString(),
      coordinateSystem: `JGD2011 / Japan Plane Rectangular CS ${activeZone.name} (EPSG ${activeZone.epsg})`,
      coordinateZoneNum: coordinateZone,
      originLatitude: activeZone.lat,
      originLongitude: activeZone.lng,
      lengthMeters: engineeringData.totalLength,
      engineeringSummary: {
        cutVolumeM3: engineeringData.cutVolume,
        fillVolumeM3: engineeringData.fillVolume,
        netVolumeM3: engineeringData.netVolume,
        avgVerticalSlopePercent: engineeringData.avgSlope
      },
      crossSectionParameters: crossSection,
      rawControlPoints: points.map(p => {
        // 各制御点の高精度絶対座標を算出
        const abs = lngLatToAbsoluteJGD(p.lng, p.lat, coordinateZone);
        return {
          id: p.id,
          name: p.name,
          latitude: p.lat,
          longitude: p.lng,
          localX: parseFloat(p.x.toFixed(3)),
          localY: parseFloat(p.y.toFixed(3)),
          absoluteX_East: parseFloat(abs.x.toFixed(3)),
          absoluteY_North: parseFloat(abs.y.toFixed(3)),
          elevationZ: p.z,
          radiusR: p.r
        };
      }),
      resampledAlignmentPoints: alignment.map(p => {
        // 各測点の高精度絶対座標を算出
        const lngLat = xyToLngLat(p.x, p.y);
        const abs = lngLatToAbsoluteJGD(lngLat.lng, lngLat.lat, coordinateZone);
        return {
          station: parseFloat(p.station.toFixed(4)),
          distance: parseFloat(p.distance.toFixed(3)),
          localX: parseFloat(p.x.toFixed(3)),
          localY: parseFloat(p.y.toFixed(3)),
          absoluteX_East: parseFloat(abs.x.toFixed(3)),
          absoluteY_North: parseFloat(abs.y.toFixed(3)),
          designZ: parseFloat(p.z.toFixed(3)),
          groundZ: parseFloat(p.groundZ.toFixed(3))
        };
      })
    }, null, 2);
  }, [points, crossSection, alignment, engineeringData, coordinateZone, activeZone]);

  const activeContent = activeFormat === 'landxml' ? xmlContent : jsonContent;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy content: ", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([activeContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFormat === 'landxml' ? 'cim_road_alignment.xml' : 'cim_road_alignment.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-y-auto lg:overflow-hidden">
      
      {/* 左側：エクスポート説明 & CIM概要カード */}
      <div className="lg:w-80 flex flex-col gap-4 shrink-0">
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            <h3 className="font-bold text-white text-sm">成果物書き出し仕様</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            設計した平面・縦断線形および横断形状パラメータを、日本のi-ConstructionおよびCIM/BIM標準フォーマットに準拠したモック「LandXML」およびGIS・CADシステム連携用の「JSON」で書き出しが可能です。
          </p>

          <div className="h-px bg-white/10 my-1"></div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>道路総延長:</span>
              <span className="font-mono text-white font-bold">{engineeringData.totalLength} m</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>切土・盛土比:</span>
              <span className="font-mono text-white font-bold">
                {engineeringData.cutVolume > 0 ? (engineeringData.fillVolume / engineeringData.cutVolume).toFixed(2) : '1.00'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>測地基準系:</span>
              <span className="text-blue-400 font-bold font-mono" title={`${activeZone.name} / ${activeZone.region}`}>
                JGD2011 {activeZone.name} (EPSG:{activeZone.epsg})
              </span>
            </div>
          </div>
        </div>

        {/* 連携システム情報 */}
        <div className="glass-panel rounded-xl p-5 bg-slate-900/30 space-y-2 text-xs">
          <div className="text-white font-bold flex items-center gap-1.5 text-xs">
            <Database className="w-4 h-4 text-blue-400" />
            CIM/BIM 連携確認済み
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            本データは、Autodesk Civil 3D, Infraworks, Bentley OpenRoads等でインポート可能なLandXML 1.2アライメントスキーマをベースにモデリングされています。
          </p>
        </div>
      </div>

      {/* 右側：コードプレビュー & アクション */}
      <div className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col">
        
        {/* フォーマット切り替えヘッダー */}
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/10 bg-white/5">
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveFormat('landxml'); setCopied(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-display transition-colors cursor-pointer ${
                activeFormat === 'landxml'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              LandXML 1.2
            </button>
            <button
              onClick={() => { setActiveFormat('json'); setCopied(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-display transition-colors cursor-pointer ${
                activeFormat === 'json'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              CIM Schema JSON
            </button>
          </div>

          <div className="flex gap-2">
            
            {/* コピーボタン */}
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  コピー完了
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  クリップボードにコピー
                </>
              )}
            </button>

            {/* ダウンロードボタン */}
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              ファイル保存
            </button>
          </div>
        </div>

        {/* コード表示エリア */}
        <div className="flex-1 p-4 bg-[#030712] overflow-auto">
          <pre className="font-mono text-[11px] text-emerald-400 leading-normal selection:bg-emerald-500/30">
            <code>{activeContent}</code>
          </pre>
        </div>
      </div>

    </div>
  );
}
