// Same native camera used by the vehicle WebGL model. Heights are display metres.
export function elevatedProjector(map) {
  const coords = map.customCoords;
  if (!coords) return (lnglat) => map.lngLatToContainer(lnglat);
  const center = map.getCenter(); coords.setCenter([center.getLng(), center.getLat()]);
  const camera = coords.getCameraParams(), host = map.getContainer();
  const normalize = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const z = normalize(camera.position.map((x, i) => x - camera.lookAt[i])), x = normalize(cross(camera.up, z)), y = cross(z, x);
  const f = 1 / Math.tan(camera.fov * Math.PI / 360), aspect = host.clientWidth / host.clientHeight;
  return (lnglat, height = 0) => {
    const ground = coords.lngLatsToCoords([lnglat])[0], p = [ground[0] - camera.position[0], ground[1] - camera.position[1], height - camera.position[2]], depth = -dot(z, p);
    return { x: (dot(x, p) * f / aspect / depth + 1) * host.clientWidth / 2, y: (1 - dot(y, p) * f / depth) * host.clientHeight / 2 };
  };
}
