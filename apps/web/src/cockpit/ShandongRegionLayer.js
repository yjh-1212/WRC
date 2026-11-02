const ns = 'http://www.w3.org/2000/svg';
/** Outline-only administrative boundaries leave the street basemap unobscured. */
export class ShandongRegionLayer {
  constructor(map, geometry) {
    this.map = map; this.geometry = geometry; this.visible = true; this.connected = new Set(); this.style = {};
    this.svg = document.createElementNS(ns, 'svg'); this.svg.classList.add('pc-administrative-layer'); this.svg.setAttribute('aria-hidden', 'true');
    const maps = map.getContainer().querySelector('.amap-maps') ?? map.getContainer();
    const markers = maps.querySelector(':scope > .amap-overlays');
    maps.insertBefore(this.svg, markers ?? null);
    this.paths = geometry.cities.map(city => {
      const path = document.createElementNS(ns, 'path'); path.dataset.cityCode = city.code; path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('vector-effect', 'non-scaling-stroke'); this.svg.append(path);
      return { city, path };
    });
    this.schedule = () => { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); }); };
    this.events = ['mapmove', 'zoomchange', 'rotatechange', 'pitchchange', 'resize', 'moveend', 'zoomend'];
    for (const event of this.events) map.on(event, this.schedule);
    this.observer = new ResizeObserver(this.schedule); this.observer.observe(map.getContainer()); this.draw();
  }
  update(style, connected, selected, visible = true) { this.style = style ?? {}; this.connected = new Set(connected ?? []); this.selected = selected; this.visible = visible; this.schedule(); }
  draw() {
    if (!this.map || !this.svg.isConnected) return;
    const host = this.map.getContainer();
    if (!host.clientWidth || !host.clientHeight) return;
    const zoom = this.map.getZoom();
    this.svg.setAttribute('width', host.clientWidth); this.svg.setAttribute('height', host.clientHeight); this.svg.setAttribute('viewBox', `0 0 ${host.clientWidth} ${host.clientHeight}`);
    // Administrative fills are overview information; street detail stays unobscured.
    this.svg.style.display = zoom < 12 ? '' : 'none';
    if (this.svg.style.display === 'none') return;
    const fade = Math.min(1, Math.max(0, 12 - zoom));
    const showRegions = this.visible && this.style.boundaries !== false;
    for (const { city, path } of this.paths) {
      let d = '';
      for (const polygon of city.polygons) for (const ring of polygon) {
        let previous;
        for (let index = 0; index < ring.length; index++) {
          const pixel = this.map.lngLatToContainer(ring[index]);
          if (previous && index < ring.length - 1 && Math.abs(pixel.x - previous.x) + Math.abs(pixel.y - previous.y) < .7) continue;
          d += `${previous ? 'L' : 'M'}${pixel.x.toFixed(1)} ${pixel.y.toFixed(1)}`; previous = pixel;
        }
        d += 'Z';
      }
      path.setAttribute('d', d);
      const connected = this.connected.has(city.code), selected = this.selected === city.code;
      path.dataset.connected = String(connected); path.dataset.selected = String(selected);
      path.style.display = showRegions ? '' : 'none';
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', String(this.style.mapEdge ?? '#507db6'));
      path.setAttribute('stroke-width', String(Number(this.style.mapEdgeWidth ?? .8) * (selected ? 1.4 : 1)));
      path.setAttribute('stroke-opacity', String((selected ? 1 : .8) * fade));
    }
    this.svg.dataset.depth = '0'; this.svg.dataset.mode = '2d';
  }
  dispose() { cancelAnimationFrame(this.frame); this.observer.disconnect(); for (const event of this.events) this.map.off(event, this.schedule); this.svg.remove(); this.map = null; }
}
