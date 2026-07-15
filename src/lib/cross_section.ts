import { SectionSegment, CrossSectionConfig, CrossSectionParams, AlignmentPoint } from '../types';
import { getGroundElevation } from './terrain';

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

