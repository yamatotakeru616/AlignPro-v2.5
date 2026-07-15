/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClothoidPoint, ClothoidParameters } from '../types';

/**
 * 与えられたパラメータ A, R, L からクロソイド全体の幾何学的な諸元を算出します。
 * (A, R), (R, L), (A, L) のいずれか2つが定義されていれば、残りの1つを自動算出します。
 * 
 * 基本関係式: A^2 = R * L
 */
export function calculateClothoidParams(
  A?: number,
  R?: number,
  L?: number
): ClothoidParameters {
  let finalA = A || 0;
  let finalR = R || 0;
  let finalL = L || 0;

  // パラメータの自動算出
  if (finalA > 0 && finalR > 0 && finalL === 0) {
    finalL = (finalA * finalA) / finalR;
  } else if (finalR > 0 && finalL > 0 && finalA === 0) {
    finalA = Math.sqrt(finalR * finalL);
  } else if (finalA > 0 && finalL > 0 && finalR === 0) {
    finalR = (finalA * finalA) / finalL;
  } else if (finalA === 0 && finalR === 0 && finalL === 0) {
    // デフォルト値
    finalR = 100;
    finalL = 50;
    finalA = Math.sqrt(finalR * finalL);
  }

  // 終点接線角 tau = L / (2 * R) (rad)
  const tau = finalR > 0 ? finalL / (2 * finalR) : 0;

  // 終点 KE のローカル座標 (x0, y0) を高精度計算
  const kePoint = getClothoidPoint(finalL, finalA);
  const x0 = kePoint.x;
  const y0 = kePoint.y;

  // 円中心の投影 X 座標 xm = x0 - R * sin(tau)
  const xm = x0 - finalR * Math.sin(tau);

  // 円曲線のシフト量 (内フリ量) deltaR = y0 - R * (1 - cos(tau))
  const deltaR = y0 - finalR * (1 - Math.cos(tau));

  // 始点 KA から円曲線中心投影点までの接線長 Tk (xm)
  const tk = xm;

  return {
    A: finalA,
    R: finalR,
    L: finalL,
    tau,
    x0,
    y0,
    xm,
    deltaR,
    tk
  };
}

/**
 * 任意の弧長 s (m) とクロソイドパラメータ A に基づき、
 * 局所（ローカル）座標系でのクロソイド点情報を高精度に計算します。
 * (KAを原点とし、接線をX軸正方向とする座標系)
 * 
 * Taylor展開（フレネル積分）を6項まで行い、極めて正確な実務設計レベルの座標を得ます。
 */
export function getClothoidPoint(s: number, A: number): ClothoidPoint {
  if (s === 0 || A <= 0) {
    return {
      s: 0,
      x: 0,
      y: 0,
      theta: 0,
      radius: Infinity,
      kappa: 0
    };
  }

  // 媒介変数 t = s^2 / (2 * A^2)
  const t = (s * s) / (2 * A * A);

  // x(s) = s * (1 - t^2/10 + t^4/216 - t^6/9360 + t^8/685440 - t^10/72576000 + ...)
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;
  const t8 = t4 * t4;
  const t10 = t8 * t2;

  const xCoeff = 1.0 
    - t2 / 10.0 
    + t4 / 216.0 
    - t6 / 9360.0 
    + t8 / 685440.0 
    - t10 / 72576000.0;
  const x = s * xCoeff;

  // y(s) = s * (t/3 - t^3/42 + t^5/1320 - t^7/75600 + t^9/6894720 - t^11/871785600 + ...)
  const t3 = t2 * t;
  const t5 = t4 * t;
  const t7 = t6 * t;
  const t9 = t8 * t;
  const t11 = t10 * t;

  const yCoeff = t / 3.0 
    - t3 / 42.0 
    + t5 / 1320.0 
    - t7 / 75600.0 
    + t9 / 6894720.0 
    - t11 / 871785600.0;
  const y = s * yCoeff;

  // その点での接線偏角 theta
  const theta = t;

  // その点での曲率半径 radius = A^2 / s
  const radius = (A * A) / s;
  const kappa = 1 / radius;

  return {
    s,
    x,
    y,
    theta,
    radius,
    kappa
  };
}

/**
 * クロソイド始点 (KA) から終点 (KE) までの等間隔サンプリング点列を生成します。
 */
export function sampleClothoid(
  A: number,
  L: number,
  steps: number = 50
): ClothoidPoint[] {
  const points: ClothoidPoint[] = [];
  const safeSteps = Math.max(2, steps);

  for (let i = 0; i <= safeSteps; i++) {
    const s = (L * i) / safeSteps;
    points.push(getClothoidPoint(s, A));
  }

  return points;
}

/**
 * 局所（ローカル）クロソイド座標の点群を、グローバル座標（平面直交座標系）に投影変換します。
 * 
 * @param localPoints 局所クロソイド点群
 * @param xStart 始点 (KA) のグローバル X 座標 (m)
 * @param yStart 始点 (KA) のグローバル Y 座標 (m)
 * @param angleStart 始点における接線の絶対方位角 (rad)
 * @param isLeftTurn カーブが左折（反時計回り）の場合は true、右折（時計回り）の場合は false
 */
export function transformClothoidToGlobal(
  localPoints: ClothoidPoint[],
  xStart: number,
  yStart: number,
  angleStart: number,
  isLeftTurn: boolean
): { x: number; y: number; heading: number; radius: number; kappa: number; s: number }[] {
  const cosA = Math.cos(angleStart);
  const sinA = Math.sin(angleStart);
  const turnSign = isLeftTurn ? 1.0 : -1.0;

  return localPoints.map(p => {
    // 回転および平行移動
    // 左折の場合: Y座標は正方向（左フリ）
    // 右折の場合: Y座標は負方向（右フリ）
    const rx = p.x;
    const ry = p.y * turnSign;

    const xGlob = xStart + rx * cosA - ry * sinA;
    const yGlob = yStart + rx * sinA + ry * cosA;

    // 絶対接線角（方位角）
    const heading = angleStart + p.theta * turnSign;

    return {
      x: xGlob,
      y: yGlob,
      heading,
      radius: p.radius,
      kappa: p.kappa * turnSign,
      s: p.s
    };
  });
}
