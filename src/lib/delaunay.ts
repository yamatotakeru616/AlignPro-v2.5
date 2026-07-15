export interface Point2D {
  x: number;
  y: number;
}

export interface Triangle {
  p1: number;
  p2: number;
  p3: number;
}

/**
 * Bowyer-Watson algorithm for Delaunay Triangulation in 2D space.
 * Returns a flat array of vertex indices (multiples of 3) representing the triangles.
 */
export function delaunayTriangulate(points: Point2D[]): number[] {
  if (points.length < 3) {
    return [];
  }

  // Pre-filter duplicates or extremely close points to prevent division by zero or degenerate triangles
  const uniquePoints: Point2D[] = [];
  const seen = new Set<string>();
  const eps = 1e-4;

  points.forEach((p) => {
    const key = `${Math.round(p.x / eps)},${Math.round(p.y / eps)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePoints.push(p);
    }
  });

  if (uniquePoints.length < 3) {
    return [];
  }

  // Find bounding box for super-triangle
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  uniquePoints.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const dx = maxX - minX;
  const dy = maxY - minY;
  const deltaMax = Math.max(dx, dy);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Define super-triangle vertices (appended at the end of point list)
  const stVertices: Point2D[] = [
    { x: midX - 20 * deltaMax - 1, y: midY - deltaMax - 1 },
    { x: midX, y: midY + 20 * deltaMax + 1 },
    { x: midX + 20 * deltaMax + 1, y: midY - deltaMax - 1 }
  ];

  const allPoints = [...uniquePoints, ...stVertices];
  const stStartIndex = uniquePoints.length; // Index of super-triangle vertices starts here

  // Helper to check circumcircle condition
  interface Circumcircle {
    x: number;
    y: number;
    rSq: number;
  }

  const getCircumcircle = (p1: Point2D, p2: Point2D, p3: Point2D): Circumcircle => {
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < 1e-9) {
      // Degenerate triangle fallback
      return { x: (p1.x + p2.x + p3.x) / 3, y: (p1.y + p2.y + p3.y) / 3, rSq: 1e9 };
    }
    const ux = ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) + (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) + (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) / d;
    const uy = ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) + (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) + (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) / d;
    const rSq = (p1.x - ux) * (p1.x - ux) + (p1.y - uy) * (p1.y - uy);
    return { x: ux, y: uy, rSq };
  };

  // Initial triangulation contains only the super-triangle
  let triangles: Triangle[] = [
    { p1: stStartIndex, p2: stStartIndex + 1, p3: stStartIndex + 2 }
  ];

  // Insert points one by one
  for (let i = 0; i < stStartIndex; i++) {
    const p = allPoints[i];
    const badTriangles: Triangle[] = [];

    // Find all triangles that contain the point in their circumcircle
    triangles.forEach((t) => {
      const cc = getCircumcircle(allPoints[t.p1], allPoints[t.p2], allPoints[t.p3]);
      const distSq = (p.x - cc.x) * (p.x - cc.x) + (p.y - cc.y) * (p.y - cc.y);
      // Use small tolerance for float comparison
      if (distSq < cc.rSq + 1e-9) {
        badTriangles.push(t);
      }
    });

    // Find boundary edges of the polygonal hole
    const polygon: { p1: number; p2: number }[] = [];
    badTriangles.forEach((t1) => {
      const edges = [
        { p1: t1.p1, p2: t1.p2 },
        { p1: t1.p2, p2: t1.p3 },
        { p1: t1.p3, p2: t1.p1 }
      ];

      edges.forEach((edge) => {
        let isShared = false;
        badTriangles.forEach((t2) => {
          if (t1 === t2) return;
          // Check if edge is shared in reverse direction
          if ((t2.p1 === edge.p2 && t2.p2 === edge.p1) ||
              (t2.p2 === edge.p2 && t2.p3 === edge.p1) ||
              (t2.p3 === edge.p2 && t2.p1 === edge.p1) ||
              (t2.p1 === edge.p1 && t2.p2 === edge.p2) ||
              (t2.p2 === edge.p1 && t2.p3 === edge.p2) ||
              (t2.p3 === edge.p1 && t2.p1 === edge.p2)) {
            isShared = true;
          }
        });

        if (!isShared) {
          polygon.push(edge);
        }
      });
    });

    // Remove bad triangles from list
    triangles = triangles.filter((t) => !badTriangles.includes(t));

    // Retriangulate the polygonal hole with new point
    polygon.forEach((edge) => {
      triangles.push({ p1: edge.p1, p2: edge.p2, p3: i });
    });
  }

  // Remove triangles that share vertices with the super-triangle
  triangles = triangles.filter((t) => {
    return (
      t.p1 < stStartIndex &&
      t.p2 < stStartIndex &&
      t.p3 < stStartIndex
    );
  });

  // Flatten the triangles to return array of point indices
  const indices: number[] = [];
  triangles.forEach((t) => {
    // Map back to the original index in the inputs
    // (Ensure the points' order matches uniquePoints)
    indices.push(t.p1, t.p2, t.p3);
  });

  return indices;
}
