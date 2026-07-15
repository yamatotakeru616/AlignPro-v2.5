import { ControlPoint, ProfileStationRow, CrossSectionParams, AlignmentPoint } from '../types';
import { getGlobalBaseCoords } from './coordinate';

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

