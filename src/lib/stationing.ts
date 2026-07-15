import { ControlPoint, AlignmentPoint, StationPoint, ProfileStationRow, CrossSectionParams, SectionSegment, CrossSectionConfig } from '../types';
import { xyToLngLat } from './coordinate';
import { getGroundElevation } from './terrain';
import { interpolateAlignmentAtDistance } from './alignment';
import { getInterpolatedSectionProperties, calculateMultiStageSlope } from './cross_section';

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

