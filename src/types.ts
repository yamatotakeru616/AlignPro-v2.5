/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ControlPoint {
  id: string;
  name: string;
  lng: number; // 経度 (Map用)
  lat: number; // 緯度 (Map用)
  x: number;   // 平面直交座標 X (m)
  y: number;   // 平面直交座標 Y (m)
  z: number;   // 計画高 H (m)
  r?: number;  // 曲線半径 R (m) (IP交点用、0で直線)
  vcl?: number; // 縦断曲線長 VCL (m) (放物線用、0で直線)
}

export interface CrossSectionParams {
  leftLaneWidth: number;   // 左車線幅 (m) (2.0 - 5.0)
  rightLaneWidth: number;  // 右車線幅 (m) (2.0 - 5.0)
  shoulderWidth: number;   // 路肩幅 (m) (0.5 - 2.5)
  slopeGradient: number;   // 法面勾配 S (1:S) (0.5 - 3.0)
  pavementThickness?: number; // 舗装層の厚み (m)
  pavementMaterial?: string;  // 舗装材料タイプ
  baseThickness?: number;     // 路盤層の厚み (m)
  baseMaterial?: string;      // 路盤材料タイプ
  subgradeThickness?: number; // 路床層の厚み (m)
  subgradeMaterial?: string;  // 路床材料タイプ
  leftSlopeStructure?: 'auto' | 'none' | 'gravity' | 'block';
  rightSlopeStructure?: 'auto' | 'none' | 'gravity' | 'block';
  
  // 新規：切盛個別・多段のり面設計パラメータ
  cutSlopeGradient?: number;     // 切土勾配 S (1:S)
  fillSlopeGradient?: number;    // 盛土勾配 S (1:S)
  enableMultiStageSlope?: boolean; // 多段のり面有効化
  bermInterval?: number;         // 小段の垂直設置間隔 (m)
  bermWidth?: number;            // 小段の水平幅 (m)
  enableBermDitch?: boolean;     // 小段排水溝 (U字溝) 有効化

  // 集水桝（catch basins）配置・タイプ設定パラメータ
  inletSpacing?: number;          // 集水桝の配置間隔 (m)
  inletType?: 'standard' | 'large' | 'grated' | 'high_capacity'; // 桝タイプ
  inletCapacityStandard?: number;  // 標準桝能力 (L/s)
  inletCapacityLarge?: number;     // 大型桝能力 (L/s)
  inletCapacityGrated?: number;    // グレーチング桝能力 (L/s)
  inletCapacityHighCapacity?: number; // 高吸込型桝能力 (L/s)

  // 先進追加機能：環境・構造・劣化・カメラ用パラメータ
  rainfallIntensity?: number;      // 時間降雨強度 (mm/h) (30 - 120)
  speedKmH?: number;               // 設計速度 (km/h) (30 - 120)
  trafficVolumePerHour?: number;   // 予測交通量 (台/h)
  yearsElapsed?: number;           // 完成からの経過年数 (年) (0 - 100)
  pileDiameter?: number;           // 杭径 (m) (0.5 - 2.5)
  pileLength?: number;             // 杭長 (m) (5.0 - 40.0)
  pileCountPerPier?: number;       // 橋脚1基あたりの基礎杭本数 (2 - 16)
  showTripleView?: boolean;        // 3画面DVRマルチビュー表示
  smoothCamera?: boolean;          // カメラ姿勢の球面線形補間（Squad）フィルター有効化
  enablePrismoidal?: boolean;      // プリズモイダル（錐体台）補正公式の適用
  enableSlopeFitting?: boolean;    // 地盤へののり先のり肩すり付け境界生成
  noiseBarrierHeight?: number;     // 防音壁高 (m)
  crossSlope?: number;             // 横断勾配 (比率、例: 0.02)
  enableNoiseBarrier?: boolean;    // 防音壁有効化フラグ
}

// 新規：断面区間
export interface SectionSegment {
  id: string;
  startDist: number;
  endDist: number;
  type: 'earthwork' | 'bridge' | 'viaduct' | 'tunnel';
  properties: {
    leftLaneWidth?: number;
    rightLaneWidth?: number;
    shoulderWidth?: number;
    girderDepth?: number;
    pierType?: string;
    pierHeight?: number;
    tunnelShape?: 'arch' | 'box';
    liningThickness?: number; // 覆工厚み (m)
    tunnelHeight?: number;    // トンネル高さ (m)
    tunnelWidth?: number;     // トンネル幅 (m)
  };
}

export interface AlignmentPoint {
  station: number; // 0.0 to 1.0 (追加距離比率)
  distance: number; // 起点からの実距離 (m)
  x: number;       // X 座標 (m)
  y: number;       // Y 座標 (m)
  z: number;       // 計画高 (m)
  groundZ: number; // 地盤高 (m)
  tangentX: number; // 接線方向 X
  tangentY: number; // 接線方向 Y
  normalX: number;  // 法線方向 X (左方向)
  normalY: number;  // 法線方向 Y
  isVerticalCurve?: boolean; // 縦断曲線区間（放物線）かどうか
}

export interface EngineeringData {
  cutVolume: number;  // 切土量 (m3)
  fillVolume: number; // 盛土量 (m3)
  netVolume: number;  // 差引土量 (m3)
  avgSlope: number;   // 平均勾配 (%)
  totalLength: number; // 道路総延長 (m)
}

export interface StationPoint {
  name: string;      // 測点名 (例: No.0, No.1, No.1+15.5)
  distance: number;  // 起点からの距離 (m)
  x: number;
  y: number;
  z: number;         // 計画高 (m)
  groundZ: number;   // 地盤高 (m)
  tangentX: number;
  tangentY: number;
  normalX: number;
  normalY: number;
}

// 横断構成および構造物の個別設定定義
export interface CrossSectionConfig {
  // 幅員の上書き設定（未指定の場合は前後IP間から自動線形補間/すり付け）
  widthOverride?: {
    leftLaneWidth: number;   // 左車線幅 (mm)
    rightLaneWidth: number;  // 右車線幅 (mm)
    leftShoulder: number;    // 左路肩幅 (mm)
    rightShoulder: number;   // 右路肩幅 (mm)
  };
  // のり面構造物の種別指定 ('auto' の場合は切盛高に応じて自動判定)
  leftSlopeStructure: 'auto' | 'none' | 'gravity' | 'block';
  rightSlopeStructure: 'auto' | 'none' | 'gravity' | 'block';
  // 舗装・路盤・路床の厚み (m)
  pavementLayers: {
    surface: { material: string; thickness: number; }; // 表層
    base: { material: string; thickness: number; };    // 路盤
    subgrade: { material: string; thickness: number; };// 路床
  };
}

// 帯用および幾何計算用の動的マージ・ソート行
export interface ProfileStationRow {
  stationDist: number;  // 起点からの累積距離 (m) [ソート用の絶対キー]
  stationName: string;  // 測点表示名 (例: "NO.3+10.970")
  intervalDist: number; // 単距離（手前の点からの区間距離 m）
  groundZ: number;      // 現況地盤高 (GH)
  plannedZ: number;     // 計画高 (FH: 縦断曲線補間後)
  diffZ: number;        // 切土(-)/盛土(+)高 (plannedZ - groundZ)
  slope: number;        // 縦断勾配 (%)
  curvature: {          // 平面曲率図
    type: 'straight' | 'curve-left' | 'curve-right';
    r: number;
  };
  crossSection: CrossSectionConfig; // 横断面構成データ
  intervalCostYen?: number;   // 区間概算工事費 (万円)
  cumulativeCostYen?: number; // 累計概算工事費 (万円)
  intervalCutVolume?: number; // 区間切土量 (m3)
  intervalFillVolume?: number; // 区間盛土量 (m3)
  intervalWallVolume?: number; // 区間擁壁体積 (m3)
  intervalPavementArea?: number; // 区間舗装面積 (m2)
}

// === 道路排水計画：側溝（L型街渠）および集水桝配置データ構造 ===
export interface DrainageInletData {
  id: string;
  stationName: string;
  stationDist: number;
  side: string;        // '左側' | '右側'
  slope: number;       // 縦断勾配 (%)
  area: number;        // 流入受け持ち面積 (m2)
  position: any;       // THREE.Vector3 もしくは { x, y, z }
  isSag: boolean;      // 縦断凹部（サグ）かどうか
  qIn: number;         // 雨水流入量 (L/s)
  qCap: number;        // 集水桝の吸込限界能力 (L/s)
  isOverflow: boolean; // 溢水判定
  overflowRate: number; // 溢水率
}

export interface GutterDrainageSegment {
  id: string;
  startDist: number;
  endDist: number;
  side: string;        // '左側' | '右側'
  slope: number;       // 勾配 (%)
  capacity: number;    // 側溝最大許容流量 (L/s)
  runoff: number;      // 流入雨水量 (L/s)
  isFull: boolean;     // 側溝の許容限界超過（溢水リスク）
  riskLevel: 'safe' | 'warning' | 'danger'; // 危険度
  waterDepth: number;  // 側溝内水深 (cm)
  positions: any[];    // 端点座標リスト
}

// === クロソイド緩和曲線用型定義 ===
export interface ClothoidPoint {
  s: number;        // 始点からの弧長 (m) [0 to L]
  x: number;        // クロソイド局所座標 X (m) (接線方向)
  y: number;        // クロソイド局所座標 Y (m) (法線方向)
  theta: number;    // 接線角 (rad) [s^2 / (2*A^2)]
  radius: number;   // 曲率半径 (m) [A^2 / s]
  kappa: number;    // 曲率 (1/radius) [s / A^2]
}

export interface ClothoidParameters {
  A: number;        // クロソイドパラメータ
  R: number;        // 終点（円接続部）の曲率半径 (m)
  L: number;        // 曲線長 (m)
  tau: number;      // 終点における接線偏角 (rad)
  x0: number;       // 終点（KE）の局所 X 座標 (m)
  y0: number;       // 終点（KE）の局所 Y 座標 (m)
  xm: number;       // 円中心の投影 X 座標 (m) (x0 - R * sin(tau))
  deltaR: number;   // 円曲線の内フリ量（シフト量）ΔR (y0 - R * (1 - cos(tau)))
  tk: number;       // 始点（KA）から円曲線交点までの接線長 Tk (xm + (R + deltaR) * tan(I/2) などで使用)
}

// === 地盤支持力・杭基礎自動構造設計 ===
export interface PileDesignResult {
  pierIndex: number;
  stationName: string;
  stationDist: number;
  groundElevation: number;
  pierHeight: number;
  estNValue: number;          // 推定地盤N値
  pileDiameter: number;       // 設計杭径 (m)
  pileLength: number;         // 設計杭長 (m)
  requiredPilesCount: number; // 必要杭本数 (本)
  ultimateBearingCap: number; // 極限支持力 (kN)
  allowableBearingCap: number;// 許容支持力 (kN)
  appliedLoad: number;        // 作用上部荷重 (kN)
  safetyFactor: number;       // 安全率
  isBearingOk: boolean;       // 支持力判定 (OK / NG)
}

// === 道路交通騒音3Dシミュレーション ===
export interface NoiseSegmentResult {
  id?: string;
  stationName: string;
  stationDist: number;
  distanceToHouse?: number;    // 受音点（家屋）までの距離 (m)
  trafficVolumePerHour?: number; // 交通量 (台/h)
  avgSpeedKmH?: number;         // 平均速度 (km/h)
  noiseNoBarrierDb?: number;   // 防音壁なしの騒音レベル (dB)
  noiseWithBarrierDb?: number; // 防音壁ありの騒音レベル (dB)
  barrierHeight?: number;      // 配置した防音壁の高さ (m)
  noiseReductionDb?: number;   // 騒音減衰量 (dB)
  isNoiseLimitExceeded?: boolean; // 環境基準値（60dB）超過判定
  positions?: { x: number; y: number; z: number }[]; // 3Dポリゴン用
  noiseLevelRaw?: number;      // 遮音壁なし（dB）
  noiseLevelWithBarrier?: number; // 遮音壁あり（dB）
  attenuationDb?: number;      // 減衰量
  isLimitOk?: boolean;         // 基準判定
}

// === 路面冠水・ハイドロプレーニング予測 ===
export interface HydroplaneSegmentResult {
  id?: string;
  stationName: string;
  stationDist: number;
  longitudinalSlope?: number;  // 縦断勾配 (%)
  crossSlope?: number;         // 横断勾配 (%)
  drainageLength?: number;     // 排水流路長 (m)
  waterFilmDepth?: number;     // 計算水膜厚さ (mm)
  isHydroplaneRisk?: boolean;  // ハイドロプレーニングリスク有り (水膜厚 >= 4mm)
  criticalSpeedKmh?: number;   // 限界ハイドロプレーニング速度 (km/h)
  positions?: { x: number; y: number; z: number }[];
  syntheticSlope?: number;     // 合成勾配 (%)
  criticalSpeed?: number;      // 限界速度 (km/h)
  isHydroWarning?: boolean;    // 警告判定
}


