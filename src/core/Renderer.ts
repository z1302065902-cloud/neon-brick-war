import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

/**
 * Pixel budget for the drawing buffer.
 *
 * Clamping devicePixelRatio alone is not enough: a 2560x1440 Retina display at DPR 2 asks for
 * a 5120x2880 buffer — 14.7M pixels, and every pass in the bloom chain scales with it. The cap
 * is expressed in total pixels rather than ratio so a 4K monitor cannot quietly cost 2.5x what
 * a 1080p one does. 8.3M is 4K-equivalent, which is as far as this post chain stays smooth.
 */
const MAX_BUFFER_PIXELS = 8_300_000;

export function resizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  maxDpr = 2,
): boolean {
  const canvas = renderer.domElement;
  const width = Math.max(1, Math.floor(canvas.clientWidth));
  const height = Math.max(1, Math.floor(canvas.clientHeight));
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  // Back the ratio off until the buffer fits the budget.
  const budgetDpr = Math.sqrt(MAX_BUFFER_PIXELS / (width * height));
  dpr = Math.min(dpr, Math.max(0.75, budgetDpr));
  const bufferWidth = Math.floor(width * dpr);
  const bufferHeight = Math.floor(height * dpr);
  const needsResize = canvas.width !== bufferWidth || canvas.height !== bufferHeight;

  if (needsResize) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return needsResize;
}
