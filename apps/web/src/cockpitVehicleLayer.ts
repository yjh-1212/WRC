type VehicleLayerHandle = { remove: () => void };
type MeshData = { positions: Float32Array; normals: Float32Array; colors: Float32Array };
export type VehicleTrackSample = { longitude: number; latitude: number; heading?: number };

function parseMtl(source: string) {
  const materials = new Map<string, [number, number, number]>();
  let name = '';
  for (const line of source.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'newmtl') name = parts[1] ?? '';
    if (parts[0] === 'Kd' && name) {
      materials.set(name, [Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0]);
    }
  }
  return materials;
}

function parseObj(source: string, materials: Map<string, [number, number, number]>): MeshData {
  const vertices: number[][] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  let color: [number, number, number] = [0.82, 0.84, 0.88];
  const normal = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
  };
  for (const line of source.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') vertices.push(parts.slice(1, 4).map(Number));
    if (parts[0] === 'usemtl') color = materials.get(parts[1]) ?? color;
    if (parts[0] !== 'f') continue;
    const face = parts.slice(1).map((part) => vertices[Number(part.split('/')[0]) - 1]).filter(Boolean);
    for (let index = 1; index < face.length - 1; index += 1) {
      const triangle = [face[0], face[index], face[index + 1]];
      const n = normal(triangle[0], triangle[1], triangle[2]);
      triangle.forEach((point) => {
        positions.push(...point);
        normals.push(...n);
        colors.push(...color);
      });
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
  };
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || '着色器编译失败');
  return shader;
}

function multiply(a: number[], b: number[]) {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) out[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index];
    }
  }
  return out;
}

function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov * Math.PI / 360);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
}

function lookAt(eye: number[], target: number[], up: number[]) {
  const normalize = (v: number[]) => { const l = Math.hypot(...v) || 1; return v.map((n) => n / l); };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -x.reduce((s, n, i) => s + n * eye[i], 0), -y.reduce((s, n, i) => s + n * eye[i], 0), -z.reduce((s, n, i) => s + n * eye[i], 0), 1];
}

/** 正北为 0、向东为正（弧度）。OBJ 车头沿 +X，地图 +X 朝东，需再转 +90°。 */
const MODEL_YAW_OFFSET = Math.PI / 2;

function headingBetween(a: VehicleTrackSample, b: VehicleTrackSample) {
  const meanLat = ((a.latitude + b.latitude) / 2) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.cos(meanLat);
  const dLat = b.latitude - a.latitude;
  if (Math.hypot(dLng, dLat) < 1e-12) return a.heading ?? 0;
  return Math.atan2(dLng, dLat);
}

function metersBetween(a: VehicleTrackSample, b: VehicleTrackSample) {
  const meanLat = ((a.latitude + b.latitude) / 2) * Math.PI / 180;
  const dx = (b.longitude - a.longitude) * 111320 * Math.cos(meanLat);
  const dy = (b.latitude - a.latitude) * 111320;
  return Math.hypot(dx, dy);
}

function lerpHeading(from: number, to: number, t: number) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

function buildPath(track: VehicleTrackSample[]) {
  const dist = [0];
  for (let index = 1; index < track.length; index += 1) {
    dist.push(dist[index - 1] + Math.max(0.2, metersBetween(track[index - 1], track[index])));
  }
  return { points: track, dist, length: dist[dist.length - 1] || 1 };
}

function poseOnPath(path: ReturnType<typeof buildPath>, distance: number) {
  const max = path.length;
  if (max <= 0.2) return { ...path.points[0], heading: path.points[0].heading ?? 0 };
  const trip = max * 2;
  let d = distance % trip;
  if (d < 0) d += trip;
  const reverse = d > max;
  const along = reverse ? max - (d - max) : d;
  let index = 0;
  while (index < path.dist.length - 2 && path.dist[index + 1] < along) index += 1;
  const span = Math.max(0.2, path.dist[index + 1] - path.dist[index]);
  const t = (along - path.dist[index]) / span;
  const a = path.points[index];
  const b = path.points[index + 1];
  return {
    longitude: a.longitude + (b.longitude - a.longitude) * t,
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    heading: reverse ? headingBetween(b, a) : headingBetween(a, b),
  };
}

export async function attachVehicleModel(
  AMap: any,
  map: any,
  longitude: number,
  latitude: number,
  options: { track?: VehicleTrackSample[]; animate?: boolean; heading?: number; follow?: boolean } = {},
): Promise<VehicleLayerHandle | null> {
  try {
    const [objRes, mtlRes] = await Promise.all([
      fetch('/models/unmanned_delivery_vehicle.obj'),
      fetch('/models/unmanned_delivery_vehicle.mtl'),
    ]);
    if (!objRes.ok) return null;
    const materials = mtlRes.ok ? parseMtl(await mtlRes.text()) : new Map<string, [number, number, number]>();
    const mesh = parseObj(await objRes.text(), materials);
    if (!mesh.positions.length || !AMap?.GLCustomLayer || !map.customCoords) return null;
    const customCoords = map.customCoords;
    const track = options.track?.filter((p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude)) ?? [];
    const animate = Boolean(options.animate && track.length > 1);
    let disposed = false;
    let glRef: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let normalBuffer: WebGLBuffer | null = null;
    let colorBuffer: WebGLBuffer | null = null;
    let raf = 0;
    const startedAt = performance.now();
    const path = animate ? buildPath(track) : null;
    let originDistance = 0;
    if (path) {
      let best = 0;
      let bestD = Infinity;
      for (let index = 0; index < path.points.length; index += 1) {
        const d = metersBetween(path.points[index], { longitude, latitude });
        if (d < bestD) { bestD = d; best = index; }
      }
      originDistance = path.dist[best];
    }
    let display = { longitude, latitude, heading: options.heading ?? 0 };

    const poseAt = () => {
      if (!path) return { longitude, latitude, heading: options.heading ?? 0 };
      const speed = 8.2;
      return poseOnPath(path, originDistance + ((performance.now() - startedAt) / 1000) * speed);
    };

    const layer = new AMap.GLCustomLayer({
      zIndex: 130,
      zooms: [10, 20],
      init: (gl: WebGLRenderingContext) => {
        glRef = gl;
        program = gl.createProgram()!;
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, `
          attribute vec3 a_position;
          attribute vec3 a_normal;
          attribute vec3 a_color;
          uniform mat4 u_mvp;
          varying vec3 v_normal;
          varying vec3 v_color;
          void main() {
            v_normal = a_normal;
            v_color = a_color;
            gl_Position = u_mvp * vec4(a_position, 1.0);
          }
        `));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, `
          precision mediump float;
          varying vec3 v_normal;
          varying vec3 v_color;
          void main() {
            vec3 n = normalize(v_normal);
            float light = max(0.0, dot(n, normalize(vec3(0.28, 0.62, 0.92))));
            float ambient = 0.42;
            vec3 rgb = v_color * (ambient + (1.0 - ambient) * light);
            gl_FragColor = vec4(rgb, 1.0);
          }
        `));
        gl.linkProgram(program);
        positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
        normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
        colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
      },
      render: () => {
        const gl = glRef;
        if (disposed || !gl || !program || !positionBuffer || !normalBuffer || !colorBuffer) return;
        const target = poseAt();
        display = {
          longitude: display.longitude + (target.longitude - display.longitude) * 0.22,
          latitude: display.latitude + (target.latitude - display.latitude) * 0.22,
          heading: lerpHeading(display.heading, target.heading, 0.2),
        };
        const pose = display;
        customCoords.setCenter([pose.longitude, pose.latitude]);
        const [x, y] = customCoords.lngLatsToCoords([[pose.longitude, pose.latitude]])[0];
        const camera = customCoords.getCameraParams();
        const zoom = Number(map.getZoom?.() ?? 17);
        const scale = Math.min(36, 8.2 * Math.pow(2, Math.max(0, 16.9 - zoom)));
        const yaw = MODEL_YAW_OFFSET - (pose.heading ?? 0);
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const model = [
          scale * cos, scale * sin, 0, 0,
          -scale * sin, scale * cos, 0, 0,
          0, 0, scale, 0,
          x, y, 2.4, 1,
        ];
        const view = lookAt(camera.position, camera.lookAt, camera.up);
        const projection = perspective(camera.fov, gl.drawingBufferWidth / gl.drawingBufferHeight, camera.near, camera.far);
        gl.useProgram(program);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_mvp'), false, new Float32Array(multiply(multiply(projection, view), model)));
        const bindAttr = (name: string, buffer: WebGLBuffer) => {
          const loc = gl.getAttribLocation(program!, name);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
        };
        bindAttr('a_position', positionBuffer);
        bindAttr('a_normal', normalBuffer);
        bindAttr('a_color', colorBuffer);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
        gl.disable(gl.DEPTH_TEST);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.useProgram(null);
      },
    });
    map.add(layer);
    map.render();
    if (animate) {
      const tick = () => {
        if (disposed) return;
        map.render();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return {
      remove: () => {
        disposed = true;
        cancelAnimationFrame(raf);
        try { map.remove(layer); } catch { /* map already destroyed */ }
        if (glRef) {
          if (positionBuffer) glRef.deleteBuffer(positionBuffer);
          if (normalBuffer) glRef.deleteBuffer(normalBuffer);
          if (colorBuffer) glRef.deleteBuffer(colorBuffer);
          if (program) glRef.deleteProgram(program);
        }
      },
    };
  } catch {
    return null;
  }
}
