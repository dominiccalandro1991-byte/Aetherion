/**
 * Aetherion 3D Procedural Planet Genesis
 * Implements validated studio-viewport-concept.json:
 * FOV 64, OrbitControls + damping, volumetric-rim-haze shader,
 * entity-glow-pulse, LOD, maxEntities 209, metric bindings.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AetherionRuntime } from '../core/orchestrator.js';

export interface CanvasOptions {
  maxOrganisms?: number;
}

const AETHER_CYAN = 0x00f0ff;
const LIVING_GOLD = 0xffb800;
const VOID_BG = 0x05070a;
const RIM_COLOR = new THREE.Color('#c8e0ff');

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 5): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * smoothNoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return v;
}

/** Poisson-disk-ish spherical sample using golden spiral */
function sphereSample(i: number, n: number, radius: number): THREE.Vector3 {
  const y = 1 - (i / Math.max(1, n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = (Math.PI * (3 - Math.sqrt(5))) * i;
  return new THREE.Vector3(
    Math.cos(theta) * r * radius,
    y * radius,
    Math.sin(theta) * r * radius
  );
}

const rimVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const rimFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uRimColor;
  uniform float uHazeDensity;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.8);
    float haze = exp(-abs(vWorldPos.y) * uHazeDensity * 40.0);
    float pulse = 0.85 + 0.15 * sin(uTime * 2.513 + uPulse);
    float alpha = (fresnel * uIntensity + haze * 0.12) * pulse;
    gl_FragColor = vec4(uRimColor, clamp(alpha, 0.0, 0.85));
  }
`;

export class PlanetCanvas {
  private host: HTMLCanvasElement;
  private runtime: AetherionRuntime;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private planet: THREE.Mesh;
  private atmosphere: THREE.Mesh;
  private coreGlow: THREE.Mesh;
  private stars: THREE.Points;
  private organisms: THREE.Points;
  private orgPositions: Float32Array;
  private orgColors: Float32Array;
  private orgBaseRadius: Float32Array;
  private patrolRing: THREE.Mesh;
  private patrolRingOuter: THREE.Mesh;
  private maxOrganisms: number;
  private raf = 0;
  private running = false;
  private clock = new THREE.Clock();
  private lastSync = 0;
  private evolution = 0;
  private surfaceTex: THREE.DataTexture;
  private texSize = 256;
  private disposed = false;
  private rimUniforms: {
    uTime: { value: number };
    uIntensity: { value: number };
    uRimColor: { value: THREE.Color };
    uHazeDensity: { value: number };
    uPulse: { value: number };
  };
  private lodDistances = [25, 60, 120];
  private pulseHz = 0.4;

  constructor(
    canvas: HTMLCanvasElement,
    runtime: AetherionRuntime,
    options: CanvasOptions = {}
  ) {
    this.host = canvas;
    this.runtime = runtime;
    this.maxOrganisms = options.maxOrganisms ?? 209;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VOID_BG);
    this.scene.fog = new THREE.FogExp2(VOID_BG, 0.035);

    // Concept FOV 64, near 0.1, far 3581
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 3581);
    this.camera.position.set(0, 1.8, 4.2);
    this.camera.lookAt(0, 0.2, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.host,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(VOID_BG, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // OrbitControls + damping from concept (0.108)
    this.controls = new OrbitControls(this.camera, this.host);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.108;
    this.controls.target.set(0, 0.15, 0);
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 14;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.enablePan = false;

    const amb = new THREE.AmbientLight(0x1a2430, 0.55);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 2.5, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(AETHER_CYAN, 0.45);
    rim.position.set(-3, -1, -2);
    this.scene.add(rim);
    const goldFill = new THREE.PointLight(LIVING_GOLD, 0.35, 12);
    goldFill.position.set(-2, 1.5, 2);
    this.scene.add(goldFill);

    this.surfaceTex = this.createSurfaceTexture(0);
    const planetMat = new THREE.MeshStandardMaterial({
      map: this.surfaceTex,
      roughness: 0.72,
      metalness: 0.18,
      emissive: new THREE.Color(0x1a0800),
      emissiveIntensity: 0.35,
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), planetMat);
    this.scene.add(this.planet);

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.55,
    });
    this.coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.92, 48, 48), coreMat);
    this.scene.add(this.coreGlow);

    // Volumetric rim haze (validated primary shader)
    this.rimUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0.552 },
      uRimColor: { value: RIM_COLOR.clone() },
      uHazeDensity: { value: 0.0183 },
      uPulse: { value: 0 },
    };
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: rimVertex,
      fragmentShader: rimFragment,
      uniforms: this.rimUniforms,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.14, 64, 64), atmoMat);
    this.scene.add(this.atmosphere);

    const auraGeo = new THREE.RingGeometry(1.2, 1.36, 64);
    const auraMat = new THREE.MeshBasicMaterial({
      color: LIVING_GOLD,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = Math.PI / 2.4;
    this.scene.add(aura);

    this.patrolRing = this.makeRing(1.4, 1.45, LIVING_GOLD, 0.0);
    this.patrolRingOuter = this.makeRing(1.52, 1.58, 0xff4466, 0.0);
    this.patrolRing.rotation.x = Math.PI / 2.15;
    this.patrolRingOuter.rotation.x = Math.PI / 2.6;
    this.patrolRingOuter.rotation.z = 0.4;
    this.scene.add(this.patrolRing, this.patrolRingOuter);

    this.stars = this.createStarfield(1400);
    this.scene.add(this.stars);

    const cloud = this.createOrganismCloud(this.maxOrganisms);
    this.organisms = cloud.points;
    this.orgPositions = cloud.positions;
    this.orgColors = cloud.colors;
    this.orgBaseRadius = cloud.radii;
    this.scene.add(this.organisms);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.syncFromRuntime(true);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const t = this.clock.getElapsedTime();
      if (t - this.lastSync > 0.2) {
        this.syncFromRuntime(false);
        this.lastSync = t;
      }
      this.animate(t);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  refresh(): void {
    this.syncFromRuntime(true);
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.controls.dispose();
    this.renderer.dispose();
    this.surfaceTex.dispose();
  }

  private makeRing(
    inner: number,
    outer: number,
    color: number,
    opacity: number
  ): THREE.Mesh {
    const geo = new THREE.RingGeometry(inner, outer, 96);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  private createStarfield(count: number): THREE.Points {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 12 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const warm = Math.random() > 0.85;
      col[i * 3] = warm ? 1 : 0.7 + Math.random() * 0.3;
      col[i * 3 + 1] = warm ? 0.85 : 0.85 + Math.random() * 0.15;
      col[i * 3 + 2] = warm ? 0.55 : 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    return new THREE.Points(geo, mat);
  }

  private createOrganismCloud(count: number): {
    points: THREE.Points;
    positions: Float32Array;
    colors: Float32Array;
    radii: Float32Array;
  } {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // poisson-disk-sphere placement (golden spiral) at radius ~1.65 shell band
      const shell = 1.08 + (i % 5) * 0.04;
      const p = sphereSample(i, count, shell);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      colors[i * 3] = 0;
      colors[i * 3 + 1] = 0.94;
      colors[i * 3 + 2] = 1;
      radii[i] = shell;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    return { points: new THREE.Points(geo, mat), positions, colors, radii };
  }

  private createSurfaceTexture(evolution: number): THREE.DataTexture {
    const size = this.texSize;
    const data = new Uint8Array(size * size * 4);
    this.paintSurface(data, size, evolution);
    const tex = new THREE.DataTexture(data, size, size);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private paintSurface(data: Uint8Array, size: number, evolution: number): void {
    const seedBoost = evolution;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const n = fbm(u * 6, v * 4, 5);
        const n2 = fbm(u * 12 + 3.1, v * 8 - 1.7, 3);
        const elev = n * 0.7 + n2 * 0.3;
        let r: number;
        let g: number;
        let b: number;
        if (evolution < 0.25) {
          const t = elev;
          r = 20 + t * 80 + (1 - evolution * 4) * 40;
          g = 8 + t * 25;
          b = 4 + t * 10;
        } else {
          const land = elev > 0.42 - seedBoost * 0.08;
          if (!land) {
            const depth = elev;
            r = 5 + depth * 20;
            g = 25 + depth * 40 + evolution * 50;
            b = 50 + depth * 60 + evolution * 80;
          } else if (elev > 0.72) {
            r = 180 + n2 * 40;
            g = 160 + n2 * 30;
            b = 90 + n2 * 20;
          } else {
            const flora = evolution * (0.5 + n2 * 0.5);
            r = 15 + (1 - flora) * 90 + n2 * 30;
            g = 40 + flora * 140 + n * 30;
            b = 25 + flora * 90 + (1 - elev) * 40;
          }
        }
        if (evolution < 0.45 && n2 > 0.62) {
          r = Math.min(255, r + 120 * (1 - evolution * 2));
          g = Math.min(255, g + 40 * (1 - evolution * 2));
        }
        const i = (y * size + x) * 4;
        data[i] = Math.min(255, Math.max(0, r));
        data[i + 1] = Math.min(255, Math.max(0, g));
        data[i + 2] = Math.min(255, Math.max(0, b));
        data[i + 3] = 255;
      }
    }
  }

  private updateSurface(evolution: number): void {
    const data = this.surfaceTex.image.data as Uint8Array;
    this.paintSurface(data, this.texSize, evolution);
    this.surfaceTex.needsUpdate = true;
  }

  private syncFromRuntime(forceTexture: boolean): void {
    const state = this.runtime.getState();
    const tick = state.tick;
    const seeds = state.seedTotal;
    const eTick = Math.min(1, tick / 40);
    const eSeed = Math.min(1, seeds / 60);
    const nextEvo = Math.min(1, eTick * 0.55 + eSeed * 0.45 + (tick > 0 ? 0.08 : 0));
    if (forceTexture || Math.abs(nextEvo - this.evolution) > 0.03) {
      this.evolution = nextEvo;
      this.updateSurface(this.evolution);
    }

    const coreMat = this.coreGlow.material as THREE.MeshBasicMaterial;
    coreMat.opacity = Math.max(0, 0.55 * (1 - this.evolution * 1.4));
    this.coreGlow.visible = coreMat.opacity > 0.02;

    const planetMat = this.planet.material as THREE.MeshStandardMaterial;
    planetMat.emissiveIntensity = 0.35 * (1 - this.evolution * 0.7) + 0.05;
    planetMat.emissive = new THREE.Color(this.evolution < 0.3 ? 0x2a1000 : 0x001820);

    // Rim intensity tracks evolution + pressure pulse driver
    this.rimUniforms.uIntensity.value = 0.35 + this.evolution * 0.35;

    const genomes = this.runtime.genetics.genomes;
    const meanFit = this.runtime.genetics.meanFitness || 0.5;
    const variance = this.runtime.genetics.geneVariance || 0.1;
    const count = Math.min(this.maxOrganisms, Math.max(genomes.length, 20));
    const geo = this.organisms.geometry;
    geo.setDrawRange(0, count);

    // LOD: camera distance → point size
    const camDist = this.camera.position.length();
    let sizeMul = 1;
    if (camDist > this.lodDistances[2]) sizeMul = 0.35;
    else if (camDist > this.lodDistances[1]) sizeMul = 0.55;
    else if (camDist > this.lodDistances[0]) sizeMul = 0.75;
    (this.organisms.material as THREE.PointsMaterial).size = (0.045 + variance * 0.08) * sizeMul;

    for (let i = 0; i < count; i++) {
      const g = genomes[i];
      const fitness = g?.fitness ?? meanFit;
      const shell = 1.06 + (1 - fitness) * 0.2 + (i % 5) * 0.012;
      const p = sphereSample(i, count, shell);
      this.orgPositions[i * 3] = p.x;
      this.orgPositions[i * 3 + 1] = p.y;
      this.orgPositions[i * 3 + 2] = p.z;
      const ft = Math.min(1, Math.max(0, fitness));
      this.orgColors[i * 3] = ft * 1.0;
      this.orgColors[i * 3 + 1] = 0.85 + ft * 0.1;
      this.orgColors[i * 3 + 2] = 1 - ft * 0.9;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Law / SRI → patrol rings (usse-stress remap)
    const sri = state.sriMax;
    const pr = this.patrolRing.material as THREE.MeshBasicMaterial;
    const pr2 = this.patrolRingOuter.material as THREE.MeshBasicMaterial;
    if (sri > 0.7) {
      pr.opacity = 0.55;
      pr.color.setHex(0xff4466);
      pr2.opacity = 0.4;
      pr2.color.setHex(0xff2244);
    } else if (sri > 0.45) {
      pr.opacity = 0.4;
      pr.color.setHex(LIVING_GOLD);
      pr2.opacity = 0.22;
      pr2.color.setHex(0xffaa00);
    } else {
      pr.opacity = sri * 0.25;
      pr.color.setHex(AETHER_CYAN);
      pr2.opacity = 0;
    }

    // entity-glow-pulse bind: pressure ≈ sri + (1 - CSS)
    const css = state.aggregateCSS || 0.5;
    this.rimUniforms.uPulse.value = sri + (1 - css);
  }

  private animate(t: number): void {
    this.rimUniforms.uTime.value = t;
    // Pulse organism opacity at 0.4 Hz
    const pulse = 0.75 + 0.25 * Math.sin(t * this.pulseHz * Math.PI * 2);
    (this.organisms.material as THREE.PointsMaterial).opacity = pulse;

    this.planet.rotation.y = t * 0.04;
    this.coreGlow.rotation.copy(this.planet.rotation);

    this.patrolRing.rotation.z = t * 0.15;
    this.patrolRingOuter.rotation.z = -t * 0.1;

    this.organisms.rotation.y = t * 0.06;
    this.stars.rotation.y = t * 0.006;
  }

  private resize(): void {
    const parent = this.host.parentElement ?? this.host;
    const w = Math.max(280, parent.clientWidth || 640);
    const h = Math.max(240, Math.min(520, Math.round(w * 0.58)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.host.style.width = `${w}px`;
    this.host.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

export default PlanetCanvas;
