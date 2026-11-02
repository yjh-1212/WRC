import * as Cesium from 'cesium';

export function addPulseMarker({
  nodeSource,
  labelSource,
  id,
  name,
  position,
  radius = 22_000,
  color = Cesium.Color.fromCssColorString('#35dfff'),
  label = true,
}) {
  const [lng, lat, height = 0] = position;
  const center = Cesium.Cartesian3.fromDegrees(lng, lat, height);
  // IMPORTANT: Cesium may evaluate semiMajorAxis and semiMinorAxis separately in
  // the same render pass. Using Date.now() inside the callback can therefore
  // produce two slightly different radii and trigger:
  // `semiMajorAxis must be greater than or equal to the semiMinorAxis`.
  // Drive all animation from Cesium's frame time instead, so both axes resolve
  // to exactly the same value for a given frame.
  const epoch = Cesium.JulianDate.now();
  const phaseOffset = [...String(id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 100 / 100;
  const getPhase = (time) => {
    const t = time ?? Cesium.JulianDate.now();
    const seconds = Cesium.JulianDate.secondsDifference(t, epoch);
    return ((seconds / 1.8 + phaseOffset) % 1 + 1) % 1;
  };
  const radiusProperty = new Cesium.CallbackProperty((time) => {
    const phase = getPhase(time);
    return radius * (0.72 + phase * 0.72);
  }, false);
  const alphaProperty = new Cesium.CallbackProperty((time) => {
    const phase = getPhase(time);
    return color.withAlpha(0.42 * (1 - phase));
  }, false);

  nodeSource.entities.add({
    id: `${id}:pulse`,
    position: center,
    ellipse: {
      semiMajorAxis: radiusProperty,
      semiMinorAxis: radiusProperty,
      material: new Cesium.ColorMaterialProperty(alphaProperty),
      height,
      heightReference: Cesium.HeightReference.NONE,
    },
  });

  nodeSource.entities.add({
    id: `${id}:core`,
    position: center,
    point: {
      pixelSize: 10,
      color,
      outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
      outlineWidth: 1.5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  if (label) {
    labelSource.entities.add({
      id: `${id}:label`,
      position: center,
      label: {
        text: name,
        font: '500 14px Microsoft YaHei, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#dff8ff'),
        outlineColor: Cesium.Color.fromCssColorString('#031018'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(2.0e4, 1.0, 3.5e6, 0.48),
        translucencyByDistance: new Cesium.NearFarScalar(1.0e4, 1.0, 6.0e6, 0.15),
      },
    });
  }
}
