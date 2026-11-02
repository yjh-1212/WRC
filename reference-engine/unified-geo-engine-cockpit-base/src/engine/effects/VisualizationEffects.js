import * as Cesium from 'cesium';

const CYAN = Cesium.Color.fromCssColorString('#31dcff');
const ORANGE = Cesium.Color.fromCssColorString('#ffab38');

function toCartesian(position) {
  const [lng, lat, height = 0] = position;
  return Cesium.Cartesian3.fromDegrees(lng, lat, height);
}

export function addHeatSpot({ source, id, position, radius = 2200, intensity = 0.7 }) {
  const value = Cesium.Math.clamp(intensity, 0, 1);
  const color = value > 0.72
    ? Cesium.Color.fromCssColorString('#ff5c4c')
    : value > 0.48
      ? ORANGE
      : CYAN;

  const entity = source.entities.add({
    id: `heat:${id}`,
    position: toCartesian(position),
    ellipse: {
      semiMajorAxis: radius,
      semiMinorAxis: radius,
      material: color.withAlpha(0.22 + value * 0.16),
      outline: true,
      outlineColor: color.withAlpha(0.75),
      height: position[2] ?? 0,
    },
  });
  return entity;
}

export function addValueColumn({ source, id, name, position, value, maxValue = 100, heightMax = 5500 }) {
  const ratio = Cesium.Math.clamp(value / Math.max(1, maxValue), 0.12, 1);
  const height = ratio * heightMax;
  const base = position[2] ?? 0;
  return source.entities.add({
    id: `column:${id}`,
    name,
    position: Cesium.Cartesian3.fromDegrees(position[0], position[1], base + height / 2),
    cylinder: {
      length: height,
      topRadius: 80,
      bottomRadius: 260,
      material: CYAN.withAlpha(0.46),
      outline: true,
      outlineColor: CYAN.withAlpha(0.9),
    },
    label: {
      text: `${name}\n${value}`,
      font: '500 12px Microsoft YaHei, sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -12),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(1.0e4, 1.0, 1.0e6, 0.35),
    },
  });
}

export function addScanMarker({ source, id, name, position, radius = 1600 }) {
  const center = toCartesian(position);
  const epoch = Cesium.JulianDate.now();
  const phase = (time, offset = 0) => {
    const seconds = Cesium.JulianDate.secondsDifference(time ?? Cesium.JulianDate.now(), epoch);
    return ((seconds / 2.5 + offset) % 1 + 1) % 1;
  };

  const entities = [];
  [0, 0.48].forEach((offset, index) => {
    const radiusProperty = new Cesium.CallbackProperty((time) => {
      const p = phase(time, offset);
      return radius * (0.25 + p * 1.2);
    }, false);
    const colorProperty = new Cesium.CallbackProperty((time) => {
      const p = phase(time, offset);
      return CYAN.withAlpha(0.34 * (1 - p));
    }, false);
    entities.push(source.entities.add({
      id: `scan:${id}:${index}`,
      position: center,
      ellipse: {
        semiMajorAxis: radiusProperty,
        semiMinorAxis: radiusProperty,
        material: new Cesium.ColorMaterialProperty(colorProperty),
      },
    }));
  });

  entities.push(source.entities.add({
    id: `scan:${id}:beam`,
    polyline: {
      positions: [center, Cesium.Cartesian3.fromDegrees(position[0], position[1], 4200)],
      width: 2,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.28, color: CYAN.withAlpha(0.9) }),
    },
    label: {
      text: name,
      font: '500 13px Microsoft YaHei, sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#e8fbff'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -28),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));
  return entities;
}
