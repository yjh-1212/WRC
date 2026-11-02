import * as Cesium from 'cesium';

function toPositions(ring) {
  const flat = [];
  for (const coordinate of ring) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
    flat.push(coordinate[0], coordinate[1]);
  }
  return Cesium.Cartesian3.fromDegreesArray(flat);
}

function addPolygon(source, coordinates, color, prefix, index) {
  if (!coordinates?.length || !coordinates[0]?.length) return;
  const outer = coordinates[0];
  const holes = coordinates.slice(1).map((ring) => new Cesium.PolygonHierarchy(toPositions(ring)));
  const hierarchy = new Cesium.PolygonHierarchy(toPositions(outer), holes);

  source.entities.add({
    id: `${prefix}:fill:${index}`,
    polygon: {
      hierarchy,
      material: color.withAlpha(0.055),
      classificationType: Cesium.ClassificationType.BOTH,
    },
  });

  source.entities.add({
    id: `${prefix}:edge:${index}`,
    polyline: {
      positions: toPositions(outer),
      clampToGround: true,
      width: 5,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.32,
        taperPower: 0.8,
        color: color.withAlpha(0.95),
      }),
    },
  });
}

export function addGeoJsonBoundary({
  source,
  geojson,
  id = 'selected-region',
  color = Cesium.Color.fromCssColorString('#37e4ff'),
}) {
  const features = geojson?.type === 'FeatureCollection' ? geojson.features : [geojson];
  let index = 0;

  for (const feature of features ?? []) {
    const geometry = feature?.type === 'Feature' ? feature.geometry : feature?.geometry ?? feature;
    if (!geometry) continue;
    if (geometry.type === 'Polygon') {
      addPolygon(source, geometry.coordinates, color, id, index++);
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates ?? []) {
        addPolygon(source, polygon, color, id, index++);
      }
    } else if (geometry.type === 'LineString') {
      source.entities.add({
        id: `${id}:line:${index++}`,
        polyline: {
          positions: toPositions(geometry.coordinates),
          clampToGround: true,
          width: 5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color,
          }),
        },
      });
    }
  }

  return index;
}
