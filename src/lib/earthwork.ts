import { AlignmentPoint, EngineeringData, CrossSectionParams, SectionSegment } from '../types';
import { getInterpolatedSectionProperties } from './cross_section';

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

