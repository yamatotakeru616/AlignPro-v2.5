import { ControlPoint, AlignmentPoint, EngineeringData, CrossSectionParams, SectionSegment } from '../types';
import { lngLatToXY, xyToLngLat } from './coordinate';
import { getGroundElevation } from './terrain';
import { calculateVolumes } from './earthwork';
import { getInterpolatedSectionProperties } from './cross_section';

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



