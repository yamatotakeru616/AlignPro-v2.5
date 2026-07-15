// Coordinate conversion and Zones JGD2011

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


