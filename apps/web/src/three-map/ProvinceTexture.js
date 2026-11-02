import * as THREE from 'three';

// Decorative, seamless atlas material. These subtle contours are not terrain data.
// Generate once locally: every city shares the same UV extent, with no downloads.
export function createProvinceTexture(size = 768) {
  const pixels = new Uint8Array(size * size * 4);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * tau, v = y / size * tau;
    const field = .5 + .19 * Math.sin(u + .9 * Math.sin(v))
      + .12 * Math.cos(v * 2 + .7 * Math.sin(u * 2))
      + .065 * Math.sin(u * 3 - v * 2) + .025 * Math.cos(u * 7 + v * 5);
    const phase = ((field * 12) % 1 + 1) % 1;
    const distance = Math.min(phase, 1 - phase);
    const contour = 1 - THREE.MathUtils.smoothstep(distance, .008, .055);
    const grain = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
    const light = Math.round(171 + (field - .5) * 17 - contour * 10 + grain * 1.8);
    const index = (y * size + x) * 4;
    pixels[index] = light; pixels[index + 1] = light; pixels[index + 2] = light; pixels[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'province-satin-contours'; texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
