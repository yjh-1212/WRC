import * as Cesium from 'cesium';

const DEFAULT_LAYERS = ['admin', 'routes', 'nodes', 'labels', 'objects', 'heat', 'columns', 'scans'];

export class LayerManager {
  constructor(viewer) {
    this.viewer = viewer;
    this.sources = new Map();
    this.primitives = new Map();

    for (const id of DEFAULT_LAYERS) {
      const source = new Cesium.CustomDataSource(`geo-${id}`);
      this.sources.set(id, source);
      void viewer.dataSources.add(source);
    }
  }

  getSource(id) {
    if (!this.sources.has(id)) {
      const source = new Cesium.CustomDataSource(`geo-${id}`);
      this.sources.set(id, source);
      void this.viewer.dataSources.add(source);
    }
    return this.sources.get(id);
  }

  clear(id) {
    this.sources.get(id)?.entities.removeAll();
  }

  clearProjectData() {
    for (const id of ['admin', 'routes', 'nodes', 'labels', 'objects', 'heat', 'columns', 'scans']) this.clear(id);
  }

  registerPrimitive(id, primitive) {
    const previous = this.primitives.get(id);
    if (previous && previous !== primitive) {
      try {
        this.viewer.scene.primitives.remove(previous);
      } catch {
        // no-op
      }
    }
    this.primitives.set(id, primitive);
    return primitive;
  }

  setVisible(id, visible) {
    const source = this.sources.get(id);
    if (source) source.show = Boolean(visible);
    const primitive = this.primitives.get(id);
    if (primitive) primitive.show = Boolean(visible);
  }

  isVisible(id) {
    if (this.sources.has(id)) return this.sources.get(id).show;
    if (this.primitives.has(id)) return this.primitives.get(id).show;
    return false;
  }

  destroy() {
    for (const primitive of this.primitives.values()) {
      try {
        this.viewer.scene.primitives.remove(primitive);
      } catch {
        // no-op
      }
    }
    this.primitives.clear();
    for (const source of this.sources.values()) {
      try {
        this.viewer.dataSources.remove(source, true);
      } catch {
        // no-op
      }
    }
    this.sources.clear();
  }
}
