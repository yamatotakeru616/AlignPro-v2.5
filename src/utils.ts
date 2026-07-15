/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControlPoint, AlignmentPoint, CrossSectionParams, EngineeringData, StationPoint, CrossSectionConfig, ProfileStationRow, SectionSegment } from './types';

// 基準座標 (第II系 / 福岡・大分などを想定)
export const DEFAULT_BASE_LNG = 131.0;
export const DEFAULT_BASE_LAT = 33.0;

export interface CoordinateZone {
  zone: number;
  name: string;
  lat: number; // 基準点緯度 (度)
  lng: number; // 基準点経度 (度)
  epsg: number;
  region: string;
}

export const COORDINATE_ZONES: CoordinateZone[] = [
  { zone: 1, name: "第I系", lat: 33.0, lng: 129.5, epsg: 6669, region: "長崎・佐賀・福岡・熊本・鹿児島の一部" },
  { zone: 2, name: "第II系", lat: 33.0, lng: 131.0, epsg: 6670, region: "福岡・佐賀・大分・宮崎・熊本・鹿児島の一部" },
  { zone: 3, name: "第III系", lat: 36.0, lng: 132.16666667, epsg: 6671, region: "山口・島根・広島の一部" },
  { zone: 4, name: "第IV系", lat: 33.0, lng: 133.5, epsg: 6672, region: "香川・愛媛・徳島・高知" },
  { zone: 5, name: "第V系", lat: 33.0, lng: 134.33333333, epsg: 6673, region: "兵庫・和歌山・大阪・徳島の一部" },
  { zone: 6, name: "第VI系", lat: 36.0, lng: 136.0, epsg: 6674, region: "京都・福井・滋賀・三重・奈良・愛知・岐阜" },
  { zone: 7, name: "第VII系", lat: 36.0, lng: 137.25, epsg: 6675, region: "石川・富山・岐阜・愛知の一部" },
  { zone: 8, name: "第VIII系", lat: 36.0, lng: 138.5, epsg: 6676, region: "新潟・長野・山梨・静岡" },
  { zone: 9, name: "第IX系", lat: 36.0, lng: 139.83333333, epsg: 6677, region: "東京・神奈川・千葉・埼玉・群馬・栃木・茨城・福島・山梨の一部" },
  { zone: 10, name: "第X系", lat: 40.0, lng: 140.83333333, epsg: 6678, region: "青森・秋田・岩手・山形・宮城" },
  { zone: 11, name: "第XI系", lat: 44.0, lng: 142.25, epsg: 6679, region: "北海道（登別・室蘭・苫小牧以西を除く、十勝・釧路・根室を除く）" },
  { zone: 12, name: "第XII系", lat: 44.0, lng: 144.25, epsg: 6680, region: "北海道（十勝・釧路・根室地方）" },
  { zone: 13, name: "第XIII系", lat: 44.0, lng: 144.25, epsg: 6681, region: "北海道（歯舞群島・色丹島・国後島・択捉島）" },
  { zone: 14, name: "第XIV系", lat: 26.0, lng: 142.0, epsg: 6682, region: "小笠原諸島" },
  { zone: 15, name: "第XV系", lat: 26.0, lng: 127.5, epsg: 6683, region: "沖縄県（大東諸島、先島諸島を除く）" },
  { zone: 16, name: "第XVI系", lat: 26.0, lng: 124.0, epsg: 6684, region: "沖縄県（先島諸島、魚釣島）" },
  { zone: 17, name: "第XVII系", lat: 26.0, lng: 131.0, epsg: 6685, region: "沖縄県（大東諸島）" },
  { zone: 18, name: "第XVIII系", lat: 20.0, lng: 136.0, epsg: 6686, region: "東京都（沖ノ鳥島）" },
  { zone: 19, name: "第XIX系", lat: 24.23333333, lng: 153.96666667, epsg: 6687, region: "東京都（南鳥島）" }
];

// グローバルな座標基準状態
let currentBaseLng = DEFAULT_BASE_LNG;
let currentBaseLat = DEFAULT_BASE_LAT;
let currentZoneNum = 2;

// ローカルストレージから初期系統を復元する
try {
  const savedZone = localStorage.getItem('gis_coordinate_zone');
  if (savedZone) {
    const zoneVal = parseInt(savedZone, 10);
    const zObj = COORDINATE_ZONES.find(z => z.zone === zoneVal);
    if (zObj) {
      currentZoneNum = zoneVal;
      currentBaseLng = zObj.lng;
      currentBaseLat = zObj.lat;
    }
  }
} catch (e) {
  // ignore
}

export function setGlobalCoordinateSystem(zoneNum: number) {
  const zone = COORDINATE_ZONES.find(z => z.zone === zoneNum) || COORDINATE_ZONES[1]; // デフォルト2系
  currentZoneNum = zoneNum;
  currentBaseLng = zone.lng;
  currentBaseLat = zone.lat;
  try {
    localStorage.setItem('gis_coordinate_zone', zoneNum.toString());
  } catch (e) {
    // ignore
  }
}

export function getGlobalBaseCoords() {
  return { baseLng: currentBaseLng, baseLat: currentBaseLat, zoneNum: currentZoneNum };
}

/**
 * 経緯度からローカル平面直交座標 (m) への変換 (高精度ガウス・クリューゲル投影変換)
 */
export function lngLatToXY(lng: number, lat: number, baseLng = currentBaseLng, baseLat = currentBaseLat): { x: number; y: number } {
  const DEG_TO_RAD = Math.PI / 180;
  const phi = lat * DEG_TO_RAD;
  const lambda = lng * DEG_TO_RAD;
  const phi0 = baseLat * DEG_TO_RAD;
  const lambda0 = baseLng * DEG_TO_RAD;

  const a = 6378137.0;
  const f = 1.0 / 298.257222101;
  const eSq = 2 * f - f * f;

  const w = Math.sqrt(1.0 - eSq * Math.sin(phi) * Math.sin(phi));
  const N = a / w; // 卯酉線曲率半径

  // GRS80 子午線弧長の計算
  const A_prime = 1 + (3/4)*eSq + (45/64)*eSq*eSq + (175/256)*eSq*eSq*eSq;
  const B_prime = (3/4)*eSq + (15/16)*eSq*eSq + (525/512)*eSq*eSq*eSq;
  const C_prime = (15/64)*eSq*eSq + (105/256)*eSq*eSq*eSq;
  const D_prime = (35/512)*eSq*eSq*eSq;

  const S = a * (1 - eSq) * (A_prime * phi - (B_prime/2) * Math.sin(2 * phi) + (C_prime/4) * Math.sin(4 * phi) - (D_prime/6) * Math.sin(6 * phi));
  const S0 = a * (1 - eSq) * (A_prime * phi0 - (B_prime/2) * Math.sin(2 * phi0) + (C_prime/4) * Math.sin(4 * phi0) - (D_prime/6) * Math.sin(6 * phi0));

  const dLambda = lambda - lambda0;
  
  // 投影座標 X (東) / Y (北) の算出
  const y = S - S0 + (N / 2) * Math.sin(phi) * Math.cos(phi) * dLambda * dLambda;
  const x = N * Math.cos(phi) * dLambda;

  return { x, y };
}

/**
 * ローカル平面直交座標 (m) から経緯度への変換 (安全ガード付きニュートン・ラプソン反復法)
 */
export function xyToLngLat(x: number, y: number, baseLng = currentBaseLng, baseLat = currentBaseLat): { lng: number; lat: number } {
  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  const a = 6378137.0;
  const f = 1.0 / 298.257222101;
  const eSq = 2 * f - f * f;

  // ガウス・クリューゲル基準原点の緯度経度
  const phi0 = baseLat * DEG_TO_RAD;
  const lambda0 = baseLng * DEG_TO_RAD;

  // 第一近似値として phi0 から y / a を使う
  let phi = phi0 + (y / a);
  const MAX_ITER = 10;
  const EPSILON = 1e-12;
  let iter = 0;
  let isConverged = false;

  // GRS80 子午線弧長の計算用諸定数
  const A_prime = 1 + (3/4)*eSq + (45/64)*eSq*eSq + (175/256)*eSq*eSq*eSq;
  const B_prime = (3/4)*eSq + (15/16)*eSq*eSq + (525/512)*eSq*eSq*eSq;
  const C_prime = (15/64)*eSq*eSq + (105/256)*eSq*eSq*eSq;
  const D_prime = (35/512)*eSq*eSq*eSq;

  while (iter < MAX_ITER) {
    const sin2Phi = Math.sin(2 * phi);
    const sin4Phi = Math.sin(4 * phi);
    const sin6Phi = Math.sin(6 * phi);

    // 子午線弧長 S(phi) の計算
    const S = a * (1 - eSq) * (A_prime * phi - (B_prime/2) * sin2Phi + (C_prime/4) * sin4Phi - (D_prime/6) * sin6Phi);
    
    const w = Math.sqrt(1.0 - eSq * Math.sin(phi) * Math.sin(phi));
    const M = (a * (1.0 - eSq)) / (w * w * w); // 子午線曲率半径

    const func = S - y; // y は北方向
    
    if (Math.abs(M) < 1e-6) {
      break;
    }

    const dPhi = func / M;
    phi = phi - dPhi;

    if (Math.abs(dPhi) < EPSILON) {
      isConverged = true;
      break;
    }
    iter++;
  }

  // もし発散した場合、またはおかしな値になった場合は簡易近似にフォールバック
  if (!isConverged || isNaN(phi)) {
    const metersPerDegreeLat = 111000;
    const metersPerDegreeLng = 111000 * Math.cos(baseLat * DEG_TO_RAD);
    return {
      lng: baseLng + x / metersPerDegreeLng,
      lat: baseLat + y / metersPerDegreeLat,
    };
  }

  // 経度の計算
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const w = Math.sqrt(1.0 - eSq * sinPhi * sinPhi);
  const N = a / w; // 卯酉線曲率半径

  const dLambda = x / (N * cosPhi);
  const lng = baseLng + dLambda * RAD_TO_DEG;
  const lat = phi * RAD_TO_DEG;

  return { lng, lat };
}

/**
 * 外部から標高値を注入・参照できるように、グローバルに標高マップを設定可能にする
 */
let customGroundMap: { width: number; height: number; data: number[] } | null = null;

export function loadCustomGroundMapFromStorage() {
  try {
    const saved = localStorage.getItem('gis_custom_ground_map');
    if (saved) {
      customGroundMap = JSON.parse(saved);
    } else {
      customGroundMap = null;
    }
  } catch (e) {
    customGroundMap = null;
  }
}

// 初期化
loadCustomGroundMapFromStorage();

export function setCustomGroundMap(width: number, height: number, data: number[]) {
  customGroundMap = { width, height, data };
  localStorage.setItem('gis_custom_ground_map', JSON.stringify(customGroundMap));
}

export function clearCustomGroundMap() {
  customGroundMap = null;
  localStorage.removeItem('gis_custom_ground_map');
}

/**
 * 地盤高の定義式 (連続的なモック地形モデル ＋ 標高タイルカスタムインポート対応)
 * リアルな山岳地帯や起伏を表現
 */
export function getGroundElevation(x: number, y: number): number {
  if (customGroundMap) {
    // 画面の CAD 座標 X (-200 ~ 1200) Y (-200 ~ 1200) をマップのグリッドインデックスに射影
    const minX = -300;
    const maxX = 1300;
    const minY = -300;
    const maxY = 1300;
    
    const pctX = (x - minX) / (maxX - minX);
    const pctY = (y - minY) / (maxY - minY);
    
    if (pctX >= 0 && pctX <= 1 && pctY >= 0 && pctY <= 1) {
      const col = Math.floor(pctX * (customGroundMap.width - 1));
      const row = Math.floor(pctY * (customGroundMap.height - 1));
      const idx = row * customGroundMap.width + col;
      if (idx >= 0 && idx < customGroundMap.data.length) {
        return customGroundMap.data[idx];
      }
    }
  }

  const term1 = Math.sin(x / 180) * 22;
  const term2 = Math.cos(y / 240) * 15;
  const term3 = Math.sin((x + y) / 80) * 6;
  return 42 + term1 + term2 + term3;
}

export function calculateAlignment(
  points: ControlPoint[],
  crossSection: CrossSectionParams,
  segmentsCount: number = 60
): AlignmentPoint[] {
  const N = points.length;
  if (N < 2) return [];

  const alignmentPoints: AlignmentPoint[] = [];

  // 1. 各IPの円曲線（単曲線）幾何情報の計算
  interface CurveInfo {
    tl: number;        // 接線長 (Tangent Length) (m)
    bc: { x: number; y: number }; // 曲線始点 (Begin of Curve)
    ec: { x: number; y: number }; // 曲線終点 (End of Curve)
    o: { x: number; y: number };  // 円の中心
    r: number;         // 実質半径 (m)
    angleBC: number;   // BCの極座標角 (rad)
    angleEC: number;   // ECの極座標角 (rad)
    cross: number;     // 回転方向の外積
    isCurve: boolean;  // 曲線が有効かどうか
  }

  const curves: CurveInfo[] = Array(N).fill(null).map(() => ({
    tl: 0,
    bc: { x: 0, y: 0 },
    ec: { x: 0, y: 0 },
    o: { x: 0, y: 0 },
    r: 0,
    angleBC: 0,
    angleEC: 0,
    cross: 0,
    isCurve: false
  }));

  for (let i = 1; i < N - 1; i++) {
    const pPrev = points[i - 1];
    const pCurr = points[i];
    const pNext = points[i + 1];

    const r = pCurr.r || 0;
    if (r <= 0) continue; // 半径が0または未定義なら直線交点

    const dx1 = pCurr.x - pPrev.x;
    const dy1 = pCurr.y - pPrev.y;
    const dx2 = pNext.x - pCurr.x;
    const dy2 = pNext.y - pCurr.y;

    const L1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (L1 < 0.1 || L2 < 0.1) continue;

    const ux1 = dx1 / L1;
    const uy1 = dy1 / L1;
    const ux2 = dx2 / L2;
    const uy2 = dy2 / L2;

    const dot = ux1 * ux2 + uy1 * uy2;
    if (dot > 0.9999) continue; // ほぼ直線の場合はR不要

    const cosTheta = Math.max(-1, Math.min(1, dot));
    const I = Math.acos(cosTheta); // 偏角 (交角)

    // 半径rから接線長 T.L. を計算
    let tl = r * Math.tan(I / 2);

    // 接線長が両セグメントの45%を超えないように安全制限 (アライメント破綻防止ガード)
    const tlMax = Math.min(L1 * 0.45, L2 * 0.45);
    if (tl > tlMax) {
      tl = tlMax;
    }

    const rActual = tl / Math.tan(I / 2);

    // 曲線始点 BC / 終点 EC
    const bc = {
      x: pCurr.x - tl * ux1,
      y: pCurr.y - tl * uy1
    };
    const ec = {
      x: pCurr.x + tl * ux2,
      y: pCurr.y + tl * uy2
    };

    // 曲線の向き（外積により左折か右折かを判定）
    const cross = ux1 * uy2 - uy1 * ux2;
    const leftTurn = cross > 0;

    // 接線ベクトルに対する法線
    const nx = leftTurn ? -uy1 : uy1;
    const ny = leftTurn ? ux1 : -ux1;

    // 中心 O
    const o = {
      x: bc.x + rActual * nx,
      y: bc.y + rActual * ny
    };

    // 極座標角
    const angleBC = Math.atan2(bc.y - o.y, bc.x - o.x);
    const angleEC = Math.atan2(ec.y - o.y, ec.x - o.x);

    curves[i] = {
      tl,
      bc,
      ec,
      o,
      r: rActual,
      angleBC,
      angleEC,
      cross,
      isCurve: true
    };
  }

  // 2. 直線・円曲線からサンプリング点列 (rawPoints) を生成
  // IPごとの代表的なサンプリング点のインデックスを記録する配列
  const repIndices: number[] = Array(N).fill(0);
  const rawPoints: { x: number; y: number; z: number; t: number; distance: number; isVerticalCurve?: boolean }[] = [];

  repIndices[0] = 0; // BPは最初の点

  for (let i = 0; i < N - 1; i++) {
    const pStart = points[i];
    const pEnd = points[i + 1];

    const startCurve = curves[i];
    const endCurve = curves[i + 1];

    // 区間の開始点 (前のRの終点、または始点BP)
    const segStart = (i > 0 && startCurve.isCurve) ? startCurve.ec : { x: pStart.x, y: pStart.y };
    // 区間の終了点 (次のRの始点、または終点EP)
    const segEnd = (i < N - 2 && endCurve.isCurve) ? endCurve.bc : { x: pEnd.x, y: pEnd.y };

    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 直線区間の分割（全体の長さに応じて、適度にサンプリング）
    const lineSteps = Math.max(3, Math.floor((dist / 300) * segmentsCount));

    for (let s = 0; s < lineSteps; s++) {
      const t = s / lineSteps;
      const x = segStart.x + dx * t;
      const y = segStart.y + dy * t;

      // Z補間は後程一括で放物線計算
      rawPoints.push({ x, y, z: 0, t: 0, distance: 0 });
    }

    // 次のIPに円曲線がない場合、この直線の終了位置付近を代表点とする
    if (i < N - 2 && !endCurve.isCurve) {
      repIndices[i + 1] = rawPoints.length;
    }

    // セグメントの最後、かつ次のIPに有効な円曲線がある場合は、ここで円弧を挿入してサンプリング
    if (i < N - 2 && endCurve.isCurve) {
      const o = endCurve.o;
      const r = endCurve.r;
      const aBC = endCurve.angleBC;
      let aEC = endCurve.angleEC;
      const cross = endCurve.cross;

      // 角度の最短回転補正
      let angleDiff = aEC - aBC;
      if (cross > 0) { // 左折 (反時計回り)
        if (angleDiff < 0) angleDiff += Math.PI * 2;
      } else { // 右折 (時計回り)
        if (angleDiff > 0) angleDiff -= Math.PI * 2;
      }

      const arcLen = Math.abs(angleDiff) * r;
      const curveSteps = Math.max(3, Math.floor((arcLen / 300) * segmentsCount));
      const midStep = Math.floor(curveSteps / 2);

      for (let s = 0; s < curveSteps; s++) {
        const t = s / curveSteps;
        const currentAngle = aBC + angleDiff * t;
        const x = o.x + r * Math.cos(currentAngle);
        const y = o.y + r * Math.sin(currentAngle);

        if (s === midStep) {
          repIndices[i + 1] = rawPoints.length; // 円弧の中央をIP代表点とする
        }

        rawPoints.push({ x, y, z: 0, t: 0, distance: 0 });
      }
    }
  }

  // 最後の終点 (EP) を追加
  const ep = points[N - 1];
  repIndices[N - 1] = rawPoints.length;
  rawPoints.push({ x: ep.x, y: ep.y, z: ep.z, t: 1.0, distance: 0 });

  // 3. サンプリング点列の平面累積距離の計算
  let totalDistanceAccum = 0;
  for (let j = 0; j < rawPoints.length; j++) {
    if (j > 0) {
      const prev = rawPoints[j - 1];
      const curr = rawPoints[j];
      const stepDist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
      totalDistanceAccum += stepDist;
    }
    rawPoints[j].distance = totalDistanceAccum;
  }

  const totalLength = totalDistanceAccum;

  // 進捗割合 t (0〜1) の割り当て
  for (let j = 0; j < rawPoints.length; j++) {
    rawPoints[j].t = totalLength > 0 ? rawPoints[j].distance / totalLength : 0;
  }

  // 4. 各IP(VPI)のアライメント上での累積平面距離(dist)をマッピング
  const vpis = points.map((p, i) => {
    const repIdx = repIndices[i] !== undefined ? Math.min(rawPoints.length - 1, repIndices[i]) : 0;
    return {
      index: i,
      id: p.id,
      z: p.z,
      vcl: p.vcl || 0,
      dist: rawPoints[repIdx]?.distance || 0,
    };
  });

  // VPI間での縦断勾配および放物線曲線(Z計画高)の動的計算
  const getVpiGradients = (idx: number) => {
    let g1 = 0;
    let g2 = 0;
    if (idx > 0) {
      const dRange = vpis[idx].dist - vpis[idx - 1].dist;
      g1 = dRange > 0.1 ? (vpis[idx].z - vpis[idx - 1].z) / dRange : 0;
    }
    if (idx < N - 1) {
      const dRange = vpis[idx + 1].dist - vpis[idx].dist;
      g2 = dRange > 0.1 ? (vpis[idx + 1].z - vpis[idx].z) / dRange : 0;
    }
    if (idx === 0) g1 = g2;
    if (idx === N - 1) g2 = g1;
    return { g1, g2 };
  };

  for (let j = 0; j < rawPoints.length; j++) {
    const pt = rawPoints[j];
    const D = pt.distance;

    // どのVPI区間の間に位置するか特定
    let activeVpiIdx = 0;
    for (let i = 0; i < N - 1; i++) {
      if (D >= vpis[i].dist && D <= vpis[i + 1].dist) {
        activeVpiIdx = i;
        break;
      }
    }

    const vpiLeft = vpis[activeVpiIdx];
    const vpiRight = vpis[activeVpiIdx + 1];

    let interpZ = null;
    let isCurve = false;

    // 縦断曲線(VCL放物線)の影響範囲をチェック
    for (let i = 1; i < N - 1; i++) {
      const vpi = vpis[i];
      let vcl = vpi.vcl;
      if (vcl <= 0) continue;

      // 前後セグメントの45%を上限としてVCLを安全クランプ
      const distPrev = vpi.dist - vpis[i - 1].dist;
      const distNext = vpis[i + 1].dist - vpi.dist;
      const maxVcl = 2 * Math.min(distPrev * 0.45, distNext * 0.45);
      if (vcl > maxVcl) {
        vcl = maxVcl;
      }

      const halfVcl = vcl / 2;
      const startD = vpi.dist - halfVcl;
      const endD = vpi.dist + halfVcl;

      if (D >= startD && D <= endD) {
        // 放物線区間に該当
        const { g1, g2 } = getVpiGradients(i);
        const x = D - startD; // 曲線始点からの距離
        const zStart = vpi.z - g1 * halfVcl; // 曲線始点の標高
        
        // 2次放物線の公式
        interpZ = zStart + g1 * x + ((g2 - g1) / (2 * vcl)) * (x * x);
        isCurve = true;
        break;
      }
    }

    // どの縦断放物線内でもなければ直線区間の線形補間
    if (interpZ === null) {
      const dRange = vpiRight.dist - vpiLeft.dist;
      const g = dRange > 0.1 ? (vpiRight.z - vpiLeft.z) / dRange : 0;
      interpZ = vpiLeft.z + g * (D - vpiLeft.dist);
      isCurve = false;
    }

    pt.z = interpZ;
    pt.isVerticalCurve = isCurve;
  }

  // 5. 接線・法線ベクトルの精密な計算と最終点列の構築
  const finalSegmentsCount = rawPoints.length - 1;
  for (let i = 0; i <= finalSegmentsCount; i++) {
    const curr = rawPoints[i];
    const distance = curr.distance;

    // 接線ベクトル (Tangent)
    let dx = 0;
    let dy = 0;
    if (i < finalSegmentsCount) {
      const next = rawPoints[i + 1];
      dx = next.x - curr.x;
      dy = next.y - curr.y;
    } else {
      const prev = rawPoints[i - 1];
      dx = curr.x - prev.x;
      dy = curr.y - prev.y;
    }

    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const tangentX = dx / length;
    const tangentY = dy / length;

    // 左方向の法線ベクトル (Normal)
    const normalX = -tangentY;
    const normalY = tangentX;

    const groundZ = getGroundElevation(curr.x, curr.y);

    alignmentPoints.push({
      station: curr.t,
      distance,
      x: curr.x,
      y: curr.y,
      z: curr.z,
      groundZ,
      tangentX,
      tangentY,
      normalX,
      normalY,
      isVerticalCurve: curr.isVerticalCurve || false,
    });
  }

  return alignmentPoints;
}

/**
 * 盛土・切土の体積（土量）計算
 */
export function calculateVolumes(
  alignment: AlignmentPoint[],
  crossSection: CrossSectionParams,
  sections?: SectionSegment[]
): EngineeringData {
  let cutVolume = 0;
  let fillVolume = 0;
  let totalLength = 0;
  let sumSlope = 0;

  const baseSlope = crossSection.slopeGradient;
  const enablePrismoidal = crossSection.enablePrismoidal !== false; // デフォルトは有効

  // 平均断面法（Average End Area Method）および プリズモイダル（Prismoidal）補正による積算
  for (let i = 0; i < alignment.length - 1; i++) {
    const p1 = alignment[i];
    const p2 = alignment[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    totalLength += segmentLength;

    // 縦断勾配 (%)
    const dz = p2.z - p1.z;
    const slopePct = segmentLength > 0 ? (dz / segmentLength) * 100 : 0;
    sumSlope += Math.abs(slopePct);

    // 断面のセグメントタイプを取得
    const secProps1 = getInterpolatedSectionProperties(p1.distance, sections || [], crossSection);
    const secProps2 = getInterpolatedSectionProperties(p2.distance, sections || [], crossSection);

    // 各端面の幅を計算
    const wLeft1 = secProps1.leftLaneWidth ?? crossSection.leftLaneWidth;
    const wRight1 = secProps1.rightLaneWidth ?? crossSection.rightLaneWidth;
    const sh1 = secProps1.shoulderWidth ?? crossSection.shoulderWidth;
    const roadWidth1 = wLeft1 + wRight1 + sh1 * 2;

    const wLeft2 = secProps2.leftLaneWidth ?? crossSection.leftLaneWidth;
    const wRight2 = secProps2.rightLaneWidth ?? crossSection.rightLaneWidth;
    const sh2 = secProps2.shoulderWidth ?? crossSection.shoulderWidth;
    const roadWidth2 = wLeft2 + wRight2 + sh2 * 2;

    const slope1 = crossSection.slopeGradient;
    const slope2 = crossSection.slopeGradient;

    // 断面1の断面積
    const h1 = p1.z - p1.groundZ;
    let areaFill1 = 0;
    let areaCut1 = 0;
    if (secProps1.type === 'bridge' || secProps1.type === 'viaduct') {
      areaFill1 = 0;
      areaCut1 = 0;
    } else if (secProps1.type === 'tunnel') {
      areaFill1 = 0;
      const tHeight = 5.5;
      areaCut1 = roadWidth1 * tHeight * 0.85;
    } else {
      if (h1 > 0) {
        areaFill1 = roadWidth1 * h1 + (h1 * h1) * slope1;
      } else {
        const absH = Math.abs(h1);
        areaCut1 = roadWidth1 * absH + (absH * absH) * slope1;
      }
    }

    // 断面2の断面積
    const h2 = p2.z - p2.groundZ;
    let areaFill2 = 0;
    let areaCut2 = 0;
    if (secProps2.type === 'bridge' || secProps2.type === 'viaduct') {
      areaFill2 = 0;
      areaCut2 = 0;
    } else if (secProps2.type === 'tunnel') {
      areaFill2 = 0;
      const tHeight = 5.5;
      areaCut2 = roadWidth2 * tHeight * 0.85;
    } else {
      if (h2 > 0) {
        areaFill2 = roadWidth2 * h2 + (h2 * h2) * slope2;
      } else {
        const absH = Math.abs(h2);
        areaCut2 = roadWidth2 * absH + (absH * absH) * slope2;
      }
    }

    // 変化率による閾値判定
    const widthDiffRatio = Math.abs(roadWidth1 - roadWidth2) / Math.max(0.1, roadWidth1);
    const heightDiff = Math.abs(h1 - h2);
    const isTransitionZone = enablePrismoidal && (widthDiffRatio >= 0.15 || heightDiff >= 3.0);

    if (isTransitionZone) {
      // プリズモイダル（錐体台）補正公式の適用: V = L / 6 * (A1 + 4*Am + A2)
      // 中間断面 Am のパラメータを幾何学的に合成
      const hMiddle = (h1 + h2) / 2;
      const roadWidthMiddle = (roadWidth1 + roadWidth2) / 2;
      const slopeMiddle = (slope1 + slope2) / 2;

      // 簡易中間タイプ判定
      const isTunnelMiddle = secProps1.type === 'tunnel' || secProps2.type === 'tunnel';
      const isBridgeMiddle = secProps1.type === 'bridge' || secProps1.type === 'viaduct' || secProps2.type === 'bridge' || secProps2.type === 'viaduct';

      let areaFillMiddle = 0;
      let areaCutMiddle = 0;

      if (isBridgeMiddle) {
        areaFillMiddle = 0;
        areaCutMiddle = 0;
      } else if (isTunnelMiddle) {
        areaFillMiddle = 0;
        const tHeight = 5.5;
        areaCutMiddle = roadWidthMiddle * tHeight * 0.85;
      } else {
        if (hMiddle > 0) {
          areaFillMiddle = roadWidthMiddle * hMiddle + (hMiddle * hMiddle) * slopeMiddle;
        } else {
          const absH = Math.abs(hMiddle);
          areaCutMiddle = roadWidthMiddle * absH + (absH * absH) * slopeMiddle;
        }
      }

      fillVolume += (segmentLength / 6) * (areaFill1 + 4 * areaFillMiddle + areaFill2);
      cutVolume += (segmentLength / 6) * (areaCut1 + 4 * areaCutMiddle + areaCut2);
    } else {
      // 通常の平均断面法
      fillVolume += ((areaFill1 + areaFill2) / 2) * segmentLength;
      cutVolume += ((areaCut1 + areaCut2) / 2) * segmentLength;
    }
  }

  const avgSlope = alignment.length > 1 ? sumSlope / (alignment.length - 1) : 0;

  return {
    cutVolume: Math.round(cutVolume),
    fillVolume: Math.round(fillVolume),
    netVolume: Math.round(fillVolume - cutVolume),
    avgSlope: parseFloat(avgSlope.toFixed(2)),
    totalLength: Math.round(totalLength),
  };
}

/**
 * モックLandXMLを文字列として生成
 * 任意の数のコントロールポイントに対応
 */
export function generateLandXML(
  points: ControlPoint[],
  crossSection: CrossSectionParams,
  alignment: AlignmentPoint[]
): string {
  if (points.length < 2) return '';
  
  const bp = points[0];
  const ep = points[points.length - 1];
  const dateStr = new Date().toISOString().split('T')[0];

  // 線形ジオメトリの線を生成
  let coordGeomLines = '';
  for (let i = 0; i < points.length - 1; i++) {
    const pA = points[i];
    const pB = points[i + 1];
    coordGeomLines += `        <Line name="Segment_${pA.id}_to_${pB.id}">
          <Start>${pA.x.toFixed(3)} ${pA.y.toFixed(3)} ${pA.z.toFixed(3)}</Start>
          <End>${pB.x.toFixed(3)} ${pB.y.toFixed(3)} ${pB.z.toFixed(3)}</End>
        </Line>\n`;
  }

  // 縦断変化点 (PVI) を生成
  let pviLines = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const ratio = i / (points.length - 1);
    const stationIndex = Math.min(alignment.length - 1, Math.round(ratio * (alignment.length - 1)));
    const stationDist = alignment[stationIndex]?.distance || 0;
    pviLines += `          <PVI station="${stationDist.toFixed(3)}">${p.z.toFixed(3)}</PVI>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" 
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
         xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd" 
         version="1.2" 
         date="${dateStr}" 
         time="12:00:00">
  <Project name="CIM_Road_Project_Japan" desc="3D CIM Road Alignment Prototype Output" />
  <Application name="GitNexus CIM AlignPro" version="2.4" manufacturer="Google AI Studio Workspace" />
  <CoordinateSystem desc="JGD2011 / Japan Plane Rectangular CS IX" epsg="6677" />
  
  <Units>
    <Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" angularUnit="decimalDD" directionAngle="bearing" />
  </Units>
  
  <Alignments>
    <Alignment name="CIM_Road_Alignment_01" length="${alignment[alignment.length - 1]?.distance.toFixed(3) || '0.000'}" desc="Horizontal and Vertical Alignment combined">
      <CoordGeom>
${coordGeomLines}      </CoordGeom>
      
      <Profile name="CIM_Vertical_Profile_01">
        <ProfAlign name="Road_Design_Grade">
${pviLines}        </ProfAlign>
      </Profile>
      
      <CrossSects>
        <CrossSect station="0.450">
          <CrossSectSurf name="FinishedGround">
            <PntList>-${(crossSection.leftLaneWidth + crossSection.shoulderWidth).toFixed(3)} -0.020 -${crossSection.leftLaneWidth.toFixed(3)} -0.020 0.000 0.000 ${crossSection.rightLaneWidth.toFixed(3)} -0.020 ${(crossSection.rightLaneWidth + crossSection.shoulderWidth).toFixed(3)} -0.020</PntList>
          </CrossSectSurf>
        </CrossSect>
      </CrossSects>
    </Alignment>
  </Alignments>
</LandXML>`;
}

/**
 * アライメント上の特定の追加距離 (distance) における位置や計画・地盤属性を線形補間する
 */
export function interpolateAlignmentAtDistance(
  alignment: AlignmentPoint[],
  targetDist: number
): AlignmentPoint | null {
  if (alignment.length === 0) return null;
  if (targetDist <= 0) return { ...alignment[0] };
  if (targetDist >= alignment[alignment.length - 1].distance) return { ...alignment[alignment.length - 1] };

  // 二分探索で適切な区間を特定
  let low = 0;
  let high = alignment.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const dist = alignment[mid].distance;
    if (dist === targetDist) {
      return { ...alignment[mid] };
    } else if (dist < targetDist) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const idxA = Math.max(0, high);
  const idxB = Math.min(alignment.length - 1, low);
  if (idxA === idxB) return { ...alignment[idxA] };

  const ptA = alignment[idxA];
  const ptB = alignment[idxB];
  const dRange = ptB.distance - ptA.distance;
  if (dRange === 0) return { ...ptA };

  const t = (targetDist - ptA.distance) / dRange;

  return {
    station: ptA.station + t * (ptB.station - ptA.station),
    distance: targetDist,
    x: ptA.x + t * (ptB.x - ptA.x),
    y: ptA.y + t * (ptB.y - ptA.y),
    z: ptA.z + t * (ptB.z - ptA.z),
    groundZ: ptA.groundZ + t * (ptB.groundZ - ptA.groundZ),
    tangentX: ptA.tangentX + t * (ptB.tangentX - ptA.tangentX),
    tangentY: ptA.tangentY + t * (ptB.tangentY - ptA.tangentY),
    normalX: ptA.normalX + t * (ptB.normalX - ptA.normalX),
    normalY: ptA.normalY + t * (ptB.normalY - ptA.normalY),
  };
}



/**
 * 平面アライメントから、指定された間隔 (20m または 100m) で測点を生成する
 */
export function generateStations(
  alignment: AlignmentPoint[],
  interval: number
): StationPoint[] {
  if (alignment.length === 0) return [];

  const stations: StationPoint[] = [];
  const totalLength = alignment[alignment.length - 1].distance;

  let d = 0;
  let index = 0;

  while (d <= totalLength) {
    const pt = interpolateAlignmentAtDistance(alignment, d);
    if (pt) {
      stations.push({
        name: `No.${index}`,
        distance: d,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        groundZ: pt.groundZ,
        tangentX: pt.tangentX,
        tangentY: pt.tangentY,
        normalX: pt.normalX,
        normalY: pt.normalY,
      });
    }
    d += interval;
    index++;
  }

  // 終点 (EP) を端数付きで追加
  const lastD = stations[stations.length - 1]?.distance || 0;
  if (totalLength > lastD + 0.05) {
    const pt = alignment[alignment.length - 1];
    const prevStationIdx = Math.floor(totalLength / interval);
    const fraction = totalLength - prevStationIdx * interval;
    stations.push({
      name: `EP (No.${prevStationIdx}+${fraction.toFixed(2)}m)`,
      distance: totalLength,
      x: pt.x,
      y: pt.y,
      z: pt.z,
      groundZ: pt.groundZ,
      tangentX: pt.tangentX,
      tangentY: pt.tangentY,
      normalX: pt.normalX,
      normalY: pt.normalY,
    });
  } else if (stations.length > 0) {
    stations[stations.length - 1].name = `EP (${stations[stations.length - 1].name})`;
  }

  return stations;
}

/**
 * 諸元帯（諸元表）用のマージ・ソート配列 (ProfileStationRow[]) を動的生成する
 */
export function generateProfileStationRows(
  points: ControlPoint[],
  alignment: AlignmentPoint[],
  stations: StationPoint[],
  crossSectionParams: CrossSectionParams,
  sections?: SectionSegment[]
): ProfileStationRow[] {
  if (points.length < 2 || alignment.length === 0) return [];

  const totalLength = alignment[alignment.length - 1].distance;
  const N = points.length;

  // 各 IP のアライメント累積距離を特定する (alignment の点から最も近い距離を取得)
  const resolvedVpiDists = points.map((p, idx) => {
    if (idx === 0) return 0;
    if (idx === points.length - 1) return totalLength;
    let minD = Infinity;
    let bestDist = 0;
    alignment.forEach(pt => {
      const d = Math.sqrt((pt.x - p.x) ** 2 + (pt.y - p.y) ** 2);
      if (d < minD) {
        minD = d;
        bestDist = pt.distance;
      }
    });
    return bestDist;
  });

  // 平面曲線幾何変曲点 (BC, EC)、縦断曲線幾何変曲点 (BVC, EVC) の距離リストを作成
  const geomDists: { dist: number; name: string; type: string }[] = [];

  points.forEach((p, i) => {
    const ipDist = resolvedVpiDists[i];
    
    // 平面曲線 (BC, EC)
    const r = p.r || 0;
    if (i > 0 && i < N - 1 && r > 0) {
      const pPrev = points[i - 1];
      const pCurr = points[i];
      const pNext = points[i + 1];
      const dx1 = pCurr.x - pPrev.x;
      const dy1 = pCurr.y - pPrev.y;
      const dx2 = pNext.x - pCurr.x;
      const dy2 = pNext.y - pCurr.y;
      const L1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (L1 > 0.1 && L2 > 0.1) {
        const dot = (dx1 * dx2 + dy1 * dy2) / (L1 * L2);
        const I = Math.acos(Math.max(-1, Math.min(1, dot)));
        let tl = r * Math.tan(I / 2);
        const tlMax = Math.min(L1 * 0.45, L2 * 0.45);
        if (tl > tlMax) tl = tlMax;
        const rActual = tl / Math.tan(I / 2);
        const arcLen = I * rActual;
        
        const bcDist = Math.max(0, ipDist - tl);
        const ecDist = Math.min(totalLength, bcDist + arcLen);

        geomDists.push({ dist: bcDist, name: `BC.${i}`, type: 'BC' });
        geomDists.push({ dist: ecDist, name: `EC.${i}`, type: 'EC' });
      }
    }

    // 縦断曲線 (BVC, EVC)
    const vcl = p.vcl || 0;
    if (i > 0 && i < N - 1 && vcl > 0) {
      const halfVcl = vcl / 2;
      const bvcDist = Math.max(0, ipDist - halfVcl);
      const evcDist = Math.min(totalLength, ipDist + halfVcl);
      
      geomDists.push({ dist: bvcDist, name: `BVC.${i}`, type: 'BVC' });
      geomDists.push({ dist: evcDist, name: `EVC.${i}`, type: 'EVC' });
    }
  });

  // すべてのサンプリング距離点を集める
  const uniqueDists = new Set<number>();
  uniqueDists.add(0);
  uniqueDists.add(totalLength);

  stations.forEach(s => {
    if (s.distance >= 0 && s.distance <= totalLength) {
      uniqueDists.add(s.distance);
    }
  });

  geomDists.forEach(g => {
    if (g.dist >= 0 && g.dist <= totalLength) {
      uniqueDists.add(g.dist);
    }
  });

  // 昇順にソート
  const sortedDists = Array.from(uniqueDists).sort((a, b) => a - b);

  const rows: ProfileStationRow[] = [];

  // Running variables for average end area method
  let prevAreaCut = 0;
  let prevAreaFill = 0;
  let prevAreaPavementWidth = 0;
  let prevAreaWall = 0;
  let prevAreaSlope = 0;
  let cumulativeCostYen = 0;

  const COST_UNIT = {
    cut: 3200,          // 切土: 3,200円 / m3
    fill: 4100,         // 盛土: 4,100円 / m3
    bridge: 1600000,    // 橋梁: 1,600,000円 / m
    viaduct: 1100000,   // 高架橋: 1,100,000円 / m
    tunnel: 3800000,    // トンネル: 3,800,000円 / m
    pavement: 12000,    // 舗装: 12,000円 / m2
    wall: 120000,       // 擁壁コンクリート: 120,000円 / m3
    slope: 8500,        // のり面保護工: 8,500円 / m2
  };

  for (let i = 0; i < sortedDists.length; i++) {
    const dist = sortedDists[i];
    const prevDist = i === 0 ? 0 : sortedDists[i - 1];
    const intervalDist = dist - prevDist;

    const pt = interpolateAlignmentAtDistance(alignment, dist);
    if (!pt) continue;

    let stationName = '';
    const exactStation = stations.find(s => Math.abs(s.distance - dist) < 0.05);
    const exactGeom = geomDists.find(g => Math.abs(g.dist - dist) < 0.05);

    if (dist === 0) {
      stationName = 'BP';
    } else if (Math.abs(dist - totalLength) < 0.05) {
      const prevStationIdx = Math.floor(totalLength / (stations[1]?.distance || 100));
      const fraction = totalLength - prevStationIdx * (stations[1]?.distance || 100);
      stationName = `EP (No.${prevStationIdx}+${fraction.toFixed(2)})`;
    } else if (exactStation) {
      stationName = exactStation.name;
    } else if (exactGeom) {
      const pitch = stations[1]?.distance || 100;
      const prevStationIdx = Math.floor(dist / pitch);
      const fraction = dist - prevStationIdx * pitch;
      stationName = `${exactGeom.name} (No.${prevStationIdx}+${fraction.toFixed(2)})`;
    } else {
      const pitch = stations[1]?.distance || 100;
      const prevStationIdx = Math.floor(dist / pitch);
      const fraction = dist - prevStationIdx * pitch;
      stationName = `No.${prevStationIdx}+${fraction.toFixed(2)}`;
    }

    // 縦断勾配 (%)
    const ptAhead = interpolateAlignmentAtDistance(alignment, Math.min(totalLength, dist + 0.5));
    let slope = 0;
    if (ptAhead && ptAhead.distance > dist) {
      slope = ((ptAhead.z - pt.z) / (ptAhead.distance - dist)) * 100;
    } else {
      const ptBehind = interpolateAlignmentAtDistance(alignment, Math.max(0, dist - 0.5));
      if (ptBehind && dist > ptBehind.distance) {
        slope = ((pt.z - ptBehind.z) / (dist - ptBehind.distance)) * 100;
      }
    }

    // 平面曲率
    let curveType: 'straight' | 'curve-left' | 'curve-right' = 'straight';
    let curveR = 0;
    
    for (let j = 1; j < N - 1; j++) {
      const ipDist = resolvedVpiDists[j];
      const r = points[j].r || 0;
      if (r > 0) {
        const pPrev = points[j - 1];
        const pCurr = points[j];
        const pNext = points[j + 1];
        const dx1 = pCurr.x - pPrev.x;
        const dy1 = pCurr.y - pPrev.y;
        const dx2 = pNext.x - pCurr.x;
        const dy2 = pNext.y - pCurr.y;
        const L1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (L1 > 0.1 && L2 > 0.1) {
          const dot = (dx1 * dx2 + dy1 * dy2) / (L1 * L2);
          const I = Math.acos(Math.max(-1, Math.min(1, dot)));
          let tl = r * Math.tan(I / 2);
          const tlMax = Math.min(L1 * 0.45, L2 * 0.45);
          if (tl > tlMax) tl = tlMax;
          const rActual = tl / Math.tan(I / 2);
          const arcLen = I * rActual;
          const bcDist = Math.max(0, ipDist - tl);
          const ecDist = Math.min(totalLength, bcDist + arcLen);

          if (dist >= bcDist && dist <= ecDist) {
            const cross = dx1 * dy2 - dy1 * dx2;
            curveType = cross > 0 ? 'curve-left' : 'curve-right';
            curveR = rActual;
            break;
          }
        }
      }
    }

    const crossSectionConfig: CrossSectionConfig = {
      leftSlopeStructure: 'auto',
      rightSlopeStructure: 'auto',
      pavementLayers: {
        surface: { material: crossSectionParams.pavementMaterial || 'As表層', thickness: crossSectionParams.pavementThickness || 0.15 },
        base: { material: crossSectionParams.baseMaterial || '粒度調整砕石', thickness: crossSectionParams.baseThickness || 0.30 },
        subgrade: { material: crossSectionParams.subgradeMaterial || '改良土路床', thickness: crossSectionParams.subgradeThickness || 1.00 }
      }
    };

    // Calculate cross-sectional quantities for this point
    const secProps = getInterpolatedSectionProperties(dist, sections || [], crossSectionParams);
    const leftWidth = secProps.leftLaneWidth;
    const rightWidth = secProps.rightLaneWidth;
    const shoulder = secProps.shoulderWidth;
    const roadWidth = leftWidth + rightWidth + shoulder * 2;
    const hDiff = pt.z - pt.groundZ; // FH - GH
    const slopeS = hDiff > 0 ? (crossSectionParams.fillSlopeGradient ?? 1.5) : (crossSectionParams.cutSlopeGradient ?? 1.0);

    let areaCut = 0;
    let areaFill = 0;
    let areaPavementWidth = roadWidth;
    let areaWall = 0;
    let areaSlope = 0;

    if (secProps.type === 'bridge' || secProps.type === 'viaduct') {
      areaCut = 0;
      areaFill = 0;
      areaPavementWidth = roadWidth;
    } else if (secProps.type === 'tunnel') {
      areaFill = 0;
      areaCut = roadWidth * 5.5 * 0.85;
      areaPavementWidth = roadWidth;
    } else {
      // Earthwork section
      if (hDiff > 0) {
        areaFill = roadWidth * hDiff + hDiff * hDiff * slopeS;
      } else if (hDiff < 0) {
        const absH = Math.abs(hDiff);
        areaCut = roadWidth * absH + absH * absH * slopeS;
      }

      // Retaining wall concrete volume estimate (per meter)
      let leftStruct = crossSectionConfig.leftSlopeStructure || 'auto';
      let rightStruct = crossSectionConfig.rightSlopeStructure || 'auto';

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

      let areaLeftWall = 0;
      if (leftStruct === 'gravity') {
        const hWall = Math.min(hDiff, 4.0);
        areaLeftWall = hWall * (0.5 + 0.09 * hWall);
      } else if (leftStruct === 'block') {
        areaLeftWall = Math.abs(hDiff) * 0.447;
      }

      let areaRightWall = 0;
      if (rightStruct === 'gravity') {
        const hWall = Math.min(hDiff, 4.0);
        areaRightWall = hWall * (0.5 + 0.09 * hWall);
      } else if (rightStruct === 'block') {
        areaRightWall = Math.abs(hDiff) * 0.447;
      }

      areaWall = areaLeftWall + areaRightWall;

      // Slope protection area estimate
      const heightDiff = Math.abs(hDiff);
      if (heightDiff > 0.5 && areaWall === 0) {
        const slopeLen = heightDiff * Math.sqrt(1 + slopeS * slopeS);
        areaSlope = slopeLen * 2; // both sides
      }
    }

    // Interval quantities using Average End Area Method
    let intervalCutVolume = 0;
    let intervalFillVolume = 0;
    let intervalPavementArea = 0;
    let intervalWallVolume = 0;
    let intervalSlopeArea = 0;
    let intervalCostYen = 0;

    if (i > 0) {
      const avgAreaCut = (prevAreaCut + areaCut) / 2;
      const avgAreaFill = (prevAreaFill + areaFill) / 2;
      const avgAreaPavementWidth = (prevAreaPavementWidth + areaPavementWidth) / 2;
      const avgAreaWall = (prevAreaWall + areaWall) / 2;
      const avgAreaSlope = (prevAreaSlope + areaSlope) / 2;

      intervalCutVolume = avgAreaCut * intervalDist;
      intervalFillVolume = avgAreaFill * intervalDist;
      intervalPavementArea = avgAreaPavementWidth * intervalDist;
      intervalWallVolume = avgAreaWall * intervalDist;
      intervalSlopeArea = avgAreaSlope * intervalDist;

      // Construction costs (in Yen)
      const cutCost = intervalCutVolume * COST_UNIT.cut;
      const fillCost = intervalFillVolume * COST_UNIT.fill;
      const pavementCost = intervalPavementArea * COST_UNIT.pavement;
      const wallCost = intervalWallVolume * COST_UNIT.wall;
      const slopeCost = intervalSlopeArea * COST_UNIT.slope;

      // Structure costs (in Yen)
      let structureCost = 0;
      if (secProps.type === 'bridge') {
        structureCost = intervalDist * COST_UNIT.bridge;
      } else if (secProps.type === 'viaduct') {
        structureCost = intervalDist * COST_UNIT.viaduct;
      } else if (secProps.type === 'tunnel') {
        structureCost = intervalDist * COST_UNIT.tunnel;
      }

      const intervalCostTotalYen = cutCost + fillCost + pavementCost + wallCost + slopeCost + structureCost;
      intervalCostYen = Math.round(intervalCostTotalYen / 10000); // in 万円
      cumulativeCostYen += intervalCostYen;
    }

    rows.push({
      stationDist: dist,
      stationName,
      intervalDist,
      groundZ: pt.groundZ,
      plannedZ: pt.z,
      diffZ: pt.z - pt.groundZ,
      slope,
      curvature: {
        type: curveType,
        r: curveR
      },
      crossSection: crossSectionConfig,
      intervalCostYen,
      cumulativeCostYen,
      intervalCutVolume: Math.round(intervalCutVolume),
      intervalFillVolume: Math.round(intervalFillVolume),
      intervalWallVolume: Math.round(intervalWallVolume),
      intervalPavementArea: Math.round(intervalPavementArea)
    });

    // Update previous variables for next iteration
    prevAreaCut = areaCut;
    prevAreaFill = areaFill;
    prevAreaPavementWidth = areaPavementWidth;
    prevAreaWall = areaWall;
    prevAreaSlope = areaSlope;
  }

  return rows;
}

/**
 * 道路の特定の追加距離 (dist) における、断面区間のプロパティを線形補間（すり付け）して取得する
 */
export function getInterpolatedSectionProperties(
  dist: number,
  sections: SectionSegment[],
  baseParams: CrossSectionParams,
  transitionLength: number = 15.0
) {
  if (!sections || sections.length === 0) {
    return {
      type: 'earthwork' as const,
      leftLaneWidth: baseParams.leftLaneWidth,
      rightLaneWidth: baseParams.rightLaneWidth,
      shoulderWidth: baseParams.shoulderWidth,
      girderDepth: 1.5,
      pierHeight: 10.0,
      tunnelShape: 'arch' as const,
      liningThickness: 0.5,
    };
  }

  // dist に該当するセグメントを探す
  let activeIdx = -1;
  for (let i = 0; i < sections.length; i++) {
    if (dist >= sections[i].startDist && dist <= sections[i].endDist) {
      activeIdx = i;
      break;
    }
  }

  if (activeIdx === -1) {
    if (dist < sections[0].startDist) activeIdx = 0;
    else activeIdx = sections.length - 1;
  }

  const currentSec = sections[activeIdx];
  
  const currentLeftLane = currentSec.properties.leftLaneWidth ?? baseParams.leftLaneWidth;
  const currentRightLane = currentSec.properties.rightLaneWidth ?? baseParams.rightLaneWidth;
  const currentShoulder = currentSec.properties.shoulderWidth ?? baseParams.shoulderWidth;
  const currentGirderDepth = currentSec.properties.girderDepth ?? 1.5;
  const currentPierHeight = currentSec.properties.pierHeight ?? 10.0;
  const currentTunnelShape = currentSec.properties.tunnelShape ?? 'arch';
  const currentLiningThickness = currentSec.properties.liningThickness ?? 0.5;
  const currentType = currentSec.type;

  // 手前のセグメントとの境界付近でのすり付け
  if (activeIdx > 0) {
    const prevSec = sections[activeIdx - 1];
    const transitionStart = currentSec.startDist;
    const transitionEnd = currentSec.startDist + transitionLength;

    if (dist >= transitionStart && dist <= transitionEnd) {
      const t = (dist - transitionStart) / transitionLength; // 0.0 to 1.0

      const prevLeftLane = prevSec.properties.leftLaneWidth ?? baseParams.leftLaneWidth;
      const prevRightLane = prevSec.properties.rightLaneWidth ?? baseParams.rightLaneWidth;
      const prevShoulder = prevSec.properties.shoulderWidth ?? baseParams.shoulderWidth;
      const prevGirderDepth = prevSec.properties.girderDepth ?? 1.5;
      const prevPierHeight = prevSec.properties.pierHeight ?? 10.0;
      const prevTunnelShape = prevSec.properties.tunnelShape ?? 'arch';
      const prevLiningThickness = prevSec.properties.liningThickness ?? 0.5;

      return {
        type: t < 0.5 ? prevSec.type : currentSec.type, // タイプは中間地点で切り替える
        leftLaneWidth: prevLeftLane + (currentLeftLane - prevLeftLane) * t,
        rightLaneWidth: prevRightLane + (currentRightLane - prevRightLane) * t,
        shoulderWidth: prevShoulder + (currentShoulder - prevShoulder) * t,
        girderDepth: prevGirderDepth + (currentGirderDepth - prevGirderDepth) * t,
        pierHeight: prevPierHeight + (currentPierHeight - prevPierHeight) * t,
        tunnelShape: t < 0.5 ? prevTunnelShape : currentTunnelShape,
        liningThickness: prevLiningThickness + (currentLiningThickness - prevLiningThickness) * t,
      };
    }
  }

  // 次のセグメントの手前（境界手前）でのすり付け（次のセグメントの開始時にもカバーされますが念のため）
  return {
    type: currentType,
    leftLaneWidth: currentLeftLane,
    rightLaneWidth: currentRightLane,
    shoulderWidth: currentShoulder,
    girderDepth: currentGirderDepth,
    pierHeight: currentPierHeight,
    tunnelShape: currentTunnelShape,
    liningThickness: currentLiningThickness,
  };
}

export interface SlopePoint {
  y: number;
  z: number;
  type: string;
}

/**
 * 切盛個別のり面・5mごと1m小段（多段法面）断面頂点算出エンジン
 */
export function calculateMultiStageSlope(
  yStart: number,
  zStart: number,
  isLeft: boolean,
  alignmentPt: AlignmentPoint,
  baseParams: CrossSectionParams,
  bermInterval: number = 5.0,
  bermWidth: number = 1.0,
  secType?: 'earthwork' | 'bridge' | 'viaduct' | 'tunnel'
): SlopePoint[] {
  const points: SlopePoint[] = [{ y: yStart, z: zStart, type: "start" }];
  
  // トンネルや橋梁、高架橋区間では通常ののり面（法面）計算を完全に無効化し、開始点のみを返す
  if (secType && secType !== 'earthwork') {
    return points;
  }
  
  const yDir = isLeft ? 1 : -1; // 左側は中心から法線方向（プラス）、右側はマイナス方向
  const sampleGroundZ = (yOffset: number) => {
    const sampleX = alignmentPt.x + yOffset * alignmentPt.normalX;
    const sampleY = alignmentPt.y + yOffset * alignmentPt.normalY;
    return getGroundElevation(sampleX, sampleY);
  };

  const initialGroundZ = sampleGroundZ(yStart * yDir);
  const isFill = zStart >= initialGroundZ;
  
  const sRatio = isFill 
    ? (baseParams.fillSlopeGradient ?? 1.5) 
    : (baseParams.cutSlopeGradient ?? 1.0);
  
  const zDir = isFill ? -1 : 1; // 盛土は下向き、切土は上向き

  let currentY = yStart;
  let currentZ = zStart;
  let stageCount = 0;
  const maxStages = 15; // 安全ガード

  const enableMultiStage = baseParams.enableMultiStageSlope ?? true;

  while (stageCount < maxStages) {
    stageCount++;
    
    // このステージの終点Z (小段を入れる高さ)
    const stageTargetZ = zStart + zDir * (stageCount * bermInterval);
    
    // 細かく y を伸ばしていき、のり面線と地盤高 Z_ground(y) の交点を探索する
    const stepY = 0.2;
    let found = false;
    let intersectY = currentY;
    let intersectZ = currentZ;

    const stageMaxDeltaY = bermInterval * sRatio;
    const steps = Math.ceil(stageMaxDeltaY / stepY);

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const testY = currentY + t * stageMaxDeltaY;
      const testZ = currentZ + zDir * (t * bermInterval);

      const gZ = sampleGroundZ(testY * yDir);

      if ((isFill && testZ <= gZ) || (!isFill && testZ >= gZ)) {
        intersectY = testY;
        intersectZ = gZ;
        found = true;
        break;
      }
    }

    if (found) {
      points.push({ y: intersectY, z: intersectZ, type: isFill ? "toe_fill" : "toe_cut" });
      break;
    } else {
      if (!enableMultiStage) {
        // 多段化が無効な場合は交差するまで伸ばす
        let hit = false;
        for (let testY = currentY; testY < currentY + 120; testY += 0.5) {
          const testZ = currentZ + (testY - currentY) * (zDir / sRatio);
          const gZ = sampleGroundZ(testY * yDir);
          if ((isFill && testZ <= gZ) || (!isFill && testZ >= gZ)) {
            points.push({ y: testY, z: gZ, type: isFill ? "toe_fill" : "toe_cut" });
            hit = true;
            break;
          }
        }
        if (!hit) {
          const testY = currentY + 30;
          const testZ = currentZ + 30 * (zDir / sRatio);
          points.push({ y: testY, z: testZ, type: "toe_limit" });
        }
        break;
      }

      // 小段を入れる
      const nextY = currentY + stageMaxDeltaY;
      const nextZ = stageTargetZ;
      points.push({ y: nextY, z: nextZ, type: `berm_start_stage${stageCount}` });

      // 小段排水溝（U字溝）
      if (baseParams.enableBermDitch) {
        const ditchW = 0.3;
        const ditchD = 0.2;
        points.push(
          { y: nextY + 0.1, z: nextZ, type: `ditch` },
          { y: nextY + 0.1, z: nextZ - ditchD, type: `ditch` },
          { y: nextY + 0.1 + ditchW, z: nextZ - ditchD, type: `ditch` },
          { y: nextY + 0.1 + ditchW, z: nextZ, type: `ditch` }
        );
      }

      currentY = nextY + bermWidth;
      currentZ = nextZ;
      points.push({ y: currentY, z: currentZ, type: `berm_end_stage${stageCount}` });
    }
  }

  return points;
}

/**
 * 国土地理院の換算式に基づく高精度平面直交座標 (JGD2011 / GRS80) への変換
 * x_math: 東方向 (m)
 * y_math: 北方向 (m)
 */
export function lngLatToAbsoluteJGD(lng: number, lat: number, zoneNum: number): { x: number; y: number } {
  const zone = COORDINATE_ZONES.find(z => z.zone === zoneNum) || COORDINATE_ZONES[1]; // デフォルト2系
  
  const deg2rad = Math.PI / 180;
  const phi = lat * deg2rad;
  const lambda = lng * deg2rad;
  const phi0 = zone.lat * deg2rad;
  const lambda0 = zone.lng * deg2rad;

  const a = 6378137.0; // GRS80長半径
  const f = 1.0 / 298.257222101; // 扁平率
  const e2 = f * (2 - f); // 第一偏心率二乗
  const m0 = 0.9999; // 基準子午線上の縮尺係数

  const cos_phi = Math.cos(phi);
  const sin_phi = Math.sin(phi);

  const N = a / Math.sqrt(1 - e2 * sin_phi * sin_phi);

  const A = 1 + (3/4)*e2 + (45/64)*e2*e2 + (175/256)*Math.pow(e2,3);
  const B = (3/4)*e2 + (15/16)*e2*e2 + (525/512)*Math.pow(e2,3);
  const C = (15/64)*e2*e2 + (105/256)*Math.pow(e2,3);
  const D = (35/512)*Math.pow(e2,3);

  const S = a * (1 - e2) * (
    A * (phi - phi0) -
    B/2 * (Math.sin(2*phi) - Math.sin(2*phi0)) +
    C/4 * (Math.sin(4*phi) - Math.sin(4*phi0)) -
    D/6 * (Math.sin(6*phi) - Math.sin(6*phi0))
  );

  const d_lambda = lambda - lambda0;
  const t = Math.tan(phi);
  const eta2 = e2 / (1 - e2) * cos_phi * cos_phi;

  // y_jgd (北方向、JGDのX座標)
  const term_y1 = S;
  const term_y2 = (d_lambda * d_lambda / 2) * N * sin_phi * cos_phi;
  const term_y3 = (Math.pow(d_lambda, 4) / 24) * N * sin_phi * Math.pow(cos_phi, 3) * (5 - t*t + 9*eta2 + 4*eta2*eta2);
  const y_jgd = m0 * (term_y1 + term_y2 + term_y3);

  // x_jgd (東方向、JGDのY座標)
  const term_x1 = d_lambda * N * cos_phi;
  const term_x2 = (Math.pow(d_lambda, 3) / 6) * N * Math.pow(cos_phi, 3) * (1 - t*t + eta2);
  const term_x3 = (Math.pow(d_lambda, 5) / 120) * N * Math.pow(cos_phi, 5) * (5 - 18*t*t + Math.pow(t, 4) + 14*eta2 - 58*t*t*eta2);
  const x_jgd = m0 * (term_x1 + term_x2 + term_x3);

  return {
    x: x_jgd, // 東方向＝数学上のX座標
    y: y_jgd  // 北方向＝数学上のY座標
  };
}

/**
 * 高精度平面直交座標 (JGD2011 / GRS80) から経緯度への変換
 */
export function absoluteJGDToLngLat(x: number, y: number, zoneNum: number): { lng: number; lat: number } {
  const zone = COORDINATE_ZONES.find(z => z.zone === zoneNum) || COORDINATE_ZONES[1]; // デフォルト2系
  const deg2rad = Math.PI / 180;
  const phi0 = zone.lat * deg2rad;
  const lambda0 = zone.lng * deg2rad;

  const a = 6378137.0; // GRS80
  const f = 1.0 / 298.257222101;
  const e2 = f * (2 - f);
  const m0 = 0.9999;

  const S = y / m0;

  let phi1 = phi0 + S / (a * (1 - e2)); // 初期推定
  const A = 1 + (3/4)*e2 + (45/64)*e2*e2 + (175/256)*Math.pow(e2,3);
  const B = (3/4)*e2 + (15/16)*e2*e2 + (525/512)*Math.pow(e2,3);
  const C = (15/64)*e2*e2 + (105/256)*Math.pow(e2,3);
  const D = (35/512)*Math.pow(e2,3);

  for (let iter = 0; iter < 5; iter++) {
    const S_current = a * (1 - e2) * (
      A * (phi1 - phi0) -
      B/2 * (Math.sin(2*phi1) - Math.sin(2*phi0)) +
      C/4 * (Math.sin(4*phi1) - Math.sin(4*phi0)) -
      D/6 * (Math.sin(6*phi1) - Math.sin(6*phi0))
    );
    const dS = S - S_current;
    const sin_phi1 = Math.sin(phi1);
    const M1 = a * (1 - e2) / Math.pow(1 - e2 * sin_phi1 * sin_phi1, 1.5);
    phi1 += dS / M1;
  }

  const cos_phi1 = Math.cos(phi1);
  const sin_phi1 = Math.sin(phi1);
  const t1 = Math.tan(phi1);
  const eta1_2 = e2 / (1 - e2) * cos_phi1 * cos_phi1;

  const N1 = a / Math.sqrt(1 - e2 * sin_phi1 * sin_phi1);
  const M1 = a * (1 - e2) / Math.pow(1 - e2 * sin_phi1 * sin_phi1, 1.5);

  const x_jgd = x / m0;

  const lat_term1 = (t1 * x_jgd * x_jgd) / (2 * M1 * N1);
  const lat_term2 = (t1 * Math.pow(x_jgd, 4)) / (24 * M1 * Math.pow(N1, 3)) * (5 + 3*t1*t1 + eta1_2 - 9*eta1_2*t1*t1 - 4*eta1_2*eta1_2);
  const lat_rad = phi1 - lat_term1 + lat_term2;

  const lng_term1 = x_jgd / (N1 * cos_phi1);
  const lng_term2 = Math.pow(x_jgd, 3) / (6 * Math.pow(N1, 3) * cos_phi1) * (1 + 2*t1*t1 + eta1_2);
  const lng_term3 = Math.pow(x_jgd, 5) / (120 * Math.pow(N1, 5) * cos_phi1) * (5 + 28*t1*t1 + 24*Math.pow(t1, 4) + 6*eta1_2 + 8*eta1_2*t1*t1);
  const lng_rad = lambda0 + lng_term1 - lng_term2 + lng_term3;

  return {
    lng: lng_rad / deg2rad,
    lat: lat_rad / deg2rad
  };
}

export interface TunnelStandardSection {
  shape: 'arch' | 'box';
  width: number;
  height: number;
  liningThickness: number;
  innerPoints: { x: number; y: number }[];
  outerPoints: { x: number; y: number }[];
}

/**
 * トンネル標準断面（アーチ型・ボックス型）の形状に基づき、内空・外空の2D物理断面頂点群を自動生成する関数
 */
export function getTunnelStandardSection(
  roadWidth: number,
  liningThickness: number = 0.3,
  shape: 'arch' | 'box' = 'arch',
  tunnelHeight: number = 5.5
): TunnelStandardSection {
  const innerRadius = roadWidth * 0.5 + 0.6;
  const outerRadius = innerRadius + liningThickness;
  const innerPoints: { x: number; y: number }[] = [];
  const outerPoints: { x: number; y: number }[] = [];

  const centerOffsetX = 0;
  const invertY = -1.5;

  if (shape === 'box') {
    // 四角形ボックス断面
    innerPoints.push(
      { x: -innerRadius, y: invertY },
      { x: -innerRadius, y: invertY + tunnelHeight },
      { x: innerRadius, y: invertY + tunnelHeight },
      { x: innerRadius, y: invertY }
    );
    outerPoints.push(
      { x: -innerRadius - liningThickness, y: invertY - liningThickness },
      { x: -innerRadius - liningThickness, y: invertY + tunnelHeight + liningThickness },
      { x: innerRadius + liningThickness, y: invertY + tunnelHeight + liningThickness },
      { x: innerRadius + liningThickness, y: invertY - liningThickness }
    );
  } else {
    // 半円アーチ断面 (円弧補間)
    const centerOffsetY = 1.0;
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const rad = (-10 + (200 / steps) * i) * Math.PI / 180;
      innerPoints.push({
        x: centerOffsetX + innerRadius * Math.cos(rad),
        y: centerOffsetY + innerRadius * Math.sin(rad)
      });
      outerPoints.push({
        x: centerOffsetX + outerRadius * Math.cos(rad),
        y: centerOffsetY + outerRadius * Math.sin(rad)
      });
    }
  }

  return {
    shape,
    width: roadWidth,
    height: tunnelHeight,
    liningThickness,
    innerPoints,
    outerPoints
  };
}

/**
 * 縦断線形アライメントと現況地盤高の差（切土高）を解析し、
 * 切土深さが閾値（例: 8.0m）を超える区間を自動検出し、
 * トンネル区間（SectionSegment）へ自動切り替え・上書き更新する関数。
 */
export function autoDetectAndApplyTunnelSections(
  alignment: AlignmentPoint[],
  currentSections: SectionSegment[],
  thresholdDepth: number = 8.0
): SectionSegment[] {
  if (!alignment || alignment.length === 0) return currentSections;

  // 1. アライメント各点において「トンネルにするべきか（計画高が地盤高より一定以上低い）」を判定
  const isTunnelPoint = alignment.map(pt => {
    const depth = pt.groundZ - pt.z; // 切土深さ
    return depth >= thresholdDepth;
  });

  // 連続するトンネル区間の開始と終了（distance）をグルーピング
  const detectedRanges: { start: number; end: number }[] = [];
  let inTunnel = false;
  let startDist = 0;

  for (let i = 0; i < alignment.length; i++) {
    const pt = alignment[i];
    const wantTunnel = isTunnelPoint[i];

    if (wantTunnel && !inTunnel) {
      inTunnel = true;
      startDist = pt.distance;
    } else if (!wantTunnel && inTunnel) {
      inTunnel = false;
      detectedRanges.push({ start: startDist, end: pt.distance });
    }
  }
  if (inTunnel) {
    detectedRanges.push({ start: startDist, end: alignment[alignment.length - 1].distance });
  }

  // 2. 既存の sections をベースに再構築
  // 手動で設定された固定の bridge や viaduct などの区間を保護するため、
  // 既存セグメントのうち bridge/viaduct の位置を特定し、それ以外の区間を土工 or トンネルとして再構築する。
  const structures = currentSections.filter(s => s.type === 'bridge' || s.type === 'viaduct');
  
  // 距離順にソート
  structures.sort((a, b) => a.startDist - b.startDist);

  const totalLength = alignment[alignment.length - 1]?.distance || 0;
  const baseIntervals: { start: number; end: number; type: 'earthwork' | 'bridge' | 'viaduct' | 'tunnel'; original?: SectionSegment }[] = [];
  
  let lastDist = 0;
  for (const struct of structures) {
    if (struct.startDist > lastDist) {
      baseIntervals.push({ start: lastDist, end: struct.startDist, type: 'earthwork' });
    }
    baseIntervals.push({ start: struct.startDist, end: struct.endDist, type: struct.type, original: struct });
    lastDist = struct.endDist;
  }
  if (lastDist < totalLength) {
    baseIntervals.push({ start: lastDist, end: totalLength, type: 'earthwork' });
  }

  const finalSections: SectionSegment[] = [];
  let idCounter = 1;

  for (const interval of baseIntervals) {
    if (interval.type !== 'earthwork') {
      // 橋梁・高架橋はそのまま追加
      finalSections.push({
        ...interval.original!,
        id: `sec-auto-${idCounter++}`
      });
      continue;
    }

    // 土工区間の中でトンネル検出区間と重なる部分を処理
    let subDist = interval.start;
    const intervalTunnels = detectedRanges.filter(r => r.end > interval.start && r.start < interval.end);

    // 重なるトンネル区間を昇順ソート
    intervalTunnels.sort((a, b) => a.start - b.start);

    for (const tRange of intervalTunnels) {
      const tStart = Math.max(interval.start, tRange.start);
      const tEnd = Math.min(interval.end, tRange.end);

      if (tStart > subDist + 0.1) {
        // トンネル前の土工区間
        finalSections.push({
          id: `sec-auto-${idCounter++}`,
          startDist: parseFloat(subDist.toFixed(1)),
          endDist: parseFloat(tStart.toFixed(1)),
          type: 'earthwork',
          properties: {}
        });
      }

      // トンネル区間
      finalSections.push({
        id: `sec-auto-${idCounter++}`,
        startDist: parseFloat(tStart.toFixed(1)),
        endDist: parseFloat(tEnd.toFixed(1)),
        type: 'tunnel',
        properties: {
          tunnelShape: 'arch',
          liningThickness: 0.3,
          tunnelHeight: 5.5
        }
      });

      subDist = tEnd;
    }

    if (subDist + 0.1 < interval.end) {
      // トンネル後の残り土工区間
      finalSections.push({
        id: `sec-auto-${idCounter++}`,
        startDist: parseFloat(subDist.toFixed(1)),
        endDist: parseFloat(interval.end.toFixed(1)),
        type: 'earthwork',
        properties: {}
      });
    }
  }

  // 隣接する同じタイプのセグメントをマージして整理する
  const mergedSections: SectionSegment[] = [];
  for (const sec of finalSections) {
    if (sec.startDist >= sec.endDist) continue; // 空セグメントは除外

    if (mergedSections.length > 0) {
      const last = mergedSections[mergedSections.length - 1];
      if (last.type === sec.type && last.type === 'earthwork') {
        // 同じ earthwork なのでマージ
        last.endDist = sec.endDist;
        continue;
      }
    }
    mergedSections.push(sec);
  }

  // IDの振り直し
  return mergedSections.map((sec, idx) => ({
    ...sec,
    id: `sec-gen-${idx + 1}`
  }));
}

/**
 * 縦断勾配と各コントロールポイントの高さ(Z計画高)を自動調整し、
 * 「総土量(切土量 + 盛土量)の最小化」および「切盛バランス(過不足ゼロ)の極大化」
 * を同時に達成する超高速のAI駆動型山登り最適化アルゴリズム。
 * 隣接する点間の勾配が制限(8% / 10%)を超えた場合の自動ペナルティや、
 * 始終端の接続拘束、土工区間での極端な乖離を防ぐ拘束条件を組み込んでいます。
 */
export function optimizeLongitudinalProfile(
  points: ControlPoint[],
  crossSection: CrossSectionParams,
  sections: SectionSegment[]
): {
  optimizedPoints: ControlPoint[];
  log: string[];
  initialVolume: { cut: number; fill: number };
  optimizedVolume: { cut: number; fill: number };
} {
  const clonePoints = (pts: ControlPoint[]): ControlPoint[] => {
    return pts.map(p => ({ ...p }));
  };

  // コスト評価関数 (山登り法における損失関数)
  const evaluate = (pts: ControlPoint[]): { cost: number; cutVolume: number; fillVolume: number; maxSlope: number } => {
    // 探索中は計算速度を重視するため、サンプリング点数を30点にして高速化 (実アライメントは60点)
    const alignment = calculateAlignment(pts, crossSection, 30);
    const vols = calculateVolumes(alignment, crossSection, sections);
    
    const totalVolume = vols.cutVolume + vols.fillVolume;
    const balance = Math.abs(vols.cutVolume - vols.fillVolume);
    
    // コスト = 総土量 (Cut+Fill) * 1.0 + 切盛差の絶対値 * 1.3
    let cost = totalVolume * 1.0 + balance * 1.3;

    // 制約1: 縦断勾配ペナルティ (勾配が8%を超えたら軽度のペナルティ、10%を超えたら重度のペナルティ)
    let maxSlope = 0;
    for (let i = 0; i < alignment.length - 1; i++) {
      const pt1 = alignment[i];
      const pt2 = alignment[i + 1];
      const dx = pt2.x - pt1.x;
      const dy = pt2.y - pt1.y;
      const hDist = Math.sqrt(dx * dx + dy * dy);
      if (hDist > 0.1) {
        const slope = Math.abs((pt2.z - pt1.z) / hDist) * 100;
        if (slope > maxSlope) maxSlope = slope;
        
        if (slope > 8.0) {
          cost += (slope - 8.0) * 400000;
        }
        if (slope > 10.0) {
          cost += (slope - 10.0) * 4000000;
        }
      }
    }

    // 制約2: 地盤乖離ペナルティ (土工区間で高低差が12mを超えた場合ののり面大崩落・法面長増大防止)
    for (let i = 0; i < alignment.length; i++) {
      const pt = alignment[i];
      const secProps = getInterpolatedSectionProperties(pt.distance, sections, crossSection);
      if (secProps.type === 'earthwork') {
        const diff = Math.abs(pt.z - pt.groundZ);
        if (diff > 12.0) {
          cost += (diff - 12.0) * 8000;
        }
      }
    }

    return { cost, cutVolume: vols.cutVolume, fillVolume: vols.fillVolume, maxSlope };
  };

  const N = points.length;
  if (N < 2) {
    return {
      optimizedPoints: points,
      log: ["コントロールポイントが不足しているため、最適化をスキップしました。"],
      initialVolume: { cut: 0, fill: 0 },
      optimizedVolume: { cut: 0, fill: 0 }
    };
  }

  // 初期評価
  let currentPoints = clonePoints(points);
  let currentEval = evaluate(currentPoints);
  const initialVolume = { cut: currentEval.cutVolume, fill: currentEval.fillVolume };
  
  const log: string[] = [
    `初期設計状態: 総土量 = ${(currentEval.cutVolume + currentEval.fillVolume).toLocaleString()} m³ (切土: ${currentEval.cutVolume.toLocaleString()} m³, 盛土: ${currentEval.fillVolume.toLocaleString()} m³ / 最大縦断勾配: ${currentEval.maxSlope.toFixed(2)}%)`
  ];

  // 探索用のパラメータ設定 (段階的にステップ幅を小さくしていくことで局所解を回避)
  const steps = [4.0, 2.0, 1.0, 0.5, 0.2, 0.1, 0.05];
  const maxIterationsPerStep = 6;
  
  // 各IPのZ可変バウンディングボックス (始点/終点は設計拘束のため元の高さから±1.5m以内、中間IPは縦断の自由度が高いため±15.0m)
  const bounds = points.map((pt, idx) => {
    const isBoundEnd = idx === 0 || idx === N - 1;
    return {
      min: pt.z - (isBoundEnd ? 1.5 : 15.0),
      max: pt.z + (isBoundEnd ? 1.5 : 15.0)
    };
  });

  let overallIterations = 0;

  for (const stepSize of steps) {
    let stepLogAdded = false;
    
    for (let iter = 0; iter < maxIterationsPerStep; iter++) {
      let anyImprovement = false;
      
      for (let i = 0; i < N; i++) {
        const originalZ = currentPoints[i].z;

        // パターンA: 計画高を上げる (+stepSize)
        const upZ = Math.min(bounds[i].max, originalZ + stepSize);
        if (upZ !== originalZ) {
          currentPoints[i].z = upZ;
          const evalUp = evaluate(currentPoints);
          if (evalUp.cost < currentEval.cost) {
            currentEval = evalUp;
            anyImprovement = true;
            overallIterations++;
            continue;
          }
        }

        // パターンB: 計画高を下げる (-stepSize)
        const downZ = Math.max(bounds[i].min, originalZ - stepSize);
        if (downZ !== originalZ) {
          currentPoints[i].z = downZ;
          const evalDown = evaluate(currentPoints);
          if (evalDown.cost < currentEval.cost) {
            currentEval = evalDown;
            anyImprovement = true;
            overallIterations++;
            continue;
          }
        }

        // どちらも改善しない場合は元に戻す
        currentPoints[i].z = originalZ;
      }

      if (!anyImprovement) {
        // このステップ幅において最適解に収束したため、次の細かいステップへ進む
        break;
      }
      
      if (!stepLogAdded) {
        log.push(`調整 [ステップ幅: ${stepSize}m]: 総土量 = ${(currentEval.cutVolume + currentEval.fillVolume).toLocaleString()} m³ (最大勾配: ${currentEval.maxSlope.toFixed(2)}%)`);
        stepLogAdded = true;
      }
    }
  }

  // 最終的なアライメントの計算 (実精度60点で再計算)
  const finalAlignment = calculateAlignment(currentPoints, crossSection, 60);
  const finalVols = calculateVolumes(finalAlignment, crossSection, sections);
  const maxSlopeFinal = currentEval.maxSlope; // 最適化された最高傾斜

  log.push(`最適化完了 (合計微調整回数: ${overallIterations}回)`);
  log.push(`最適化後の状態: 総土量 = ${(finalVols.cutVolume + finalVols.fillVolume).toLocaleString()} m³ (切土: ${finalVols.cutVolume.toLocaleString()} m³, 盛土: ${finalVols.fillVolume.toLocaleString()} m³ / 最大勾配: ${maxSlopeFinal.toFixed(2)}%)`);

  return {
    optimizedPoints: currentPoints,
    log,
    initialVolume,
    optimizedVolume: { cut: finalVols.cutVolume, fill: finalVols.fillVolume }
  };
}


