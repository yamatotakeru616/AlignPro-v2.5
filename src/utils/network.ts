/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControlPoint, CrossSectionParams, SectionSegment } from '../types';

/**
 * 各路線の描画・計算詳細度（Level of Detail）
 */
export enum LODLevel {
  HIGH = 'HIGH',       // アクティブ路線: 全舗装レイヤー、詳細のり面、1mサンプリングピッチ
  MEDIUM = 'MEDIUM',   // 近接非アクティブ路線: 舗装のみ（のり面・詳細層省略）、5mサンプリングピッチ
  LOW = 'LOW',         // 遠景非アクティブ路線: 簡易コンター、15mサンプリングピッチ
  LINE = 'LINE'        // 最小VRAM保護: 1本の中心線（3Dライン描画）のみ
}

/**
 * 道路ネットワークにおける単一アライメントプラン
 */
export interface AlignmentPlan {
  id: string;
  name: string;
  points: ControlPoint[];
  crossSection: CrossSectionParams;
  segments: SectionSegment[];
  coordinateZone: number;
  
  // 立体交差や勾配すり合わせのための全体高さ（Z）オフセット
  heightOffset: number;
  
  // 3Dレンダリング時の可視性および手動LOD上書き
  visible: boolean;
  lodLevel: LODLevel;
}

/**
 * 接続ノードの交差形式
 */
export enum IntersectionType {
  CROSSROAD = 'CROSSROAD',     // 平面平面交差（十字・T字・Y字）
  OVERPASS = 'OVERPASS',       // 立体交差（道路がもう一方の道路の上を跨ぐ・オーバーパス）
  UNDERPASS = 'UNDERPASS',     // 立体交差（アンダーパス、トンネル状）
  RAMP_MERGE = 'RAMP_MERGE',   // 高速ランプ合流
  RAMP_DIVERGE = 'RAMP_DIVERGE' // 高速ランプ分流
}

/**
 * 交差点・立体交差制御ノード
 */
export interface IntersectionNode {
  id: string;
  name: string;
  type: IntersectionType;
  
  // 交差する2つの路線ID
  primaryRoadId: string;
  secondaryRoadId: string;
  
  // それぞれの路線上の交差点（中心座標）における始点からの測点距離（Station）
  primaryStation: number;
  secondaryStation: number;
  
  // 平面交点におけるJGD2011基準の絶対平面座標 (X, Y)
  intersectionX: number;
  intersectionY: number;
  
  // 両路線のその地点における計画高の差 (Z差)
  elevationDifference: number;
  
  // 平面交差時の隅切り（カーブ）半径 (m)
  cornerRadius: number;
  
  // 信号制御または優先関係
  controlType: 'signal' | 'stop' | 'yield' | 'roundabout' | 'none';
}

/**
 * 複数路線ネットワーク統合ステート
 */
export interface RoadNetwork {
  alignments: Record<string, AlignmentPlan>; // 路線ID -> 路線詳細
  intersections: IntersectionNode[];          // 交差点・立体交差ノードリスト
  activeAlignmentId: string;                 // 現在アクティブ（編集対象）の路線ID
}

/**
 * 1. 複数路線間の平面交点・立体交差を 3次元的に自動検出する幾何学計算エンジン
 * (2つの線形がXY平面上で交差している箇所をスキャンし、Z差に応じて平面交差 or 立体交差に自動分類)
 */
export function detectRoadIntersections(
  network: RoadNetwork,
  zToleranceForAtGrade: number = 2.0 // Z差がこの値(m)未満なら平面交差、以上なら立体交差
): IntersectionNode[] {
  const intersections: IntersectionNode[] = [];
  const roadIds = Object.keys(network.alignments);

  if (roadIds.length < 2) return [];

  // 簡単のため、各路線のコントロールポイントをセグメント化して簡易線分交差チェックを行う
  for (let i = 0; i < roadIds.length; i++) {
    for (let j = i + 1; j < roadIds.length; j++) {
      const roadA = network.alignments[roadIds[i]];
      const roadB = network.alignments[roadIds[j]];

      // 各コントロールポイントのXY線分が交差するか検証
      const ptsA = roadA.points;
      const ptsB = roadB.points;

      for (let sA = 0; sA < ptsA.length - 1; sA++) {
        for (let sB = 0; sB < ptsB.length - 1; sB++) {
          const p1 = ptsA[sA];
          const p2 = ptsA[sA + 1];
          const q1 = ptsB[sB];
          const q2 = ptsB[sB + 1];

          const intersect = getLineIntersectionXY(p1.x, p1.y, p2.x, p2.y, q1.x, q1.y, q2.x, q2.y);
          if (intersect) {
            // 交点座標
            const { x, y, tA, tB } = intersect;

            // 補間Z値（各路線の高さオフセットを考慮）
            const zA = p1.z + tA * (p2.z - p1.z) + roadA.heightOffset;
            const zB = q1.z + tB * (q2.z - q1.z) + roadB.heightOffset;
            const zDiff = Math.abs(zA - zB);

            // 測点距離の概算（簡易線分比率）
            const stationA = (sA + tA) * 100; // 1区間100mの簡易換算
            const stationB = (sB + tB) * 100;

            const isGradeCross = zDiff < zToleranceForAtGrade;
            let type = IntersectionType.CROSSROAD;

            if (!isGradeCross) {
              // Z値が高い方が上に跨ぐ (OVERPASS)
              type = zA > zB ? IntersectionType.OVERPASS : IntersectionType.UNDERPASS;
            }

            intersections.push({
              id: `node-${roadA.id}-${roadB.id}-${sA}-${sB}`,
              name: `${roadA.name} ⇄ ${roadB.name} ${isGradeCross ? '平面交差点' : '立体交差'}`,
              type,
              primaryRoadId: roadA.id,
              secondaryRoadId: roadB.id,
              primaryStation: parseFloat(stationA.toFixed(2)),
              secondaryStation: parseFloat(stationB.toFixed(2)),
              intersectionX: parseFloat(x.toFixed(3)),
              intersectionY: parseFloat(y.toFixed(3)),
              elevationDifference: parseFloat((zA - zB).toFixed(3)),
              cornerRadius: 15.0, // デフォルト隅切り15m
              controlType: isGradeCross ? 'signal' : 'none'
            });
          }
        }
      }
    }
  }

  return intersections;
}

/**
 * 2. 2本の 2D線分の交差点を算出する純粋幾何学ヘルパー
 */
function getLineIntersectionXY(
  px1: number, py1: number, px2: number, py2: number,
  qx1: number, qy1: number, qx2: number, qy2: number
): { x: number; y: number; tA: number; tB: number } | null {
  const denominator = (px2 - px1) * (qy2 - qy1) - (py2 - py1) * (qx2 - qx1);
  if (Math.abs(denominator) < 1e-8) return null; // 平行

  const tA = ((qx1 - px1) * (qy2 - qy1) - (qy1 - py1) * (qx2 - qx1)) / denominator;
  const tB = ((qx1 - px1) * (py2 - py1) - (qy1 - py1) * (px2 - px1)) / denominator;

  if (tA >= 0 && tA <= 1 && tB >= 0 && tB <= 1) {
    const x = px1 + tA * (px2 - px1);
    const y = py1 + tA * (py2 - py1);
    return { x, y, tA, tB };
  }

  return null;
}

/**
 * 3. RTX 3050 Ti VRAM 4GB制限を突破するための「動的 LOD（Level of Detail）計算パラメーター算出エンジン」
 * 各路線のサンプリング点ピッチやメッシュ解像度を決定。非アクティブ路線は描画を大幅に簡略化する。
 */
export function getLODCalculatedParams(
  alignment: AlignmentPlan,
  isActive: boolean,
  globalPerformanceMode: 'eco' | 'standard' | 'high' = 'standard'
): {
  samplingInterval: number;   // 何メートルごとに断面を計算するか (1m〜20m)
  renderPavementLayers: boolean; // 舗装の多層構造（表層・路盤・路床）を詳細に描画するか
  renderSlopes: boolean;      // のり面メッシュを構築するか
  renderClothoid: boolean;    // クロソイド緩和曲線計算を高精度で実行するか
  maxPointsCount: number;     // 3Dバッファに送る最大頂点制限
} {
  // 手動でLODレベルが指定されている場合はそちらを尊重、そうでなければ自動算出
  let effectiveLOD = alignment.lodLevel;

  if (effectiveLOD === LODLevel.HIGH && !isActive) {
    // アクティブでないのにHIGH設定の場合は自動的にMEDIUM/LOWへダウングレード（安全ガード）
    effectiveLOD = globalPerformanceMode === 'high' ? LODLevel.MEDIUM : LODLevel.LOW;
  }

  // グローバルパフォーマンス設定（eco/standard/high）とLODレベルをマッピング
  switch (effectiveLOD) {
    case LODLevel.HIGH:
      return {
        samplingInterval: 1.0, // 1m超高精度
        renderPavementLayers: true,
        renderSlopes: true,
        renderClothoid: true,
        maxPointsCount: 5000
      };
    case LODLevel.MEDIUM:
      return {
        samplingInterval: 5.0, // 5m間隔
        renderPavementLayers: globalPerformanceMode === 'high', // highモード時のみ多層描画
        renderSlopes: true,
        renderClothoid: true,
        maxPointsCount: 1500
      };
    case LODLevel.LOW:
      return {
        samplingInterval: 10.0, // 10m間隔
        renderPavementLayers: false, // 単一レイヤー
        renderSlopes: false,        // のり面は省略（平坦）
        renderClothoid: false,       // 簡易直線補間
        maxPointsCount: 500
      };
    case LODLevel.LINE:
    default:
      return {
        samplingInterval: 25.0, // 25m間隔
        renderPavementLayers: false,
        renderSlopes: false,
        renderClothoid: false,
        maxPointsCount: 100
      };
  }
}
