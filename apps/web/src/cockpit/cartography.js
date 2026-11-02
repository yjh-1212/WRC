// Engine-independent rendering generalization. Original geographic assets are unchanged.
// A small tolerance removes sub-pixel coastline zigzags, not regions or islands.
export function simplifyRing(ring, tolerance = .008) {
  if (ring.length < 8) return ring;
  const square = tolerance * tolerance;
  const keep = new Set([0, ring.length - 1]);
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const a = ring[first]; const b = ring[last];
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    let furthest = -1; let distance = square;
    for (let i = first + 1; i < last; i++) {
      const p = ring[i];
      const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
      const d = (p[0] - a[0] - dx * t) ** 2 + (p[1] - a[1] - dy * t) ** 2;
      if (d > distance) { distance = d; furthest = i; }
    }
    if (furthest !== -1) { keep.add(furthest); stack.push([first, furthest], [furthest, last]); }
  }
  const result = [...keep].sort((a, b) => a - b).map(i => ring[i]);
  return result.length >= 4 ? result : ring;
}
