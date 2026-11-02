import * as Cesium from 'cesium';

function buildDistanceTable(points) {
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Cesium.Cartesian3.distance(points[i - 1], points[i]);
    cumulative.push(total);
  }
  return { cumulative, total };
}

export function addFlowRoute({
  source,
  id,
  coordinates,
  color = Cesium.Color.fromCssColorString('#29dcff'),
  width = 4,
  speed = 0.055,
}) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new TypeError('A route requires at least two coordinates');
  }

  const positions = coordinates.map(([lng, lat, height = 0]) =>
    Cesium.Cartesian3.fromDegrees(lng, lat, height),
  );

  const line = source.entities.add({
    id: `${id}:line`,
    polyline: {
      positions,
      width,
      arcType: Cesium.ArcType.GEODESIC,
      clampToGround: true,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.22,
        taperPower: 0.75,
        color: color.withAlpha(0.9),
      }),
    },
  });

  const { cumulative, total } = buildDistanceTable(positions);
  const start = performance.now();
  const scratch = new Cesium.Cartesian3();
  const movingPosition = new Cesium.CallbackProperty(() => {
    if (total <= 0) return positions[0];
    const seconds = (performance.now() - start) / 1000;
    const distance = total * ((seconds * speed) % 1);
    let index = 1;
    while (index < cumulative.length && cumulative[index] < distance) index += 1;
    index = Math.min(index, positions.length - 1);
    const a = positions[index - 1];
    const b = positions[index];
    const segmentStart = cumulative[index - 1];
    const segmentLength = Math.max(1, cumulative[index] - segmentStart);
    const t = Cesium.Math.clamp((distance - segmentStart) / segmentLength, 0, 1);
    return Cesium.Cartesian3.lerp(a, b, t, scratch);
  }, false);

  const mover = source.entities.add({
    id: `${id}:mover`,
    position: movingPosition,
    point: {
      pixelSize: 9,
      color: Cesium.Color.WHITE,
      outlineColor: color,
      outlineWidth: 5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  return { line, mover };
}
