# Agent SKILL - 3D CIM道路アライメント開発スキル

本ドキュメントは、3D CIM道路線形（アライメント）プロトタイプにおける専門的なコーディングパターン、計算幾何学（2D/3D幾何学）、およびUI構築におけるプラクティスを定めたスキルファイルです。

---

## 1. 2D/3D平面幾何学・線形計算

### 1.1 2次ベジエ曲線を用いた平面線形補間
道路の中間交差点（IP）を緩やかに曲げるため、始点（BP: $P_0$）、交点（IP: $P_1$）、終点（EP: $P_2$）からなる2次ベジエ曲線（Quadratic Bezier Curve）を計算します。

$$B(t) = (1-t)^2 P_0 + 2(t-t)^2 P_1 + t^2 P_2 \quad (t \in [0, 1])$$

```typescript
// ベジエ曲線上の点を取得する高精度関数
export function getQuadraticBezierPoint(
  p0: { x: number; y: number; z: number },
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  t: number
) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const mt_t_2 = 2 * mt * t;

  return {
    x: mt2 * p0.x + mt_t_2 * p1.x + t2 * p2.x,
    y: mt2 * p0.y + mt_t_2 * p1.y + t2 * p2.y,
    z: mt2 * p0.z + mt_t_2 * p1.z + t2 * p2.z, // 標高の補間
  };
}
```

### 1.2 道路の法線方向（横断面方向）の算出
3D道路メッシュや横断図を描画するためには、中心線の接線（Tangent）に直交する法線（Normal）ベクトルを算出する必要があります。
2次元平面上 $(X, Y)$ での接線ベクトル $\vec{T} = (dx, dy)$ に対し、左方向法線ベクトル $\vec{N}_{left}$ は以下のように求まります。

$$\vec{N}_{left} = (-dy, dx) / \sqrt{dx^2 + dy^2}$$

これにより、左車線や右車線、路肩の3次元座標を正確に展開します。

---

## 2. Drawings (SVG縦横断) の幾何学ハッチング

- **縦断図 (Profile)**: 横軸に起点からの累加距離（Station）、縦軸に標高（Elevation）を配置。
  - 地盤高（Ground level）の標高関数 $f_G(s)$ を定義（例：正弦波）。
  - 計画高（Design level）の関数 $f_D(s)$ をベジエ標高から補間。
  - $f_D(s) > f_G(s)$ の区間は「盛土 (Fill)」：SVGの `<path>` または `<polygon>` で赤半透明の領域を生成。
  - $f_D(s) < f_G(s)$ の区間は「切土 (Cut)」：青半透明の領域を生成。

- **横断図 (Cross-Section)**:
  - 中心から左右に `LaneWidth + ShoulderWidth` の幅をとり、その終端から `SlopeGradient (1:S)` に従って地盤線まで傾斜線を下ろします。
  - 地盤レベルとの交点を計算し、地盤レベル以上の三角形/台形を「盛土」、以下の領域を「切土」として彩色。

---

## 3. Three.js による道路スイープメッシュの動的構築

React19および低メモリ環境で安定して動作させるため、複雑な外部ローダーは使用せず、`THREE.BufferGeometry` を用いて中心線に沿った四角形（Quad）メッシュを直接生成します。

### 3.1 道路断面の頂点レイアウト
各断面（Station $i$）において、中心点から以下の順に頂点を配置します。
1. **L_Slope_End** (左側法尻/法肩)
2. **L_Shoulder_End** (左路肩端)
3. **L_Lane_End** (左車線端)
4. **Center** (道路中心線)
5. **R_Lane_End** (右車線端)
6. **R_Shoulder_End** (右路肩端)
7. **R_Slope_End** (右側法尻/法肩)

これら $N$ 断面の頂点群を繋ぐインデックス配列（Triangles）を作成し、単一の `BufferGeometry` を構成することで、描画コール数（Draw Calls）を1に抑え、劇的なパフォーマンス向上（PC 3050TiやAndroidでの60FPS動作）を達成します。

### 3.2 WebGL コンテキスト管理と衝突回避の黄金パターン
Reactコンポーネント内で `canvas` の WebGL サポート判定を行う際、本番用の `canvas` に対して直接 `.getContext('webgl')` などを行うと、コンテキストタイプ（WebGL1）がその時点で永久に固定（ロック）されます。
その状態で Three.js の `WebGLRenderer`（デフォルトで WebGL2 / `getContext('webgl2')`）をインスタンス化すると、ブラウザが「Canvas has an existing context of a different type」を投げ、初期化が完全にクラッシュします。

これを防ぐためのコンテキスト隔離検出手法：
```typescript
// メモリ上に隔離されたダミーキャンバスを動的に作って判定する
const dummyCanvas = document.createElement('canvas');
const isSupported = !!(
  window.WebGLRenderingContext && 
  (dummyCanvas.getContext('webgl2') || dummyCanvas.getContext('webgl') || dummyCanvas.getContext('experimental-webgl'))
);
```
これにより、描画対象の本番 `canvas` を一切汚染せず、Three.js の最速の初期化フローを保証します。

---

## 4. LandXML (XMLフォーマット) モック構築

成果物エクスポート用に、日本国内のCIM/i-Constructionで標準的な「LandXML」に準拠したアライメント定義データをテキスト生成します。
- `<Alignments>`
  - `<Alignment name="CIM_Road_Alignment_Line">`
    - `<CoordGeom>` : 直線部や曲線部の始終端座標をタグ出力。
    - `<Profile>` : 縦断勾配の変化点（VPI）情報。

このXML形式およびシステム連携用JSON形式を、文字化けせず、コピー可能かつダウンロード可能に実装します。
