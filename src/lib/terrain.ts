import { getGlobalBaseCoords, lngLatToXY, xyToLngLat } from './coordinate';

let customGroundMap: any = null;

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


